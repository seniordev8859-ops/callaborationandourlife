"use client";

import { useState } from "react";
import { FlaskConical, KeyRound, Pencil, Plus, Star, Trash2, TriangleAlert } from "lucide-react";
import ModelInput from "@/components/ModelInput";
import { Alert, api, Badge, EmptyState, fmtDateTime, Modal, PageHeader, Spinner, TableSkeleton, useAsync, useClientPaging } from "@/components/ui";

type KeyRow = {
  _id: string;
  label: string;
  keyMask: string;
  model: string;
  monthlyTokenLimit: number;
  inputPricePerM: number;
  outputPricePerM: number;
  isDefault: boolean;
  active: boolean;
  notes: string;
  lastUsedAt?: string;
  lastError?: string;
  usage: { tokens: number; cost: number; generations: number };
  profiles: { id: string; label: string }[];
};

type FormState = {
  label: string;
  key: string;
  model: string;
  monthlyTokenLimit: string;
  inputPricePerM: string;
  outputPricePerM: string;
  isDefault: boolean;
  active: boolean;
  notes: string;
};

const EMPTY: FormState = {
  label: "",
  key: "",
  model: "gpt-4o-mini",
  monthlyTokenLimit: "0",
  inputPricePerM: "0.15",
  outputPricePerM: "0.6",
  isDefault: false,
  active: true,
  notes: "",
};

export default function KeysPage() {
  const list = useAsync(() => api<{ keys: KeyRow[]; envFallback: boolean }>("/api/admin/keys"), []);
  const [editing, setEditing] = useState<KeyRow | "new" | null>(null);
  const { pageRows: keyRows, pager } = useClientPaging(list.data?.keys ?? [], "api-keys");
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [testing, setTesting] = useState("");

  async function test(k: KeyRow) {
    setTesting(k._id);
    setMsg(null);
    try {
      const r = await api<{ ok: boolean; message: string }>(`/api/admin/keys/${k._id}`, { method: "POST" });
      setMsg({ kind: r.ok ? "success" : "error", text: `${k.label}: ${r.message}` });
      list.reload();
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    } finally {
      setTesting("");
    }
  }

  async function remove(k: KeyRow) {
    if (!confirm(`Delete the key "${k.label}"?`)) return;
    try {
      await api(`/api/admin/keys/${k._id}`, { method: "DELETE" });
      list.reload();
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    }
  }

  async function makeDefault(k: KeyRow) {
    await api(`/api/admin/keys/${k._id}`, { method: "PATCH", json: { isDefault: true } });
    list.reload();
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="OpenAI API keys"
        subtitle="Keys are stored encrypted in the database. Each profile uses its selected key, or the default key. Usage is tracked per key."
        actions={
          <button className="btn btn-primary" onClick={() => setEditing("new")}>
            <Plus />
            Add key
          </button>
        }
      />
      {msg && (
        <div className="mb-4">
          <Alert kind={msg.kind}>{msg.text}</Alert>
        </div>
      )}
      {list.data && !list.data.keys.length && (
        <div className="mb-4">
          <Alert kind="info">
            No keys yet.{" "}
            {list.data.envFallback ? "The OPENAI_API_KEY environment variable is used as a fallback until you add one." : "Add a key to enable generation."}
          </Alert>
        </div>
      )}
      <div className="card overflow-hidden p-0">
        {list.loading && !list.data ? (
          <TableSkeleton rows={6} cols={7} />
        ) : !list.data?.keys.length ? (
          <EmptyState
            icon={KeyRound}
            title="No API keys"
            description="Keys you add appear here with their monthly usage."
            action={
              <button className="btn btn-secondary" onClick={() => setEditing("new")}>
                <Plus />
                Add key
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Key</th>
                <th>Model</th>
                <th className="text-right">Generations (month)</th>
                <th className="text-right">Tokens (month)</th>
                <th className="text-right">Est. cost (month)</th>
                <th>Profiles</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {keyRows.map((k) => {
                const pct = k.monthlyTokenLimit ? Math.min(100, (k.usage.tokens / k.monthlyTokenLimit) * 100) : 0;
                return (
                  <tr key={k._id}>
                    <td className="min-w-[13rem]">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">{k.label}</span> {k.isDefault && <Badge value="approved" label="default" />}
                      </div>
                      <div className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-xs text-slate-600">
                        <KeyRound className="size-3 text-slate-400" />
                        {k.keyMask}
                      </div>
                      {k.notes && <div className="mt-1 text-xs text-slate-400">{k.notes}</div>}
                    </td>
                    <td className="whitespace-nowrap">
                      <span className="font-mono text-xs text-slate-700">{k.model}</span>
                    </td>
                    <td className="text-right tabular-nums">{k.usage.generations}</td>
                    <td className="text-right tabular-nums">
                      <div className="whitespace-nowrap">
                        {k.usage.tokens.toLocaleString()}
                        {k.monthlyTokenLimit > 0 && <span className="text-xs text-slate-400"> / {k.monthlyTokenLimit.toLocaleString()}</span>}
                      </div>
                      {k.monthlyTokenLimit > 0 && (
                        <div className="mt-1.5 ml-auto h-1.5 w-28 rounded-full bg-slate-100">
                          <div className={`h-1.5 rounded-full ${pct >= 100 ? "bg-rose-500" : pct >= 80 ? "bg-amber-500" : "bg-indigo-600"}`} style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </td>
                    <td className="text-right font-medium tabular-nums">${k.usage.cost.toFixed(2)}</td>
                    <td className="max-w-48 text-xs text-slate-700">{k.profiles.map((p) => p.label).join(", ") || <span className="text-slate-400">{k.isDefault ? "All without a key" : "None"}</span>}</td>
                    <td className="text-xs">
                      <Badge value={k.active ? "active" : "inactive"} />
                      {k.lastError ? (
                        <div className="mt-1.5 flex max-w-56 items-start gap-1 text-rose-600">
                          <TriangleAlert className="mt-px size-3.5 shrink-0" />
                          <span>{k.lastError}</span>
                        </div>
                      ) : (
                        <div className="mt-1.5 whitespace-nowrap text-slate-400 tabular-nums">Last used {fmtDateTime(k.lastUsedAt)}</div>
                      )}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <button className="btn btn-secondary btn-sm" onClick={() => test(k)} disabled={testing === k._id}>
                          {testing === k._id ? <Spinner className="h-3 w-3" /> : <FlaskConical />}
                          {testing === k._id ? null : "Test"}
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditing(k)}>
                          <Pencil />
                          Edit
                        </button>
                        {!k.isDefault && k.active && (
                          <button className="btn btn-ghost btn-sm" onClick={() => makeDefault(k)}>
                            <Star />
                            Make default
                          </button>
                        )}
                        <button className="btn btn-ghost btn-sm text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => remove(k)}>
                          <Trash2 />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
        {!!list.data?.keys.length && <div className="border-t border-slate-200 px-4 pb-3">{pager}</div>}
      </div>

      {editing && (
        <KeyModal
          row={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            list.reload();
          }}
        />
      )}
    </div>
  );
}

function KeyModal({ row, onClose, onSaved }: { row: KeyRow | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<FormState>(
    row
      ? {
          label: row.label,
          key: "",
          model: row.model,
          monthlyTokenLimit: String(row.monthlyTokenLimit),
          inputPricePerM: String(row.inputPricePerM),
          outputPricePerM: String(row.outputPricePerM),
          isDefault: row.isDefault,
          active: row.active,
          notes: row.notes,
        }
      : EMPTY
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const body: Record<string, unknown> = { ...form };
    if (!form.key) delete body.key;
    try {
      if (row) await api(`/api/admin/keys/${row._id}`, { method: "PATCH", json: body });
      else await api("/api/admin/keys", { method: "POST", json: body });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={row ? `Edit ${row.label}` : "Add OpenAI key"}>
      <form className="space-y-4" onSubmit={save}>
        {error && <Alert>{error}</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Label *</label>
            <input className="input" required value={form.label} onChange={(e) => set("label", e.target.value)} placeholder="e.g. Team A key" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">{row ? "Replace key (leave blank to keep current)" : "API key *"}</label>
            <input
              className="input font-mono text-[13px]"
              type="password"
              autoComplete="off"
              required={!row}
              value={form.key}
              onChange={(e) => set("key", e.target.value)}
              placeholder={row ? row.keyMask : "sk-…"}
            />
          </div>
          <div>
            <label className="label">Default model</label>
            <ModelInput value={form.model} onChange={(v) => set("model", v)} placeholder="gpt-4o-mini" />
          </div>
          <div>
            <label className="label">Monthly token limit (0 = unlimited)</label>
            <input className="input tabular-nums" type="number" min={0} step={1000} value={form.monthlyTokenLimit} onChange={(e) => set("monthlyTokenLimit", e.target.value)} />
          </div>
          <div>
            <label className="label">Input $ / 1M tokens</label>
            <input className="input tabular-nums" type="number" min={0} step="0.01" value={form.inputPricePerM} onChange={(e) => set("inputPricePerM", e.target.value)} />
          </div>
          <div>
            <label className="label">Output $ / 1M tokens</label>
            <input className="input tabular-nums" type="number" min={0} step="0.01" value={form.outputPricePerM} onChange={(e) => set("outputPricePerM", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Notes</label>
            <input className="input" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 sm:col-span-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="size-4 rounded" checked={form.active} onChange={(e) => set("active", e.target.checked)} /> Active
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="size-4 rounded" checked={form.isDefault} onChange={(e) => set("isDefault", e.target.checked)} /> Default key
            </label>
          </div>
        </div>
        <div className="-mx-5 -mb-5 flex flex-col-reverse gap-2 rounded-b-xl border-t border-slate-200 bg-slate-50 px-5 py-3 sm:flex-row sm:flex-wrap sm:justify-end">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy && <Spinner />} Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
