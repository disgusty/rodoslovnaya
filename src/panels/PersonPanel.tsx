import { useState } from 'react';
import { useStore, uid, FAMILY_TYPES, type RelKind } from '../model/store';
import type { Attachment, Family, FamilyType, LifeEvent, Person } from '../model/types';
import { ageOf, childrenOf, familiesAsPartner, familyAsChild, fullName, lifeSpan, siblingsOf } from '../model/relations';
import { dataUrlToBlob, fileToDataUrl, imageFileToDataUrl, saveBinaryFile } from '../io/platform';
import { chooseFile } from '../io/fileActions';
import { useT } from '../ui/i18n';
import { Button, ColorPicker, Icon, IconButton, Menu, confirmDialog, useMenu, type MenuItem } from '../ui/components';
import { PersonEditor } from './PersonEditor';
import { EventDialog, LightboxDialog, LinkPersonDialog } from './PersonDialogs';

/** Side sheet with the selected person's card (view or edit mode). */
export function PersonPanel() {
  const id = useStore((s) => s.selectedId);
  const person = useStore((s) => (id ? s.tree.people[id] : undefined));
  const editing = useStore((s) => s.editing);
  if (!person) return null;
  return (
    <aside className="sheet" key={person.id}>
      {editing ? <PersonEditor person={person} /> : <PersonView person={person} />}
    </aside>
  );
}

function PersonView({ person }: { person: Person }) {
  const t = useT();
  const tree = useStore((s) => s.tree);
  const collapsed = useStore((s) => !!s.collapsed[person.id]);
  const st = useStore.getState;
  const addMenu = useMenu();
  const moreMenu = useMenu();
  const [colorOpen, setColorOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [eventEdit, setEventEdit] = useState<LifeEvent | null>(null);
  const [lightbox, setLightbox] = useState<Attachment | null>(null);

  const ownFams = familiesAsPartner(tree, person.id);
  const parentFam = familyAsChild(tree, person.id);
  const children = childrenOf(tree, person.id);
  const siblings = siblingsOf(tree, person.id);
  const age = ageOf(person);
  const span = lifeSpan(person);

  const add = (kind: RelKind, familyId?: string) => {
    const nid = st().addRelative(person.id, kind, familyId);
    if (nid) st().select(nid, true);
  };
  const partnerNames = (f: Family) =>
    f.partners
      .filter((p) => p !== person.id)
      .map((p) => fullName(tree.people[p]))
      .join(', ') || '…';

  const addItems: MenuItem[] = [
    { icon: 'arrow_upward', label: t('addParent'), onClick: () => add('parent'), disabled: (parentFam?.partners.length ?? 0) >= 2 },
    { icon: 'favorite', label: t('addSpouse'), onClick: () => add('spouse') },
    ...(ownFams.length > 1
      ? ownFams.map<MenuItem>((f) => ({ icon: 'arrow_downward', label: `${t('addChild')} — ${partnerNames(f)}`, onClick: () => add('child', f.id) }))
      : [{ icon: 'arrow_downward', label: t('addChild'), onClick: () => add('child') }]),
    { icon: 'swap_horiz', label: t('addSibling'), onClick: () => add('sibling') },
    { divider: true, label: '' },
    { icon: 'link', label: t('linkExisting'), onClick: () => setLinkOpen(true) },
  ];

  const exportCard = async (kind: 'odt' | 'png') => {
    const m = await import('../io/exportCard');
    return kind === 'odt' ? m.exportCardOdt(person.id) : m.exportCardPng(person.id);
  };
  const highlight = () =>
    st().set({
      editingBranch: {
        id: uid(),
        name: fullName(person),
        rootId: person.id,
        direction: children.length ? 'descendants' : 'ancestors',
        color: '#E53935',
        comment: '',
        visible: true,
      },
    });
  const del = async () => {
    if (await confirmDialog(t('deletePersonQ'))) st().deletePerson(person.id);
  };

  const moreItems: MenuItem[] = [
    { header: true, label: t('exportCard') },
    { icon: 'description', label: t('exportOdt'), onClick: () => exportCard('odt') },
    { icon: 'image', label: t('exportCardPng'), onClick: () => exportCard('png') },
    { divider: true, label: '' },
    { icon: 'palette', label: t('highlightBranch'), onClick: highlight },
    ...(children.length
      ? [{ icon: collapsed ? 'unfold_more' : 'unfold_less', label: collapsed ? t('expandBranch') : t('collapseBranch'), onClick: () => st().toggleCollapsed(person.id) }]
      : []),
    { divider: true, label: '' },
    { icon: 'delete', label: t('delete'), onClick: del },
  ];

  const addGallery = async () => {
    const f = await chooseFile('image/*');
    if (!f) return;
    const dataUrl = await imageFileToDataUrl(f, 1600);
    st().updatePerson(person.id, { gallery: [...person.gallery, { id: uid(), name: f.name, mime: 'image/jpeg', dataUrl, caption: '' }] });
  };
  const addDoc = async () => {
    const f = await chooseFile('*/*');
    if (!f) return;
    const dataUrl = await fileToDataUrl(f);
    st().updatePerson(person.id, { documents: [...person.documents, { id: uid(), name: f.name, mime: f.type, dataUrl, caption: '' }] });
  };
  const saveDoc = (d: Attachment) => saveBinaryFile(d.name, [{ name: d.name, extensions: [d.name.split('.').pop() ?? '*'] }], dataUrlToBlob(d.dataUrl));

  const info: [string, string, string][] = [
    ['cake', t('birth'), [person.birth.date, person.birth.place].filter(Boolean).join(', ')],
    ...(person.living
      ? []
      : ([
          ['deceased', t('death'), [person.death.date, person.death.place].filter(Boolean).join(', ')],
          ['yard', t('burial'), person.burial],
        ] as [string, string, string][])),
    ['work', t('occupation'), person.occupation],
    ['school', t('education'), person.education],
    ['home', t('residence'), person.residence],
  ];
  const filled = info.filter((r) => r[2]);

  return (
    <>
      <div className="sheet-head">
        <div className="title-l">{t('mainInfo')}</div>
        <IconButton icon="edit" title={t('edit')} onClick={() => st().setEditing(true)} />
        <IconButton icon="person_add" title={t('addRelative')} onClick={addMenu.open} />
        <IconButton icon="more_vert" title={t('exportCard')} onClick={moreMenu.open} />
        <IconButton icon="close" title={t('close')} onClick={() => st().select(null)} data-back />
      </div>
      <Menu anchor={addMenu.anchor} onClose={addMenu.close} items={addItems} />
      <Menu anchor={moreMenu.anchor} onClose={moreMenu.close} items={moreItems} />

      <div className="sheet-body">
        <div className="hero">
          <div className={`hero-photo ${person.living ? '' : 'deceased'}`}>{person.photo ? <img src={person.photo} alt="" /> : <Icon name="person" />}</div>
          <div className="hero-name headline-s">{fullName(person, t('unnamed'))}</div>
          {person.maidenName && (
            <div className="body-m muted">
              {t('maidenName')}: {person.maidenName}
            </div>
          )}
          <div className="row hero-meta">
            <span className={`status ${person.living ? 'living' : 'deceased'}`}>
              <Icon name={person.living ? 'favorite' : 'deceased'} fill />
              {person.living ? t('living') : t('deceased')}
            </span>
            {span && <span className="body-m muted">{span}</span>}
            {age != null && (
              <span className="body-m muted">
                · {age} {t('years')}
              </span>
            )}
          </div>
          <Button variant="tonal" icon="palette" onClick={() => setColorOpen(!colorOpen)}>
            {t('cardColor')}
          </Button>
          {colorOpen && <ColorPicker allowNone value={person.cardColor} onChange={(c) => st().updatePerson(person.id, { cardColor: c })} />}
        </div>

        {filled.length > 0 && (
          <Section title={t('mainInfo')}>
            {filled.map(([icon, label, value]) => (
              <div className="info-row" key={label}>
                <Icon name={icon} />
                <div>
                  <div className="body-s muted">{label}</div>
                  <div className="body-m">{value}</div>
                </div>
              </div>
            ))}
          </Section>
        )}

        <Section title={t('family')}>
          <FamilyGroup label={t('parents')} ids={parentFam?.partners ?? []} me={person.id} />
          {ownFams.map((f) => (
            <SpouseRow key={f.id} fam={f} me={person.id} />
          ))}
          <FamilyGroup label={t('children')} ids={children} me={person.id} />
          <FamilyGroup label={t('siblings')} ids={siblings} me={person.id} />
          {!parentFam && !ownFams.length && !siblings.length && <div className="body-m muted">{t('noData')}</div>}
        </Section>

        {person.bio && (
          <Section title={t('bio')}>
            <div className="body-m prewrap">{person.bio}</div>
          </Section>
        )}

        <Section
          title={t('events')}
          action={<IconButton icon="add" small title={t('addEvent')} onClick={() => setEventEdit({ id: uid(), date: '', title: '', place: '', description: '' })} />}
        >
          {person.events.length === 0 && <div className="body-m muted">{t('noData')}</div>}
          <div className="timeline">
            {[...person.events]
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((ev) => (
                <div key={ev.id} className="tl-item" onClick={() => setEventEdit(ev)}>
                  <div className="tl-dot" />
                  <div>
                    <div className="body-s muted">{[ev.date, ev.place].filter(Boolean).join(' · ')}</div>
                    <div className="title-s">{ev.title || t('eventTitle')}</div>
                    {ev.description && <div className="body-m muted prewrap">{ev.description}</div>}
                  </div>
                </div>
              ))}
          </div>
        </Section>

        <Section title={t('gallery')} action={<IconButton icon="add_photo_alternate" small title={t('addPhoto')} onClick={addGallery} />}>
          {person.gallery.length === 0 ? (
            <div className="body-m muted">{t('noData')}</div>
          ) : (
            <div className="gallery">
              {person.gallery.map((g) => (
                <img key={g.id} src={g.dataUrl} alt={g.caption} title={g.caption} onClick={() => setLightbox(g)} />
              ))}
            </div>
          )}
        </Section>

        <Section title={t('documents')} action={<IconButton icon="attach_file" small title={t('addDocument')} onClick={addDoc} />}>
          {person.documents.length === 0 && <div className="body-m muted">{t('noData')}</div>}
          {person.documents.map((d) => (
            <div className="list-item static" key={d.id}>
              <Icon name={d.mime.startsWith('image/') ? 'image' : d.mime.includes('pdf') ? 'picture_as_pdf' : 'draft'} />
              <div className="grow ellipsis body-m">{d.name}</div>
              <IconButton icon="download" small title={t('save')} onClick={() => saveDoc(d)} />
              <IconButton
                icon="delete"
                small
                title={t('delete')}
                onClick={() => st().updatePerson(person.id, { documents: person.documents.filter((x) => x.id !== d.id) })}
              />
            </div>
          ))}
        </Section>

        {person.notes && (
          <Section title={t('notes')}>
            <div className="body-m prewrap">{person.notes}</div>
          </Section>
        )}
      </div>

      {linkOpen && <LinkPersonDialog person={person} onClose={() => setLinkOpen(false)} />}
      {eventEdit && <EventDialog person={person} ev={eventEdit} onClose={() => setEventEdit(null)} />}
      {lightbox && <LightboxDialog person={person} item={lightbox} onClose={() => setLightbox(null)} />}
    </>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="p-section">
      <div className="p-section-head">
        <span className="section-label">{title}</span>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A relative: click centers the tree on them, the cross removes the relation. */
function PersonChip({ id, me }: { id: string; me: string }) {
  const p = useStore((s) => s.tree.people[id]);
  const t = useT();
  if (!p) return null;
  const unlink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (await confirmDialog(`${t('removeRelation')}: ${fullName(p, t('unnamed'))}?`)) useStore.getState().removeRelation(me, id);
  };
  return (
    <span className="chip state" role="button" onClick={() => useStore.getState().focusPerson(id)} title={fullName(p)}>
      <span className={`g-dot g-${p.gender}`} />
      <span className="ellipsis">{fullName(p, t('unnamed'))}</span>
      {!p.living && <span className="muted">†</span>}
      <span className="chip-x" onClick={unlink} title={t('removeRelation')}>
        <Icon name="close" />
      </span>
    </span>
  );
}

function FamilyGroup({ label, ids, me }: { label: string; ids: string[]; me: string }) {
  if (!ids.length) return null;
  return (
    <div className="fam-group">
      <div className="body-s muted">{label}</div>
      <div className="row wrap chips">
        {ids.map((id) => (
          <PersonChip key={id} id={id} me={me} />
        ))}
      </div>
    </div>
  );
}

function SpouseRow({ fam, me }: { fam: Family; me: string }) {
  const t = useT();
  const other = fam.partners.find((p) => p !== me);
  if (!other) return null;
  return (
    <div className="fam-group">
      <div className="body-s muted">
        {t('spouses')}
        {fam.date && ` · ${t('marriage')}: ${fam.date}`}
        {fam.place && `, ${fam.place}`}
      </div>
      <div className="row chips">
        <PersonChip id={other} me={me} />
        <select
          className="mini-select"
          value={fam.type}
          onChange={(e) => useStore.getState().updateFamily(fam.id, { type: e.target.value as FamilyType })}
          title={t('familyType')}
        >
          {FAMILY_TYPES.map((ft) => (
            <option key={ft} value={ft}>
              {t(ft)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
