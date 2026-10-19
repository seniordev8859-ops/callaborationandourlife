import { AlignmentType, BorderStyle, Document, HeadingLevel, LevelFormat, Packer, Paragraph, ShadingType, Tab, TabStopType, TextRun } from "docx";
import JSZip from "jszip";
import { PDFDocument, StandardFonts, rgb, setCharacterSpacing, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { formatRange, type ResumeContent } from "./generate";
import { displayUrl } from "./links";
import { resumeHeadline } from "./headline";
import { atsSpec, designSpec, type AtsSpec, type DesignSpec } from "./designs";

export type AppDocSource = {
  _id: unknown;
  company?: string | null;
  jobTitle?: string | null;
  jobUrl?: string | null;
  jobLocation?: string | null;
  jobDescription?: string | null;
  coverLetter?: string | null;
  resume: ResumeContent;
  /** Design ids from lib/designs.ts; missing / "" = Standard. */
  resumeDesign?: string | null;
  coverLetterDesign?: string | null;
  createdAt?: Date | string;
};

const FONT = "Calibri";
const BLACK = "000000";

function safeName(s: string, max = 80) {
  let name = (s || "").replace(/[^\w\- ]+/g, "").replace(/\s+/g, " ").trim();
  if (name.length > max) name = name.slice(0, max).replace(/\s+\S*$/, ""); // cut at a word boundary
  return name.replace(/\s/g, "_") || "Untitled";
}

/** "[Company Name]_[Role Title]" — base name for the files inside the ZIP. */
export function baseFileName(app: AppDocSource) {
  return `${safeName(app.company || "Company")}_${safeName(app.jobTitle || "Role")}`;
}

/** "{Date}-{Company Name}-{Role}", e.g. "2026-09-26-Anthropic-Software Engineer". */
export function applicationLabel(app: AppDocSource) {
  const clean = (s: string) =>
    (s || "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  const d = new Date(app.createdAt ?? Date.now());
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return [date, clean(app.company || "") || "Company", clean(app.jobTitle || "") || "Role"].join("-");
}

export function zipFileName(app: AppDocSource) {
  return `${applicationLabel(app)}.zip`;
}

/** Header contact line: location | phone | email | LinkedIn (plain text; no portfolio/website per the prompt). */
function contactParts(r: ResumeContent) {
  const c = r.contact;
  return [c.location, c.phone, c.email, displayUrl(c.linkedin)].filter((x): x is string => !!x);
}

const plain = (s: string) => s.replace(/\*\*/g, "");

/** "October 17, 2026": the date line on designed cover letters. */
function letterDate(app: AppDocSource) {
  return new Date(app.createdAt ?? Date.now()).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

const educationLine = (e: ResumeContent["education"][number]) => {
  const deg = [e.degree, e.field].filter(Boolean).join(", ");
  const dates = formatRange(e.startDate, e.endDate).replace(/^Present$/, "");
  return `${e.university}${deg ? ` - ${deg}` : ""}${dates ? ` | ${dates}` : ""}`;
};

/** "Company | Location | Dates" under the role title in designed resumes. */
const experienceMeta = (e: ResumeContent["experience"][number]) =>
  [e.company, e.location, formatRange(e.startDate, e.endDate, !e.endDate)].filter(Boolean).join(" | ");

/* ------------------------------------------------------------------ DOCX */

// Body text 10.5 pt; section headings are 6 pt larger (16.5 pt). Content is plain (no bold) and justified.
const BODY = 21; // half-points
const HEADING = BODY + 12; // +6 pt
const J = AlignmentType.JUSTIFIED;
const t = (text: string, bold = false, size = BODY) => new TextRun({ text: plain(text), bold, size, font: FONT, color: BLACK });
const para = (text: string, opts: { before?: number; after?: number; keepNext?: boolean; bold?: boolean } = {}) =>
  new Paragraph({ alignment: J, spacing: { before: opts.before ?? 0, after: opts.after ?? 0 }, keepNext: opts.keepNext, children: [t(text, !!opts.bold)] });

/** An empty line (a real line break) at body size. */
const blankLine = () => new Paragraph({ spacing: { before: 0, after: 0 }, children: [t("")] });

/**
 * "#" section title → Word Heading 1.
 * Layout: a blank line before the section (except the first), spacing around the title, then one blank line before content.
 */
function heading(text: string, first = false) {
  return [
    ...(first ? [] : [blankLine()]),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      keepNext: true,
      spacing: { before: 120, after: 120 },
      children: [new TextRun({ text: text.toUpperCase(), font: FONT, color: BLACK, bold: true, size: HEADING })],
    }),
    new Paragraph({ keepNext: true, spacing: { after: 0 }, children: [t("", false, 12)] }),
  ];
}

function bullet(text: string) {
  return new Paragraph({ style: "ListBullet", alignment: J, numbering: { reference: "tb-bullet", level: 0 }, spacing: { after: 30 }, children: [t(text)] });
}

function docxShell(children: Paragraph[], margins = 720, font = FONT, color = BLACK) {
  return new Document({
    styles: {
      default: { document: { run: { font, color, size: BODY }, paragraph: { alignment: J } } },
      paragraphStyles: [
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font, color, bold: true, size: HEADING },
          paragraph: { spacing: { before: 120, after: 120 }, keepNext: true },
        },
        { id: "ListBullet", name: "List Bullet", basedOn: "Normal", quickFormat: true, run: { font, color, size: BODY }, paragraph: { alignment: J } },
      ],
    },
    numbering: {
      config: [
        {
          reference: "tb-bullet",
          levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 240 } } } }],
        },
      ],
    },
    sections: [{ properties: { page: { margin: { top: margins, bottom: margins, left: margins, right: margins } } }, children }],
  });
}

export async function resumeDocx(r: ResumeContent, design?: string | null): Promise<Buffer> {
  const ats = atsSpec(design);
  if (ats) return atsResumeDocx(r, ats);
  const d = designSpec(design);
  if (d) return designedResumeDocx(r, d);
  const children: Paragraph[] = [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [t(r.fullName, true, 34)] }),
  ];
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [t(resumeHeadline(r), true, 22)] }));
  const contact = contactParts(r);
  if (contact.length) children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [t(contact.join(" | "), false, 19)] }));

  let firstSection = true;
  const section = (title: string) => {
    children.push(...heading(title, firstSection));
    firstSection = false;
  };

  if (r.summary) {
    section("Professional Summary");
    children.push(para(r.summary));
  }

  const skills = r.skills.flatMap((g) => g.items);
  if (skills.length) {
    section("Core Skills");
    children.push(para(skills.join(" | ")));
  }

  if (r.experience.length) {
    section("Professional Experience");
    r.experience.forEach((e, i) => {
      if (i) children.push(blankLine()); // line break between subsections
      // Subsection heading: Role / Company / Location | Duration (spaced), then content
      children.push(para(e.title, { before: 60, after: 20, keepNext: true, bold: true }));
      children.push(para(e.company, { after: 20, keepNext: true }));
      const where = [e.location, formatRange(e.startDate, e.endDate, !e.endDate)].filter(Boolean).join(" | ");
      if (where) children.push(para(where, { after: 100, keepNext: true }));
      if (e.description) children.push(para(e.description));
      e.bullets.forEach((b) => children.push(bullet(b)));
    });
  }

  if (r.projects?.length) {
    section("Selected Projects");
    r.projects.forEach((p, i) => {
      if (i) children.push(blankLine());
      children.push(para(p.name, { before: 60, after: 20, keepNext: true, bold: true }));
      if (p.description) children.push(para(p.description, { after: 100, keepNext: true }));
      p.bullets.forEach((b) => children.push(bullet(b)));
    });
  }

  if (r.education.length) {
    section("Education");
    r.education.forEach((e, i) => {
      const deg = [e.degree, e.field].filter(Boolean).join(", ");
      const dates = formatRange(e.startDate, e.endDate).replace(/^Present$/, "");
      children.push(para(`${e.university}${deg ? ` - ${deg}` : ""}${dates ? ` | ${dates}` : ""}`, { before: i ? 80 : 0 }));
    });
  }

  return Packer.toBuffer(docxShell(children, 720));
}

const CLOSING = /^(sincerely|best regards|kind regards|warm regards|regards|best|respectfully|thank you),?$/i;

/**
 * Splits the letter into salutation / body / closing so the salutation and sign-off are left-aligned
 * (a soft line break inside a justified paragraph would stretch "Dear Hiring Manager," across the line).
 */
function letterBlocks(app: AppDocSource) {
  const paras = (app.coverLetter || "").replace(/\r\n/g, "\n").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  let salutation = "";
  const closing: string[] = [];
  if (paras.length && /^dear\b/i.test(paras[0])) {
    const [first, ...rest] = paras[0].split("\n");
    salutation = first.trim();
    const remainder = rest.join(" ").trim();
    if (remainder) paras[0] = remainder;
    else paras.shift();
  }
  // Sign-off: "Sincerely," (possibly inside the last paragraph) + name (same or next paragraph).
  for (let i = paras.length - 1; i >= Math.max(0, paras.length - 3); i--) {
    const lines = paras[i].split("\n").map((l) => l.trim());
    const at = lines.findIndex((l) => CLOSING.test(l));
    if (at < 0) continue;
    const before = lines.slice(0, at).join(" ").trim();
    closing.push(...lines.slice(at), ...paras.slice(i + 1).flatMap((p) => p.split("\n").map((l) => l.trim())));
    paras.splice(i, paras.length - i, ...(before ? [before] : []));
    break;
  }
  const body = paras.map((p) => p.replace(/\s*\n\s*/g, " "));
  return { salutation, body, closing: closing.filter(Boolean) };
}

export async function coverLetterDocx(app: AppDocSource): Promise<Buffer> {
  const ats = atsSpec(app.coverLetterDesign);
  if (ats) return atsLetterDocx(app, ats);
  const d = designSpec(app.coverLetterDesign);
  if (d) return designedCoverLetterDocx(app, d);
  const { salutation, body, closing } = letterBlocks(app);
  const line = (text: string, opts: { justify?: boolean; after?: number } = {}) =>
    new Paragraph({ alignment: opts.justify ? J : AlignmentType.LEFT, spacing: { before: 0, after: opts.after ?? 0 }, children: [t(text, false, 22)] });
  const children: Paragraph[] = [];
  if (salutation) children.push(line(salutation), new Paragraph({ children: [t("", false, 22)] })); // salutation + a line break
  body.forEach((p) => children.push(line(p, { justify: true, after: 200 })));
  closing.forEach((c) => children.push(line(c)));
  return Packer.toBuffer(docxShell(children, 1080));
}

/* --------------------------------------------------------- designed DOCX */

const hp = (pt: number) => Math.round(pt * 2); // half-points

function docxKit(d: DesignSpec) {
  const run = (text: string, o: { size?: number; bold?: boolean; color?: string; caps?: boolean; smallCaps?: boolean; tracking?: number } = {}) =>
    new TextRun({
      text: plain(text),
      font: d.docxFont,
      size: hp(o.size ?? 10),
      bold: o.bold,
      color: o.color ?? d.ink,
      allCaps: o.caps,
      smallCaps: o.smallCaps,
      characterSpacing: o.tracking,
    });
  const body = (text: string, o: { after?: number; size?: number; color?: string; bold?: boolean; keepNext?: boolean; left?: boolean } = {}) =>
    new Paragraph({
      alignment: o.left ? AlignmentType.LEFT : J,
      spacing: { before: 0, after: o.after ?? 40 },
      keepNext: o.keepNext,
      children: [run(text, { size: o.size, color: o.color, bold: o.bold })],
    });
  const bullet = (text: string) =>
    new Paragraph({ style: "ListBullet", alignment: J, numbering: { reference: "tb-bullet", level: 0 }, spacing: { after: 30 }, children: [run(text)] });

  /** Name / headline / contact; inside a shaded, padded band for banner designs. */
  const header = (r: ResumeContent) => {
    const b = d.banner;
    const alignment = d.align === "center" ? AlignmentType.CENTER : AlignmentType.LEFT;
    // Identical borders on consecutive paragraphs merge into one box: the fill-coloured border pads the band.
    const edge = b && { style: BorderStyle.SINGLE, size: 4, color: b.fill, space: 8 };
    const band = b ? { shading: { type: ShadingType.CLEAR, fill: b.fill, color: "auto" }, border: { top: edge!, bottom: edge!, left: edge!, right: edge! } } : {};
    const p = (children: TextRun[], after = 0) => new Paragraph({ alignment, spacing: { before: 0, after }, ...band, children });
    const muted = b?.muted ?? d.muted;
    const out = [
      p([run(r.fullName, { size: 20, bold: true, color: b?.text ?? d.accent, caps: d.nameCaps, tracking: d.nameCaps ? 50 : undefined })], 20),
      p([run(resumeHeadline(r), { size: 10.5, bold: !d.serif, color: b ? b.text : muted })], 10),
    ];
    const contact = contactParts(r);
    if (contact.length) out.push(p([run(contact.join(" | "), { size: 9, color: muted })]));
    return out;
  };

  const heading = (title: string, first: boolean) => {
    const smallCaps = d.headingCase === "smallcaps";
    const bar = d.headingDecor === "bar";
    return new Paragraph({
      heading: HeadingLevel.HEADING_1,
      keepNext: true,
      alignment: d.headingAlign === "center" ? AlignmentType.CENTER : AlignmentType.LEFT,
      spacing: { before: first ? 200 : 240, after: 100 },
      ...(bar
        ? {
            shading: { type: ShadingType.CLEAR, fill: d.barFill ?? "F1F5F9", color: "auto" },
            border: { left: { style: BorderStyle.SINGLE, size: 24, color: d.accent, space: 6 } },
          }
        : { border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: d.rule, space: 2 } } }),
      children: [run(smallCaps ? title : title.toUpperCase(), { size: smallCaps ? 12 : 11, bold: true, color: d.accent, smallCaps, tracking: 20 })],
    });
  };

  return { run, body, bullet, header, heading };
}

async function designedResumeDocx(r: ResumeContent, d: DesignSpec): Promise<Buffer> {
  const k = docxKit(d);
  const children: Paragraph[] = k.header(r);
  let first = true;
  const section = (title: string) => {
    children.push(k.heading(title, first));
    first = false;
  };

  if (r.summary) {
    section("Professional Summary");
    children.push(k.body(r.summary));
  }
  const skills = r.skills.flatMap((g) => g.items);
  if (skills.length) {
    section("Core Skills");
    children.push(k.body(skills.join(" | ")));
  }
  if (r.experience.length) {
    section("Professional Experience");
    r.experience.forEach((e, i) => {
      children.push(k.body(e.title, { bold: true, size: 10.5, after: 10, keepNext: true, left: true }));
      const meta = experienceMeta(e);
      if (meta) children.push(k.body(meta, { size: 9.5, color: d.muted, after: 50, keepNext: true, left: true }));
      if (e.description) children.push(k.body(e.description));
      e.bullets.forEach((b) => children.push(k.bullet(b)));
      if (i < r.experience.length - 1) children.push(k.body("", { size: 5, after: 60 }));
    });
  }
  if (r.projects?.length) {
    section("Selected Projects");
    r.projects.forEach((p, i) => {
      children.push(k.body(p.name, { bold: true, size: 10.5, after: 20, keepNext: true, left: true }));
      if (p.description) children.push(k.body(p.description, { after: 50, keepNext: true }));
      p.bullets.forEach((b) => children.push(k.bullet(b)));
      if (i < r.projects!.length - 1) children.push(k.body("", { size: 5, after: 60 }));
    });
  }
  if (r.education.length) {
    section("Education");
    r.education.forEach((e) => children.push(k.body(educationLine(e), { after: 40, left: true })));
  }
  return Packer.toBuffer(docxShell(children, 792, d.docxFont, d.ink));
}

async function designedCoverLetterDocx(app: AppDocSource, d: DesignSpec): Promise<Buffer> {
  const k = docxKit(d);
  const children: Paragraph[] = k.header(app.resume);
  if (!d.banner) {
    const rule =
      d.letterRule === "double"
        ? { style: BorderStyle.DOUBLE, size: 6, color: d.rule, space: 4 }
        : { style: BorderStyle.SINGLE, size: d.letterRule === "thick" ? 18 : 6, color: d.letterRule === "thick" ? d.accent : d.rule, space: 4 };
    children.push(new Paragraph({ spacing: { before: 0, after: 0 }, border: { bottom: rule }, children: [k.run("", { size: 4 })] }));
  }
  children.push(new Paragraph({ spacing: { before: 360, after: 360 }, children: [k.run(letterDate(app), { size: 11 })] }));

  const { salutation, body, closing } = letterBlocks(app);
  if (salutation) children.push(k.body(salutation, { size: 11, left: true, after: 220 }));
  body.forEach((p) => children.push(k.body(p, { size: 11, after: 200 })));
  closing.forEach((c) => children.push(k.body(c, { size: 11, left: true, after: 0 })));
  return Packer.toBuffer(docxShell(children, 1008, d.docxFont, d.ink));
}

export async function jobDescriptionDocx(app: AppDocSource): Promise<Buffer> {
  const meta: [string, string][] = (
    [
      ["Company", app.company || ""],
      ["Role", app.jobTitle || ""],
      ["Location", app.jobLocation || ""],
      ["URL", app.jobUrl || ""],
      ["Generated", new Date(app.createdAt ?? Date.now()).toISOString().slice(0, 10)],
    ] as [string, string][]
  ).filter(([, v]) => v);

  const children: Paragraph[] = [
    new Paragraph({ spacing: { after: 120 }, children: [t(app.jobTitle || "Job Description", true, 32)] }),
    ...meta.map(([k, v]) => new Paragraph({ children: [t(`${k}: `, true), t(v)] })),
    ...heading("Job Description"),
  ];
  // Short lines without terminal punctuation are treated as sub-headings; "•"/"-" lines as bullets.
  for (const raw of (app.jobDescription || "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const isB = /^[•\-*·]\s+/.test(line);
    const text = line.replace(/^[•\-*·]\s+/, "");
    const isHeading = !isB && text.length <= 60 && !/[.,;:]$/.test(text) && /^[A-Z]/.test(text) && text.split(" ").length <= 8;
    children.push(
      isB
        ? bullet(text)
        : isHeading
          ? new Paragraph({ spacing: { before: 200, after: 60 }, children: [t(text, true, 22)] })
          : new Paragraph({ spacing: { after: 100 }, children: [t(text, false, 20)] })
    );
  }
  return Packer.toBuffer(docxShell(children, 1080));
}

/* ------------------------------------------------------------------- PDF */

// Standard PDF fonts only support WinAnsi; normalise everything else.
function winAnsi(text: string) {
  return text
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/[●▪‣⁃]/g, "•")
    .replace(/ /g, " ")
    .replace(/[^\x09\x0A\x0D\x20-\x7E¡-ÿ•…€™]/g, "");
}

const INK = rgb(0, 0, 0);
const JUSTIFY_LAST_LINE_FILL = 0.85;

class PdfWriter {
  page!: PDFPage;
  y = 0;
  constructor(
    private doc: PDFDocument,
    public fonts: { regular: PDFFont; bold: PDFFont },
    public margin = 50
  ) {
    this.newPage();
  }
  get width() {
    return 612 - this.margin * 2;
  }
  newPage() {
    this.page = this.doc.addPage([612, 792]);
    this.y = 792 - this.margin;
  }
  ensure(h: number) {
    if (this.y - h < this.margin) this.newPage();
  }
  /** Word-wraps mixed bold/regular segments; `indent` shifts the text block. */
  rich(
    segs: { text: string; bold?: boolean }[],
    opts: { size?: number; indent?: number; center?: boolean; gap?: number; justify?: boolean; color?: RGB; width?: number; leading?: number } = {}
  ) {
    const size = opts.size ?? 10;
    const indent = opts.indent ?? 0;
    const lh = size * (opts.leading ?? 1.32);
    const maxW = (opts.width ?? this.width) - indent;
    const words: { w: string; bold: boolean }[] = [];
    for (const s of segs) for (const w of winAnsi(s.text).split(/(\s+)/)) if (w) words.push({ w, bold: !!s.bold });
    const lines: { w: string; bold: boolean }[][] = [];
    let line: { w: string; bold: boolean }[] = [];
    let width = 0;
    const measure = (x: { w: string; bold: boolean }) => (x.bold ? this.fonts.bold : this.fonts.regular).widthOfTextAtSize(x.w, size);
    for (const x of words) {
      if (/^\s+$/.test(x.w) && !line.length) continue;
      const wv = measure(x);
      if (width + wv > maxW && line.length && !/^\s+$/.test(x.w)) {
        lines.push(line);
        line = [];
        width = 0;
      }
      if (/^\s+$/.test(x.w) && !line.length) continue;
      line.push(/^\s+$/.test(x.w) ? { ...x, w: " " } : x);
      width += /^\s+$/.test(x.w) ? measure({ w: " ", bold: x.bold }) : wv;
    }
    if (line.length) lines.push(line);
    lines.forEach((l, li) => {
      while (l.length && /^\s+$/.test(l[l.length - 1].w)) l.pop();
      this.ensure(lh);
      this.y -= lh;
      const total = l.reduce((a, x) => a + measure(x), 0);
      const gaps = l.filter((x) => /^\s+$/.test(x.w)).length;
      // Justify every line; the last (or only) line too once it is at least 85% full, so content is
      // flush with both margins. Shorter tails stay left so a few words are not scattered across the line.
      const stretch = li < lines.length - 1 || total / maxW >= JUSTIFY_LAST_LINE_FILL;
      const extra = opts.justify && stretch && gaps > 0 ? (maxW - total) / gaps : 0;
      let x = opts.center ? this.margin + (this.width - total) / 2 : this.margin + indent;
      // Emit real space characters inside the drawn strings so the PDF text layer (what ATS parsers read)
      // keeps word boundaries: whole runs when not justifying, "word␠" chunks when justifying.
      const runs: { w: string; bold: boolean; gapAfter: boolean }[] = [];
      for (const part of l) {
        const isSpace = /^\s+$/.test(part.w);
        const last = runs[runs.length - 1];
        if (isSpace) {
          if (last) (last.w += " "), (last.gapAfter = true);
        } else if (last && last.bold === part.bold && !(extra && last.gapAfter)) last.w += part.w;
        else runs.push({ w: part.w, bold: part.bold, gapAfter: false });
      }
      for (const run of runs) {
        const font = run.bold ? this.fonts.bold : this.fonts.regular;
        this.page.drawText(run.w, { x, y: this.y, size, font, color: opts.color ?? INK });
        x += font.widthOfTextAtSize(run.w, size) + (run.gapAfter ? extra : 0);
      }
    });
    this.y -= opts.gap ?? 0;
  }
  /** Body text is justified unless centered. */
  text(text: string, opts: { size?: number; bold?: boolean; indent?: number; center?: boolean; gap?: number; justify?: boolean; color?: RGB } = {}) {
    for (const p of text.split("\n")) this.rich([{ text: plain(p), bold: opts.bold }], { justify: !opts.center, ...opts });
  }
  bullet(text: string, size = 10, color: RGB = INK, justify = true) {
    const lh = size * 1.32;
    this.ensure(lh);
    // Draw the bullet first so text extraction (ATS parsers) reads "• text" in order.
    this.page.drawText("•", { x: this.margin + 5, y: this.y - lh, size, font: this.fonts.regular, color });
    this.rich([{ text: plain(text) }], { size, indent: 16, justify, color });
    this.y -= 1.5;
  }
  /** One unwrapped line at baseline `y`, optionally letter-spaced (PDF Tc, so the text layer stays one string). */
  label(text: string, o: { y: number; size: number; bold?: boolean; color?: RGB; tracking?: number; center?: boolean; indent?: number }) {
    const font = o.bold ? this.fonts.bold : this.fonts.regular;
    const s = winAnsi(text);
    const tracking = o.tracking ?? 0;
    const width = font.widthOfTextAtSize(s, o.size) + tracking * Math.max(0, s.length - 1);
    const x = o.center ? this.margin + (this.width - width) / 2 : this.margin + (o.indent ?? 0);
    if (tracking) this.page.pushOperators(setCharacterSpacing(tracking));
    this.page.drawText(s, { x, y: o.y, size: o.size, font, color: o.color ?? INK });
    if (tracking) this.page.pushOperators(setCharacterSpacing(0));
  }
  /** Section title: a blank line before the section (except the first), spacing around the title, one blank line after. */
  heading(text: string, first = false) {
    this.ensure(64);
    if (!first) this.y -= 13; // line break between major sections
    this.y -= 6;
    this.text(text.toUpperCase(), { size: 16, bold: true, justify: false }); // body 10 pt + 6 pt
    this.y -= 12; // blank line before the section content
  }
}

async function newPdf(serif = false) {
  const doc = await PDFDocument.create();
  const fonts = {
    regular: await doc.embedFont(serif ? StandardFonts.TimesRoman : StandardFonts.Helvetica),
    bold: await doc.embedFont(serif ? StandardFonts.TimesRomanBold : StandardFonts.HelveticaBold),
  };
  return { doc, fonts };
}

export async function resumePdf(r: ResumeContent, design?: string | null): Promise<Uint8Array> {
  const ats = atsSpec(design);
  if (ats) return atsResumePdf(r, ats);
  const d = designSpec(design);
  if (d) return designedResumePdf(r, d);
  const { doc, fonts } = await newPdf();
  doc.setTitle(`${r.fullName} - Resume`);
  doc.setAuthor(r.fullName);
  const w = new PdfWriter(doc, fonts, 46);
  w.text(r.fullName, { size: 18, bold: true, center: true });
  w.text(resumeHeadline(r), { size: 11, bold: true, center: true, gap: 1 });
  const contact = contactParts(r);
  if (contact.length) w.text(contact.join(" | "), { size: 9.5, center: true });

  let firstSection = true;
  const section = (title: string) => {
    w.heading(title, firstSection);
    firstSection = false;
  };
  if (r.summary) {
    section("Professional Summary");
    w.text(r.summary);
  }
  const skills = r.skills.flatMap((g) => g.items);
  if (skills.length) {
    section("Core Skills");
    w.text(skills.join(" | "));
  }
  if (r.experience.length) {
    section("Professional Experience");
    r.experience.forEach((e, i) => {
      if (i) w.y -= 13; // line break between subsections
      w.ensure(56);
      // Subsection heading: Role / Company / Location | Duration, spaced from its content
      w.text(e.title, { bold: true, gap: 1.5 });
      w.text(e.company, { gap: 1.5 });
      const where = [e.location, formatRange(e.startDate, e.endDate, !e.endDate)].filter(Boolean).join(" | ");
      if (where) w.text(where, { gap: 5 });
      if (e.description) w.text(e.description);
      for (const b of e.bullets) w.bullet(b);
    });
  }
  if (r.projects?.length) {
    section("Selected Projects");
    r.projects.forEach((p, i) => {
      if (i) w.y -= 13;
      w.ensure(48);
      w.text(p.name, { bold: true, gap: 1.5 });
      if (p.description) w.text(p.description, { gap: 5 });
      for (const b of p.bullets) w.bullet(b);
    });
  }
  if (r.education.length) {
    section("Education");
    r.education.forEach((e, i) => {
      if (i) w.y -= 4;
      const deg = [e.degree, e.field].filter(Boolean).join(", ");
      const dates = formatRange(e.startDate, e.endDate).replace(/^Present$/, "");
      w.text(`${e.university}${deg ? ` - ${deg}` : ""}${dates ? ` | ${dates}` : ""}`);
    });
  }
  return doc.save();
}

export async function coverLetterPdf(app: AppDocSource): Promise<Uint8Array> {
  const ats = atsSpec(app.coverLetterDesign);
  if (ats) return atsLetterPdf(app, ats);
  const d = designSpec(app.coverLetterDesign);
  if (d) return designedCoverLetterPdf(app, d);
  const { doc, fonts } = await newPdf();
  doc.setTitle(`${app.resume.fullName} - Cover Letter`);
  const w = new PdfWriter(doc, fonts, 72);
  const { salutation, body, closing } = letterBlocks(app);
  if (salutation) {
    w.text(salutation, { size: 11, justify: false });
    w.y -= 14.5; // line break after the salutation
  }
  for (const p of body) w.text(p, { size: 11, gap: 10 });
  for (const c of closing) w.text(c, { size: 11, justify: false });
  return doc.save();
}

/* ---------------------------------------------------------- designed PDF */

const hex = (h: string) => rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);

/** Name / headline / contact; drawn inside a filled band for banner designs. */
function pdfHeader(w: PdfWriter, r: ResumeContent, d: DesignSpec) {
  const b = d.banner;
  const center = d.align === "center";
  const indent = b && !center ? 14 : 0;
  const pad = b ? 14 : 0;
  const contact = contactParts(r).join(" | ");
  const NAME = 20, HEAD = 10.5, CONTACT = 9;
  const top = w.y;
  let height = 0;
  if (b) {
    const contactLines = contact ? Math.ceil(w.fonts.regular.widthOfTextAtSize(winAnsi(contact), CONTACT) / (w.width - indent * 2)) : 0;
    height = pad + NAME + 6 + HEAD * 1.32 + contactLines * CONTACT * 1.32 + pad;
    w.page.drawRectangle({ x: w.margin, y: top - height, width: w.width, height, color: hex(b.fill) });
    w.y -= pad;
  }
  const muted = hex(b?.muted ?? d.muted);
  w.y -= NAME;
  const name = d.nameCaps ? r.fullName.toUpperCase() : r.fullName;
  w.label(name, { y: w.y, size: NAME, bold: true, color: hex(b?.text ?? d.accent), tracking: d.nameCaps ? 1.6 : 0, center, indent });
  w.y -= 6;
  w.text(resumeHeadline(r), { size: HEAD, bold: !d.serif, center, indent, justify: false, color: b ? hex(b.text) : muted });
  if (contact) w.text(contact, { size: CONTACT, center, indent, justify: false, color: muted });
  if (b) w.y = top - height;
  w.y -= 4;
}

function pdfHeading(w: PdfWriter, d: DesignSpec, title: string, first: boolean) {
  w.ensure(70);
  w.y -= first ? 12 : 16;
  const smallCaps = d.headingCase === "smallcaps";
  const size = smallCaps ? 9.5 : 10.5;
  const tracking = smallCaps ? 1.4 : 0.6;
  const accent = hex(d.accent);
  if (d.headingDecor === "bar") {
    const h = 16;
    w.page.drawRectangle({ x: w.margin, y: w.y - h, width: w.width, height: h, color: hex(d.barFill ?? "F1F5F9") });
    w.page.drawRectangle({ x: w.margin, y: w.y - h, width: 3, height: h, color: accent });
    w.label(title.toUpperCase(), { y: w.y - h + 4.8, size, bold: true, color: accent, tracking, indent: 10 });
    w.y -= h + 6;
    return;
  }
  const base = w.y - size;
  w.label(title.toUpperCase(), { y: base, size, bold: true, color: accent, tracking, center: d.headingAlign === "center" });
  const ruleY = base - 4;
  w.page.drawLine({ start: { x: w.margin, y: ruleY }, end: { x: w.margin + w.width, y: ruleY }, thickness: 0.75, color: hex(d.rule) });
  w.y = ruleY - 7;
}

async function designedResumePdf(r: ResumeContent, d: DesignSpec): Promise<Uint8Array> {
  const { doc, fonts } = await newPdf(d.serif);
  doc.setTitle(`${r.fullName} - Resume`);
  doc.setAuthor(r.fullName);
  const w = new PdfWriter(doc, fonts, 48);
  const ink = hex(d.ink);
  const muted = hex(d.muted);
  pdfHeader(w, r, d);

  let first = true;
  const section = (title: string) => {
    pdfHeading(w, d, title, first);
    first = false;
  };
  if (r.summary) {
    section("Professional Summary");
    w.text(r.summary, { color: ink });
  }
  const skills = r.skills.flatMap((g) => g.items);
  if (skills.length) {
    section("Core Skills");
    w.text(skills.join(" | "), { color: ink });
  }
  if (r.experience.length) {
    section("Professional Experience");
    r.experience.forEach((e, i) => {
      if (i) w.y -= 7;
      w.ensure(48);
      w.text(e.title, { bold: true, size: 10.5, justify: false, color: ink, gap: 1 });
      const meta = experienceMeta(e);
      if (meta) w.text(meta, { size: 9.5, justify: false, color: muted, gap: 3 });
      if (e.description) w.text(e.description, { color: ink, gap: 1 });
      for (const b of e.bullets) w.bullet(b, 10, ink);
    });
  }
  if (r.projects?.length) {
    section("Selected Projects");
    r.projects.forEach((p, i) => {
      if (i) w.y -= 7;
      w.ensure(40);
      w.text(p.name, { bold: true, size: 10.5, justify: false, color: ink, gap: 1 });
      if (p.description) w.text(p.description, { color: ink, gap: 3 });
      for (const b of p.bullets) w.bullet(b, 10, ink);
    });
  }
  if (r.education.length) {
    section("Education");
    for (const e of r.education) w.text(educationLine(e), { justify: false, color: ink, gap: 2 });
  }
  return doc.save();
}

async function designedCoverLetterPdf(app: AppDocSource, d: DesignSpec): Promise<Uint8Array> {
  const { doc, fonts } = await newPdf(d.serif);
  doc.setTitle(`${app.resume.fullName} - Cover Letter`);
  const w = new PdfWriter(doc, fonts, 60);
  const ink = hex(d.ink);
  pdfHeader(w, app.resume, d);
  if (!d.banner) {
    w.y -= 6;
    const line = (y: number, thickness: number, color: RGB) =>
      w.page.drawLine({ start: { x: w.margin, y }, end: { x: w.margin + w.width, y }, thickness, color });
    if (d.letterRule === "double") {
      line(w.y, 0.6, hex(d.rule));
      line(w.y - 2.5, 0.6, hex(d.rule));
    } else if (d.letterRule === "thick") line(w.y, 2, hex(d.accent));
    else line(w.y, 0.75, hex(d.rule));
  }
  w.y -= 24;
  w.text(letterDate(app), { size: 11, justify: false, color: ink });
  w.y -= 16;
  const { salutation, body, closing } = letterBlocks(app);
  if (salutation) {
    w.text(salutation, { size: 11, justify: false, color: ink });
    w.y -= 12;
  }
  for (const p of body) w.text(p, { size: 11, gap: 10, color: ink });
  for (const c of closing) w.text(c, { size: 11, justify: false, color: ink });
  return doc.save();
}

/* -------------------------------------------------------------- ATS layouts
   Built for US applicant tracking systems and recruiters: one column, black text, standard section names,
   left-aligned body text, dates flush right on the role line, skills grouped by category, real bullets and
   real text only (no tables, text boxes, columns, images, page headers/footers or colour). */

export const ATS_SECTIONS = {
  summary: "Professional Summary",
  skills: "Skills",
  experience: "Professional Experience",
  projects: "Projects",
  education: "Education",
} as const;

/** Skills as "Category: a, b, c" lines; one plain list when the groups have no names. */
export function atsSkillLines(r: ResumeContent): { label: string; items: string }[] {
  const groups = r.skills.filter((g) => g.items?.length);
  if (!groups.length) return [];
  if (groups.length === 1 && !groups[0].category?.trim()) return [{ label: "", items: groups[0].items.join(", ") }];
  return groups.map((g) => ({ label: (g.category || "").trim(), items: g.items.join(", ") }));
}

/** "May 2016" (graduation), or the range when only a start date is known. */
export const atsEducationDate = (e: ResumeContent["education"][number]) =>
  formatRange("", e.endDate) || formatRange(e.startDate, e.endDate).replace(/^Present$/, "");

/** "Company, City, ST" under the role title. */
export const atsCompanyLine = (e: ResumeContent["experience"][number]) => [e.company, e.location].filter(Boolean).join(", ");

const ATS_INK = "000000";
const ATS_RULE = "4D4D4D";
const PAGE_W = 12240; // twips, US Letter

function atsDocxKit(a: AtsSpec, margin: number, bodyPt: number) {
  const contentW = PAGE_W - margin * 2;
  const run = (text: string, o: { size?: number; bold?: boolean; italics?: boolean; tracking?: number } = {}) =>
    new TextRun({ text: plain(text), font: a.docxFont, size: hp(o.size ?? bodyPt), bold: o.bold, italics: o.italics, characterSpacing: o.tracking, color: ATS_INK });
  const p = (children: TextRun[], o: { after?: number; before?: number; keepNext?: boolean; align?: "left" | "center" } = {}) =>
    new Paragraph({
      alignment: o.align === "center" ? AlignmentType.CENTER : AlignmentType.LEFT,
      spacing: { before: o.before ?? 0, after: o.after ?? 0, line: 252 },
      keepNext: o.keepNext,
      children,
    });
  /** Left text with a right-aligned value (dates) on the same line, via a right tab stop. */
  const row = (left: TextRun[], right: string, o: { after?: number } = {}) =>
    new Paragraph({
      alignment: AlignmentType.LEFT,
      tabStops: [{ type: TabStopType.RIGHT, position: contentW }],
      spacing: { before: 0, after: o.after ?? 0, line: 252 },
      keepNext: true,
      children: right ? [...left, new TextRun({ children: [new Tab(), plain(right)], font: a.docxFont, size: hp(bodyPt), color: ATS_INK })] : left,
    });
  const heading = (title: string, first: boolean) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      keepNext: true,
      alignment: AlignmentType.LEFT,
      spacing: { before: first ? 160 : 220, after: 80 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ATS_RULE, space: 1 } },
      children: [run(title.toUpperCase(), { size: bodyPt + 0.5, bold: true, tracking: 10 })],
    });
  const bullet = (text: string) =>
    new Paragraph({ style: "ListBullet", alignment: AlignmentType.LEFT, numbering: { reference: "tb-bullet", level: 0 }, spacing: { after: 30, line: 252 }, children: [run(text)] });
  /** Name, headline and contact line, in the document body (never a page header) so every ATS reads them. */
  const header = (r: ResumeContent, o: { headline?: boolean } = {}) => {
    const align = a.align;
    const out = [p([run(r.fullName, { size: 20, bold: true })], { align, after: 20 })];
    if (o.headline !== false) out.push(p([run(resumeHeadline(r), { size: bodyPt + 0.5 })], { align, after: 20 }));
    const contact = contactParts(r);
    if (contact.length) out.push(p([run(contact.join("  |  "), { size: bodyPt - 1 })], { align }));
    return out;
  };
  return { run, p, row, heading, bullet, header };
}

async function atsResumeDocx(r: ResumeContent, a: AtsSpec): Promise<Buffer> {
  const MARGIN = 864; // 0.6"
  const k = atsDocxKit(a, MARGIN, 10.5);
  const children: Paragraph[] = k.header(r);
  let first = true;
  const section = (title: string) => {
    children.push(k.heading(title, first));
    first = false;
  };

  if (r.summary) {
    section(ATS_SECTIONS.summary);
    children.push(k.p([k.run(r.summary)], { after: 20 }));
  }
  const skills = atsSkillLines(r);
  if (skills.length) {
    section(ATS_SECTIONS.skills);
    for (const s of skills) children.push(k.p(s.label ? [k.run(`${s.label}: `, { bold: true }), k.run(s.items)] : [k.run(s.items)], { after: 30 }));
  }
  if (r.experience.length) {
    section(ATS_SECTIONS.experience);
    r.experience.forEach((e, i) => {
      children.push(k.row([k.run(e.title, { bold: true })], formatRange(e.startDate, e.endDate, !e.endDate)));
      const company = atsCompanyLine(e);
      if (company) children.push(k.p([k.run(company, { italics: true })], { after: 50, keepNext: true }));
      if (e.description) children.push(k.p([k.run(e.description)], { after: 30 }));
      e.bullets.forEach((b) => children.push(k.bullet(b)));
      if (i < r.experience.length - 1) children.push(k.p([k.run("", { size: 4 })], { after: 80 }));
    });
  }
  if (r.projects?.length) {
    section(ATS_SECTIONS.projects);
    r.projects.forEach((pr, i) => {
      const stack = pr.techStack?.length ? pr.techStack.join(", ") : "";
      children.push(k.p([k.run(pr.name, { bold: true }), ...(stack ? [k.run(`  |  ${stack}`, { italics: true })] : [])], { after: 20, keepNext: true }));
      if (pr.description) children.push(k.p([k.run(pr.description)], { after: 30, keepNext: !!pr.bullets.length }));
      pr.bullets.forEach((b) => children.push(k.bullet(b)));
      if (i < r.projects!.length - 1) children.push(k.p([k.run("", { size: 4 })], { after: 80 }));
    });
  }
  if (r.education.length) {
    section(ATS_SECTIONS.education);
    r.education.forEach((e, i) => {
      children.push(k.row([k.run(e.university, { bold: true })], atsEducationDate(e)));
      const deg = [e.degree, e.field].filter(Boolean).join(", ");
      if (deg) children.push(k.p([k.run(deg)], { after: i < r.education.length - 1 ? 80 : 0 }));
    });
  }
  return Packer.toBuffer(docxShell(children, MARGIN, a.docxFont, ATS_INK));
}

/** US business letter parts: recipient block and subject line, plus the salutation / body / closing. */
export function atsLetterParts(app: Pick<AppDocSource, "company" | "jobTitle" | "jobLocation" | "coverLetter" | "_id" | "resume">) {
  const recipient = ["Hiring Team", app.company || "", app.jobLocation || ""].filter(Boolean);
  const subject = app.jobTitle ? `Re: ${app.jobTitle}` : "";
  return { recipient, subject, ...letterBlocks(app as AppDocSource) };
}

async function atsLetterDocx(app: AppDocSource, a: AtsSpec): Promise<Buffer> {
  const MARGIN = 1440; // 1"
  const k = atsDocxKit(a, MARGIN, 11);
  const children: Paragraph[] = k.header(app.resume, { headline: false });
  children.push(new Paragraph({ spacing: { before: 60, after: 0 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ATS_RULE, space: 1 } }, children: [k.run("", { size: 4 })] }));
  const { recipient, subject, salutation, body, closing } = atsLetterParts(app);
  children.push(k.p([k.run(letterDate(app))], { before: 320, after: 240 }));
  recipient.forEach((l, i) => children.push(k.p([k.run(l)], { after: i === recipient.length - 1 ? 240 : 0 })));
  if (subject) children.push(k.p([k.run(subject, { bold: true })], { after: 240 }));
  if (salutation) children.push(k.p([k.run(salutation)], { after: 200 }));
  body.forEach((t) => children.push(k.p([k.run(t)], { after: 200 })));
  closing.forEach((c, i) => children.push(k.p([k.run(c)], { after: i === 0 && closing.length > 1 ? 360 : 0 })));
  return Packer.toBuffer(docxShell(children, MARGIN, a.docxFont, ATS_INK));
}

/* ATS PDF: same structure; each line is drawn left to right so the PDF text layer reads in order. */

const PDF_ATS_INK = rgb(0, 0, 0);
const PDF_ATS_RULE = rgb(0.3, 0.3, 0.3);

function atsPdfKit(w: PdfWriter, a: AtsSpec, bodyPt: number) {
  const lh = (size: number) => size * 1.3;
  /** Left text (wrapped, leaving room) with a right-aligned value on its first line. */
  const row = (segs: { text: string; bold?: boolean }[], right: string, size = bodyPt) => {
    const r = winAnsi(right || "");
    const rw = r ? w.fonts.regular.widthOfTextAtSize(r, size) : 0;
    w.ensure(lh(size) * 2);
    const top = w.y;
    w.rich(segs, { size, justify: false, width: r ? w.width - rw - 14 : w.width, color: PDF_ATS_INK, leading: 1.3 });
    if (r) w.page.drawText(r, { x: w.margin + w.width - rw, y: top - lh(size), size, font: w.fonts.regular, color: PDF_ATS_INK });
  };
  const para = (segs: { text: string; bold?: boolean }[], o: { size?: number; gap?: number; center?: boolean } = {}) =>
    w.rich(segs, { size: o.size ?? bodyPt, justify: false, center: o.center, gap: o.gap ?? 0, color: PDF_ATS_INK, leading: 1.3 });
  const heading = (title: string, first: boolean) => {
    w.ensure(60);
    w.y -= first ? 10 : 14;
    const size = bodyPt + 0.5;
    const base = w.y - size;
    w.label(title.toUpperCase(), { y: base, size, bold: true, color: PDF_ATS_INK, tracking: 0.5 });
    w.page.drawLine({ start: { x: w.margin, y: base - 3.5 }, end: { x: w.margin + w.width, y: base - 3.5 }, thickness: 0.6, color: PDF_ATS_RULE });
    w.y = base - 9;
  };
  const header = (r: ResumeContent, o: { headline?: boolean } = {}) => {
    const center = a.align === "center";
    para([{ text: r.fullName, bold: true }], { size: 19, center, gap: 2 });
    if (o.headline !== false) para([{ text: resumeHeadline(r) }], { size: bodyPt + 0.5, center, gap: 1 });
    const contact = contactParts(r);
    if (contact.length) para([{ text: contact.join("  |  ") }], { size: bodyPt - 1, center });
  };
  return { row, para, heading, header };
}

async function atsResumePdf(r: ResumeContent, a: AtsSpec): Promise<Uint8Array> {
  const { doc, fonts } = await newPdf(a.serif);
  doc.setTitle(`${r.fullName} - Resume`);
  doc.setAuthor(r.fullName);
  doc.setSubject(resumeHeadline(r));
  const BODY = 10;
  const w = new PdfWriter(doc, fonts, 43); // 0.6"
  const k = atsPdfKit(w, a, BODY);
  k.header(r);
  let first = true;
  const section = (title: string) => {
    k.heading(title, first);
    first = false;
  };
  if (r.summary) {
    section(ATS_SECTIONS.summary);
    k.para([{ text: r.summary }]);
  }
  const skills = atsSkillLines(r);
  if (skills.length) {
    section(ATS_SECTIONS.skills);
    for (const s of skills) k.para(s.label ? [{ text: `${s.label}: `, bold: true }, { text: s.items }] : [{ text: s.items }], { gap: 1.5 });
  }
  if (r.experience.length) {
    section(ATS_SECTIONS.experience);
    r.experience.forEach((e, i) => {
      if (i) w.y -= 6;
      w.ensure(52);
      k.row([{ text: e.title, bold: true }], formatRange(e.startDate, e.endDate, !e.endDate));
      const company = atsCompanyLine(e);
      if (company) k.para([{ text: company }], { gap: 2.5 });
      if (e.description) k.para([{ text: e.description }], { gap: 1 });
      for (const b of e.bullets) w.bullet(b, BODY, PDF_ATS_INK, false);
    });
  }
  if (r.projects?.length) {
    section(ATS_SECTIONS.projects);
    r.projects.forEach((pr, i) => {
      if (i) w.y -= 6;
      w.ensure(44);
      const stack = pr.techStack?.length ? pr.techStack.join(", ") : "";
      k.para([{ text: pr.name, bold: true }, ...(stack ? [{ text: `  |  ${stack}` }] : [])], { gap: 1 });
      if (pr.description) k.para([{ text: pr.description }], { gap: 1.5 });
      for (const b of pr.bullets) w.bullet(b, BODY, PDF_ATS_INK, false);
    });
  }
  if (r.education.length) {
    section(ATS_SECTIONS.education);
    r.education.forEach((e, i) => {
      if (i) w.y -= 5;
      k.row([{ text: e.university, bold: true }], atsEducationDate(e));
      const deg = [e.degree, e.field].filter(Boolean).join(", ");
      if (deg) k.para([{ text: deg }]);
    });
  }
  return doc.save();
}

async function atsLetterPdf(app: AppDocSource, a: AtsSpec): Promise<Uint8Array> {
  const { doc, fonts } = await newPdf(a.serif);
  doc.setTitle(`${app.resume.fullName} - Cover Letter`);
  doc.setAuthor(app.resume.fullName);
  const SIZE = 11;
  const w = new PdfWriter(doc, fonts, 72); // 1"
  const k = atsPdfKit(w, a, SIZE);
  k.header(app.resume, { headline: false });
  w.y -= 6;
  w.page.drawLine({ start: { x: w.margin, y: w.y }, end: { x: w.margin + w.width, y: w.y }, thickness: 0.6, color: PDF_ATS_RULE });
  const { recipient, subject, salutation, body, closing } = atsLetterParts(app);
  const blank = () => (w.y -= SIZE * 1.15);
  w.y -= 18;
  k.para([{ text: letterDate(app) }]);
  blank();
  recipient.forEach((l) => k.para([{ text: l }]));
  blank();
  if (subject) {
    k.para([{ text: subject, bold: true }]);
    blank();
  }
  if (salutation) {
    k.para([{ text: salutation }]);
    w.y -= 8;
  }
  for (const t of body) k.para([{ text: t }], { gap: 9 });
  closing.forEach((c, i) => {
    k.para([{ text: c }]);
    if (i === 0 && closing.length > 1) w.y -= 22; // room for a signature
  });
  return doc.save();
}

/* ------------------------------------------------------------------- ZIP */

export async function addApplicationToZip(zip: JSZip, app: AppDocSource, folder = "", resumeOnly = false) {
  const base = baseFileName(app);
  const dir = folder ? zip.folder(folder)! : zip;
  if (resumeOnly) {
    const [rDocx, rPdf] = await Promise.all([resumeDocx(app.resume, app.resumeDesign), resumePdf(app.resume, app.resumeDesign)]);
    dir.file(`${base}_Resume.docx`, rDocx);
    dir.file(`${base}_Resume.pdf`, rPdf);
    return;
  }
  const [rDocx, rPdf, cDocx, cPdf, jdDocx] = await Promise.all([
    resumeDocx(app.resume, app.resumeDesign),
    resumePdf(app.resume, app.resumeDesign),
    coverLetterDocx(app),
    coverLetterPdf(app),
    jobDescriptionDocx(app),
  ]);
  dir.file(`${base}_Resume.docx`, rDocx);
  dir.file(`${base}_Resume.pdf`, rPdf);
  dir.file(`${base}_Cover_Letter.docx`, cDocx);
  dir.file(`${base}_Cover_Letter.pdf`, cPdf);
  dir.file(`${base}_Job_Description.docx`, jdDocx);
}

export async function applicationZip(app: AppDocSource) {
  const zip = new JSZip();
  await addApplicationToZip(zip, app);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

export function zipResponse(data: Uint8Array, filename: string) {
  return new Response(data as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
