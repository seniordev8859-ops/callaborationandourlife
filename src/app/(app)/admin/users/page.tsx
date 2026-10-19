"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useRole } from "@/components/AppShell";
import { AccountModal, ROLE_LABEL, StatusBadge, type AccountRow, type ProfileOpt, type Role } from "@/components/Accounts";
import { Check, Eye, Pencil, Plus, Power, PowerOff, Search, Trash, UserRoundSearch, X } from "lucide-react";
import { Alert, api, Badge, EmptyState, fmtDate, fmtDateTime, money, PageHeader, Segmented, Spinner, TableSkeleton, useAsync, useClientPaging } from "@/components/ui";

export default function Page() {
  return (
    <Suspense>
      <AccountsPage />
    </Suspense>
  );
}

function AccountsPage() {
  const isAdmin = useRole() === "admin";
  const sp = useSearchParams();
  const [roleTab, setRoleTab] = useState<"" | Role>("");
  const [status, setStatus] = useState(sp.get("status") ?? "");
  const [q, setQ] = useState("");
  const accounts = useAsync(() => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (q) p.set("q", q);
    return api<{ users: AccountRow[] }>(`/api/admin/users?${p}`).then((r) => r.users);
  }, [status, q]);
  const profiles = useAsync(() => api<{ profiles: ProfileOpt[] }>("/api/admin/profiles").then((r) => r.profiles), []);
  const [editing, setEditing] = useState<AccountRow | "new" | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  const rows = (accounts.data ?? []).filter((u) => !roleTab || u.role === roleTab);
  const { pageRows, pager } = useClientPaging(rows, "accounts");
  const count = (r: "" | Role) => (accounts.data ?? []).filter((u) => !r || u.role === r).length;

  async function patch(u: AccountRow, body: Record<string, unknown>, ok: string) {
    setBusy(u._id);
    setMsg(null);
    try {
      await api(`/api/admin/users/${u._id}`, { method: "PATCH", json: body });
      setMsg({ kind: "success", text: ok });
      accounts.reload();
      return true;
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
      return false;
    } finally {
      setBusy("");
    }
  }

  async function remove(u: AccountRow) {
    if (!confirm(`Delete ${u.name}? Their application history is kept.`)) return;
    try {
      await api(`/api/admin/users/${u._id}`, { method: "DELETE" });
      setMsg({ kind: "success", text: `${u.name} deleted.` });
      accounts.reload();
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    }
  }

  /* Cell contents shared by the desktop table and the phone card list. */
  const roleBadge = (u: AccountRow) => <Badge value={u.role === "bidder" ? "user" : u.role === "caller" ? "caller" : "admin"} label={ROLE_LABEL[u.role]} dot={false} />;
  const statusBadges = (u: AccountRow) => (
    <>
      <StatusBadge status={u.status} />
      {isAdmin && u.role === "bidder" && u.trusted && <Badge value="approved" label="Trusted" />}
      {u.role === "bidder" && u.interviewAccess === false && <Badge value="suspended" label="No interviews" />}
    </>
  );
  const profileCell = (u: AccountRow) => (
    <>
      {(u.role === "user" || u.role === "admin") && !!u.managedProfiles?.length && (
        <div className="mb-1 text-xs text-slate-500">
          <span className="font-medium text-slate-700">Manages:</span> {u.managedProfiles.map((p) => p.label).join(", ")}
        </div>
      )}
      {u.assignedProfiles.length ? (
        <div className="flex flex-wrap gap-1">
          {u.assignedProfiles.map((p) => (
            <span key={p._id} className="chip">
              {p.label}
            </span>
          ))}
        </div>
      ) : (
        u.role !== "user" && <span className="text-xs text-slate-400">None</span>
      )}
    </>
  );
  const rowActions = (u: AccountRow) => (
    <>
      {isAdmin && u.status === "pending" && (
        <>
          <button className="btn btn-primary btn-sm" disabled={busy === u._id} onClick={() => patch(u, { status: "approved" }, `${u.name} approved.`)}>
            <Check />
            Approve
          </button>
          <button className="btn btn-ghost btn-sm" disabled={busy === u._id} onClick={() => patch(u, { status: "rejected" }, `${u.name} rejected.`)}>
            <X />
            Reject
          </button>
        </>
      )}
      <Link href={`/admin/users/${u._id}`} className="btn btn-ghost btn-sm">
        <Eye />
        View
      </Link>
      <button className="btn btn-ghost btn-sm" onClick={() => setEditing(u)}>
        <Pencil />
        Edit
      </button>
      {isAdmin && u.status !== "pending" && (
        <button
          className="btn btn-ghost btn-sm"
          disabled={busy === u._id}
          onClick={() =>
            u.status === "approved"
              ? confirm(`Deactivate ${u.name}? They will be signed out and cannot log in.`) && patch(u, { status: "suspended" }, `${u.name} deactivated.`)
              : patch(u, { status: "approved" }, `${u.name} activated.`)
          }
        >
          {busy === u._id ? (
            <Spinner className="h-3 w-3" />
          ) : u.status === "approved" ? (
            <>
              <PowerOff />
              Deactivate
            </>
          ) : (
            <>
              <Power />
              Activate
            </>
          )}
        </button>
      )}
      {isAdmin && (
        <button className="btn btn-ghost btn-sm btn-icon text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => remove(u)} aria-label="Delete" title="Delete">
          <Trash />
        </button>
      )}
    </>
  );

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={isAdmin ? "Users & Bidders" : "Bidders"}
        subtitle={
          isAdmin
            ? "Add, view, edit and activate or deactivate accounts. Approve sign-ups, assign profiles and set fees."
            : "Assign the profiles you manage to bidders and review their activity on those profiles."
        }
        actions={
          isAdmin && (
            <button className="btn btn-primary" onClick={() => setEditing("new")}>
              <Plus />
              Add account
            </button>
          )
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        {isAdmin && (
          <Segmented
            label="Role"
            className="max-w-full self-start overflow-x-auto lg:self-auto"
            options={(["", "bidder", "caller", "user", "admin"] as const).map((r) => ({ value: r, label: r ? `${ROLE_LABEL[r]}s` : "All", count: count(r) }))}
            value={roleTab}
            onChange={setRoleTab}
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center lg:justify-end">
          <div className="relative min-w-0 sm:flex-1 lg:w-72 lg:flex-none">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" aria-label="Search" placeholder="Name or email" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {isAdmin && (
            <select className="input w-full sm:w-48" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="pending">Pending approval</option>
              <option value="approved">Active</option>
              <option value="suspended">Deactivated</option>
              <option value="rejected">Rejected</option>
            </select>
          )}
        </div>
      </div>

      {(msg || accounts.error) && (
        <div className="mb-4">
          <Alert kind={msg?.kind ?? "error"}>{msg?.text ?? accounts.error}</Alert>
        </div>
      )}

      <div className="card overflow-hidden p-0">
        {accounts.loading && !accounts.data ? (
          <TableSkeleton rows={6} cols={7} />
        ) : !rows.length ? (
          <EmptyState icon={UserRoundSearch} title="No accounts match these filters." description="Try a different role, status or search term." />
        ) : (
          <>
            {/* Phones: one card per account, same fields and actions as the table. */}
            <ul className="divide-y divide-slate-200 md:hidden">
              {pageRows.map((u) => (
                <li key={u._id} className={`space-y-3 px-4 py-4 ${u.status === "suspended" ? "bg-slate-50 text-slate-500" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/admin/users/${u._id}`} className="font-medium text-slate-900 hover:text-indigo-600">
                        {u.name}
                      </Link>
                      <div className="truncate text-xs text-slate-500">{u.email}</div>
                      <div className="mt-0.5 text-xs text-slate-400">Joined {fmtDate(u.createdAt)}</div>
                    </div>
                    <div className="shrink-0">{roleBadge(u)}</div>
                  </div>
                  <div className="flex flex-wrap gap-1">{statusBadges(u)}</div>
                  <div className="text-[13px]">{profileCell(u)}</div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs tabular-nums">
                    {isAdmin && (
                      <div>
                        <dt className="text-slate-500">Fee</dt>
                        <dd className="font-medium text-slate-900">{u.role === "bidder" ? money(u.feePerApplication) : <span className="text-slate-400">—</span>}</dd>
                      </div>
                    )}
                    <div>
                      <dt className="text-slate-500">This month</dt>
                      <dd className="font-medium text-slate-900">
                        {u.usage.monthGenerated} <span className="font-normal text-slate-500">· {money(u.usage.monthFees)}</span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">All time</dt>
                      <dd className="font-medium text-slate-900">
                        {u.usage.generated} <span className="font-normal text-slate-400">({u.usage.submitted} sub.)</span> <span className="font-normal text-slate-500">· {money(u.usage.fees)}</span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Login</dt>
                      <dd className="text-slate-700">{fmtDateTime(u.lastLoginAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Last bid</dt>
                      <dd className="text-slate-700">{fmtDateTime(u.usage.lastGeneratedAt)}</dd>
                    </div>
                  </dl>
                  <div className="flex flex-wrap items-center gap-1">{rowActions(u)}</div>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto md:block">
              <table className="table">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Profiles</th>
                    {isAdmin && <th className="text-right">Fee</th>}
                    <th className="text-right">This month</th>
                    <th className="text-right">All time</th>
                    <th>Activity</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((u) => (
                    <tr key={u._id} className={u.status === "suspended" ? "bg-slate-50 text-slate-500" : ""}>
                      <td className="min-w-52">
                        <Link href={`/admin/users/${u._id}`} className="font-medium text-slate-900 hover:text-indigo-600">
                          {u.name}
                        </Link>
                        <div className="text-xs text-slate-500">{u.email}</div>
                        <div className="mt-0.5 text-xs text-slate-400">Joined {fmtDate(u.createdAt)}</div>
                      </td>
                      <td>{roleBadge(u)}</td>
                      <td className="min-w-28">
                        <div className="flex flex-wrap gap-1">{statusBadges(u)}</div>
                      </td>
                      <td className="max-w-56 min-w-40">{profileCell(u)}</td>
                      {isAdmin && <td className="text-right whitespace-nowrap tabular-nums">{u.role === "bidder" ? money(u.feePerApplication) : <span className="text-slate-400">—</span>}</td>}
                      <td className="text-right whitespace-nowrap tabular-nums">
                        <div className="font-medium text-slate-900">{u.usage.monthGenerated}</div>
                        <div className="text-xs text-slate-500">{money(u.usage.monthFees)}</div>
                      </td>
                      <td className="text-right whitespace-nowrap tabular-nums">
                        <div>
                          <span className="font-medium text-slate-900">{u.usage.generated}</span> <span className="text-xs text-slate-400">({u.usage.submitted} sub.)</span>
                        </div>
                        <div className="text-xs text-slate-500">{money(u.usage.fees)}</div>
                      </td>
                      <td className="text-xs whitespace-nowrap text-slate-500 tabular-nums">
                        <div>
                          <span className="text-slate-400">Login:</span> {fmtDateTime(u.lastLoginAt)}
                        </div>
                        <div>
                          <span className="text-slate-400">Last bid:</span> {fmtDateTime(u.usage.lastGeneratedAt)}
                        </div>
                      </td>
                      <td className="text-right">
                        <div className="flex min-w-max flex-wrap items-center justify-end gap-0.5">{rowActions(u)}</div>
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

      {editing && (
        <AccountModal
          isAdmin={isAdmin}
          account={editing === "new" ? null : editing}
          profiles={profiles.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={(text) => {
            setEditing(null);
            setMsg({ kind: "success", text });
            accounts.reload();
          }}
        />
      )}
    </div>
  );
}
