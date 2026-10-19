import * as cheerio from "cheerio";
import { HttpError } from "./auth";

export type ScrapedJob = {
  url: string;
  title: string;
  company: string;
  location: string;
  text: string;
  /** True when the company came from the posting's JobPosting structured data (reliable employer name). */
  companyTrusted?: boolean;
};

const MAX_TEXT = 20000;

function assertPublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, "Invalid job URL");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new HttpError(400, "Job URL must be http(s)");
  const host = url.hostname.toLowerCase();
  const privateHost =
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.startsWith("[");
  if (privateHost) throw new HttpError(400, "Job URL must be a public website");
  return url;
}

function htmlToText(html: string) {
  const $ = cheerio.load(`<div>${html}</div>`);
  $("br").replaceWith("\n");
  $("li").each((_, el) => {
    $(el).prepend("• ").append("\n");
  });
  $("p,div,h1,h2,h3,h4,h5,h6,ul,ol,tr").each((_, el) => {
    $(el).append("\n");
  });
  return clean($.root().text());
}

function clean(text: string) {
  return text
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

type JsonLd = Record<string, unknown>;

function findJobPosting(node: unknown): JsonLd | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findJobPosting(n);
      if (hit) return hit;
    }
    return null;
  }
  const obj = node as JsonLd;
  const type = obj["@type"];
  if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) return obj;
  if (obj["@graph"]) return findJobPosting(obj["@graph"]);
  return null;
}

function str(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "name" in v) return str((v as JsonLd).name);
  return "";
}

function locationOf(job: JsonLd): string {
  const loc = Array.isArray(job.jobLocation) ? job.jobLocation[0] : job.jobLocation;
  const addr = (loc as JsonLd | undefined)?.address as JsonLd | undefined;
  const parts = addr ? [addr.addressLocality, addr.addressRegion, addr.addressCountry].map(str) : [];
  const joined = parts.filter(Boolean).join(", ");
  if (joined) return joined;
  return job.jobLocationType === "TELECOMMUTE" ? "Remote" : "";
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

async function getJson(url: string): Promise<JsonLd | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { "User-Agent": UA, Accept: "application/json" } });
    return res.ok ? ((await res.json()) as JsonLd) : null;
  } catch {
    return null;
  }
}

/**
 * Workable job pages are rendered by JavaScript (the HTML has no job text), so read the posting from Workable's
 * public API instead. Links: apply.workable.com/{account}/j/{code} or {account}.workable.com/j/{code}.
 */
async function scrapeWorkable(url: URL): Promise<ScrapedJob | null> {
  const host = url.hostname.toLowerCase();
  if (!host.endsWith("workable.com")) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const j = parts.indexOf("j");
  const code = j >= 0 ? parts[j + 1] : "";
  const account = host === "apply.workable.com" ? (j > 0 ? parts[j - 1] : "") : host.split(".")[0];
  if (!account || !code || !/^[\w-]+$/.test(account) || !/^[\w-]+$/.test(code)) return null;

  const base = `https://apply.workable.com/api/v2/accounts/${account}`;
  const job = await getJson(`${base}/jobs/${code}`);
  if (!job?.description) return null;
  const org = await getJson(`https://apply.workable.com/api/v1/accounts/${account}`);

  const loc = (job.location ?? {}) as JsonLd;
  const location = [str(loc.city), str(loc.region), str(loc.country)].filter(Boolean).join(", ");
  const where = [job.workplace === "remote" || job.remote ? "Remote" : str(job.workplace), location].filter(Boolean).join(" · ");
  const section = (title: string, html: unknown) => (str(html) ? `\n\n${title}\n${htmlToText(str(html))}` : "");
  const text = clean(
    `${str(job.title)}${where ? `\n${where}` : ""}\n\n${htmlToText(str(job.description))}` +
      section("Requirements", job.requirements) +
      section("Benefits", job.benefits)
  );
  const company = str(org?.name);
  return {
    url: url.toString(),
    title: str(job.title),
    company,
    location: [job.remote ? "Remote" : "", location].filter(Boolean).join(", "),
    text: text.slice(0, MAX_TEXT),
    companyTrusted: !!company,
  };
}

export async function scrapeJob(rawUrl: string): Promise<ScrapedJob> {
  const url = assertPublicUrl(rawUrl.trim());

  // Job boards whose pages need JavaScript: read their public posting APIs.
  const fromApi = await scrapeWorkable(url);
  if (fromApi && fromApi.text.length > 200) return fromApi;

  let html: string;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (e) {
    throw new HttpError(
      422,
      `Could not fetch the job page (${e instanceof Error ? e.message : "error"}). Paste the job description manually instead.`
    );
  }

  const $ = cheerio.load(html);

  // 1) Structured data (Greenhouse, Lever, Workday, LinkedIn, Indeed, most ATSs)
  let posting: JsonLd | null = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (posting) return;
    try {
      posting = findJobPosting(JSON.parse($(el).contents().text()));
    } catch {
      /* ignore malformed JSON-LD */
    }
  });
  if (posting) {
    const p = posting as JsonLd;
    const text = htmlToText(str(p.description));
    if (text.length > 200) {
      return {
        url: url.toString(),
        title: str(p.title),
        company: str(p.hiringOrganization),
        location: locationOf(p),
        text: text.slice(0, MAX_TEXT),
        companyTrusted: !!str(p.hiringOrganization),
      };
    }
  }

  // 2) Fallback: readable page text
  const title = $('meta[property="og:title"]').attr("content") || $("title").text() || "";
  const site = $('meta[property="og:site_name"]').attr("content") || "";
  $("script,style,noscript,svg,nav,footer,header,form,iframe,button").remove();
  const main = $("main").length ? $("main") : $("article").length ? $("article") : $("body");
  const text = htmlToText(main.html() || "");
  if (text.length < 200) {
    throw new HttpError(
      422,
      "The job page did not contain readable text (it may require JavaScript or login). Paste the job description manually instead."
    );
  }
  return { url: url.toString(), title: clean(title), company: clean(site), location: "", text: text.slice(0, MAX_TEXT) };
}
