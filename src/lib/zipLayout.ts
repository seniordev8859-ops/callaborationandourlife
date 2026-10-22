import type { Types } from "mongoose";
import { Profile } from "./models/Profile";
import { getSettings } from "./models/Settings";
import { safeName, type AppDocSource } from "./documents";
import { dayKey } from "./tz";

type Source = AppDocSource & { profile?: unknown; profileLabel?: string | null };

const idOf = (p: unknown) => String(p && typeof p === "object" && "_id" in p ? (p as { _id: unknown })._id : (p ?? ""));

/**
 * ZIP folder per application: "[Date]/[Profile Name]/[Company Name]/[Job Title]", e.g. "2026-10-21/Jane_Doe/Acme_Corp/Backend_Engineer".
 * Date is the generation day in the report time zone (Settings). A second application landing in the same folder gets "_2".
 */
export async function applicationFolders(apps: Source[]): Promise<Map<string, string>> {
  const tz = (await getSettings()).reportTimezone || "America/New_York";
  const profileIds = [...new Set(apps.map((a) => idOf(a.profile)).filter(Boolean))];
  const labels = new Map(
    (await Profile.find({ _id: { $in: profileIds } }).select("label").lean<{ _id: Types.ObjectId; label: string }[]>()).map((p) => [String(p._id), p.label])
  );

  const folders = new Map<string, string>();
  const used = new Set<string>();
  for (const a of apps) {
    const day = dayKey(new Date(a.createdAt ?? Date.now()), tz);
    const profile = safeName(labels.get(idOf(a.profile)) || a.profileLabel || "Profile");
    const company = safeName(a.company || "Company");
    const title = safeName(a.jobTitle || "Role");
    const base = `${day}/${profile}/${company}/${title}`;
    let folder = base;
    for (let n = 2; used.has(folder); n++) folder = `${base}_${n}`;
    used.add(folder);
    folders.set(String(a._id), folder);
  }
  return folders;
}

/** File name base for a single file outside a ZIP: the folder flattened, e.g. "2026-10-21_Jane_Doe_Acme_Corp_Backend_Engineer". */
export async function applicationFileBases(apps: Source[]): Promise<Map<string, string>> {
  const folders = await applicationFolders(apps);
  return new Map([...folders].map(([id, folder]) => [id, folder.replace(/\//g, "_")]));
}
