"use client";

// Desktop notifications (Windows / macOS) from the browser, for upcoming interviews and new notifications.
// Shown while TailorBid is open in any tab, even in the background. Turned on per browser from the bell menu.
const PREF_KEY = "tb-desktop-alerts";

export const desktopSupported = () => typeof window !== "undefined" && "Notification" in window;

/** "on" (allowed and turned on) · "off" · "blocked" (denied in the browser) · "unsupported". */
export function desktopState(): "on" | "off" | "blocked" | "unsupported" {
  if (!desktopSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  let pref: string | null = null;
  try {
    pref = localStorage.getItem(PREF_KEY);
  } catch {
    /* storage unavailable */
  }
  return Notification.permission === "granted" && pref !== "off" ? "on" : "off";
}

/** Asks the browser for permission (must run from a click) and remembers the choice. */
export async function setDesktopAlerts(on: boolean) {
  if (!desktopSupported()) return desktopState();
  if (on && Notification.permission !== "granted") await Notification.requestPermission();
  try {
    localStorage.setItem(PREF_KEY, on ? "on" : "off");
  } catch {
    /* storage unavailable */
  }
  return desktopState();
}

/**
 * Shows a desktop notification when they are turned on. `tag` makes the same alert from several open tabs
 * appear once; clicking it brings TailorBid forward and opens `url`.
 */
export function desktopNotify({ title, body, tag, url }: { title: string; body?: string; tag: string; url?: string }) {
  if (desktopState() !== "on") return;
  try {
    const n = new Notification(title, { body, tag, icon: "/icon.svg" });
    n.onclick = () => {
      window.focus();
      if (url) window.location.assign(url);
      n.close();
    };
  } catch {
    /* some browsers only allow notifications from a service worker */
  }
}
