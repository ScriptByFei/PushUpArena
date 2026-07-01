import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

export interface FriendProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface Friend {
  created_at: string;
  friend: FriendProfile;
}

export interface IncomingRequest {
  id: string;
  created_at: string;
  sender: FriendProfile;
}

export interface OutgoingRequest {
  id: string;
  created_at: string;
  receiver: FriendProfile;
}

const PROFILE_FIELDS = 'id, username, display_name, avatar_url';

export function useFriends() {
  const { user } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<IncomingRequest[]>([]);
  const [outgoing, setOutgoing] = useState<OutgoingRequest[]>([]);
  const [allUsers, setAllUsers] = useState<FriendProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    const [friendsRes, incomingRes, outgoingRes, allUsersRes] = await Promise.all([
      supabase
        .from('friendships')
        .select(`created_at, friend:profiles!friendships_friend_fkey(${PROFILE_FIELDS})`)
        .eq('user_id', user.id)
        .returns<Friend[]>(),
      supabase
        .from('friend_requests')
        .select(`id, created_at, sender:profiles!friend_requests_sender_fkey(${PROFILE_FIELDS})`)
        .eq('receiver_id', user.id)
        .eq('status', 'pending')
        .returns<IncomingRequest[]>(),
      supabase
        .from('friend_requests')
        .select(`id, created_at, receiver:profiles!friend_requests_receiver_fkey(${PROFILE_FIELDS})`)
        .eq('sender_id', user.id)
        .eq('status', 'pending')
        .returns<OutgoingRequest[]>(),
      supabase
        .from('profiles')
        .select(PROFILE_FIELDS)
        .neq('id', user.id)
        .order('username')
        .returns<FriendProfile[]>(),
    ]);

    const firstError =
      friendsRes.error || incomingRes.error || outgoingRes.error || allUsersRes.error;
    if (firstError) {
      setError(firstError.message);
    } else {
      setFriends(friendsRes.data ?? []);
      setIncoming(incomingRes.data ?? []);
      setOutgoing(outgoingRes.data ?? []);
      setAllUsers(allUsersRes.data ?? []);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const searchUsers = useCallback(
    async (term: string): Promise<FriendProfile[]> => {
      const clean = term.trim();
      if (!user || clean.length < 2) return [];
      const { data, error: err } = await supabase
        .from('profiles')
        .select(PROFILE_FIELDS)
        .ilike('username', `%${clean}%`)
        .eq('is_searchable', true)
        .neq('id', user.id)
        .order('username')
        .limit(20)
        .returns<FriendProfile[]>();
      if (err) {
        setError(err.message);
        return [];
      }
      return data ?? [];
    },
    [user],
  );

  const sendRequest = useCallback(
    async (receiverId: string): Promise<{ error: string | null; status?: string }> => {
      const { data, error: err } = await supabase.rpc('send_friend_request', {
        p_receiver: receiverId,
      });
      if (err) return { error: err.message };
      await load();
      return { error: null, status: data ?? undefined };
    },
    [load],
  );

  const respond = useCallback(
    async (requestId: string, accept: boolean): Promise<{ error: string | null }> => {
      const { error: err } = await supabase.rpc('respond_friend_request', {
        p_request: requestId,
        p_accept: accept,
      });
      if (err) return { error: err.message };
      await load();
      return { error: null };
    },
    [load],
  );

  const cancelRequest = useCallback(
    async (requestId: string): Promise<{ error: string | null }> => {
      const { error: err } = await supabase.from('friend_requests').delete().eq('id', requestId);
      if (err) return { error: err.message };
      await load();
      return { error: null };
    },
    [load],
  );

  const removeFriend = useCallback(
    async (friendId: string): Promise<{ error: string | null }> => {
      const { error: err } = await supabase.rpc('remove_friend', { p_friend: friendId });
      if (err) return { error: err.message };
      await load();
      return { error: null };
    },
    [load],
  );

  return {
    friends,
    incoming,
    outgoing,
    allUsers,
    loading,
    error,
    refetch: load,
    searchUsers,
    sendRequest,
    respond,
    cancelRequest,
    removeFriend,
  };
}
