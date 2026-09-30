import type { TreeData } from './types';
import { ancestorsOf, descendantsOf } from './relations';

export interface EdgeStyle {
  color: string;
  comment: string;
  labels: string[]; // branch names contributing
  custom: boolean; // set individually on this link
}

export interface Highlights {
  nodeColors: Record<string, string[]>;
  edges: Record<string, EdgeStyle>;
}

/** Resolves branch & per-link colors. Individual link styles win over branch colors. */
export function computeHighlights(tree: TreeData): Highlights {
  const nodeColors: Record<string, string[]> = {};
  const edges: Record<string, EdgeStyle> = {};
  for (const b of tree.branches) {
    if (!b.visible || !tree.people[b.rootId]) continue;
    const set = b.direction === 'descendants' ? descendantsOf(tree, b.rootId) : ancestorsOf(tree, b.rootId);
    set.add(b.rootId);
    set.forEach((id) => (nodeColors[id] ??= []).push(b.color));
    for (const f of Object.values(tree.families)) {
      if (!f.partners.some((p) => set.has(p))) continue;
      for (const c of f.children) {
        if (!set.has(c)) continue;
        const id = `c:${f.id}:${c}`;
        const prev = edges[id];
        edges[id] = {
          color: b.color,
          comment: [prev?.comment, b.comment].filter(Boolean).join('\n'),
          labels: [...(prev?.labels ?? []), b.name],
          custom: false,
        };
      }
    }
  }
  for (const [id, s] of Object.entries(tree.links)) {
    edges[id] = { color: s.color, comment: s.comment, labels: edges[id]?.labels ?? [], custom: true };
  }
  return { nodeColors, edges };
}
