import { memo, useMemo } from 'react';
import { useStore } from '../model/store';
import type { EdgeStyle } from '../model/highlights';
import type { Family } from '../model/types';
import { hideTip, showTip } from '../ui/components';
import type { LayoutEdge } from './layout';

/** SVG path for an orthogonal polyline with rounded corners. */
function pathD(pts: [number, number][]): string {
  if (pts.length < 2) return '';
  const r = 10;
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    const l1 = Math.hypot(x1 - x0, y1 - y0) || 1, l2 = Math.hypot(x2 - x1, y2 - y1) || 1;
    const rr = Math.min(r, l1 / 2, l2 / 2);
    d += ` L${x1 - ((x1 - x0) / l1) * rr},${y1 - ((y1 - y0) / l1) * rr}`;
    d += ` Q${x1},${y1} ${x1 + ((x2 - x1) / l2) * rr},${y1 + ((y2 - y1) / l2) * rr}`;
  }
  const last = pts[pts.length - 1];
  return d + ` L${last[0]},${last[1]}`;
}

const openLink = (id: string) => useStore.getState().set({ editingLink: id });

interface Props {
  edges: LayoutEdge[];
  width: number;
  height: number;
  styles: Record<string, EdgeStyle>;
  families: Record<string, Family>;
  showLabels: boolean;
}

/** Connection lines (clickable) and comment labels of individually colored links. */
export const Edges = memo(function Edges({ edges, width, height, styles, families, showLabels }: Props) {
  // colored lines are drawn last so they stay on top
  const sorted = useMemo(() => [...edges].sort((a, b) => Number(!!styles[a.id]) - Number(!!styles[b.id])), [edges, styles]);
  const hover = (e: React.MouseEvent, s?: EdgeStyle) => {
    const text = s ? [s.labels.join(', '), s.comment].filter(Boolean).join('\n') : '';
    if (text) showTip(text, e.clientX, e.clientY);
  };
  return (
    <>
      <svg width={width} height={height}>
        {sorted.map((e) => {
          const s = styles[e.id];
          const d = pathD(e.points);
          const divorced = e.kind === 'spouse' && families[e.familyId]?.type === 'divorced';
          return (
            <g key={e.id}>
              {/* the invisible wide path is the click target; the next sibling gets the hover style */}
              <path className="edge-hit" d={d} onClick={() => openLink(e.id)} onMouseMove={(ev) => hover(ev, s)} onMouseLeave={hideTip} />
              <path className={`edge ${e.kind} ${s ? 'colored' : ''} ${divorced ? 'divorced' : ''}`} d={d} style={s ? { stroke: s.color } : undefined} />
            </g>
          );
        })}
      </svg>
      {showLabels &&
        sorted.map((e) => {
          const s = styles[e.id];
          if (!s?.custom || !s.comment) return null;
          return (
            <div
              key={'l' + e.id}
              className="edge-label"
              style={{ left: e.labelAt[0], top: e.labelAt[1], background: s.color }}
              onClick={() => openLink(e.id)}
              onMouseMove={(ev) => showTip(s.comment, ev.clientX, ev.clientY)}
              onMouseLeave={hideTip}
            >
              {s.comment.split('\n')[0]}
            </div>
          );
        })}
    </>
  );
});
