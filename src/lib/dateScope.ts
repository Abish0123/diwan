// Shared "is this timestamp today / yesterday" helpers so security dashboards
// can scope counts to the real current day instead of counting the whole
// historical table (the old "Total Today" bug).

export function isToday(iso?: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

export function isYesterday(iso?: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const y = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return d.getFullYear() === y.getFullYear() &&
    d.getMonth() === y.getMonth() &&
    d.getDate() === y.getDate();
}

// Format a duration in minutes as "Xh Ym" / "Ym", or an em-dash when unknown.
export function formatMinutes(mins: number | null): string {
  if (mins === null || !Number.isFinite(mins)) return "—";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// A raw "HH:MM" (24h, straight from an <input type="time">) shown as
// "2:30 PM" — matches the 12-hour format already used for check-in/out-time
// display elsewhere, instead of showing 24h and 12h times side by side.
//
// Built manually (not via toLocaleTimeString) so AM/PM casing is always
// uppercase regardless of the runtime's default locale — toLocaleTimeString
// with an empty locale array renders lowercase "am"/"pm" in some browsers,
// which visually clashes with the native <input type="time"> widget's own
// (always uppercase) AM/PM display right next to it.
export function formatTime12h(hhmm?: string): string {
  if (!hhmm) return "—";
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;
}
