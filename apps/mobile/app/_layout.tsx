import 'react-native-url-polyfill/auto';
import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase } from '../src/lib/supabase';
import { useAuthStore } from '../src/stores/authStore';

export default function RootLayout() {
  const { session, profile, setSession, fetchProfile, fetchSettings, loading } = useAuthStore();
  const router = useRouter();
  const segments = useSegments();

  // Listen for auth state changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id);
        fetchSettings(session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        if (session?.user) {
          fetchProfile(session.user.id);
          fetchSettings(session.user.id);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Redirect based on auth + role
  useEffect(() => {
    if (loading) return;

    const inAuth = segments[0] === '(auth)';

    if (!session) {
      // Not logged in → go to login
      if (!inAuth) router.replace('/(auth)/login');
    } else if (session && profile) {
      // Logged in → go to correct home
      if (inAuth) {
        router.replace(
          profile.role === 'teacher' ? '/(teacher)/home' : '/(student)/home'
        );
      }
    }
  }, [session, profile, loading, segments]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(student)" />
        <Stack.Screen name="(teacher)" />
      </Stack>
    </GestureHandlerRootView>
  );
}
