import { useMemo, useState } from 'react';
import { useStore, type RelKind } from '../model/store';
import type { Attachment, LifeEvent, Person } from '../model/types';
import { fullName, lifeSpan } from '../model/relations';
import { useT } from '../ui/i18n';
import { Button, Dialog, Segmented, TextField } from '../ui/components';

const update = (id: string, patch: Partial<Person>) => useStore.getState().updatePerson(id, patch);

export function EventDialog({ person, ev, onClose }: { person: Person; ev: LifeEvent; onClose: () => void }) {
  const t = useT();
  const [d, setD] = useState(ev);
  const exists = person.events.some((e) => e.id === ev.id);
  const save = () => {
    update(person.id, { events: exists ? person.events.map((e) => (e.id === d.id ? d : e)) : [...person.events, d] });
    onClose();
  };
  const remove = () => {
    update(person.id, { events: person.events.filter((e) => e.id !== ev.id) });
    onClose();
  };
  return (
    <Dialog
      title={t('eventTitle')}
      icon="event"
      onClose={onClose}
      actions={
        <>
          {exists && (
            <Button className="left" danger icon="delete" onClick={remove}>
              {t('delete')}
            </Button>
          )}
          <Button onClick={onClose}>{t('cancel')}</Button>
          <Button variant="filled" onClick={save}>
            {t('save')}
          </Button>
        </>
      }
    >
      <TextField label={t('eventTitle')} value={d.title} onChange={(v) => setD({ ...d, title: v })} autoFocus />
      <div className="grid-2">
        <TextField label={t('date')} value={d.date} onChange={(v) => setD({ ...d, date: v })} />
        <TextField label={t('place')} value={d.place} onChange={(v) => setD({ ...d, place: v })} />
      </div>
      <TextField label={t('description')} multiline value={d.description} onChange={(v) => setD({ ...d, description: v })} />
    </Dialog>
  );
}

/** Full-size gallery photo with caption; can become the main photo. */
export function LightboxDialog({ person, item, onClose }: { person: Person; item: Attachment; onClose: () => void }) {
  const t = useT();
  const [caption, setCaption] = useState(item.caption);
  const saveAndClose = () => {
    if (caption !== item.caption) update(person.id, { gallery: person.gallery.map((g) => (g.id === item.id ? { ...g, caption } : g)) });
    onClose();
  };
  const remove = () => {
    update(person.id, { gallery: person.gallery.filter((g) => g.id !== item.id) });
    onClose();
  };
  return (
    <Dialog
      title={t('photo')}
      icon="image"
      wide
      onClose={saveAndClose}
      actions={
        <>
          <Button className="left" danger icon="delete" onClick={remove}>
            {t('delete')}
          </Button>
          <Button icon="account_circle" onClick={() => update(person.id, { photo: item.dataUrl })}>
            {t('photo')}
          </Button>
          <Button variant="filled" onClick={saveAndClose}>
            {t('save')}
          </Button>
        </>
      }
    >
      <img className="lightbox-img" src={item.dataUrl} alt="" />
      <TextField label={t('caption')} value={caption} onChange={setCaption} />
    </Dialog>
  );
}

/** Connects an existing person as parent / spouse / child / sibling. */
export function LinkPersonDialog({ person, onClose }: { person: Person; onClose: () => void }) {
  const t = useT();
  const people = useStore((s) => s.tree.people);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<RelKind>('child');
  const list = useMemo(
    () =>
      Object.values(people)
        .filter((p) => p.id !== person.id && fullName(p, '').toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => fullName(a).localeCompare(fullName(b)))
        .slice(0, 100),
    [people, q, person.id],
  );
  const link = (id: string) => {
    useStore.getState().addRelative(person.id, kind, undefined, id);
    onClose();
  };
  return (
    <Dialog title={t('linkExisting')} icon="link" onClose={onClose} actions={<Button onClick={onClose}>{t('cancel')}</Button>}>
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: 'parent', label: t('addParent') },
          { value: 'spouse', label: t('addSpouse') },
          { value: 'child', label: t('addChild') },
          { value: 'sibling', label: t('addSibling') },
        ]}
      />
      <TextField label={t('search')} value={q} onChange={setQ} autoFocus />
      <div className="pick-list">
        {list.map((p) => (
          <button key={p.id} className="list-item state" onClick={() => link(p.id)}>
            <span className={`g-dot g-${p.gender}`} />
            <span className="grow ellipsis">{fullName(p, t('unnamed'))}</span>
            <span className="body-s muted">{lifeSpan(p)}</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}
