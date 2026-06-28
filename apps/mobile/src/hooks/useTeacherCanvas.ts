import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase, Stroke } from '../lib/supabase';

export function useTeacherCanvas(documentId: string, teacherId: string) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [annotations, setAnnotations] = useState<Stroke[]>([]);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [saving, setSaving] = useState(false);

  const pageIdRef            = useRef<string | null>(null);
  const annotationRowIdRef   = useRef<string | null>(null);
  const pageNumberRef        = useRef(1);
  const saveTimerRef         = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageChannelRef       = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const docChannelRef        = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const studentStrokesRef    = useRef<Stroke[]>([]); // always in sync, used to guard deletePage

  const historyRef           = useRef<Stroke[][]>([]);
  const redoRef              = useRef<Stroke[][]>([]);
  const currentAnnotationsRef = useRef<Stroke[]>([]);

  const loadPage = useCallback(async (pageNum: number) => {
    // Reset all page-specific state before loading to prevent stale refs
    studentStrokesRef.current = [];
    setStrokes([]);
    setAnnotations([]);
    setPageNumber(pageNum);
    pageNumberRef.current        = pageNum;
    pageIdRef.current             = null;
    annotationRowIdRef.current    = null;
    historyRef.current            = [];
    redoRef.current               = [];
    currentAnnotationsRef.current = [];
    setCanUndo(false);
    setCanRedo(false);

    const { data: page } = await supabase
      .from('document_pages')
      .select('*')
      .eq('document_id', documentId)
      .eq('page_number', pageNum)
      .maybeSingle();

    if (!page) return;

    pageIdRef.current = page.id;
    const studentStrokes: Stroke[] = page.student_strokes ?? [];
    studentStrokesRef.current = studentStrokes;
    setStrokes(studentStrokes);

    // Subscribe to document page_count changes (other sessions may add/delete pages)
    if (docChannelRef.current) supabase.removeChannel(docChannelRef.current);
    docChannelRef.current = supabase
      .channel(`tdoc:${documentId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'documents',
        filter: `id=eq.${documentId}`,
      }, payload => {
        const newCount = (payload.new as any)?.page_count;
        if (newCount != null) {
          setPageCount(newCount);
          if (pageNumberRef.current > newCount) loadPage(newCount);
        }
      })
      .subscribe();

    // Subscribe to live student stroke updates for this page
    if (pageChannelRef.current) supabase.removeChannel(pageChannelRef.current);
    pageChannelRef.current = supabase
      .channel(`page:${page.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'document_pages',
        filter: `id=eq.${page.id}`,
      }, payload => {
        setStrokes((payload.new as any)?.student_strokes ?? []);
      })
      .subscribe();

    const { data: ann } = await supabase
      .from('teacher_annotations')
      .select('*')
      .eq('page_id', page.id)
      .eq('teacher_id', teacherId)
      .maybeSingle();

    const loaded: Stroke[] = ann?.strokes ?? [];
    annotationRowIdRef.current    = ann?.id ?? null;
    currentAnnotationsRef.current = loaded;
    setAnnotations(loaded);
  }, [documentId, teacherId]);

  const scheduleSave = useCallback((newAnnotations: Stroke[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaving(true);
    saveTimerRef.current = setTimeout(async () => {
      if (!pageIdRef.current) { setSaving(false); return; }
      if (annotationRowIdRef.current) {
        await supabase
          .from('teacher_annotations')
          .update({ strokes: newAnnotations })
          .eq('id', annotationRowIdRef.current);
      } else {
        const { data } = await supabase
          .from('teacher_annotations')
          .insert({ page_id: pageIdRef.current, teacher_id: teacherId, strokes: newAnnotations })
          .select('id')
          .single();
        if (data) annotationRowIdRef.current = data.id;
      }
      setSaving(false);
    }, 1500);
  }, [teacherId]);

  const handleAnnotationEnd = useCallback((newAnnotations: Stroke[]) => {
    historyRef.current = [...historyRef.current.slice(-49), currentAnnotationsRef.current];
    redoRef.current = [];
    currentAnnotationsRef.current = newAnnotations;
    setAnnotations(newAnnotations);
    setCanUndo(true);
    setCanRedo(false);
    scheduleSave(newAnnotations);
  }, [scheduleSave]);

  const undo = useCallback(() => {
    if (!historyRef.current.length) return;
    const prev = historyRef.current[historyRef.current.length - 1];
    historyRef.current = historyRef.current.slice(0, -1);
    redoRef.current = [...redoRef.current, currentAnnotationsRef.current];
    currentAnnotationsRef.current = prev;
    setAnnotations(prev);
    setCanUndo(historyRef.current.length > 0);
    setCanRedo(true);
    scheduleSave(prev);
  }, [scheduleSave]);

  const redo = useCallback(() => {
    if (!redoRef.current.length) return;
    const next = redoRef.current[redoRef.current.length - 1];
    redoRef.current = redoRef.current.slice(0, -1);
    historyRef.current = [...historyRef.current, currentAnnotationsRef.current];
    currentAnnotationsRef.current = next;
    setAnnotations(next);
    setCanUndo(true);
    setCanRedo(redoRef.current.length > 0);
    scheduleSave(next);
  }, [scheduleSave]);

  const goToPage = useCallback(async (pageNum: number) => {
    await loadPage(pageNum);
  }, [loadPage]);

  const addPage = useCallback(async () => {
    const newCount = pageCount + 1;

    // Create the document_pages row immediately so loadPage finds it and refs are set correctly
    const { data: newPage } = await supabase
      .from('document_pages')
      .insert({ document_id: documentId, page_number: newCount, student_strokes: [] })
      .select('id')
      .single();

    await supabase.from('documents').update({ page_count: newCount }).eq('id', documentId);
    setPageCount(newCount);

    if (newPage) {
      // Pre-seed pageIdRef so loadPage doesn't need a round-trip to find it
      pageIdRef.current = newPage.id;
    }

    await loadPage(newCount);
  }, [documentId, pageCount, loadPage]);

  const deletePage = useCallback(async (pageNum: number) => {
    // Never delete a page that contains student work
    if (studentStrokesRef.current.length > 0) return;

    if (pageCount <= 1) {
      // Last page — just clear annotations, keep the page itself
      if (annotationRowIdRef.current) {
        await supabase
          .from('teacher_annotations')
          .update({ strokes: [] })
          .eq('id', annotationRowIdRef.current);
      }
      currentAnnotationsRef.current = [];
      historyRef.current = [];
      redoRef.current    = [];
      setAnnotations([]);
      setCanUndo(false);
      setCanRedo(false);
      return;
    }

    // Delete the page and renumber
    await supabase
      .from('document_pages')
      .delete()
      .eq('document_id', documentId)
      .eq('page_number', pageNum);

    const { data: later } = await supabase
      .from('document_pages')
      .select('id, page_number')
      .eq('document_id', documentId)
      .gt('page_number', pageNum)
      .order('page_number');

    if (later) {
      for (const p of later) {
        await supabase
          .from('document_pages')
          .update({ page_number: p.page_number - 1 })
          .eq('id', p.id);
      }
    }

    const newCount = pageCount - 1;
    await supabase.from('documents').update({ page_count: newCount }).eq('id', documentId);
    setPageCount(newCount);
    await loadPage(Math.min(pageNum, newCount));
  }, [documentId, pageCount, loadPage]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (pageChannelRef.current) supabase.removeChannel(pageChannelRef.current);
      if (docChannelRef.current) supabase.removeChannel(docChannelRef.current);
    };
  }, []);

  return {
    strokes,
    annotations,
    pageNumber,
    pageCount,
    setPageCount,
    loadPage,
    handleAnnotationEnd,
    undo,
    redo,
    canUndo,
    canRedo,
    saving,
    goToPage,
    addPage,
    deletePage,
  };
}
