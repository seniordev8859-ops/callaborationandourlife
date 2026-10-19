"use client";

import { ArrowRight, Bell, X } from "lucide-react";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Lightbox from "./Lightbox";
import { api, fmtDate, fmtDateTime, Modal } from "./ui";

export type Note = {
  _id: string;
  title: string;
  body: string;
  images: { url: string; publicId: string }[];
  senderName: string;
  createdAt: string;
  read: boolean;
};
type Ctx = { items: Note[]; unread: number; open: (n: Note) => void; markAll: () => void; reload: () => void };

const NotesContext = createContext<Ctx>({ items: [], unread: 0, open: () => {}, markAll: () => {}, reload: () => {} });
export const useNotifications = () => useContext(NotesContext);

const POLL_MS = 60_000;
const POPPED_KEY = "tb-notes-popped"; // localStorage: notifications already shown in the popup / a toast

/** Ids of notifications this browser has already popped up (so each pops up once, not in every tab). */
function popped(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(POPPED_KEY) || "[]"));
  } catch {
    return new Set();
  }
}
function markPopped(ids: string[]) {
  try {
    const all = [...new Set([...popped(), ...ids])].slice(-500);
    localStorage.setItem(POPPED_KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable */
  }
}

const ago = (d: string) => {
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return fmtDate(d);
};

/**
 * Loads the user's notifications, polls for new ones while they work, shows unread ones in a popup
 * after signing in (each one once per browser) and a toast when a new one arrives while they work.
 */
export function NotificationProvider({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  const [items, setItems] = useState<Note[]>([]);
  const [unread, setUnread] = useState(0);
  const [viewing, setViewing] = useState<Note | null>(null);
  const [popup, setPopup] = useState<Note[] | null>(null);
  const [toast, setToast] = useState<Note | null>(null);
  const known = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ items: Note[]; unread: number }>("/api/notifications?limit=30");
      setItems(r.items);
      setUnread(r.unread);
      const unreadItems = r.items.filter((n) => !n.read);
      if (known.current === null) {
        // First load after sign-in / page load: pop up unread ones this browser hasn't shown yet.
        const seen = popped();
        const fresh = unreadItems.filter((n) => !seen.has(n._id));
        if (fresh.length) {
          setPopup(fresh);
          markPopped(fresh.map((n) => n._id));
        }
      } else {
        const fresh = unreadItems.find((n) => !known.current!.has(n._id));
        if (fresh) {
          setToast(fresh);
          markPopped([fresh._id]);
        }
      }
      known.current = new Set(r.items.map((n) => n._id));
    } catch {
      /* signed out or offline: try again on the next poll */
    }
  }, []);

  useEffect(() => {
    if (!enabled) return; // bidders: no bell, pop-ups or polling
    load();
    const t = setInterval(load, POLL_MS);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [load, enabled]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [toast]);

  const markRead = useCallback((n: Note) => {
    if (n.read) return;
    setItems((xs) => xs.map((x) => (x._id === n._id ? { ...x, read: true } : x)));
    setUnread((u) => Math.max(0, u - 1));
    api(`/api/notifications/${n._id}/read`, { method: "POST" }).catch(() => {});
  }, []);

  const open = useCallback(
    (n: Note) => {
      setViewing(n);
      setToast(null);
      markRead(n);
    },
    [markRead],
  );

  const markAll = useCallback(() => {
    setItems((xs) => xs.map((x) => ({ ...x, read: true })));
    setUnread(0);
    api("/api/notifications/read-all", { method: "POST" }).catch(() => {});
  }, []);

  return (
    <NotesContext.Provider value={{ items, unread, open, markAll, reload: load }}>
      {children}

      {viewing && <NoteModal n={viewing} onClose={() => setViewing(null)} />}

      {popup && !viewing && (
        <Modal open wide onClose={() => setPopup(null)} title={`You have ${popup.length} unread notification${popup.length === 1 ? "" : "s"}`}>
          <div className="max-h-[65vh] space-y-3 overflow-y-auto">
            {popup.map((n) => (
              <NoteBody key={n._id} n={n} compact />
            ))}
          </div>
          <div className="-mx-5 mt-5 -mb-5 flex flex-wrap items-center justify-between gap-2 rounded-b-xl border-t border-slate-200 bg-page px-5 py-3">
            <Link href="/notifications" className="btn btn-ghost" onClick={() => setPopup(null)}>
              View all notifications
              <ArrowRight />
            </Link>
            <button
              className="btn btn-primary"
              onClick={() => {
                popup.forEach(markRead);
                setPopup(null);
              }}
            >
              Mark as read
            </button>
          </div>
        </Modal>
      )}

      {toast && (
        <div role="status" className="popover fixed right-4 bottom-4 z-50 w-[calc(100vw-2rem)] max-w-80 animate-pop-in p-3.5">
          <div className="flex items-start gap-3">
            <div className="grid size-8 shrink-0 place-items-center rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-600">
              <Bell className="size-4" />
            </div>
            <button className="min-w-0 flex-1 cursor-pointer text-left" onClick={() => open(toast)}>
              <div className="text-xs font-medium text-indigo-600">New notification</div>
              <div className="mt-0.5 truncate text-sm font-medium text-slate-900">{toast.title}</div>
              <div className="mt-0.5 line-clamp-2 text-[13px] text-slate-500">{toast.body}</div>
            </button>
            <button className="btn btn-ghost btn-icon -mt-1.5 -mr-1.5" onClick={() => setToast(null)} aria-label="Dismiss">
              <X />
            </button>
          </div>
        </div>
      )}
    </NotesContext.Provider>
  );
}

export function NoteBody({ n, compact }: { n: Note; compact?: boolean }) {
  const [slide, setSlide] = useState<number | null>(null);
  return (
    <div className={compact ? "rounded-lg border border-slate-200 p-4" : ""}>
      {compact && <div className="text-sm font-semibold text-slate-900">{n.title}</div>}
      <div className={`mb-3 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500 ${compact ? "mt-0.5" : ""}`}>
        <span>
          From <span className="font-medium text-slate-700">{n.senderName}</span>
        </span>
        <span aria-hidden>·</span>
        <span className="tabular-nums">{fmtDateTime(n.createdAt)}</span>
      </div>
      {n.body && <div className="text-sm leading-relaxed whitespace-pre-wrap text-slate-700">{n.body}</div>}
      {!!n.images.length && (
        <div className="mt-4 flex flex-wrap gap-2">
          {n.images.map((img, i) => (
            <button key={img.publicId} type="button" className="cursor-zoom-in overflow-hidden rounded-lg border border-slate-200 transition-colors hover:border-slate-400" onClick={() => setSlide(i)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url.replace("/upload/", "/upload/c_fill,w_320,h_200/")} alt={`Attachment ${i + 1}`} className="block h-28 w-44 object-cover" />
            </button>
          ))}
        </div>
      )}
      {slide !== null && <Lightbox slides={n.images.map((i) => ({ url: i.url, caption: n.title }))} start={slide} onClose={() => setSlide(null)} />}
    </div>
  );
}

function NoteModal({ n, onClose }: { n: Note; onClose: () => void }) {
  return (
    <Modal open wide onClose={onClose} title={n.title}>
      <NoteBody n={n} />
    </Modal>
  );
}

/** Bell with unread badge and a dropdown of recent notifications. */
export function NotificationBell({ className = "" }: { className?: string }) {
  const { items, unread, open, markAll } = useNotifications();
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  // The panel is position: fixed next to the bell, so containers with overflow (the sidebar) can't cut it off.
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(320, window.innerWidth - 16);
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    const top = r.bottom + 8;
    setPos({ top, left, width, maxHeight: Math.max(200, window.innerHeight - top - 12) });
  }, []);
  useEffect(() => {
    if (!show) return;
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [show, place]);
  useEffect(() => {
    if (!show) return;
    // The panel is portaled to <body>, so clicks inside it are not inside `ref`.
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && !panelRef.current?.contains(e.target as Node) && setShow(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setShow(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [show]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        ref={btn}
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={show}
        className={`btn btn-ghost btn-icon relative ${show ? "bg-slate-100 text-slate-900" : ""}`}
      >
        <Bell />
        {unread > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-4 rounded-full bg-rose-600 px-1 text-center text-[10px] leading-4 font-semibold text-white ring-2 ring-[var(--page)]">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {show &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            className="popover fixed z-[60] flex animate-pop-in flex-col"
            style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
            role="menu"
          >
            <div className="flex min-h-11 items-center justify-between gap-2 border-b border-slate-200 py-1.5 pr-2 pl-4">
              <span className="text-sm font-semibold">Notifications</span>
              {unread > 0 && (
                <button className="btn btn-ghost btn-sm text-indigo-600 hover:text-indigo-700" onClick={markAll}>
                  Mark all read
                </button>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {!items.length ? (
                <div className="p-6 text-center text-sm text-slate-400">No notifications yet.</div>
              ) : (
                items.slice(0, 10).map((n) => (
                  <button
                    key={n._id}
                    onClick={() => {
                      setShow(false);
                      open(n);
                    }}
                    className={`flex w-full cursor-pointer gap-3 border-b border-slate-200/60 px-4 py-3 text-left transition-colors hover:bg-slate-50 ${n.read ? "" : "bg-indigo-50/40"}`}
                  >
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-indigo-600"}`} />
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm ${n.read ? "text-slate-700" : "font-semibold"}`}>{n.title}</span>
                      <span className="line-clamp-2 block text-xs text-slate-500">{n.body || (n.images.length ? `${n.images.length} image(s)` : "")}</span>
                      <span className="block text-[11px] text-slate-400">
                        {n.senderName} · {ago(n.createdAt)}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
            <Link
              href="/notifications"
              onClick={() => setShow(false)}
              className="block rounded-b-xl border-t border-slate-200 px-4 py-2.5 text-center text-[13px] font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              View all
            </Link>
          </div>,
          document.body,
        )}
    </div>
  );
}
