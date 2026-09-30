export const CARD_W = 200;
export const CARD_H = 88;
export const MIN_SCALE = 0.02;
export const MAX_SCALE = 2.5;
/** Below this zoom cards are unreadable anyway — the tree is drawn on a canvas instead of DOM. */
export const LOD_SCALE = 0.3;

export interface View {
  s: number; // scale
  x: number; // translation, screen px
  y: number;
}

/** The DOM element of the rendered tree and its natural size — read by the image exporter. */
export const treeCanvas: { world: HTMLDivElement | null; width: number; height: number } = { world: null, width: 0, height: 0 };
