/** File menu commands. Heavy modules (GEDCOM, image export, demo) load on first use. */
import { useStore, emptyTree, normalizeTree } from '../model/store';
import type { TreeData } from '../model/types';
import { confirmDialog } from '../ui/components';
import { openBinaryFile, pickFile, saveTextFile, type OpenedFile } from './platform';
import { safeFileName, tr } from './exportShared';

const st = useStore.getState;
const withoutExt = (name: string) => name.replace(/\.[^.]+$/, '');
const baseName = () => safeFileName(st().tree.name || tr('untitled'));

/** Asks before throwing away a non-empty tree. */
async function confirmReplace(): Promise<boolean> {
  return Object.keys(st().tree.people).length === 0 || confirmDialog(tr('replaceTreeQ'));
}

export const showFileError = (e: unknown) => {
  console.error(e);
  st().toast(`${tr('importError')}: ${(e as Error)?.message ?? e}`);
};

export async function newTree() {
  if (await confirmReplace()) st().replaceTree(emptyTree());
}

// ---------------- open ----------------
// The tree is saved as GEDCOM (.ged). Older project files (.ftree / .json) still open;
// the format is recognised by the content, not by the extension.

const OPEN_FILTERS = () => [{ name: tr('projectFile'), extensions: ['ged', 'ftree', 'json'] }];

const isProjectJson = (bytes: Uint8Array) => {
  for (const b of bytes.subarray(0, 64)) {
    if (b === 0xef || b === 0xbb || b === 0xbf || b <= 0x20) continue; // BOM / whitespace
    return b === 0x7b; // "{"
  }
  return false;
};

/** Replaces the current tree with the file's content (after confirmation). */
async function openBytes(name: string, bytes: Uint8Array) {
  if (!(await confirmReplace())) return;
  try {
    let tree: TreeData;
    if (isProjectJson(bytes)) tree = normalizeTree(JSON.parse(new TextDecoder().decode(bytes)));
    else tree = (await import('./gedcom')).parseGedcom(bytes);
    tree.name ||= withoutExt(name);
    st().replaceTree(tree);
    st().toast(tr('imported').replace('{n}', String(Object.keys(tree.people).length)));
  } catch (e) {
    showFileError(e);
  }
}

export async function openProject() {
  let f: { name: string; bytes: Uint8Array } | null;
  try {
    f = await openBinaryFile(OPEN_FILTERS());
  } catch (e) {
    showFileError(e); // the file could not be read: say so, never stay silent
    return;
  }
  if (f) await openBytes(f.name, f.bytes);
}

/** A file handed over by the system (double-click, "Open with", "Share", restored chooser result). */
export function openExternalFile(file: OpenedFile) {
  return openBytes(file.name, typeof file.data === 'string' ? new TextEncoder().encode(file.data) : file.data);
}

/** Photo / attachment chooser for the person card: null on cancel, errors shown as a toast. */
export async function chooseFile(accept: string): Promise<File | null> {
  try {
    return await pickFile(undefined, accept);
  } catch (e) {
    showFileError(e);
    return null;
  }
}

// ---------------- save ----------------

/** Saves the tree as GEDCOM; the app's extras (colors, comments, photos…) go into _FT_ tags. */
export async function saveProject() {
  const { toGedcom } = await import('./gedcom');
  if (await saveTextFile(baseName() + '.ged', [{ name: 'GEDCOM', extensions: ['ged'] }], toGedcom(st().tree))) st().toast(tr('saved'));
}

export async function exportImage(kind: 'png' | 'pdf') {
  const { exportTreeImage } = await import('./exportTree');
  await exportTreeImage(kind, baseName());
}

export async function loadDemo() {
  if (await confirmReplace()) (await import('../model/demo')).loadDemo();
}
