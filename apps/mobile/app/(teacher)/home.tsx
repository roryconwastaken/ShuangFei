import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/stores/authStore';

interface StudentRow {
  student_id: string;
  name: string;
  joined_at: string;
}

export default function TeacherHome() {
  const router = useRouter();
  const { profile, signOut } = useAuthStore();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('student_teacher')
      .select('student_id, joined_at, student:profiles!student_id(name)')
      .eq('teacher_id', profile?.id)
      .order('joined_at', { ascending: false });

    setStudents(
      (data ?? []).map((row: any) => ({
        student_id: row.student_id,
        name: row.student?.name ?? 'Unknown',
        joined_at: row.joined_at,
      }))
    );
    setLoading(false);
  }, [profile?.id]);

  useFocusEffect(useCallback(() => { fetchStudents(); }, [fetchStudents]));

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.name}>{profile?.name}</Text>
        </View>
        <TouchableOpacity onPress={signOut} style={styles.signOutBtn}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Class code */}
      {profile?.class_code && (
        <View style={styles.codeBar}>
          <Text style={styles.codeLabel}>Class Code</Text>
          <Text style={styles.code}>{profile.class_code}</Text>
          <Text style={styles.codeHint}>Share with students</Text>
        </View>
      )}

      {/* Section title */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Your Students</Text>
        <Text style={styles.sectionCount}>{students.length}</Text>
      </View>

      {/* Student list */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#e63946" size="large" />
      ) : students.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>👥</Text>
          <Text style={styles.emptyText}>No students yet.</Text>
          <Text style={styles.emptySubtext}>Share your class code so students can join.</Text>
        </View>
      ) : (
        <FlatList
          data={students}
          keyExtractor={s => s.student_id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/(teacher)/student/${item.student_id}`)}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.cardName}>{item.name}</Text>
                <Text style={styles.cardDate}>Joined {formatDate(item.joined_at)}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f8' },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 24,
    paddingVertical: 20,
    gap: 12,
  },
  greeting: { color: 'rgba(255,255,255,0.6)', fontSize: 13 },
  name: { color: '#fff', fontSize: 20, fontWeight: '700', marginTop: 2 },
  signOutBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8,
    alignSelf: 'flex-start', marginTop: 4,
  },
  signOutText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  codeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 24,
    paddingBottom: 16,
    gap: 10,
  },
  codeLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '600' },
  code: { fontSize: 22, fontWeight: '800', color: '#e63946', letterSpacing: 4 },
  codeHint: { color: 'rgba(255,255,255,0.35)', fontSize: 11 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
    gap: 8,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1a1a2e' },
  sectionCount: {
    fontSize: 12, fontWeight: '700', color: '#e63946',
    backgroundColor: '#fff0f0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
  },
  list: { paddingHorizontal: 16, paddingBottom: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    gap: 14,
    shadowColor: '#000', shadowOpacity: 0.05,
    shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#e63946', justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 16, fontWeight: '700', color: '#1a1a2e' },
  cardDate: { fontSize: 12, color: '#aaa', marginTop: 2 },
  chevron: { fontSize: 22, color: '#ccc' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 17, fontWeight: '600', color: '#555' },
  emptySubtext: { fontSize: 14, color: '#aaa', textAlign: 'center', paddingHorizontal: 32 },
});
