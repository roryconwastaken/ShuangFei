import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import BKBCanvas from '../../../src/components/canvas/BKBCanvas';
import Toolbar from '../../../src/components/canvas/Toolbar';
import { useCanvas } from '../../../src/hooks/useCanvas';
import { useAuthStore } from '../../../src/stores/authStore';
import { supabase } from '../../../src/lib/supabase';

export default function DocumentEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { settings } = useAuthStore();
  const [title, setTitle] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [zoomLocked, setZoomLocked] = useState(true);
  const titleInputRef = useRef<TextInput>(null);

  const widths = settings
    ? [settings.pen_size_s, settings.pen_size_m, settings.pen_size_l]
    : [2, 4, 8];

  const {
    strokes,
    annotations,
    tool, setTool,
    strokeWidth, setStrokeWidth,
    pageNumber, pageCount, setPageCount,
    loadPage,
    handleStrokeEnd,
    clearCurrentPage,
    undo, canUndo,
    redo, canRedo,
    addPage,
    goToPage,
    deletePage,
  } = useCanvas(id);

  // Snap the default stroke width to the user's saved "M" size once
  // settings arrive (they load asynchronously after mount) — guarded so
  // it never overwrites a width the user has since picked manually.
  const didSyncWidth = useRef(false);
  useEffect(() => {
    if (didSyncWidth.current || !settings) return;
    didSyncWidth.current = true;
    setStrokeWidth(settings.pen_size_m);
  }, [settings]);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase
        .from('documents')
        .select('title, page_count')
        .eq('id', id)
        .maybeSingle();
      if (data) {
        setTitle(data.title);
        setTitleDraft(data.title);
        setPageCount(data.page_count);
      }
      await loadPage(1);
    };
    init();
  }, [id]);

  const commitTitle = async () => {
    setEditingTitle(false);
    const next = titleDraft.trim();
    if (!next || next === title) { setTitleDraft(title); return; }
    setTitle(next);
    await supabase.from('documents').update({ title: next }).eq('id', id);
  };

  const handleClearPage = () => {
    Alert.alert(
      'Clear Page',
      'Clear all your strokes on this page? This can be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: clearCurrentPage },
      ],
    );
  };

  const handleDeletePage = () => {
    // Block deletion if teacher has annotated this page (homework only — notes won't have annotations)
    if (annotations.length > 0) {
      Alert.alert(
        'Cannot Delete Page',
        'This page has teacher feedback. You can clear your strokes instead.',
        [{ text: 'OK' }],
      );
      return;
    }
    deletePage(pageNumber);
  };

  const onStrokeEnd = (newStrokes: typeof strokes) => {
    setSaving(true);
    handleStrokeEnd(newStrokes);
    setTimeout(() => setSaving(false), 2000);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        {editingTitle ? (
          <TextInput
            ref={titleInputRef}
            value={titleDraft}
            onChangeText={setTitleDraft}
            onBlur={commitTitle}
            onSubmitEditing={commitTitle}
            autoFocus
            returnKeyType="done"
            selectTextOnFocus
            style={styles.titleInput}
          />
        ) : (
          <TouchableOpacity style={styles.titleBtn} onPress={() => {
            setTitleDraft(title);
            setEditingTitle(true);
          }}>
            <Text style={styles.titleText} numberOfLines={1}>{title}</Text>
          </TouchableOpacity>
        )}
        <View style={{ width: 60 }} />
      </View>

      <Toolbar
        tool={tool}
        onToolChange={setTool}
        widths={widths}
        strokeWidth={strokeWidth}
        onStrokeWidthChange={setStrokeWidth}
        onUndo={undo}
        canUndo={canUndo}
        onRedo={redo}
        canRedo={canRedo}
        pageNumber={pageNumber}
        pageCount={pageCount}
        onAddPage={addPage}
        onPrevPage={() => pageNumber > 1 && goToPage(pageNumber - 1)}
        onNextPage={() => pageNumber < pageCount && goToPage(pageNumber + 1)}
        onClearPage={handleClearPage}
        onDeletePage={handleDeletePage}
        saving={saving}
        zoomLocked={zoomLocked}
        onZoomLockChange={setZoomLocked}
      />

      <BKBCanvas
        strokes={strokes}
        annotations={annotations}
        tool={tool}
        strokeWidth={strokeWidth}
        zoomLocked={zoomLocked}
        onStrokeEnd={onStrokeEnd}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#2A1515',
  },
  backBtn: { width: 60 },
  backText: { color: '#8B1A1A', fontSize: 15, fontWeight: '600' },
  titleBtn: { flex: 1, alignItems: 'center', marginHorizontal: 8 },
  titleText: { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  titleInput: {
    flex: 1, color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center',
    marginHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#8B1A1A', paddingVertical: 2,
  },
});
