/**
 * Platform layer: Electron (window.native from preload.cjs), Android (Capacitor, see android.ts)
 * or a plain browser for `npm run dev`. The rest of the app only uses the functions below.
 */
import { Capacitor } from '@capacitor/core';

export const isAndroid = Capacitor.getPlatform() === 'android';
const android = () => import('./android');

interface FileFilter {
  name: string;
  extensions: string[];
}

interface NativeApi {
  loadStore(): Promise<string | null>;
  saveStore(text: string): Promise<void>;
  openFile(o: { filters: FileFilter[]; binary?: boolean }): Promise<{ name: string; data: string | Uint8Array } | null>;
  saveFile(o: { defaultName: string; filters: FileFilter[]; data: string | Uint8Array }): Promise<string | null>;
  setFullscreen(on: boolean): Promise<boolean>;
  takePendingFile(): Promise<OpenedFile | null>;
  onOpenFile(cb: (file: OpenedFile) => void): void;
}

/** A file handed over by the OS (double-click in Explorer): text for projects, bytes for GEDCOM. */
export interface OpenedFile {
  name: string;
  data: string | Uint8Array;
}

declare global {
  interface Window {
    native?: NativeApi;
  }
}

const native = window.native;
const LS_KEY = 'familytree.data';

// ---------------- autosave ----------------

export async function loadStore(): Promise<string | null> {
  if (native) return native.loadStore();
  if (isAndroid) return (await android()).loadStore();
  try {
    return localStorage.getItem(LS_KEY);
  } catch {
    return null;
  }
}

export async function saveStore(text: string): Promise<void> {
  if (native) return native.saveStore(text);
  if (isAndroid) return (await android()).saveStore(text);
  try {
    localStorage.setItem(LS_KEY, text);
  } catch {
    /* browser quota exceeded — dev mode only */
  }
}

// ---------------- app ----------------

/**
 * Calls `cb` for files handed over by the system: the file the app was started with, files
 * opened later from Explorer / "Open with" / "Share", and (Android) chooser results that
 * arrived after the app had been restarted.
 */
export function onOpenFile(cb: (file: OpenedFile) => void, onError: (message: string) => void) {
  if (native) {
    native.onOpenFile(cb);
    native.takePendingFile().then((f) => f && cb(f));
  } else if (isAndroid) {
    android().then((a) => a.onPendingFile(async (f) => cb({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) }), onError));
  }
}

// ---------------- open / save dialogs ----------------

export async function openBinaryFile(filters: FileFilter[]): Promise<{ name: string; bytes: Uint8Array } | null> {
  if (native) {
    const r = await native.openFile({ filters, binary: true });
    return r && { name: r.name, bytes: r.data as Uint8Array };
  }
  const file = await pickFile(filters, undefined, 'open');
  return file ? { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) } : null;
}

export async function saveTextFile(defaultName: string, filters: FileFilter[], text: string): Promise<boolean> {
  if (native) return !!(await native.saveFile({ defaultName, filters, data: text }));
  if (isAndroid) return (await android()).saveFile(defaultName, text);
  downloadBlob(new Blob([text], { type: 'text/plain' }), defaultName);
  return true;
}

export async function saveBinaryFile(defaultName: string, filters: FileFilter[], blob: Blob): Promise<boolean> {
  if (native) return !!(await native.saveFile({ defaultName, filters, data: new Uint8Array(await blob.arrayBuffer()) }));
  if (isAndroid) return (await android()).saveFile(defaultName, new Uint8Array(await blob.arrayBuffer()));
  downloadBlob(blob, defaultName);
  return true;
}

function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function setFullscreen(on: boolean): Promise<void> {
  if (native) {
    await native.setFullscreen(on);
    return;
  }
  if (isAndroid) return (await android()).setFullscreen(on);
  try {
    if (on && !document.fullscreenElement) await document.documentElement.requestFullscreen();
    if (!on && document.fullscreenElement) await document.exitFullscreen();
  } catch {
    /* not allowed without a user gesture */
  }
}

// ---------------- local files (photos, attachments) ----------------

/** `purpose: 'open'` = a tree to open (survives an app restart on Android), 'attach' = photo/document. */
export async function pickFile(filters?: FileFilter[], accept?: string, purpose: 'open' | 'attach' = 'attach'): Promise<File | null> {
  if (isAndroid) return (await android()).pickFile(accept, purpose);
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.hidden = true;
    input.accept = accept ?? (filters ? filters.flatMap((f) => f.extensions.map((e) => '.' + e)).join(',') : '');
    // kept in the document until the choice is made, so the element can't be collected meanwhile
    document.body.appendChild(input);
    const done = (file: File | null) => {
      input.remove();
      resolve(file);
    };
    input.onchange = () => done(input.files?.[0] ?? null);
    input.oncancel = () => done(null);
    input.click();
  });
}

export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** Decodes a data: URL without fetch() (the CSP does not allow fetching data: URLs). */
export function dataUrlToBytes(url: string): { bytes: Uint8Array<ArrayBuffer>; mime: string } {
  const comma = url.indexOf(',');
  const mime = url.slice(5, comma).split(';')[0] || 'application/octet-stream';
  const bin = atob(url.slice(comma + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime };
}

export function dataUrlToBlob(url: string): Blob {
  const { bytes, mime } = dataUrlToBytes(url);
  return new Blob([bytes], { type: mime });
}

/** Downscales big photos (JPEG) so the project file stays small. */
export async function imageFileToDataUrl(file: Blob, maxSide = 1200): Promise<string> {
  const src = await fileToDataUrl(file);
  const img = new Image();
  img.src = src;
  await img.decode();
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  if (scale === 1 && file.size < 400_000) return src;
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.88);
}
