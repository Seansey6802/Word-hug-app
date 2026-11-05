/** "today", "tomorrow" or "Mon, Nov 9" for a YYYY-MM-DD recording day. */
export function formatDay(day: string, today?: string | null) {
  const d = new Date(`${day}T12:00:00Z`);
  if (today) {
    const t = new Date(`${today}T12:00:00Z`);
    const diff = Math.round((d.getTime() - t.getTime()) / 86400000);
    if (diff === 0) return "today";
    if (diff === 1) return "tomorrow";
  }
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}
