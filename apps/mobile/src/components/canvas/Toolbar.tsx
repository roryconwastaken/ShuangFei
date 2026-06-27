import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';

interface ToolbarProps {
  tool: 'pen' | 'eraser';
  onToolChange: (tool: 'pen' | 'eraser') => void;
  strokeWidth: number;
  onStrokeWidthChange: (width: number) => void;
  onUndo: () => void;
  canUndo: boolean;
  onRedo: () => void;
  canRedo: boolean;
  pageNumber: number;
  pageCount: number;
  onAddPage?: () => void;
  onPrevPage?: () => void;
  onNextPage?: () => void;
  onDeletePage?: () => void;
  saving?: boolean;
  zoomLocked: boolean;
  onZoomLockChange: (locked: boolean) => void;
}

const WIDTHS = [2, 4, 8];

// Eraser icon: two-tone rectangle (pink top / white bottom) like a real eraser
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

export default function Toolbar({
  tool,
  onToolChange,
  strokeWidth,
  onStrokeWidthChange,
  onUndo,
  canUndo,
  onRedo,
  canRedo,
  pageNumber,
  pageCount,
  onAddPage,
  onPrevPage,
  onNextPage,
  onDeletePage,
  saving = false,
  zoomLocked,
  onZoomLockChange,
}: ToolbarProps) {

  const handleDeletePage = () => {
    Alert.alert(
      'Delete Page',
      pageCount <= 1
        ? 'Clear all strokes on this page?'
        : `Delete page ${pageNumber}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: pageCount <= 1 ? 'Clear' : 'Delete', style: 'destructive', onPress: onDeletePage },
      ],
    );
  };

  return (
    <View style={styles.toolbar}>
      {/* Pen */}
      <TouchableOpacity
        style={[styles.btn, tool === 'pen' && styles.btnActive]}
        onPress={() => onToolChange('pen')}
      >
        <Text style={styles.btnIcon}>✏️</Text>
      </TouchableOpacity>

      {/* Eraser - custom two-tone icon */}
      <TouchableOpacity
        style={[styles.btn, tool === 'eraser' && styles.btnActive]}
        onPress={() => onToolChange('eraser')}
      >
        <EraserIcon />
      </TouchableOpacity>

      <View style={styles.divider} />

      {/* Stroke widths */}
      {WIDTHS.map(w => (
        <TouchableOpacity
          key={w}
          style={[styles.widthBtn, strokeWidth === w && styles.widthBtnActive]}
          onPress={() => onStrokeWidthChange(w)}
        >
          <View style={[styles.dot, { width: w * 2.5, height: w * 2.5, borderRadius: w * 2.5 }]} />
        </TouchableOpacity>
      ))}

      <View style={styles.divider} />

      {/* Undo */}
      <TouchableOpacity
        style={[styles.btn, !canUndo && styles.btnDisabled]}
        onPress={onUndo}
        disabled={!canUndo}
      >
        <Text style={[styles.btnIcon, !canUndo && styles.iconDisabled]}>↩</Text>
      </TouchableOpacity>

      {/* Redo */}
      <TouchableOpacity
        style={[styles.btn, !canRedo && styles.btnDisabled]}
        onPress={onRedo}
        disabled={!canRedo}
      >
        <Text style={[styles.btnIcon, !canRedo && styles.iconDisabled]}>↪</Text>
      </TouchableOpacity>

      {/* Lock zoom */}
      <TouchableOpacity
        style={[styles.btn, zoomLocked && styles.btnActive]}
        onPress={() => onZoomLockChange(!zoomLocked)}
      >
        <Text style={styles.btnIcon}>{zoomLocked ? '🔒' : '🔓'}</Text>
      </TouchableOpacity>

      {/* Spacer */}
      <View style={{ flex: 1 }} />

      {/* Save status */}
      <Text style={styles.saveStatus}>{saving ? 'Saving...' : 'Saved ✓'}</Text>

      <View style={styles.divider} />

      {/* Page navigation */}
      <TouchableOpacity
        style={[styles.btn, pageNumber <= 1 && styles.btnDisabled]}
        onPress={onPrevPage}
        disabled={pageNumber <= 1}
      >
        <Text style={[styles.btnIcon, pageNumber <= 1 && styles.iconDisabled]}>◀</Text>
      </TouchableOpacity>

      <Text style={styles.pageLabel}>{pageNumber} / {pageCount}</Text>

      <TouchableOpacity
        style={[styles.btn, pageNumber >= pageCount && styles.btnDisabled]}
        onPress={onNextPage}
        disabled={pageNumber >= pageCount}
      >
        <Text style={[styles.btnIcon, pageNumber >= pageCount && styles.iconDisabled]}>▶</Text>
      </TouchableOpacity>

      {/* Add page */}
      {onAddPage && (
        <TouchableOpacity style={styles.addPageBtn} onPress={onAddPage}>
          <Text style={styles.addPageText}>+ Page</Text>
        </TouchableOpacity>
      )}

      {/* Delete page */}
      {onDeletePage && (
        <TouchableOpacity style={styles.deletePageBtn} onPress={handleDeletePage}>
          <Text style={styles.deletePageText}>🗑</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
  },
  btn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnActive: {
    backgroundColor: '#e63946',
  },
  btnDisabled: {
    opacity: 0.3,
  },
  btnIcon: {
    fontSize: 18,
    color: '#fff',
  },
  iconDisabled: {
    opacity: 0.4,
  },
  widthBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  widthBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  dot: {
    backgroundColor: '#fff',
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: 4,
  },
  pageLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    marginHorizontal: 4,
    minWidth: 40,
    textAlign: 'center',
  },
  saveStatus: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    marginHorizontal: 4,
  },
  addPageBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    marginLeft: 4,
  },
  addPageText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  deletePageBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(230,57,70,0.15)',
    marginLeft: 2,
  },
  deletePageText: {
    fontSize: 16,
  },
});
