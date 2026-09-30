import { createRoot } from 'react-dom/client';
// Roboto: only the subsets the app needs (unicode-range makes the browser load them on demand)
import '@fontsource/roboto/latin-400.css';
import '@fontsource/roboto/latin-500.css';
import '@fontsource/roboto/latin-700.css';
import '@fontsource/roboto/latin-ext-400.css';
import '@fontsource/roboto/latin-ext-500.css';
import '@fontsource/roboto/latin-ext-700.css';
import '@fontsource/roboto/cyrillic-400.css';
import '@fontsource/roboto/cyrillic-500.css';
import '@fontsource/roboto/cyrillic-700.css';
import 'material-symbols/outlined.css';
import './styles/base.css';
import './styles/components.css';
import './styles/panels.css';
import './styles/tree.css';
import './styles/w95.css';
import './styles/mobile.css';
import { App } from './App';
import { initPersistence, useStore } from './model/store';
import { applyTheme } from './ui/theme';
import { isAndroid, onOpenFile } from './io/platform';
import { openExternalFile, showFileError } from './io/fileActions';

// The palette is applied outside React, synchronously on every settings change,
// so components (including the canvas renderer) always read up-to-date CSS variables.
const darkMedia = window.matchMedia('(prefers-color-scheme: dark)');
function syncTheme() {
  const { theme, design, accent } = useStore.getState().settings;
  applyTheme(design, accent, theme === 'dark' || (theme === 'system' && darkMedia.matches));
  document.documentElement.lang = useStore.getState().settings.lang;
}
syncTheme();
useStore.subscribe((s, prev) => s.settings !== prev.settings && syncTheme());
darkMedia.addEventListener('change', syncTheme);

// window title follows the tree name
const syncTitle = () => (document.title = [useStore.getState().tree.name, 'Родословная'].filter(Boolean).join(' — '));
useStore.subscribe((s, prev) => s.tree.name !== prev.tree.name && syncTitle());

// files opened from Explorer are handled once the saved tree is loaded (so "replace?" asks correctly)
initPersistence().then(() => {
  syncTitle();
  onOpenFile(openExternalFile, (message) => showFileError(new Error(message)));
});
if (isAndroid) import('./io/mobile').then((m) => m.initMobile());
createRoot(document.getElementById('root')!).render(<App />);
