import { NextResponse } from "next/server";
import { handler, HttpError, requireUser } from "@/lib/auth";
import { Feedback } from "@/lib/models/Feedback";
import { Message } from "@/lib/models/Message";
import { oid } from "@/lib/query";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Admin: PATCH { status?, reply?, seen? }.
 * A reply is also delivered to the sender as an in-app notification.
 */
export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const admin = await requireUser("admin");
  const fb = await Feedback.findById(oid((await params).id));
  if (!fb) throw new HttpError(404, "Feedback not found");
  const b = await req.json();
  if (b.seen && !fb.seenAt) fb.seenAt = new Date();
  if (b.status !== undefined) {
    if (!["new", "in_progress", "resolved"].includes(b.status)) throw new HttpError(400, "Invalid status");
    fb.status = b.status;
  }
  const reply = String(b.reply ?? "").trim().slice(0, 5000);
  if (reply) {
    fb.replies.push({ by: admin._id, byName: admin.name, message: reply, at: new Date() });
    if (fb.status === "new") fb.status = "in_progress";
    if (!fb.seenAt) fb.seenAt = new Date();
    await Message.create({
      title: `Reply to your feedback: ${fb.subject}`,
      body: reply,
      audience: { roles: [], users: [fb.user] },
      recipients: [fb.user],
      email: false,
      sender: admin._id,
      senderName: admin.name,
    });
  }
  await fb.save();
  return NextResponse.json({ ok: true });
});

/** The sender or an admin can delete feedback. */
export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const fb = await Feedback.findById(oid((await params).id));
  if (!fb || (user.role !== "admin" && String(fb.user) !== String(user._id))) throw new HttpError(404, "Feedback not found");
  await fb.deleteOne();
  return NextResponse.json({ ok: true });
});
