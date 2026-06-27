import { Redirect } from 'expo-router';

// Root index — _layout.tsx handles the real redirect logic.
// This just satisfies Expo Router needing a default route.
export default function Index() {
  return <Redirect href="/(auth)/login" />;
}
