import type { Types } from "mongoose";
import { InterviewRequest } from "./models/InterviewRequest";
import { User } from "./models/User";
import { Settings, getSettings } from "./models/Settings";
import { claim } from "./models/NotificationLog";
import { appUrl, sendEmail } from "./email";
import { companyKey } from "./company";
import { APP_TZ, dayKey, dayRange, formatDateTime, formatDayLong, formatTime, isValidTimeZone, localHour, zoneName } from "./tz";
import {
  interviewAcceptedEmail,
  interviewAssignedEmail,
  interviewCancelledEmail,
  interviewDigestEmail,
  interviewOpenEmail,
  interviewOverdueEmail,
  interviewReminderEmail,
  interviewReportEmail,
  interviewReportReminderEmail,
  interviewRequestEmail,
  type InterviewDetails,
} from "./interviewEmails";

type Person = { _id: Types.ObjectId; name: string; email: string; role?: string; timezone?: string; callerSettings?: { timezone?: string; reminderMinutes?: number; digestHour?: number } | null };

/** A request with profile / requestedBy / caller populated (see `loadRequest`). */
type Loaded = {
  _id: Types.ObjectId;
  profile: { _id: Types.ObjectId; label: string; fullName?: string } | null;
  profileLabel: string;
  requestedBy: Person | null;
  caller: Person | null;
  company: string;
  jobTitle: string;
  step: number;
  lockedCaller: boolean;
  report?: { outcome?: string; recordingUrl?: string; summary?: string } | null;
  mode: string;
  windowStart: Date;
  windowEnd?: Date | null;
  timezone: string;
  durationMinutes: number;
  notes: string;
  screenshots: { url?: string | null }[];
  status: string;
  scheduledAt?: Date | null;
  callerNote: string;
  scheduleBy: Date;
  events?: { action?: string | null }[];
};

const PERSON = "name email role timezone callerSettings";

export async function loadRequest(id: Types.ObjectId | string) {
  return InterviewRequest.findById(id)
    .populate("profile", "label fullName")
    .populate("requestedBy", PERSON)
    .populate("caller", PERSON)
    .lean<Loaded>();
}

const tzOr = (tz: string | undefined | null, fallback: string) => (tz && isValidTimeZone(tz) ? tz : fallback);
/** A caller's own zone (set by an admin), else the default (GMT-04:00). Everyone else uses the default. */
export const callerTimezone = (c: Person | null | undefined, site: string) => tzOr(c?.timezone, site);

export function fmtWhen(d: Date, tz: string) {
  return `${formatDateTime(d, tz)} (${zoneName(tz, d)})`;
}

/** The requested time or window, e.g. "2026-10-02 (Thu) 15:00 – 17:00 (GMT-04:00)". */
export function describeRequested(r: { mode: string; windowStart: Date; windowEnd?: Date | null }, tz: string) {
  const start = new Date(r.windowStart);
  if (r.mode !== "range" || !r.windowEnd) return fmtWhen(start, tz);
  const end = new Date(r.windowEnd);
  return dayKey(start, tz) === dayKey(end, tz)
    ? `${formatDateTime(start, tz)} – ${formatTime(end, tz)} (${zoneName(tz, start)})`
    : `${formatDateTime(start, tz)} – ${formatDateTime(end, tz)} (${zoneName(tz, start)})`;
}

function details(r: Loaded, tz: string): InterviewDetails {
  const booked = r.status === "scheduled" || r.status === "completed";
  return {
    step: r.step ?? 1,
    locked: r.lockedCaller,
    profile: r.profile?.label ?? r.profileLabel ?? "Profile",
    company: r.company,
    jobTitle: r.jobTitle,
    bidder: r.requestedBy?.name ?? "A bidder",
    // Booked directly onto the calendar (admin, profile manager or caller), not requested by a bidder.
    bidderLabel: r.events?.[0]?.action === "scheduled" ? "Scheduled by" : undefined,
    requested: describeRequested(r, tz),
    duration: r.durationMinutes,
    notes: r.notes,
    scheduled: booked && r.scheduledAt ? fmtWhen(new Date(r.scheduledAt), tz) : undefined,
    caller: booked || r.lockedCaller ? r.caller?.name : undefined,
    callerNote: booked ? r.callerNote : undefined,
    screenshots: r.screenshots.map((s) => s.url ?? "").filter(Boolean),
  };
}

const link = (path: string, id: unknown) => `${appUrl()}${path}?id=${id}`;

/** Bidder + users managing the profile + admins (the "responsible" people for a request). */
async function responsible(r: Loaded) {
  const staff = await User.find({
    status: "approved",
    $or: [{ role: "admin" }, { role: "user", managedProfiles: r.profile?._id }],
  })
    .select(PERSON)
    .lean<Person[]>();
  const people = [...(r.requestedBy ? [{ ...r.requestedBy, role: "bidder" }] : []), ...staff];
  const seen = new Set<string>();
  return people.filter((p) => p.email && !seen.has(p.email) && seen.add(p.email));
}

/** Staff open the admin calendar; the requester opens their own request list. */
const pageFor = (p: Person, r: Loaded) => (r.requestedBy && String(p._id) === String(r.requestedBy._id) ? "/interviews" : "/admin/interviews");
const tzFor = (_p: Person, _r: Loaded, site: string) => site;

async function siteTz() {
  return APP_TZ;
}

/* ------------------------------------------------------------ event emails */

/** New request → the chosen caller. */
export async function notifyNewRequest(id: Types.ObjectId | string) {
  try {
    const r = await loadRequest(id);
    if (!r?.caller) return;
    const tz = callerTimezone(r.caller, await siteTz());
    await sendEmail(
      r.caller.email,
      interviewRequestEmail({ name: r.caller.name, d: details(r, tz), deadline: fmtWhen(new Date(r.scheduleBy), tz), url: link("/caller/requests", r._id) })
    );
  } catch (e) {
    console.error("interview request email failed", e);
  }
}

/** Booked directly onto a caller's calendar (admin, profile manager or another caller) → that caller. */
export async function notifyAdminScheduled(id: Types.ObjectId | string, updated = false) {
  try {
    const r = await loadRequest(id);
    if (!r?.caller || r.status !== "scheduled") return;
    const tz = callerTimezone(r.caller, await siteTz());
    await sendEmail(
      r.caller.email,
      interviewAssignedEmail({ name: r.caller.name, by: r.requestedBy?.name ?? "An admin", d: details(r, tz), url: link("/caller/schedule", r._id), updated })
    );
  } catch (e) {
    console.error("admin-scheduled interview email failed", e);
  }
}

/** Transfer → every other active caller. */
export async function notifyOpen(id: Types.ObjectId | string, from: { id: string; name: string }, reason: string) {
  try {
    const r = await loadRequest(id);
    if (!r || r.status !== "open") return;
    const site = await siteTz();
    const callers = await User.find({ role: "caller", status: "approved", _id: { $ne: from.id } }).select(PERSON).lean<Person[]>();
    await Promise.all(
      callers.map((c) =>
        sendEmail(c.email, interviewOpenEmail({ name: c.name, from: from.name, reason, d: details(r, callerTimezone(c, site)), url: link("/caller/requests", r._id) }))
      )
    );
  } catch (e) {
    console.error("open interview emails failed", e);
  }
}

/** Accepted / rescheduled → bidder, the profile's users and admins. */
export async function notifyAccepted(id: Types.ObjectId | string, rescheduled = false) {
  try {
    const r = await loadRequest(id);
    if (!r || r.status !== "scheduled") return;
    const site = await siteTz();
    const people = await responsible(r);
    await Promise.all(
      people
        .filter((p) => String(p._id) !== String(r.caller?._id))
        .map((p) => sendEmail(p.email, interviewAcceptedEmail({ name: p.name, d: details(r, tzFor(p, r, site)), rescheduled, url: link(pageFor(p, r), r._id) })))
    );
  } catch (e) {
    console.error("interview accepted emails failed", e);
  }
}

/** Result reported → bidder, the profile's users and admins. */
export async function notifyReported(id: Types.ObjectId | string) {
  try {
    const r = await loadRequest(id);
    if (!r || r.status !== "completed" || !r.report?.outcome) return;
    const site = await siteTz();
    const people = await responsible(r);
    await Promise.all(
      people
        .filter((p) => String(p._id) !== String(r.caller?._id))
        .map((p) =>
          sendEmail(
            p.email,
            interviewReportEmail({
              name: p.name,
              d: details(r, tzFor(p, r, site)),
              outcome: r.report!.outcome!,
              recordingUrl: r.report!.recordingUrl ?? "",
              summary: r.report!.summary ?? "",
              interviewerName: (r.report as { interviewerName?: string }).interviewerName ?? "",
              interviewerCallerId: (r.report as { interviewerCallerId?: string }).interviewerCallerId ?? "",
              url: link(pageFor(p, r), r._id),
            })
          )
        )
    );
  } catch (e) {
    console.error("interview report emails failed", e);
  }
}

/** Cancelled → the caller who had it (if any). */
export async function notifyCancelled(id: Types.ObjectId | string, callerId: Types.ObjectId | string | null, by: string, reason: string) {
  try {
    if (!callerId) return;
    const [r, caller] = await Promise.all([loadRequest(id), User.findById(callerId).select(PERSON).lean<Person>()]);
    if (!r || !caller) return;
    const tz = callerTimezone(caller, await siteTz());
    await sendEmail(caller.email, interviewCancelledEmail({ name: caller.name, by, reason, d: details(r, tz), url: link("/caller/requests", r._id) }));
  } catch (e) {
    console.error("interview cancelled email failed", e);
  }
}

/* ------------------------------------------------------------ timed sweep */

export type SweepResult = { overdue: number; reminders: number; digests: number; reportReminders: number };

/**
 * Time-based interview emails. Safe to run often: every send is guarded (atomic flag or NotificationLog claim).
 * - Overdue: pending/open requests past `scheduleBy` → bidder, the profile's users and admins (once).
 * - Reminder: `reminderMinutes` before each scheduled interview → the caller (once per scheduled time).
 * - Digest: at the caller's `digestHour` (their timezone), tomorrow's interviews → the caller (once per day).
 */
export async function runInterviewSweep(now = new Date()): Promise<SweepResult> {
  const settings = await getSettings();
  const site = APP_TZ;
  const hours = settings.interviewScheduleHours ?? 3;
  const result: SweepResult = { overdue: 0, reminders: 0, digests: 0, reportReminders: 0 };

  // 1. Not scheduled in time.
  const late = await InterviewRequest.find({ status: { $in: ["pending", "open"] }, scheduleBy: { $lte: now }, overdueNotifiedAt: null }).select("_id").lean();
  for (const { _id } of late) {
    const flagged = await InterviewRequest.updateOne({ _id, overdueNotifiedAt: null, status: { $in: ["pending", "open"] } }, { $set: { overdueNotifiedAt: now } });
    if (!flagged.modifiedCount) continue;
    const r = await loadRequest(_id);
    if (!r) continue;
    const callerName = r.status === "pending" ? r.caller?.name ?? null : null;
    const people = await responsible(r);
    await Promise.all(
      people.map((p) =>
        sendEmail(p.email, interviewOverdueEmail({ name: p.name, caller: callerName, hours, d: details(r, tzFor(p, r, site)), url: link(pageFor(p, r), r._id) }))
      )
    );
    result.overdue++;
  }

  // 2. Reminder before each interview (lead time per caller, max 24 h).
  const soon = await InterviewRequest.find({ status: "scheduled", scheduledAt: { $gt: now, $lte: new Date(now.getTime() + 24 * 3600_000) } })
    .select("_id caller scheduledAt")
    .lean();
  const callerIds = [...new Set(soon.map((x) => String(x.caller)))];
  const callers = new Map(
    (await User.find({ _id: { $in: callerIds } }).select(PERSON).lean<Person[]>()).map((c) => [String(c._id), c])
  );
  for (const s of soon) {
    const c = callers.get(String(s.caller));
    const lead = c?.callerSettings?.reminderMinutes ?? 60;
    if (!c || lead <= 0 || now.getTime() < new Date(s.scheduledAt!).getTime() - lead * 60_000) continue;
    if (!(await claim(`iv-remind:${s._id}:${new Date(s.scheduledAt!).getTime()}`, "interview-reminder"))) continue;
    const r = await loadRequest(s._id);
    if (!r || r.status !== "scheduled") continue;
    await sendEmail(c.email, interviewReminderEmail({ name: c.name, minutes: lead, d: details(r, callerTimezone(c, site)), url: link("/caller/schedule", r._id) }));
    result.reminders++;
  }

  // 2b. Result not reported an hour after the interview ended → remind the caller (once).
  const unreported = await InterviewRequest.find({ status: "scheduled", reportReminderAt: null, scheduledAt: { $lte: new Date(now.getTime() - 3600_000) } })
    .select("_id scheduledAt durationMinutes")
    .lean();
  for (const u of unreported) {
    if (new Date(u.scheduledAt!).getTime() + (u.durationMinutes ?? 60) * 60_000 + 3600_000 > now.getTime()) continue;
    const flagged = await InterviewRequest.updateOne({ _id: u._id, reportReminderAt: null, status: "scheduled" }, { $set: { reportReminderAt: now } });
    if (!flagged.modifiedCount) continue;
    const r = await loadRequest(u._id);
    if (!r?.caller) continue;
    await sendEmail(r.caller.email, interviewReportReminderEmail({ name: r.caller.name, d: details(r, callerTimezone(r.caller, site)), url: link("/caller/requests", r._id) }));
    result.reportReminders++;
  }

  // 3. Tomorrow's schedule, emailed the day before at the caller's digest hour.
  const upcoming = await InterviewRequest.distinct("caller", { status: "scheduled", scheduledAt: { $gt: now, $lte: new Date(now.getTime() + 50 * 3600_000) } });
  const digestCallers = await User.find({ _id: { $in: upcoming }, role: "caller", status: "approved" }).select(PERSON).lean<Person[]>();
  for (const c of digestCallers) {
    const tz = callerTimezone(c, site);
    if (localHour(now, tz) < (c.callerSettings?.digestHour ?? 18)) continue;
    const tomorrow = dayRange(dayKey(dayRange(dayKey(now, tz), tz).end, tz), tz);
    const items = await InterviewRequest.find({ caller: c._id, status: "scheduled", scheduledAt: { $gte: tomorrow.start, $lt: tomorrow.end } })
      .populate("profile", "label")
      .populate("requestedBy", "name")
      .sort({ scheduledAt: 1 })
      .lean<(Loaded & { requestedBy: { name: string } | null })[]>();
    if (!items.length) continue;
    if (!(await claim(`iv-digest:${c._id}:${tomorrow.key}`, "interview-digest", { count: items.length }))) continue;
    await sendEmail(
      c.email,
      interviewDigestEmail({
        name: c.name,
        day: formatDayLong(tomorrow.key),
        timezone: zoneName(tz),
        rows: items.map((i) => ({
          time: formatTime(new Date(i.scheduledAt!), tz),
          company: i.company,
          role: `Step ${i.step ?? 1} · ${i.jobTitle}`,
          profile: i.profile?.label ?? i.profileLabel,
          bidder: i.requestedBy?.name ?? "",
          note: i.callerNote,
        })),
        url: `${appUrl()}/caller/schedule`,
      })
    );
    result.digests++;
  }
  return result;
}

/** Runs the sweep at most once a minute across all server instances (called from page loads and API traffic). */
export async function maybeRunInterviewSweep() {
  try {
    const now = new Date();
    const lock = await Settings.findOneAndUpdate(
      { key: "global", $or: [{ interviewSweepAt: null }, { interviewSweepAt: { $lte: new Date(now.getTime() - 60_000) } }] },
      { $set: { interviewSweepAt: now } }
    );
    if (lock) await runInterviewSweep(now);
  } catch (e) {
    console.error("interview sweep failed", e);
  }
}

/* ------------------------------------------------------------ access */

type Viewer = { _id: Types.ObjectId; role: string; assignedProfiles?: unknown[]; managedProfiles?: unknown[] };
const ids = (v?: unknown[]) => (v ?? []) as Types.ObjectId[];

/** Mongo filter of the requests a user may see. */
export function interviewVisibility(u: Viewer): Record<string, unknown> {
  // Deleted interviews: admins only (see ?deleted= on the list).
  if (u.role !== "admin") return { $and: [{ deletedAt: null }, roleVisibility(u)] };
  return {};
}

function roleVisibility(u: Viewer): Record<string, unknown> {
  switch (u.role) {
    case "admin":
      return {};
    case "user":
      return { $or: [{ profile: { $in: ids(u.managedProfiles) } }, { requestedBy: u._id }] };
    case "caller":
      // Their own, open requests (anyone may take them), their profiles' requests, and ones they handed over.
      return { $or: [{ caller: u._id }, { "report.reportedBy": u._id }, { status: "open" }, { profile: { $in: ids(u.assignedProfiles) } }, { "transfers.from": u._id }] };
    default:
      return { requestedBy: u._id };
  }
}

/* ------------------------------------------------------------ steps & chains */

/** Normalised role: "Sr. Software Engineer (Backend)" → "sr software engineer backend". */
export function roleKey(title: string) {
  return (title || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export type ChainInfo = {
  previous: { id: string; step: number; status: string; caller: string | null; scheduledAt: Date | null; outcome: string | null }[];
  nextStep: number;
  /** Caller who conducted (accepted) the chain's earliest interview: follow-ups must go to them. */
  lead: { id: string; name: string; active: boolean } | null;
  /** Latest interview of the chain (the one a new follow-up continues). */
  lastId: string | null;
};

/** Earlier interviews for the same profile + company + role (cancelled ones ignored). */
export async function chainInfo(profile: Types.ObjectId | string, company: string, jobTitle: string, excludeId?: Types.ObjectId | string): Promise<ChainInfo> {
  const ck = companyKey(company);
  const rk = roleKey(jobTitle);
  const empty: ChainInfo = { previous: [], nextStep: 1, lead: null, lastId: null };
  if (!ck) return empty;
  const items = await InterviewRequest.find({ profile, companyKey: ck, roleKey: rk, status: { $ne: "cancelled" }, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })
    .populate("caller", "name status role")
    .sort({ step: 1, createdAt: 1 })
    .lean<(Loaded & { step: number; acceptedAt?: Date; caller: (Person & { status?: string }) | null; report?: { outcome?: string } })[]>();
  if (!items.length) return empty;
  const leadItem = items.find((i) => i.acceptedAt && i.caller && ["scheduled", "completed"].includes(i.status));
  const last = [...items].sort((a, b) => b.step - a.step)[0];
  return {
    previous: items.map((i) => ({
      id: String(i._id),
      step: i.step,
      status: i.status,
      caller: i.caller?.name ?? null,
      scheduledAt: i.scheduledAt ?? null,
      outcome: i.report?.outcome ?? null,
    })),
    nextStep: Math.min(10, Math.max(...items.map((i) => i.step)) + 1),
    lead: leadItem?.caller
      ? { id: String(leadItem.caller._id), name: leadItem.caller.name, active: leadItem.caller.status === "approved" && leadItem.caller.role === "caller" }
      : null,
    lastId: String(last._id),
  };
}
