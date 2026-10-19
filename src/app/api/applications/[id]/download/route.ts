import { canManageProfile, handler, HttpError, requireUser } from "@/lib/auth";
import { Application } from "@/lib/models/Application";
import { applicationZip, baseFileName, resumePdf, zipFileName, zipResponse, type AppDocSource } from "@/lib/documents";
import { oid } from "@/lib/query";

/** ZIP of all documents, or `?format=resume-pdf` for just the resume PDF. */
export const GET = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const app = await Application.findById(oid((await params).id)).lean<
    AppDocSource & { user: unknown; profile: unknown; deletedByUser: boolean }
  >();
  const isOwner = app && String(app.user) === String(user._id) && !app.deletedByUser;
  const isRep = app && user.role === "user" && canManageProfile(user, app.profile);
  if (!app || (!isOwner && !isRep && user.role !== "admin")) throw new HttpError(404, "Application not found");
  if (!app.resume) throw new HttpError(400, "This application has not been generated yet. Add the job description first.");

  if (new URL(req.url).searchParams.get("format") === "resume-pdf") {
    const name = `${baseFileName(app)}_Resume.pdf`;
    return new Response((await resumePdf(app.resume, app.resumeDesign)) as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "no-store",
      },
    });
  }
  return zipResponse(await applicationZip(app), zipFileName(app));
});
