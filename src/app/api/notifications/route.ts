import { NextResponse } from "next/server";
import { handler, requireUser } from "@/lib/auth";
import { Message, MessageRead } from "@/lib/models/Message";

/** The signed-in user's notifications (newest first) with read flags and the unread count. ?limit= (default 50). */
export const GET = handler(async (req: Request) => {
  const user = await requireUser();
  const limit = Math.min(500, Math.max(1, Number(new URL(req.url).searchParams.get("limit")) || 50));
  // One parallel batch: this is polled by every open page, so each sequential round trip adds up.
  const [messages, total, reads, all] = await Promise.all([
    Message.find({ recipients: user._id }).select("title body images senderName createdAt").sort({ createdAt: -1 }).limit(limit).lean(),
    Message.countDocuments({ recipients: user._id }),
    MessageRead.find({ user: user._id }).select("message").lean(),
    Message.find({ recipients: user._id }).select("_id").lean(),
  ]);
  const readIds = new Set(reads.map((r) => String(r.message)));
  const allIds = all.map((m) => String(m._id));
  return NextResponse.json({
    items: messages.map((m) => ({ ...m, _id: String(m._id), read: readIds.has(String(m._id)) })),
    total,
    unread: allIds.filter((id) => !readIds.has(id)).length,
  });
});
