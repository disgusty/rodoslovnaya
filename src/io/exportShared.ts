import { useStore } from '../model/store';
import type { Person, TreeData } from '../model/types';
import { ageOf, childrenOf, familiesAsPartner, familyAsChild, fullName, siblingsOf } from '../model/relations';
import { translate, type TKey } from '../ui/i18n';
import { saveBinaryFile } from './platform';

/** Translation outside React components. */
export const tr = (key: TKey) => translate(useStore.getState().settings.lang, key);
export const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const safeFileName = (s: string) => s.replace(/[\\/:*?"<>|]/g, '_').trim() || 'export';

export function canvasToBlob(c: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('canvas.toBlob failed'))), type, quality));
}

/** Save dialog + "saved" / "failed" snackbar. */
export async function saveExport(name: string, filter: { name: string; ext: string }, make: () => Promise<Blob>) {
  const { toast } = useStore.getState();
  try {
    if (await saveBinaryFile(name, [{ name: filter.name, extensions: [filter.ext] }], await make())) toast(tr('saved'));
  } catch (e) {
    console.error(e);
    toast(`${tr('exportError')}: ${(e as Error).message}`);
  }
}

// ---------- card content shared by the PNG and ODT exports ----------

export function infoRows(p: Person): [string, string][] {
  const age = ageOf(p);
  const rows: [string, string][] = [
    [tr('livingStatus'), p.living ? tr('living') : tr('deceased')],
    [tr('birth'), [p.birth.date, p.birth.place].filter(Boolean).join(', ')],
  ];
  if (!p.living) rows.push([tr('death'), [p.death.date, p.death.place].filter(Boolean).join(', ')], [tr('burial'), p.burial]);
  rows.push([tr('age'), age != null ? `${age}` : ''], [tr('occupation'), p.occupation], [tr('education'), p.education], [tr('residence'), p.residence]);
  return rows.filter((r) => r[1]);
}

export function relativeRows(p: Person, tree: TreeData): [string, string][] {
  const names = (ids: string[]) => ids.map((i) => fullName(tree.people[i])).join(', ');
  const spouses = familiesAsPartner(tree, p.id)
    .filter((f) => f.partners.length === 2)
    .map((f) => {
      const other = tree.people[f.partners.find((x) => x !== p.id)!];
      const marriage = f.date ? ` (${tr('marriage').toLowerCase()} ${f.date})` : '';
      return fullName(other) + marriage + (f.type === 'divorced' ? ` — ${tr('divorced').toLowerCase()}` : '');
    })
    .join('; ');
  const rows: [string, string][] = [
    [tr('parents'), names(familyAsChild(tree, p.id)?.partners ?? [])],
    [tr('spouses'), spouses],
    [tr('children'), names(childrenOf(tree, p.id))],
    [tr('siblings'), names(siblingsOf(tree, p.id))],
  ];
  return rows.filter((r) => r[1]);
}

export const sortedEvents = (p: Person) => [...p.events].sort((a, b) => a.date.localeCompare(b.date));
