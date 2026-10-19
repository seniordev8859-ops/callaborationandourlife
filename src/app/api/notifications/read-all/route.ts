import { NextResponse } from "next/server";
import { handler, requireUser } from "@/lib/auth";
import { Message, MessageRead } from "@/lib/models/Message";

/** Marks every notification read for the signed-in user. */
export const POST = handler(async () => {
  const user = await requireUser();
  const ids = (await Message.find({ recipients: user._id }).select("_id").lean()).map((m) => m._id);
  if (ids.length)
    await MessageRead.bulkWrite(
      ids.map((message) => ({ updateOne: { filter: { message, user: user._id }, update: { $setOnInsert: { at: new Date() } }, upsert: true } })),
      { ordered: false }
    );
  return NextResponse.json({ ok: true, count: ids.length });
});
