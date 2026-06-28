import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase, Stroke } from '../lib/supabase';
import {
  getNotePage,
  saveNotePage,
  addLocalNotePage,
  deleteLocalNotePage,
} from '../lib/localNotes';

export function useCanvas(documentId: string) {
  const isLocal = documentId.startsWith('local_');

  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [annotations, setAnnotations] = useState<Stroke[]>([]); // teacher's red annotations
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const pageIdRef      = useRef<string | null>(null);
  const pageNumberRef  = useRef(1);
  const saveTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const annChannelRef  = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const docChannelRef  = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // History for undo/redo - refs so mutations don't trigger re-renders
  const historyRef = useRef<Stroke[][]>([]);
  const redoRef = useRef<Stroke[][]>([]);
  // Tracks current strokes synchronously (setStrokes is async)
  const currentStrokesRef = useRef<Stroke[]>([]);

  const loadPage = useCallback(async (pageNum: number) => {
    setStrokes([]);
    setAnnotations([]);
    setPageNumber(pageNum);
    pageNumberRef.current = pageNum;
    historyRef.current = [];
    redoRef.current = [];
    currentStrokesRef.current = [];
    setCanUndo(false);
    setCanRedo(false);

    if (isLocal) {
      const data = await getNotePage(documentId, pageNum);
      currentStrokesRef.current = data;
      setStrokes(data);
    } else {
      const { data } = await supabase
        .from('document_pages')
        .select('*')
        .eq('document_id', documentId)
        .eq('page_number', pageNum)
        .maybeSingle();

      if (data) {
        pageIdRef.current = data.id;
        const loaded = data.student_strokes ?? [];
        currentStrokesRef.current = loaded;
        setStrokes(loaded);

        // Load teacher annotations for this page
        const { data: ann } = await supabase
          .from('teacher_annotations')
          .select('strokes')
          .eq('page_id', data.id)
          .maybeSingle();
        setAnnotations(ann?.strokes ?? []);

        // Subscribe to document page_count changes (teacher may add/delete pages)
        if (docChannelRef.current) supabase.removeChannel(docChannelRef.current);
        docChannelRef.current = supabase
          .channel(`doc:${documentId}`)
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

        // Subscribe to live annotation updates for this page
        if (annChannelRef.current) supabase.removeChannel(annChannelRef.current);
        annChannelRef.current = supabase
          .channel(`ann:${data.id}`)
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'teacher_annotations',
            filter: `page_id=eq.${data.id}`,
          }, payload => {
            setAnnotations((payload.new as any)?.strokes ?? []);
          })
          .subscribe();
      } else {
        const { data: newPage } = await supabase
          .from('document_pages')
          .insert({ document_id: documentId, page_number: pageNum })
          .select()
          .single();
        if (newPage) {
          pageIdRef.current = newPage.id;
          currentStrokesRef.current = [];
          setStrokes([]);
        }
      }
    }
  }, [documentId, isLocal]);

  const scheduleSave = useCallback((newStrokes: Stroke[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (isLocal) {
        await saveNotePage(documentId, pageNumberRef.current, newStrokes);
      } else {
        if (!pageIdRef.current) return;
        await supabase
          .from('document_pages')
          .update({ student_strokes: newStrokes })
          .eq('id', pageIdRef.current);
      }
    }, 1500);
  }, [documentId, isLocal]);

  const handleStrokeEnd = useCallback((newStrokes: Stroke[]) => {
    historyRef.current = [...historyRef.current.slice(-49), currentStrokesRef.current];
    redoRef.current = [];
    currentStrokesRef.current = newStrokes;
    setStrokes(newStrokes);
    setCanUndo(true);
    setCanRedo(false);
    scheduleSave(newStrokes);
  }, [scheduleSave]);

  const clearCurrentPage = useCallback(() => {
    const cleared: Stroke[] = [];
    historyRef.current = [...historyRef.current.slice(-49), currentStrokesRef.current];
    redoRef.current = [];
    currentStrokesRef.current = cleared;
    setStrokes(cleared);
    setCanUndo(true);
    setCanRedo(false);
    scheduleSave(cleared);
  }, [scheduleSave]);

  const undo = useCallback(() => {
    if (historyRef.current.length === 0) return;
    const prev = historyRef.current[historyRef.current.length - 1];
    historyRef.current = historyRef.current.slice(0, -1);
    redoRef.current = [...redoRef.current, currentStrokesRef.current];
    currentStrokesRef.current = prev;
    setStrokes(prev);
    setCanUndo(historyRef.current.length > 0);
    setCanRedo(true);
    scheduleSave(prev);
  }, [scheduleSave]);

  const redo = useCallback(() => {
    if (redoRef.current.length === 0) return;
    const next = redoRef.current[redoRef.current.length - 1];
    redoRef.current = redoRef.current.slice(0, -1);
    historyRef.current = [...historyRef.current, currentStrokesRef.current];
    currentStrokesRef.current = next;
    setStrokes(next);
    setCanUndo(true);
    setCanRedo(redoRef.current.length > 0);
    scheduleSave(next);
  }, [scheduleSave]);

  const addPage = useCallback(async () => {
    if (isLocal) {
      const newCount = await addLocalNotePage(documentId);
      setPageCount(newCount);
      setPageNumber(newCount);
      pageNumberRef.current = newCount;
      setStrokes([]);
    } else {
      const newCount = pageCount + 1;
      await supabase
        .from('documents')
        .update({ page_count: newCount })
        .eq('id', documentId);
      setPageCount(newCount);
      setPageNumber(newCount);
      pageNumberRef.current = newCount;
      await loadPage(newCount);
    }
  }, [pageCount, documentId, isLocal, loadPage]);

  const goToPage = useCallback(async (pageNum: number) => {
    await loadPage(pageNum);
  }, [loadPage]);

  const deletePage = useCallback(async (pageNum: number) => {
    if (isLocal) {
      const newCount = await deleteLocalNotePage(documentId, pageNum);
      setPageCount(newCount);
      const nextPage = Math.min(pageNum, newCount);
      await loadPage(nextPage);
    } else {
      if (pageCount <= 1) {
        // Only page - just clear strokes
        const cleared: Stroke[] = [];
        setStrokes(cleared);
        scheduleSave(cleared);
        return;
      }
      // Delete this page row
      await supabase
        .from('document_pages')
        .delete()
        .eq('document_id', documentId)
        .eq('page_number', pageNum);

      // Renumber subsequent pages
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
      await supabase
        .from('documents')
        .update({ page_count: newCount })
        .eq('id', documentId);

      setPageCount(newCount);
      const nextPage = Math.min(pageNum, newCount);
      await loadPage(nextPage);
    }
  }, [documentId, isLocal, pageCount, loadPage, scheduleSave]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (annChannelRef.current) supabase.removeChannel(annChannelRef.current);
      if (docChannelRef.current) supabase.removeChannel(docChannelRef.current);
    };
  }, []);

  return {
    strokes,
    annotations,
    tool,
    setTool,
    strokeWidth,
    setStrokeWidth,
    pageNumber,
    pageCount,
    setPageCount,
    loadPage,
    handleStrokeEnd,
    clearCurrentPage,
    undo,
    redo,
    canUndo,
    canRedo,
    addPage,
    goToPage,
    deletePage,
  };
}
