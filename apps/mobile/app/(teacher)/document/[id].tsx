import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import BKBCanvas from '../../../src/components/canvas/BKBCanvas';
import { useTeacherCanvas } from '../../../src/hooks/useTeacherCanvas';
import { useAuthStore } from '../../../src/stores/authStore';
import { supabase } from '../../../src/lib/supabase';

const WIDTHS = [2, 4, 8];

export default function TeacherDocument() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuthStore();
  const [title, setTitle] = useState('');
  const [zoomLocked, setZoomLocked] = useState(true);
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');

  const {
    strokes,
    annotations,
    pageNumber,
    pageCount,
    setPageCount,
    loadPage,
    handleAnnotationEnd,
    undo, canUndo,
    redo, canRedo,
    saving,
    goToPage,
    addPage,
    deletePage,
  } = useTeacherCanvas(id, profile?.id ?? '');

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

  const confirmDeletePage = () => {
    if (strokes.length > 0) {
      Alert.alert(
        'Cannot Delete Page',
        'This page has student work. You can clear your annotations instead.',
        [{ text: 'OK' }],
      );
      return;
    }
    Alert.alert(
      'Delete Page',
      pageCount <= 1
        ? 'Clear all annotations on this page?'
        : `Delete page ${pageNumber}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: pageCount <= 1 ? 'Clear' : 'Delete',
          style: 'destructive',
          onPress: () => deletePage(pageNumber),
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Toolbar */}
      <View style={styles.toolbar}>
        {/* Pen */}
        <TouchableOpacity
          style={[styles.btn, tool === 'pen' && styles.btnActive]}
          onPress={() => setTool('pen')}
        >
          <MaterialCommunityIcons name="pencil" size={20} color="#fff" />
        </TouchableOpacity>

        {/* Eraser */}
        <TouchableOpacity
          style={[styles.btn, tool === 'eraser' && styles.btnActive]}
          onPress={() => setTool('eraser')}
        >
          <MaterialCommunityIcons name="eraser" size={20} color="#fff" />
        </TouchableOpacity>

        <View style={styles.divider} />

        {/* Stroke widths (red dots) */}
        {WIDTHS.map(w => (
          <TouchableOpacity
            key={w}
            style={[styles.widthBtn, strokeWidth === w && styles.widthBtnActive]}
            onPress={() => setStrokeWidth(w)}
          >
            <View style={{ width: w * 2.5, height: w * 2.5, borderRadius: w * 2.5, backgroundColor: '#e63946' }} />
          </TouchableOpacity>
        ))}

        <View style={styles.divider} />

        {/* Undo */}
        <TouchableOpacity style={[styles.btn, !canUndo && styles.btnDisabled]} onPress={undo} disabled={!canUndo}>
          <MaterialCommunityIcons name="undo-variant" size={20} color={canUndo ? '#fff' : 'rgba(255,255,255,0.3)'} />
        </TouchableOpacity>

        {/* Redo */}
        <TouchableOpacity style={[styles.btn, !canRedo && styles.btnDisabled]} onPress={redo} disabled={!canRedo}>
          <MaterialCommunityIcons name="redo-variant" size={20} color={canRedo ? '#fff' : 'rgba(255,255,255,0.3)'} />
        </TouchableOpacity>

        {/* Zoom lock */}
        <TouchableOpacity style={[styles.btn, zoomLocked && styles.btnActive]} onPress={() => setZoomLocked(v => !v)}>
          <MaterialCommunityIcons name={zoomLocked ? 'lock' : 'lock-open-variant'} size={20} color="#fff" />
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        <Text style={styles.saveStatus}>{saving ? 'Saving...' : 'Saved ✓'}</Text>

        <View style={styles.divider} />

        {/* Page navigation */}
        <TouchableOpacity
          style={[styles.btn, pageNumber <= 1 && styles.btnDisabled]}
          onPress={() => pageNumber > 1 && goToPage(pageNumber - 1)}
          disabled={pageNumber <= 1}
        >
          <MaterialCommunityIcons name="chevron-left" size={22} color={pageNumber <= 1 ? 'rgba(255,255,255,0.3)' : '#fff'} />
        </TouchableOpacity>

        <Text style={styles.pageLabel}>{pageNumber} / {pageCount}</Text>

        <TouchableOpacity
          style={[styles.btn, pageNumber >= pageCount && styles.btnDisabled]}
          onPress={() => pageNumber < pageCount && goToPage(pageNumber + 1)}
          disabled={pageNumber >= pageCount}
        >
          <MaterialCommunityIcons name="chevron-right" size={22} color={pageNumber >= pageCount ? 'rgba(255,255,255,0.3)' : '#fff'} />
        </TouchableOpacity>

        {/* Add page */}
        <TouchableOpacity style={styles.addPageBtn} onPress={addPage}>
          <MaterialCommunityIcons name="plus" size={16} color="#fff" />
          <Text style={styles.addPageText}>Page</Text>
        </TouchableOpacity>

        {/* Clear annotations */}
        <TouchableOpacity style={styles.clearPageBtn} onPress={() => {
          Alert.alert('Clear Annotations', 'Remove all your annotations on this page?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Clear', style: 'destructive', onPress: () => handleAnnotationEnd([]) },
          ]);
        }}>
          <MaterialCommunityIcons name="broom" size={18} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>

        {/* Delete page */}
        <TouchableOpacity style={styles.deletePageBtn} onPress={confirmDeletePage}>
          <MaterialCommunityIcons name="trash-can-outline" size={18} color="#e63946" />
        </TouchableOpacity>
      </View>

      {/* Canvas */}
      <BKBCanvas
        strokes={strokes}
        annotations={annotations}
        annotationMode
        onAnnotationEnd={handleAnnotationEnd}
        tool={tool}
        strokeWidth={strokeWidth}
        zoomLocked={zoomLocked}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#1a1a2e',
  },
  backBtn: { width: 60 },
  backText: { color: '#e63946', fontSize: 15, fontWeight: '600' },
  title: {
    flex: 1, textAlign: 'center', color: '#fff',
    fontSize: 16, fontWeight: '700', marginHorizontal: 8,
  },
  toolbar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1a1a2e', paddingHorizontal: 12, paddingVertical: 8, gap: 4,
  },
  btn: { width: 40, height: 40, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  btnActive: { backgroundColor: '#e63946' },
  btnDisabled: { opacity: 0.3 },
  btnIcon: { fontSize: 18, color: '#fff' },
  iconDisabled: { opacity: 0.4 },
  widthBtn: { width: 36, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  widthBtnActive: { backgroundColor: 'rgba(255,255,255,0.15)' },
  divider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.15)', marginHorizontal: 4 },
  pageLabel: { color: '#fff', fontSize: 13, fontWeight: '600', marginHorizontal: 4, minWidth: 40, textAlign: 'center' },
  saveStatus: { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginHorizontal: 4 },
  addPageBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 10, paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8, marginLeft: 4,
  },
  addPageText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  clearPageBtn: {
    width: 36, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)', marginLeft: 2,
  },
  deletePageBtn: {
    width: 36, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(230,57,70,0.15)', marginLeft: 2,
  },
});
