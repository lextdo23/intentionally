// One clock for the whole app. Test mode can move it forward by whole days.
let offsetMs = 0;
export const DAY = 864e5;
export function setOffsetDays(d) { offsetMs = d * DAY; }
export function now() { return Date.now() + offsetMs; }
export function greeting(t = now()) {
  const hr = new Date(t).getHours();
  if (hr < 5) return "Still up";
  if (hr < 12) return "Good morning";
  if (hr < 18) return "Good afternoon";
  return "Good evening";
}
