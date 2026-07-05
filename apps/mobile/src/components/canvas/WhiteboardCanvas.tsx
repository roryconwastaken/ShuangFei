/**
 * WhiteboardCanvas - infinite-feel canvas with dot grid.
 *
 * Coordinate system: (0,0) is the center of the screen on first layout.
 * Strokes are stored in this canvas-space coordinate system.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, LayoutChangeEvent, TextInput } from 'react-native';
import { Canvas, Path, Rect, Group, Skia, SkPath } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useDerivedValue, useAnimatedStyle, runOnJS, runOnUI, SharedValue } from 'react-native-reanimated';
import { Stroke, StrokePoint, TextBox } from '../../lib/supabase';

const BG_COLOR    = '#ffffff';
const DOT_COLOR   = '#d0d8e0';
const DOT_SPACING = 40;
const DOT_RADIUS  = 1.5;
const EXTENT      = 2500;

const dotGridPath = (() => {
  const builder = Skia.PathBuilder.Make();
  for (let x = -EXTENT; x <= EXTENT; x += DOT_SPACING) {
    for (let y = -EXTENT; y <= EXTENT; y += DOT_SPACING) {
      builder.addCircle(x, y, DOT_RADIUS);
    }
  }
  return builder.detach();
})();

interface WhiteboardCanvasProps {
  strokes: Stroke[];
  textBoxes?: TextBox[];
  selectedTextBoxId?: string | null;
  editingTextBoxId?: string | null;
  readOnly?: boolean;
  singleFingerPan?: boolean;
  tool: 'pen' | 'eraser' | 'text';
  strokeWidth: number;
  color?: string;
  zoomLocked: boolean;
  onStrokeEnd?: (strokes: Stroke[]) => void;
  onCanvasTap?: (canvasX: number, canvasY: number) => void;
  onTextBoxSelect?: (id: string | null) => void;
  onTextBoxChange?: (boxes: TextBox[]) => void;
  onTextBoxEditEnd?: (id: string, text: string) => void;
}

function TextBoxItem({
  box, isSelected, isEditing, readOnly, transformSV,
  onSelect, onMoveEnd, onResizeEnd, onDelete, onEditEnd,
}: {
  box: TextBox;
  isSelected: boolean;
  isEditing: boolean;
  readOnly: boolean;
  transformSV: SharedValue<{ scale: number; offsetX: number; offsetY: number }>;
  onSelect: () => void;
  onMoveEnd: (newX: number, newY: number) => void;
  onResizeEnd: (newFontSize: number) => void;
  onDelete: () => void;
  onEditEnd: (text: string) => void;
}) {
  const [localText, setLocalText] = useState(box.text);
  const [editFontSize, setEditFontSize] = useState(() => Math.max(8, box.fontSize * transformSV.value.scale));

  // Keep localText fresh when not editing (e.g. remote updates)
  useEffect(() => { if (!isEditing) setLocalText(box.text); }, [box.text, isEditing]);

  // Save whenever editing ends, however it was triggered (TextInput blur,
  // or the parent clearing editingTextBoxId directly on deselect/tool switch)
  const localTextRef = useRef(localText);
  useEffect(() => { localTextRef.current = localText; }, [localText]);
  const wasEditingRef = useRef(isEditing);
  useEffect(() => {
    if (wasEditingRef.current && !isEditing) onEditEnd(localTextRef.current);
    wasEditingRef.current = isEditing;
  }, [isEditing, onEditEnd]);

  // Snapshot screen-space font size when editing starts or size changes while editing
  useEffect(() => {
    if (isEditing) setEditFontSize(Math.max(8, box.fontSize * transformSV.value.scale));
  }, [isEditing, box.fontSize]);

  const panSV     = useSharedValue({ x: 0, y: 0 });
  const baseSV    = useSharedValue({ x: box.x, y: box.y });
  const resizeSV  = useSharedValue(0);
  const fontBSV   = useSharedValue(box.fontSize);
  const boxSizeSV = useSharedValue({ w: 120, h: 30 });

  useEffect(() => { baseSV.value = { x: box.x, y: box.y }; }, [box.x, box.y]);
  useEffect(() => { fontBSV.value = box.fontSize; }, [box.fontSize]);

  const containerStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: (baseSV.value.x + panSV.value.x) * transformSV.value.scale + transformSV.value.offsetX,
    top:  (baseSV.value.y + panSV.value.y) * transformSV.value.scale + transformSV.value.offsetY,
  }));

  const textStyle = useAnimatedStyle(() => ({
    fontSize: Math.max(8, (fontBSV.value + resizeSV.value) * transformSV.value.scale),
  }));

  const handleDeleteStyle = useAnimatedStyle(() => {
    const t = transformSV.value;
    const sx = (baseSV.value.x + panSV.value.x) * t.scale + t.offsetX;
    const sy = (baseSV.value.y + panSV.value.y) * t.scale + t.offsetY;
    return { position: 'absolute', left: sx + boxSizeSV.value.w - 12, top: sy - 28 };
  });

  const handleResizeStyle = useAnimatedStyle(() => {
    const t = transformSV.value;
    const sx = (baseSV.value.x + panSV.value.x) * t.scale + t.offsetX;
    const sy = (baseSV.value.y + panSV.value.y) * t.scale + t.offsetY;
    return { position: 'absolute', left: sx + boxSizeSV.value.w - 8, top: sy + boxSizeSV.value.h - 8 };
  });

  const moveGesture = Gesture.Pan()
    .minDistance(0)
    .maxPointers(1)
    .onUpdate(e => {
      'worklet';
      const s = transformSV.value.scale;
      panSV.value = { x: e.translationX / s, y: e.translationY / s };
    })
    .onEnd(e => {
      'worklet';
      const finalX = baseSV.value.x + panSV.value.x;
      const finalY = baseSV.value.y + panSV.value.y;
      panSV.value = { x: 0, y: 0 };
      if (Math.abs(e.translationX) < 6 && Math.abs(e.translationY) < 6) {
        runOnJS(onSelect)();
      } else {
        runOnJS(onMoveEnd)(finalX, finalY);
      }
    });

  const resizeGesture = Gesture.Pan()
    .minDistance(0)
    .onUpdate(e => {
      'worklet';
      const s = transformSV.value.scale;
      resizeSV.value = (e.translationX + e.translationY) / (2 * s);
    })
    .onEnd(() => {
      'worklet';
      const newFs = Math.max(8, fontBSV.value + resizeSV.value);
      resizeSV.value = 0;
      runOnJS(onResizeEnd)(newFs);
    });

  const tapGesture = Gesture.Tap()
    .onEnd(() => { 'worklet'; runOnJS(onSelect)(); });

  const deleteGesture = Gesture.Tap()
    .onEnd(() => { 'worklet'; runOnJS(onDelete)(); });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    boxSizeSV.value = { w: width, h: height };
  };

  if (readOnly) {
    return (
      <Animated.View style={[containerStyle, { padding: 6 }]} pointerEvents="none">
        <Animated.Text style={[textStyle, { color: box.color, includeFontPadding: false }]}>
          {box.text}
        </Animated.Text>
      </Animated.View>
    );
  }

  // Editing mode — no gesture detector so TextInput gets native touch handling
  if (isEditing) {
    return (
      <>
        <Animated.View style={[containerStyle, { padding: 6 }, styles.tbSelected]} onLayout={onLayout}>
          <TextInput
            value={localText}
            onChangeText={setLocalText}
            onBlur={() => onEditEnd(localText)}
            autoFocus
            multiline
            scrollEnabled={false}
            style={{
              color: box.color,
              fontSize: editFontSize,
              includeFontPadding: false,
              minWidth: 80,
              padding: 0,
            }}
          />
        </Animated.View>
        <GestureDetector gesture={deleteGesture}>
          <Animated.View style={[handleDeleteStyle, styles.tbHandleBtn]}>
            <Animated.Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>✕</Animated.Text>
          </Animated.View>
        </GestureDetector>
      </>
    );
  }

  return (
    <>
      <GestureDetector gesture={isSelected ? moveGesture : tapGesture}>
        <Animated.View
          style={[containerStyle, { padding: 6 }, isSelected && styles.tbSelected]}
          onLayout={onLayout}
        >
          <Animated.Text style={[textStyle, { color: box.color, includeFontPadding: false }]}>
            {box.text || ' '}
          </Animated.Text>
        </Animated.View>
      </GestureDetector>

      {isSelected && (
        <>
          <GestureDetector gesture={deleteGesture}>
            <Animated.View style={[handleDeleteStyle, styles.tbHandleBtn]}>
              <Animated.Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>✕</Animated.Text>
            </Animated.View>
          </GestureDetector>
          <GestureDetector gesture={resizeGesture}>
            <Animated.View style={[handleResizeStyle, styles.tbResizeHandle]} />
          </GestureDetector>
        </>
      )}
    </>
  );
}

const StaticLayer = React.memo(function StaticLayer({
  width, height, strokes, animatedTransform, buildPath,
}: {
  width: number; height: number;
  strokes: Stroke[];
  animatedTransform: any;
  buildPath: (pts: StrokePoint[]) => SkPath;
}) {
  const cacheRef = useRef<Map<string, SkPath>>(new Map());

  const builtStrokes = useMemo(() => {
    const next = new Map<string, SkPath>();
    const result = strokes.map(s => {
      const path = cacheRef.current.get(s.id) ?? buildPath(s.points);
      next.set(s.id, path);
      return { ...s, path };
    });
    cacheRef.current = next;
    return result;
  }, [strokes, buildPath]);

  return (
    <Canvas style={StyleSheet.absoluteFill}>
      <Rect x={0} y={0} width={width} height={height} color={BG_COLOR} />
      <Group transform={animatedTransform}>
        {builtStrokes.map(s => (
          <Path
            key={s.id}
            path={s.path}
            color={s.color}
            style="stroke"
            strokeWidth={s.width}
            strokeCap="round"
            strokeJoin="round"
          />
        ))}
        <Path path={dotGridPath} color={DOT_COLOR} style="fill" />
      </Group>
    </Canvas>
  );
});

export default function WhiteboardCanvas({
  strokes,
  textBoxes = [],
  selectedTextBoxId = null,
  editingTextBoxId = null,
  readOnly = false,
  singleFingerPan = false,
  tool,
  strokeWidth,
  color = '#1a1a1a',
  zoomLocked,
  onStrokeEnd,
  onCanvasTap,
  onTextBoxSelect,
  onTextBoxChange,
  onTextBoxEditEnd,
}: WhiteboardCanvasProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const initialised = useRef(false);

  const strokesRef     = useRef(strokes);
  const onStrokeEndRef = useRef(onStrokeEnd);
  const onCanvasTapRef = useRef(onCanvasTap);
  useEffect(() => { strokesRef.current = strokes; }, [strokes]);
  useEffect(() => { onStrokeEndRef.current = onStrokeEnd; }, [onStrokeEnd]);
  useEffect(() => { onCanvasTapRef.current = onCanvasTap; }, [onCanvasTap]);

  const prevStrokesLen = useRef(strokes.length);
  useEffect(() => {
    if (strokes.length < prevStrokesLen.current) {
      runOnUI(() => { 'worklet'; activePointsSV.value = []; })();
    }
    prevStrokesLen.current = strokes.length;
  }, [strokes]);

  const transformSV    = useSharedValue({ scale: 1, offsetX: 0, offsetY: 0 });
  const activePointsSV = useSharedValue<number[]>([]);
  const activeColorSV  = useSharedValue<string>('#1a1a1a');
  const activeWidthSV  = useSharedValue<number>(strokeWidth);
  const toolSV         = useSharedValue<string>(tool);
  const strokeWidthSV  = useSharedValue<number>(strokeWidth);
  const colorSV        = useSharedValue<string>(color);
  const zoomLockedSV   = useSharedValue<boolean>(zoomLocked);

  useEffect(() => { toolSV.value = tool; }, [tool]);
  useEffect(() => { strokeWidthSV.value = strokeWidth; }, [strokeWidth]);
  useEffect(() => { colorSV.value = color; }, [color]);
  useEffect(() => { zoomLockedSV.value = zoomLocked; }, [zoomLocked]);

  const animatedTransform = useDerivedValue(() => [
    { translateX: transformSV.value.offsetX },
    { translateY: transformSV.value.offsetY },
    { scale: transformSV.value.scale },
  ]);

  const activePath = useDerivedValue(() => {
    const pts = activePointsSV.value;
    const len = pts.length;
    if (len < 2) return Skia.PathBuilder.Make().detach();
    const b = Skia.PathBuilder.Make();
    b.moveTo(pts[0], pts[1]);
    if (len === 2) {
      b.lineTo(pts[0] + 0.1, pts[1] + 0.1);
    } else {
      for (let i = 2; i < len - 2; i += 2) {
        const mx = (pts[i] + pts[i + 2]) / 2;
        const my = (pts[i + 1] + pts[i + 3]) / 2;
        b.quadTo(pts[i], pts[i + 1], mx, my);
      }
      b.lineTo(pts[len - 2], pts[len - 1]);
    }
    return b.detach();
  });

  const buildPath = useCallback((points: StrokePoint[]): SkPath => {
    if (points.length === 0) return Skia.Path.Make();
    const builder = Skia.PathBuilder.Make();
    builder.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      if (i < points.length - 1) {
        const mx = (points[i].x + points[i + 1].x) / 2;
        const my = (points[i].y + points[i + 1].y) / 2;
        builder.quadTo(points[i].x, points[i].y, mx, my);
      } else {
        builder.lineTo(points[i].x, points[i].y);
      }
    }
    return builder.detach();
  }, []);

  const finalizeStroke = useCallback((pts: number[], c: string, width: number, toolName: string) => {
    const raw = pts.length === 2 ? [pts[0], pts[1], pts[0] + 0.1, pts[1] + 0.1] : pts;
    const points: StrokePoint[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      points.push({ x: raw[i], y: raw[i + 1], t: Date.now() });
    }
    const stroke: Stroke = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      tool: toolName as 'pen' | 'eraser',
      color: c,
      width,
      points,
    };
    onStrokeEndRef.current?.([...strokesRef.current, stroke]);
  }, []);

  // Stable wrapper so onCanvasTapRef is never captured by a worklet closure
  const callCanvasTap = useCallback((cx: number, cy: number) => {
    onCanvasTapRef.current?.(cx, cy);
  }, []);

  // ─── Gestures ─────────────────────────────────────────────────────────────

  const pinchBaseSV = useSharedValue(1);
  const panBaseSV   = useSharedValue({ x: 0, y: 0 });

  const pinchGesture = Gesture.Pinch()
    .onBegin(() => {
      'worklet';
      pinchBaseSV.value = transformSV.value.scale;
    })
    .onUpdate(e => {
      'worklet';
      if (zoomLockedSV.value) return;
      const newScale = Math.max(0.3, Math.min(8, pinchBaseSV.value * e.scale));
      const cur = transformSV.value;
      transformSV.value = { scale: newScale, offsetX: cur.offsetX, offsetY: cur.offsetY };
    });

  const navPan = Gesture.Pan()
    .minPointers(singleFingerPan ? 1 : 2)
    .onBegin(() => {
      'worklet';
      const cur = transformSV.value;
      panBaseSV.value = { x: cur.offsetX, y: cur.offsetY };
    })
    .onUpdate(e => {
      'worklet';
      if (zoomLockedSV.value) return;
      const base = panBaseSV.value;
      const cur  = transformSV.value;
      transformSV.value = {
        scale:   cur.scale,
        offsetX: base.x + e.translationX,
        offsetY: base.y + e.translationY,
      };
    });

  const drawGesture = Gesture.Pan()
    .minDistance(0)
    .maxPointers(1)
    .onBegin(e => {
      'worklet';
      if (readOnly) return;
      const t = transformSV.value;
      const cx = (e.x - t.offsetX) / t.scale;
      const cy = (e.y - t.offsetY) / t.scale;
      if (toolSV.value === 'eraser') {
        activeColorSV.value = BG_COLOR;
        activeWidthSV.value = strokeWidthSV.value * 6;
      } else {
        activeColorSV.value = colorSV.value;
        activeWidthSV.value = strokeWidthSV.value;
      }
      activePointsSV.value = [cx, cy];
    })
    .onUpdate(e => {
      'worklet';
      if (readOnly) return;
      if (activePointsSV.value.length === 0) return;
      const t = transformSV.value;
      const cx = (e.x - t.offsetX) / t.scale;
      const cy = (e.y - t.offsetY) / t.scale;
      activePointsSV.value = activePointsSV.value.concat(cx, cy);
    })
    .onEnd((_e, success) => {
      'worklet';
      // success is false when the gesture was cancelled (e.g. a second finger
      // joined to pan/zoom) — don't leave behind an accidental dot in that case
      if (!success) return;
      const pts   = activePointsSV.value;
      const c     = activeColorSV.value;
      const width = activeWidthSV.value;
      const t     = toolSV.value;
      if (pts.length > 0) runOnJS(finalizeStroke)(pts, c, width, t);
    })
    .onFinalize((_e, success) => {
      'worklet';
      if (!success) activePointsSV.value = [];
    });

  const tapGesture = Gesture.Tap()
    .onEnd(e => {
      'worklet';
      if (toolSV.value !== 'text') return;
      const t = transformSV.value;
      const cx = (e.x - t.offsetX) / t.scale;
      const cy = (e.y - t.offsetY) / t.scale;
      runOnJS(callCanvasTap)(cx, cy);
    });

  const navGesture = Gesture.Simultaneous(pinchGesture, navPan);

  const gesture = readOnly
    ? navGesture
    : singleFingerPan
      ? navGesture
      : tool === 'text'
        ? Gesture.Simultaneous(tapGesture, navGesture)
        : zoomLocked
          ? drawGesture
          : Gesture.Simultaneous(drawGesture, navGesture);

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!initialised.current && width > 0) {
      transformSV.value = { scale: 1, offsetX: width / 2, offsetY: height / 2 };
      initialised.current = true;
    }
    setSize({ width, height });
  };

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.container} onLayout={handleLayout}>
        {size.width > 0 && (
          <>
            <StaticLayer
              width={size.width}
              height={size.height}
              strokes={strokes}
              animatedTransform={animatedTransform}
              buildPath={buildPath}
            />
            {/* Active stroke — purely visual, no pointer events.
                Dot grid is drawn on top here too (same as the static layer)
                so the live view matches exactly what the static layer will
                show once the stroke commits — otherwise an eraser drag looks
                fully clean while active, then the dots "pop back" over it
                the moment the next stroke replaces this layer. */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <Canvas style={StyleSheet.absoluteFill}>
                <Group transform={animatedTransform}>
                  <Path
                    path={activePath}
                    color={activeColorSV}
                    style="stroke"
                    strokeWidth={activeWidthSV}
                    strokeCap="round"
                    strokeJoin="round"
                  />
                  <Path path={dotGridPath} color={DOT_COLOR} style="fill" />
                </Group>
              </Canvas>
            </View>

            {/* Text box overlay */}
            <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
              {textBoxes.map(box => (
                <TextBoxItem
                  key={box.id}
                  box={box}
                  isSelected={selectedTextBoxId === box.id}
                  isEditing={editingTextBoxId === box.id}
                  readOnly={readOnly}
                  transformSV={transformSV}
                  onSelect={() => onTextBoxSelect?.(box.id)}
                  onMoveEnd={(x, y) => onTextBoxChange?.(textBoxes.map(b => b.id === box.id ? { ...b, x, y } : b))}
                  onResizeEnd={(fs) => onTextBoxChange?.(textBoxes.map(b => b.id === box.id ? { ...b, fontSize: fs } : b))}
                  onDelete={() => onTextBoxChange?.(textBoxes.filter(b => b.id !== box.id))}
                  onEditEnd={(text) => onTextBoxEditEnd?.(box.id, text)}
                />
              ))}
            </View>
          </>
        )}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG_COLOR, overflow: 'hidden' },
  tbSelected: {
    borderWidth: 1.5,
    borderColor: '#8B1A1A',
    borderStyle: 'dashed',
    borderRadius: 4,
  },
  tbHandleBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#8B1A1A',
    justifyContent: 'center', alignItems: 'center',
  },
  tbResizeHandle: {
    width: 18, height: 18, borderRadius: 3,
    backgroundColor: '#8B1A1A',
    borderWidth: 2, borderColor: '#fff',
  },
});
