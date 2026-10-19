// In-app notifications for events (models/Notice.ts). Sent next to the event's email, but always: they don't
// depend on email being set up. Shown in the bell, as a toast when they arrive, and on Notifications.
import type { Types } from "mongoose";
import { Notice } from "./models/Notice";

export type NoticeKind =
  | "interview-request"
  | "interview-scheduled"
  | "interview-open"
  | "interview-result"
  | "interview-cancelled"
  | "interview-overdue"
  | "interview-reminder"
  | "interview-report-due"
  | "interview-digest"
  | "assignment"
  | "account-signup"
  | "account-status"
  | "feedback-new"
  | "feedback-reply"
  | "milestone";
export type NoticeTone = "info" | "success" | "warning" | "danger";
export type NoticeInput = { kind: NoticeKind; tone?: NoticeTone; title: string; body?: string; url?: string };

type Recipient = Types.ObjectId | string | { _id: Types.ObjectId | string };
const idOf = (r: Recipient) => String(typeof r === "object" && "_id" in r ? r._id : r);

/** Creates the notification for each recipient (each person once). Never throws: an event must not fail over it. */
export async function notify(recipients: Recipient[], n: NoticeInput) {
  try {
    const users = [...new Set(recipients.filter(Boolean).map(idOf))];
    if (!users.length) return;
    await Notice.insertMany(
      users.map((user) => ({ user, kind: n.kind, tone: n.tone ?? "info", title: n.title.slice(0, 200), body: (n.body ?? "").slice(0, 1000), url: n.url ?? "" })),
      { ordered: false }
    );
  } catch (e) {
    console.error("in-app notification failed", e);
  }
}

/** Several notifications, each to its own people (e.g. the same event worded per recipient). */
export async function notifyEach(items: { to: Recipient[]; n: NoticeInput }[]) {
  await Promise.all(items.map((i) => notify(i.to, i.n)));
}
