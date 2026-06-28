import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import WhiteboardCanvas from '../../../src/components/canvas/WhiteboardCanvas';
import { useStudentWhiteboard } from '../../../src/hooks/useStudentWhiteboard';
import { supabase } from '../../../src/lib/supabase';

export default function StudentWhiteboard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [zoomLocked, setZoomLocked] = useState(false); // unlocked by default

  const { strokes, setPageCount, loadPage } = useStudentWhiteboard(id);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase
        .from('documents')
        .select('title, page_count')
        .eq('id', id)
        .maybeSingle();
      if (data) {
        setTitle(data.title);
        setPageCount(data.page_count);
      }
      await loadPage(1);
    };
    init();
  }, [id]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <View style={styles.titleRow}>
          <View style={styles.liveDot} />
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
        </View>
        {/* Lock freezes current position, doesn't reset */}
        <TouchableOpacity
          style={[styles.lockBtn, zoomLocked && styles.lockBtnActive]}
          onPress={() => setZoomLocked(v => !v)}
        >
          <MaterialCommunityIcons name={zoomLocked ? 'lock' : 'lock-open-variant'} size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Single finger to pan, pinch to zoom */}
      <WhiteboardCanvas
        strokes={strokes}
        readOnly
        singleFingerPan
        tool="pen"
        strokeWidth={3}
        zoomLocked={zoomLocked}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1a1a2e', paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: { width: 60 },
  backText: { color: '#e63946', fontSize: 15, fontWeight: '600' },
  titleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#e63946' },
  title: { color: '#fff', fontSize: 16, fontWeight: '700' },
  lockBtn: { width: 40, height: 40, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  lockBtnActive: { backgroundColor: '#e63946' },
});
