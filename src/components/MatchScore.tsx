"use client";

import { useMemo, useState } from "react";
import { Check, CircleCheck, CircleX, Gauge } from "lucide-react";
import type { ResumeContent } from "@/lib/generate";
import { matchLabel, scoreCoverLetter, scoreResume, type JobKeyword, type MatchResult } from "@/lib/matchScore";
import { EmptyState, Section, Segmented } from "./ui";

const tone = (score: number) => (score >= 80 ? "text-emerald-600" : score >= 65 ? "text-indigo-600" : score >= 45 ? "text-amber-600" : "text-rose-600");
const stroke = (score: number) => (score >= 80 ? "#059669" : score >= 65 ? "#5560c9" : score >= 45 ? "#d97706" : "#e11d48");

/** Circular score gauge (0–100). */
function Ring({ score }: { score: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-20 shrink-0">
      <svg viewBox="0 0 72 72" className="size-20 -rotate-90" aria-hidden>
        <circle cx="36" cy="36" r={r} fill="none" stroke="var(--line)" strokeWidth="6" />
        <circle cx="36" cy="36" r={r} fill="none" stroke={stroke(score)} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} />
      </svg>
      <div className={`absolute inset-0 grid place-items-center text-xl font-semibold tabular-nums ${tone(score)}`}>{score}</div>
    </div>
  );
}

function Chips({ items, kind }: { items: JobKeyword[]; kind: "hit" | "miss" }) {
  if (!items.length) return <div className="text-xs text-slate-400">None</div>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((k) => (
        <span
          key={k.term}
          title={[k.required ? "Required in the posting" : "Mentioned in the posting", k.alts?.length ? `Either this or ${k.alts.join(" / ")}` : ""].filter(Boolean).join(" · ")}
          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs ring-1 ring-inset ${
            kind === "hit" ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : k.required ? "bg-rose-50 text-rose-700 ring-rose-600/20" : "bg-slate-100 text-slate-600 ring-slate-500/20"
          }`}
        >
          {kind === "hit" && <Check className="size-3" />}
          {k.term}
          {kind === "miss" && k.required && <span className="font-semibold">*</span>}
        </span>
      ))}
    </div>
  );
}

function Result({ r, what }: { r: MatchResult; what: string }) {
  const required = r.missing.filter((k) => k.required).length;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Ring score={r.score} />
        <div className="min-w-0">
          <div className={`text-sm font-semibold ${tone(r.score)}`}>{matchLabel(r.score)}</div>
          <div className="mt-0.5 text-[13px] text-slate-500">
            {r.matched.length} of {r.matched.length + r.missing.length} job keywords found in the {what}
            {required ? `; ${required} required ${required === 1 ? "is" : "are"} missing` : ""}.
          </div>
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-[13px] font-medium text-slate-700">Missing keywords</div>
        <Chips items={r.missing} kind="miss" />
        {r.softMissing.length > 0 && <div className="mt-1.5 text-xs text-slate-500">Also in the posting: {r.softMissing.join(", ")}</div>}
      </div>
      <div>
        <div className="mb-1.5 text-[13px] font-medium text-slate-700">Matched keywords</div>
        <Chips items={r.matched} kind="hit" />
      </div>

      <ul className="space-y-1.5 border-t border-slate-200 pt-3">
        {r.checks.map((c) => (
          <li key={c.label} className="flex items-start gap-2 text-[13px]">
            {c.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <CircleX className="mt-0.5 size-4 shrink-0 text-slate-400" />}
            <span className={c.ok ? "text-slate-700" : "text-slate-500"}>{c.label}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-400">* required in the posting. An estimate of keyword fit; each company's ATS scores differently.</p>
    </div>
  );
}

/** Keyword match of the resume and cover letter against the job description (updates live as the letter is edited). */
export default function MatchScore({
  resume,
  coverLetter,
  jobDescription,
  company,
  jobTitle,
  className = "",
}: {
  resume: ResumeContent;
  coverLetter: string;
  jobDescription: string;
  company: string;
  jobTitle: string;
  className?: string;
}) {
  const [doc, setDoc] = useState<"resume" | "letter">("resume");
  const resumeScore = useMemo(() => scoreResume(resume, jobDescription, jobTitle), [resume, jobDescription, jobTitle]);
  const letterScore = useMemo(() => scoreCoverLetter(coverLetter, jobDescription, company, jobTitle), [coverLetter, jobDescription, company, jobTitle]);
  const noKeywords = !resumeScore.matched.length && !resumeScore.missing.length;

  return (
    <Section
      title="Job match"
      description="How well the documents cover the job description"
      className={className}
    >
      <Segmented
        label="Document"
        value={doc}
        onChange={setDoc}
        className="mb-4 flex w-full [&>button]:flex-1 [&>button]:justify-center"
        options={[
          { value: "resume", label: "Resume", count: resumeScore.score },
          { value: "letter", label: "Cover letter", count: letterScore.score },
        ]}
      />
      {!jobDescription.trim() ? (
        <EmptyState icon={Gauge} title="No job description" description="Add the job description to see how well the documents match it." className="py-6" />
      ) : noKeywords && doc === "resume" ? (
        <EmptyState icon={Gauge} title="No skills found in the posting" description="The job description doesn't name specific tools or skills, so there is nothing to match against." className="py-6" />
      ) : doc === "resume" ? (
        <Result r={resumeScore} what="resume" />
      ) : (
        <Result r={letterScore} what="cover letter" />
      )}
    </Section>
  );
}
