import { HttpError } from "./auth";
import type { ResolvedOpenAI } from "./openaiKeys";
import type { ProfileFields } from "./models/Profile";
import { DEFAULT_RESUME_PROMPT } from "./resumePrompt";
import { RESUME_HEADLINE } from "./headline";
import { jobKeywords, mentionsKeyword, resumeText as resumePlainText, scoreCoverLetter, type JobKeyword } from "./matchScore";

export type ResumeExperience = {
  company: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  bullets: string[];
  /** Internships: a two- or three-sentence description instead of bullets. */
  description?: string;
};

/** Roles rendered as a short description instead of bullets. */
export function isInternship(title: string) {
  return /\bintern(ship)?s?\b/i.test(title || "");
}

/** At most three sentences of a text (internship details are two or three sentences). */
function twoSentences(text: string) {
  const parts = (text || "").replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]+(\s|$)/g) ?? [];
  const out = parts.slice(0, 3).join("").trim();
  return out || (text || "").trim();
}

export type ResumeProject = { name: string; description?: string; techStack?: string[]; bullets: string[] };

export type ResumeContent = {
  fullName: string;
  headline: string;
  /** Profile's professional title at generation, shown under the name (lib/headline.ts resumeHeadline). */
  titleLine?: string;
  contact: { email: string; phone: string; linkedin: string; location: string; website: string; github?: string };
  /** One paragraph, plain text (no bold). */
  summary: string;
  skills: { category: string; items: string[] }[];
  experience: ResumeExperience[];
  projects?: ResumeProject[];
  education: { university: string; degree: string; field: string; startDate: string; endDate: string }[];
  /** Kept for older records; not rendered (the prompt forbids a Certifications section). */
  certifications: string[];
};

export type GenerationResult = {
  company: string;
  jobTitle: string;
  jobLocation: string;
  jobDescription: string;
  resume: ResumeContent;
  coverLetter: string;
  usage: { model: string; promptTokens: number; completionTokens: number };
};

/* ------------------------------------------------------------------ dates */

function monthLabel(ym: string) {
  if (!ym) return "";
  const [y, m] = ym.split("-").map(Number);
  if (!y) return ym;
  if (!m) return String(y);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** "May 2023 - Present" / "June 2020 - December 2022" (ASCII hyphen only). */
export function formatRange(start: string, end: string, current = false) {
  const s = monthLabel(start);
  const e = current || !end ? "Present" : monthLabel(end);
  return s ? `${s} - ${e}` : e === "Present" ? "" : e;
}

/* ------------------------------------------------------------- text rules */

const TECH_FIXES: [RegExp, string][] = [
  [/\bC\s*Plus\s*Plus\b/gi, "C++"],
  [/\bC\s*Sharp\b/gi, "C#"],
  [/\bF\s*Sharp\b/gi, "F#"],
  [/(^|[\s(,/])dot\s*net\b/gi, "$1.NET"],
  [/\bASP\.?\s*NET\b/gi, "ASP.NET"],
  [/\bnode\.?js\b/gi, "Node.js"],
  [/\bnext\.?js\b/gi, "Next.js"],
  [/\bvue\.?js\b/gi, "Vue.js"],
  [/\bjavascript\b/gi, "JavaScript"],
  [/\btypescript\b/gi, "TypeScript"],
  [/\bpostgres(ql)?\b/gi, "PostgreSQL"],
  [/\bmongo\s?db\b/gi, "MongoDB"],
  [/\bgraphql\b/gi, "GraphQL"],
  [/\bkubernetes\b/gi, "Kubernetes"],
];
const fixTech = (s: string) => TECH_FIXES.reduce((t, [re, rep]) => t.replace(re, rep), s);

/**
 * Human writing rules sent with every generation call (any prompt): the resume and cover letter should read as
 * written by the candidate, not by an AI. HUMAN_FIXES below catches the words that still slip through.
 */
export const HUMAN_STYLE = `HUMAN WRITING (required for the resume and the cover letter; it changes only the wording, never the keywords
or the format above):
- Write like an experienced engineer describing their own work to a peer: plain, specific, confident words. Every
  sentence must say something concrete (what was built, for whom, with what, and what changed).
- Vary sentence length and structure. Do not give every bullet the same shape ("Verb X, resulting in Y% Z"); mix in
  bullets that lead with the problem, the scale or the result. Use realistic, uneven numbers (17%, 3.2x, 40 minutes),
  not only round ones (30%, 50%).
- Never use these AI-sounding words or phrases: leverage, utilize, spearhead, synergy, delve, robust, seamless,
  cutting-edge, state-of-the-art, innovative, dynamic, fast-paced, results-driven, passionate, thrilled, excited to,
  eager to, tapestry, landscape, realm, testament, elevate, foster, harness, empower, pivotal, game-changer,
  transformative, holistic, paradigm, unwavering, meticulous, navigate, streamline, "in today's", "I am writing to",
  "I believe", "proven track record", "a wide range of", "plays a crucial role".
- Prefer plain verbs: built, led, shipped, cut, moved, rewrote, ran, fixed, designed, owned, added, scaled, replaced,
  automated, migrated, launched, debugged, set up, trained, reviewed.
- No filler openers or closers, no lists of three adjectives, no rhetorical questions, no exclamation marks.
- Cover letter: sound like a real person: first person, short paragraphs, contractions are fine (I've, I'd), one
  specific reason for wanting this company and role, and a simple, direct closing.`;

/** Leftover AI-sounding words → plain ones (case kept for the first letter). */
const HUMAN_FIXES: [RegExp, string][] = [
  [/\bleverag(e|es|ed|ing)\b/gi, "us$1"],
  [/\butiliz(e|es|ed|ing)\b/gi, "us$1"],
  [/\butilization\b/gi, "usage"],
  [/\bspearheading\b/gi, "leading"],
  [/\bspearheads\b/gi, "leads"],
  [/\bspearhead(ed)?\b/gi, "led"],
  [/\bseamlessly\b/gi, "smoothly"],
  [/\bseamless\b/gi, "smooth"],
  [/\bcutting[- ]edge\b/gi, "modern"],
  [/\bstate[- ]of[- ]the[- ]art\b/gi, "modern"],
  [/\brobust\b/gi, "reliable"],
  [/\bfast[- ]paced\b/gi, "busy"],
  [/\bresults[- ]driven\b/gi, "hands-on"],
  [/\bproven track record of\b/gi, "history of"],
  [/\ba wide range of\b/gi, "many"],
  [/\bI am thrilled to\b/gi, "I'd like to"],
  [/\bI am excited to\b/gi, "I'd like to"],
  [/\bI am writing to express my interest in\b/gi, "I'm applying for"],
];
const keepCase = (from: string, to: string) => (to && /^[A-Z]/.test(from) ? to[0].toUpperCase() + to.slice(1) : to);
export const humanize = (s: string) =>
  HUMAN_FIXES.reduce((t, [re, rep]) => t.replace(re, (m: string, g1?: unknown) => keepCase(m, rep.replace("$1", typeof g1 === "string" ? g1 : ""))), s);
const ICONS = /[☀-➿\u{1F300}-\u{1FAFF}✅✔✓➤▶►⭐]/gu;

/** Resume text: no long dashes, icons, citations or links; optional **bold** kept only when allowed. */
function cleanResume(s: string, keepBold = false) {
  let t = s
    .replace(ICONS, "")
    .replace(/\s*[—―]\s*/g, ", ")
    .replace(/–/g, "-")
    .replace(/\[(\d+|source[^\]]*)\]|【[^】]*】/gi, "")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1") // markdown links → text
    .replace(/`/g, "");
  if (!keepBold) t = t.replace(/\*\*/g, "");
  return humanize(fixTech(t.replace(/[ \t]{2,}/g, " ").trim()));
}

/** Cover letter: plain text, no dashes of any kind, no bold. */
function cleanLetter(s: string) {
  return humanize(fixTech(
    s
      .replace(ICONS, "")
      .replace(/\*\*|__/g, "")
      .replace(/\s*[—―–]\s*/g, ", ")
      .replace(/\s+-\s+/g, ", ")
      .replace(/^\s*[-*•]\s+/gm, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  ));
}

/**
 * Models sometimes separate letter paragraphs with single line breaks. Make every line its own paragraph,
 * except the sign-off ("Sincerely," + name stay together on consecutive lines).
 */
function letterParagraphBreaks(s: string) {
  const text = s.replace(/\r\n/g, "\n").trim();
  if (/\n\s*\n/.test(text) && text.split(/\n\s*\n/).length >= 3) return text;
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^(sincerely|best regards|kind regards|regards|thank you),?$/i.test(lines[i]) && lines[i + 1]) {
      out.push(`${lines[i]}\n${lines[i + 1]}`);
      i++;
    } else out.push(lines[i]);
  }
  return out.join("\n\n");
}

const stripBullet = (s: string) => s.replace(/^\s*(?:[-*•·▪]|\d+[.)])\s+/, "");
const isBullet = (s: string) => /^\s*(?:[-*•·▪]|\d+[.)])\s+/.test(s);
const unbold = (s: string) => s.replace(/\*\*/g, "").trim();

/* ---------------------------------------------------- candidate profile */

/** The base resume passed as {{CANDIDATE_PROFILE}}. Facts here are authoritative. */
export function candidateProfileText(p: ProfileFields) {
  const lines: string[] = [];
  lines.push(`Name: ${p.fullName}`);
  const loc = p.location || [p.city, p.state].filter(Boolean).join(", ");
  if (loc) lines.push(`Location: ${loc}`);
  if (p.email) lines.push(`Email: ${p.email}`);
  if (p.phone) lines.push(`Phone: ${p.phone}`);
  if (p.linkedin) lines.push(`LinkedIn: ${p.linkedin}`);
  if (p.summary) lines.push("", "Summary:", p.summary);
  if (p.skills?.length) lines.push("", `Skills: ${p.skills.join(", ")}`);
  if (p.experience?.length) {
    lines.push("", "Experience (reverse chronological; keep these job titles, companies, locations and dates exactly):");
    for (const e of p.experience) {
      lines.push("", `Job title: ${e.title}`, `Company - location: ${e.company}${e.location ? ` - ${e.location}` : ""}`, `Dates: ${formatRange(e.startDate ?? "", e.endDate ?? "", !!e.current)}`);
      if (e.description) lines.push("Original responsibilities:", ...e.description.split("\n").map((l) => `• ${stripBullet(l)}`).filter((l) => l.length > 2));
    }
  }
  if (p.education?.length) {
    lines.push("", "Education:");
    for (const e of p.education) lines.push(`${e.university}${e.degree || e.field ? ` - ${[e.degree, e.field].filter(Boolean).join(", ")}` : ""}${e.startDate || e.endDate ? ` (${formatRange(e.startDate ?? "", e.endDate ?? "")})` : ""}`);
  }
  if (p.professionalTitle) lines.push("", `Professional title: ${p.professionalTitle}`);
  if (p.about?.trim()) lines.push("", "About this candidate (background and guidance from their manager):", p.about.trim());
  if (p.resumeReference?.trim())
    lines.push(
      "",
      "Reference resume (a previous resume: use its facts, section order and emphasis as a guide; the experience and education above win on titles, companies and dates):",
      p.resumeReference.trim()
    );
  return lines.join("\n");
}

/**
 * The reply layout the parser depends on. Appended when a prompt (e.g. a custom one from Settings) doesn't ask for
 * the COMPANY/ROLE lines and the cover letter, so every prompt yields a company, a role and a cover letter.
 * Layout only: the content and writing rules (sections, bullet counts, letter style) stay with the prompt.
 */
const OUTPUT_CONTRACT = `

# REQUIRED OUTPUT LAYOUT (set by the application so it can read your reply; it only changes how the reply is laid
# out, it overrides any instruction about delivering a file or leaving out the cover letter, and every content and
# writing rule above still applies)

Reply in plain text, not a file. At the very start of your reply, output exactly these two lines:
COMPANY: [Exact company name from the job description]
ROLE: [Exact job title from the job description]

Then a blank line, then the resume content the instructions above ask for. Do not repeat the candidate's name or
contact details (the application adds the header). Start every section title on its own line with "# ", and keep
the words SUMMARY, SKILLS, EXPERIENCE, PROJECTS and EDUCATION in the titles of those sections (for example
"# PROFESSIONAL SUMMARY", "# TECHNICAL SKILLS"). In the experience section, write each job as a title line, a company
line, a "Location | Dates" line, then its bullets, each starting with "• ".

Then output exactly these two lines:
---
COVER LETTER

Then a blank line, then the cover letter written as the instructions above describe, in plain text, starting at the
greeting (nothing above it). If the instructions say nothing about a cover letter, write a tailored one that starts
with "Dear Hiring Manager," and ends with "Sincerely," and the candidate's name.`;

/** Adds OUTPUT_CONTRACT unless the prompt already asks for the header lines and the cover letter section. */
export function withOutputContract(prompt: string) {
  const asksHeader = /^\s*COMPANY\s*:/m.test(prompt) && /^\s*ROLE\s*:/m.test(prompt);
  const asksLetter = /^\s*COVER LETTER\s*$/m.test(prompt);
  return asksHeader && asksLetter ? prompt : prompt + OUTPUT_CONTRACT;
}

/**
 * Job keywords the match score (lib/matchScore.ts) measures, sent with the job description so any prompt tailors the
 * resume and cover letter to them: hard skills, repeated domain phrases, the job title, length and metrics.
 */
export function jobTargets(job: { text: string; title?: string; company?: string }) {
  const { hard, soft } = jobKeywords(job.text);
  const name = (k: JobKeyword) => (k.alts?.length ? `${k.term} (or ${k.alts.join(" / ")})` : k.term);
  const required = hard.filter((k) => k.required).map(name);
  const other = hard.filter((k) => !k.required).map(name);
  const top = hard.slice(0, 10).map((k) => k.term);
  const title = job.title?.trim() ? `"${job.title.trim()}"` : "the exact job title from the posting";
  return `JOB MATCH TARGETS (the resume and cover letter are scored against these job description keywords; follow them
together with the prompt's rules):
- Required keywords: ${required.join(", ") || "(none found)"}
- Other keywords: ${other.join(", ") || "(none found)"}
- Domain phrases: ${soft.join(", ") || "(none found)"}
Resume:
- Use the exact spelling of every required and other keyword at least once; put each one in the skills section and
  work the most important ones into the summary and the experience bullets. For "(or …)" keywords one is enough.
- Use every domain phrase word for word at least once (the summary can tie the candidate's work to the company's
  domain, e.g. "wants to bring ... to ${soft.slice(0, 2).join(" and ") || "the company's mission"}").
- Name the target role ${title} in the first sentence of the summary.
- At least two of every three experience bullets include a number (%, $, count, time saved or scale).
- Total length 450 to 900 words.
Cover letter:
- Name the company${job.company?.trim() ? ` ("${job.company.trim()}")` : " by its exact name from the posting"} in the first paragraph and once more later.
  The rule against a header above the greeting only means no name / company / title lines before "Dear": the letter's
  body must still name the company.
- Name the role ${title} in the first paragraph.
- Use each of these top skills by its exact spelling, tied to real work from the resume (at least eight of them):
  ${top.join(", ") || "(none found)"}.
- Include at least one concrete number or result; 280 to 400 words.`;
}

export function fillPrompt(template: string, p: ProfileFields) {
  return template
    .split("{{CANDIDATE_PROFILE}}").join(candidateProfileText(p))
    .split("{{CANDIDATE_EMAIL}}").join(p.email || "")
    .split("{{SIGN_OFF_NAME}}").join(p.fullName);
}

/* ---------------------------------------------------------------- parser */

type ParsedExperience = { title: string; companyLine: string; dates: string; bullets: string[]; description?: string };
type Parsed = {
  company: string;
  role: string;
  summary: string;
  skills: string[];
  experience: ParsedExperience[];
  projects: ResumeProject[];
  coverLetter: string;
};

const DATE_LINE = /((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}|\b(19|20)\d{2}\b).*(present|current|now|\d{4})|^(19|20)\d{2}$/i;

/** Parses the ResumeGPT text format into structured parts. Tolerant of small format drift. */
export function parseResumeGPT(raw: string): Parsed {
  const text = raw.replace(/\r\n/g, "\n").replace(/^```[a-z]*\n?|```$/gim, "");
  const head = (key: string) => unbold(new RegExp(`^\\s*\\**${key}\\**\\s*:\\s*(.+)$`, "im").exec(text)?.[1] ?? "");
  const company = head("COMPANY");
  const role = head("ROLE");

  // Split resume / cover letter at "---" + "COVER LETTER" (or just the COVER LETTER label).
  const splitAt = /^\s*-{3,}\s*\n+\s*#*\s*\**COVER LETTER\**\s*:?\s*$/im.exec(text) ?? /^\s*#*\s*\**COVER LETTER\**\s*:?\s*$/im.exec(text);
  const resumePart = splitAt ? text.slice(0, splitAt.index) : text;
  let coverLetter = splitAt ? text.slice(splitAt.index + splitAt[0].length) : "";
  const dear = coverLetter.search(/^\s*Dear\b/im);
  if (dear > 0) coverLetter = coverLetter.slice(dear);

  // Sections by "# TITLE"
  const sections = new Map<string, string[]>();
  let current = "";
  for (const line of resumePart.split("\n")) {
    const h = /^\s*#{1,3}\s+(.+?)\s*$/.exec(line);
    if (h) {
      current = unbold(h[1]).toUpperCase();
      sections.set(current, []);
    } else if (current) sections.get(current)!.push(line);
  }
  const find = (...keys: string[]) => {
    for (const [k, v] of sections) if (keys.some((key) => k.includes(key))) return v;
    return [] as string[];
  };

  const summary = find("SUMMARY")
    .map((l) => stripBullet(l).trim())
    .filter(Boolean)
    .join(" ");

  const skillText = find("SKILL").map((l) => stripBullet(l)).join(" | ");
  const skills = [
    ...new Set(
      skillText
        .split(/\s*\|\s*|\s*;\s*/)
        .map((x) => unbold(x).replace(/^[^:|]{2,40}:\s*/, "").trim()) // drop "Category:" prefixes
        .flatMap((x) => (x.includes(",") && !x.includes("(") ? x.split(/\s*,\s*/) : [x]))
        .map((x) => x.replace(/\.$/, "").trim())
        .filter((x) => x && x.length < 60)
    ),
  ];

  // Experience: header lines (title / company - location / dates) followed by bullets.
  const experience: ParsedExperience[] = [];
  let header: string[] = [];
  let cur = null as ParsedExperience | null;
  const openEntry = () => {
    const parts = header.flatMap((h) => h.split(/\s+\|\s+/)).map(unbold).filter(Boolean);
    const dates = parts.find((p) => DATE_LINE.test(p)) ?? "";
    const rest = parts.filter((p) => p !== dates);
    cur = { title: rest[0] ?? "", companyLine: rest[1] ?? "", dates, bullets: [] };
    experience.push(cur);
    header = [];
    return cur;
  };
  // A prose line (sentences) right after an entry's header lines = internship description.
  const isProse = (l: string) => l.split(/\s+/).length >= 10 && /[.!?]["')]?$/.test(l);
  for (const rawLine of find("EXPERIENCE")) {
    const line = rawLine.trim();
    if (!line) continue;
    if (isBullet(line)) {
      if (header.length) openEntry();
      cur?.bullets.push(stripBullet(line));
    } else if (header.length >= 2 && isProse(line)) {
      openEntry().description = unbold(line);
    } else {
      header.push(line); // title, company, "location | dates" (any order, possibly "|"-joined)
    }
  }

  // Projects: **Title** / description / 3 bullets
  const projects: ResumeProject[] = [];
  let proj: ResumeProject | null = null;
  for (const rawLine of find("PROJECT")) {
    const line = rawLine.trim();
    if (!line) continue;
    const titleMatch = /^\*\*(.+?)\*\*:?$/.exec(line) ?? /^#{4,}\s*(.+)$/.exec(line);
    if (titleMatch && !isBullet(line)) {
      proj = { name: titleMatch[1].trim(), description: "", bullets: [] };
      projects.push(proj);
    } else if (isBullet(line)) {
      proj?.bullets.push(stripBullet(line));
    } else if (proj && !proj.description && !proj.bullets.length) {
      proj.description = line;
    } else if (!proj || proj.bullets.length) {
      proj = { name: unbold(line), description: "", bullets: [] }; // unbolded title fallback
      projects.push(proj);
    }
  }

  return { company, role, summary, skills, experience, projects, coverLetter };
}

/* ------------------------------------------------------------ generation */

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Keeps the profile's title; allows only a short tailoring suffix in parentheses (per the prompt). */
function tailoredTitle(original: string, ai: string) {
  const o = (original || "").trim();
  const a = unbold(ai || "");
  if (!o) return a;
  if (!a) return o;
  let paren = /\(([^)]{1,80})\)\s*$/.exec(a)?.[1]?.trim();
  // "something short" per the prompt: keep at most ~30 characters of comma-separated focus areas.
  if (paren && paren.length > 30) {
    const kept: string[] = [];
    for (const part of paren.split(/\s*,\s*/)) if ([...kept, part].join(", ").length <= 30) kept.push(part);
    paren = kept.join(", ");
  }
  if (norm(a).startsWith(norm(o))) return paren ? `${o} (${paren})` : o;
  return o;
}

/* --------------------------------------------------- bullet rule repair */

const MIN_WORDS = 17;
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const firstVerb = (s: string) => s.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";

const sentenceCount = (t: string) => ((t || "").trim().match(/[^.!?]+[.!?]+(\s|$)/g) ?? []).length;

/** Roles that break the prompt's bullet rules (count, ≥17 words, unique opening verbs). */
function bulletProblems(exps: ResumeExperience[]) {
  const seen = new Map<string, number>();
  exps.forEach((e) => e.bullets.forEach((b) => seen.set(firstVerb(b), (seen.get(firstVerb(b)) ?? 0) + 1)));
  const best = exps.findIndex((e) => !isInternship(e.title));
  return exps
    .map((e, i) => {
      if (isInternship(e.title)) {
        const n = sentenceCount(e.description ?? "");
        return n >= 2 && n <= 3
          ? { index: i, min: 0, issues: [] as string[], score: 0 }
          : { index: i, min: 0, issues: [`internship description must be two or three sentences (has ${n})`], score: 1 };
      }
      const min = i === best ? 8 : 5;
      const issues: string[] = [];
      const missing = Math.max(0, min - e.bullets.length);
      if (missing) issues.push(`needs at least ${min} bullets (has ${e.bullets.length})`);
      const shortList = e.bullets.filter((b) => words(b) < MIN_WORDS);
      if (shortList.length) issues.push(`${shortList.length} bullet(s) under ${MIN_WORDS} words`);
      const dupList = e.bullets.filter((b) => (seen.get(firstVerb(b)) ?? 0) > 1);
      if (dupList.length) issues.push(`bullets starting with repeated verbs: ${[...new Set(dupList.map(firstVerb))].join(", ")}`);
      return { index: i, min, issues, score: missing * 2 + shortList.length + dupList.length };
    })
    .filter((x) => x.issues.length);
}

/** One focused follow-up call that fixes only the experience bullets. Returns null if nothing usable came back. */
async function repairBullets(openai: Pick<ResolvedOpenAI, "client" | "model">, exps: ResumeExperience[], jobText: string) {
  const problems = bulletProblems(exps);
  if (!problems.length) return null;
  const best = exps.findIndex((e) => !isInternship(e.title));
  const payload = exps.map((e, i) =>
    isInternship(e.title)
      ? { index: i, title: e.title, company: e.company, internship: true, description: e.description ?? "" }
      : { index: i, title: e.title, company: e.company, minBullets: i === best ? 8 : 5, bullets: e.bullets }
  );
  try {
    const res = await openai.client.chat.completions.create({
      model: openai.model,
      response_format: { type: "json_object" },
      temperature: 0.5,
      messages: [
        {
          role: "system",
          content:
            "You fix resume experience entries. For roles marked internship: return a 'description' of two or three sentences (no bullets) with concrete details, keeping its facts. For all other roles: each role has at least its minBullets bullets; every bullet is ONE sentence of at least 17 words; every bullet starts with a strong action verb that is not used to start any other bullet in the whole resume; include concrete metrics (numbers, %, $) in every bullet; no bold, no long dashes, no first person. Keep the original meaning and technologies, tailor to the job description, and keep good bullets unchanged. Return JSON: {\"experience\":[{\"index\":number,\"bullets\":string[],\"description\":string}]} covering every role (bullets for regular roles, description for internships).\n\n" +
            HUMAN_STYLE,
        },
        {
          role: "user",
          content: `Problems found: ${problems.map((p) => `role ${p.index}: ${p.issues.join("; ")}`).join(" | ")}\n\nEvery bullet in the output must begin with a different verb (${exps.flatMap((e) => e.bullets).length}+ distinct verbs in total).\n\nROLES:\n${JSON.stringify(payload, null, 2)}\n\nJOB DESCRIPTION (for tailoring):\n${jobText.slice(0, 6000)}`,
        },
      ],
    });
    const out = JSON.parse(res.choices[0]?.message?.content ?? "{}") as { experience?: { index: number; bullets?: string[]; description?: string }[] };
    const fixed = exps.map((e, i) => {
      const f = out.experience?.find((x) => x.index === i);
      if (isInternship(e.title)) {
        const d = cleanResume(String(f?.description ?? ""));
        return sentenceCount(d) >= 2 && sentenceCount(d) <= 3 ? { ...e, description: d } : e;
      }
      const bullets = (f?.bullets ?? []).map((b) => cleanResume(stripBullet(String(b)))).filter(Boolean);
      return bullets.length >= Math.min(e.bullets.length, i === best ? 8 : 5) ? { ...e, bullets } : e;
    });
    // Keep the repair only if it actually reduced the problems.
    const before = problems.reduce((a, p) => a + p.score, 0);
    const after = bulletProblems(fixed).reduce((a, p) => a + p.score, 0);
    return {
      experience: after < before ? fixed : exps,
      promptTokens: res.usage?.prompt_tokens ?? 0,
      completionTokens: res.usage?.completion_tokens ?? 0,
    };
  } catch (e) {
    console.error("bullet repair failed", e);
    return null;
  }
}

/**
 * Separate cover letter request, used when the main reply has none (e.g. a custom resume-only prompt in Settings).
 * Also returns the company and role, which such prompts tend to drop as well.
 */
async function writeCoverLetter(
  openai: Pick<ResolvedOpenAI, "client" | "model">,
  profile: ProfileFields,
  resume: ResumeContent,
  jobText: string,
  extraInstructions: string,
  /** The filled custom prompt (Settings); its cover letter instructions replace the built-in rules. "" = built-in. */
  customPrompt = ""
) {
  const extra = extraInstructions ? `\n\nAdditional instructions from the administrator:\n${extraInstructions}` : "";
  const rules = customPrompt
    ? `Write the cover letter exactly as the cover letter instructions in the prompt below describe (ignore its resume
instructions; the tailored resume is given in the user message). If the prompt has no cover letter instructions, write
a tailored letter that starts with "Dear Hiring Manager," and ends with "Sincerely," and "${profile.fullName}".
Use only facts from the candidate's resume and profile; never invent employers, metrics or credentials. Plain text, no
headers above the greeting.${extra}

PROMPT:
${customPrompt}`
    : `coverLetter rules:
- Start directly with "Dear Hiring Manager," (or the hiring manager's name if the posting gives it). Nothing before the greeting: no name, contact details, date or headers.
- Five short paragraphs separated by blank lines: role interest with a strong hook; relevant skills and measurable achievements; motivation and culture fit; what the candidate brings to the team; thank you and a proactive follow-up.
- Mirror the job description's keywords. Use only facts from the candidate's resume and profile; never invent employers, metrics or credentials.
- Plain text only: no bold, symbols, bullet points, links or dashes of any kind.
- End with "Sincerely," on its own line followed by "${profile.fullName}".${extra}`;
  const resumeText = [
    `Summary: ${resume.summary}`,
    `Skills: ${resume.skills.flatMap((g) => g.items).join(", ")}`,
    ...resume.experience.map((e) => `${e.title} at ${e.company} (${formatRange(e.startDate, e.endDate, !e.endDate)}):\n${[e.description, ...e.bullets].filter(Boolean).map((b) => `- ${b}`).join("\n")}`),
  ].join("\n\n");
  try {
    const res = await openai.client.chat.completions.create({
      model: openai.model,
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You write cover letters for senior software engineers. Reply with JSON: {"company": string, "role": string, "coverLetter": string}.
company / role: the hiring company and the exact job title from the job description ("" if not stated).
${rules}`,
        },
        { role: "user", content: `CANDIDATE PROFILE:\n${candidateProfileText(profile)}\n\nTAILORED RESUME:\n${resumeText}\n\nJOB DESCRIPTION:\n${jobText}` },
      ],
    });
    const out = JSON.parse(res.choices[0]?.message?.content ?? "{}") as { company?: unknown; role?: unknown; coverLetter?: unknown };
    return {
      company: typeof out.company === "string" ? out.company.trim() : "",
      role: typeof out.role === "string" ? out.role.trim() : "",
      coverLetter: typeof out.coverLetter === "string" ? out.coverLetter.trim() : "",
      promptTokens: res.usage?.prompt_tokens ?? 0,
      completionTokens: res.usage?.completion_tokens ?? 0,
    };
  } catch (e) {
    console.error("cover letter request failed", e);
    return null;
  }
}

/** Cover letters scoring at least this on the Job match card (with every check passing) are left as they are. */
const LETTER_TARGET = 85;

/**
 * Raises a weak cover letter's Job match score: scores it exactly as the Job match card does and, if it misses the
 * company, the role or the posting's top skills, asks for one focused revision that adds them. Only skills the tailored
 * resume already shows are requested, so nothing is invented. Returns the revision only when it scores higher.
 */
async function improveCoverLetter(
  openai: Pick<ResolvedOpenAI, "client" | "model">,
  profile: ProfileFields,
  resume: ResumeContent,
  letter: string,
  job: { text: string; company: string; role: string }
) {
  const before = scoreCoverLetter(letter, job.text, job.company, job.role);
  if (before.score >= LETTER_TARGET && before.checks.every((c) => c.ok)) return null;
  const resumeAll = resumePlainText(resume);
  const skills = before.missing.filter((k) => mentionsKeyword(resumeAll, k.term) || k.alts?.some((t) => mentionsKeyword(resumeAll, t))).map((k) => k.term);
  const failed = before.checks.filter((c) => !c.ok).map((c) => c.label);
  const asks = [
    job.company && `Name the company exactly as "${job.company}" in the first paragraph and once more later in the letter (the body, not a header).`,
    job.role && `Name the role exactly as "${job.role}" in the first paragraph.`,
    skills.length &&
      `Work in each of these skills from the job description, spelled exactly like this, each tied to real work from the resume: ${skills.join(", ")}.`,
    `Keep every skill the letter already names, and at least one concrete number or result from the resume.`,
    `Length 280 to 400 words.`,
  ].filter(Boolean);
  try {
    const res = await openai.client.chat.completions.create({
      model: openai.model,
      temperature: 0.5,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You revise a cover letter so it matches the job description more closely. Reply with JSON: {"coverLetter": string}.
Keep its greeting, its paragraph structure, its tone and its sign-off ("Sincerely," then "${profile.fullName}") exactly. Plain text only:
no headers above the greeting, no bold, bullets, links or dashes of any kind. Use only facts from the resume; never
invent employers, metrics or credentials.
Required changes:
${asks.map((a) => `- ${a}`).join("\n")}

${HUMAN_STYLE}`,
        },
        {
          role: "user",
          content: `Checks the current letter fails: ${failed.join("; ") || "none, but its score is low"}.\n\nCURRENT COVER LETTER:\n${letter}\n\nTAILORED RESUME:\n${resumeAll}\n\nJOB DESCRIPTION:\n${job.text.slice(0, 8000)}`,
        },
      ],
    });
    const out = JSON.parse(res.choices[0]?.message?.content ?? "{}") as { coverLetter?: unknown };
    const revised = typeof out.coverLetter === "string" ? out.coverLetter.trim() : "";
    const after = revised ? scoreCoverLetter(revised, job.text, job.company, job.role) : null;
    return {
      coverLetter: after && after.score > before.score ? revised : "",
      promptTokens: res.usage?.prompt_tokens ?? 0,
      completionTokens: res.usage?.completion_tokens ?? 0,
    };
  } catch (e) {
    console.error("cover letter revision failed", e);
    return null;
  }
}

async function callModel(openai: Pick<ResolvedOpenAI, "client" | "model">, system: string, user: string) {
  try {
    const completion = await openai.client.chat.completions.create({
      model: openai.model,
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    return completion;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OpenAI request failed";
    throw new HttpError(502, `OpenAI error: ${msg}`);
  }
}

export async function generateApplication(
  openai: Pick<ResolvedOpenAI, "client" | "model">,
  profile: ProfileFields,
  job: { text: string; url?: string; title?: string; company?: string; location?: string },
  extraInstructions = "",
  promptTemplate = ""
): Promise<GenerationResult> {
  // A custom prompt from Settings decides the content; the built-in rule checks below only apply to the default prompt.
  const custom = !!promptTemplate.trim() && promptTemplate.trim() !== DEFAULT_RESUME_PROMPT.trim();
  const filled = fillPrompt(custom ? promptTemplate.trim() : DEFAULT_RESUME_PROMPT, profile);
  const system =
    withOutputContract(filled) +
    (extraInstructions ? `\n\nAdditional instructions from the administrator:\n${extraInstructions}` : "");
  const targets = jobTargets(job);
  const user = `JOB DESCRIPTION LINK: ${job.url || "(not provided; pasted by the user)"}

JOB DESCRIPTION CONTENT:
${job.text}

${targets}

${HUMAN_STYLE}`;

  let completion = await callModel(openai, system, user);
  let parsed = parseResumeGPT(completion.choices[0]?.message?.content ?? "");
  let promptTokens = completion.usage?.prompt_tokens ?? 0;
  let completionTokens = completion.usage?.completion_tokens ?? 0;

  // One retry if the resume structure is missing (a missing cover letter is written separately below).
  const broken = (p: Parsed) => !p.summary || !p.experience.some((e) => e.bullets.length);
  if (broken(parsed)) {
    completion = await callModel(
      openai,
      system,
      custom
        ? `${user}\n\nIMPORTANT: Follow the required output layout exactly: COMPANY/ROLE lines, every resume section title on its own line starting with "# " (a summary section and an experience section with "• " bullets are required), then "---" and "COVER LETTER".`
        : `${user}\n\nIMPORTANT: Follow the output format exactly: COMPANY/ROLE lines, # PROFESSIONAL SUMMARY, # CORE SKILLS, # PROFESSIONAL EXPERIENCE, # SELECTED PROJECTS, then "---" and "COVER LETTER".`
    );
    const second = parseResumeGPT(completion.choices[0]?.message?.content ?? "");
    promptTokens += completion.usage?.prompt_tokens ?? 0;
    completionTokens += completion.usage?.completion_tokens ?? 0;
    if (!broken(second) || (second.summary && !parsed.summary)) parsed = second;
  }
  if (!parsed.summary && !parsed.experience.length) throw new HttpError(502, "The AI response could not be read. Please try again.");

  // Match parsed experience to profile roles (by company name, then by order); facts come from the profile.
  const used = new Set<number>();
  const experience: ResumeExperience[] = profile.experience.map((e, i) => {
    let idx = parsed.experience.findIndex((x, j) => !used.has(j) && norm(x.companyLine).includes(norm(e.company)));
    if (idx < 0 && !used.has(i) && parsed.experience[i]) idx = i;
    if (idx >= 0) used.add(idx);
    const ai = idx >= 0 ? parsed.experience[idx] : undefined;
    const bullets = (ai?.bullets ?? []).map((b) => cleanResume(b)).filter(Boolean);
    const base = {
      company: e.company,
      title: tailoredTitle(e.title || "", ai?.title ?? ""),
      location: e.location || "",
      startDate: e.startDate || "",
      endDate: e.current ? "" : e.endDate || "",
    };
    if (isInternship(e.title || "")) {
      const source =
        ai?.description ||
        (bullets.length ? bullets.slice(0, 2).map((b) => (/[.!?]$/.test(b) ? b : `${b}.`)).join(" ") : "") ||
        (e.description || "").split("\n").map((l) => stripBullet(l).trim()).filter(Boolean).slice(0, 2).map((b) => (/[.!?]$/.test(b) ? b : `${b}.`)).join(" ");
      return { ...base, bullets: [], description: cleanResume(twoSentences(source)) };
    }
    return {
      ...base,
      bullets: bullets.length ? bullets : (e.description || "").split("\n").map((l) => cleanResume(stripBullet(l))).filter(Boolean),
    };
  });

  // Enforce the default prompt's bullet rules (count / 17+ words / unique verbs) with one focused repair call if needed.
  // Skipped for a custom prompt: its own bullet rules apply and a repair would rewrite them.
  for (let round = 0; !custom && round < 2; round++) {
    const repaired = await repairBullets(openai, experience, job.text);
    if (!repaired) break;
    experience.splice(0, experience.length, ...repaired.experience);
    promptTokens += repaired.promptTokens;
    completionTokens += repaired.completionTokens;
  }

  const resume: ResumeContent = {
    fullName: profile.fullName,
    headline: RESUME_HEADLINE,
    ...(profile.professionalTitle?.trim() ? { titleLine: profile.professionalTitle.trim() } : {}),
    contact: {
      email: profile.email || "",
      phone: profile.phone || "",
      linkedin: profile.linkedin || "",
      location: profile.location || [profile.city, profile.state].filter(Boolean).join(", "),
      website: "", // the prompt forbids portfolio/website links
      github: "",
    },
    summary: cleanResume(parsed.summary || profile.summary || ""),
    skills: [{ category: "", items: (parsed.skills.length ? parsed.skills : profile.skills).map((x) => cleanResume(x)).filter(Boolean) }],
    experience,
    projects: parsed.projects
      .slice(0, 4)
      .map((p) => ({
        name: cleanResume(p.name),
        description: cleanResume(p.description ?? ""),
        bullets: p.bullets.map((b) => cleanResume(b)).filter(Boolean).slice(0, 3),
      }))
      .filter((p) => p.name && p.bullets.length),
    education: profile.education.map((e) => ({
      university: e.university,
      degree: e.degree || "",
      field: e.field || "",
      startDate: e.startDate || "",
      endDate: e.endDate || "",
    })),
    certifications: [],
  };

  // The prompt (e.g. a resume-only custom prompt) produced no cover letter: write it with a dedicated request.
  if (!parsed.coverLetter.trim()) {
    const letter = await writeCoverLetter(openai, profile, resume, `${job.text}\n\n${targets}\n\n${HUMAN_STYLE}`, extraInstructions, custom ? filled : "");
    if (letter) {
      parsed.coverLetter = letter.coverLetter;
      if (!parsed.company) parsed.company = letter.company;
      if (!parsed.role) parsed.role = letter.role;
      promptTokens += letter.promptTokens;
      completionTokens += letter.completionTokens;
    }
  }

  const finishLetter = (raw: string) => {
    const letter = cleanLetter(letterParagraphBreaks(raw))
      // "Dear Hiring Manager" → "Dear Hiring Manager," (traditional business letter)
      .replace(/^(Dear [^\n,:]+?)\s*[:]?\s*$/m, "$1,")
      // keep the sign-off and the name together on consecutive lines
      .replace(/\n\s*\n(Sincerely|Best regards|Kind regards|Regards),?\s*\n\s*\n([^\n]+)\s*$/i, "\n\n$1,\n$2");
    return letter && !/sincerely/i.test(letter) ? `${letter}\n\nSincerely,\n${profile.fullName}` : letter;
  };
  let coverLetter = finishLetter(parsed.coverLetter);
  const company = parsed.company || job.company || "";
  const jobTitle = parsed.role || job.title || "";

  // Weak Job match (company, role or top skills missing): one focused revision, kept only if it scores higher.
  if (coverLetter) {
    const better = await improveCoverLetter(openai, profile, resume, coverLetter, { text: job.text, company, role: jobTitle });
    if (better) {
      if (better.coverLetter) coverLetter = finishLetter(better.coverLetter);
      promptTokens += better.promptTokens;
      completionTokens += better.completionTokens;
    }
  }

  return {
    company,
    jobTitle,
    jobLocation: job.location || "",
    jobDescription: job.text,
    resume,
    coverLetter,
    usage: { model: openai.model, promptTokens, completionTokens },
  };
}
