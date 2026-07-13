import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Profile } from '@/lib/database.types';

type ProfilePatch = Partial<Pick<Profile, 'username' | 'display_name' | 'avatar_url' | 'bio' | 'is_searchable'>>;

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, bio, is_searchable, created_at, quick_amounts')
      .eq('id', user.id)
      .maybeSingle();
    if (err) setError(err.message);
    else setProfile(data);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateProfile = useCallback(
    async (patch: ProfilePatch): Promise<{ error: string | null }> => {
      if (!user) return { error: 'Nicht angemeldet.' };
      const { data, error: err } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', user.id)
        .select()
        .single();
      if (err) {
        // Eindeutiger Hinweis bei Username-Kollision.
        if (err.code === '23505') return { error: 'Dieser Username ist bereits vergeben.' };
        return { error: err.message };
      }
      setProfile(data);
      return { error: null };
    },
    [user],
  );

  return { profile, loading, error, refetch: load, updateProfile };
}
