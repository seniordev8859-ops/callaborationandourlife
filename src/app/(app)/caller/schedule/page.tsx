"use client";

import { Suspense, useState } from "react";
import InterviewBoard from "@/components/InterviewBoard";
import ScheduleInterviewForm from "@/components/ScheduleInterviewForm";
import { Plus } from "lucide-react";
import { Alert, Modal, PageHeader } from "@/components/ui";

export default function Page() {
  // Callers can book interviews for their profiles, for themselves or another caller assigned to the profile.
  const [creating, setCreating] = useState<{ day?: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [version, setVersion] = useState(0);
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="My schedule"
        subtitle="Interviews you accepted. You get tomorrow's schedule by email the day before, and a reminder before each interview (set both on My Page)."
        actions={
          <button className="btn btn-primary" onClick={() => setCreating({})}>
            <Plus />
            Schedule interview
          </button>
        }
      />
      {notice && (
        <div className="mb-4">
          <Alert kind="success">{notice}</Alert>
        </div>
      )}
      {creating && (
        <Modal open wide onClose={() => setCreating(null)} title="Schedule an interview">
          <ScheduleInterviewForm
            day={creating.day}
            onCancel={() => setCreating(null)}
            onDone={(msg) => {
              setCreating(null);
              setNotice(msg);
              setVersion((v) => v + 1);
            }}
          />
        </Modal>
      )}
      <Suspense>
        <InterviewBoard as="caller" reloadSignal={version} onAddDay={(day) => setCreating({ day })} />
      </Suspense>
    </div>
  );
}
