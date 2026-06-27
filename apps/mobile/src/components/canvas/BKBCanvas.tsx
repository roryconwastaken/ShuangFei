/**
 * BKBCanvas - Performance architecture:
 *
 * STATIC layer (React.memo): completed strokes + grid + annotations.
 *   Re-renders ONLY when a stroke ends or zoom changes. Never during drawing.
 *
 * ACTIVE layer: the stroke currently being drawn.
 *   Driven by Reanimated shared values + useDerivedValue entirely on the UI
 *   thread. Touch → path update → Skia render happens in ONE frame with ZERO
 *   JS bridge crossings. Near-zero latency.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
import { Canvas, Path, Rect, Group, Skia, SkPath } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue, useDerivedValue, runOnJS } from 'react-native-reanimated';
import { Stroke, StrokePoint } from '../../lib/supabase';

const COLS = 10;
const ROWS = 15;
const BG_COLOR = '#ffffff';
const GRID_COLOR = '#d0d8e0';
const MARGIN = 14;

interface BKBCanvasProps {
  strokes: Stroke[];
  annotations?: Stroke[];
  readOnly?: boolean;
  // When true: drawing always produces red strokes routed to onAnnotationEnd,
  // not to onStrokeEnd. Used for teacher annotation mode.
  annotationMode?: boolean;
  onAnnotationEnd?: (annotations: Stroke[]) => void;
  tool: 'pen' | 'eraser';
  strokeWidth: number;
  zoomLocked: boolean;
  onStrokeEnd?: (strokes: Stroke[]) => void;
}

// ─── Static layer ─────────────────────────────────────────────────────────────
// React.memo: only re-renders when a stroke is committed or zoom changes.
// The Group uses animatedTransform (a Reanimated derived value) so zoom/pan
// updates bypass React entirely and render directly on the UI thread.
const StaticLayer = React.memo(function StaticLayer({
  width, height, strokes, annotations, gridPath, animatedTransform, buildPath,
}: {
  width: number;
  height: number;
  strokes: Stroke[];
  annotations: Stroke[];
  gridPath: SkPath;
  animatedTransform: any; // DerivedValue<Transform[]>
  buildPath: (pts: StrokePoint[]) => SkPath;
}) {
  return (
    <Canvas style={StyleSheet.absoluteFill}>
      <Rect x={0} y={0} width={width} height={height} color={BG_COLOR} />
      <Group transform={animatedTransform}>
        {strokes.map(s => (
          <Path
            key={s.id}
            path={buildPath(s.points)}
            color={s.color}
            style="stroke"
            strokeWidth={s.width}
            strokeCap="round"
            strokeJoin="round"
          />
        ))}
        {/* Grid drawn AFTER strokes so eraser can never visually remove grid lines */}
        <Path path={gridPath} color={GRID_COLOR} style="stroke" strokeWidth={0.8} />
        {annotations.map(s => (
          <Path
            key={s.id}
            path={buildPath(s.points)}
            color="#e63946"
            style="stroke"
            strokeWidth={s.width}
            strokeCap="round"
            strokeJoin="round"
          />
        ))}
      </Group>
    </Canvas>
  );
});

// ─── Main component ───────────────────────────────────────────────────────────
export default function BKBCanvas({
  strokes,
  annotations = [],
  readOnly = false,
  annotationMode = false,
  onAnnotationEnd,
  tool,
  strokeWidth,
  zoomLocked,
  onStrokeEnd,
}: BKBCanvasProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  // Stable refs so worklet-called JS functions always see latest values
  const strokesRef = useRef(strokes);
  const onStrokeEndRef = useRef(onStrokeEnd);
  useEffect(() => { strokesRef.current = strokes; }, [strokes]);
  useEffect(() => { onStrokeEndRef.current = onStrokeEnd; }, [onStrokeEnd]);

  // Annotation mode refs (teacher canvas)
  const annotationsRef = useRef(annotations);
  const onAnnotationEndRef = useRef(onAnnotationEnd);
  const annotationModeRef = useRef(annotationMode);
  useEffect(() => { annotationsRef.current = annotations; }, [annotations]);
  useEffect(() => { onAnnotationEndRef.current = onAnnotationEnd; }, [onAnnotationEnd]);
  useEffect(() => { annotationModeRef.current = annotationMode; }, [annotationMode]);

  const sizeRef = useRef({ width: 0, height: 0 });

  // ─── Shared values (accessible from UI-thread worklets) ────────────────────
  const transformSV = useSharedValue({ scale: 1, offsetX: 0, offsetY: 0 });
  const canvasSizeSV = useSharedValue({ width: 0, height: 0 });

  // Active stroke: flat [x0,y0, x1,y1, ...] - updated every touch point on UI thread
  const activePointsSV = useSharedValue<number[]>([]);
  const activeColorSV  = useSharedValue<string>('#1a1a1a');
  const activeWidthSV  = useSharedValue<number>(strokeWidth);

  // Mirror props into shared values so worklets can read them
  const toolSV            = useSharedValue<string>(tool);
  const strokeWidthSV     = useSharedValue<number>(strokeWidth);
  const annotationModeSV  = useSharedValue<boolean>(annotationMode);
  useEffect(() => { toolSV.value = tool; }, [tool]);
  useEffect(() => { strokeWidthSV.value = strokeWidth; }, [strokeWidth]);
  useEffect(() => { annotationModeSV.value = annotationMode; }, [annotationMode]);

  // Reset zoom whenever it gets locked
  useEffect(() => {
    if (zoomLocked) transformSV.value = { scale: 1, offsetX: 0, offsetY: 0 };
  }, [zoomLocked]);

  // ─── Derived values (UI thread only, zero-latency) ─────────────────────────
  // Group transform for both static and active canvases
  const animatedTransform = useDerivedValue(() => [
    { scale: transformSV.value.scale },
    { translateX: transformSV.value.offsetX },
    { translateY: transformSV.value.offsetY },
  ]);

  // Active path: rebuilt from shared points on the UI thread every time a
  // point is added. No JS involvement at all during drawing.
  const activePath = useDerivedValue(() => {
    const pts = activePointsSV.value;
    if (pts.length < 2) return Skia.PathBuilder.Make().detach();
    const builder = Skia.PathBuilder.Make();
    builder.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) {
      builder.lineTo(pts[i], pts[i + 1]);
    }
    return builder.detach();
  });

  // ─── Grid (static, recomputed only on layout change) ───────────────────────
  const gridPath = useMemo(() => {
    if (size.width === 0) return Skia.PathBuilder.Make().detach();
    const builder = Skia.PathBuilder.Make();
    const x0 = MARGIN, y0 = MARGIN;
    const x1 = size.width - MARGIN, y1 = size.height - MARGIN;
    const cw = (x1 - x0) / COLS, ch = (y1 - y0) / ROWS;
    for (let c = 0; c <= COLS; c++) {
      builder.moveTo(x0 + c * cw, y0); builder.lineTo(x0 + c * cw, y1);
    }
    for (let r = 0; r <= ROWS; r++) {
      builder.moveTo(x0, y0 + r * ch); builder.lineTo(x1, y0 + r * ch);
    }
    return builder.detach();
  }, [size]);

  // Smooth quadTo path for completed strokes (called on JS thread only)
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

  // ─── Stroke finalization (runs on JS thread via runOnJS) ───────────────────
  // Called once per stroke end. Uses refs to avoid stale closure issues.
  const finalizeStroke = useCallback((
    pts: number[], color: string, width: number, toolName: string,
  ) => {
    const points: StrokePoint[] = [];
    for (let i = 0; i < pts.length; i += 2) {
      points.push({ x: pts[i], y: pts[i + 1], t: Date.now() });
    }
    const stroke: Stroke = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      tool: toolName as 'pen' | 'eraser',
      color,
      width,
      points,
    };
    if (annotationModeRef.current) {
      onAnnotationEndRef.current?.([...annotationsRef.current, stroke]);
    } else {
      onStrokeEndRef.current?.([...strokesRef.current, stroke]);
    }
  }, []);

  // ─── Pinch / pan shared refs ────────────────────────────────────────────────
  const pinchBaseSV = useSharedValue(1);
  const panBaseSV   = useSharedValue({ x: 0, y: 0 });

  // ─── Gestures (UI thread worklets - no JS bridge during drawing) ─────────
  const drawGesture = Gesture.Pan()
    .minDistance(0)
    .maxPointers(1)
    .onBegin(e => {
      'worklet';
      if (readOnly) return;
      const t = transformSV.value;
      let cx = (e.x - t.offsetX) / t.scale;
      let cy = (e.y - t.offsetY) / t.scale;
      // Clamp to grid area so nothing can be drawn (or erased) outside
      const s = canvasSizeSV.value;
      if (s.width > 0) {
        cx = Math.max(MARGIN, Math.min(s.width - MARGIN, cx));
        cy = Math.max(MARGIN, Math.min(s.height - MARGIN, cy));
      }
      if (annotationModeSV.value) {
        activeColorSV.value = '#e63946';
        activeWidthSV.value = strokeWidthSV.value;
      } else if (toolSV.value === 'eraser') {
        activeColorSV.value  = BG_COLOR;
        activeWidthSV.value  = strokeWidthSV.value * 6;
      } else {
        activeColorSV.value  = '#1a1a1a';
        activeWidthSV.value  = strokeWidthSV.value;
      }
      activePointsSV.value = [cx, cy];
    })
    .onUpdate(e => {
      'worklet';
      const t = transformSV.value;
      let cx = (e.x - t.offsetX) / t.scale;
      let cy = (e.y - t.offsetY) / t.scale;
      // Clamp to grid area
      const s = canvasSizeSV.value;
      if (s.width > 0) {
        cx = Math.max(MARGIN, Math.min(s.width - MARGIN, cx));
        cy = Math.max(MARGIN, Math.min(s.height - MARGIN, cy));
      }
      if (activePointsSV.value.length === 0) return;
      const prev = activePointsSV.value;
      const next = new Array(prev.length + 2);
      for (let i = 0; i < prev.length; i++) next[i] = prev[i];
      next[prev.length]     = cx;
      next[prev.length + 1] = cy;
      activePointsSV.value  = next;
    })
    .onEnd(() => {
      'worklet';
      const pts   = activePointsSV.value;
      const color = activeColorSV.value;
      const width = activeWidthSV.value;
      const t     = toolSV.value;
      activePointsSV.value = [];
      if (pts.length > 0) runOnJS(finalizeStroke)(pts, color, width, t);
    });

  const pinchGesture = Gesture.Pinch()
    .onBegin(() => {
      'worklet';
      pinchBaseSV.value = transformSV.value.scale;
    })
    .onUpdate(e => {
      'worklet';
      const newScale = Math.max(1, Math.min(5, pinchBaseSV.value * e.scale));
      const cur = transformSV.value;
      transformSV.value = { scale: newScale, offsetX: cur.offsetX, offsetY: cur.offsetY };
    });

  const navPan = Gesture.Pan()
    .minPointers(2)
    .onBegin(() => {
      'worklet';
      const cur = transformSV.value;
      panBaseSV.value = { x: cur.offsetX, y: cur.offsetY };
    })
    .onUpdate(e => {
      'worklet';
      const base = panBaseSV.value;
      const cur  = transformSV.value;
      transformSV.value = {
        scale:   cur.scale,
        offsetX: base.x + e.translationX,
        offsetY: base.y + e.translationY,
      };
    });

  const navGesture = Gesture.Simultaneous(pinchGesture, navPan);

  const gesture = readOnly
    ? Gesture.Pan()
    : zoomLocked
      ? drawGesture
      : Gesture.Simultaneous(drawGesture, navGesture);

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    sizeRef.current = { width, height };
    canvasSizeSV.value = { width, height };
    setSize({ width, height });
  };

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.container} onLayout={handleLayout}>
        {size.width > 0 && (
          <>
            {/* Static: only re-renders on stroke commit or zoom change */}
            <StaticLayer
              width={size.width}
              height={size.height}
              strokes={strokes}
              annotations={annotations}
              gridPath={gridPath}
              animatedTransform={animatedTransform}
              buildPath={buildPath}
            />

            {/* Active stroke: entirely UI-thread driven, zero-latency */}
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
                </Group>
              </Canvas>
            </View>
          </>
        )}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG_COLOR },
});
