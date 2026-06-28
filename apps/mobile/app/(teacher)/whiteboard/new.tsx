import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../../src/lib/supabase';
import { useAuthStore } from '../../../src/stores/authStore';

interface StudentOption {
  id: string;
  name: string;
  selected: boolean;
}

export default function NewWhiteboard() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(true);

  useEffect(() => {
    const fetchStudents = async () => {
      const { data } = await supabase
        .from('student_teacher')
        .select('student_id, student:profiles!student_id(name)')
        .eq('teacher_id', profile?.id);
      setStudents(
        (data ?? []).map((row: any) => ({
          id: row.student_id,
          name: row.student?.name ?? 'Unknown',
          selected: false,
        }))
      );
      setStudentsLoading(false);
    };
    fetchStudents();
  }, []);

  const toggleStudent = (id: string) => {
    setStudents(prev => prev.map(s => s.id === id ? { ...s, selected: !s.selected } : s));
  };

  const handleCreate = async () => {
    if (!title.trim()) { setError('Please enter a title.'); return; }
    setLoading(true);

    const { data: doc, error: err } = await supabase
      .from('documents')
      .insert({ owner_id: profile?.id, title: title.trim(), type: 'whiteboard', page_count: 1 })
      .select()
      .single();

    if (err || !doc) { setError(err?.message ?? 'Failed to create.'); setLoading(false); return; }

    const selected = students.filter(s => s.selected);
    await Promise.all([
      supabase.from('document_pages').insert({ document_id: doc.id, page_number: 1, student_strokes: [] }),
      supabase.from('whiteboard_shares').insert({ document_id: doc.id, teacher_id: profile?.id, is_active: false }),
      ...(selected.length > 0
        ? [supabase.from('whiteboard_student_shares').insert(
            selected.map(s => ({ document_id: doc.id, student_id: s.id }))
          )]
        : []),
    ]);

    setLoading(false);
    router.replace(`/(teacher)/whiteboard/${doc.id}`);
  };

  const selectedCount = students.filter(s => s.selected).length;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.back}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.heading}>New Whiteboard</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={styles.icon}>📋</Text>
          <Text style={styles.desc}>Create a whiteboard to draw and share with your students live.</Text>

          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={t => { setTitle(t); setError(''); }}
            placeholder="e.g. Lesson 3 - Stroke Order"
            placeholderTextColor="#aaa"
            autoFocus
            returnKeyType="done"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {/* Student selection */}
          <View style={styles.studentsHeader}>
            <Text style={styles.label}>Share with students</Text>
            {selectedCount > 0 && (
              <Text style={styles.selectedCount}>{selectedCount} selected</Text>
            )}
          </View>
          <Text style={styles.studentsHint}>Optional — you can also share from inside the whiteboard.</Text>

          {studentsLoading ? (
            <ActivityIndicator color="#8B1A1A" style={{ marginTop: 12 }} />
          ) : students.length === 0 ? (
            <Text style={styles.noStudents}>No students in your class yet.</Text>
          ) : (
            <View style={styles.studentList}>
              {students.map(s => (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.studentRow, s.selected && styles.studentRowSelected]}
                  onPress={() => toggleStudent(s.id)}
                >
                  <View style={[styles.checkbox, s.selected && styles.checkboxSelected]}>
                    {s.selected && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={[styles.studentName, s.selected && styles.studentNameSelected]}>
                    {s.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleCreate}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>Create Whiteboard</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FDFBF8' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  backBtn: { width: 60 },
  back: { color: '#8B1A1A', fontSize: 15, fontWeight: '600' },
  heading: { fontSize: 17, fontWeight: '700', color: '#2A1515' },
  body: { padding: 24, maxWidth: 600, width: '100%', alignSelf: 'center' },
  icon: { fontSize: 48, textAlign: 'center', marginTop: 8 },
  desc: { fontSize: 14, color: '#888', textAlign: 'center', marginTop: 8 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 8, marginTop: 24 },
  input: {
    borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16,
    color: '#1a1a1a', backgroundColor: '#fff',
  },
  error: { color: '#8B1A1A', fontSize: 13, marginTop: 8 },
  studentsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24 },
  selectedCount: {
    fontSize: 12, fontWeight: '700', color: '#8B1A1A',
    backgroundColor: '#fff0f0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
  },
  studentsHint: { fontSize: 12, color: '#aaa', marginBottom: 12 },
  noStudents: { color: '#aaa', fontSize: 13, marginTop: 4 },
  studentList: { gap: 8 },
  studentRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 10, padding: 14,
    borderWidth: 1.5, borderColor: '#e0e0e0',
  },
  studentRowSelected: { borderColor: '#8B1A1A', backgroundColor: '#fff5f5' },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5,
    borderColor: '#ccc', justifyContent: 'center', alignItems: 'center',
  },
  checkboxSelected: { backgroundColor: '#8B1A1A', borderColor: '#8B1A1A' },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  studentName: { fontSize: 15, fontWeight: '600', color: '#555' },
  studentNameSelected: { color: '#2A1515' },
  btn: {
    backgroundColor: '#8B1A1A', borderRadius: 10,
    paddingVertical: 15, alignItems: 'center', marginTop: 28, marginBottom: 16,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
