import { NextResponse } from "next/server";
import { handler, HttpError, requireUser } from "@/lib/auth";
import { Message, MessageRead } from "@/lib/models/Message";
import { oid } from "@/lib/query";

/** Marks one notification read for the signed-in user (first read time is kept). */
export const POST = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const id = oid((await params).id);
  if (!(await Message.exists({ _id: id, recipients: user._id }))) throw new HttpError(404, "Notification not found");
  await MessageRead.updateOne({ message: id, user: user._id }, { $setOnInsert: { at: new Date() } }, { upsert: true });
  return NextResponse.json({ ok: true });
});
