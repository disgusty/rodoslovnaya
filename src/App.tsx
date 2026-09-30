import { useEffect } from 'react';
import { useStore } from './model/store';
import { saveProject } from './io/fileActions';
import { ConfirmLayer, TooltipLayer } from './ui/components';
import { TopBar } from './panels/TopBar';
import { PersonPanel } from './panels/PersonPanel';
import { BranchDialog, BranchesDrawer, LinkDialog } from './panels/Branches';
import { SettingsDialog } from './panels/SettingsDialog';
import { TreeView } from './tree/TreeView';

export function App() {
  const fullscreen = useStore((s) => s.fullscreen);
  const drawerOpen = useStore((s) => s.drawerOpen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof Element && e.target.closest('input, textarea, select');
      const k = e.key.toLowerCase();
      const st = useStore.getState();
      if (e.ctrlKey && k === 's') {
        e.preventDefault();
        saveProject();
      } else if (!typing && e.ctrlKey && k === 'z' && !e.shiftKey) {
        e.preventDefault();
        st.undo();
      } else if (!typing && e.ctrlKey && (k === 'y' || (k === 'z' && e.shiftKey))) {
        e.preventDefault();
        st.redo();
      } else if (e.key === 'F11') {
        e.preventDefault();
        document.querySelector<HTMLButtonElement>('.corner .fab')?.click();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="shell">
      {!fullscreen && <TopBar />}
      <div className="main">
        {drawerOpen && !fullscreen && <BranchesDrawer />}
        <TreeView />
        <PersonPanel />
      </div>
      <SettingsDialog />
      <BranchDialog />
      <LinkDialog />
      <ConfirmLayer />
      <Snackbar />
      <TooltipLayer />
    </div>
  );
}

function Snackbar() {
  const snack = useStore((s) => s.snack);
  useEffect(() => {
    if (!snack) return;
    const id = setTimeout(() => useStore.setState({ snack: null }), 3500);
    return () => clearTimeout(id);
  }, [snack]);
  return snack ? (
    <div className="snackbar" key={snack.id}>
      {snack.text}
    </div>
  ) : null;
}
