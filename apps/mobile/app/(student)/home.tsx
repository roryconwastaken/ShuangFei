import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAuthStore } from '../../src/stores/authStore';

export default function StudentHome() {
  const { profile, signOut } = useAuthStore();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome, {profile?.name} 👋</Text>
      <Text style={styles.subtitle}>Student Home — coming soon</Text>
      <TouchableOpacity style={styles.signOut} onPress={signOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f4f8' },
  title: { fontSize: 22, fontWeight: '700', color: '#1a1a2e' },
  subtitle: { fontSize: 15, color: '#888', marginTop: 8 },
  signOut: { marginTop: 32, padding: 12, backgroundColor: '#e63946', borderRadius: 8 },
  signOutText: { color: '#fff', fontWeight: '600' },
});
