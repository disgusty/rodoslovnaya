import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_SCALE, MIN_SCALE, type View } from './shared';

const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

/** Zoom by factor `f` keeping the screen point (mx, my) fixed. */
function zoomAt(v: View, f: number, mx: number, my: number): View {
  const s = clampScale(v.s * f);
  return { s, x: mx - ((mx - v.x) * s) / v.s, y: my - ((my - v.y) * s) / v.s };
}

/**
 * Pan (drag), wheel zoom, animated fit/zoom/center for the tree viewport.
 * `onClick(worldX, worldY)` fires for a press without drag on empty canvas.
 */
export function useViewport(content: { width: number; height: number }, onClick: (wx: number, wy: number) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ s: 1, x: 0, y: 0 });
  const [animate, setAnimate] = useState(false);
  const [panning, setPanning] = useState(false);
  const [size, setSize] = useState({ w: 1200, h: 800 });
  const viewRef = useRef(view);
  viewRef.current = view;

  const animateTo = useCallback((v: View) => {
    setAnimate(true);
    setView(v);
    setTimeout(() => setAnimate(false), 380);
  }, []);

  const fit = useCallback(
    (anim = true) => {
      const vp = ref.current;
      if (!vp || !content.width) return;
      const { clientWidth: w, clientHeight: h } = vp;
      const s = Math.min(1.1, Math.max(MIN_SCALE, Math.min(w / content.width, h / content.height)));
      const v = { s, x: (w - content.width * s) / 2, y: (h - content.height * s) / 2 };
      if (anim) animateTo(v);
      else setView(v);
    },
    [content.width, content.height, animateTo],
  );

  const centerOn = useCallback(
    (x: number, y: number) => {
      const vp = ref.current;
      if (!vp) return;
      const s = Math.max(viewRef.current.s, 0.8);
      animateTo({ s, x: vp.clientWidth / 2 - x * s, y: vp.clientHeight / 2 - y * s });
    },
    [animateTo],
  );

  const zoomBy = (f: number) => {
    const vp = ref.current!;
    animateTo(zoomAt(viewRef.current, f, vp.clientWidth / 2, vp.clientHeight / 2));
  };

  // wheel zoom around the cursor (non-passive listener to prevent page scroll)
  useEffect(() => {
    const vp = ref.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = vp.getBoundingClientRect();
      setView((v) => zoomAt(v, Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top));
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    const ro = new ResizeObserver(() => setSize({ w: vp.clientWidth, h: vp.clientHeight }));
    ro.observe(vp);
    return () => {
      vp.removeEventListener('wheel', onWheel);
      ro.disconnect();
    };
  }, []);

  // one pointer drags, two pointers (touch) pinch-zoom around their midpoint
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const pinch = useRef<{ dist: number; mx: number; my: number; view: View } | null>(null);

  const local = (x: number, y: number) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: x - r.left, y: y - r.top };
  };
  const startPinch = () => {
    const [a, b] = [...pointers.current.values()];
    const m = local((a.x + b.x) / 2, (a.y + b.y) / 2);
    pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: m.x, my: m.y, view: viewRef.current };
  };
  const startDrag = (x: number, y: number, moved: boolean) => {
    drag.current = { x, y, vx: viewRef.current.x, vy: viewRef.current.y, moved };
  };

  const handlers = {
    onPointerDown(e: React.PointerEvent) {
      if (e.button !== 0 && e.button !== 1) return;
      // a second finger may land anywhere, the first one only on empty canvas
      if (!pointers.current.size && (e.target as HTMLElement).closest('.pnode, .corner, .legend, .edge-hit, .edge-label, button')) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      if (pointers.current.size === 2) {
        drag.current = null;
        startPinch();
        setPanning(true);
      } else if (pointers.current.size === 1) startDrag(e.clientX, e.clientY, false);
    },
    onPointerMove(e: React.PointerEvent) {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const p = pinch.current;
      if (p && pointers.current.size >= 2) {
        const [a, b] = [...pointers.current.values()];
        const m = local((a.x + b.x) / 2, (a.y + b.y) / 2);
        const s = clampScale((p.view.s * Math.hypot(a.x - b.x, a.y - b.y)) / p.dist);
        // the world point under the initial midpoint follows the fingers
        const wx = (p.mx - p.view.x) / p.view.s, wy = (p.my - p.view.y) / p.view.s;
        setView({ s, x: m.x - wx * s, y: m.y - wy * s });
        return;
      }
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < 6) return;
      if (!d.moved) setPanning(true);
      d.moved = true;
      setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
    },
    onPointerUp(e: React.PointerEvent) {
      if (!pointers.current.delete(e.pointerId)) return;
      if (pinch.current) {
        // one finger left after a pinch: continue as a drag without a jump, never as a click
        if (pointers.current.size === 1) {
          const [rest] = [...pointers.current.values()];
          startDrag(rest.x, rest.y, true);
        }
        if (pointers.current.size < 2) pinch.current = null;
        if (!pointers.current.size) setPanning(false);
        return;
      }
      const d = drag.current;
      drag.current = null;
      setPanning(false);
      if (!d || d.moved) return;
      const r = ref.current!.getBoundingClientRect();
      onClick((e.clientX - r.left - view.x) / view.s, (e.clientY - r.top - view.y) / view.s);
    },
  };

  return { ref, view, size, animate, panning, handlers, fit, centerOn, zoomBy };
}
