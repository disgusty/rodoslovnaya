import { useMemo, useRef, useState } from 'react';
import { useStore } from '../model/store';
import { fullName, lifeSpan } from '../model/relations';
import * as files from '../io/fileActions';
import { isAndroid } from '../io/platform';
import { useT } from '../ui/i18n';
import { Icon, IconButton, Menu, useMenu, type MenuItem } from '../ui/components';

export function TopBar() {
  const t = useT();
  const name = useStore((s) => s.tree.name);
  const drawerOpen = useStore((s) => s.drawerOpen);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const st = useStore.getState;
  const fileMenu = useMenu();

  // keyboard shortcut hints make no sense on a phone
  const shortcut = (keys: string) => (isAndroid ? undefined : keys);
  const items: MenuItem[] = [
    // on phones undo/redo live here instead of the app bar (see .desktop-only)
    { icon: 'undo', label: t('undo'), trailing: shortcut('Ctrl+Z'), onClick: () => st().undo(), disabled: !canUndo },
    { icon: 'redo', label: t('redo'), trailing: shortcut('Ctrl+Y'), onClick: () => st().redo(), disabled: !canRedo },
    { divider: true, label: '' },
    { icon: 'note_add', label: t('newTree'), onClick: files.newTree },
    { icon: 'folder_open', label: t('openProject'), onClick: files.openProject },
    { icon: 'save', label: t('saveProject'), trailing: shortcut('Ctrl+S'), onClick: files.saveProject },
    { divider: true, label: '' },
    { icon: 'image', label: t('exportPng'), onClick: () => files.exportImage('png') },
    { icon: 'picture_as_pdf', label: t('exportPdf'), onClick: () => files.exportImage('pdf') },
    { divider: true, label: '' },
    { icon: 'auto_stories', label: t('loadDemo'), onClick: files.loadDemo },
  ];

  return (
    <header className="app-bar">
      <div className="brand">
        <Icon name="family_history" />
        <input
          className="brand-title"
          value={name}
          placeholder={t('untitled')}
          onChange={(e) => st().renameTree(e.target.value)}
          title={t('treeName')}
          size={Math.max(8, (name || t('untitled')).length)}
        />
      </div>
      <div className="spacer" />
      <SearchBox />
      <div className="spacer" />
      <IconButton icon="undo" title={t('undo')} className="desktop-only" disabled={!canUndo} onClick={() => st().undo()} />
      <IconButton icon="redo" title={t('redo')} className="desktop-only" disabled={!canRedo} onClick={() => st().redo()} />
      <IconButton icon="person_add" title={t('addPerson')} onClick={() => st().select(st().addPerson(), true)} />
      <IconButton icon="format_paint" title={t('branches')} active={drawerOpen} onClick={() => st().set({ drawerOpen: !drawerOpen })} />
      <IconButton icon="folder" title={t('file')} onClick={fileMenu.open} />
      <IconButton icon="settings" title={t('settings')} onClick={() => st().set({ settingsOpen: true })} />
      <Menu anchor={fileMenu.anchor} onClose={fileMenu.close} items={items} />
    </header>
  );
}

/** Search field: matching cards are highlighted on the tree, Enter/click centers on a person. */
function SearchBox() {
  const t = useT();
  const people = useStore((s) => s.tree.people);
  const search = useStore((s) => s.search);
  const st = useStore.getState;
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return Object.values(people)
      .filter((p) => [p.lastName, p.firstName, p.middleName, p.maidenName].join(' ').toLowerCase().includes(q))
      .slice(0, 12);
  }, [search, people]);

  return (
    <div className="search">
      <Icon name="search" />
      <input
        ref={inputRef}
        value={search}
        placeholder={t('search')}
        onChange={(e) => st().set({ search: e.target.value })}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results[0]) st().focusPerson(results[0].id);
          if (e.key === 'Escape') {
            st().set({ search: '' });
            inputRef.current?.blur();
          }
        }}
      />
      {search && <IconButton icon="close" small title={t('close')} onClick={() => st().set({ search: '' })} />}
      {focused && results.length > 0 && (
        <div className="menu search-results">
          {results.map((p) => (
            <button key={p.id} className="menu-item state" onMouseDown={() => st().focusPerson(p.id)}>
              <span className={`g-dot g-${p.gender}`} />
              <span>{fullName(p, t('unnamed'))}</span>
              <span className="trailing">{lifeSpan(p)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
