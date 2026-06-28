import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Switch, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import WhiteboardCanvas from '../../../src/components/canvas/WhiteboardCanvas';
import { useCanvas } from '../../../src/hooks/useCanvas';
import { useAuthStore } from '../../../src/stores/authStore';
import { supabase } from '../../../src/lib/supabase';

const WIDTHS = [2, 4, 8];

function EraserIcon() {
  return (
    <View style={eraserStyles.wrap}>
      <View style={eraserStyles.top} />
      <View style={eraserStyles.bottom} />
    </View>
  );
}
const eraserStyles = StyleSheet.create({
  wrap: { width: 20, height: 14, borderRadius: 2, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)' },
  top:  { flex: 1, backgroundColor: '#FFB3C1' },
  bottom: { flex: 1, backgroundColor: '#fff' },
});

export default function TeacherWhiteboard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuthStore();
  const [title, setTitle] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [zoomLocked, setZoomLocked] = useState(false); // unlocked by default
  const [isSharing, setIsSharing] = useState(false);
  const [saving, setSaving] = useState(false);
  const shareIdRef = useRef<string | null>(null);

  const {
    strokes,
    tool, setTool,
    strokeWidth, setStrokeWidth,
    loadPage,
    handleStrokeEnd,
    undo, canUndo,
    redo, canRedo,
    setPageCount,
  } = useCanvas(id);

  useEffect(() => {
    const init = async () => {
      const [docRes, shareRes] = await Promise.all([
        supabase.from('documents').select('title, page_count').eq('id', id).maybeSingle(),
        supabase.from('whiteboard_shares').select('id, is_active').eq('document_id', id).maybeSingle(),
      ]);
      if (docRes.data) {
        setTitle(docRes.data.title);
        setTitleDraft(docRes.data.title);
        setPageCount(docRes.data.page_count);
      }
      if (shareRes.data) {
        shareIdRef.current = shareRes.data.id;
        setIsSharing(shareRes.data.is_active);
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

  const toggleShare = async (value: boolean) => {
    setIsSharing(value);
    if (shareIdRef.current) {
      await supabase.from('whiteboard_shares').update({ is_active: value }).eq('id', shareIdRef.current);
    } else {
      const { data } = await supabase
        .from('whiteboard_shares')
        .insert({ document_id: id, teacher_id: profile?.id, is_active: value })
        .select('id').single();
      if (data) shareIdRef.current = data.id;
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete Whiteboard',
      `Delete "${title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: deleteWhiteboard },
      ],
    );
  };

  const deleteWhiteboard = async () => {
    // Delete share first (FK may not cascade), then document (cascades to pages)
    await supabase.from('whiteboard_shares').delete().eq('document_id', id);
    await supabase.from('documents').delete().eq('id', id);
    router.back();
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
          <TouchableOpacity style={styles.titleBtn} onPress={() => { setTitleDraft(title); setEditingTitle(true); }}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
          </TouchableOpacity>
        )}

        <View style={styles.headerRight}>
          <Text style={[styles.shareLabel, isSharing && styles.shareLabelActive]}>
            {isSharing ? 'Live' : 'Off'}
          </Text>
          <Switch
            value={isSharing}
            onValueChange={toggleShare}
            trackColor={{ false: 'rgba(255,255,255,0.2)', true: '#e63946' }}
            thumbColor="#fff"
          />
        </View>
      </View>

      {/* Toolbar */}
      <View style={styles.toolbar}>
        {/* Pen */}
        <TouchableOpacity style={[styles.btn, tool === 'pen' && styles.btnActive]} onPress={() => setTool('pen')}>
          <Text style={styles.btnIcon}>✏️</Text>
        </TouchableOpacity>

        {/* Eraser */}
        <TouchableOpacity style={[styles.btn, tool === 'eraser' && styles.btnActive]} onPress={() => setTool('eraser')}>
          <EraserIcon />
        </TouchableOpacity>

        <View style={styles.divider} />

        {WIDTHS.map(w => (
          <TouchableOpacity
            key={w}
            style={[styles.widthBtn, strokeWidth === w && styles.widthBtnActive]}
            onPress={() => setStrokeWidth(w)}
          >
            <View style={{ width: w * 2.5, height: w * 2.5, borderRadius: w * 2.5, backgroundColor: '#fff' }} />
          </TouchableOpacity>
        ))}

        <View style={styles.divider} />

        <TouchableOpacity style={[styles.btn, !canUndo && styles.btnDisabled]} onPress={undo} disabled={!canUndo}>
          <Text style={[styles.btnIcon, !canUndo && styles.iconDisabled]}>↩</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, !canRedo && styles.btnDisabled]} onPress={redo} disabled={!canRedo}>
          <Text style={[styles.btnIcon, !canRedo && styles.iconDisabled]}>↪</Text>
        </TouchableOpacity>

        <View style={styles.divider} />

        {/* Lock — freezes current position, doesn't reset */}
        <TouchableOpacity style={[styles.btn, zoomLocked && styles.btnActive]} onPress={() => setZoomLocked(v => !v)}>
          <Text style={styles.btnIcon}>{zoomLocked ? '🔒' : '🔓'}</Text>
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        <Text style={styles.saveStatus}>{saving ? 'Saving...' : 'Saved ✓'}</Text>

        <View style={styles.divider} />

        {/* Delete */}
        <TouchableOpacity style={styles.deleteBtn} onPress={confirmDelete}>
          <Text style={styles.btnIcon}>🗑</Text>
        </TouchableOpacity>
      </View>

      <WhiteboardCanvas
        strokes={strokes}
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
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1a1a2e', paddingHorizontal: 16, paddingVertical: 10, gap: 8,
  },
  backBtn: { width: 50 },
  backText: { color: '#e63946', fontSize: 15, fontWeight: '600' },
  titleBtn: { flex: 1, alignItems: 'center' },
  title: { color: '#fff', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  titleInput: {
    flex: 1, color: '#fff', fontSize: 15, fontWeight: '700', textAlign: 'center',
    borderBottomWidth: 1, borderBottomColor: '#e63946', paddingVertical: 2,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  shareLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '600' },
  shareLabelActive: { color: '#e63946' },
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
  saveStatus: { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginHorizontal: 4 },
  deleteBtn: {
    width: 36, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(230,57,70,0.15)',
  },
});
