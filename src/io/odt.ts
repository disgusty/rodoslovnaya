/**
 * Minimal OpenDocument Text writer for a person's card:
 * mimetype (stored, first) + manifest + meta + content.xml with automatic styles + Pictures/.
 */
import JSZip from 'jszip';
import type { Person, TreeData } from '../model/types';
import { fullName, lifeSpan } from '../model/relations';
import { cardTint } from '../ui/theme';
import { dataUrlToBytes } from './platform';
import { infoRows, relativeRows, sortedEvents, tr } from './exportShared';

const MIME = 'application/vnd.oasis.opendocument.text';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\t/g, '<text:tab/>');
const para = (style: string, text: string) => `<text:p text:style-name="${style}">${esc(text).split('\n').join('<text:line-break/>')}</text:p>`;

function imageSize(url: string): Promise<{ w: number; h: number }> {
  const img = new Image();
  img.src = url;
  return img.decode().then(
    () => ({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 }),
    () => ({ w: 1, h: 1 }),
  );
}

const styles = (accent: string, band: string) => {
  const font = 'fo:font-family="Roboto, Arial"';
  return `
<style:style style:name="Title" style:family="paragraph"><style:paragraph-properties fo:background-color="${band}" fo:padding="0.2cm" fo:margin-top="0.2cm"/><style:text-properties ${font} fo:font-size="22pt" fo:font-weight="bold" fo:color="#1c1b1f"/></style:style>
<style:style style:name="Sub" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.3cm" fo:padding-left="0.2cm"/><style:text-properties ${font} fo:font-size="11pt" fo:color="#555555"/></style:style>
<style:style style:name="H" style:family="paragraph"><style:paragraph-properties fo:margin-top="0.5cm" fo:margin-bottom="0.2cm" fo:border-bottom="1.5pt solid ${accent}" fo:padding-bottom="0.05cm"/><style:text-properties ${font} fo:font-size="14pt" fo:font-weight="bold" fo:color="${accent}"/></style:style>
<style:style style:name="Body" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.15cm" fo:line-height="130%"/><style:text-properties ${font} fo:font-size="11pt"/></style:style>
<style:style style:name="Indent" style:family="paragraph"><style:paragraph-properties fo:margin-left="0.6cm" fo:margin-bottom="0.2cm"/><style:text-properties ${font} fo:font-size="10.5pt" fo:color="#444444"/></style:style>
<style:style style:name="Caption" style:family="paragraph"><style:text-properties ${font} fo:font-size="9.5pt" fo:font-style="italic" fo:color="#666666"/></style:style>
<style:style style:name="Photo" style:family="paragraph"><style:paragraph-properties fo:text-align="start"/></style:style>
<style:style style:name="Key" style:family="paragraph"><style:text-properties ${font} fo:font-size="10.5pt" fo:color="#666666"/></style:style>
<style:style style:name="Val" style:family="paragraph"><style:text-properties ${font} fo:font-size="11pt"/></style:style>
<style:style style:name="B" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>
<style:style style:name="Tbl" style:family="table"><style:table-properties style:width="17cm" table:align="left"/></style:style>
<style:style style:name="ColA" style:family="table-column"><style:table-column-properties style:column-width="5cm"/></style:style>
<style:style style:name="ColB" style:family="table-column"><style:table-column-properties style:column-width="12cm"/></style:style>
<style:style style:name="Cell" style:family="table-cell"><style:table-cell-properties fo:padding="0.1cm" fo:border-bottom="0.5pt solid #dddddd" fo:border-top="none" fo:border-left="none" fo:border-right="none"/></style:style>
<style:style style:name="fr" style:family="graphic"><style:graphic-properties style:wrap="none" style:vertical-pos="top" style:vertical-rel="baseline"/></style:style>`;
};

export async function buildOdt(p: Person, tree: TreeData, accent: string): Promise<Blob> {
  const zip = new JSZip();
  // "mimetype" must be the first entry and stored uncompressed
  zip.file('mimetype', MIME, { compression: 'STORE' });
  const pictures: { path: string; mime: string }[] = [];

  const frame = async (url: string, widthCm: number) => {
    const { bytes, mime } = dataUrlToBytes(url);
    const n = pictures.length + 1;
    const path = `Pictures/img${n}.${mime.includes('png') ? 'png' : mime.includes('gif') ? 'gif' : 'jpg'}`;
    zip.file(path, bytes);
    pictures.push({ path, mime });
    const { w, h } = await imageSize(url);
    return `<draw:frame draw:style-name="fr" draw:name="img${n}" text:anchor-type="as-char" svg:width="${widthCm}cm" svg:height="${((widthCm * h) / w).toFixed(2)}cm"><draw:image xlink:href="${path}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame>`;
  };
  let tables = 0;
  const table = (rows: [string, string][]) =>
    `<table:table table:name="T${++tables}" table:style-name="Tbl"><table:table-column table:style-name="ColA"/><table:table-column table:style-name="ColB"/>` +
    rows
      .map(
        ([k, v]) =>
          `<table:table-row><table:table-cell table:style-name="Cell" office:value-type="string">${para('Key', k)}</table:table-cell><table:table-cell table:style-name="Cell" office:value-type="string">${para('Val', v)}</table:table-cell></table:table-row>`,
      )
      .join('') +
    `</table:table>`;

  let body = '';
  if (p.photo) body += `<text:p text:style-name="Photo">${await frame(p.photo, 4.5)}</text:p>`;
  body += para('Title', fullName(p, tr('unnamed')));
  const sub = [p.living ? tr('living') : tr('deceased'), lifeSpan(p)].filter(Boolean).join(' · ');
  body += para('Sub', sub + (p.maidenName ? `\n${tr('maidenName')}: ${p.maidenName}` : ''));
  body += para('H', tr('mainInfo')) + table(infoRows(p));
  const rel = relativeRows(p, tree);
  if (rel.length) body += para('H', tr('family')) + table(rel);
  if (p.bio) body += para('H', tr('bio')) + para('Body', p.bio);
  if (p.events.length) {
    body += para('H', tr('events'));
    for (const e of sortedEvents(p)) {
      body += `<text:p text:style-name="Body"><text:span text:style-name="B">${esc([e.date, e.title].filter(Boolean).join(' — '))}</text:span>${e.place ? esc(' · ' + e.place) : ''}</text:p>`;
      if (e.description) body += para('Indent', e.description);
    }
  }
  if (p.notes) body += para('H', tr('notes')) + para('Body', p.notes);
  if (p.gallery.length) {
    body += para('H', tr('gallery'));
    for (const g of p.gallery) {
      body += `<text:p text:style-name="Body">${await frame(g.dataUrl, 8)}</text:p>`;
      if (g.caption) body += para('Caption', g.caption);
    }
  }
  if (p.documents.length) body += para('H', tr('documents')) + p.documents.map((d) => para('Body', '• ' + d.name)).join('');

  const ns =
    'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"';
  const band = p.cardColor ? cardTint(p.cardColor, false).bg : '#f3f0f7';
  zip.file(
    'content.xml',
    `<?xml version="1.0" encoding="UTF-8"?>\n<office:document-content ${ns} office:version="1.2"><office:automatic-styles>${styles(accent, band)}</office:automatic-styles><office:body><office:text>${body}</office:text></office:body></office:document-content>`,
  );
  zip.file(
    'meta.xml',
    `<?xml version="1.0" encoding="UTF-8"?>\n<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.2"><office:meta><dc:title>${esc(fullName(p))}</dc:title><meta:generator>FamilyTree</meta:generator><meta:creation-date>${new Date().toISOString().slice(0, 19)}</meta:creation-date></office:meta></office:document-meta>`,
  );
  const entry = (path: string, mime: string) => `<manifest:file-entry manifest:full-path="${path}" manifest:media-type="${mime}"/>`;
  zip.file(
    'META-INF/manifest.xml',
    `<?xml version="1.0" encoding="UTF-8"?>\n<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">` +
      `<manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="${MIME}"/>` +
      entry('content.xml', 'text/xml') +
      entry('meta.xml', 'text/xml') +
      pictures.map((x) => entry(x.path, x.mime)).join('') +
      `</manifest:manifest>`,
  );
  return zip.generateAsync({ type: 'blob', mimeType: MIME, compression: 'DEFLATE' });
}
