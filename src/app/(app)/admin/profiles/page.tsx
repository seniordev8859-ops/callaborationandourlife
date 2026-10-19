"use client";

import Link from "next/link";
import { useState } from "react";
import { useRole } from "@/components/AppShell";
import { Eye, Pencil, Plus, Power, Search, Trash2, UserPlus, Users } from "lucide-react";
import { Alert, api, ApiError, Badge, EmptyState, PageHeader, Segmented, Spinner, TableSkeleton, useAsync, useClientPaging } from "@/components/ui";

type Row = {
  _id: string;
  label: string;
  fullName: string;
  email: string;
  location: string;
  active: boolean;
  apiKey?: { label: string; keyMask: string; model: string; active: boolean } | null;
  openaiModel?: string;
  monthlyQuota: number;
  experience: { title: string; company: string }[];
  usage: { total: number; month: number; monthPromptTokens: number; monthCompletionTokens: number };
  assignedTo: { id: string; name: string }[];
  managers: { id: string; name: string }[];
};

export default function ProfilesPage() {
  const isAdmin = useRole() === "admin";
  const { data, error, loading, reload } = useAsync(() => api<{ profiles: Row[] }>("/api/admin/profiles").then((r) => r.profiles), []);
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  const rows = (data ?? []).filter((p) => {
    if (status === "active" && !p.active) return false;
    if (status === "inactive" && p.active) return false;
    const needle = q.trim().toLowerCase();
    return !needle || [p.label, p.fullName, p.email, p.experience[0]?.title, p.experience[0]?.company].some((v) => v?.toLowerCase().includes(needle));
  });

  async function toggleActive(p: Row) {
    setBusy(p._id);
    setMsg(null);
    try {
      await api(`/api/admin/profiles/${p._id}`, { method: "PATCH", json: { active: !p.active } });
      setMsg({ kind: "success", text: `${p.label} ${p.active ? "deactivated. Users can no longer generate with it" : "activated"}.` });
      reload();
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy("");
    }
  }

  async function remove(p: Row) {
    if (!confirm(`Delete the profile "${p.label}"? This cannot be undone.`)) return;
    setBusy(p._id);
    setMsg(null);
    try {
      await api(`/api/admin/profiles/${p._id}`, { method: "DELETE" });
      setMsg({ kind: "success", text: `${p.label} deleted.` });
      reload();
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 409 && err.data.history) {
        const ok = confirm(
          `${err.message}\n\nDelete anyway? The ${err.data.history} application(s) stay in the history under "${p.label} (deleted)". ` +
            `Tip: deactivating keeps the profile but stops new bids.`
        );
        if (ok) {
          await api(`/api/admin/profiles/${p._id}?force=1`, { method: "DELETE" });
          setMsg({ kind: "success", text: `${p.label} deleted. Its history was kept.` });
          reload();
        }
      } else setMsg({ kind: "error", text: err.message });
    } finally {
      setBusy("");
    }
  }

  const { pageRows, pager } = useClientPaging(rows, "profiles");
  const counts = { all: data?.length ?? 0, active: data?.filter((p) => p.active).length ?? 0, inactive: data?.filter((p) => !p.active).length ?? 0 };

  const rowActions = (p: Row, align = "") => (
    <div className={`flex flex-wrap items-center gap-1 ${align}`}>
      <Link href={`/admin/profiles/${p._id}/view`} className="btn btn-ghost btn-sm">
        <Eye />
        View
      </Link>
      <Link href={`/admin/profiles/${p._id}`} className="btn btn-ghost btn-sm">
        <Pencil />
        Edit
      </Link>
      <Link href={`/admin/assignments?profile=${p._id}`} className="btn btn-ghost btn-sm">
        <UserPlus />
        Assign
      </Link>
      {isAdmin && (
        <>
          <button className="btn btn-ghost btn-sm" disabled={busy === p._id} onClick={() => toggleActive(p)}>
            {busy === p._id ? <Spinner className="h-3 w-3" /> : <Power />}
            {busy === p._id ? null : p.active ? "Deactivate" : "Activate"}
          </button>
          <button
            className="btn btn-ghost btn-sm text-rose-600 hover:bg-rose-50 hover:text-rose-700"
            disabled={busy === p._id}
            onClick={() => remove(p)}
          >
            <Trash2 />
            Delete
          </button>
        </>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Profiles"
        subtitle={isAdmin ? "Add, view, edit, activate/deactivate and delete candidate profiles." : "The profiles you manage."}
        actions={
          isAdmin && (
            <Link href="/admin/profiles/new" className="btn btn-primary">
              <Plus />
              New profile
            </Link>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          label="Filter by status"
          value={status}
          onChange={setStatus}
          options={(["all", "active", "inactive"] as const).map((s) => ({ value: s, label: <span className="capitalize">{s}</span>, count: counts[s] }))}
        />
        <div className="relative min-w-0 flex-1 basis-full sm:max-w-md sm:min-w-60 sm:basis-auto">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search label, name, email, title, company" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {(error || msg) && (
        <div className="mb-4">
          <Alert kind={msg?.kind ?? "error"}>{msg?.text ?? error}</Alert>
        </div>
      )}

      <div className="card overflow-hidden p-0">
        {loading ? (
          <TableSkeleton rows={6} cols={7} />
        ) : !rows.length ? (
          <EmptyState
            icon={data?.length ? Search : Users}
            title={data?.length ? "No profiles match these filters." : "No profiles yet. Create one to get started."}
          />
        ) : (
          <>
          <ul className="divide-y divide-slate-200 md:hidden">
            {pageRows.map((p) => (
              <li key={p._id} className={`space-y-3 px-4 py-4 ${p.active ? "" : "bg-slate-50/60"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/admin/profiles/${p._id}/view`} className="font-medium text-slate-900 hover:underline">
                      {p.label}
                    </Link>
                    <div className="mt-0.5 text-xs break-words text-slate-500">
                      {p.fullName}
                      {p.email && ` · ${p.email}`}
                    </div>
                  </div>
                  <Badge value={p.active ? "active" : "inactive"} />
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px]">
                  <div className="col-span-2 min-w-0">
                    <dt className="text-xs text-slate-500">Current role</dt>
                    <dd className="text-slate-900">
                      {p.experience[0] ? (
                        <>
                          {p.experience[0].title}
                          <span className="text-slate-500"> · {p.experience[0].company}</span>
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </dd>
                  </div>
                  {isAdmin && (
                    <div className="col-span-2 min-w-0">
                      <dt className="text-xs text-slate-500">OpenAI key</dt>
                      <dd className="text-xs">
                        {p.apiKey ? (
                          <span className={p.apiKey.active ? "text-slate-900" : "text-rose-600"}>
                            {p.apiKey.label}
                            {!p.apiKey.active && " (disabled)"} <span className="font-mono text-slate-500">{p.apiKey.keyMask}</span>
                          </span>
                        ) : (
                          <span className="text-slate-500">Default key</span>
                        )}
                        {(p.openaiModel || p.apiKey?.model) && <span className="text-slate-500"> · {p.openaiModel || p.apiKey?.model}</span>}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs text-slate-500">Quota (month)</dt>
                    <dd className={`tabular-nums ${p.monthlyQuota && p.usage.month >= p.monthlyQuota ? "text-rose-600" : "text-slate-900"}`}>
                      {p.usage.month} <span className="text-slate-400">/</span> {p.monthlyQuota || "∞"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">All time</dt>
                    <dd className="text-slate-900 tabular-nums">{p.usage.total}</dd>
                  </div>
                  <div className="col-span-2 min-w-0">
                    <dt className="text-xs text-slate-500">Assigned to</dt>
                    <dd className="text-xs text-slate-900">
                      {p.assignedTo.map((a) => a.name).join(", ") || <span className="text-slate-400">Nobody</span>}
                      {!!p.managers?.length && <div className="mt-1 text-slate-500">User: <span className="text-slate-700">{p.managers.map((r) => r.name).join(", ")}</span></div>}
                    </dd>
                  </div>
                </dl>
                <div className="-mx-1">{rowActions(p)}</div>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
          <table className="table">
            <thead>
              <tr>
                <th>Profile</th>
                <th>Status</th>
                <th>Current role</th>
                {isAdmin && <th>OpenAI key</th>}
                <th className="text-right">Quota (month)</th>
                <th className="text-right">All time</th>
                <th>Assigned to</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((p) => (
                <tr key={p._id} className={p.active ? "" : "bg-slate-50/60"}>
                  <td>
                    <Link href={`/admin/profiles/${p._id}/view`} className="font-medium text-slate-900 hover:underline">
                      {p.label}
                    </Link>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {p.fullName}
                      {p.email && ` · ${p.email}`}
                    </div>
                  </td>
                  <td>
                    <Badge value={p.active ? "active" : "inactive"} />
                  </td>
                  <td>
                    {p.experience[0] ? (
                      <>
                        <div className="text-slate-900">{p.experience[0].title}</div>
                        <div className="mt-0.5 text-xs text-slate-500">{p.experience[0].company}</div>
                      </>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="text-xs">
                      {p.apiKey ? (
                        <>
                          <div className={p.apiKey.active ? "text-slate-900" : "text-rose-600"}>
                            {p.apiKey.label}
                            {!p.apiKey.active && " (disabled)"}
                          </div>
                          <div className="mt-0.5 font-mono text-slate-500">{p.apiKey.keyMask}</div>
                        </>
                      ) : (
                        <span className="text-slate-500">Default key</span>
                      )}
                      <div className="mt-0.5 text-slate-500">{p.openaiModel || p.apiKey?.model || ""}</div>
                    </td>
                  )}
                  <td className={`text-right whitespace-nowrap tabular-nums ${p.monthlyQuota && p.usage.month >= p.monthlyQuota ? "text-rose-600" : ""}`}>
                    {p.usage.month} <span className="text-slate-400">/</span> {p.monthlyQuota || "∞"}
                  </td>
                  <td className="text-right tabular-nums">{p.usage.total}</td>
                  <td className="max-w-48 min-w-[10rem] text-xs">
                    {p.assignedTo.map((a) => a.name).join(", ") || <span className="text-slate-400">Nobody</span>}
                    {!!p.managers?.length && <div className="mt-1 text-slate-500">User: <span className="text-slate-700">{p.managers.map((r) => r.name).join(", ")}</span></div>}
                  </td>
                  <td className="min-w-[13rem] text-right">
                    {rowActions(p, "justify-end")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          </>
        )}
      </div>
      {!!rows.length && pager}
    </div>
  );
}
