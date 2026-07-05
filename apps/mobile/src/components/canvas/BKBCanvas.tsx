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
import React, { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
import { Canvas, Path, Rect, Group, Skia, SkPath } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue, useDerivedValue, runOnJS, runOnUI } from 'react-native-reanimated';
import { Stroke, StrokePoint } from '../../lib/supabase';

const COLS = 10;
const ROWS = 15;
const BG_COLOR = '#ffffff';
const GRID_COLOR = '#d0d8e0';
const MARGIN = 14;

// Fits the portrait reference rectangle (where the grid/strokes actually
// live) into a landscape container, preserving its aspect ratio — the same
// idea as CSS "object-fit: contain". Called from JS only (layout/effects),
// never from a gesture worklet.
function computeLandscapeFit(
  containerW: number, containerH: number,
  ref: { width: number; height: number },
) {
  if (ref.width <= 0 || ref.height <= 0 || containerW <= 0 || containerH <= 0) {
    return { scale: 1, offsetX: 0, offsetY: 0 };
  }
  const scale = Math.min(containerW / ref.width, containerH / ref.height);
  return {
    scale,
    offsetX: containerW / 2 - (ref.width / 2) * scale,
    offsetY: containerH / 2 - (ref.height / 2) * scale,
  };
}

interface BKBCanvasProps {
  strokes: Stroke[];
  annotations?: Stroke[];
  readOnly?: boolean;
  showGrid?: boolean;
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
  width, height, strokes, annotations, showGrid, gridPath, animatedTransform, buildPath,
}: {
  width: number;
  height: number;
  strokes: Stroke[];
  annotations: Stroke[];
  showGrid: boolean;
  gridPath: SkPath;
  animatedTransform: any;
  buildPath: (pts: StrokePoint[]) => SkPath;
}) {
  // Cache SkPath objects by stroke ID — rebuilt only when a stroke is new
  const strokeCacheRef     = useRef<Map<string, SkPath>>(new Map());
  const annotationCacheRef = useRef<Map<string, SkPath>>(new Map());

  const builtStrokes = useMemo(() => {
    const next = new Map<string, SkPath>();
    const result = strokes.map(s => {
      const path = strokeCacheRef.current.get(s.id) ?? buildPath(s.points);
      next.set(s.id, path);
      return { ...s, path };
    });
    strokeCacheRef.current = next;
    return result;
  }, [strokes, buildPath]);

  const builtAnnotations = useMemo(() => {
    const next = new Map<string, SkPath>();
    const result = annotations.map(s => {
      const path = annotationCacheRef.current.get(s.id) ?? buildPath(s.points);
      next.set(s.id, path);
      return { ...s, path };
    });
    annotationCacheRef.current = next;
    return result;
  }, [annotations, buildPath]);

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
        {showGrid && <Path path={gridPath} color={GRID_COLOR} style="stroke" strokeWidth={0.8} />}
        {builtAnnotations.map(s => (
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
      </Group>
    </Canvas>
  );
});

// ─── Main component ───────────────────────────────────────────────────────────
export default function BKBCanvas({
  strokes,
  annotations = [],
  readOnly = false,
  showGrid = true,
  annotationMode = false,
  onAnnotationEnd,
  tool,
  strokeWidth,
  zoomLocked,
  onStrokeEnd,
}: BKBCanvasProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  // Drawing/annotating is disabled in landscape (container wider than tall) —
  // touch coordinates don't reliably line up with the render transform there.
  const [isLandscape, setIsLandscape] = useState(false);
  // The last known PORTRAIT layout size. Strokes/grid are always captured
  // relative to whatever the portrait container was, so when viewing in
  // landscape we fit *that* rectangle (preserving its aspect ratio) into the
  // current box instead of re-stretching the grid to the landscape shape —
  // which is what caused squished cells and misaligned strokes there.
  const referenceSizeRef = useRef({ width: 0, height: 0 });
  const [referenceSize, setReferenceSize] = useState({ width: 0, height: 0 });

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

  // Clear the active layer when strokes are removed (clear page, undo, delete).
  // We check for a decrease so normal stroke commits (increase) don't interfere
  // with onBegin resetting the buffer — that would cause a race condition.
  const prevStrokesLen     = useRef(strokes.length);
  const prevAnnotationsLen = useRef(annotations.length);
  useEffect(() => {
    if (strokes.length < prevStrokesLen.current) {
      runOnUI(() => { 'worklet'; activePointsSV.value = []; })();
    }
    prevStrokesLen.current = strokes.length;
  }, [strokes]);
  useEffect(() => {
    if (annotations.length < prevAnnotationsLen.current) {
      runOnUI(() => { 'worklet'; activePointsSV.value = []; })();
    }
    prevAnnotationsLen.current = annotations.length;
  }, [annotations]);

  const sizeRef = useRef({ width: 0, height: 0 });

  // ─── Shared values (accessible from UI-thread worklets) ────────────────────
  const transformSV = useSharedValue({ scale: 1, offsetX: 0, offsetY: 0 });
  const canvasSizeSV = useSharedValue({ width: 0, height: 0 });
  const isLandscapeSV = useSharedValue(false);

  // Active stroke points — reassigned (not mutated) on every touch event so
  // Reanimated always detects the change and re-runs useDerivedValue reliably.
  // concat() is a native C++ operation so the O(n) copy is far cheaper than
  // a manual JS loop, and guarantees the update is never silently dropped.
  const activePointsSV  = useSharedValue<number[]>([]);
  const activeColorSV   = useSharedValue<string>('#1a1a1a');
  const activeWidthSV   = useSharedValue<number>(strokeWidth);

  // Mirror props into shared values so worklets can read them
  const toolSV            = useSharedValue<string>(tool);
  const strokeWidthSV     = useSharedValue<number>(strokeWidth);
  const annotationModeSV  = useSharedValue<boolean>(annotationMode);
  useEffect(() => { toolSV.value = tool; }, [tool]);
  useEffect(() => { strokeWidthSV.value = strokeWidth; }, [strokeWidth]);
  useEffect(() => { annotationModeSV.value = annotationMode; }, [annotationMode]);

  // While locked, pin the transform to the resting fit — identity in
  // portrait, or the landscape contain-fit — any time locking, orientation,
  // or the settled layout size changes. Landscape is fully static while
  // locked (no gesture can move it), so re-asserting here on every relevant
  // dependency change also guards against a transient/incorrect transform
  // from an in-between onLayout call during the rotation animation.
  useEffect(() => {
    if (!zoomLocked) return;
    transformSV.value = isLandscape
      ? computeLandscapeFit(size.width, size.height, referenceSizeRef.current)
      : { scale: 1, offsetX: 0, offsetY: 0 };
  }, [zoomLocked, isLandscape, size.width, size.height, referenceSize.width, referenceSize.height]);

  // ─── Derived values (UI thread only, zero-latency) ─────────────────────────
  // Group transform for both static and active canvases
  const animatedTransform = useDerivedValue(() => [
    { translateX: transformSV.value.offsetX },
    { translateY: transformSV.value.offsetY },
    { scale: transformSV.value.scale },
  ]);

  // Active path: same quadTo smoothing as buildPath so the stroke looks
  // identical to the committed static version — no visible jump on commit.
  // The previous stroke stays visible until onBegin replaces the array,
  // giving zero gap between the active layer clearing and the static layer
  // rendering the new stroke.
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

  // ─── Grid (static, recomputed only when the portrait reference changes) ───
  // Always built in the portrait reference's coordinate space (not the
  // current, possibly-landscape, container) so cells stay the same shape
  // regardless of orientation — the landscape transform fits this whole
  // rectangle into the screen rather than re-stretching it.
  const gridPath = useMemo(() => {
    if (referenceSize.width === 0) return Skia.PathBuilder.Make().detach();
    const builder = Skia.PathBuilder.Make();
    const x0 = MARGIN, y0 = MARGIN;
    const x1 = referenceSize.width - MARGIN, y1 = referenceSize.height - MARGIN;
    const cw = (x1 - x0) / COLS, ch = (y1 - y0) / ROWS;
    for (let c = 0; c <= COLS; c++) {
      builder.moveTo(x0 + c * cw, y0); builder.lineTo(x0 + c * cw, y1);
    }
    for (let r = 0; r <= ROWS; r++) {
      builder.moveTo(x0, y0 + r * ch); builder.lineTo(x1, y0 + r * ch);
    }
    return builder.detach();
  }, [referenceSize]);

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
    // Single-point tap: duplicate the point so it renders as a visible dot
    const raw = pts.length === 2 ? [pts[0], pts[1], pts[0] + 0.1, pts[1] + 0.1] : pts;
    const points: StrokePoint[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      points.push({ x: raw[i], y: raw[i + 1], t: Date.now() });
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
      if (readOnly || isLandscapeSV.value) return;
      const t = transformSV.value;
      let cx = (e.x - t.offsetX) / t.scale;
      let cy = (e.y - t.offsetY) / t.scale;
      // Clamp to grid area so nothing can be drawn (or erased) outside
      const s = canvasSizeSV.value;
      if (s.width > 0) {
        cx = Math.max(MARGIN, Math.min(s.width - MARGIN, cx));
        cy = Math.max(MARGIN, Math.min(s.height - MARGIN, cy));
      }
      if (toolSV.value === 'eraser') {
        activeColorSV.value = BG_COLOR;
        activeWidthSV.value = strokeWidthSV.value * 6;
      } else if (annotationModeSV.value) {
        activeColorSV.value = '#e63946';
        activeWidthSV.value = strokeWidthSV.value;
      } else {
        activeColorSV.value = '#1a1a1a';
        activeWidthSV.value = strokeWidthSV.value;
      }
      // Reassign (not mutate) so Reanimated always detects the change
      activePointsSV.value = [cx, cy];
    })
    .onUpdate(e => {
      'worklet';
      if (isLandscapeSV.value) return;
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
      // concat() always returns a new array — reliable reassignment, native speed
      activePointsSV.value = activePointsSV.value.concat(cx, cy);
    })
    .onEnd((_e, success) => {
      'worklet';
      // success is false when the gesture was cancelled (e.g. a second finger
      // joined to pan/zoom) — don't leave behind an accidental dot in that case
      if (!success) return;
      const pts   = activePointsSV.value;
      const color = activeColorSV.value;
      const width = activeWidthSV.value;
      const t     = toolSV.value;
      // Keep active path visible — onBegin replaces it when next stroke starts,
      // by which time the static layer has already rendered the committed stroke.
      if (pts.length > 0) runOnJS(finalizeStroke)(pts, color, width, t);
    })
    .onFinalize((_e, success) => {
      'worklet';
      if (!success) activePointsSV.value = [];
    });

  const pinchGesture = Gesture.Pinch()
    .onBegin(() => {
      'worklet';
      pinchBaseSV.value = transformSV.value.scale;
    })
    .onUpdate(e => {
      'worklet';
      // Floor is lower than 1 because in landscape the resting/"fit" scale
      // can itself be well below 1 (the portrait page letterboxed down) —
      // clamping to 1 there would force a jarring snap the instant you touch.
      const newScale = Math.max(0.3, Math.min(5, pinchBaseSV.value * e.scale));
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

  // One finger also pans — only relevant while unlocked/landscape (no
  // drawing happening), so it can never compete with drawGesture. Capped at
  // 1 pointer so it steps aside the moment a second finger joins for pinch.
  const onePanGesture = Gesture.Pan()
    .maxPointers(1)
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

  const navGesture = Gesture.Simultaneous(onePanGesture, pinchGesture, navPan);

  // Locked: draw in portrait, completely static (no pan/zoom either) in
  // landscape — landscape touch coordinates don't reliably line up with the
  // render transform for drawing, and "locked" should mean locked, not just
  // "no drawing." Unlocked (either orientation): pan/zoom only, never draw.
  const gesture = readOnly
    ? zoomLocked ? Gesture.Pan() : navGesture
    : zoomLocked
      ? (isLandscape ? Gesture.Pan() : drawGesture)
      : navGesture;

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    sizeRef.current = { width, height };
    canvasSizeSV.value = { width, height };
    setSize({ width, height });

    const landscape = width > height;
    isLandscapeSV.value = landscape;
    setIsLandscape(landscape);

    if (!landscape) {
      // Portrait: the container itself is the reference, and the transform
      // is identity — exactly the original (working) drawing behavior.
      referenceSizeRef.current = { width, height };
      setReferenceSize({ width, height });
      transformSV.value = { scale: 1, offsetX: 0, offsetY: 0 };
      return;
    }

    // Landscape: fit the last-known portrait reference into this box. If
    // we've never seen a portrait layout yet, guess a portrait-shaped
    // reference (transposed current dims) so the grid isn't blank — it'll
    // be replaced with the real thing the first time the device is portrait.
    if (referenceSizeRef.current.width === 0) {
      referenceSizeRef.current = { width: height, height: width };
      setReferenceSize(referenceSizeRef.current);
    }
    transformSV.value = computeLandscapeFit(width, height, referenceSizeRef.current);
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
              showGrid={showGrid}
              gridPath={gridPath}
              animatedTransform={animatedTransform}
              buildPath={buildPath}
            />

            {/* Active stroke: entirely UI-thread driven, zero-latency.
                Grid is drawn on top here too (same as the static layer) so the
                live view matches exactly what the static layer will show once
                the stroke commits — otherwise an eraser drag looks fully
                clean while active, then the grid "pops back" over it the
                moment the next stroke replaces this layer. */}
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
                  {showGrid && <Path path={gridPath} color={GRID_COLOR} style="stroke" strokeWidth={0.8} />}
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
