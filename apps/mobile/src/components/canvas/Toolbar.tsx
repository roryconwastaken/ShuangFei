import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

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
        <MaterialCommunityIcons name="pencil" size={20} color="#fff" />
      </TouchableOpacity>

      {/* Eraser */}
      <TouchableOpacity
        style={[styles.btn, tool === 'eraser' && styles.btnActive]}
        onPress={() => onToolChange('eraser')}
      >
        <MaterialCommunityIcons name="eraser" size={20} color="#fff" />
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
        <MaterialCommunityIcons name="undo-variant" size={20} color={canUndo ? '#fff' : 'rgba(255,255,255,0.3)'} />
      </TouchableOpacity>

      {/* Redo */}
      <TouchableOpacity
        style={[styles.btn, !canRedo && styles.btnDisabled]}
        onPress={onRedo}
        disabled={!canRedo}
      >
        <MaterialCommunityIcons name="redo-variant" size={20} color={canRedo ? '#fff' : 'rgba(255,255,255,0.3)'} />
      </TouchableOpacity>

      {/* Zoom lock */}
      <TouchableOpacity
        style={[styles.btn, zoomLocked && styles.btnActive]}
        onPress={() => onZoomLockChange(!zoomLocked)}
      >
        <MaterialCommunityIcons
          name={zoomLocked ? 'lock' : 'lock-open-variant'}
          size={20}
          color="#fff"
        />
      </TouchableOpacity>

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
        <MaterialCommunityIcons name="chevron-left" size={22} color={pageNumber <= 1 ? 'rgba(255,255,255,0.3)' : '#fff'} />
      </TouchableOpacity>

      <Text style={styles.pageLabel}>{pageNumber} / {pageCount}</Text>

      <TouchableOpacity
        style={[styles.btn, pageNumber >= pageCount && styles.btnDisabled]}
        onPress={onNextPage}
        disabled={pageNumber >= pageCount}
      >
        <MaterialCommunityIcons name="chevron-right" size={22} color={pageNumber >= pageCount ? 'rgba(255,255,255,0.3)' : '#fff'} />
      </TouchableOpacity>

      {/* Add page */}
      {onAddPage && (
        <TouchableOpacity style={styles.addPageBtn} onPress={onAddPage}>
          <MaterialCommunityIcons name="plus" size={16} color="#fff" />
          <Text style={styles.addPageText}>Page</Text>
        </TouchableOpacity>
      )}

      {/* Delete page */}
      {onDeletePage && (
        <TouchableOpacity style={styles.deletePageBtn} onPress={handleDeletePage}>
          <MaterialCommunityIcons name="trash-can-outline" size={18} color="#e63946" />
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    marginLeft: 4,
  },
  addPageText: {
    color: '#fff',
    fontSize: 12,
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
});
