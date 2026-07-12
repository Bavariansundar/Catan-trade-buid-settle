import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

export interface BoardBounds {
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
  readonly height: number;
}

const MIN_SCALE = 1;
const MAX_SCALE = 3.5;
/** Pointer travel beyond this is a pan, and the tap that would follow it is suppressed. */
const DRAG_THRESHOLD_PX = 8;

interface Camera {
  readonly cx: number;
  readonly cy: number;
  readonly scale: number;
}

function fitCamera(bounds: BoardBounds): Camera {
  return { cx: bounds.minX + bounds.width / 2, cy: bounds.minY + bounds.height / 2, scale: 1 };
}

/**
 * Pan/pinch-zoom for the board SVG as pure viewBox math — one pointer
 * drags, two pinch, wheel zooms, double-tap/click resets to the fitted
 * view. No pointer capture (it would retarget clicks away from the piece
 * elements), so move/up are tracked on `window` for gestures that started
 * on the SVG. `wasDrag()` lets click handlers ignore the tap that ends a
 * pan. See docs/architecture/mobile-ux.md §2.
 */
export function usePanZoom(bounds: BoardBounds) {
  const [camera, setCamera] = useState<Camera>(() => fitCamera(bounds));

  // Re-fit when the board itself changes (new game, different module/size).
  const boundsKey = `${bounds.minX},${bounds.minY},${bounds.width},${bounds.height}`;
  const prevBoundsKey = useRef(boundsKey);
  if (prevBoundsKey.current !== boundsKey) {
    prevBoundsKey.current = boundsKey;
    setCamera(fitCamera(bounds));
  }

  const svgRef = useRef<SVGSVGElement | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragging = useRef(false);
  const downPos = useRef<{ x: number; y: number } | null>(null);

  const clampCamera = useCallback(
    (cam: Camera): Camera => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, cam.scale));
      const viewW = bounds.width / scale;
      const viewH = bounds.height / scale;
      const clamp = (v: number, lo: number, hi: number) =>
        lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v));
      return {
        scale,
        cx: clamp(cam.cx, bounds.minX + viewW / 2, bounds.minX + bounds.width - viewW / 2),
        cy: clamp(cam.cy, bounds.minY + viewH / 2, bounds.minY + bounds.height - viewH / 2),
      };
    },
    [bounds],
  );

  /**
   * Zoom by `factor`, keeping the board point currently rendered at the
   * client position (px, py) stationary. Accounts for the letterboxing
   * that preserveAspectRatio="xMidYMid meet" adds when the SVG element's
   * aspect ratio differs from the viewBox's.
   */
  const zoomAbout = useCallback(
    (px: number, py: number, factor: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      setCamera((cam) => {
        const viewW = bounds.width / cam.scale;
        const viewH = bounds.height / cam.scale;
        const pxPerUnit = Math.min(rect.width / viewW, rect.height / viewH);
        const offsetX = (rect.width - viewW * pxPerUnit) / 2;
        const offsetY = (rect.height - viewH * pxPerUnit) / 2;
        const bx = cam.cx - viewW / 2 + (px - rect.left - offsetX) / pxPerUnit;
        const by = cam.cy - viewH / 2 + (py - rect.top - offsetY) / pxPerUnit;

        const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, cam.scale * factor));
        const viewW2 = bounds.width / scale;
        const viewH2 = bounds.height / scale;
        const pxPerUnit2 = Math.min(rect.width / viewW2, rect.height / viewH2);
        const offsetX2 = (rect.width - viewW2 * pxPerUnit2) / 2;
        const offsetY2 = (rect.height - viewH2 * pxPerUnit2) / 2;
        const minX2 = bx - (px - rect.left - offsetX2) / pxPerUnit2;
        const minY2 = by - (py - rect.top - offsetY2) / pxPerUnit2;
        return clampCamera({ scale, cx: minX2 + viewW2 / 2, cy: minY2 + viewH2 / 2 });
      });
    },
    [bounds, clampCamera],
  );

  const onPointerDown = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      dragging.current = false;
      downPos.current = { x: e.clientX, y: e.clientY };
    } else {
      // A second finger is never the start of a tap.
      dragging.current = true;
    }
  }, []);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const entry = pointers.current.get(e.pointerId);
      if (!entry) return;
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();

      const prevPts = [...pointers.current.values()].map((p) => ({ ...p }));
      entry.x = e.clientX;
      entry.y = e.clientY;
      const curPts = [...pointers.current.values()].map((p) => ({ ...p }));

      if (downPos.current && !dragging.current) {
        const dx = e.clientX - downPos.current.x;
        const dy = e.clientY - downPos.current.y;
        if (dx * dx + dy * dy > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) dragging.current = true;
      }

      if (curPts.length === 1) {
        const dxPx = curPts[0]!.x - prevPts[0]!.x;
        const dyPx = curPts[0]!.y - prevPts[0]!.y;
        setCamera((cam) => {
          const viewW = bounds.width / cam.scale;
          const viewH = bounds.height / cam.scale;
          const pxPerUnit = Math.min(rect.width / viewW, rect.height / viewH);
          return clampCamera({
            ...cam,
            cx: cam.cx - dxPx / pxPerUnit,
            cy: cam.cy - dyPx / pxPerUnit,
          });
        });
      } else if (curPts.length >= 2) {
        const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
          Math.hypot(a.x - b.x, a.y - b.y);
        const prevDist = Math.max(dist(prevPts[0]!, prevPts[1]!), 1);
        const curDist = Math.max(dist(curPts[0]!, curPts[1]!), 1);
        const midX = (curPts[0]!.x + curPts[1]!.x) / 2;
        const midY = (curPts[0]!.y + curPts[1]!.y) / 2;
        const prevMidX = (prevPts[0]!.x + prevPts[1]!.x) / 2;
        const prevMidY = (prevPts[0]!.y + prevPts[1]!.y) / 2;
        // Zoom about the (previous) midpoint, then pan by the midpoint drift.
        zoomAbout(prevMidX, prevMidY, curDist / prevDist);
        setCamera((cam) => {
          const viewW = bounds.width / cam.scale;
          const viewH = bounds.height / cam.scale;
          const pxPerUnit = Math.min(rect.width / viewW, rect.height / viewH);
          return clampCamera({
            ...cam,
            cx: cam.cx - (midX - prevMidX) / pxPerUnit,
            cy: cam.cy - (midY - prevMidY) / pxPerUnit,
          });
        });
      }
    }

    function onUp(e: PointerEvent) {
      pointers.current.delete(e.pointerId);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [bounds, clampCamera, zoomAbout]);

  // Wheel zoom needs preventDefault, and React's synthetic wheel handler is
  // passive — attach a native non-passive listener instead.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAbout(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [zoomAbout]);

  const reset = useCallback(() => setCamera(fitCamera(bounds)), [bounds]);
  const wasDrag = useCallback(() => dragging.current, []);

  const viewBox = useMemo(() => {
    const viewW = bounds.width / camera.scale;
    const viewH = bounds.height / camera.scale;
    return `${camera.cx - viewW / 2} ${camera.cy - viewH / 2} ${viewW} ${viewH}`;
  }, [bounds, camera]);

  return { svgRef, viewBox, onPointerDown, reset, wasDrag };
}
