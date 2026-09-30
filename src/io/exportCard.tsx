import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { toCanvas } from 'html-to-image';
import { useStore } from '../model/store';
import type { Person, TreeData } from '../model/types';
import { fullName, lifeSpan } from '../model/relations';
import { cardTint } from '../ui/theme';
import { canvasToBlob, cssVar, infoRows, relativeRows, safeFileName, saveExport, sortedEvents, tr } from './exportShared';
import { buildOdt } from './odt';

function Table({ rows }: { rows: [string, string][] }) {
  return (
    <table className="pc-table">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <td>{k}</td>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Printable layout of a person's card, rendered off-screen for the PNG export. */
function PrintCard({ p, tree }: { p: Person; tree: TreeData }) {
  const tint = p.cardColor ? cardTint(p.cardColor, document.documentElement.dataset.theme === 'dark') : null;
  const info = infoRows(p);
  const rel = relativeRows(p, tree);
  return (
    <div className="print-card" style={{ borderTopColor: p.cardColor ?? 'var(--md-primary)' }}>
      <div className="pc-head" style={tint ? { background: tint.bg, color: tint.fg } : undefined}>
        <div className={`pc-photo ${p.living ? '' : 'deceased'}`}>{p.photo ? <img src={p.photo} alt="" /> : <span className="material-symbols-outlined">person</span>}</div>
        <div>
          <div className="pc-name">{fullName(p, tr('unnamed'))}</div>
          {p.maidenName && (
            <div className="pc-muted">
              {tr('maidenName')}: {p.maidenName}
            </div>
          )}
          <div className="pc-status">
            <span className={`status ${p.living ? 'living' : 'deceased'}`}>{p.living ? tr('living') : tr('deceased')}</span>
            <span className="pc-muted">{lifeSpan(p)}</span>
          </div>
        </div>
      </div>
      <div className="pc-body">
        {info.length > 0 && <Table rows={info} />}
        {rel.length > 0 && (
          <>
            <h3>{tr('family')}</h3>
            <Table rows={rel} />
          </>
        )}
        {p.bio && (
          <>
            <h3>{tr('bio')}</h3>
            <p>{p.bio}</p>
          </>
        )}
        {p.events.length > 0 && (
          <>
            <h3>{tr('events')}</h3>
            {sortedEvents(p).map((e) => (
              <p key={e.id}>
                <b>{[e.date, e.title].filter(Boolean).join(' — ')}</b>
                {e.place && <span className="pc-muted"> · {e.place}</span>}
                {e.description && (
                  <>
                    <br />
                    {e.description}
                  </>
                )}
              </p>
            ))}
          </>
        )}
        {p.notes && (
          <>
            <h3>{tr('notes')}</h3>
            <p>{p.notes}</p>
          </>
        )}
        {p.gallery.length > 0 && (
          <div className="pc-gallery">
            {p.gallery.slice(0, 8).map((g) => (
              <img key={g.id} src={g.dataUrl} alt="" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

async function renderCard(p: Person, tree: TreeData): Promise<Blob> {
  const host = document.createElement('div');
  host.className = 'offscreen';
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(<PrintCard p={p} tree={tree} />));
    const el = host.firstElementChild as HTMLElement;
    await Promise.all([...el.querySelectorAll('img')].map((i) => i.decode().catch(() => undefined)));
    return canvasToBlob(await toCanvas(el, { pixelRatio: 2, backgroundColor: cssVar('--md-surface') || '#fff' }), 'image/png');
  } finally {
    root.unmount();
    host.remove();
  }
}

export function exportCardPng(id: string) {
  const { tree } = useStore.getState();
  const p = tree.people[id];
  if (p) return saveExport(safeFileName(fullName(p, 'card')) + '.png', { name: 'PNG', ext: 'png' }, () => renderCard(p, tree));
}

export function exportCardOdt(id: string) {
  const { tree } = useStore.getState();
  const p = tree.people[id];
  const accent = p?.cardColor ?? (cssVar('--md-primary') || '#6750A4');
  if (p) return saveExport(safeFileName(fullName(p, 'card')) + '.odt', { name: 'OpenDocument Text', ext: 'odt' }, () => buildOdt(p, tree, accent));
}
