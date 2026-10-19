import JSZip from "jszip";
import { handler, HttpError, profileScope, requireUser } from "@/lib/auth";
import { Application } from "@/lib/models/Application";
import { addApplicationToZip, applicationLabel, zipResponse, type AppDocSource } from "@/lib/documents";
import { oid } from "@/lib/query";

export const maxDuration = 60;

const MAX_SELECTED = 100;

/**
 * POST { ids: string[], content?: "all" | "resume" } → one ZIP with a folder per selected application.
 * "all" (default): resume PDF + DOCX, cover letter PDF + DOCX and job description DOCX; "resume": resumes only.
 * Bidders get their own applications; users (managers) those of their profiles; admins any.
 */
export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  const body = await req.json();
  const ids = [...new Set(((body.ids as string[]) ?? []).map((id) => String(oid(id, "application"))))];
  if (!ids.length) throw new HttpError(400, "Select at least one application");
  if (ids.length > MAX_SELECTED) throw new HttpError(400, `Select ${MAX_SELECTED} applications or fewer per download`);
  const resumeOnly = body.content === "resume";

  const access: Record<string, unknown> =
    user.role === "admin"
      ? {}
      : user.role === "user"
        ? { $or: [{ user: user._id, deletedByUser: false }, { profile: { $in: profileScope(user) ?? [] } }] }
        : { user: user._id, deletedByUser: false };
  const apps = await Application.find({ _id: { $in: ids }, status: { $ne: "not_generated" }, resume: { $ne: null }, ...access })
    .sort({ createdAt: -1 })
    .lean<AppDocSource[]>();
  if (!apps.length) throw new HttpError(404, "None of the selected applications have generated documents");

  const zip = new JSZip();
  const used = new Set<string>();
  for (const app of apps) {
    let folder = applicationLabel(app);
    for (let i = 2; used.has(folder); i++) folder = `${applicationLabel(app)} (${i})`;
    used.add(folder);
    await addApplicationToZip(zip, app, folder, resumeOnly);
  }
  const data = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  const stamp = new Date().toISOString().slice(0, 10);
  return zipResponse(data, `${stamp}-${resumeOnly ? "resumes" : "applications"}-${apps.length}.zip`);
});
