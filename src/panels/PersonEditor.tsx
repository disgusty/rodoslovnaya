import { useEffect, useState } from 'react';
import { useStore, FAMILY_TYPES } from '../model/store';
import type { Family, Person } from '../model/types';
import { familiesAsPartner, fullName } from '../model/relations';
import { imageFileToDataUrl } from '../io/platform';
import { chooseFile } from '../io/fileActions';
import { useT } from '../ui/i18n';
import { Button, ColorPicker, Icon, IconButton, Segmented, Select, Switch, TextField } from '../ui/components';

/** Edit form of the person panel. Changes apply on Save (Ctrl+Enter). */
export function PersonEditor({ person }: { person: Person }) {
  const t = useT();
  const tree = useStore((s) => s.tree);
  const st = useStore.getState;
  const [d, setD] = useState<Person>(person);
  const up = (patch: Partial<Person>) => setD((x) => ({ ...x, ...patch }));
  const couples = familiesAsPartner(tree, person.id).filter((f) => f.partners.length === 2);
  const [famDraft, setFamDraft] = useState<Record<string, Family>>(() => Object.fromEntries(couples.map((f) => [f.id, f])));

  const save = () => {
    st().updatePerson(person.id, d);
    for (const f of Object.values(famDraft)) {
      const orig = tree.families[f.id];
      if (orig && (orig.date !== f.date || orig.place !== f.place || orig.type !== f.type))
        st().updateFamily(f.id, { date: f.date, place: f.place, type: f.type });
    }
    st().set({ editing: false, newlyCreated: null });
  };
  const cancel = () => {
    // a person created just now and never filled in is removed again
    const blank = !person.firstName && !person.middleName && !person.photo;
    if (st().newlyCreated === person.id && blank) st().deletePerson(person.id);
    st().set({ editing: false, newlyCreated: null });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && e.ctrlKey) save();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const choosePhoto = async () => {
    const f = await chooseFile('image/*');
    if (f) up({ photo: await imageFileToDataUrl(f, 800) });
  };

  return (
    <>
      <div className="sheet-head">
        <IconButton icon="close" title={t('cancel')} onClick={cancel} data-back />
        <div className="title-l">{t('edit')}</div>
        <Button variant="filled" onClick={save}>
          {t('save')}
        </Button>
      </div>
      <div className="sheet-body stack">
        <div className="row">
          <div className={`hero-photo small ${d.living ? '' : 'deceased'}`} onClick={choosePhoto} title={t('choosePhoto')}>
            {d.photo ? <img src={d.photo} alt="" /> : <Icon name="add_a_photo" />}
          </div>
          <div className="stack tight">
            <Button variant="tonal" icon="photo_camera" onClick={choosePhoto}>
              {t('choosePhoto')}
            </Button>
            {d.photo && (
              <Button icon="hide_image" onClick={() => up({ photo: null })}>
                {t('removePhoto')}
              </Button>
            )}
          </div>
        </div>
        <TextField label={t('lastName')} value={d.lastName} onChange={(v) => up({ lastName: v })} autoFocus />
        <TextField label={t('firstName')} value={d.firstName} onChange={(v) => up({ firstName: v })} />
        <TextField label={t('middleName')} value={d.middleName} onChange={(v) => up({ middleName: v })} />
        {d.gender !== 'm' && <TextField label={t('maidenName')} value={d.maidenName} onChange={(v) => up({ maidenName: v })} />}
        <div className="field">
          <label>{t('gender')}</label>
          <Segmented
            value={d.gender}
            onChange={(g) => up({ gender: g })}
            options={[
              { value: 'm', label: t('male') },
              { value: 'f', label: t('female') },
              { value: 'u', label: t('unknown') },
            ]}
          />
        </div>
        <Switch label={t('living')} checked={d.living} onChange={(v) => up({ living: v })} />

        <div className="section-label">{t('birth')}</div>
        <div className="grid-2">
          <TextField label={t('date')} placeholder="01.01.1900" value={d.birth.date} onChange={(v) => up({ birth: { ...d.birth, date: v } })} />
          <TextField label={t('place')} value={d.birth.place} onChange={(v) => up({ birth: { ...d.birth, place: v } })} />
        </div>
        {!d.living && (
          <>
            <div className="section-label">{t('death')}</div>
            <div className="grid-2">
              <TextField label={t('date')} value={d.death.date} onChange={(v) => up({ death: { ...d.death, date: v } })} />
              <TextField label={t('place')} value={d.death.place} onChange={(v) => up({ death: { ...d.death, place: v } })} />
            </div>
            <TextField label={t('burial')} value={d.burial} onChange={(v) => up({ burial: v })} />
          </>
        )}

        {couples.map((f) => {
          const fd = famDraft[f.id];
          const other = f.partners.find((p) => p !== person.id)!;
          const setF = (patch: Partial<Family>) => setFamDraft((s) => ({ ...s, [f.id]: { ...s[f.id], ...patch } }));
          return (
            <div key={f.id} className="stack tight">
              <div className="section-label">
                {t('marriage')}: {fullName(tree.people[other], t('unnamed'))}
              </div>
              <Select value={fd.type} onChange={(v) => setF({ type: v })} options={FAMILY_TYPES.map((ft) => ({ value: ft, label: t(ft) }))} />
              <div className="grid-2">
                <TextField label={t('date')} value={fd.date} onChange={(v) => setF({ date: v })} />
                <TextField label={t('place')} value={fd.place} onChange={(v) => setF({ place: v })} />
              </div>
            </div>
          );
        })}

        <div className="section-label">{t('mainInfo')}</div>
        <TextField label={t('occupation')} value={d.occupation} onChange={(v) => up({ occupation: v })} />
        <TextField label={t('education')} value={d.education} onChange={(v) => up({ education: v })} />
        <TextField label={t('residence')} value={d.residence} onChange={(v) => up({ residence: v })} />
        <TextField label={t('bio')} multiline rows={6} value={d.bio} onChange={(v) => up({ bio: v })} />
        <TextField label={t('notes')} multiline value={d.notes} onChange={(v) => up({ notes: v })} />
        <div className="section-label">{t('cardColor')}</div>
        <ColorPicker allowNone value={d.cardColor} onChange={(c) => up({ cardColor: c })} />
      </div>
    </>
  );
}
