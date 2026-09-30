/** Android-only wiring: back button, system bar icon colors, splash screen. */
import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import { App } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { useStore } from '../model/store';
import { setFullscreen } from './platform';

/**
 * Back button closes the topmost thing: an open menu or dialog (they close on Escape),
 * then the element marked `data-back` that comes last in the DOM (editor → panel → drawer),
 * then full screen; otherwise the app goes to the background like any Android app.
 */
function onBack() {
  if (document.querySelector('.scrim, .menu')) {
    // dispatched on the body so it bubbles to the window listeners like a real key press
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return;
  }
  const targets = document.querySelectorAll<HTMLElement>('[data-back]');
  if (targets.length) {
    targets[targets.length - 1].click();
    return;
  }
  const st = useStore.getState();
  if (st.search) st.set({ search: '' });
  else if (st.fullscreen) {
    st.set({ fullscreen: false });
    setFullscreen(false);
  } else App.minimizeApp();
}

/** Status/navigation bar icons: light on a dark app bar, dark on a light one. */
function syncBars() {
  const bar = getComputedStyle(document.documentElement).getPropertyValue('--md-app-bar').trim();
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(bar.slice(i, i + 2), 16));
  const light = (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
  SystemBars.setStyle({ style: light ? SystemBarsStyle.Light : SystemBarsStyle.Dark });
}

export function initMobile() {
  document.documentElement.classList.add('android');
  App.addListener('backButton', onBack);
  syncBars();
  useStore.subscribe((s, prev) => s.settings !== prev.settings && requestAnimationFrame(syncBars));
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => requestAnimationFrame(syncBars));
  // keep the splash until the first frame is painted
  requestAnimationFrame(() => SplashScreen.hide());
}
