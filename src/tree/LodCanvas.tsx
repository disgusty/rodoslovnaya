import { useEffect, useMemo, useRef } from 'react';
import type { EdgeStyle } from '../model/highlights';
import type { Person } from '../model/types';
import { cardTint } from '../ui/theme';
import type { Layout } from './layout';
import { CARD_H, CARD_W, type View } from './shared';

interface Props {
  layout: Layout;
  view: View;
  size: { w: number; h: number };
  edgeStyles: Record<string, EdgeStyle>;
  people: Record<string, Person>;
  selectedId: string | null;
  matches: Set<string> | null;
  theme: string; // changes whenever the palette changes
}

function readColors() {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  const dark = root.dataset.theme === 'dark';
  return {
    line: root.dataset.md === '95' ? (dark ? '#c0c0c0' : '#000000') : v('--md-outline'),
    card: v('--md-surface-container-lowest'),
    border: v('--md-outline-variant'),
    text: v('--md-on-surface'),
    primary: v('--md-primary'),
    match: v('--md-tertiary'),
    m: v('--gender-m'),
    f: v('--gender-f'),
    u: v('--gender-u'),
    dark,
  };
}

/** Zoomed-out renderer: the whole tree on one canvas (cheap for tens of thousands of cards). */
export function LodCanvas({ layout, view, size, edgeStyles, people, selectedId, matches, theme }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const colors = useMemo(readColors, [theme]);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(size.w * dpr);
    c.height = Math.round(size.h * dpr);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr * view.s, 0, 0, dpr * view.s, dpr * view.x, dpr * view.y);
    const px = 1 / view.s; // one screen pixel in world units
    const x0 = -view.x / view.s - CARD_W, y0 = -view.y / view.s - CARD_H;
    const x1 = x0 + size.w / view.s + 2 * CARD_W, y1 = y0 + size.h / view.s + 2 * CARD_H;

    // lines: plain first, colored on top
    ctx.lineJoin = 'round';
    for (const colored of [false, true]) {
      for (const e of layout.edges) {
        const st = edgeStyles[e.id];
        if (!!st !== colored) continue;
        const p = e.points;
        if (p.every(([x, y]) => x < x0 || x > x1 || y < y0 || y > y1)) continue;
        ctx.strokeStyle = st?.color ?? colors.line;
        ctx.lineWidth = Math.max(colored ? 3.5 : 2, (colored ? 2 : 1) * px);
        ctx.beginPath();
        ctx.moveTo(p[0][0], p[0][1]);
        for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
        ctx.stroke();
      }
    }

    const showText = view.s >= 0.12;
    const boldFont = '600 22px Roboto, sans-serif', font = '20px Roboto, sans-serif';
    ctx.textBaseline = 'middle';
    for (const n of layout.nodes) {
      if (n.x < x0 || n.x > x1 || n.y < y0 || n.y > y1) continue;
      const p = people[n.id];
      const l = n.x - CARD_W / 2, t = n.y - CARD_H / 2;
      ctx.globalAlpha = matches && !matches.has(n.id) ? 0.3 : 1;
      ctx.fillStyle = p.cardColor ? cardTint(p.cardColor, colors.dark).bg : colors.card;
      ctx.fillRect(l, t, CARD_W, CARD_H);
      ctx.fillStyle = colors[p.gender];
      ctx.fillRect(l, t, 8, CARD_H);
      if (!p.living) {
        // mourning ribbon corner
        ctx.fillStyle = colors.dark ? '#e0e0e0' : '#212121';
        ctx.beginPath();
        ctx.moveTo(l + CARD_W - 30, t);
        ctx.lineTo(l + CARD_W, t);
        ctx.lineTo(l + CARD_W, t + 30);
        ctx.fill();
      }
      const sel = n.id === selectedId, match = matches?.has(n.id);
      ctx.strokeStyle = sel ? colors.primary : match ? colors.match : colors.border;
      ctx.lineWidth = sel || match ? Math.max(4, 3 * px) : Math.max(1, px);
      ctx.strokeRect(l, t, CARD_W, CARD_H);
      if (showText) {
        const name = p.lastName || p.firstName;
        ctx.fillStyle = colors.text;
        ctx.font = boldFont;
        ctx.fillText(name.length > 14 ? name.slice(0, 13) + '…' : name, l + 20, n.y - 14, CARD_W - 36);
        if (p.firstName && p.lastName) {
          ctx.font = font;
          ctx.fillText(p.firstName, l + 20, n.y + 16, CARD_W - 36);
        }
      }
    }
    ctx.globalAlpha = 1;
  }, [layout, view, size, edgeStyles, people, selectedId, matches, colors]);

  return <canvas ref={ref} className="lod-canvas" />;
}
