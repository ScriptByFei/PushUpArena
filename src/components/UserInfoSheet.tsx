/**
 * UserInfoSheet – Bottom sheet showing public stats for another user.
 * Opens when tapping a friend row or discover card on the Friends page.
 *
 * Shows: avatar, display name, member since, best streak, training days,
 * total reps, avg per training day, last-7-days activity boxes, friend rank,
 * and an add/remove friend action.
 *
 * NOTE: No @handle, no current streak, no "beste Woche" per design spec.
 */
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';

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
  /** Rank among the current user's friends leaderboard today (1-based), undefined for non-friends */
  rankAmongFriends?: number;
  isFriend: boolean;
  isOutgoing: boolean;
  isBusy?: boolean;
  onAdd: () => void;
  onRemove: () => void;
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
  rankAmongFriends,
  isFriend,
  isOutgoing,
  isBusy,
  onAdd,
  onRemove,
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
        if (!cancelled && data) {
          setStats(data as unknown as UserPublicStats);
        }
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [userId, exerciseId]);

  // Close on backdrop click
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
      <div className="w-full max-w-md animate-pop-in rounded-t-3xl border-t border-ink-700 bg-ink-900 px-5 pb-10 pt-4">
        {/* Drag handle */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink-600" />

        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="mb-5 flex items-center gap-3">
          <Avatar url={avatarUrl} name={displayName} size={56} />
          <div className="min-w-0">
            <p className="truncate text-lg font-extrabold text-slate-100">{displayName}</p>
            {memberText && (
              <p className="text-xs text-slate-500">{memberText}</p>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          </div>
        ) : stats ? (
          <>
            {/* ── Stats grid ──────────────────────────────────────── */}
            <div className="mb-4 grid grid-cols-2 gap-3">
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
            <div className="mb-4 rounded-2xl border border-ink-700 bg-ink-800 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Letzte 7 Tage
              </p>
              <div className="flex justify-between gap-1">
                {stats.last_7_days.map((active, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                    <div
                      className={`h-8 w-full rounded-lg ${
                        active ? 'bg-brand-500' : 'bg-ink-700'
                      }`}
                    />
                    <span className="text-[10px] text-slate-600">{getDayLabel(i)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-center text-xs text-slate-500">
                {stats.last_7_days.filter(Boolean).length} von 7 Tagen aktiv
              </p>
            </div>

            {/* ── Rank ────────────────────────────────────────────── */}
            {rankAmongFriends != null && (
              <div className="mb-4 flex items-center justify-between rounded-2xl border border-ink-700 bg-ink-800 px-4 py-3">
                <p className="text-sm text-slate-400">Rang unter deinen Freunden heute</p>
                <p className="text-lg font-extrabold text-brand-300">#{rankAmongFriends}</p>
              </div>
            )}
          </>
        ) : null}

        {/* ── Action ──────────────────────────────────────────────── */}
        {isFriend ? (
          <Button
            fullWidth
            variant="secondary"
            size="lg"
            loading={isBusy}
            onClick={onRemove}
          >
            Freund entfernen
          </Button>
        ) : isOutgoing ? (
          <Button fullWidth variant="secondary" size="lg" loading={isBusy} onClick={onRemove}>
            Anfrage zurückziehen
          </Button>
        ) : (
          <Button fullWidth size="lg" loading={isBusy} onClick={onAdd}>
            Freund hinzufügen
          </Button>
        )}
      </div>
    </div>
  );
}

function StatTile({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-800 p-3">
      <div className="mb-1 text-xl">{icon}</div>
      <p className="text-base font-extrabold text-slate-100">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
