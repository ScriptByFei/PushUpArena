/**
 * UserInfoSheet – Bottom sheet showing public stats for another user.
 * Opens when tapping a friend row or discover card on the Friends page.
 *
 * NOTE: No @handle, no current streak, no "beste Woche", no remove button.
 */
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Avatar } from '@/components/ui/Avatar';

interface UserPublicStats {
  total_amount: number;
  training_days: number;
  avg_per_day: number;
  best_streak: number;
  current_streak: number;
  days_member: number;
  week_days: boolean[];      // Mo–So: trainiert?
  week_day_amounts: number[]; // Mo–So: Wiederholungen
  week_day_sessions: number[]; // Mo–So: Sätze
}

export interface UserInfoSheetProps {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  exerciseId: string;
  onClose: () => void;
  /** Zeigt zusätzlich die heutigen Sätze am Ende des Sheets */
  showTodaySets?: boolean;
}

const WEEK_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export function UserInfoSheet({
  userId,
  displayName,
  avatarUrl,
  exerciseId,
  onClose,
  showTodaySets = false,
}: UserInfoSheetProps) {
  const [stats, setStats] = useState<UserPublicStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [sets, setSets] = useState<number[] | null>(null);
  const [setsLoading, setSetsLoading] = useState(false);
  const [activeWeekDay, setActiveWeekDay] = useState<number | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setStats(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .rpc('get_user_public_stats', { p_user_id: userId, p_exercise: exerciseId })
      .then(({ data }: { data: UserPublicStats[] | null }) => {
        if (cancelled) return;
        const row = Array.isArray(data) ? data[0] : data;
        if (row && typeof row === 'object') setStats(row as UserPublicStats);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [userId, exerciseId]);

  useEffect(() => {
    if (!showTodaySets) return;
    let cancelled = false;
    setSetsLoading(true);
    setSets(null);
    supabase
      .rpc('get_friend_today_sets', { p_user_id: userId, p_exercise: exerciseId })
      .then(({ data }) => {
        if (!cancelled) {
          setSets(((data ?? []) as { amount: number }[]).map((r) => r.amount));
          setSetsLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [userId, exerciseId, showTodaySets]);

  function onOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose();
  }

  const memberText =
    stats != null
      ? stats.days_member === 0
        ? 'Heute beigetreten'
        : stats.days_member === 1
        ? 'Seit 1 Tag dabei'
        : `Seit ${stats.days_member} Tagen dabei`
      : null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onOverlayClick}
    >
      <div className="w-full max-w-md animate-pop-in rounded-t-3xl border-t border-ink-700 bg-ink-900 px-4 pb-8 pt-3 max-h-[85dvh] overflow-y-auto">
        {/* Drag handle */}
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink-600" />

        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="mb-4 flex items-center gap-3">
          <Avatar url={avatarUrl} name={displayName} size={44} />
          <div className="min-w-0">
            <p className="truncate text-base font-extrabold text-slate-100">{displayName}</p>
            {memberText && (
              <p className="text-xs text-slate-500">{memberText}</p>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-6">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          </div>
        ) : stats ? (
          <>
            {/* ── Stats grid ──────────────────────────────────────── */}
            <div className="mb-3 grid grid-cols-2 gap-2">
              <StatTile icon="🏆" label="Bester Streak" value={`${stats.best_streak} Tage`} />
              <StatTile icon="📅" label="Trainingstage" value={`${stats.training_days}`} />
              <StatTile
                icon="💪"
                label="Gesamt-Reps"
                value={stats.total_amount.toLocaleString('de-DE')}
              />
              <StatTile
                icon="📊"
                label="Ø pro Trainingstag"
                value={`${stats.avg_per_day}`}
              />
            </div>

            {/* ── Aktuelle Woche Mo–So ─────────────────────────────── */}
            <div
              className="rounded-2xl border border-ink-700 bg-ink-800 px-3 py-3"
              onClick={() => setActiveWeekDay(null)}
            >
              {/* Tooltip */}
              <div className="relative mb-2" style={{ minHeight: 44 }}>
                {activeWeekDay !== null && (() => {
                  const amt  = (stats.week_day_amounts  ?? [])[activeWeekDay] ?? 0;
                  const sess = (stats.week_day_sessions ?? [])[activeWeekDay] ?? 0;
                  const n    = stats.week_days.length;
                  const tipStyle: React.CSSProperties =
                    activeWeekDay === 0
                      ? { left: 0 }
                      : activeWeekDay === n - 1
                        ? { right: 0 }
                        : { left: `${((activeWeekDay + 0.5) / n) * 100}%`, transform: 'translateX(-50%)' };
                  return (
                    <div
                      className="animate-pop-in pointer-events-none absolute top-0 z-20 whitespace-nowrap rounded-xl border border-ink-600/80 bg-ink-900 px-2.5 py-1.5 shadow-xl"
                      style={tipStyle}
                    >
                      <p className="text-center text-[10px] font-semibold text-slate-300">
                        {WEEK_LABELS[activeWeekDay]}
                      </p>
                      {amt > 0 ? (
                        <>
                          <p className="mt-0.5 text-center text-[13px] font-extrabold leading-tight text-brand-300">
                            {amt} Wdh.
                          </p>
                          {sess > 0 && (
                            <p className="text-center text-[10px] text-slate-500">
                              {sess} {sess === 1 ? 'Satz' : 'Sätze'}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="mt-0.5 text-center text-[11px] text-slate-500">Kein Training</p>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Tageskacheln */}
              <div
                className="flex justify-between gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                {stats.week_days.map((active, i) => {
                  const isActive = activeWeekDay === i;
                  const amt = (stats.week_day_amounts ?? [])[i] ?? 0;
                  return (
                    <button
                      key={i}
                      type="button"
                      aria-label={`${WEEK_LABELS[i]}: ${amt > 0 ? `${amt} Wiederholungen` : 'kein Training'}`}
                      className="flex flex-1 flex-col items-center gap-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveWeekDay(isActive ? null : i);
                      }}
                    >
                      <div
                        className="h-6 w-full rounded-md transition-all duration-150"
                        style={{
                          backgroundColor: active
                            ? isActive ? '#a78bfa' : '#7c3aed'
                            : '#1e293b',
                          boxShadow: isActive && active
                            ? '0 0 8px 2px rgba(167,139,250,0.5)'
                            : undefined,
                          outline: isActive && active
                            ? '1.5px solid rgba(196,181,253,0.8)'
                            : undefined,
                        }}
                      />
                      <span
                        className={`text-[9px] ${
                          isActive ? 'font-semibold text-slate-300' : 'text-slate-600'
                        }`}
                      >
                        {WEEK_LABELS[i]}
                      </span>
                    </button>
                  );
                })}
              </div>

              <p className="mt-1.5 text-center text-[11px] text-slate-500">
                {stats.week_days.filter(Boolean).length} von 7 Tagen diese Woche
              </p>
            </div>
          </>
        ) : null}

        {/* ── Heutige Sätze (optional) ─────────────────────────────── */}
        {showTodaySets && (
          <div className="mt-3 rounded-2xl border border-ink-700 bg-ink-800 px-3 py-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
              💪 Heutige Sätze
            </p>
            {setsLoading ? (
              <div className="flex justify-center py-3">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
              </div>
            ) : !sets || sets.length === 0 ? (
              <p className="py-2 text-center text-sm text-slate-500">Heute noch nichts eingetragen</p>
            ) : (
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: `repeat(${Math.min(sets.length, 5)}, 1fr)` }}
              >
                {sets.map((amount, i) => (
                  <div
                    key={i}
                    className="flex flex-col items-center rounded-xl bg-ink-700 px-2 py-2 text-center"
                  >
                    <span className="text-[10px] text-slate-500">Satz {i + 1}</span>
                    <span className="text-base font-extrabold text-brand-300">{amount}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatTile({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5">
      <div className="mb-0.5 text-lg leading-none">{icon}</div>
      <p className="text-sm font-extrabold text-slate-100">{value}</p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  );
}
