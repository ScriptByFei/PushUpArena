// Isolierter Countdown-Hook.
// Nur diese Hook-Instanz (und die Komponente, die ihn verwendet) löst jede
// Sekunde einen Re-Render aus. Alle übergeordneten Komponenten bleiben stabil.

import { useEffect, useRef, useState } from 'react';

/**
 * Berechnet die verbleibenden Sekunden bis targetTime.
 *
 * - Berücksichtigt den Zeitunterschied zwischen Server (serverNow) und lokaler
 *   Uhr, damit Uhr-Drift keine Rolle spielt.
 * - Ruft onEnd einmalig auf, wenn der Countdown 0 erreicht.
 * - Startet neu, wenn sich targetTime oder serverNow ändern (= neuer Status).
 */
export function useCountdown(
  targetTime: Date | null,
  serverNow: Date | null,
  onEnd?: () => void,
): number {
  const [seconds, setSeconds] = useState(0);

  // onEnd stabil halten: verhindert, dass der Effekt bei jeder Eltern-Render-
  // Übergabe von refreshStatus neu startet.
  const onEndRef = useRef(onEnd);
  useEffect(() => { onEndRef.current = onEnd; }, [onEnd]);

  useEffect(() => {
    if (!targetTime || !serverNow) {
      setSeconds(0);
      return;
    }

    // Einmalig: Drift zwischen Serverzeit und lokaler Uhr berechnen
    const clockOffset = serverNow.getTime() - Date.now();

    const computeRemaining = (): number =>
      Math.max(0, Math.floor((targetTime.getTime() - (Date.now() + clockOffset)) / 1000));

    let fired = false;

    const tick = () => {
      const rem = computeRemaining();
      setSeconds(rem);
      if (rem <= 0 && !fired) {
        fired = true;
        onEndRef.current?.();
      }
    };

    tick(); // Sofortige Initialisierung ohne 1s Wartezeit
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetTime, serverNow]); // Nur neu starten wenn targetTime oder serverNow sich ändert

  return seconds;
}
