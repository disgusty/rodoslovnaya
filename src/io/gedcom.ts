/**
 * GEDCOM 5.5.1 reader/writer. GEDCOM is also the app's own file format: everything standard
 * GEDCOM has no place for (colors, branches, link comments, photos, attachments, stable ids)
 * is written to user-defined _FT_ tags, which other genealogy programs skip.
 */
import type { Attachment, Branch, Family, FamilyType, Person, TreeData } from '../model/types';
import { emptyTree, newPerson, uid, FAMILY_TYPES } from '../model/store';
import { familiesAsPartner, familyAsChild, yearOf } from '../model/relations';

interface GNode {
  tag: string;
  xref?: string;
  value: string;
  children: GNode[];
}

/** Detects the GEDCOM charset (UTF-8 / UTF-16 / ANSEL / Windows-1251 / Windows-1252) and decodes. */
export function decodeGedcom(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  const head = new TextDecoder('latin1').decode(bytes.slice(0, 4000));
  const charset = head.match(/1\s+CHAR\s+(\S+)/i)?.[1]?.toUpperCase() ?? '';
  if (/UTF-?8/.test(charset)) return new TextDecoder('utf-8').decode(bytes);
  if (charset === 'UNICODE') return new TextDecoder(bytes[0] === 0 ? 'utf-16be' : 'utf-16le').decode(bytes);
  if (charset === 'ANSEL') return decodeAnsel(bytes);
  if (/1251|CYRILLIC/.test(charset)) return new TextDecoder('windows-1251').decode(bytes);
  if (/1252|8859|LATIN/.test(charset)) return new TextDecoder('windows-1252').decode(bytes);
  // "ANSI" or no declaration: valid UTF-8 first, otherwise guess the Windows code page
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder(guessAnsiCodepage(bytes)).decode(bytes);
  }
}

/**
 * Russian text in cp1251 forms runs of high bytes (whole words), while accented letters
 * in Western cp1252 text sit between ASCII letters ("Österreich").
 */
function guessAnsiCodepage(bytes: Uint8Array): 'windows-1251' | 'windows-1252' {
  const asciiLetter = (x: number) => (x >= 65 && x <= 90) || (x >= 97 && x <= 122);
  let cyr = 0, lat = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] < 0xc0) continue;
    if (asciiLetter(bytes[i - 1]) || asciiLetter(bytes[i + 1])) lat++;
    else cyr++;
  }
  return cyr > lat ? 'windows-1251' : 'windows-1252';
}

// ANSEL (ANSI Z39.47): specials and combining diacritics that precede their base letter
const ANSEL_SPECIAL: Record<number, string> = {
  0xa1: 'Ł', 0xa2: 'Ø', 0xa3: 'Đ', 0xa4: 'Þ', 0xa5: 'Æ', 0xa6: 'Œ', 0xa7: 'ʹ', 0xa8: '·', 0xa9: '♭', 0xaa: '®',
  0xab: '±', 0xac: 'Ơ', 0xad: 'Ư', 0xae: 'ʼ', 0xb0: 'ʻ', 0xb1: 'ł', 0xb2: 'ø', 0xb3: 'đ', 0xb4: 'þ', 0xb5: 'æ',
  0xb6: 'œ', 0xb7: 'ʺ', 0xb8: 'ı', 0xb9: '£', 0xba: 'ð', 0xbc: 'ơ', 0xbd: 'ư', 0xc0: '°', 0xc1: 'ℓ', 0xc2: '℗',
  0xc3: '©', 0xc4: '♯', 0xc5: '¿', 0xc6: '¡', 0xc7: 'ß', 0xc8: '€',
};
const ANSEL_COMBINING: Record<number, string> = {
  0xe0: '̉', 0xe1: '̀', 0xe2: '́', 0xe3: '̂', 0xe4: '̃', 0xe5: '̄', 0xe6: '̆',
  0xe7: '̇', 0xe8: '̈', 0xe9: '̌', 0xea: '̊', 0xeb: '︠', 0xec: '︡', 0xed: '̕',
  0xee: '̋', 0xef: '̐', 0xf0: '̧', 0xf1: '̨', 0xf2: '̣', 0xf3: '̤', 0xf4: '̥',
  0xf5: '̳', 0xf6: '̲', 0xf7: '̦', 0xf8: '̜', 0xf9: '̮', 0xfa: '︢', 0xfb: '︣',
  0xfe: '̓',
};

function decodeAnsel(bytes: Uint8Array): string {
  let out = '';
  let marks = '';
  for (const b of bytes) {
    if (ANSEL_COMBINING[b]) {
      marks += ANSEL_COMBINING[b];
      continue;
    }
    out += (b < 0x80 ? String.fromCharCode(b) : ANSEL_SPECIAL[b] ?? '�') + marks;
    marks = '';
  }
  return out.normalize('NFC');
}

function parseLines(text: string): GNode[] {
  const roots: GNode[] = [];
  const stack: GNode[] = [];
  for (const raw of text.replace(/^﻿/, '').split(/\r\n|\r|\n/)) {
    // only leading whitespace is dropped: trailing spaces of CONC values belong to the text
    const line = raw.replace(/^\s+/, '');
    if (!line) continue;
    const m = line.match(/^(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?:\s(.*))?$/);
    if (!m) continue;
    const level = Number(m[1]);
    const node: GNode = { tag: m[3].toUpperCase(), xref: m[2], value: m[4] ?? '', children: [] };
    stack.length = level;
    if (level === 0) roots.push(node);
    else stack[level - 1]?.children.push(node);
    stack[level] = node;
  }
  return roots;
}

const child = (n: GNode | undefined, tag: string) => n?.children.find((c) => c.tag === tag);
const all = (n: GNode, tag: string) => n.children.filter((c) => c.tag === tag);
const val = (n: GNode | undefined, tag: string) => child(n, tag)?.value.trim() ?? '';

/** Joins a value with its CONT / CONC continuation lines (`exact`: keep edge whitespace, for our own tags). */
function fullText(n: GNode | undefined, exact = false): string {
  if (!n) return '';
  let s = n.value;
  for (const c of n.children) {
    if (c.tag === 'CONC') s += c.value;
    else if (c.tag === 'CONT') s += '\n' + c.value;
  }
  return exact ? s : s.trim();
}

const MONTHS: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
};
const QUAL_RU: Record<string, string> = { ABT: 'около', BEF: 'до', AFT: 'после', EST: 'около', CAL: 'около' };

/** "12 MAR 1921" → "12.03.1921"; "ABT 1850" → "около 1850". */
function fromGedDate(s: string): string {
  if (!s) return '';
  let q = '';
  let rest = s.trim();
  const qm = rest.match(/^(ABT|BEF|AFT|EST|CAL)\s+(.*)$/i);
  if (qm) {
    q = QUAL_RU[qm[1].toUpperCase()] + ' ';
    rest = qm[2];
  }
  const m = rest.match(/^(?:(\d{1,2})\s+)?([A-Z]{3})\s+(\d{3,4})$/i);
  if (m && MONTHS[m[2].toUpperCase()]) {
    const mm = MONTHS[m[2].toUpperCase()];
    return q + (m[1] ? `${m[1].padStart(2, '0')}.${mm}.${m[3]}` : `${mm}.${m[3]}`);
  }
  return q + rest;
}

function toGedDate(s: string): string {
  s = s.trim();
  if (!s) return '';
  const q = s.match(/^(около|до|после|about|before|after|abt|bef|aft)\s+(.*)$/i);
  let prefix = '';
  if (q) {
    const w = q[1].toLowerCase();
    prefix = w === 'до' || w === 'before' || w === 'bef' ? 'BEF ' : w === 'после' || w === 'after' || w === 'aft' ? 'AFT ' : 'ABT ';
    s = q[2];
  }
  const inv = Object.fromEntries(Object.entries(MONTHS).map(([k, v]) => [v, k]));
  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return `${prefix}${Number(m[1])} ${inv[m[2].padStart(2, '0')]} ${m[3]}`;
  m = s.match(/^(\d{1,2})\.(\d{4})$/);
  if (m) return `${prefix}${inv[m[1].padStart(2, '0')]} ${m[2]}`;
  return prefix + s;
}

export function parseGedcom(input: string | Uint8Array): TreeData {
  const text = typeof input === 'string' ? input : decodeGedcom(input);
  const roots = parseLines(text);
  const tree = emptyTree();
  const idMap: Record<string, string> = {};
  const notes: Record<string, string> = {};
  for (const r of roots) if (r.tag === 'NOTE' && r.xref) notes[r.xref] = fullText(r);
  const noteText = (n: GNode) => (n.value.startsWith('@') && notes[n.value] ? notes[n.value] : fullText(n));
  const thisYear = new Date().getFullYear();

  // the app's own data (_FT_ tags) written by toGedcom
  const head = roots.find((r) => r.tag === 'HEAD');
  const ftJson = <T,>(tag: string, fallback: T): T => {
    try {
      const s = fullText(child(head, tag));
      return s ? JSON.parse(s) : fallback;
    } catch {
      return fallback;
    }
  };
  const ftId = (n: GNode) => {
    const id = val(n, '_FT_ID');
    return /^[A-Za-z0-9]{4,40}$/.test(id) ? id : uid();
  };
  const attachment = (n: GNode): Attachment => {
    const dataUrl = fullText(child(n, '_FT_DATA'));
    return {
      id: uid(),
      name: val(n, '_FT_NAME'),
      mime: val(n, '_FT_MIME') || dataUrl.slice(5, dataUrl.indexOf(';')),
      dataUrl,
      caption: fullText(child(n, '_FT_CAPTION'), true),
    };
  };
  tree.name = fullText(child(head, '_FT_NAME'), true);
  tree.branches = ftJson<Branch[]>('_FT_BRANCHES', []);
  tree.links = ftJson<TreeData['links']>('_FT_LINKS', {});

  for (const r of roots) {
    if (r.tag !== 'INDI' || !r.xref) continue;
    const nameNode = child(r, 'NAME');
    const nm = nameNode?.value ?? '';
    const surname = val(nameNode, 'SURN') || nm.match(/\/([^/]*)\//)?.[1]?.trim() || '';
    const given = (val(nameNode, 'GIVN') || nm.replace(/\/[^/]*\//, '').trim()).split(/\s+/).filter(Boolean);
    const birt = child(r, 'BIRT');
    const deat = child(r, 'DEAT');
    const buri = child(r, 'BURI');
    const sex = val(r, 'SEX').toUpperCase();
    const p: Person = newPerson({
      lastName: surname,
      firstName: given[0] ?? '',
      middleName: given.slice(1).join(' '),
      maidenName: '',
      gender: sex === 'M' ? 'm' : sex === 'F' ? 'f' : 'u',
      birth: { date: fromGedDate(val(birt, 'DATE')), place: val(birt, 'PLAC') },
      death: { date: fromGedDate(val(deat, 'DATE')), place: val(deat, 'PLAC') },
      burial: val(buri, 'PLAC'),
      occupation: all(r, 'OCCU').map((o) => o.value).filter(Boolean).join(', '),
      education: all(r, 'EDUC').map((o) => o.value).filter(Boolean).join(', '),
      residence: all(r, 'RESI')
        .map((o) => o.value || val(o, 'PLAC') || val(child(o, 'ADDR'), 'CITY') || child(o, 'ADDR')?.value || '')
        .filter(Boolean)
        .join('; '),
      notes: all(r, 'NOTE').map(noteText).filter(Boolean).join('\n\n'),
    });
    const marnm = val(r, '_MARNM') || val(nameNode, '_MARNM');
    if (marnm && p.gender === 'f') {
      p.maidenName = p.lastName;
      p.lastName = marnm;
    }
    const by = yearOf(p.birth.date);
    const living = val(r, '_FT_LIVING');
    p.living = living ? living === 'Y' : !deat && !buri && !(by != null && thisYear - by > 110);
    p.id = ftId(r);
    p.cardColor = val(r, '_FT_COLOR') || null;
    // bio and notes are kept apart in _FT_ tags; NOTE holds both for other programs
    if (child(r, '_FT_BIO') || child(r, '_FT_NOTES')) {
      p.bio = fullText(child(r, '_FT_BIO'), true);
      p.notes = fullText(child(r, '_FT_NOTES'), true);
    }
    p.photo = fullText(child(r, '_FT_PHOTO')) || null;
    p.gallery = all(r, '_FT_IMG').map(attachment);
    p.documents = all(r, '_FT_DOC').map(attachment);
    // other events
    for (const c of r.children) {
      if (['EVEN', 'RESI', 'EMIG', 'IMMI', 'GRAD', 'RETI', 'MILI', '_MILT', 'BAPM', 'CHR', 'CENS', 'NATU'].includes(c.tag)) {
        const date = fromGedDate(val(c, 'DATE'));
        const place = val(c, 'PLAC');
        if (c.tag === 'RESI' && !date) continue;
        p.events.push({
          id: uid(),
          title: val(c, 'TYPE') || c.value || c.tag,
          date,
          place,
          description: all(c, 'NOTE').map(noteText).join('\n'),
        });
      }
    }
    tree.people[p.id] = p;
    idMap[r.xref] = p.id;
  }

  for (const r of roots) {
    if (r.tag !== 'FAM') continue;
    const partners = [val(r, 'HUSB'), val(r, 'WIFE')].map((x) => idMap[x]).filter(Boolean);
    const children = all(r, 'CHIL').map((c) => idMap[c.value.trim()]).filter(Boolean);
    if (partners.length + children.length < 2 && !(partners.length === 1 && children.length === 0)) continue;
    const marr = child(r, 'MARR');
    const ftType = val(r, '_FT_TYPE') as FamilyType;
    const f: Family = {
      id: ftId(r),
      partners,
      children,
      // without our tag: a couple with no MARR record is still treated as married
      type: FAMILY_TYPES.includes(ftType) ? ftType : child(r, 'DIV') ? 'divorced' : marr || partners.length === 2 ? 'married' : 'partners',
      date: fromGedDate(val(marr, 'DATE')),
      place: val(marr, 'PLAC'),
    };
    tree.families[f.id] = f;
  }
  // a child may appear in only one family as child in our model
  const seen = new Set<string>();
  for (const f of Object.values(tree.families)) {
    f.children = f.children.filter((c) => (seen.has(c) ? false : (seen.add(c), true)));
  }
  tree.branches = tree.branches.filter((b) => tree.people[b.rootId]);
  return tree;
}

// ---------------- export ----------------

/**
 * A text value as GEDCOM lines: newlines become CONT, long lines are cut into CONC pieces.
 * Pieces never start or end with a space — many readers trim those.
 */
function textLines(level: number, tag: string, text: string): string[] {
  const out: string[] = [];
  text.split('\n').forEach((part, i) => {
    let rest = part;
    let first = true;
    do {
      let n = Math.min(200, rest.length);
      while (n > 1 && n < rest.length && (rest[n - 1] === ' ' || rest[n] === ' ')) n--;
      const chunk = rest.slice(0, n);
      rest = rest.slice(n);
      const t = i === 0 && first ? `${level} ${tag}` : `${level + 1} ${first ? 'CONT' : 'CONC'}`;
      out.push(chunk ? `${t} ${chunk}` : t);
      first = false;
    } while (rest);
  });
  return out;
}

export function toGedcom(tree: TreeData): string {
  const L: string[] = [];
  const push = (...lines: string[]) => {
    for (const l of lines) L.push(l);
  };
  const ix: Record<string, string> = {};
  const fx: Record<string, string> = {};
  Object.keys(tree.people).forEach((id, i) => (ix[id] = `@I${i + 1}@`));
  Object.keys(tree.families).forEach((id, i) => (fx[id] = `@F${i + 1}@`));
  const d = new Date();
  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  push('0 HEAD', '1 SOUR RODOSLOVNAYA', '2 NAME Rodoslovnaya', '2 VERS 1.0', `1 DATE ${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`);
  push('1 GEDC', '2 VERS 5.5.1', '2 FORM LINEAGE-LINKED', '1 CHAR UTF-8');
  if (tree.name) push(...textLines(1, '_FT_NAME', tree.name));
  if (tree.branches.length) push(...textLines(1, '_FT_BRANCHES', JSON.stringify(tree.branches)));
  if (Object.keys(tree.links).length) push(...textLines(1, '_FT_LINKS', JSON.stringify(tree.links)));

  const ev = (tag: string, date: string, place: string, force = false) => {
    if (!date && !place && !force) return;
    push(date || place ? `1 ${tag}` : `1 ${tag} Y`);
    if (date) push(`2 DATE ${toGedDate(date)}`);
    if (place) push(`2 PLAC ${place}`);
  };
  const attachment = (tag: string, a: Attachment) => {
    push(`1 ${tag}`);
    if (a.name) push(`2 _FT_NAME ${a.name}`);
    if (a.mime) push(`2 _FT_MIME ${a.mime}`);
    if (a.caption) push(...textLines(2, '_FT_CAPTION', a.caption));
    push(...textLines(2, '_FT_DATA', a.dataUrl));
  };

  for (const p of Object.values(tree.people)) {
    push(`0 ${ix[p.id]} INDI`);
    const given = [p.firstName, p.middleName].filter(Boolean).join(' ');
    const surname = p.maidenName && p.gender === 'f' ? p.maidenName : p.lastName;
    push(`1 NAME ${given} /${surname}/`.replace(/\s+/g, ' '));
    if (given) push(`2 GIVN ${given}`);
    if (surname) push(`2 SURN ${surname}`);
    if (p.maidenName && p.gender === 'f' && p.lastName !== p.maidenName) push(`2 _MARNM ${p.lastName}`);
    push(`1 SEX ${p.gender === 'm' ? 'M' : p.gender === 'f' ? 'F' : 'U'}`);
    ev('BIRT', p.birth.date, p.birth.place);
    if (!p.living) ev('DEAT', p.death.date, p.death.place, true);
    if (p.burial) push('1 BURI', `2 PLAC ${p.burial}`);
    if (p.occupation) push(...textLines(1, 'OCCU', p.occupation));
    if (p.education) push(...textLines(1, 'EDUC', p.education));
    if (p.residence) push(...textLines(1, 'RESI', p.residence));
    for (const e of p.events) {
      push(`1 EVEN`, `2 TYPE ${e.title || 'Event'}`);
      if (e.date) push(`2 DATE ${toGedDate(e.date)}`);
      if (e.place) push(`2 PLAC ${e.place}`);
      if (e.description) push(...textLines(2, 'NOTE', e.description));
    }
    const note = [p.bio, p.notes].filter(Boolean).join('\n\n');
    if (note) push(...textLines(1, 'NOTE', note));
    const famc = familyAsChild(tree, p.id);
    if (famc) push(`1 FAMC ${fx[famc.id]}`);
    for (const f of familiesAsPartner(tree, p.id)) push(`1 FAMS ${fx[f.id]}`);
    // the app's own data
    push(`1 _FT_ID ${p.id}`, `1 _FT_LIVING ${p.living ? 'Y' : 'N'}`);
    if (p.cardColor) push(`1 _FT_COLOR ${p.cardColor}`);
    if (p.bio) push(...textLines(1, '_FT_BIO', p.bio));
    if (p.notes) push(...textLines(1, '_FT_NOTES', p.notes));
    if (p.photo) push(...textLines(1, '_FT_PHOTO', p.photo));
    for (const g of p.gallery) attachment('_FT_IMG', g);
    for (const doc of p.documents) attachment('_FT_DOC', doc);
  }

  for (const f of Object.values(tree.families)) {
    push(`0 ${fx[f.id]} FAM`);
    const ps = [...f.partners];
    let husb = ps.find((x) => tree.people[x]?.gender === 'm');
    let wife = ps.find((x) => x !== husb && tree.people[x]?.gender === 'f');
    const rest = ps.filter((x) => x !== husb && x !== wife);
    if (!husb && rest.length) husb = rest.shift();
    if (!wife && rest.length) wife = rest.shift();
    if (husb) push(`1 HUSB ${ix[husb]}`);
    if (wife) push(`1 WIFE ${ix[wife]}`);
    if (f.type !== 'partners' || f.date || f.place) {
      push('1 MARR');
      if (f.date) push(`2 DATE ${toGedDate(f.date)}`);
      if (f.place) push(`2 PLAC ${f.place}`);
    }
    if (f.type === 'divorced') push('1 DIV Y');
    for (const c of f.children) push(`1 CHIL ${ix[c]}`);
    push(`1 _FT_ID ${f.id}`, `1 _FT_TYPE ${f.type}`);
  }
  push('0 TRLR');
  return L.join('\r\n') + '\r\n';
}