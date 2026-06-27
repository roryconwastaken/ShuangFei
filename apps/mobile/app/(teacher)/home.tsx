import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAuthStore } from '../../src/stores/authStore';

export default function TeacherHome() {
  const { profile, signOut } = useAuthStore();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome, {profile?.name} 👋</Text>
      <Text style={styles.subtitle}>Teacher Home — coming soon</Text>
      {profile?.class_code && (
        <View style={styles.codeBox}>
          <Text style={styles.codeLabel}>Your Class Code</Text>
          <Text style={styles.code}>{profile.class_code}</Text>
          <Text style={styles.codeHint}>Share this with your students</Text>
        </View>
      )}
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
  codeBox: {
    marginTop: 24,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  codeLabel: { fontSize: 12, color: '#888', fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
  code: { fontSize: 36, fontWeight: '800', color: '#e63946', letterSpacing: 6, marginVertical: 8 },
  codeHint: { fontSize: 12, color: '#aaa' },
  signOut: { marginTop: 32, padding: 12, backgroundColor: '#e63946', borderRadius: 8 },
  signOutText: { color: '#fff', fontWeight: '600' },
});
