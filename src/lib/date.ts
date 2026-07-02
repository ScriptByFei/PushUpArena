// Datums-Helfer. Alle Tagesberechnungen nutzen Europe/Berlin – konsistent mit der DB-Funktion get_my_stats.
const TZ = 'Europe/Berlin';

/** Gibt ein Date-Objekt als "YYYY-MM-DD" in Europe/Berlin zurück. */
function berlinDate(d: Date): string {
  return d.toLocaleDateString('sv-SE', { timeZone: TZ });
}

export function startOfWeek(date = new Date()): Date {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // Montag = 0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

const dateFmt = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const timeFmt = new Intl.DateTimeFormat('de-DE', {
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDate(value: string | Date): string {
  return dateFmt.format(new Date(value));
}

export function formatTime(value: string | Date): string {
  return timeFmt.format(new Date(value));
}

export function formatDateTime(value: string | Date): string {
  return `${formatDate(value)} · ${formatTime(value)}`;
}

// Immer deutsch, 24h, ohne AM/PM, z. B. "29.06.2026, 17:14"
const dateTimeFmt = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatGermanDateTime(value: string | Date): string {
  return dateTimeFmt.format(new Date(value));
}

/** Relativer, freundlicher Tagesbezug ("Heute", "Gestern", sonst Datum) – Europe/Berlin. */
export function formatRelativeDay(value: string | Date): string {
  const d = berlinDate(new Date(value));
  const today = berlinDate(new Date());
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  if (d === today) return 'Heute';
  if (d === berlinDate(yesterdayDate)) return 'Gestern';
  return formatDate(value);
}

/** Wert für <input type="datetime-local"> (lokale Zeit). */
export function toDateTimeLocalValue(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
