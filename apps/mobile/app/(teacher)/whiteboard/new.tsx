import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../../src/lib/supabase';
import { useAuthStore } from '../../../src/stores/authStore';

export default function NewWhiteboard() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!title.trim()) { setError('Please enter a title.'); return; }
    setLoading(true);

    const { data: doc, error: err } = await supabase
      .from('documents')
      .insert({ owner_id: profile?.id, title: title.trim(), type: 'whiteboard', page_count: 1 })
      .select()
      .single();

    if (err || !doc) { setError(err?.message ?? 'Failed to create.'); setLoading(false); return; }

    await Promise.all([
      supabase.from('document_pages').insert({ document_id: doc.id, page_number: 1, student_strokes: [] }),
      supabase.from('whiteboard_shares').insert({ document_id: doc.id, teacher_id: profile?.id, is_active: false }),
    ]);

    setLoading(false);
    router.replace(`/(teacher)/whiteboard/${doc.id}`);
  };

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

        <View style={styles.body}>
          <Text style={styles.icon}>📋</Text>
          <Text style={styles.desc}>Create a whiteboard to draw and share with your class live.</Text>

          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={t => { setTitle(t); setError(''); }}
            placeholder="e.g. Lesson 3 - Stroke Order"
            placeholderTextColor="#aaa"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleCreate}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

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
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f8' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  backBtn: { width: 60 },
  back: { color: '#e63946', fontSize: 15, fontWeight: '600' },
  heading: { fontSize: 17, fontWeight: '700', color: '#1a1a2e' },
  body: { flex: 1, padding: 24, maxWidth: 600, width: '100%', alignSelf: 'center' },
  icon: { fontSize: 48, textAlign: 'center', marginTop: 16 },
  desc: { fontSize: 14, color: '#888', textAlign: 'center', marginTop: 8, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 8, marginTop: 24 },
  input: {
    borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16,
    color: '#1a1a1a', backgroundColor: '#fff',
  },
  error: { color: '#e63946', fontSize: 13, marginTop: 8 },
  btn: {
    backgroundColor: '#e63946', borderRadius: 10,
    paddingVertical: 15, alignItems: 'center', marginTop: 28,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
