// Client-safe resume / cover letter design definitions, shared by the HTML preview, DOCX and PDF renderers.

export const DESIGN_IDS = ["ats", "ats-serif", "standard", "classic", "modern", "executive", "professional", "elegant", "banner"] as const;
export type DesignId = (typeof DESIGN_IDS)[number];
/** New profiles start with ATS Clean (the ATS-safe US layout); records without a design keep the original Standard layout. */
export const DEFAULT_DESIGN: DesignId = "ats";

/**
 * ATS-safe US layouts: one column, black text, standard section names, left-aligned body, dates flush right
 * on the role line, skills grouped by category, real text everywhere (no tables, text boxes, columns or images).
 */
export type AtsSpec = {
  id: "ats" | "ats-serif";
  docxFont: string;
  cssFont: string;
  serif: boolean;
  /** Name block alignment. */
  align: "left" | "center";
};
export const ATS_SPECS: Record<AtsSpec["id"], AtsSpec> = {
  ats: { id: "ats", docxFont: "Calibri", cssFont: "Calibri, Carlito, 'Segoe UI', Arial, sans-serif", serif: false, align: "left" },
  "ats-serif": { id: "ats-serif", docxFont: "Georgia", cssFont: "Georgia, 'Times New Roman', serif", serif: true, align: "center" },
};
/** The ATS layout for a stored design id, or null for the other designs. */
export function atsSpec(id: unknown): AtsSpec | null {
  return id === "ats" || id === "ats-serif" ? ATS_SPECS[id] : null;
}

/** Colours are hex without "#" (DOCX format); the HTML preview adds it. */
export type DesignSpec = {
  id: Exclude<DesignId, "standard" | "ats" | "ats-serif">;
  docxFont: string;
  cssFont: string;
  /** PDF uses the matching standard font: Times for serif designs, Helvetica otherwise. */
  serif: boolean;
  ink: string;
  muted: string;
  accent: string;
  rule: string;
  /** Header (name / headline / contact) alignment. */
  align: "left" | "center";
  /** Name in letter-spaced capitals. */
  nameCaps: boolean;
  headingCase: "upper" | "smallcaps";
  headingAlign: "left" | "center";
  /** "rule" = line under the title; "bar" = tinted band with an accent edge. */
  headingDecor: "rule" | "bar";
  barFill?: string;
  /** Dark header band behind name / headline / contact. */
  banner?: { fill: string; text: string; muted: string };
  /** Separator under the cover letter header. */
  letterRule: "thin" | "thick" | "double";
};

export type DesignInfo = { id: DesignId; name: string; resumeBlurb: string; letterBlurb: string };

export const DESIGNS: DesignInfo[] = [
  {
    id: "ats",
    name: "ATS Clean",
    resumeBlurb: "Recommended for US applications. Single column, black text, dates on the right, skills by category.",
    letterBlurb: "US business letter: header, date, recipient, subject line and left-aligned paragraphs.",
  },
  {
    id: "ats-serif",
    name: "ATS Traditional",
    resumeBlurb: "The same ATS-safe structure in Georgia serif with a centered name. Formal and easy to read.",
    letterBlurb: "The traditional serif version of the US business letter.",
  },
  {
    id: "standard",
    name: "Standard",
    resumeBlurb: "The original TailorBid layout: centered header, large black headings, justified text.",
    letterBlurb: "Just the letter, no letterhead. The original TailorBid format.",
  },
  { id: "classic", name: "Classic", resumeBlurb: "Black on white, crisp rules. The safest choice for any company.", letterBlurb: "Black on white with a simple letterhead and a thin rule." },
  { id: "modern", name: "Modern", resumeBlurb: "Navy accents and a bold name. Clean and current.", letterBlurb: "Navy name and a bold rule under the letterhead." },
  { id: "executive", name: "Executive", resumeBlurb: "Serif type and a centered header. Formal and senior.", letterBlurb: "Centered serif letterhead with a double rule." },
  { id: "professional", name: "Professional", resumeBlurb: "Deep indigo with tinted section bars. Polished and modern.", letterBlurb: "Indigo letterhead with a clean rule." },
  { id: "elegant", name: "Elegant", resumeBlurb: "Garamond serif with bronze accents, centered. Refined and classic.", letterBlurb: "Centered Garamond letterhead in bronze." },
  { id: "banner", name: "Banner", resumeBlurb: "A dark header band with teal headings. Confident and memorable.", letterBlurb: "The dark header band across the top of the letter." },
];

const SANS_CSS = "Calibri, Carlito, 'Segoe UI', Arial, sans-serif";

export const DESIGN_SPECS: Record<DesignSpec["id"], DesignSpec> = {
  classic: {
    id: "classic", docxFont: "Calibri", cssFont: SANS_CSS, serif: false,
    ink: "000000", muted: "333333", accent: "000000", rule: "555555",
    align: "left", nameCaps: false, headingCase: "upper", headingAlign: "left", headingDecor: "rule", letterRule: "thin",
  },
  modern: {
    id: "modern", docxFont: "Calibri", cssFont: SANS_CSS, serif: false,
    ink: "1F2937", muted: "4B5563", accent: "1E3A5F", rule: "1E3A5F",
    align: "left", nameCaps: false, headingCase: "upper", headingAlign: "left", headingDecor: "rule", letterRule: "thick",
  },
  executive: {
    id: "executive", docxFont: "Cambria", cssFont: "Cambria, Georgia, 'Times New Roman', serif", serif: true,
    ink: "111111", muted: "444444", accent: "111111", rule: "333333",
    align: "center", nameCaps: true, headingCase: "smallcaps", headingAlign: "left", headingDecor: "rule", letterRule: "double",
  },
  professional: {
    id: "professional", docxFont: "Calibri", cssFont: SANS_CSS, serif: false,
    ink: "1F2937", muted: "4338CA", accent: "3730A3", rule: "3730A3", barFill: "EEF0FB",
    align: "left", nameCaps: false, headingCase: "upper", headingAlign: "left", headingDecor: "bar", letterRule: "thin",
  },
  elegant: {
    id: "elegant", docxFont: "Garamond", cssFont: "Garamond, 'EB Garamond', 'Times New Roman', serif", serif: true,
    ink: "1A1A1A", muted: "6B5418", accent: "7A5C14", rule: "C9B37E",
    align: "center", nameCaps: true, headingCase: "smallcaps", headingAlign: "center", headingDecor: "rule", letterRule: "thin",
  },
  banner: {
    id: "banner", docxFont: "Calibri", cssFont: SANS_CSS, serif: false,
    ink: "1F2937", muted: "4B5563", accent: "0F766E", rule: "0F766E",
    banner: { fill: "1E293B", text: "FFFFFF", muted: "CBD5E1" },
    align: "left", nameCaps: false, headingCase: "upper", headingAlign: "left", headingDecor: "rule", letterRule: "thin",
  },
};

export function isDesignId(v: unknown): v is DesignId {
  return typeof v === "string" && (DESIGN_IDS as readonly string[]).includes(v);
}

/** The styled spec for a stored design id; null = the Standard layout (also for missing / unknown ids). */
export function designSpec(id: unknown): DesignSpec | null {
  return isDesignId(id) && id !== "standard" && !atsSpec(id) ? DESIGN_SPECS[id as DesignSpec["id"]] : null;
}
