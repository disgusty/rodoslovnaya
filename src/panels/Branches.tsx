import { useMemo, useState } from 'react';
import { useStore, uid } from '../model/store';
import { useT } from '../ui/i18n';
import { fullName } from '../model/relations';
import type { Branch, TreeData } from '../model/types';
import { Button, ColorPicker, Dialog, Icon, IconButton, Segmented, TextField, confirmDialog } from '../ui/components';

/** Left drawer: list of highlighted branches and individually colored links. */
export function BranchesDrawer() {
  const t = useT();
  const tree = useStore((s) => s.tree);
  const st = useStore.getState;
  const links = Object.entries(tree.links);

  const newBranch = () =>
    st().set({
      editingBranch: {
        id: uid(),
        name: '',
        rootId: st().selectedId ?? Object.keys(tree.people)[0] ?? '',
        direction: 'descendants',
        color: '#1E88E5',
        comment: '',
        visible: true,
      },
    });

  return (
    <aside className="sheet left">
      <div className="sheet-head">
        <div className="title-l">{t('branches')}</div>
        <IconButton icon="close" title={t('close')} onClick={() => st().set({ drawerOpen: false })} data-back />
      </div>
      <div className="sheet-body stack">
        <Button variant="filled" icon="add" onClick={newBranch} disabled={!Object.keys(tree.people).length}>
          {t('newBranch')}
        </Button>
        {tree.branches.length === 0 && <div className="body-m muted">{t('noBranches')}</div>}
        <div>
          {tree.branches.map((b) => (
            <div key={b.id} className={`branch-item ${b.visible ? '' : 'hidden-branch'}`} onClick={() => st().set({ editingBranch: b })}>
              <span className="branch-color" style={{ background: b.color }} />
              <div className="grow">
                <div className="title-s">{b.name || fullName(tree.people[b.rootId])}</div>
                <div className="body-s muted">
                  {b.direction === 'descendants' ? t('descendantsDir') : t('ancestorsDir')}: {fullName(tree.people[b.rootId])}
                </div>
                {b.comment && <div className="body-m prewrap" style={{ marginTop: 4 }}>{b.comment}</div>}
              </div>
              <IconButton
                icon={b.visible ? 'visibility' : 'visibility_off'}
                small
                title={t('show')}
                onClick={(e) => {
                  e.stopPropagation();
                  st().saveBranch({ ...b, visible: !b.visible });
                }}
              />
            </div>
          ))}
        </div>

        <div className="divider" style={{ margin: '4px 0' }} />
        <div className="section-label">{t('coloredLinks')}</div>
        {links.length === 0 && <div className="body-m muted">{t('noLinks')}</div>}
        {links.map(([id, s]) => (
          <div key={id} className="branch-item" onClick={() => st().set({ editingLink: id })}>
            <span className="branch-color" style={{ background: s.color }} />
            <div className="grow">
              <div className="title-s">{describeEdge(id, tree)}</div>
              {s.comment && <div className="body-m muted prewrap">{s.comment}</div>}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

/** "A + B" for a spouse link, "A + B → C" for a parent→child link (see LayoutEdge ids). */
function describeEdge(id: string, tree: TreeData): string {
  const [kind, famId, childId] = id.split(':');
  const f = tree.families[famId];
  if (!f) return '—';
  const names = f.partners.map((p) => fullName(tree.people[p])).join(' + ');
  if (kind === 's') return names;
  return `${names || '…'} → ${fullName(tree.people[childId])}`;
}

export function BranchDialog() {
  const branch = useStore((s) => s.editingBranch);
  return branch ? <BranchDialogInner key={branch.id} branch={branch} /> : null;
}

function BranchDialogInner({ branch }: { branch: Branch }) {
  const t = useT();
  const people = useStore((s) => s.tree.people);
  const exists = useStore((s) => s.tree.branches.some((b) => b.id === branch.id));
  const [d, setD] = useState(branch);
  const [q, setQ] = useState('');
  const st = useStore.getState;
  const close = () => st().set({ editingBranch: null });
  const list = useMemo(
    () =>
      Object.values(people)
        .filter((p) => fullName(p, '').toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => fullName(a).localeCompare(fullName(b))),
    [people, q],
  );
  const save = () => {
    st().saveBranch({ ...d, name: d.name.trim() || fullName(people[d.rootId]) });
    close();
  };
  return (
    <Dialog
      title={exists ? t('editBranch') : t('newBranch')}
      icon="format_paint"
      onClose={close}
      actions={
        <>
          {exists && (
            <Button
              className="left"
              danger
              icon="delete"
              onClick={async () => {
                if (await confirmDialog(t('delete') + '?')) {
                  st().deleteBranch(d.id);
                  close();
                }
              }}
            >
              {t('delete')}
            </Button>
          )}
          <Button onClick={close}>{t('cancel')}</Button>
          <Button variant="filled" onClick={save} disabled={!people[d.rootId]}>
            {t('save')}
          </Button>
        </>
      }
    >
      <TextField label={t('branchName')} value={d.name} onChange={(v) => setD({ ...d, name: v })} autoFocus />
      <div className="field">
        <label>{t('direction')}</label>
        <Segmented
          value={d.direction}
          onChange={(v) => setD({ ...d, direction: v })}
          options={[
            { value: 'descendants', label: t('descendantsDir'), icon: 'south' },
            { value: 'ancestors', label: t('ancestorsDir'), icon: 'north' },
          ]}
        />
      </div>
      <div className="field">
        <label>{t('branchRoot')}</label>
        <div className="chip static" style={{ alignSelf: 'flex-start', marginBottom: 8 }}>
          <Icon name="person" />
          <span className="ellipsis">{people[d.rootId] ? fullName(people[d.rootId]) : t('choosePerson')}</span>
        </div>
        <input placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <div style={{ maxHeight: 160, overflow: 'auto', marginTop: 4 }}>
          {list.map((p) => (
            <button
              key={p.id}
              className={`list-item state ${p.id === d.rootId ? 'active' : ''}`}
              style={p.id === d.rootId ? { background: 'var(--md-secondary-container)' } : undefined}
              onClick={() => setD({ ...d, rootId: p.id })}
            >
              <span className={`g-dot g-${p.gender}`} />
              <span className="grow ellipsis">{fullName(p, t('unnamed'))}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>{t('color')}</label>
        <ColorPicker value={d.color} onChange={(c) => setD({ ...d, color: c ?? d.color })} />
      </div>
      <TextField label={t('comment')} multiline rows={3} value={d.comment} onChange={(v) => setD({ ...d, comment: v })} />
    </Dialog>
  );
}

export function LinkDialog() {
  const id = useStore((s) => s.editingLink);
  if (!id) return null;
  return <LinkDialogInner key={id} id={id} />;
}

function LinkDialogInner({ id }: { id: string }) {
  const t = useT();
  const tree = useStore((s) => s.tree);
  const existing = tree.links[id];
  const [color, setColor] = useState<string>(existing?.color ?? '#E53935');
  const [comment, setComment] = useState(existing?.comment ?? '');
  const st = useStore.getState;
  const close = () => st().set({ editingLink: null });
  const kind = id.startsWith('s:') ? t('spouseLink') : t('childLink');
  return (
    <Dialog
      title={t('linkTitle')}
      icon="timeline"
      onClose={close}
      actions={
        <>
          {existing && (
            <Button
              className="left"
              icon="format_color_reset"
              onClick={() => {
                st().setLink(id, null);
                close();
              }}
            >
              {t('reset')}
            </Button>
          )}
          <Button onClick={close}>{t('cancel')}</Button>
          <Button
            variant="filled"
            onClick={() => {
              st().setLink(id, { color, comment });
              close();
            }}
          >
            {t('apply')}
          </Button>
        </>
      }
    >
      <div>
        <div className="body-s muted">{kind}</div>
        <div className="title-m">{describeEdge(id, tree)}</div>
      </div>
      <div className="field">
        <label>{t('color')}</label>
        <ColorPicker value={color} onChange={(c) => setColor(c ?? color)} />
      </div>
      <TextField label={t('comment')} multiline rows={3} value={comment} onChange={setComment} autoFocus />
    </Dialog>
  );
}
