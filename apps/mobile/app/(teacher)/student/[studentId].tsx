import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase, Document } from '../../../src/lib/supabase';

export default function StudentHomework() {
  const { studentId } = useLocalSearchParams<{ studentId: string }>();
  const router = useRouter();
  const [studentName, setStudentName] = useState('');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [profileRes, docsRes] = await Promise.all([
      supabase.from('profiles').select('name').eq('id', studentId).maybeSingle(),
      supabase
        .from('documents')
        .select('*')
        .eq('owner_id', studentId)
        .eq('type', 'homework')
        .order('updated_at', { ascending: false }),
    ]);
    setStudentName(profileRes.data?.name ?? 'Student');
    setDocuments(docsRes.data ?? []);
    setLoading(false);
  }, [studentId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{studentName}</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Homework</Text>
        {!loading && <Text style={styles.sectionCount}>{documents.length}</Text>}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#8B1A1A" size="large" />
      ) : documents.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📭</Text>
          <Text style={styles.emptyText}>No homework submitted yet.</Text>
        </View>
      ) : (
        <FlatList
          data={documents}
          keyExtractor={d => d.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#8B1A1A']} tintColor="#8B1A1A" />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/(teacher)/document/${item.id}`)}
            >
              <View style={styles.cardLeft}>
                <Text style={styles.cardIcon}>📚</Text>
                <View>
                  <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                  <Text style={styles.cardMeta}>
                    {item.page_count} page{item.page_count !== 1 ? 's' : ''} · {formatDate(item.updated_at)}
                  </Text>
                </View>
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
  container: { flex: 1, backgroundColor: '#FDFBF8' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2A1515',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { width: 60 },
  backText: { color: '#8B1A1A', fontSize: 15, fontWeight: '600' },
  title: {
    flex: 1, textAlign: 'center',
    color: '#fff', fontSize: 16, fontWeight: '700',
    marginHorizontal: 8,
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8, gap: 8,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#2A1515' },
  sectionCount: {
    fontSize: 12, fontWeight: '700', color: '#8B1A1A',
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
    shadowColor: '#000', shadowOpacity: 0.05,
    shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIcon: { fontSize: 26 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#2A1515', maxWidth: 240 },
  cardMeta: { fontSize: 12, color: '#aaa', marginTop: 3 },
  chevron: { fontSize: 22, color: '#ccc', marginLeft: 8 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 17, fontWeight: '600', color: '#555' },
});
