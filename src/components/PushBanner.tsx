/**
 * PushBanner – Premium-Banner bei inaktiver Glocke.
 * Slide-in von oben, auto-dismiss nach 5s, fade-out beim Schließen.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { usePush } from '@/context/PushContext';
import { BellIcon, XIcon } from '@/components/ui/icons';

const AUTO_DISMISS_MS = 5000;
const SHOW_DELAY_MS   = 800;
const ANIM_MS         = 200;

const pushSupported =
  typeof window !== 'undefined' &&
  'Notification' in window &&
  'serviceWorker' in navigator &&
  'PushManager' in window;

export function PushBanner() {
  const { pushPermission, busy, togglePush } = usePush();

  // `shown`    → Element im DOM halten (für Exit-Animation)
  // `animated` → opacity/translate aktiv
  const [shown, setShown]       = useState(false);
  const [animated, setAnimated] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearAll = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const hide = useCallback(() => {
    setAnimated(false);
    const t = setTimeout(() => setShown(false), ANIM_MS);
    timers.current.push(t);
  }, []);

  useEffect(() => {
    if (!pushSupported) return;
    // Sofort ausblenden wenn Glocke gerade aktiviert wurde
    if (pushPermission === 'granted') { clearAll(); hide(); return; }
    // OS-Level "denied" → können wir nichts anbieten
    if (Notification.permission === 'denied') return;

    const t1 = setTimeout(() => {
      setShown(true);
      // Doppeltes rAF damit der Browser die Transition erkennt
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setAnimated(true))
      );
      const t2 = setTimeout(hide, AUTO_DISMISS_MS);
      timers.current.push(t2);
    }, SHOW_DELAY_MS);
    timers.current.push(t1);

    return clearAll;
  }, [pushPermission, hide, clearAll]);

  function dismiss() {
    clearAll();
    hide();
  }

  async function onEnable() {
    clearAll();
    await togglePush();
    hide();
  }

  if (!shown) return null;

  return (
    <div
      className={[
        // Layout & Spacing
        'mx-4 relative overflow-hidden rounded-2xl',
        // Gradient-Hintergrund dunkel → dezent violett
        'bg-gradient-to-r from-ink-800 via-ink-800 to-[#1e1b40]',
        // Glow-Rand
        'ring-1 ring-brand-500/25',
        'shadow-[0_0_0_1px_rgba(99,102,241,0.15),0_4px_24px_rgba(79,70,229,0.18)]',
        // Einblend-Animation
        'transition-all duration-200 ease-out',
        animated ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2',
      ].join(' ')}
    >
      {/* Linker Akzentstreifen */}
      <div className="absolute inset-y-0 left-0 w-[2px] bg-gradient-to-b from-brand-400/70 to-brand-700/30 rounded-l-2xl" />

      <div className="flex items-center gap-3 py-2.5 pr-3 pl-5">
        {/* Bell-Icon */}
        <BellIcon className="h-[15px] w-[15px] text-brand-400 shrink-0" />

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold leading-snug text-slate-100">
            Push-Benachrichtigungen
          </p>
          <p className="mt-0.5 truncate text-[11px] leading-snug text-slate-500">
            Verpasse keine Rekorde, Freundesaktivitäten oder neue Meilensteine.
          </p>
        </div>

        {/* Aktivieren-Button */}
        <button
          onClick={onEnable}
          disabled={busy}
          className="shrink-0 rounded-lg bg-brand-600 px-3 py-[5px] text-[11px] font-semibold
            text-white whitespace-nowrap transition
            shadow-[0_0_10px_rgba(99,102,241,0.35)]
            hover:bg-brand-500 hover:shadow-[0_0_14px_rgba(99,102,241,0.5)]
            disabled:opacity-50"
        >
          {busy ? '…' : 'Aktivieren'}
        </button>

        {/* Schließen-Button */}
        <button
          onClick={dismiss}
          aria-label="Schließen"
          className="shrink-0 text-slate-600 hover:text-slate-400 transition ml-0.5"
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
