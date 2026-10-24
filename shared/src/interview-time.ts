function parts(value: Date, timeZone: string) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  return Object.fromEntries(p.map((x) => [x.type, x.value]));
}
export function localInput(value: string | Date, timeZone: string) {
  const p = parts(new Date(value), timeZone);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function zonedToISO(value: string, timeZone: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error("Enter a valid date and time.");
  const base = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(base)) throw new Error("Enter a valid date and time.");
  const offsets = new Set<number>();
  for (const d of [-86400000, 0, 86400000]) {
    const t = base + d;
    const p = parts(new Date(t), timeZone);
    offsets.add(
      Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`) - t,
    );
  }
  const matches = [...offsets]
    .map((o) => new Date(base - o))
    .filter((d) => localInput(d, timeZone) === value);
  if (matches.length !== 1)
    throw new Error(
      "This local time is skipped or repeated by daylight saving. Choose another time.",
    );
  return matches[0].toISOString();
}
export function interviewTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
