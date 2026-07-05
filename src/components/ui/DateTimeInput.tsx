import { formatGermanDateTime } from '@/lib/date';
import { CalendarIcon } from './icons';

// Zeigt Datum/Uhrzeit IMMER deutsch an (29.06.2026, 17:14 – 24h, kein AM/PM),
// unabhängig von der Browser-Sprache. Darüber liegt ein transparenter nativer
// datetime-local-Picker, sodass Antippen den gewohnten System-Picker öffnet.
export function DateTimeInput({
  value,
  onChange,
  id,
  min,
  max,
}: {
  value: string; // "YYYY-MM-DDTHH:mm"
  onChange: (v: string) => void;
  id?: string;
  min?: string;
  max?: string;
}) {
  const display = value ? `${formatGermanDateTime(value)} Uhr` : 'Datum & Uhrzeit wählen';
  return (
    <div className="relative">
      <div className="input-base flex items-center justify-between" aria-hidden="true">
        <span className={value ? '' : 'text-slate-500'}>{display}</span>
        <CalendarIcon className="h-5 w-5 text-slate-400" />
      </div>
      <input
        id={id}
        type="datetime-local"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        aria-label="Datum und Uhrzeit"
      />
    </div>
  );
}
