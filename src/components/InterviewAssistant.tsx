"use client";

import { useState } from "react";
import { ExternalLink, Sparkles } from "lucide-react";
import { Alert, api, Modal } from "./ui";
import type { Interview } from "./interviews";

/** Where the local Interview Assistant (assistant/ in this repo) listens; it runs on the user's Windows PC. */
const ASSISTANT_URL = (process.env.NEXT_PUBLIC_ASSISTANT_URL || "http://127.0.0.1:4317").replace(/\/$/, "");
/** Window name: a second click reuses the assistant's window instead of opening another one. */
const TARGET = "interview-assistant";

/** A separate popup window (not a tab), centred on the screen, so it can sit next to the meeting. */
function popupFeatures() {
  const s = window.screen;
  const width = Math.min(1200, s.availWidth - 40);
  const height = Math.min(900, s.availHeight - 40);
  const left = Math.round(((s as Screen & { availLeft?: number }).availLeft ?? 0) + (s.availWidth - width) / 2);
  const top = Math.round(((s as Screen & { availTop?: number }).availTop ?? 0) + (s.availHeight - height) / 2);
  return `popup=yes,width=${width},height=${height},left=${left},top=${top}`;
}

/**
 * Opens the local Interview Assistant connected to TailorBid: it loads this interview's resume and job description
 * and uses TailorBid's OpenAI key (see lib/assistant.ts). Opened from the schedule page and an interview's detail.
 */
export default function InterviewAssistant({
  interview,
  onClose,
}: {
  interview?: Pick<Interview, "_id" | "company" | "jobTitle" | "step" | "profileLabel" | "profile"> | null;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function open() {
    // Opened inside the click (before any await) so popup blockers allow it. "" keeps an already open
    // assistant window where it is (an interview may be running there); only its #fragment changes below.
    const win = window.open("", TARGET, popupFeatures());
    setBusy(true);
    setError("");
    try {
      const { token } = await api<{ token: string }>("/api/assistant/session", { method: "POST", json: { interviewId: interview?._id } });
      // In the #fragment: it never reaches a server or a log, and the assistant removes it from the address bar.
      const link = `${ASSISTANT_URL}/#tailorbid=${encodeURIComponent(JSON.stringify({ origin: window.location.origin, token }))}`;
      if (win) {
        win.location.href = link;
        win.focus();
      } else window.open(link, TARGET, popupFeatures());
      onClose();
    } catch (e) {
      win?.close();
      setError(e instanceof Error ? e.message : "Could not open the Interview Assistant");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Interview Assistant">
      <div className="space-y-4">
        {interview && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm">
            <div className="font-medium">
              {interview.company || "Company"} · {interview.jobTitle || "Role"}
              {interview.step > 1 && <span className="text-slate-500"> · Step {interview.step}</span>}
            </div>
            <div className="text-slate-500">{interview.profile?.fullName || interview.profile?.label || interview.profileLabel}</div>
          </div>
        )}
        <p className="text-sm text-slate-600">
          Suggested answers in real time during the call, from Windows Live Captions.{" "}
          {interview
            ? "The assistant loads this interview's resume and job description, and uses TailorBid's OpenAI key."
            : "It uses TailorBid's OpenAI key. Open it from an interview to load that interview's resume and job description too."}
        </p>
        <details className="text-sm text-slate-600">
          <summary className="cursor-pointer select-none font-medium text-slate-700">The page doesn't open?</summary>
          <p className="mt-2">
            The assistant runs on your Windows PC, not on this website. Start it first, in the TailorBid folder:
          </p>
          <pre className="mt-2 overflow-x-auto rounded-md bg-slate-900 px-3 py-2 text-xs text-slate-100">
            npm run dev{"         "}# TailorBid development: starts both{"\n"}npm run assistant{"   "}# the assistant alone
          </pre>
          <p className="mt-2">Then click Open assistant again. It connects to TailorBid for 12 hours.</p>
        </details>
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end gap-2">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={open} disabled={busy}>
            {busy ? <Sparkles className="animate-pulse" /> : <ExternalLink />}
            Open assistant
          </button>
        </div>
      </div>
    </Modal>
  );
}
