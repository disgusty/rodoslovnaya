import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useStore } from '../model/store';
import { computeHighlights } from '../model/highlights';
import type { Corner, Orientation } from '../model/types';
import { setFullscreen } from '../io/platform';
import { useT } from '../ui/i18n';
import { useIsDark } from '../ui/useIsDark';
import { Fab, IconButton } from '../ui/components';
import { computeLayout } from './layout';
import { CARD_H, CARD_W, LOD_SCALE, treeCanvas } from './shared';
import { useViewport } from './useViewport';
import { PersonNode } from './PersonNode';
import { Edges } from './Edges';
import { LodCanvas } from './LodCanvas';
import { EmptyState, Legend } from './Overlays';

const ORDER: Orientation[] = ['tb', 'rl', 'bt', 'lr'];
const mirrorH: Record<Corner, Corner> = { tl: 'tr', tr: 'tl', bl: 'br', br: 'bl' };
const mirrorV: Record<Corner, Corner> = { tl: 'bl', bl: 'tl', tr: 'br', br: 'tr' };

export function TreeView() {
  const t = useT();
  const tree = useStore((s) => s.tree);
  const collapsed = useStore((s) => s.collapsed);
  const settings = useStore((s) => s.settings);
  const selectedId = useStore((s) => s.selectedId);
  const search = useStore((s) => s.search);
  const fullscreen = useStore((s) => s.fullscreen);
  const focusRequest = useStore((s) => s.focusRequest);
  const loaded = useStore((s) => s.loaded);
  const epoch = useStore((s) => s.epoch);
  const exportAll = useStore((s) => s.exportAll);
  const dark = useIsDark();
  const { orientation, corner } = settings;

  // Layout depends only on structure: families, who exists and their gender (couple order).
  // Editing names, dates or photos keeps the memoized layout.
  const peopleShape = useMemo(() => {
    let key = '';
    for (const p of Object.values(tree.people)) key += p.id + p.gender;
    return key;
  }, [tree.people]);
  const layout = useMemo(
    () => computeLayout(tree, { cardW: CARD_W, cardH: CARD_H, orientation, collapsed }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tree.families, peopleShape, orientation, collapsed],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const hl = useMemo(() => computeHighlights(tree), [tree.families, tree.branches, tree.links, peopleShape]);

  const q = search.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return null;
    const set = new Set<string>();
    for (const p of Object.values(tree.people))
      if ([p.lastName, p.firstName, p.middleName, p.maidenName].join(' ').toLowerCase().includes(q)) set.add(p.id);
    return set;
  }, [q, tree.people]);

  // ---------- viewport ----------
  const vp = useViewport(layout, (wx, wy) => {
    // In canvas mode cards are not DOM elements: hit-test the click manually.
    const hit = lod ? layout.nodes.find((n) => Math.abs(n.x - wx) <= CARD_W / 2 && Math.abs(n.y - wy) <= CARD_H / 2) : undefined;
    useStore.getState().select(hit?.id ?? null);
  });
  const { view } = vp;
  const lod = view.s < LOD_SCALE && !exportAll;

  // fit on first data, on another tree and on rotation
  const fittedFor = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!loaded || !layout.nodes.length) return;
    const key = `${orientation}:${epoch}`;
    if (fittedFor.current === key) return;
    vp.fit(fittedFor.current !== null);
    fittedFor.current = key;
  }, [loaded, orientation, epoch, layout.nodes.length, vp]);

  // refit after entering/leaving full screen (the viewport size changes)
  useEffect(() => {
    const id = setTimeout(() => vp.fit(), 200);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreen]);

  // center on a person requested by search or by the family links in the panel
  useEffect(() => {
    const n = focusRequest && layout.nodes.find((x) => x.id === focusRequest.id);
    if (n) vp.centerOn(n.x, n.y);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

  // ---------- virtualization ----------
  // Only what lies in (a generous margin around) the viewport is rendered. The window is snapped
  // to a grid so small pans keep the same arrays and memoized children skip re-rendering.
  const edgeBoxes = useMemo(
    () =>
      layout.edges.map((e) => {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const [x, y] of e.points) {
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
        }
        return { e, x0, y0, x1, y1 };
      }),
    [layout.edges],
  );
  const cell = 400 / view.s;
  const snap = (v: number) => Math.floor(v / cell) * cell;
  const wx0 = snap(-view.x / view.s) - cell;
  const wy0 = snap(-view.y / view.s) - cell;
  const wx1 = snap((vp.size.w - view.x) / view.s) + 2 * cell;
  const wy1 = snap((vp.size.h - view.y) / view.s) + 2 * cell;
  const renderAll = exportAll;
  const visibleNodes = useMemo(
    () =>
      lod ? [] : renderAll ? layout.nodes : layout.nodes.filter((n) => n.x + CARD_W / 2 > wx0 && n.x - CARD_W / 2 < wx1 && n.y + CARD_H / 2 > wy0 && n.y - CARD_H / 2 < wy1),
    [layout.nodes, lod, renderAll, wx0, wy0, wx1, wy1],
  );
  const visibleEdges = useMemo(
    () => (lod ? [] : renderAll ? layout.edges : edgeBoxes.filter((b) => b.x1 > wx0 && b.x0 < wx1 && b.y1 > wy0 && b.y0 < wy1).map((b) => b.e)),
    [layout.edges, edgeBoxes, lod, renderAll, wx0, wy0, wx1, wy1],
  );

  // exporter reads the rendered world element and its natural size
  treeCanvas.width = layout.width;
  treeCanvas.height = layout.height;

  // ---------- corner actions ----------
  const st = useStore.getState;
  const toggleExpand = () => {
    const on = !st().fullscreen;
    if (on) st().expandAll();
    st().set({ fullscreen: on });
    setFullscreen(on);
  };
  const rotate = () => st().setSettings({ orientation: ORDER[(ORDER.indexOf(orientation) + 1) % 4] });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && st().fullscreen) toggleExpand();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={vp.ref} className={`viewport ${vp.panning ? 'panning' : ''}`} {...vp.handlers} onPointerCancel={vp.handlers.onPointerUp}>
      {lod && (
        <LodCanvas
          layout={layout}
          view={view}
          size={vp.size}
          edgeStyles={hl.edges}
          people={tree.people}
          selectedId={selectedId}
          matches={matches}
          theme={`${settings.design}:${settings.accent}:${dark}`}
        />
      )}
      <div
        ref={(el) => {
          treeCanvas.world = el;
        }}
        className={`world ${vp.animate ? 'animate' : ''}`}
        style={{ width: layout.width, height: layout.height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}
      >
        {!lod && (
          <Edges edges={visibleEdges} width={layout.width} height={layout.height} styles={hl.edges} families={tree.families} showLabels={settings.showLinkComments} />
        )}
        {visibleNodes.map((n) => (
          <PersonNode
            key={n.id}
            person={tree.people[n.id]}
            x={n.x}
            y={n.y}
            selected={n.id === selectedId}
            match={matches?.has(n.id) ?? false}
            dim={matches != null && !matches.has(n.id)}
            branchColors={hl.nodeColors[n.id]}
            hasChildren={n.hasChildren}
            hiddenCount={n.hiddenCount}
            collapsed={!!collapsed[n.id]}
            orientation={orientation}
            dark={dark}
          />
        ))}
      </div>

      {!layout.nodes.length && loaded && <EmptyState />}

      <div className={`corner ${corner}`}>
        <Fab icon={fullscreen ? 'close_fullscreen' : 'open_in_full'} title={fullscreen ? t('collapseView') : t('expandTree')} onClick={toggleExpand} />
        <Fab icon="rotate_right" secondary title={`${t('rotate')} · ${t(orientation)}`} onClick={rotate} />
      </div>

      <div className={`corner col ${mirrorH[corner]}`}>
        <div className="zoom-pill">
          <IconButton icon="add" small title={t('zoomIn')} onClick={() => vp.zoomBy(1.25)} />
          <div className="pct">{Math.round(view.s * 100)}%</div>
          <IconButton icon="remove" small title={t('zoomOut')} onClick={() => vp.zoomBy(0.8)} />
          <IconButton icon="fit_screen" small title={t('fitView')} onClick={() => vp.fit()} />
        </div>
      </div>

      {layout.nodes.length > 0 && <Legend corner={mirrorV[corner]} branches={tree.branches.filter((b) => b.visible)} />}
    </div>
  );
}
