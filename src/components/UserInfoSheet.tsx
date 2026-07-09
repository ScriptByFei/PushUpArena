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
  last_7_days: boolean[];
}

export interface UserInfoSheetProps {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  exerciseId: string;
  onClose: () => void;
}

const DAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function getDayLabel(offsetFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() - (6 - offsetFromToday));
  return DAY_LABELS[d.getDay() === 0 ? 6 : d.getDay() - 1];
}

export function UserInfoSheet({
  userId,
  displayName,
  avatarUrl,
  exerciseId,
  onClose,
}: UserInfoSheetProps) {
  const [stats, setStats] = useState<UserPublicStats | null>(null);
  const [loading, setLoading] = useState(true);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setStats(null);

    supabase
      .rpc('get_user_public_stats', { p_user_id: userId, p_exercise: exerciseId })
      .then(({ data }) => {
        if (!cancelled && data) setStats(data as unknown as UserPublicStats);
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [userId, exerciseId]);

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
      <div className="w-full max-w-md animate-pop-in rounded-t-3xl border-t border-ink-700 bg-ink-900 px-4 pb-8 pt-3">
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

            {/* ── Last 7 days ─────────────────────────────────────── */}
            <div className="rounded-2xl border border-ink-700 bg-ink-800 px-3 py-3">
              <div className="flex justify-between gap-1">
                {stats.last_7_days.map((active, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className={`h-6 w-full rounded-md ${
                        active ? 'bg-brand-500' : 'bg-ink-700'
                      }`}
                    />
                    <span className="text-[9px] text-slate-600">{getDayLabel(i)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-center text-[11px] text-slate-500">
                {stats.last_7_days.filter(Boolean).length} von 7 Tagen aktiv
              </p>
            </div>
          </>
        ) : null}
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
