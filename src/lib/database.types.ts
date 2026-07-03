// Handgepflegte Typen passend zum Supabase-Schema (supabase/migrations).
// Können später per `supabase gen types typescript` ersetzt werden.

export type FriendRequestStatus = 'pending' | 'accepted' | 'declined';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          display_name: string | null;
          avatar_url: string | null;
          bio: string | null;
          is_searchable: boolean;
          motivations_push_enabled: boolean;
          daily_goal_push_enabled: boolean;
          weekly_goal_push_enabled: boolean;
          streak_push_enabled: boolean;
          quiet_hours_start: number;
          quiet_hours_end: number;
          quick_amounts: number[] | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username: string;
          display_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          is_searchable?: boolean;
          motivations_push_enabled?: boolean;
          daily_goal_push_enabled?: boolean;
          weekly_goal_push_enabled?: boolean;
          streak_push_enabled?: boolean;
          quiet_hours_start?: number;
          quiet_hours_end?: number;
        };
        Update: {
          username?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          is_searchable?: boolean;
          motivations_push_enabled?: boolean;
          daily_goal_push_enabled?: boolean;
          weekly_goal_push_enabled?: boolean;
          streak_push_enabled?: boolean;
          quiet_hours_start?: number;
          quiet_hours_end?: number;
          quick_amounts?: number[] | null;
        };
        Relationships: [];
      };
      exercises: {
        Row: {
          id: string;
          name: string;
          slug: string;
          unit: string;
          created_at: string;
        };
        Insert: { name: string; slug: string; unit?: string };
        Update: { name?: string; slug?: string; unit?: string };
        Relationships: [];
      };
      workout_entries: {
        Row: {
          id: string;
          user_id: string;
          exercise_id: string;
          amount: number;
          note: string | null;
          performed_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          exercise_id: string;
          amount: number;
          note?: string | null;
          performed_at?: string;
        };
        Update: {
          amount?: number;
          note?: string | null;
          performed_at?: string;
        };
        Relationships: [];
      };
      user_goals: {
        Row: {
          id: string;
          user_id: string;
          exercise_id: string;
          daily_goal: number;
          weekly_goal: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          exercise_id: string;
          daily_goal?: number;
          weekly_goal?: number;
        };
        Update: { daily_goal?: number; weekly_goal?: number };
        Relationships: [];
      };
      friend_requests: {
        Row: {
          id: string;
          sender_id: string;
          receiver_id: string;
          status: FriendRequestStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: { sender_id: string; receiver_id: string; status?: FriendRequestStatus };
        Update: { status?: FriendRequestStatus };
        Relationships: [];
      };
      friendships: {
        Row: { user_id: string; friend_id: string; created_at: string };
        Insert: { user_id: string; friend_id: string };
        Update: never;
        Relationships: [];
      };
      achievements: {
        Row: {
          id: string;
          slug: string;
          name: string;
          description: string;
          icon: string;
          sort_order: number;
          created_at: string;
        };
        Insert: { slug: string; name: string; description: string; icon?: string; sort_order?: number };
        Update: { name?: string; description?: string; icon?: string; sort_order?: number };
        Relationships: [];
      };
      teams: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          avatar_url: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: { name: string; description?: string | null; avatar_url?: string | null; created_by?: string | null };
        Update: { name?: string; description?: string | null; avatar_url?: string | null };
        Relationships: [];
      };
      team_members: {
        Row: {
          id: string;
          team_id: string;
          user_id: string;
          role: 'owner' | 'member';
          joined_at: string;
        };
        Insert: { team_id: string; user_id: string; role?: 'owner' | 'member' };
        Update: { role?: 'owner' | 'member' };
        Relationships: [];
      };
      user_achievements: {
        Row: {
          id: string;
          user_id: string;
          achievement_id: string;
          unlocked_at: string;
        };
        Insert: { user_id: string; achievement_id: string };
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_my_stats: {
        Args: { p_exercise: string };
        Returns: {
          today_amount: number;
          week_amount: number;
          total_amount: number;
          level: number;
          current_streak: number;
        }[];
      };
      get_friend_leaderboard: {
        Args: { p_exercise: string };
        Returns: {
          user_id: string;
          username: string;
          display_name: string | null;
          avatar_url: string | null;
          today_amount: number;
          total_amount: number;
          level: number;
          current_streak: number;
          is_me: boolean;
        }[];
      };
      evaluate_achievements: {
        Args: { p_exercise: string };
        Returns: { slug: string; name: string; icon: string }[];
      };
      send_friend_request: { Args: { p_receiver: string }; Returns: string };
      respond_friend_request: { Args: { p_request: string; p_accept: boolean }; Returns: undefined };
      remove_friend: { Args: { p_friend: string }; Returns: undefined };
      compute_level: { Args: { xp: number }; Returns: number };
      compute_streak: { Args: { p_user: string; p_exercise: string }; Returns: number };
      get_team_leaderboard: {
        Args: { p_exercise: string };
        Returns: {
          team_id: string;
          name: string;
          avatar_url: string | null;
          description: string | null;
          member_count: number;
          weekly_total: number;
          my_team: boolean;
        }[];
      };
      get_team_member_stats: {
        Args: { p_team_id: string; p_exercise: string };
        Returns: {
          user_id: string;
          username: string;
          display_name: string | null;
          avatar_url: string | null;
          role: string;
          weekly_amount: number;
        }[];
      };
    };
    Enums: {
      friend_request_status: FriendRequestStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}

// Bequeme Zeilen-Typen
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Exercise = Database['public']['Tables']['exercises']['Row'];
export type WorkoutEntry = Database['public']['Tables']['workout_entries']['Row'];
export type UserGoal = Database['public']['Tables']['user_goals']['Row'];
export type FriendRequest = Database['public']['Tables']['friend_requests']['Row'];
export type Achievement = Database['public']['Tables']['achievements']['Row'];
export type UserAchievement = Database['public']['Tables']['user_achievements']['Row'];

export type MyStats = Database['public']['Functions']['get_my_stats']['Returns'][number];
export type LeaderboardRow = Database['public']['Functions']['get_friend_leaderboard']['Returns'][number];
export type Team = Database['public']['Tables']['teams']['Row'];
export type TeamMember = Database['public']['Tables']['team_members']['Row'];
export type TeamLeaderboardRow = Database['public']['Functions']['get_team_leaderboard']['Returns'][number];
export type TeamMemberStat = Database['public']['Functions']['get_team_member_stats']['Returns'][number];
// quick_amounts is part of profiles.Row — added inline above
