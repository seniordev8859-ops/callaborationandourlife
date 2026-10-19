/** "linkedin.com/in/x" → "https://linkedin.com/in/x" (leaves full URLs and empty values alone). */
export function normalizeUrl(v: string) {
  const t = (v || "").trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(t) || t.startsWith("www.")) return `https://${t}`;
  return t;
}

/** Display form for documents: no scheme, no "www.", no trailing slash. */
export function displayUrl(v: string) {
  return (v || "").trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
}

export const URL_FIELDS = ["linkedin", "github", "website", "portfolio"] as const;
