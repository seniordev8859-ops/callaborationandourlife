"use client";

import type { ResumeContent } from "@/lib/generate";
import { displayUrl } from "@/lib/links";
import { resumeHeadline } from "@/lib/headline";
import { atsSpec, designSpec, type AtsSpec, type DesignSpec } from "@/lib/designs";
import type { CSSProperties, ReactNode } from "react";

// Designed layouts use inline colours: the dark theme remaps Tailwind colour classes, but documents are always print colours.
const hex = (h: string) => `#${h}`;
const plainText = (v: string) => (v || "").replace(/\*\*/g, "");

/** Name / headline / contact, shared by the designed resume and cover letter. */
export function DesignedHeader({ r, d }: { r: ResumeContent; d: DesignSpec }) {
  const b = d.banner;
  const contact = [r.contact.location, r.contact.phone, r.contact.email, displayUrl(r.contact.linkedin)].filter(Boolean).join(" | ");
  return (
    <div style={{ textAlign: d.align, background: b ? hex(b.fill) : undefined, padding: b ? "14px 18px" : 0, borderRadius: b ? 4 : 0 }}>
      <div
        style={{
          fontSize: 26,
          fontWeight: 700,
          lineHeight: 1.15,
          color: hex(b?.text ?? d.accent),
          letterSpacing: d.nameCaps ? "0.08em" : undefined,
          textTransform: d.nameCaps ? "uppercase" : undefined,
        }}
      >
        {r.fullName}
      </div>
      <div style={{ fontSize: 13.5, fontWeight: d.serif ? 400 : 700, marginTop: 3, color: hex(b ? b.text : d.muted) }}>{resumeHeadline(r)}</div>
      {contact && <div style={{ fontSize: 11.5, color: hex(b?.muted ?? d.muted) }}>{contact}</div>}
    </div>
  );
}

function DesignedHeading({ d, children }: { d: DesignSpec; children: ReactNode }) {
  const smallCaps = d.headingCase === "smallcaps";
  const style: CSSProperties = {
    margin: "18px 0 7px",
    fontSize: smallCaps ? 14.5 : 13.5,
    fontWeight: 700,
    color: hex(d.accent),
    textAlign: d.headingAlign,
    letterSpacing: smallCaps ? "0.06em" : "0.04em",
    fontVariant: smallCaps ? "small-caps" : undefined,
    textTransform: smallCaps ? undefined : "uppercase",
    ...(d.headingDecor === "bar"
      ? { background: hex(d.barFill ?? "F1F5F9"), borderLeft: `3px solid ${hex(d.accent)}`, padding: "2px 9px" }
      : { borderBottom: `1px solid ${hex(d.rule)}`, paddingBottom: 2 }),
  };
  return <h3 style={style}>{children}</h3>;
}

export function DesignedResume({ r, d }: { r: ResumeContent; d: DesignSpec }) {
  const skills = r.skills.flatMap((g) => g.items);
  const muted = { color: hex(d.muted), fontSize: 12.5 };
  return (
    <div className="text-justify text-[13px] leading-relaxed" style={{ fontFamily: d.cssFont, color: hex(d.ink) }}>
      <DesignedHeader r={r} d={d} />
      {r.summary && (
        <>
          <DesignedHeading d={d}>Professional Summary</DesignedHeading>
          <p>{plainText(r.summary)}</p>
        </>
      )}
      {!!skills.length && (
        <>
          <DesignedHeading d={d}>Core Skills</DesignedHeading>
          <p>{skills.join(" | ")}</p>
        </>
      )}
      {!!r.experience.length && (
        <>
          <DesignedHeading d={d}>Professional Experience</DesignedHeading>
          {r.experience.map((e, i) => (
            <div key={i} className="[&+&]:mt-3">
              <div className="text-left font-bold">{e.title}</div>
              <div className="text-left" style={muted}>
                {[e.company, e.location, range(e.startDate, e.endDate)].filter(Boolean).join(" | ")}
              </div>
              {e.description && <p className="mt-1">{plainText(e.description)}</p>}
              <Bullets items={e.bullets} />
            </div>
          ))}
        </>
      )}
      {!!r.projects?.length && (
        <>
          <DesignedHeading d={d}>Selected Projects</DesignedHeading>
          {r.projects.map((p, i) => (
            <div key={i} className="[&+&]:mt-3">
              <div className="text-left font-bold">{p.name}</div>
              {p.description && <p>{plainText(p.description)}</p>}
              <Bullets items={p.bullets} />
            </div>
          ))}
        </>
      )}
      {!!r.education.length && (
        <>
          <DesignedHeading d={d}>Education</DesignedHeading>
          {r.education.map((e, i) => (
            <div key={i} className="text-left">
              {e.university}
              {(e.degree || e.field) && ` - ${[e.degree, e.field].filter(Boolean).join(", ")}`}
              {(e.startDate || e.endDate) && ` | ${range(e.startDate, e.endDate)}`}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/** Cover letter with the design's letterhead: header, separator rule, date, then the letter text. */
export function DesignedLetter({ r, d, date, text }: { r: ResumeContent; d: DesignSpec; date: string; text: string }) {
  const rule =
    d.banner ? undefined
    : d.letterRule === "double" ? `3px double ${hex(d.rule)}`
    : d.letterRule === "thick" ? `2.5px solid ${hex(d.accent)}`
    : `1px solid ${hex(d.rule)}`;
  return (
    <div className="text-[14px] leading-relaxed" style={{ fontFamily: d.cssFont, color: hex(d.ink) }}>
      <DesignedHeader r={r} d={d} />
      {rule && <div style={{ borderBottom: rule, marginTop: 8 }} />}
      <div style={{ margin: "22px 0 18px" }}>{date}</div>
      <div className="whitespace-pre-wrap text-justify">{text}</div>
    </div>
  );
}

function range(start: string, end: string) {
  const f = (ym: string) => {
    if (!ym) return "";
    const [y, m] = ym.split("-").map(Number);
    return m ? new Date(y, m - 1).toLocaleString("en-US", { month: "long", year: "numeric" }) : String(y);
  };
  return [f(start), end ? f(end) : "Present"].filter(Boolean).join(" - ");
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="mt-1 list-disc space-y-0.5 pl-6 text-justify">
      {items.map((b, j) => (
        <li key={j}>{b.replace(/\*\*/g, "")}</li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------- ATS layouts */

const ATS_SECTIONS = ["Professional Summary", "Skills", "Professional Experience", "Projects", "Education"] as const;

function atsSkillLines(r: ResumeContent) {
  const groups = r.skills.filter((g) => g.items?.length);
  if (groups.length === 1 && !groups[0].category?.trim()) return [{ label: "", items: groups[0].items.join(", ") }];
  return groups.map((g) => ({ label: (g.category || "").trim(), items: g.items.join(", ") }));
}

function AtsHeader({ r, a, headline = true }: { r: ResumeContent; a: AtsSpec; headline?: boolean }) {
  const contact = [r.contact.location, r.contact.phone, r.contact.email, displayUrl(r.contact.linkedin)].filter(Boolean).join("  |  ");
  return (
    <div style={{ textAlign: a.align }}>
      <div style={{ fontSize: 25, fontWeight: 700, lineHeight: 1.15 }}>{r.fullName}</div>
      {headline && <div style={{ fontSize: 14, marginTop: 2 }}>{resumeHeadline(r)}</div>}
      {contact && <div style={{ fontSize: 12, marginTop: 2, whiteSpace: "pre-wrap" }}>{contact}</div>}
    </div>
  );
}

function AtsHeading({ children }: { children: ReactNode }) {
  return (
    <h3 style={{ margin: "14px 0 6px", paddingBottom: 2, borderBottom: "1px solid #4d4d4d", fontSize: 13.5, fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase" }}>
      {children}
    </h3>
  );
}

/** A line with left content and a right-aligned value (dates). */
function AtsRow({ left, right }: { left: ReactNode; right?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "baseline" }}>
      <div style={{ minWidth: 0 }}>{left}</div>
      {right && <div style={{ flexShrink: 0, whiteSpace: "nowrap" }}>{right}</div>}
    </div>
  );
}

/** ATS-safe US resume: mirrors the ATS DOCX / PDF (lib/documents.ts). */
export function AtsResume({ r, a }: { r: ResumeContent; a: AtsSpec }) {
  const skills = atsSkillLines(r);
  const [S, K, X, P, E] = ATS_SECTIONS;
  return (
    <div className="text-left text-[13px] leading-[1.45]" style={{ fontFamily: a.cssFont, color: "#000" }}>
      <AtsHeader r={r} a={a} />
      {r.summary && (
        <>
          <AtsHeading>{S}</AtsHeading>
          <p>{plainText(r.summary)}</p>
        </>
      )}
      {!!skills.length && (
        <>
          <AtsHeading>{K}</AtsHeading>
          {skills.map((s, i) => (
            <div key={i}>
              {s.label && <b>{s.label}: </b>}
              {s.items}
            </div>
          ))}
        </>
      )}
      {!!r.experience.length && (
        <>
          <AtsHeading>{X}</AtsHeading>
          {r.experience.map((e, i) => (
            <div key={i} style={{ marginTop: i ? 10 : 0 }}>
              <AtsRow left={<b>{e.title}</b>} right={range(e.startDate, e.endDate)} />
              {(e.company || e.location) && <div style={{ fontStyle: "italic" }}>{[e.company, e.location].filter(Boolean).join(", ")}</div>}
              {e.description && <p style={{ marginTop: 3 }}>{plainText(e.description)}</p>}
              <AtsBullets items={e.bullets} />
            </div>
          ))}
        </>
      )}
      {!!r.projects?.length && (
        <>
          <AtsHeading>{P}</AtsHeading>
          {r.projects.map((p, i) => (
            <div key={i} style={{ marginTop: i ? 10 : 0 }}>
              <div>
                <b>{p.name}</b>
                {!!p.techStack?.length && <i>{`  |  ${p.techStack.join(", ")}`}</i>}
              </div>
              {p.description && <p>{plainText(p.description)}</p>}
              <AtsBullets items={p.bullets} />
            </div>
          ))}
        </>
      )}
      {!!r.education.length && (
        <>
          <AtsHeading>{E}</AtsHeading>
          {r.education.map((e, i) => (
            <div key={i} style={{ marginTop: i ? 6 : 0 }}>
              <AtsRow left={<b>{e.university}</b>} right={e.endDate ? range("", e.endDate).replace(/^ - /, "") : range(e.startDate, e.endDate)} />
              {(e.degree || e.field) && <div>{[e.degree, e.field].filter(Boolean).join(", ")}</div>}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function AtsBullets({ items }: { items: string[] }) {
  if (!items?.length) return null;
  return (
    <ul style={{ marginTop: 3, paddingLeft: 18, listStyle: "disc" }}>
      {items.map((b, j) => (
        <li key={j} style={{ marginTop: 1 }}>
          {b.replace(/\*\*/g, "")}
        </li>
      ))}
    </ul>
  );
}

/** ATS-safe US business letter: letterhead, date, recipient, subject line, then the letter text. */
export function AtsLetter({ r, a, date, text, company, jobTitle, jobLocation }: { r: ResumeContent; a: AtsSpec; date: string; text: string; company?: string; jobTitle?: string; jobLocation?: string }) {
  const recipient = ["Hiring Team", company, jobLocation].filter(Boolean);
  const paras = (text || "").replace(/\r\n/g, "\n").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return (
    <div className="text-left text-[14px] leading-[1.5]" style={{ fontFamily: a.cssFont, color: "#000" }}>
      <AtsHeader r={r} a={a} headline={false} />
      <div style={{ borderBottom: "1px solid #4d4d4d", marginTop: 8 }} />
      <div style={{ margin: "22px 0 16px" }}>{date}</div>
      <div style={{ marginBottom: 16 }}>
        {recipient.map((l) => (
          <div key={l}>{l}</div>
        ))}
      </div>
      {jobTitle && <div style={{ fontWeight: 700, marginBottom: 16 }}>Re: {jobTitle}</div>}
      {paras.map((p, i) => (
        <p key={i} style={{ marginBottom: 12, whiteSpace: "pre-wrap" }}>
          {p}
        </p>
      ))}
    </div>
  );
}

/** Cover letter preview for any design (ATS, designed, or Standard plain text). */
export function LetterPreview({
  r,
  design,
  text,
  date = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
  company,
  jobTitle,
  jobLocation,
}: {
  r: ResumeContent;
  design?: string | null;
  text: string;
  date?: string;
  company?: string;
  jobTitle?: string;
  jobLocation?: string;
}) {
  const a = atsSpec(design);
  const d = designSpec(design);
  return (
    <div className="paper mx-auto max-w-3xl p-2" style={{ background: "#fff" }}>
      {a ? (
        <AtsLetter r={r} a={a} date={date} text={text} company={company} jobTitle={jobTitle} jobLocation={jobLocation} />
      ) : d ? (
        <DesignedLetter r={r} d={d} date={date} text={text} />
      ) : (
        <div className="font-serif text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "#000" }}>
          {text}
        </div>
      )}
    </div>
  );
}

/** Mirrors the generated DOCX/PDF for the given design (missing / "standard" = the original layout). */
export default function ResumePreview({ r, design }: { r: ResumeContent; design?: string | null }) {
  const a = atsSpec(design);
  if (a)
    return (
      <div className="paper mx-auto max-w-3xl p-2" style={{ background: "#fff" }}>
        <AtsResume r={r} a={a} />
      </div>
    );
  const d = designSpec(design);
  if (d)
    return (
      <div className="paper mx-auto max-w-3xl p-2" style={{ background: "#fff" }}>
        <DesignedResume r={r} d={d} />
      </div>
    );
  const c = r.contact;
  const contact = [c.location, c.phone, c.email, displayUrl(c.linkedin)].filter(Boolean);
  const skills = r.skills.flatMap((g) => g.items);
  // Headings are 6 pt larger than body text (13px ≈ 10pt → 21px ≈ 16pt).
  const H = ({ children }: { children: string }) => <h3 className="mt-10 mb-5 text-[21px] leading-tight font-bold text-black uppercase first-of-type:mt-6">{children}</h3>;
  const plain = (v: string) => (v || "").replace(/\*\*/g, "");
  return (
    <div className="paper mx-auto max-w-3xl bg-white p-2 text-justify text-[13px] leading-relaxed text-black">
      <div className="text-center">
        <div className="text-2xl font-bold">{r.fullName}</div>
        <div className="font-bold">{resumeHeadline(r)}</div>
        <div className="mt-1 text-xs">{contact.join(" | ")}</div>
      </div>
      {r.summary && (
        <>
          <H>Professional Summary</H>
          <p>{plain(r.summary)}</p>
        </>
      )}
      {!!skills.length && (
        <>
          <H>Core Skills</H>
          <p>{skills.join(" | ")}</p>
        </>
      )}
      {!!r.experience.length && (
        <>
          <H>Professional Experience</H>
          {r.experience.map((e, i) => (
            <div key={i} className="mb-3 [&+&]:mt-6">
              <div className="mt-1 text-left font-bold">{e.title}</div>
              <div className="text-left">{e.company}</div>
              <div className="mb-2 text-left">{[e.location, range(e.startDate, e.endDate)].filter(Boolean).join(" | ")}</div>
              {e.description && <p className="mt-1">{e.description}</p>}
              <Bullets items={e.bullets} />
            </div>
          ))}
        </>
      )}
      {!!r.projects?.length && (
        <>
          <H>Selected Projects</H>
          {r.projects.map((p, i) => (
            <div key={i} className="mb-3 [&+&]:mt-6">
              <div className="mt-1 text-left font-bold">{p.name}</div>
              {p.description && <div className="mb-2">{p.description}</div>}
              <Bullets items={p.bullets} />
            </div>
          ))}
        </>
      )}
      {!!r.education.length && (
        <>
          <H>Education</H>
          {r.education.map((e, i) => (
            <div key={i}>
              {e.university}
              {(e.degree || e.field) && ` - ${[e.degree, e.field].filter(Boolean).join(", ")}`}
              {(e.startDate || e.endDate) && ` | ${range(e.startDate, e.endDate)}`}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
