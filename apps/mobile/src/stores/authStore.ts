import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import { supabase, Profile, UserSettings } from '../lib/supabase';

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  settings: UserSettings | null;
  loading: boolean;
  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  setSettings: (settings: UserSettings | null) => void;
  fetchProfile: (userId: string) => Promise<void>;
  fetchSettings: (userId: string) => Promise<void>;
  updateSettings: (
    partial: Partial<Pick<UserSettings, 'pen_size_s' | 'pen_size_m' | 'pen_size_l' | 'pen_colors'>>
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  settings: null,
  loading: true,

  setSession: (session) =>
    set({ session, user: session?.user ?? null, loading: false }),

  setProfile: (profile) => set({ profile }),
  setSettings: (settings) => set({ settings }),

  fetchProfile: async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();       // returns null (not an error) when no row found
    if (!error) set({ profile: data ?? null });
  },

  fetchSettings: async (userId) => {
    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (!error) set({ settings: data ?? null });
  },

  updateSettings: async (partial) => {
    const userId = get().user?.id;
    if (!userId) return { error: 'Not signed in' };

    // Client-side S<M<L guard, ahead of the DB check constraint
    const current = get().settings;
    const merged = { ...current, ...partial };
    if (
      merged.pen_size_s != null && merged.pen_size_m != null && merged.pen_size_l != null &&
      !(merged.pen_size_s < merged.pen_size_m && merged.pen_size_m < merged.pen_size_l)
    ) {
      return { error: 'Pen sizes must stay in order: S < M < L.' };
    }

    const { data, error } = await supabase
      .from('user_settings')
      .update(partial)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error) return { error: error.message };
    set({ settings: data });
    return { error: null };
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, profile: null, settings: null });
  },
}));
