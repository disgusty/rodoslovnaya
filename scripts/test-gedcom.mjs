// Runs every file in test-data/ through the app's GEDCOM parser, layout and exporter.
// Usage: node scripts/test-gedcom.mjs [file-filter]
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

globalThis.window = { matchMedia: () => ({ matches: false, addEventListener() {} }) };
globalThis.localStorage = { getItem: () => null, setItem() {} };

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { parseGedcom, toGedcom } = await server.ssrLoadModule('/src/io/gedcom.ts');
const { computeLayout } = await server.ssrLoadModule('/src/tree/layout.ts');

const dir = path.resolve('test-data');
const filter = process.argv[2]?.toLowerCase();
const files = fs.readdirSync(dir).filter((f) => /\.ged$/i.test(f) && (!filter || f.toLowerCase().includes(filter)));

for (const f of files) {
  const bytes = new Uint8Array(fs.readFileSync(path.join(dir, f)));
  const out = [`\n=== ${f} (${(bytes.length / 1024).toFixed(0)} KB)`];
  try {
    let t0 = performance.now();
    const tree = parseGedcom(bytes);
    const tParse = performance.now() - t0;
    const people = Object.values(tree.people);
    const fams = Object.values(tree.families);
    const living = people.filter((p) => p.living).length;
    const unnamed = people.filter((p) => !p.firstName && !p.lastName).length;
    out.push(`parse ${tParse.toFixed(0)} ms: ${people.length} people (${living} living, ${unnamed} unnamed), ${fams.length} families`);
    out.push('sample: ' + people.slice(0, 3).map((p) => `${p.lastName} ${p.firstName} ${p.middleName} [${p.birth.date}–${p.death.date}]`.replace(/\s+/g, ' ')).join(' | '));

    t0 = performance.now();
    const lay = computeLayout(tree, { cardW: 200, cardH: 88, orientation: 'tb', collapsed: {} });
    const tLayout = performance.now() - t0;
    // overlap check: cards on the same row must not intersect
    const rows = new Map();
    for (const n of lay.nodes) (rows.get(Math.round(n.y)) ?? rows.set(Math.round(n.y), []).get(Math.round(n.y))).push(n.x);
    let overlaps = 0;
    for (const xs of rows.values()) {
      xs.sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] < 199) overlaps++;
    }
    const gens = rows.size;
    const widest = Math.max(0, ...[...rows.values()].map((r) => r.length));
    // 1.0 = as tight as the widest generation allows; bigger = empty space left by the layout
    out.push(`widest row: ${widest} people, density ${widest ? (lay.width / (widest * 236)).toFixed(2) : '-'}`);
    out.push(`layout ${tLayout.toFixed(0)} ms: ${lay.nodes.length} nodes, ${lay.edges.length} edges, ${gens} rows, ${Math.round(lay.width)}×${Math.round(lay.height)} px, overlaps: ${overlaps}`);

    const back = parseGedcom(toGedcom(tree));
    const same = Object.keys(back.people).length === people.length && Object.keys(back.families).length === fams.length;
    out.push(`round-trip: ${same ? 'OK' : `MISMATCH ${Object.keys(back.people).length}/${Object.keys(back.families).length}`}`);
  } catch (e) {
    out.push('ERROR: ' + (e.stack ?? e));
  }
  console.log(out.join('\n'));
}
// ---- lossless round trip of the app's own data through .ged (_FT_ tags) ----
{
  const { buildDemo } = await server.ssrLoadModule('/src/model/demo.ts');
  const t = buildDemo();
  const [a, b] = Object.values(t.people);
  const img = 'data:image/png;base64,' + 'iVBORw0KGgo'.repeat(300); // long: exercises CONC splitting
  Object.assign(a, { photo: img, cardColor: '#e53935', bio: 'Биография  с двойным пробелом\nи второй строкой ', notes: 'Заметка' });
  a.gallery = [{ id: 'g1', name: 'фото.png', mime: 'image/png', dataUrl: img, caption: 'Подпись к фото' }];
  a.documents = [{ id: 'd1', name: 'метрика.pdf', mime: 'application/pdf', dataUrl: 'data:application/pdf;base64,JVBERi0x', caption: '' }];
  Object.assign(b, { living: true, death: { date: '', place: '' }, burial: '' }); // marked alive explicitly
  Object.values(t.families)[0].type = 'partners';
  const back = parseGedcom(toGedcom(t));
  const strip = (tr) =>
    JSON.stringify({
      name: tr.name,
      branches: tr.branches,
      links: tr.links,
      families: Object.values(tr.families).map((f) => ({ ...f, partners: [...f.partners].sort() })).sort((x, y) => x.id.localeCompare(y.id)),
      people: Object.values(tr.people)
        .map((p) => ({ ...p, events: p.events.map((e) => [e.date, e.title, e.place, e.description]), gallery: p.gallery.map(({ id, ...g }) => g), documents: p.documents.map(({ id, ...g }) => g) }))
        .sort((x, y) => x.id.localeCompare(y.id)),
    });
  const ok = strip(t) === strip(back);
  console.log(`\n=== lossless .ged round trip (demo + photo, gallery, documents, colors, branches, links): ${ok ? 'OK' : 'MISMATCH'}`);
  if (!ok) {
    const x = strip(t), y = strip(back);
    let i = 0;
    while (x[i] === y[i]) i++;
    console.log('first difference:\n  saved : ' + x.slice(i - 80, i + 80) + '\n  loaded: ' + y.slice(i - 80, i + 80));
  }
}
await server.close();
