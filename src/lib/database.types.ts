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
          /** true = diese Übung hat eine aktive Daily Live Challenge */
          is_challenge_enabled: boolean;
        };
        Insert: { name: string; slug: string; unit?: string; is_challenge_enabled?: boolean };
        Update: { name?: string; slug?: string; unit?: string; is_challenge_enabled?: boolean };
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
      // ── Daily Challenge ────────────────────────────────────────────────────
      daily_challenge_participations: {
        Row: {
          id: string;
          user_id: string;
          exercise_id: string;
          challenge_date: string;   // 'YYYY-MM-DD'
          joined_at: string;        // timestamptz → ISO string
          created_at: string;
          imported_amount: number;  // Wdh. aus workout_entries beim Beitritt importiert
        };
        Insert: {
          id?: string;
          user_id: string;
          exercise_id: string;
          challenge_date: string;
          joined_at?: string;
          created_at?: string;
        };
        Update: never;              // immutable — no client updates
        Relationships: [];
      };
      daily_challenge_entries: {
        Row: {
          id: string;
          participation_id: string;
          user_id: string;
          exercise_id: string;
          challenge_date: string;
          repetitions: number;      // integer, 10–100
          created_at: string;
          is_flagged: boolean;
          flag_reason: string | null;
          workout_entry_id: string | null;  // Link zum Dashboard-Eintrag (nullable)
          is_imported: boolean;             // TRUE = automatisch beim Beitritt importiert (READ-ONLY)
        };
        Insert: never;              // only via log_challenge_set RPC
        Update: never;
        Relationships: [];
      };
      daily_challenge_results: {
        Row: {
          id: string;
          user_id: string;
          exercise_id: string;
          challenge_date: string;
          rank: number;
          participant_count: number;
          display_name: string;     // snapshot at finalization time
          avatar_url: string | null;
          total_repetitions: number;
          set_count: number;
          max_set: number | null;
          min_set: number | null;
          avg_set: string | null;   // numeric(6,2) → string in JS
          first_set_at: string | null;
          last_set_at: string | null;
          finalized_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_my_daily_rank: {
        Args: { p_exercise: string };
        Returns: { daily_rank: number; today_amount: number }[];
      };
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
          rest_days_remaining: number;
          is_me: boolean;
          tiebreaker_at: string;
        }[];
      };
      get_friend_today_sets: {
        Args: { p_user_id: string; p_exercise: string };
        Returns: { amount: number }[];
      };
      get_all_active_today: {
        Args: { p_exercise: string };
        Returns: {
          user_id: string;
          username: string;
          display_name: string | null;
          avatar_url: string | null;
          today_amount: number;
          is_me: boolean;
          is_friend: boolean;
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
      // ── Daily Challenge RPCs ───────────────────────────────────────────────
      get_daily_challenge_status: {
        Args: { p_exercise_id: string };
        Returns: {
          is_active: boolean;
          challenge_date: string;              // 'YYYY-MM-DD'
          starts_at: string;                   // ISO timestamptz
          ends_at: string;
          has_joined: boolean;
          server_now: string;                  // ISO timestamptz
          seconds_until_start: number;         // integer
          seconds_until_end: number;           // integer
          join_deadline_passed: boolean;       // true ab 16:20 Uhr Berliner Zeit
          seconds_until_join_deadline: number; // negativ wenn abgelaufen
        };
      };
      join_daily_challenge: {
        Args: { p_exercise_id: string };
        Returns: {
          status?: 'JOINED' | 'ALREADY_JOINED';
          error?: string;
          participation_id?: string;
          imported_amount?: number;  // Anzahl importierter Wdh. beim Beitritt (0 wenn keine)
        };
      };
      log_challenge_set: {
        Args: {
          p_exercise_id: string;
          p_repetitions: number;
          /** Optional: ID des verknüpften workout_entries-Datensatzes (Dashboard-Auto-Log) */
          p_workout_entry_id?: string | null;
        };
        Returns: {
          status?: 'OK';
          error?: string;
          entry_id?: string;
          total_repetitions?: number;
          set_count?: number;
          seconds_remaining?: number;
          message?: string;
        };
      };
      get_daily_challenge_leaderboard: {
        Args: { p_exercise_id: string; p_date?: string | null };
        Returns: {
          user_id: string;
          display_name: string;
          avatar_url: string | null;
          total_repetitions: number;
          set_count: number;
          max_set: number | null;
          min_set: number | null;
          average_set: string | null;   // numeric(6,2) → string in JS
          first_set_at: string | null;
          last_set_at: string | null;
          joined_at: string;
          rank: number;                 // bigint safely fits in number
          is_me: boolean;
        }[];
      };
      get_my_challenge_sets: {
        Args: { p_exercise_id: string; p_date?: string | null };
        Returns: {
          id: string;
          repetitions: number;
          created_at: string;
          edit_until: string | null;
          is_imported: boolean;  // TRUE = importierter Startwert (READ-ONLY)
        }[];
      };
      update_challenge_set: {
        Args: { p_entry_id: string; p_repetitions: number };
        Returns: Json;
      };
      delete_challenge_set: {
        Args: { p_entry_id: string };
        Returns: Json;
      };
      get_challenge_history: {
        Args: { p_exercise_id: string; p_limit?: number };
        Returns: {
          challenge_date: string;       // 'YYYY-MM-DD'
          rank: number;
          participant_count: number;
          display_name: string;
          avatar_url: string | null;
          total_repetitions: number;
          set_count: number;
          max_set: number | null;
          min_set: number | null;
          avg_set: string | null;       // numeric(6,2) → string in JS
          first_set_at: string | null;
          last_set_at: string | null;
        }[];
      };
      get_daily_challenge_day_details: {
        Args: { p_exercise_id: string; p_date: string };
        // JSONB return — parsed by Supabase to JS object
        Returns: {
          error?: string;
          summary?: {
            challenge_date: string;
            participant_count: number;
            total_repetitions: number;
            total_sets: number;
            max_set: number | null;
            winner_user_id: string | null;
            winner_display_name: string | null;
            winner_avatar_url: string | null;
            winner_total_repetitions: number | null;
          };
          leaderboard?: {
            rank: number;
            user_id: string;
            display_name: string;
            avatar_url: string | null;
            total_repetitions: number;
            set_count: number;
            max_set: number | null;
            min_set: number | null;
            avg_set: string | null;     // numeric(6,2) → string in JS
            first_set_at: string | null;
            last_set_at: string | null;
            is_me: boolean;
          }[];
        };
      };
      get_daily_challenge_participant_sets: {
        Args: { p_exercise_id: string; p_date: string; p_user_id: string };
        Returns: {
          entry_id: string;
          set_number: number;
          repetitions: number;
          created_at: string;
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
export type RestDay = { id: string; user_id: string; exercise_id: string; rest_date: string; created_at: string };
export type UserGoal = Database['public']['Tables']['user_goals']['Row'];
export type FriendRequest = Database['public']['Tables']['friend_requests']['Row'];
export type Achievement = Database['public']['Tables']['achievements']['Row'];
export type UserAchievement = Database['public']['Tables']['user_achievements']['Row'];

export type MyStats = Database['public']['Functions']['get_my_stats']['Returns'][number];
export type MyDailyRank = Database['public']['Functions']['get_my_daily_rank']['Returns'][number];
export type LeaderboardRow = Database['public']['Functions']['get_friend_leaderboard']['Returns'][number];
export type GlobalLeaderboardRow = LeaderboardRow & { is_friend: boolean; has_pending_request: boolean };
export type Team = Database['public']['Tables']['teams']['Row'];
export type TeamMember = Database['public']['Tables']['team_members']['Row'];
export type TeamLeaderboardRow = Database['public']['Functions']['get_team_leaderboard']['Returns'][number];
export type TeamMemberStat = Database['public']['Functions']['get_team_member_stats']['Returns'][number];
// quick_amounts is part of profiles.Row — added inline above
