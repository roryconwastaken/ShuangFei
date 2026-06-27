import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase, DocumentType } from '../../../src/lib/supabase';
import { useAuthStore } from '../../../src/stores/authStore';
import { createLocalNote } from '../../../src/lib/localNotes';

export default function NewDocument() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<DocumentType>('homework');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!title.trim()) { setError('Please enter a title.'); return; }
    setLoading(true);

    if (type === 'notes') {
      // Notes are stored locally only - never sent to Supabase
      const note = await createLocalNote(title.trim(), user!.id);
      setLoading(false);
      router.replace(`/(student)/document/${note.id}`);
    } else {
      const { data, error: err } = await supabase
        .from('documents')
        .insert({ owner_id: user!.id, title: title.trim(), type })
        .select()
        .single();
      setLoading(false);
      if (err) { setError(err.message); return; }
      router.replace(`/(student)/document/${data.id}`);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.back}>- Back</Text>
          </TouchableOpacity>
          <Text style={styles.heading}>New Document</Text>
          <View style={{ width: 60 }} />
        </View>

        <View style={styles.body}>
          {/* Type selector */}
          <Text style={styles.label}>Type</Text>
          <View style={styles.typeRow}>
            {(['homework', 'notes'] as DocumentType[]).map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.typeBtn, type === t && styles.typeBtnActive]}
                onPress={() => setType(t)}
              >
                <Text style={styles.typeEmoji}>{t === 'homework' ? '📚' : '📝'}</Text>
                <Text style={[styles.typeLabel, type === t && styles.typeLabelActive]}>
                  {t === 'homework' ? 'Homework' : 'Notes'}
                </Text>
                <Text style={[styles.typeDesc, type === t && styles.typeDescActive]}>
                  {t === 'homework' ? 'Shared with teacher' : 'Saved on this device'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Title */}
          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={t => { setTitle(t); setError(''); }}
            placeholder="e.g. 第一课作业 or Week 1 Homework"
            placeholderTextColor="#aaa"
            autoFocus
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleCreate}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>Create Document</Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  back: { color: '#e63946', fontSize: 15, fontWeight: '600', width: 60 },
  heading: { fontSize: 17, fontWeight: '700', color: '#1a1a2e' },
  body: { flex: 1, padding: 24, maxWidth: 600, width: '100%', alignSelf: 'center' },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 8, marginTop: 20 },
  typeRow: { flexDirection: 'row', gap: 12 },
  typeBtn: {
    flex: 1, borderWidth: 1.5, borderColor: '#e0e0e0',
    borderRadius: 12, padding: 16, alignItems: 'center',
    backgroundColor: '#fff',
  },
  typeBtnActive: { borderColor: '#e63946', backgroundColor: '#fff5f5' },
  typeEmoji: { fontSize: 28, marginBottom: 6 },
  typeLabel: { fontSize: 15, fontWeight: '700', color: '#555' },
  typeLabelActive: { color: '#e63946' },
  typeDesc: { fontSize: 11, color: '#aaa', marginTop: 4, textAlign: 'center' },
  typeDescActive: { color: '#e63946', opacity: 0.7 },
  input: {
    borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16,
    color: '#1a1a1a', backgroundColor: '#fff',
  },
  error: { color: '#e63946', fontSize: 13, marginTop: 8 },
  btn: {
    backgroundColor: '#e63946', borderRadius: 10, paddingVertical: 15,
    alignItems: 'center', marginTop: 28,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
