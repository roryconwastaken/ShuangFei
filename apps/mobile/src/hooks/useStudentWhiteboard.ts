import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase, Stroke, TextBox } from '../lib/supabase';

export function useStudentWhiteboard(documentId: string) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [textBoxes, setTextBoxes] = useState<TextBox[]>([]);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(1);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const loadPage = useCallback(async (pageNum: number) => {
    setStrokes([]);
    setTextBoxes([]);
    setPageNumber(pageNum);

    if (channelRef.current) supabase.removeChannel(channelRef.current);

    const { data: page } = await supabase
      .from('document_pages')
      .select('*')
      .eq('document_id', documentId)
      .eq('page_number', pageNum)
      .maybeSingle();

    if (!page) return;

    setStrokes(page.student_strokes ?? []);
    setTextBoxes(page.text_boxes ?? []);

    // Live subscription — teacher drawing and text boxes appear in real time
    channelRef.current = supabase
      .channel(`wb:${page.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'document_pages',
        filter: `id=eq.${page.id}`,
      }, payload => {
        setStrokes((payload.new as any)?.student_strokes ?? []);
        setTextBoxes((payload.new as any)?.text_boxes ?? []);
      })
      .subscribe();
  }, [documentId]);

  const goToPage = useCallback(async (pageNum: number) => {
    await loadPage(pageNum);
  }, [loadPage]);

  useEffect(() => {
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, []);

  return { strokes, textBoxes, pageNumber, pageCount, setPageCount, loadPage, goToPage };
}
