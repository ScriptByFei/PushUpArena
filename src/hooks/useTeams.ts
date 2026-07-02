import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Team, TeamLeaderboardRow, TeamMemberStat } from '@/lib/database.types';

export type { Team, TeamLeaderboardRow, TeamMemberStat };

export interface MyMembership {
  role: 'owner' | 'member';
}

export function useTeams(exerciseSlug: string | undefined) {
  const { user } = useAuth();

  const [myTeam, setMyTeam] = useState<Team | null>(null);
  const [myMembership, setMyMembership] = useState<MyMembership | null>(null);
  const [memberStats, setMemberStats] = useState<TeamMemberStat[]>([]);
  const [leaderboard, setLeaderboard] = useState<TeamLeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !exerciseSlug) return;
    setLoading(true);
    setError(null);

    // Check user's team membership
    const { data: membership, error: mErr } = await supabase
      .from('team_members')
      .select('role, team:teams(*)')
      .eq('user_id', user.id)
      .maybeSingle();

    if (mErr) {
      setError(mErr.message);
      setLoading(false);
      return;
    }

    if (membership) {
      const team = membership.team as unknown as Team;
      setMyTeam(team);
      setMyMembership({ role: membership.role as 'owner' | 'member' });

      // Load member stats for this team
      const { data: stats } = await supabase.rpc('get_team_member_stats', {
        p_team_id: team.id,
        p_exercise: exerciseSlug,
      });
      setMemberStats(stats ?? []);
    } else {
      setMyTeam(null);
      setMyMembership(null);
      setMemberStats([]);
    }

    // Load full leaderboard
    const { data: lb, error: lbErr } = await supabase.rpc('get_team_leaderboard', {
      p_exercise: exerciseSlug,
    });
    if (lbErr) setError(lbErr.message);
    else setLeaderboard(lb ?? []);

    setLoading(false);
  }, [user, exerciseSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  const createTeam = useCallback(
    async (
      name: string,
      description: string | null,
      avatar_url: string | null,
    ): Promise<{ error: string | null }> => {
      if (!user) return { error: 'Nicht angemeldet' };

      const { data: team, error: tErr } = await supabase
        .from('teams')
        .insert({ name, description, avatar_url, created_by: user.id })
        .select()
        .single();

      if (tErr) return { error: tErr.message };

      const { error: mErr } = await supabase
        .from('team_members')
        .insert({ team_id: team.id, user_id: user.id, role: 'owner' });

      if (mErr) return { error: mErr.message };
      await load();
      return { error: null };
    },
    [user, load],
  );

  const joinTeam = useCallback(
    async (teamId: string): Promise<{ error: string | null }> => {
      if (!user) return { error: 'Nicht angemeldet' };
      const { error: err } = await supabase
        .from('team_members')
        .insert({ team_id: teamId, user_id: user.id, role: 'member' });
      if (err) return { error: err.message };
      await load();
      return { error: null };
    },
    [user, load],
  );

  const leaveTeam = useCallback(async (): Promise<{ error: string | null }> => {
    if (!user) return { error: 'Nicht angemeldet' };
    const { error: err } = await supabase
      .from('team_members')
      .delete()
      .eq('user_id', user.id);
    if (err) return { error: err.message };
    await load();
    return { error: null };
  }, [user, load]);

  const updateTeam = useCallback(
    async (patch: {
      name?: string;
      description?: string | null;
      avatar_url?: string | null;
    }): Promise<{ error: string | null }> => {
      if (!myTeam) return { error: 'Kein Team' };
      const { error: err } = await supabase.from('teams').update(patch).eq('id', myTeam.id);
      if (err) return { error: err.message };
      await load();
      return { error: null };
    },
    [myTeam, load],
  );

  const deleteTeam = useCallback(
    async (teamId: string): Promise<{ error: string | null }> => {
      const { error: err } = await supabase.from('teams').delete().eq('id', teamId);
      if (err) return { error: err.message };
      await load();
      return { error: null };
    },
    [load],
  );

  const myWeeklyTotal = memberStats.find((m) => m.user_id === user?.id)?.weekly_amount ?? 0;
  const myRank = leaderboard.findIndex((t) => t.my_team) + 1;

  return {
    myTeam,
    myMembership,
    memberStats,
    leaderboard,
    loading,
    error,
    refetch: load,
    myWeeklyTotal,
    myRank,
    createTeam,
    joinTeam,
    leaveTeam,
    updateTeam,
    deleteTeam,
  };
}
