// One clock for the whole app. Test mode can push it forward by whole days,
// so weeks and seasons can be checked without waiting for them.
let offsetMs = 0;

export const DAY = 24 * 60 * 60 * 1000;

export function setOffsetDays(days) { offsetMs = days * DAY; }

export function now() { return Date.now() + offsetMs; }

// Monday 00:00 of the week containing `t`, in local time.
export function weekStart(t = now()) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

export function greeting(t = now()) {
  const h = new Date(t).getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// 40m, 1h, 1h 10, or a running clock like 12:40.
export function formatTotal(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "–";
  if (m < 60) return `${m}m`;
  return m % 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}` : `${m / 60}h`;
}

export function formatRunning(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}
