import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

const DEFAULT_AMOUNTS = [10, 20, 30, 50];

export function useQuickAmounts() {
  const { user } = useAuth();
  const [amounts, setAmounts] = useState<number[]>(DEFAULT_AMOUNTS);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('quick_amounts')
      .eq('id', user.id)
      .single();
    if (data?.quick_amounts && Array.isArray(data.quick_amounts) && data.quick_amounts.length > 0) {
      setAmounts(data.quick_amounts as number[]);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (newAmounts: number[]) => {
      if (!user) return { error: 'Not logged in' };
      setSaving(true);
      const { error } = await supabase
        .from('profiles')
        .update({ quick_amounts: newAmounts })
        .eq('id', user.id);
      setSaving(false);
      if (!error) setAmounts(newAmounts);
      return { error: error?.message ?? null };
    },
    [user],
  );

  return { amounts, saving, save };
}
