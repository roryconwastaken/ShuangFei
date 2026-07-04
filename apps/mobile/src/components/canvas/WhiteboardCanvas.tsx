/**
 * WhiteboardCanvas - infinite-feel canvas with dot grid.
 *
 * Coordinate system: (0,0) is the center of the screen on first layout.
 * Strokes are stored in this canvas-space coordinate system.
 *
 * Key differences from BKBCanvas:
 *  - Dot grid (not BKB lines), no margins
 *  - Pan/zoom lock freezes current position instead of resetting to origin
 *  - singleFingerPan: one finger pans (for read-only student view)
 *  - No page navigation — single infinite surface
 */
import React, { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
import { Canvas, Path, Rect, Group, Skia, SkPath } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue, useDerivedValue, runOnJS, runOnUI } from 'react-native-reanimated';
import { Stroke, StrokePoint } from '../../lib/supabase';

const BG_COLOR    = '#ffffff';
const DOT_COLOR   = '#d0d8e0';
const DOT_SPACING = 40;
const DOT_RADIUS  = 1.5;
const EXTENT      = 2500; // canvas coords: -EXTENT to +EXTENT in each direction

// Dot grid is drawn once and lives in canvas space (moves with transform)
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
  readOnly?: boolean;
  singleFingerPan?: boolean;
  tool: 'pen' | 'eraser';
  strokeWidth: number;
  color?: string;
  zoomLocked: boolean;
  onStrokeEnd?: (strokes: Stroke[]) => void;
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
        {/* Dots drawn after strokes so eraser (white) can never visually remove them */}
        <Path path={dotGridPath} color={DOT_COLOR} style="fill" />
      </Group>
    </Canvas>
  );
});

export default function WhiteboardCanvas({
  strokes,
  readOnly = false,
  singleFingerPan = false,
  tool,
  strokeWidth,
  color = '#1a1a1a',
  zoomLocked,
  onStrokeEnd,
}: WhiteboardCanvasProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const initialised = useRef(false);

  const strokesRef     = useRef(strokes);
  const onStrokeEndRef = useRef(onStrokeEnd);
  useEffect(() => { strokesRef.current = strokes; }, [strokes]);
  useEffect(() => { onStrokeEndRef.current = onStrokeEnd; }, [onStrokeEnd]);

  const prevStrokesLen = useRef(strokes.length);
  useEffect(() => {
    if (strokes.length < prevStrokesLen.current) {
      runOnUI(() => { 'worklet'; activePointsSV.value = []; })();
    }
    prevStrokesLen.current = strokes.length;
  }, [strokes]);

  const transformSV     = useSharedValue({ scale: 1, offsetX: 0, offsetY: 0 });
  const activePointsSV = useSharedValue<number[]>([]);
  const activeColorSV   = useSharedValue<string>('#1a1a1a');
  const activeWidthSV   = useSharedValue<number>(strokeWidth);
  const toolSV          = useSharedValue<string>(tool);
  const strokeWidthSV   = useSharedValue<number>(strokeWidth);
  const colorSV         = useSharedValue<string>(color);
  const zoomLockedSV    = useSharedValue<boolean>(zoomLocked);

  useEffect(() => { toolSV.value = tool; }, [tool]);
  useEffect(() => { strokeWidthSV.value = strokeWidth; }, [strokeWidth]);
  useEffect(() => { colorSV.value = color; }, [color]);
  // Lock change: just freeze/unfreeze — do NOT reset transform
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

  const finalizeStroke = useCallback((pts: number[], color: string, width: number, toolName: string) => {
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
    onStrokeEndRef.current?.([...strokesRef.current, stroke]);
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
      if (readOnly || zoomLockedSV.value) return;
      const t = transformSV.value;
      // Convert screen → canvas coords (translate first, then scale in our transform order)
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
      if (readOnly || zoomLockedSV.value) return;
      if (activePointsSV.value.length === 0) return;
      const t = transformSV.value;
      const cx = (e.x - t.offsetX) / t.scale;
      const cy = (e.y - t.offsetY) / t.scale;
      activePointsSV.value = activePointsSV.value.concat(cx, cy);
    })
    .onEnd(() => {
      'worklet';
      const pts   = activePointsSV.value;
      const color = activeColorSV.value;
      const width = activeWidthSV.value;
      const t     = toolSV.value;
      if (pts.length > 0) runOnJS(finalizeStroke)(pts, color, width, t);
    });

  const navGesture = Gesture.Simultaneous(pinchGesture, navPan);

  const gesture = readOnly
    ? navGesture  // students: pan+zoom only (minPointers controlled by singleFingerPan)
    : singleFingerPan
      ? navGesture
      : zoomLocked
        ? drawGesture
        : Gesture.Simultaneous(drawGesture, navGesture);

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!initialised.current && width > 0) {
      // Center origin on screen on first layout
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
