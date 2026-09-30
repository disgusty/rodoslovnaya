/**
 * Generational layout for a family graph.
 *
 * 1. Visible people (collapsed nodes hide their descendants and spouses that only connect to them).
 * 2. Generations via BFS: spouse = same generation, child = +1.
 * 3. Spouses in the same generation are merged into "blocks" laid out side by side.
 * 4. Block order within each generation is refined with barycenter sweeps.
 * 5. Positions: alternate passes pull children under parents and parents over children;
 *    overlaps are resolved exactly with isotonic regression (pool-adjacent-violators).
 * Everything is computed in an abstract top→bottom frame and then mapped to the requested orientation.
 */
import type { Orientation, TreeData } from '../model/types';
import { descendantsOf } from '../model/relations';

export interface LayoutNode {
  id: string;
  x: number; // screen center
  y: number;
  gen: number;
  hiddenCount: number; // descendants hidden because this node is collapsed
  hasChildren: boolean;
}

export interface LayoutEdge {
  id: string; // "s:<familyId>" for spouses, "c:<familyId>:<childId>" for parent→child
  kind: 'spouse' | 'child';
  familyId: string;
  childId?: string;
  points: [number, number][];
  labelAt: [number, number]; // where a comment label is drawn
}

export interface Layout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
}

export interface LayoutOptions {
  cardW: number;
  cardH: number;
  orientation: Orientation;
  collapsed: Record<string, true>;
}

const SPOUSE_GAP = 28;
const BLOCK_GAP = 36;
const COMPONENT_GAP = 120;
const LAYER_GAP = 84;
const PAD = 60;

interface Block {
  members: string[];
  gen: number;
  width: number;
  x: number; // left edge (abstract)
  order: number;
}

export function computeLayout(tree: TreeData, opt: LayoutOptions): Layout {
  const vertical = opt.orientation === 'tb' || opt.orientation === 'bt';
  const B = vertical ? opt.cardW : opt.cardH; // node size along a generation row
  const D = vertical ? opt.cardH : opt.cardW; // node size across generations
  const layerDist = D + LAYER_GAP;

  // ---------- 1. visibility ----------
  const hidden = new Set<string>();
  const hiddenCount: Record<string, number> = {};
  for (const id of Object.keys(opt.collapsed)) {
    if (!tree.people[id]) continue;
    const d = descendantsOf(tree, id);
    hiddenCount[id] = d.size;
    d.forEach((x) => hidden.add(x));
  }
  const fams = Object.values(tree.families);
  const famsOf: Record<string, string[]> = {}; // as partner
  const famcOf: Record<string, string> = {}; // as child
  for (const f of fams) {
    for (const p of f.partners) (famsOf[p] ??= []).push(f.id);
    for (const c of f.children) famcOf[c] = f.id;
  }
  if (hidden.size) {
    // spouses that only connect to hidden people disappear too
    for (const id of Object.keys(tree.people)) {
      if (hidden.has(id)) continue;
      const fc = famcOf[id] ? tree.families[famcOf[id]] : undefined;
      if (fc && (fc.partners.some((p) => !hidden.has(p)) || fc.partners.length === 0)) continue;
      const partnerFams = (famsOf[id] ?? []).map((f) => tree.families[f]);
      if (!partnerFams.length) continue;
      const others = partnerFams.flatMap((f) => f.partners.filter((p) => p !== id));
      if (others.length && others.every((o) => hidden.has(o))) hidden.add(id);
    }
  }
  const visible = Object.keys(tree.people).filter((id) => !hidden.has(id));
  const isVis = (id: string) => !!tree.people[id] && !hidden.has(id);

  // adjacency (visible only)
  const spouseAdj: Record<string, string[]> = {};
  const childAdj: Record<string, string[]> = {};
  const parentAdj: Record<string, string[]> = {};
  for (const id of visible) {
    spouseAdj[id] = [];
    childAdj[id] = [];
    parentAdj[id] = [];
  }
  for (const f of fams) {
    const ps = f.partners.filter(isVis);
    const cs = f.children.filter(isVis);
    for (const a of ps) for (const b of ps) if (a !== b && !spouseAdj[a].includes(b)) spouseAdj[a].push(b);
    for (const p of ps)
      for (const c of cs) {
        childAdj[p].push(c);
        parentAdj[c].push(p);
      }
  }

  // ---------- 2. components & generations ----------
  const gen: Record<string, number> = {};
  const components: string[][] = [];
  const sibFam: Record<string, string[]> = {};
  for (const f of fams) {
    if (f.partners.some(isVis)) continue;
    const cs = f.children.filter(isVis);
    for (const c of cs) sibFam[c] = cs;
  }
  // BFS starts from people without known parents, so the oldest generation becomes 0
  const startOrder = [...visible].sort((a, b) => parentAdj[a].length - parentAdj[b].length);
  for (const start of startOrder) {
    if (gen[start] !== undefined) continue;
    gen[start] = 0;
    const comp = [start]; // doubles as the BFS queue
    const push = (n: string, ng: number) => {
      if (gen[n] === undefined) {
        gen[n] = ng;
        comp.push(n);
      }
    };
    for (let head = 0; head < comp.length; head++) {
      const cur = comp[head];
      const g = gen[cur];
      spouseAdj[cur].forEach((n) => push(n, g));
      (sibFam[cur] ?? []).forEach((n) => push(n, g));
      childAdj[cur].forEach((n) => push(n, g + 1));
      parentAdj[cur].forEach((n) => push(n, g - 1));
    }
    let min = Infinity;
    for (const id of comp) min = Math.min(min, gen[id]);
    for (const id of comp) gen[id] -= min;
    components.push(comp);
  }

  // ---------- 3..5 per component ----------
  const absPos: Record<string, { x: number; y: number }> = {};
  // largest component first
  components.sort((a, b) => b.length - a.length);
  const boxes = components.map((comp) => ({ comp, ...layoutComponent(comp) }));

  // Shelf packing: unrelated groups (and lone people) fill rows under the main tree
  // instead of stretching the canvas into one endless line.
  if (boxes.length > 1) {
    const area = boxes.reduce((a, b) => a + (b.width + COMPONENT_GAP) * (b.height + COMPONENT_GAP), 0);
    const rowWidth = Math.max(boxes[0].width, Math.sqrt(area * 1.6));
    let x = 0, y = 0, rowH = 0;
    for (const b of boxes) {
      if (x > 0 && x + b.width > rowWidth) {
        x = 0;
        y += rowH + COMPONENT_GAP;
        rowH = 0;
      }
      for (const id of b.comp) {
        if (!absPos[id]) continue;
        absPos[id].x += x;
        absPos[id].y += y;
      }
      x += b.width + COMPONENT_GAP;
      rowH = Math.max(rowH, b.height);
    }
  }

  function layoutComponent(comp: string[]): { width: number; height: number } {
    // --- blocks (spouses in the same generation) ---
    const blockOf: Record<string, Block> = {};
    const slot: Record<string, number> = {}; // position of a person inside their block
    const blocks: Block[] = [];
    const seen = new Set<string>();
    // stable seed order: DFS from roots so families stay together
    const seed: string[] = [];
    const dfsSeen = new Set<string>();
    const roots = comp.filter((id) => gen[id] === 0);
    const dfs = (id: string) => {
      if (dfsSeen.has(id)) return;
      dfsSeen.add(id);
      seed.push(id);
      spouseAdj[id].forEach(dfs);
      childAdj[id].forEach(dfs);
    };
    roots.forEach(dfs);
    comp.forEach(dfs);

    for (const id of seed) {
      if (seen.has(id)) continue;
      const group: string[] = [];
      const st = [id];
      seen.add(id);
      while (st.length) {
        const c = st.pop()!;
        group.push(c);
        for (const s of spouseAdj[c])
          if (!seen.has(s) && gen[s] === gen[c]) {
            seen.add(s);
            st.push(s);
          }
      }
      const members = orderBlock(group);
      const b: Block = { members, gen: gen[id], width: members.length * B + (members.length - 1) * SPOUSE_GAP, x: 0, order: 0 };
      blocks.push(b);
      members.forEach((m, i) => {
        blockOf[m] = b;
        slot[m] = i;
      });
    }

    let maxGen = 0;
    for (const b of blocks) maxGen = Math.max(maxGen, b.gen);
    const layers: Block[][] = Array.from({ length: maxGen + 1 }, () => []);
    blocks.forEach((b) => layers[b.gen].push(b)); // seed order preserved
    layers.forEach((l) => l.forEach((b, i) => (b.order = i)));

    const memberX = (b: Block, m: string) => b.x + slot[m] * (B + SPOUSE_GAP) + B / 2;
    const px = (id: string) => memberX(blockOf[id], id);

    // --- ordering: barycenter sweeps ---
    const bary = (b: Block, dir: 'up' | 'down'): number | null => {
      const vals: number[] = [];
      b.members.forEach((m, i) => {
        const nbrs = dir === 'up' ? parentAdj[m] : childAdj[m];
        for (const n of nbrs) {
          const nb = blockOf[n];
          if (nb && nb.gen !== b.gen) vals.push(nb.order + slot[n] / (nb.members.length + 1) - i * 0.01);
        }
      });
      return vals.length ? vals.reduce((a, c) => a + c, 0) / vals.length : null;
    };
    for (let it = 0; it < 6; it++) {
      const down = it % 2 === 0;
      const range = down ? layers.map((_, i) => i).slice(1) : layers.map((_, i) => i).slice(0, -1).reverse();
      for (const g of range) {
        const layer = layers[g];
        const keyed = layer.map((b) => ({ b, k: bary(b, down ? 'up' : 'down') ?? b.order }));
        keyed.sort((p, q) => p.k - q.k || p.b.order - q.b.order);
        layers[g] = keyed.map((k) => k.b);
        layers[g].forEach((b, i) => (b.order = i));
      }
    }

    // --- initial x: pack each layer ---
    for (const layer of layers) {
      let x = 0;
      for (const b of layer) {
        b.x = x;
        x += b.width + BLOCK_GAP;
      }
    }

    // --- family anchors ---
    const anchorX = (fid: string): number | null => {
      const ps = tree.families[fid].partners.filter((p) => blockOf[p]);
      if (!ps.length) return null;
      return ps.reduce((a, p) => a + px(p), 0) / ps.length;
    };

    // Isotonic regression: place blocks near desired centers keeping order and gaps.
    const place = (layer: Block[], desired: (number | null)[]) => {
      const n = layer.length;
      if (!n) return;
      const off: number[] = [];
      let acc = 0;
      for (let i = 0; i < n; i++) {
        off.push(acc);
        acc += layer[i].width + BLOCK_GAP;
      }
      // target left edges transformed so that constraint becomes monotone
      const target = layer.map((b, i) => (desired[i] ?? b.x + b.width / 2) - b.width / 2 - off[i]);
      const wts = layer.map((_, i) => (desired[i] == null ? 0.2 : 1));
      const vals: number[] = [], weights: number[] = [], counts: number[] = [];
      for (let i = 0; i < n; i++) {
        vals.push(target[i]);
        weights.push(wts[i]);
        counts.push(1);
        while (vals.length > 1 && vals[vals.length - 2] > vals[vals.length - 1]) {
          const w = weights[weights.length - 2] + weights[weights.length - 1];
          const v = (vals[vals.length - 2] * weights[weights.length - 2] + vals[vals.length - 1] * weights[weights.length - 1]) / w;
          const c = counts[counts.length - 2] + counts[counts.length - 1];
          vals.splice(-2, 2, v);
          weights.splice(-2, 2, w);
          counts.splice(-2, 2, c);
        }
      }
      let i = 0;
      vals.forEach((v, k) => {
        for (let j = 0; j < counts[k]; j++, i++) layer[i].x = v + off[i];
      });
    };

    const childrenCenter = (fid: string): number | null => {
      let lo = Infinity, hi = -Infinity;
      for (const c of tree.families[fid].children) {
        if (!blockOf[c]) continue;
        const x = px(c);
        lo = Math.min(lo, x);
        hi = Math.max(hi, x);
      }
      return lo === Infinity ? null : (lo + hi) / 2;
    };

    for (let it = 0; it < 12; it++) {
      // down: children blocks move under their parents
      for (let g = 1; g < layers.length; g++) {
        const desired = layers[g].map((b) => {
          const shifts: number[] = [];
          for (const m of b.members) {
            const fid = famcOf[m];
            if (!fid) continue;
            const ax = anchorX(fid);
            const cc = childrenCenter(fid);
            if (ax != null && cc != null) shifts.push(ax - cc);
          }
          return shifts.length ? b.x + b.width / 2 + shifts.reduce((a, c) => a + c, 0) / shifts.length : null;
        });
        place(layers[g], desired);
      }
      // up: parents move over their children
      for (let g = layers.length - 2; g >= 0; g--) {
        const desired = layers[g].map((b) => {
          const shifts: number[] = [];
          for (const m of b.members)
            for (const fid of famsOf[m] ?? []) {
              if (!tree.families[fid].partners.every((p) => !blockOf[p] || blockOf[p] === b)) continue;
              const ax = anchorX(fid);
              const cc = childrenCenter(fid);
              if (ax != null && cc != null) shifts.push(cc - ax);
            }
          return shifts.length ? b.x + b.width / 2 + shifts.reduce((a, c) => a + c, 0) / shifts.length : null;
        });
        place(layers[g], desired);
      }
    }

    let minX = Infinity, maxX = -Infinity;
    for (const b of blocks) {
      minX = Math.min(minX, b.x);
      maxX = Math.max(maxX, b.x + b.width);
    }
    for (const b of blocks) for (const m of b.members) absPos[m] = { x: memberX(b, m) - minX, y: b.gen * layerDist };
    return { width: maxX - minX, height: maxGen * layerDist + D };
  }

  function orderBlock(group: string[]): string[] {
    if (group.length === 1) return group;
    const male = (id: string) => tree.people[id].gender === 'm';
    if (group.length === 2) return male(group[1]) && !male(group[0]) ? [group[1], group[0]] : group;
    const deg = (id: string) => spouseAdj[id].filter((s) => group.includes(s)).length;
    const isPath = group.every((id) => deg(id) <= 2);
    if (isPath) {
      const start = group.find((id) => deg(id) === 1) ?? group[0];
      const out = [start];
      while (out.length < group.length) {
        const next = spouseAdj[out[out.length - 1]].find((s) => group.includes(s) && !out.includes(s));
        if (!next) break;
        out.push(next);
      }
      for (const g of group) if (!out.includes(g)) out.push(g);
      return out;
    }
    const center = [...group].sort((a, b) => deg(b) - deg(a))[0];
    const sp = spouseAdj[center].filter((s) => group.includes(s));
    const rest = group.filter((g) => g !== center && !sp.includes(g));
    return [sp[0], center, ...sp.slice(1), ...rest];
  }

  // ---------- edges in abstract frame ----------
  const edges: LayoutEdge[] = [];
  const top = (id: string) => absPos[id].y - D / 2;
  const bottom = (id: string) => absPos[id].y + D / 2;
  for (const f of fams) {
    const ps = f.partners.filter((p) => absPos[p]);
    const cs = f.children.filter((c) => absPos[c]);
    let anchor: [number, number] | null = null;
    if (ps.length === 2) {
      const [a, b] = [...ps].sort((p, q) => absPos[p].x - absPos[q].x);
      const pa = absPos[a], pb = absPos[b];
      if (pa.y === pb.y) {
        const adjacent = Math.abs(pb.x - pa.x) <= B + SPOUSE_GAP + 1;
        const pts: [number, number][] = adjacent
          ? [
              [pa.x + B / 2, pa.y],
              [pb.x - B / 2, pb.y],
            ]
          : [
              [pa.x, pa.y + D / 2],
              [pa.x, pa.y + D / 2 + 14],
              [pb.x, pb.y + D / 2 + 14],
              [pb.x, pb.y + D / 2],
            ];
        // label sits above the couple so it never covers the cards
        const labelAt: [number, number] = adjacent ? [(pa.x + pb.x) / 2, pa.y - D / 2 - 14] : [(pa.x + pb.x) / 2, pa.y + D / 2 + 14];
        edges.push({ id: `s:${f.id}`, kind: 'spouse', familyId: f.id, points: pts, labelAt });
        anchor = adjacent ? [(pa.x + pb.x) / 2, pa.y] : [(pa.x + pb.x) / 2, pa.y + D / 2 + 14];
      } else {
        edges.push({
          id: `s:${f.id}`,
          kind: 'spouse',
          familyId: f.id,
          points: [
            [pa.x, pa.y],
            [pb.x, pb.y],
          ],
          labelAt: [(pa.x + pb.x) / 2, (pa.y + pb.y) / 2],
        });
        anchor = [pa.x, bottom(a)];
      }
    } else if (ps.length === 1) {
      anchor = [absPos[ps[0]].x, bottom(ps[0])];
    }
    if (!cs.length) continue;
    if (anchor) {
      for (const c of cs) {
        const cp = absPos[c];
        const busY = top(c) - LAYER_GAP / 2;
        const pts: [number, number][] = [anchor, [anchor[0], busY], [cp.x, busY], [cp.x, top(c)]];
        const labelAt: [number, number] = [cp.x, (busY + top(c)) / 2];
        edges.push({ id: `c:${f.id}:${c}`, kind: 'child', familyId: f.id, childId: c, points: dedupe(pts), labelAt });
      }
    } else if (cs.length > 1) {
      // siblings without known parents: a bracket above them
      const xs = cs.map((c) => absPos[c].x);
      const mid = (xs.reduce((a, x) => Math.min(a, x)) + xs.reduce((a, x) => Math.max(a, x))) / 2;
      for (const c of cs) {
        const cp = absPos[c];
        const busY = top(c) - LAYER_GAP / 3;
        edges.push({
          id: `c:${f.id}:${c}`,
          kind: 'child',
          familyId: f.id,
          childId: c,
          points: dedupe([
            [mid, busY],
            [cp.x, busY],
            [cp.x, top(c)],
          ]),
          labelAt: [cp.x, (busY + top(c)) / 2],
        });
      }
    }
  }

  // ---------- orientation transform ----------
  // generations grow down / left / up / right; order within a generation stays readable
  const tf = (x: number, y: number): [number, number] => {
    switch (opt.orientation) {
      case 'tb':
        return [x, y];
      case 'rl':
        return [-y, x];
      case 'bt':
        return [x, -y];
      case 'lr':
        return [y, x];
    }
  };
  const nodes: LayoutNode[] = visible
    .filter((id) => absPos[id])
    .map((id) => {
      const [x, y] = tf(absPos[id].x, absPos[id].y);
      return { id, x, y, gen: gen[id], hiddenCount: hiddenCount[id] ?? 0, hasChildren: (famsOf[id] ?? []).some((f) => tree.families[f].children.length > 0) };
    });
  const tEdges = edges.map((e) => ({ ...e, points: e.points.map(([x, y]) => tf(x, y)), labelAt: tf(...e.labelAt) }));

  // normalize to positive coordinates
  const hw = opt.cardW / 2, hh = opt.cardH / 2;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x - hw);
    maxX = Math.max(maxX, n.x + hw);
    minY = Math.min(minY, n.y - hh);
    maxY = Math.max(maxY, n.y + hh);
  }
  if (!nodes.length) return { nodes: [], edges: [], width: 0, height: 0 };
  const dx = PAD - minX, dy = PAD - minY;
  nodes.forEach((n) => {
    n.x += dx;
    n.y += dy;
  });
  tEdges.forEach((e) => {
    e.points = e.points.map(([x, y]) => [x + dx, y + dy] as [number, number]);
    e.labelAt = [e.labelAt[0] + dx, e.labelAt[1] + dy];
  });
  return { nodes, edges: tEdges, width: maxX - minX + PAD * 2, height: maxY - minY + PAD * 2 };
}

function dedupe(pts: [number, number][]): [number, number][] {
  return pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
}
