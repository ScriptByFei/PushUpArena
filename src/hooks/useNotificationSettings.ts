import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

export interface NotificationSettings {
  motivations_push_enabled: boolean;
  daily_goal_push_enabled: boolean;
  weekly_goal_push_enabled: boolean;
  streak_push_enabled: boolean;
  quiet_hours_start: number;
  quiet_hours_end: number;
}

const DEFAULTS: NotificationSettings = {
  motivations_push_enabled: true,
  daily_goal_push_enabled: true,
  weekly_goal_push_enabled: true,
  streak_push_enabled: true,
  quiet_hours_start: 23,
  quiet_hours_end: 7,
};

export function useNotificationSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select(
        'motivations_push_enabled, daily_goal_push_enabled, weekly_goal_push_enabled, streak_push_enabled, quiet_hours_start, quiet_hours_end',
      )
      .eq('id', user.id)
      .single();
    if (data) {
      setSettings({
        motivations_push_enabled: data.motivations_push_enabled ?? true,
        daily_goal_push_enabled: data.daily_goal_push_enabled ?? true,
        weekly_goal_push_enabled: data.weekly_goal_push_enabled ?? true,
        streak_push_enabled: data.streak_push_enabled ?? true,
        quiet_hours_start: data.quiet_hours_start ?? 23,
        quiet_hours_end: data.quiet_hours_end ?? 7,
      });
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (patch: Partial<NotificationSettings>) => {
      if (!user) return { error: 'Not logged in' };
      setSaving(true);
      const newSettings = { ...settings, ...patch };
      setSettings(newSettings); // optimistic
      const { error } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', user.id);
      setSaving(false);
      if (error) {
        setSettings(settings); // rollback
        return { error: error.message };
      }
      return { error: null };
    },
    [user, settings],
  );

  return { settings, loading, saving, save };
}
