import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Switch, Alert, Modal, ScrollView, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import WhiteboardCanvas from '../../../src/components/canvas/WhiteboardCanvas';
import { useCanvas } from '../../../src/hooks/useCanvas';
import { useAuthStore } from '../../../src/stores/authStore';
import { supabase, TextBox } from '../../../src/lib/supabase';

interface StudentAccess {
  id: string;
  name: string;
  hasAccess: boolean;
  shareRowId?: string;
}

export default function TeacherWhiteboard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile, settings } = useAuthStore();

  const widths = settings
    ? [settings.pen_size_s, settings.pen_size_m, settings.pen_size_l]
    : [2, 4, 8];
  const colors = settings?.pen_colors ?? ['#1a1a1a', '#8B1A1A', '#2563eb', '#16a34a', '#f97316'];

  const [title, setTitle] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [wbTool, setWbTool] = useState<'pen' | 'eraser' | 'text'>('pen');
  const [zoomLocked, setZoomLocked] = useState(false);
  const [color, setColor] = useState('#1a1a1a');
  const [textFontSize, setTextFontSize] = useState(24);
  const [selectedTextBoxId, setSelectedTextBoxId] = useState<string | null>(null);
  const [editingTextBoxId, setEditingTextBoxId] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [students, setStudents] = useState<StudentAccess[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const shareIdRef = useRef<string | null>(null);

  const {
    strokes, strokeWidth, setStrokeWidth,
    textBoxes, handleTextBoxEnd,
    loadPage, handleStrokeEnd, undo, canUndo, redo, canRedo, setPageCount,
  } = useCanvas(id);

  // Snap the default stroke width + color to the user's saved settings
  // once they arrive (loaded async after mount) — guarded so it never
  // fights a width/color the user has since picked manually.
  const didSyncStyle = useRef(false);
  useEffect(() => {
    if (didSyncStyle.current || !settings) return;
    didSyncStyle.current = true;
    setStrokeWidth(settings.pen_size_m);
    setColor(settings.pen_colors[0]);
  }, [settings]);

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

  // Auto-deselect text boxes when switching away from text tool
  useEffect(() => {
    if (wbTool !== 'text') {
      setSelectedTextBoxId(null);
      setEditingTextBoxId(null);
    }
  }, [wbTool]);

  const loadStudents = useCallback(async () => {
    setStudentsLoading(true);
    const [classRes, accessRes] = await Promise.all([
      supabase
        .from('student_teacher')
        .select('student_id, student:profiles!student_id(name)')
        .eq('teacher_id', profile?.id),
      supabase
        .from('whiteboard_student_shares')
        .select('id, student_id')
        .eq('document_id', id),
    ]);

    const accessMap = new Map(
      (accessRes.data ?? []).map((r: any) => [r.student_id, r.id])
    );

    setStudents(
      (classRes.data ?? []).map((row: any) => ({
        id: row.student_id,
        name: row.student?.name ?? 'Unknown',
        hasAccess: accessMap.has(row.student_id),
        shareRowId: accessMap.get(row.student_id),
      }))
    );
    setStudentsLoading(false);
  }, [id, profile?.id]);

  const openShare = () => {
    setShareOpen(true);
    loadStudents();
  };

  const toggleStudentAccess = async (student: StudentAccess) => {
    if (student.hasAccess) {
      await supabase.from('whiteboard_student_shares').delete().eq('id', student.shareRowId!);
      setStudents(prev => prev.map(s =>
        s.id === student.id ? { ...s, hasAccess: false, shareRowId: undefined } : s
      ));
    } else {
      const { data } = await supabase
        .from('whiteboard_student_shares')
        .insert({ document_id: id, student_id: student.id })
        .select('id')
        .single();
      setStudents(prev => prev.map(s =>
        s.id === student.id ? { ...s, hasAccess: true, shareRowId: data?.id } : s
      ));
    }
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

  const commitTitle = async () => {
    setEditingTitle(false);
    const next = titleDraft.trim();
    if (!next || next === title) { setTitleDraft(title); return; }
    setTitle(next);
    await supabase.from('documents').update({ title: next }).eq('id', id);
  };

  const confirmDelete = () => {
    Alert.alert('Delete Whiteboard', `Delete "${title}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await supabase.from('whiteboard_shares').delete().eq('document_id', id);
          await supabase.from('documents').delete().eq('id', id);
          router.back();
        },
      },
    ]);
  };

  const onStrokeEnd = (newStrokes: typeof strokes) => {
    setSaving(true);
    handleStrokeEnd(newStrokes);
    setTimeout(() => setSaving(false), 2000);
  };

  // Tap on empty canvas in text mode: deselect if something selected, else place new box
  const handleCanvasTap = useCallback((cx: number, cy: number) => {
    if (selectedTextBoxId) {
      setSelectedTextBoxId(null);
      setEditingTextBoxId(null);
      return;
    }
    const newBox: TextBox = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      x: cx,
      y: cy,
      text: '',
      fontSize: textFontSize,
      color,
    };
    handleTextBoxEnd([...textBoxes, newBox]);
    setSelectedTextBoxId(newBox.id);
    setEditingTextBoxId(newBox.id);
  }, [selectedTextBoxId, textBoxes, textFontSize, color, handleTextBoxEnd]);

  // Called when TextInput blurs — saves final text or removes empty box
  const handleTextBoxEditEnd = useCallback((boxId: string, text: string) => {
    setEditingTextBoxId(null);
    setSelectedTextBoxId(null);
    if (!text.trim()) {
      handleTextBoxEnd(textBoxes.filter(b => b.id !== boxId));
    } else {
      handleTextBoxEnd(textBoxes.map(b => b.id === boxId ? { ...b, text } : b));
    }
  }, [textBoxes, handleTextBoxEnd]);

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
            autoFocus returnKeyType="done" selectTextOnFocus
            style={styles.titleInput}
          />
        ) : (
          <TouchableOpacity style={styles.titleBtn} onPress={() => { setTitleDraft(title); setEditingTitle(true); }}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.shareBtn} onPress={openShare}>
          <MaterialCommunityIcons name="account-multiple" size={22} color="#fff" />
          {isSharing && <View style={styles.liveDot} />}
        </TouchableOpacity>
      </View>

      {/* Toolbar */}
      <View style={styles.toolbar}>
        <TouchableOpacity style={[styles.btn, wbTool === 'pen' && styles.btnActive]} onPress={() => setWbTool('pen')}>
          <MaterialCommunityIcons name="pencil" size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, wbTool === 'eraser' && styles.btnActive]} onPress={() => setWbTool('eraser')}>
          <MaterialCommunityIcons name="eraser" size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, wbTool === 'text' && styles.btnActive]} onPress={() => setWbTool('text')}>
          <MaterialCommunityIcons name="format-text" size={20} color="#fff" />
        </TouchableOpacity>

        <View style={styles.divider} />

        {/* Stroke width picker */}
        {widths.map(w => (
          <TouchableOpacity key={w} style={[styles.widthBtn, strokeWidth === w && styles.widthBtnActive]} onPress={() => setStrokeWidth(w)}>
            <View style={{ width: w * 2.5, height: w * 2.5, borderRadius: w * 2.5, backgroundColor: '#fff' }} />
          </TouchableOpacity>
        ))}

        <View style={styles.divider} />

        {/* Color picker — changes selected text box color when one is selected */}
        {colors.map(c => (
          <TouchableOpacity key={c} style={styles.colorBtn} onPress={() => {
            setColor(c);
            if (selectedTextBoxId) {
              handleTextBoxEnd(textBoxes.map(b =>
                b.id === selectedTextBoxId ? { ...b, color: c } : b
              ));
            }
            if (wbTool === 'eraser') setWbTool('pen');
          }}>
            <View style={[styles.colorDot, { backgroundColor: c }, color === c && styles.colorDotActive]} />
          </TouchableOpacity>
        ))}

        <View style={styles.divider} />

        <TouchableOpacity style={[styles.btn, !canUndo && styles.btnDisabled]} onPress={undo} disabled={!canUndo}>
          <MaterialCommunityIcons name="undo-variant" size={20} color={canUndo ? '#fff' : 'rgba(255,255,255,0.3)'} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, !canRedo && styles.btnDisabled]} onPress={redo} disabled={!canRedo}>
          <MaterialCommunityIcons name="redo-variant" size={20} color={canRedo ? '#fff' : 'rgba(255,255,255,0.3)'} />
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity style={[styles.btn, zoomLocked && styles.btnActive]} onPress={() => setZoomLocked(v => !v)}>
          <MaterialCommunityIcons name={zoomLocked ? 'lock' : 'lock-open-variant'} size={20} color="#fff" />
        </TouchableOpacity>

        <View style={{ flex: 1 }} />
        <Text style={styles.saveStatus}>{saving ? 'Saving...' : 'Saved ✓'}</Text>
        <View style={styles.divider} />

        <TouchableOpacity style={styles.clearBtn} onPress={() => {
          Alert.alert('Clear Whiteboard', 'Clear all strokes on this whiteboard?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Clear', style: 'destructive', onPress: () => {
              handleStrokeEnd([]);
              handleTextBoxEnd([]);
              setSelectedTextBoxId(null);
              setEditingTextBoxId(null);
            } },
          ]);
        }}>
          <MaterialCommunityIcons name="broom" size={18} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.deleteBtn} onPress={confirmDelete}>
          <MaterialCommunityIcons name="trash-can-outline" size={18} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      </View>

      <WhiteboardCanvas
        strokes={strokes}
        textBoxes={textBoxes}
        selectedTextBoxId={selectedTextBoxId}
        editingTextBoxId={editingTextBoxId}
        tool={wbTool}
        strokeWidth={strokeWidth}
        color={color}
        zoomLocked={zoomLocked}
        onStrokeEnd={onStrokeEnd}
        onCanvasTap={handleCanvasTap}
        onTextBoxSelect={(boxId) => {
          if (boxId === null) {
            setSelectedTextBoxId(null);
            setEditingTextBoxId(null);
            return;
          }
          // First tap selects (shows move/resize handles); tapping the
          // already-selected box again enters editing.
          if (selectedTextBoxId === boxId && wbTool === 'text') {
            setEditingTextBoxId(boxId);
          } else {
            setSelectedTextBoxId(boxId);
            setEditingTextBoxId(null);
          }
        }}
        onTextBoxChange={handleTextBoxEnd}
        onTextBoxEditEnd={handleTextBoxEditEnd}
      />

      {/* Share panel */}
      <Modal visible={shareOpen} animationType="slide" transparent onRequestClose={() => setShareOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.sharePanel}>
            <View style={styles.panelHandle} />

            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Share Whiteboard</Text>
              <TouchableOpacity onPress={() => setShareOpen(false)}>
                <Text style={styles.panelClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.liveRow}>
              <View>
                <Text style={styles.liveLabel}>Go Live</Text>
                <Text style={styles.liveDesc}>
                  {isSharing ? 'Students with access can see this whiteboard now' : 'Not broadcasting yet'}
                </Text>
              </View>
              <Switch
                value={isSharing}
                onValueChange={toggleShare}
                trackColor={{ false: '#e0e0e0', true: '#8B1A1A' }}
                thumbColor="#fff"
              />
            </View>

            <View style={styles.panelDivider} />

            <Text style={styles.panelSectionTitle}>
              Students with access {students.filter(s => s.hasAccess).length > 0 && `(${students.filter(s => s.hasAccess).length})`}
            </Text>

            {studentsLoading ? (
              <ActivityIndicator color="#8B1A1A" style={{ marginVertical: 20 }} />
            ) : students.length === 0 ? (
              <Text style={styles.noStudentsText}>No students in your class yet.</Text>
            ) : (
              <ScrollView style={styles.studentScroll} showsVerticalScrollIndicator={false}>
                {students.map(s => (
                  <TouchableOpacity
                    key={s.id}
                    style={styles.studentRow}
                    onPress={() => toggleStudentAccess(s)}
                  >
                    <View style={styles.studentAvatar}>
                      <Text style={styles.studentAvatarText}>{s.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <Text style={styles.studentName}>{s.name}</Text>
                    <View style={[styles.accessCheck, s.hasAccess && styles.accessCheckOn]}>
                      {s.hasAccess && <Text style={styles.accessCheckMark}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#2A1515', paddingHorizontal: 16, paddingVertical: 10, gap: 8,
  },
  backBtn: { width: 50 },
  backText: { color: '#8B1A1A', fontSize: 15, fontWeight: '600' },
  titleBtn: { flex: 1, alignItems: 'center' },
  title: { color: '#fff', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  titleInput: {
    flex: 1, color: '#fff', fontSize: 15, fontWeight: '700', textAlign: 'center',
    borderBottomWidth: 1, borderBottomColor: '#8B1A1A', paddingVertical: 2,
  },
  shareBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  liveDot: {
    position: 'absolute', top: 6, right: 6,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#8B1A1A',
    borderWidth: 1.5, borderColor: '#2A1515',
  },
  toolbar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#2A1515', paddingHorizontal: 12, paddingVertical: 8, gap: 4,
  },
  btn: { width: 40, height: 40, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  btnActive: { backgroundColor: '#8B1A1A' },
  btnDisabled: { opacity: 0.3 },
  widthBtn: { width: 36, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  widthBtnActive: { backgroundColor: 'rgba(255,255,255,0.15)' },
  divider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.15)', marginHorizontal: 4 },
  saveStatus: { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginHorizontal: 4 },
  clearBtn: { width: 36, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', marginLeft: 2 },
  deleteBtn: { width: 36, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', marginLeft: 2 },
  colorBtn: { width: 30, height: 30, justifyContent: 'center', alignItems: 'center' },
  colorDot: { width: 18, height: 18, borderRadius: 9 },
  colorDotActive: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#fff' },
  // Share panel
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sharePanel: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 24, paddingBottom: 40, maxHeight: '75%',
  },
  panelHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#ddd', alignSelf: 'center', marginTop: 12, marginBottom: 8 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  panelTitle: { fontSize: 17, fontWeight: '700', color: '#2A1515' },
  panelClose: { fontSize: 18, color: '#aaa', padding: 4 },
  liveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16 },
  liveLabel: { fontSize: 15, fontWeight: '700', color: '#2A1515' },
  liveDesc: { fontSize: 12, color: '#aaa', marginTop: 2, maxWidth: 260 },
  panelDivider: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 8 },
  panelSectionTitle: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 12, marginTop: 4 },
  noStudentsText: { color: '#aaa', fontSize: 14, textAlign: 'center', marginVertical: 20 },
  studentScroll: { maxHeight: 320 },
  studentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  studentAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#8B1A1A', justifyContent: 'center', alignItems: 'center' },
  studentAvatarText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  studentName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#2A1515' },
  accessCheck: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: '#ccc', justifyContent: 'center', alignItems: 'center' },
  accessCheckOn: { backgroundColor: '#8B1A1A', borderColor: '#8B1A1A' },
  accessCheckMark: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
