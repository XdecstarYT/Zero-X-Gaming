// Generated from the Supabase schema (supabase/migrations). Regenerate after schema changes:
//   npx supabase gen types typescript --project-id tbvaqinnbicxhlaqltik > src/lib/supabase/database.types.ts
// (Trimmed to the Database type plus a Tables helper.)

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      challenge_pool: {
        Row: {
          goal: number
          id: string
          idx: number
          kind: string
          metric: string
          season_id: string
          title: string
          xp: number
        }
        Insert: {
          goal: number
          id: string
          idx: number
          kind: string
          metric: string
          season_id: string
          title: string
          xp: number
        }
        Update: {
          goal?: number
          id?: string
          idx?: number
          kind?: string
          metric?: string
          season_id?: string
          title?: string
          xp?: number
        }
        Relationships: []
      }
      challenge_progress: {
        Row: {
          challenge_id: string
          completed_at: string | null
          period: string
          progress: number
          season_id: string
          user_id: string
        }
        Insert: {
          challenge_id: string
          completed_at?: string | null
          period: string
          progress?: number
          season_id: string
          user_id: string
        }
        Update: {
          challenge_id?: string
          completed_at?: string | null
          period?: string
          progress?: number
          season_id?: string
          user_id?: string
        }
        Relationships: []
      }
      player_cosmetics: {
        Row: {
          acquired_at: string
          item_id: string
          kind: string
          source: string
          user_id: string
        }
        Insert: {
          acquired_at?: string
          item_id: string
          kind: string
          source: string
          user_id: string
        }
        Update: {
          acquired_at?: string
          item_id?: string
          kind?: string
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      player_loadout: {
        Row: {
          banner: string
          outfit: string
          updated_at: string
          user_id: string
          wrap: string
        }
        Insert: {
          banner?: string
          outfit?: string
          updated_at?: string
          user_id: string
          wrap?: string
        }
        Update: {
          banner?: string
          outfit?: string
          updated_at?: string
          user_id?: string
          wrap?: string
        }
        Relationships: []
      }
      season_progress: {
        Row: {
          kills: number
          last_match_at: string | null
          matches: number
          season_id: string
          user_id: string
          wins: number
          xp: number
        }
        Insert: {
          kills?: number
          last_match_at?: string | null
          matches?: number
          season_id: string
          user_id: string
          wins?: number
          xp?: number
        }
        Update: {
          kills?: number
          last_match_at?: string | null
          matches?: number
          season_id?: string
          user_id?: string
          wins?: number
          xp?: number
        }
        Relationships: []
      }
      season_rewards: {
        Row: {
          item_id: string
          kind: string
          season_id: string
          tier: number
        }
        Insert: {
          item_id: string
          kind: string
          season_id: string
          tier: number
        }
        Update: {
          item_id?: string
          kind?: string
          season_id?: string
          tier?: number
        }
        Relationships: []
      }
      seasons: {
        Row: {
          ends_at: string
          id: string
          name: string
          number: number
          starts_at: string
          tier_xp: number
          tiers: number
        }
        Insert: {
          ends_at: string
          id: string
          name: string
          number: number
          starts_at: string
          tier_xp: number
          tiers: number
        }
        Update: {
          ends_at?: string
          id?: string
          name?: string
          number?: number
          starts_at?: string
          tier_xp?: number
          tiers?: number
        }
        Relationships: []
      }
      siege_matches: {
        Row: {
          chests: number
          created_at: string
          damage: number
          id: number
          kills: number
          placement: number
          players: number
          season_id: string
          survived_s: number
          user_id: string
          xp: number
        }
        Insert: {
          chests: number
          created_at?: string
          damage: number
          id?: number
          kills: number
          placement: number
          players: number
          season_id: string
          survived_s: number
          user_id: string
          xp: number
        }
        Update: {
          chests?: number
          created_at?: string
          damage?: number
          id?: number
          kills?: number
          placement?: number
          players?: number
          season_id?: string
          survived_s?: number
          user_id?: string
          xp?: number
        }
        Relationships: []
      }
      achievements: {
        Row: { created_at: string; description: string; id: string; name: string; tier: string; xp_reward: number };
        Insert: {
          created_at?: string;
          description: string;
          id: string;
          name: string;
          tier: string;
          xp_reward?: number;
        };
        Update: {
          created_at?: string;
          description?: string;
          id?: string;
          name?: string;
          tier?: string;
          xp_reward?: number;
        };
        Relationships: [];
      };
      daily_streaks: {
        Row: { current_streak: number; last_active_date: string | null; longest_streak: number; user_id: string };
        Insert: { current_streak?: number; last_active_date?: string | null; longest_streak?: number; user_id: string };
        Update: {
          current_streak?: number;
          last_active_date?: string | null;
          longest_streak?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "daily_streaks_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      favorites: {
        Row: { created_at: string; game_slug: string; user_id: string };
        Insert: { created_at?: string; game_slug: string; user_id?: string };
        Update: { created_at?: string; game_slug?: string; user_id?: string };
        Relationships: [
          {
            foreignKeyName: "favorites_game_slug_fkey";
            columns: ["game_slug"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["slug"];
          },
          {
            foreignKeyName: "favorites_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      games: {
        Row: {
          category: string;
          created_at: string;
          max_score: number;
          max_score_per_second: number;
          slug: string;
          status: string;
          title: string;
          xp_divisor: number;
        };
        Insert: {
          category: string;
          created_at?: string;
          max_score: number;
          max_score_per_second: number;
          slug: string;
          status?: string;
          title: string;
          xp_divisor?: number;
        };
        Update: {
          category?: string;
          created_at?: string;
          max_score?: number;
          max_score_per_second?: number;
          slug?: string;
          status?: string;
          title?: string;
        };
        Relationships: [];
      };
      play_sessions: {
        Row: { ended_at: string | null; game_slug: string; id: number; started_at: string; user_id: string };
        Insert: { ended_at?: string | null; game_slug: string; id?: never; started_at?: string; user_id?: string };
        Update: { ended_at?: string | null; game_slug?: string; id?: never; started_at?: string; user_id?: string };
        Relationships: [
          {
            foreignKeyName: "play_sessions_game_slug_fkey";
            columns: ["game_slug"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["slug"];
          },
          {
            foreignKeyName: "play_sessions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      player_achievements: {
        Row: { achievement_id: string; earned_at: string; user_id: string };
        Insert: { achievement_id: string; earned_at?: string; user_id: string };
        Update: { achievement_id?: string; earned_at?: string; user_id?: string };
        Relationships: [
          {
            foreignKeyName: "player_achievements_achievement_id_fkey";
            columns: ["achievement_id"];
            isOneToOne: false;
            referencedRelation: "achievements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "player_achievements_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          id: string;
          is_hidden: boolean;
          updated_at: string;
          username: string;
          xp: number;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          id: string;
          updated_at?: string;
          username: string;
          xp?: number;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          id?: string;
          updated_at?: string;
          username?: string;
          xp?: number;
        };
        Relationships: [];
      };
      reports: {
        Row: {
          created_at: string;
          details: string | null;
          id: number;
          reason: string;
          reporter_id: string;
          status: string;
          target_id: string;
          target_type: string;
        };
        Insert: {
          created_at?: string;
          details?: string | null;
          id?: never;
          reason: string;
          reporter_id: string;
          status?: string;
          target_id: string;
          target_type: string;
        };
        Update: {
          created_at?: string;
          details?: string | null;
          id?: never;
          reason?: string;
          reporter_id?: string;
          status?: string;
          target_id?: string;
          target_type?: string;
        };
        Relationships: [];
      };
      scores: {
        Row: { created_at: string; duration_ms: number; game_slug: string; id: number; score: number; user_id: string };
        Insert: {
          created_at?: string;
          duration_ms: number;
          game_slug: string;
          id?: never;
          score: number;
          user_id: string;
        };
        Update: {
          created_at?: string;
          duration_ms?: number;
          game_slug?: string;
          id?: never;
          score?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "scores_game_slug_fkey";
            columns: ["game_slug"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["slug"];
          },
          {
            foreignKeyName: "scores_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      xp_events: {
        Row: { amount: number; created_at: string; id: number; reason: string; ref: string | null; user_id: string };
        Insert: {
          amount: number;
          created_at?: string;
          id?: never;
          reason: string;
          ref?: string | null;
          user_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          id?: never;
          reason?: string;
          ref?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "xp_events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      record_siege_match: {
        Args: {
          p_chests: number
          p_damage: number
          p_kills: number
          p_placement: number
          p_players: number
          p_survived_s: number
        }
        Returns: Json
      }
      set_loadout: {
        Args: { p_banner: string; p_outfit: string; p_wrap: string }
        Returns: undefined
      }
      siege_match_xp: {
        Args: {
          p_chests: number
          p_damage: number
          p_kills: number
          p_placement: number
          p_survived_s: number
        }
        Returns: number
      }
      get_leaderboard: {
        Args: { p_game_slug?: string; p_limit?: number; p_period?: string };
        Returns: {
          avatar_url: string;
          rank: number;
          score: number;
          user_id: string;
          username: string;
          xp: number;
        }[];
      };
      report_content: {
        Args: { p_details?: string; p_reason: string; p_target_id: string; p_target_type: string };
        Returns: undefined;
      };
      submit_score: {
        Args: { p_duration_ms: number; p_game_slug: string; p_score: number };
        Returns: {
          daily_rank: number;
          is_personal_best: boolean;
          new_achievements: string[];
          personal_best: number;
          score_id: number;
          total_xp: number;
          xp_gained: number;
        }[];
      };
      touch_daily_streak: {
        Args: never;
        Returns: {
          current_streak: number;
          last_active_date: string;
          longest_streak: number;
          new_achievements: string[];
          xp_gained: number;
        }[];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
