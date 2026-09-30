import type { Family, Person, TreeData } from './types';

// ---------------- relation index ----------------
// Families are updated immutably, so an index built for one `families` object stays valid
// for as long as that object lives. Lookups become O(1) instead of scanning every family.

interface RelIndex {
  asPartner: Map<string, Family[]>;
  asChild: Map<string, Family>;
}

const indexCache = new WeakMap<TreeData['families'], RelIndex>();

function relIndex(tree: TreeData): RelIndex {
  let ix = indexCache.get(tree.families);
  if (!ix) {
    ix = { asPartner: new Map(), asChild: new Map() };
    for (const f of Object.values(tree.families)) {
      for (const p of f.partners) {
        const list = ix.asPartner.get(p);
        if (list) list.push(f);
        else ix.asPartner.set(p, [f]);
      }
      for (const c of f.children) ix.asChild.set(c, f);
    }
    indexCache.set(tree.families, ix);
  }
  return ix;
}

export const familiesAsPartner = (tree: TreeData, id: string): Family[] => relIndex(tree).asPartner.get(id) ?? [];
export const familyAsChild = (tree: TreeData, id: string): Family | undefined => relIndex(tree).asChild.get(id);
export const parentsOf = (tree: TreeData, id: string): string[] => familyAsChild(tree, id)?.partners ?? [];

export function spousesOf(tree: TreeData, id: string): string[] {
  const out = new Set<string>();
  for (const f of familiesAsPartner(tree, id)) for (const p of f.partners) if (p !== id) out.add(p);
  return [...out];
}

export function childrenOf(tree: TreeData, id: string): string[] {
  const out = new Set<string>();
  for (const f of familiesAsPartner(tree, id)) for (const c of f.children) out.add(c);
  return [...out];
}

/** Full and half siblings. */
export function siblingsOf(tree: TreeData, id: string): string[] {
  const fam = familyAsChild(tree, id);
  if (!fam) return [];
  const out = new Set(fam.children);
  for (const p of fam.partners) for (const f of familiesAsPartner(tree, p)) for (const c of f.children) out.add(c);
  out.delete(id);
  return [...out];
}

function collect(start: string, next: (id: string) => string[]): Set<string> {
  const out = new Set<string>();
  const stack = [start];
  while (stack.length) {
    for (const n of next(stack.pop()!)) {
      if (!out.has(n)) {
        out.add(n);
        stack.push(n);
      }
    }
  }
  return out;
}

export const descendantsOf = (tree: TreeData, id: string) => collect(id, (x) => childrenOf(tree, x));
export const ancestorsOf = (tree: TreeData, id: string) => collect(id, (x) => parentsOf(tree, x));

// ---------------- names & dates ----------------

export function fullName(p: Person | undefined, fallback = '—'): string {
  if (!p) return fallback;
  return [p.lastName, p.firstName, p.middleName].filter(Boolean).join(' ') || fallback;
}

export function shortName(p: Person): { first: string; last: string } {
  return {
    first: [p.firstName, p.middleName].filter(Boolean).join(' '),
    last: p.lastName + (p.maidenName && p.maidenName !== p.lastName ? ` (${p.maidenName})` : ''),
  };
}

/** Extracts a 4-digit year from a free-form date string. */
export function yearOf(date: string): number | null {
  const m = date.match(/(\d{4})/);
  return m ? Number(m[1]) : null;
}

/** "1901 – 1980" for the deceased, birth date for the living, "" when nothing is known. */
export function lifeSpan(p: Person): string {
  const b = p.birth.date.trim();
  const d = p.death.date.trim();
  if (p.living) return b;
  if (!b && !d) return '';
  return `${b || '?'} – ${d || '?'}`;
}

export function ageOf(p: Person): number | null {
  const b = yearOf(p.birth.date);
  if (b == null) return null;
  const end = p.living ? new Date().getFullYear() : yearOf(p.death.date);
  return end == null ? null : end - b;
}
