import { create } from 'zustand';
import type { Branch, Family, FamilyType, Gender, LinkStyle, Person, Settings, TreeData } from './types';
import { familiesAsPartner, familyAsChild } from './relations';
import { loadStore, saveStore } from '../io/platform';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const FAMILY_TYPES: FamilyType[] = ['married', 'partners', 'divorced'];

export type RelKind = 'parent' | 'spouse' | 'child' | 'sibling';

export function emptyTree(name = ''): TreeData {
  return { version: 1, name, people: {}, families: {}, branches: [], links: {} };
}

export function newPerson(patch: Partial<Person> = {}): Person {
  return {
    id: uid(),
    lastName: '',
    firstName: '',
    middleName: '',
    maidenName: '',
    gender: 'u',
    living: true,
    birth: { date: '', place: '' },
    death: { date: '', place: '' },
    burial: '',
    occupation: '',
    education: '',
    residence: '',
    bio: '',
    notes: '',
    photo: null,
    gallery: [],
    documents: [],
    events: [],
    cardColor: null,
    ...patch,
  };
}

function newFamily(patch: Partial<Family> = {}): Family {
  return { id: uid(), partners: [], children: [], type: 'married', date: '', place: '', ...patch };
}

/** Fills in missing fields of loaded/imported data (older files, hand-edited JSON). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeTree(raw: any): TreeData {
  const t = emptyTree(raw?.name ?? '');
  for (const [id, p] of Object.entries<Partial<Person>>(raw?.people ?? {})) {
    const base = newPerson();
    t.people[id] = {
      ...base,
      ...p,
      id,
      birth: { ...base.birth, ...p.birth },
      death: { ...base.death, ...p.death },
      gallery: p.gallery ?? [],
      documents: p.documents ?? [],
      events: p.events ?? [],
    };
  }
  for (const [id, f] of Object.entries<Partial<Family>>(raw?.families ?? {})) {
    t.families[id] = {
      ...newFamily(),
      ...f,
      id,
      partners: (f.partners ?? []).filter((x) => t.people[x]),
      children: (f.children ?? []).filter((x) => t.people[x]),
    };
  }
  t.branches = ((raw?.branches ?? []) as Branch[]).filter((b) => t.people[b.rootId]);
  t.links = raw?.links ?? {};
  return t;
}

/**
 * Copy-on-write access to a tree: `people()` / `families()` copy the collection only
 * on first write, so untouched parts keep their identity (memoized layouts and the
 * relation index stay valid).
 */
function draft(t: TreeData) {
  const d = { ...t };
  return {
    d,
    people: () => (d.people === t.people ? (d.people = { ...t.people }) : d.people),
    families: () => (d.families === t.families ? (d.families = { ...t.families }) : d.families),
  };
}

const opposite = (g: Gender): Gender => (g === 'm' ? 'f' : g === 'f' ? 'm' : 'u');

// ---------------- settings ----------------
const SETTINGS_KEY = 'familytree.settings';
const defaultSettings: Settings = {
  theme: 'system',
  design: 'md3',
  accent: '#6750A4',
  lang: 'ru',
  corner: 'tl',
  orientation: 'tb',
  showLinkComments: true,
};

function loadSettings(): Settings {
  try {
    const s = localStorage.getItem(SETTINGS_KEY);
    return s ? { ...defaultSettings, ...JSON.parse(s) } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

// ---------------- state ----------------
interface State {
  tree: TreeData;
  loaded: boolean;
  epoch: number; // bumped when a whole tree is replaced (open/import/new)
  past: TreeData[];
  future: TreeData[];
  settings: Settings;

  selectedId: string | null;
  editing: boolean;
  newlyCreated: string | null; // removed again if its first edit is cancelled
  collapsed: Record<string, true>;
  fullscreen: boolean;
  exportAll: boolean; // temporarily render every card (no virtualization) for image export
  drawerOpen: boolean;
  settingsOpen: boolean;
  search: string;
  editingLink: string | null;
  editingBranch: Branch | null;
  snack: { id: number; text: string } | null;
  focusRequest: { id: string; n: number } | null;

  // tree mutations (undoable)
  commit(fn: (t: TreeData) => TreeData): void;
  undo(): void;
  redo(): void;
  replaceTree(t: TreeData): void;
  addPerson(patch?: Partial<Person>): string;
  updatePerson(id: string, patch: Partial<Person>): void;
  deletePerson(id: string): void;
  addRelative(id: string, kind: RelKind, familyId?: string, existingId?: string): string | null;
  updateFamily(id: string, patch: Partial<Family>): void;
  removeRelation(personId: string, otherId: string): void;
  saveBranch(b: Branch): void;
  deleteBranch(id: string): void;
  setLink(edgeId: string, style: LinkStyle | null): void;
  renameTree(name: string): void; // not undoable: typed character by character

  // ui
  setSettings(patch: Partial<Settings>): void;
  select(id: string | null, editing?: boolean): void;
  setEditing(v: boolean): void;
  toggleCollapsed(id: string): void;
  expandAll(): void;
  set(patch: Partial<State>): void;
  toast(text: string): void;
  focusPerson(id: string): void;
}

const HISTORY = 50;

export const useStore = create<State>((set, get) => ({
  tree: emptyTree(),
  loaded: false,
  epoch: 0,
  past: [],
  future: [],
  settings: loadSettings(),

  selectedId: null,
  editing: false,
  newlyCreated: null,
  collapsed: {},
  fullscreen: false,
  exportAll: false,
  drawerOpen: false,
  settingsOpen: false,
  search: '',
  editingLink: null,
  editingBranch: null,
  snack: null,
  focusRequest: null,

  commit(fn) {
    const prev = get().tree;
    const next = fn(prev);
    if (next !== prev) set({ tree: next, past: [...get().past.slice(1 - HISTORY), prev], future: [] });
  },
  undo() {
    const { past, tree, future } = get();
    if (!past.length) return;
    set({ tree: past[past.length - 1], past: past.slice(0, -1), future: [tree, ...future] });
  },
  redo() {
    const { past, tree, future } = get();
    if (!future.length) return;
    set({ tree: future[0], future: future.slice(1), past: [...past, tree] });
  },
  replaceTree(t) {
    get().commit(() => t);
    set({ selectedId: null, collapsed: {}, editing: false, epoch: get().epoch + 1 });
  },

  addPerson(patch) {
    const p = newPerson(patch);
    get().commit((t) => {
      const w = draft(t);
      w.people()[p.id] = p;
      return w.d;
    });
    set({ newlyCreated: p.id });
    return p.id;
  },
  updatePerson(id, patch) {
    get().commit((t) => {
      if (!t.people[id]) return t;
      const w = draft(t);
      w.people()[id] = { ...t.people[id], ...patch };
      return w.d;
    });
  },
  deletePerson(id) {
    get().commit((t) => {
      const w = draft(t);
      delete w.people()[id];
      for (const f of Object.values(t.families)) {
        if (!f.partners.includes(id) && !f.children.includes(id)) continue;
        const nf = { ...f, partners: f.partners.filter((x) => x !== id), children: f.children.filter((x) => x !== id) };
        // drop families that no longer connect anyone
        if (nf.partners.length + nf.children.length <= 1) delete w.families()[f.id];
        else w.families()[f.id] = nf;
      }
      w.d.branches = t.branches.filter((b) => b.rootId !== id);
      return w.d;
    });
    if (get().selectedId === id) set({ selectedId: null, editing: false });
  },

  addRelative(id, kind, familyId, existingId) {
    const me = get().tree.people[id];
    if (!me) return null;
    let created: Person | null = null;
    if (!existingId) {
      const gender: Gender = kind === 'spouse' ? opposite(me.gender) : 'u';
      created = newPerson({ gender, lastName: kind === 'child' || kind === 'sibling' ? me.lastName : '' });
    }
    const rid = existingId ?? created!.id;
    get().commit((t) => {
      const w = draft(t);
      if (created) w.people()[created.id] = created;
      const fams = w.families();
      const put = (f: Family) => (fams[f.id] = f);
      if (kind === 'parent') {
        const fam = familyAsChild(t, id);
        if (fam && fam.partners.length < 2) {
          // the second parent gets the opposite gender
          if (created && fam.partners.length === 1) w.people()[created.id] = { ...created, gender: opposite(t.people[fam.partners[0]].gender) };
          put({ ...fam, partners: [...fam.partners, rid] });
        } else {
          if (fam) put({ ...fam, children: fam.children.filter((c) => c !== id) });
          put(newFamily({ partners: [rid], children: [id] }));
        }
      } else if (kind === 'spouse') {
        // reuse a single-parent family so existing children become shared
        const single = familiesAsPartner(t, id).find((f) => f.partners.length === 1);
        put(single ? { ...single, partners: [id, rid] } : newFamily({ partners: [id, rid] }));
      } else if (kind === 'child') {
        const own = familiesAsPartner(t, id);
        const fam = (familyId && t.families[familyId]) || own[own.length - 1];
        // a linked existing person leaves their previous parents
        const prev = familyAsChild(t, rid);
        if (prev) put({ ...prev, children: prev.children.filter((c) => c !== rid) });
        if (fam) put({ ...fams[fam.id], children: [...fams[fam.id].children, rid] });
        else put(newFamily({ partners: [id], children: [rid] }));
      } else {
        const fam = familyAsChild(t, id);
        const prev = familyAsChild(t, rid);
        if (prev && prev.id !== fam?.id) put({ ...prev, children: prev.children.filter((c) => c !== rid) });
        if (fam) put({ ...fams[fam.id], children: [...fams[fam.id].children.filter((c) => c !== rid), rid] });
        else put(newFamily({ partners: [], children: [id, rid] }));
      }
      return w.d;
    });
    if (created) set({ newlyCreated: rid });
    return rid;
  },
  updateFamily(id, patch) {
    get().commit((t) => {
      if (!t.families[id]) return t;
      const w = draft(t);
      w.families()[id] = { ...t.families[id], ...patch };
      return w.d;
    });
  },
  removeRelation(a, b) {
    get().commit((t) => {
      const w = draft(t);
      for (const f of Object.values(t.families)) {
        const aP = f.partners.includes(a), bP = f.partners.includes(b);
        const aC = f.children.includes(a), bC = f.children.includes(b);
        let nf = f;
        if (aP && bP) nf = { ...f, partners: f.partners.filter((x) => x !== b) }; // spouses
        else if (aP && bC) nf = { ...f, children: f.children.filter((x) => x !== b) }; // b is a child of a
        else if (bP && aC) nf = { ...f, children: f.children.filter((x) => x !== a) }; // a is a child of b
        else if (aC && bC) nf = { ...f, children: f.children.filter((x) => x !== b) }; // siblings
        if (nf === f) continue;
        if (nf.partners.length + nf.children.length <= 1) delete w.families()[f.id];
        else w.families()[f.id] = nf;
      }
      return w.d;
    });
  },

  saveBranch(b) {
    get().commit((t) => ({
      ...t,
      branches: t.branches.some((x) => x.id === b.id) ? t.branches.map((x) => (x.id === b.id ? b : x)) : [...t.branches, b],
    }));
  },
  deleteBranch(id) {
    get().commit((t) => ({ ...t, branches: t.branches.filter((b) => b.id !== id) }));
  },
  setLink(edgeId, style) {
    get().commit((t) => {
      const links = { ...t.links };
      if (style) links[edgeId] = style;
      else delete links[edgeId];
      return { ...t, links };
    });
  },
  renameTree(name) {
    set({ tree: { ...get().tree, name } });
  },

  setSettings(patch) {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* storage unavailable — settings live for this session only */
    }
  },
  select(id, editing = false) {
    set({ selectedId: id, editing });
  },
  setEditing(v) {
    set({ editing: v });
  },
  toggleCollapsed(id) {
    const c = { ...get().collapsed };
    if (c[id]) delete c[id];
    else c[id] = true;
    set({ collapsed: c });
  },
  expandAll() {
    set({ collapsed: {} });
  },
  set(patch) {
    set(patch);
  },
  toast(text) {
    set({ snack: { id: Date.now(), text } });
  },
  focusPerson(id) {
    set({ focusRequest: { id, n: (get().focusRequest?.n ?? 0) + 1 }, selectedId: id });
  },
}));

// ---------------- persistence ----------------
let saveTimer: ReturnType<typeof setTimeout> | undefined;

export async function initPersistence() {
  try {
    const text = await loadStore();
    if (text) useStore.setState({ tree: normalizeTree(JSON.parse(text)) });
  } catch (e) {
    console.error('Failed to load tree', e);
  }
  useStore.setState({ loaded: true });
  useStore.subscribe((s, prev) => {
    if (s.tree === prev.tree) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveStore(JSON.stringify(useStore.getState().tree)), 400);
  });
}
