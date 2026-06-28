import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, ActivityIndicator, Alert, Modal,
  TextInput, KeyboardAvoidingView, Platform, RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase, Document } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/stores/authStore';
import { listLocalNotes, deleteLocalNote, LocalNote } from '../../src/lib/localNotes';

type DisplayDoc = (Document | LocalNote) & { id: string };

const TYPE_ICON: Record<string, string> = {
  homework: '📚',
  notes: '📝',
};

export default function StudentHome() {
  const router = useRouter();
  const { profile, signOut } = useAuthStore();
  const [documents, setDocuments] = useState<DisplayDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [teacherName, setTeacherName] = useState<string | null>(null);
  const [activeWhiteboard, setActiveWhiteboard] = useState<{ id: string; title: string } | null>(null);

  // Join class modal state
  const [joinVisible, setJoinVisible] = useState(false);
  const [classCode, setClassCode] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState('');

  const fetchDocuments = useCallback(async () => {
    setLoading(true);

    // Homework from Supabase
    const { data: remote } = await supabase
      .from('documents')
      .select('*')
      .eq('owner_id', profile?.id)
      .eq('type', 'homework')
      .order('updated_at', { ascending: false });

    // Notes from local storage
    const local = await listLocalNotes();

    const merged = [
      ...(remote ?? []),
      ...local,
    ].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    setDocuments(merged as DisplayDoc[]);

    // Current teacher + active whiteboard
    const { data: st } = await supabase
      .from('student_teacher')
      .select('teacher_id, teacher:profiles!teacher_id(name)')
      .eq('student_id', profile?.id)
      .maybeSingle();
    setTeacherName((st?.teacher as any)?.name ?? null);

    if (st?.teacher_id) {
      const { data: wb } = await supabase
        .from('whiteboard_shares')
        .select('document:documents(id, title)')
        .eq('teacher_id', st.teacher_id)
        .eq('is_active', true)
        .maybeSingle();
      setActiveWhiteboard((wb?.document as any) ?? null);
    } else {
      setActiveWhiteboard(null);
    }

    setLoading(false);
  }, [profile?.id]);

  useFocusEffect(useCallback(() => { fetchDocuments(); }, [fetchDocuments]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchDocuments();
    setRefreshing(false);
  }, [fetchDocuments]);

  const handleJoinClass = async () => {
    const code = classCode.trim().toUpperCase();
    if (code.length < 6) { setJoinError('Enter the 6-character class code.'); return; }
    setJoinLoading(true);
    setJoinError('');

    // Find teacher by class_code
    const { data: teacher } = await supabase
      .from('profiles')
      .select('id, name')
      .eq('class_code', code)
      .eq('role', 'teacher')
      .maybeSingle();

    if (!teacher) {
      setJoinError('Class code not found. Check with your teacher.');
      setJoinLoading(false);
      return;
    }

    // Upsert student_teacher (UNIQUE on student_id - replaces existing teacher)
    const { error } = await supabase
      .from('student_teacher')
      .upsert({ student_id: profile?.id, teacher_id: teacher.id }, { onConflict: 'student_id' });

    setJoinLoading(false);

    if (error) {
      setJoinError(error.message);
    } else {
      setTeacherName(teacher.name);
      setJoinVisible(false);
      setClassCode('');
      Alert.alert('Joined!', `You are now in ${teacher.name}'s class.`);
    }
  };

  const handleDelete = async (doc: DisplayDoc) => {
    if (doc.id.startsWith('local_')) {
      await deleteLocalNote(doc.id);
    } else {
      await supabase.from('documents').delete().eq('id', doc.id);
    }
    fetchDocuments();
  };

  const confirmDelete = (doc: DisplayDoc) => {
    Alert.alert(
      'Delete Document',
      `Delete "${doc.title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => handleDelete(doc) },
      ],
    );
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.name}>{profile?.name}</Text>
          {teacherName ? (
            <TouchableOpacity onPress={() => setJoinVisible(true)}>
              <Text style={styles.teacherLabel}>
                Teacher: {teacherName} <Text style={styles.teacherChange}>(change)</Text>
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.joinBtn} onPress={() => setJoinVisible(true)}>
              <Text style={styles.joinBtnText}>👥 Join a class</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity onPress={signOut} style={styles.signOutBtn}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Live whiteboard banner */}
      {activeWhiteboard && (
        <TouchableOpacity
          style={styles.wbBanner}
          onPress={() => router.push(`/(student)/whiteboard/${activeWhiteboard.id}`)}
        >
          <View style={styles.wbLiveDot} />
          <View style={{ flex: 1 }}>
            <Text style={styles.wbBannerLabel}>Live Whiteboard</Text>
            <Text style={styles.wbBannerTitle} numberOfLines={1}>{activeWhiteboard.title}</Text>
          </View>
          <Text style={styles.wbBannerChevron}>›</Text>
        </TouchableOpacity>
      )}

      {/* New document button */}
      <TouchableOpacity
        style={styles.newBtn}
        onPress={() => router.push('/(student)/document/new')}
      >
        <Text style={styles.newBtnIcon}>+</Text>
        <Text style={styles.newBtnText}>New Document</Text>
      </TouchableOpacity>

      {/* Document list */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#e63946" size="large" />
      ) : documents.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📄</Text>
          <Text style={styles.emptyText}>No documents yet.</Text>
          <Text style={styles.emptySubtext}>Tap "New Document" to get started.</Text>
        </View>
      ) : (
        <FlatList
          data={documents}
          keyExtractor={d => d.id}
          contentContainerStyle={styles.list}
          numColumns={2}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#e63946']} tintColor="#e63946" />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/(student)/document/${item.id}`)}
              onLongPress={() => confirmDelete(item)}
              delayLongPress={500}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardIcon}>{TYPE_ICON[item.type] ?? '📄'}</Text>
                <View style={[
                  styles.badge,
                  item.type === 'homework' ? styles.badgeHomework : styles.badgeNotes,
                ]}>
                  <Text style={styles.badgeText}>{item.type}</Text>
                </View>
              </View>
              <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.cardDate}>{formatDate(item.updated_at)}</Text>
              <Text style={styles.cardPages}>
                {item.page_count} page{item.page_count !== 1 ? 's' : ''}
              </Text>
              <Text style={styles.cardHint}>Hold to delete</Text>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Join Class Modal */}
      <Modal
        visible={joinVisible}
        transparent
        animationType="fade"
        onRequestClose={() => { setJoinVisible(false); setClassCode(''); setJoinError(''); }}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Join a Class</Text>
            <Text style={styles.modalSubtitle}>
              Ask your teacher for their 6-character class code.
            </Text>

            <TextInput
              style={styles.codeInput}
              value={classCode}
              onChangeText={t => { setClassCode(t.toUpperCase()); setJoinError(''); }}
              placeholder="e.g. ABC123"
              placeholderTextColor="#bbb"
              maxLength={6}
              autoCapitalize="characters"
              autoFocus
            />

            {joinError ? <Text style={styles.modalError}>{joinError}</Text> : null}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => { setJoinVisible(false); setClassCode(''); setJoinError(''); }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalJoin, joinLoading && { opacity: 0.6 }]}
                onPress={handleJoinClass}
                disabled={joinLoading}
              >
                {joinLoading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.modalJoinText}>Join</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  teacherLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 4 },
  teacherChange: { color: '#e63946', fontWeight: '600' },
  joinBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 6, alignSelf: 'flex-start',
    backgroundColor: 'rgba(230,57,70,0.15)',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
  },
  joinBtnText: { color: '#e63946', fontSize: 12, fontWeight: '600' },
  signOutBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8,
    alignSelf: 'flex-start', marginTop: 4,
  },
  signOutText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  wbBanner: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginTop: 12, marginBottom: 0,
    padding: 14, borderRadius: 12, gap: 10,
    backgroundColor: '#fff0f0',
    borderWidth: 1.5, borderColor: '#e63946',
  },
  wbLiveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#e63946' },
  wbBannerLabel: { fontSize: 10, fontWeight: '700', color: '#e63946', textTransform: 'uppercase', letterSpacing: 0.5 },
  wbBannerTitle: { fontSize: 14, fontWeight: '700', color: '#1a1a2e', marginTop: 1 },
  wbBannerChevron: { fontSize: 22, color: '#e63946' },
  newBtn: {
    flexDirection: 'row', alignItems: 'center',
    margin: 16, padding: 16, borderRadius: 12,
    backgroundColor: '#e63946', gap: 10,
    shadowColor: '#e63946', shadowOpacity: 0.3,
    shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  newBtnIcon: { color: '#fff', fontSize: 22, fontWeight: '700' },
  newBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 17, fontWeight: '600', color: '#555' },
  emptySubtext: { fontSize: 14, color: '#aaa' },
  list: { padding: 8 },
  card: {
    flex: 1, margin: 8, padding: 16, borderRadius: 12,
    backgroundColor: '#fff', minHeight: 140,
    shadowColor: '#000', shadowOpacity: 0.06,
    shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 10,
  },
  cardIcon: { fontSize: 24 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeHomework: { backgroundColor: '#fff0f0' },
  badgeNotes: { backgroundColor: '#f0f4ff' },
  badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', color: '#666' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#1a1a2e', flex: 1 },
  cardDate: { fontSize: 11, color: '#aaa', marginTop: 8 },
  cardPages: { fontSize: 11, color: '#aaa', marginTop: 2 },
  cardHint: { fontSize: 10, color: '#ccc', marginTop: 6, fontStyle: 'italic' },
  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
  },
  modalCard: {
    backgroundColor: '#fff', borderRadius: 16,
    padding: 28, width: '85%', maxWidth: 400,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#1a1a2e', marginBottom: 6 },
  modalSubtitle: { fontSize: 14, color: '#888', marginBottom: 20 },
  codeInput: {
    borderWidth: 2, borderColor: '#e0e0e0', borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 22, fontWeight: '700', color: '#1a1a1a',
    letterSpacing: 4, textAlign: 'center',
  },
  modalError: { color: '#e63946', fontSize: 13, marginTop: 8, textAlign: 'center' },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 24 },
  modalCancel: {
    flex: 1, paddingVertical: 14, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#e0e0e0', alignItems: 'center',
  },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: '#555' },
  modalJoin: {
    flex: 1, paddingVertical: 14, borderRadius: 10,
    backgroundColor: '#e63946', alignItems: 'center',
  },
  modalJoinText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
