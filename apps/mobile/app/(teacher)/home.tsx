import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase, Document } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/stores/authStore';

interface StudentRow {
  student_id: string;
  name: string;
  joined_at: string;
}

interface WhiteboardRow extends Document {
  is_active: boolean;
}

export default function TeacherHome() {
  const router = useRouter();
  const { profile, signOut } = useAuthStore();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [whiteboards, setWhiteboards] = useState<WhiteboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);

    const [studentsRes, wbRes] = await Promise.all([
      supabase
        .from('student_teacher')
        .select('student_id, joined_at, student:profiles!student_id(name)')
        .eq('teacher_id', profile?.id)
        .order('joined_at', { ascending: false }),
      supabase
        .from('documents')
        .select('*, whiteboard_shares(is_active)')
        .eq('owner_id', profile?.id)
        .eq('type', 'whiteboard')
        .order('updated_at', { ascending: false }),
    ]);

    setStudents(
      (studentsRes.data ?? []).map((row: any) => ({
        student_id: row.student_id,
        name: row.student?.name ?? 'Unknown',
        joined_at: row.joined_at,
      }))
    );

    setWhiteboards(
      (wbRes.data ?? []).map((doc: any) => ({
        ...doc,
        is_active: doc.whiteboard_shares?.[0]?.is_active ?? false,
      }))
    );

    setLoading(false);
  }, [profile?.id]);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  const ListHeader = () => (
    <>
      {/* Whiteboards section */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Whiteboards</Text>
        <TouchableOpacity style={styles.newWbBtn} onPress={() => router.push('/(teacher)/whiteboard/new')}>
          <Text style={styles.newWbText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {whiteboards.length === 0 ? (
        <View style={styles.wbEmpty}>
          <Text style={styles.wbEmptyText}>No whiteboards yet. Tap + New to create one.</Text>
        </View>
      ) : (
        whiteboards.map(wb => (
          <TouchableOpacity
            key={wb.id}
            style={styles.wbCard}
            onPress={() => router.push(`/(teacher)/whiteboard/${wb.id}`)}
          >
            <Text style={styles.wbIcon}>📋</Text>
            <View style={styles.wbInfo}>
              <Text style={styles.wbTitle} numberOfLines={1}>{wb.title}</Text>
              <Text style={styles.wbDate}>{formatDate(wb.updated_at)}</Text>
            </View>
            <View style={[styles.wbBadge, wb.is_active && styles.wbBadgeLive]}>
              <Text style={[styles.wbBadgeText, wb.is_active && styles.wbBadgeTextLive]}>
                {wb.is_active ? 'Live' : 'Off'}
              </Text>
            </View>
          </TouchableOpacity>
        ))
      )}

      {/* Students section */}
      <View style={[styles.sectionHeader, { marginTop: 12 }]}>
        <Text style={styles.sectionTitle}>Your Students</Text>
        <Text style={styles.sectionCount}>{students.length}</Text>
      </View>
    </>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.name}>{profile?.name}</Text>
        </View>
        <TouchableOpacity onPress={signOut} style={styles.signOutBtn}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {profile?.class_code && (
        <View style={styles.codeBar}>
          <Text style={styles.codeLabel}>Class Code</Text>
          <Text style={styles.code}>{profile.class_code}</Text>
          <Text style={styles.codeHint}>Share with students</Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#e63946" size="large" />
      ) : (
        <FlatList
          data={students}
          keyExtractor={s => s.student_id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={<ListHeader />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#e63946']} tintColor="#e63946" />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>👥</Text>
              <Text style={styles.emptyText}>No students yet.</Text>
              <Text style={styles.emptySubtext}>Share your class code so students can join.</Text>
            </View>
          }
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
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#1a1a2e', paddingHorizontal: 24, paddingVertical: 20, gap: 12,
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
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1a1a2e', paddingHorizontal: 24, paddingBottom: 16, gap: 10,
  },
  codeLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '600' },
  code: { fontSize: 22, fontWeight: '800', color: '#e63946', letterSpacing: 4 },
  codeHint: { color: 'rgba(255,255,255,0.35)', fontSize: 11 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1a1a2e' },
  sectionCount: {
    fontSize: 12, fontWeight: '700', color: '#e63946',
    backgroundColor: '#fff0f0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
  },
  newWbBtn: {
    paddingHorizontal: 12, paddingVertical: 4,
    backgroundColor: '#e63946', borderRadius: 8,
  },
  newWbText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  wbEmpty: { marginHorizontal: 16, marginBottom: 4 },
  wbEmptyText: { color: '#aaa', fontSize: 13 },
  wbCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12,
    marginHorizontal: 16, marginBottom: 8, padding: 14, gap: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  wbIcon: { fontSize: 22 },
  wbInfo: { flex: 1 },
  wbTitle: { fontSize: 14, fontWeight: '700', color: '#1a1a2e' },
  wbDate: { fontSize: 11, color: '#aaa', marginTop: 2 },
  wbBadge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  wbBadgeLive: { backgroundColor: '#fff0f0' },
  wbBadgeText: { fontSize: 11, fontWeight: '700', color: '#aaa' },
  wbBadgeTextLive: { color: '#e63946' },
  list: { paddingHorizontal: 0, paddingBottom: 16 },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12,
    marginHorizontal: 16, marginBottom: 10, padding: 16, gap: 14,
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
  empty: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 17, fontWeight: '600', color: '#555' },
  emptySubtext: { fontSize: 14, color: '#aaa', textAlign: 'center', paddingHorizontal: 32 },
});
