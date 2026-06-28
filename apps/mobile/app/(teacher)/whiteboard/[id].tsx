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
import { supabase } from '../../../src/lib/supabase';

const WIDTHS  = [2, 4, 8];
const COLORS  = ['#1a1a1a', '#e63946', '#2563eb', '#16a34a', '#f97316', '#9333ea'];

interface StudentAccess {
  id: string;
  name: string;
  hasAccess: boolean;
  shareRowId?: string;
}

export default function TeacherWhiteboard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuthStore();

  const [title, setTitle] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [zoomLocked, setZoomLocked] = useState(false);
  const [color, setColor] = useState('#1a1a1a');
  const [isSharing, setIsSharing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [students, setStudents] = useState<StudentAccess[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const shareIdRef = useRef<string | null>(null);

  const {
    strokes, tool, setTool, strokeWidth, setStrokeWidth,
    loadPage, handleStrokeEnd, undo, canUndo, redo, canRedo, setPageCount,
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
      // Remove access
      await supabase.from('whiteboard_student_shares').delete().eq('id', student.shareRowId!);
      setStudents(prev => prev.map(s =>
        s.id === student.id ? { ...s, hasAccess: false, shareRowId: undefined } : s
      ));
    } else {
      // Grant access
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
        <TouchableOpacity style={[styles.btn, tool === 'pen' && styles.btnActive]} onPress={() => setTool('pen')}>
          <MaterialCommunityIcons name="pencil" size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, tool === 'eraser' && styles.btnActive]} onPress={() => setTool('eraser')}>
          <MaterialCommunityIcons name="eraser" size={20} color="#fff" />
        </TouchableOpacity>

        <View style={styles.divider} />

        {WIDTHS.map(w => (
          <TouchableOpacity key={w} style={[styles.widthBtn, strokeWidth === w && styles.widthBtnActive]} onPress={() => setStrokeWidth(w)}>
            <View style={{ width: w * 2.5, height: w * 2.5, borderRadius: w * 2.5, backgroundColor: '#fff' }} />
          </TouchableOpacity>
        ))}

        <View style={styles.divider} />

        {COLORS.map(c => (
          <TouchableOpacity key={c} style={styles.colorBtn} onPress={() => { setColor(c); setTool('pen'); }}>
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

        <TouchableOpacity style={styles.deleteBtn} onPress={confirmDelete}>
          <MaterialCommunityIcons name="trash-can-outline" size={18} color="#e63946" />
        </TouchableOpacity>
      </View>

      <WhiteboardCanvas
        strokes={strokes}
        tool={tool}
        strokeWidth={strokeWidth}
        color={color}
        zoomLocked={zoomLocked}
        onStrokeEnd={onStrokeEnd}
      />

      {/* Share panel */}
      <Modal visible={shareOpen} animationType="slide" transparent onRequestClose={() => setShareOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.sharePanel}>
            {/* Handle */}
            <View style={styles.panelHandle} />

            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Share Whiteboard</Text>
              <TouchableOpacity onPress={() => setShareOpen(false)}>
                <Text style={styles.panelClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Go Live toggle */}
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
                trackColor={{ false: '#e0e0e0', true: '#e63946' }}
                thumbColor="#fff"
              />
            </View>

            <View style={styles.panelDivider} />

            <Text style={styles.panelSectionTitle}>
              Students with access {students.filter(s => s.hasAccess).length > 0 && `(${students.filter(s => s.hasAccess).length})`}
            </Text>

            {studentsLoading ? (
              <ActivityIndicator color="#e63946" style={{ marginVertical: 20 }} />
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
  shareBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  liveDot: {
    position: 'absolute', top: 6, right: 6,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#e63946',
    borderWidth: 1.5, borderColor: '#1a1a2e',
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
  saveStatus: { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginHorizontal: 4 },
  deleteBtn: { width: 36, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(230,57,70,0.15)' },
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
  panelTitle: { fontSize: 17, fontWeight: '700', color: '#1a1a2e' },
  panelClose: { fontSize: 18, color: '#aaa', padding: 4 },
  liveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16 },
  liveLabel: { fontSize: 15, fontWeight: '700', color: '#1a1a2e' },
  liveDesc: { fontSize: 12, color: '#aaa', marginTop: 2, maxWidth: 260 },
  panelDivider: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 8 },
  panelSectionTitle: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 12, marginTop: 4 },
  noStudentsText: { color: '#aaa', fontSize: 14, textAlign: 'center', marginVertical: 20 },
  studentScroll: { maxHeight: 320 },
  studentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  studentAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#e63946', justifyContent: 'center', alignItems: 'center' },
  studentAvatarText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  studentName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1a1a2e' },
  accessCheck: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: '#ccc', justifyContent: 'center', alignItems: 'center' },
  accessCheckOn: { backgroundColor: '#e63946', borderColor: '#e63946' },
  accessCheckMark: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
