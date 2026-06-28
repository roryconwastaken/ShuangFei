import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import BKBCanvas from '../../../src/components/canvas/BKBCanvas';
import Toolbar from '../../../src/components/canvas/Toolbar';
import { useCanvas } from '../../../src/hooks/useCanvas';
import { supabase } from '../../../src/lib/supabase';
import { getLocalNote, updateLocalNoteTitle } from '../../../src/lib/localNotes';

export default function DocumentEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [zoomLocked, setZoomLocked] = useState(true);
  const isLocal = id.startsWith('local_');
  const titleInputRef = useRef<TextInput>(null);

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

  useEffect(() => {
    const init = async () => {
      if (isLocal) {
        const note = await getLocalNote(id);
        if (note) {
          setTitle(note.title);
          setTitleDraft(note.title);
          setPageCount(note.page_count);
        }
      } else {
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
    if (isLocal) {
      await updateLocalNoteTitle(id, next);
    } else {
      await supabase.from('documents').update({ title: next }).eq('id', id);
    }
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
    // Block deletion if teacher has annotated this homework page
    if (!isLocal && annotations.length > 0) {
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

      {/* Toolbar */}
      <Toolbar
        tool={tool}
        onToolChange={setTool}
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

      {/* Canvas */}
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
    backgroundColor: '#1a1a2e',
  },
  backBtn: { width: 60 },
  backText: { color: '#e63946', fontSize: 15, fontWeight: '600' },
  titleBtn: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 8,
  },
  titleText: {
    color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center',
  },
  titleInput: {
    flex: 1,
    color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center',
    marginHorizontal: 8,
    borderBottomWidth: 1, borderBottomColor: '#e63946',
    paddingVertical: 2,
  },
});
