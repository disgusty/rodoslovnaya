/**
 * Android (Capacitor) implementations of the platform functions.
 * Loaded only on Android (dynamic import from platform.ts), so the desktop bundle does not grow.
 */
import { Capacitor, registerPlugin, SystemBars, type PluginListenerHandle } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';

const TREE = 'tree.json';

export async function loadStore(): Promise<string | null> {
  try {
    const r = await Filesystem.readFile({ path: TREE, directory: Directory.Data, encoding: Encoding.UTF8 });
    return r.data as string;
  } catch {
    return null;
  }
}

/** Written to a temp file first, then renamed, so a crash never leaves a half-written tree. */
export async function saveStore(text: string): Promise<void> {
  await Filesystem.writeFile({ path: TREE + '.tmp', directory: Directory.Data, data: text, encoding: Encoding.UTF8 });
  await Filesystem.rename({ from: TREE + '.tmp', to: TREE, directory: Directory.Data });
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ---------------- opening files (native FilesPlugin, see android/app/src/main/java) ----------------

/** A document copied by the native side into the app cache. */
interface NativeFile {
  name?: string;
  path?: string;
  mimeType?: string;
  error?: string;
  cancelled?: boolean;
}

interface FilesPlugin {
  pick(o: { types: string[]; purpose: 'open' | 'attach' }): Promise<NativeFile>;
  takePending(): Promise<{ file: NativeFile | null }>;
  saveAs(o: { name: string; mimeType: string; path: string }): Promise<{ saved?: boolean; cancelled?: boolean }>;
  addListener(event: 'pendingFile', cb: () => void): Promise<PluginListenerHandle>;
}

const Files = registerPlugin<FilesPlugin>('Files');

/**
 * Reads the cached copy. Streaming it through Capacitor's local server avoids passing the whole
 * file as base64 over the bridge; the Filesystem plugin is the fallback.
 */
async function readNative(f: NativeFile): Promise<File> {
  if (f.error || !f.path) throw new Error(f.error ?? 'no file');
  const uri = 'file://' + f.path;
  let blob: Blob | null = null;
  try {
    const r = await fetch(Capacitor.convertFileSrc(uri));
    if (r.ok) blob = await r.blob();
  } catch {
    /* fall back below */
  }
  if (!blob) {
    const { data } = await Filesystem.readFile({ path: uri });
    blob = typeof data === 'string' ? new Blob([base64ToBytes(data)]) : data;
  }
  return new File([blob], f.name || 'file', { type: f.mimeType || '' });
}

/**
 * System file chooser. `purpose: 'open'` files survive the app being killed while the chooser is
 * open: they come back through onPendingFile after the restart.
 * Resolves null only when the user cancels; read problems are thrown so they can be shown.
 */
export async function pickFile(accept: string | undefined, purpose: 'open' | 'attach'): Promise<File | null> {
  const f = await Files.pick({ types: [accept || '*/*'], purpose });
  return f.cancelled ? null : readNative(f);
}

/** Files from "Open with" / "Share" and chooser results that outlived a restart. */
export function onPendingFile(onFile: (file: File) => void, onError: (message: string) => void) {
  const take = async () => {
    const { file } = await Files.takePending();
    if (!file) return;
    try {
      onFile(await readNative(file));
    } catch (e) {
      onError((e as Error).message);
    }
  };
  Files.addListener('pendingFile', take);
  take();
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const MIME: Record<string, string> = {
  // .ged as octet-stream: file managers then offer this app for it ("Open with")
  ged: 'application/octet-stream',
  png: 'image/png',
  pdf: 'application/pdf',
  odt: 'application/vnd.oasis.opendocument.text',
  json: 'application/json',
};

/**
 * System "Save as" dialog (folder + name). The data is prepared in the app cache first and the
 * native side copies it to the chosen place. Returns false when the user cancels.
 */
export async function saveFile(name: string, data: string | Uint8Array): Promise<boolean> {
  const text = typeof data === 'string';
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  // an ASCII temp name: the real (often Cyrillic) name only goes to the dialog
  const { uri } = await Filesystem.writeFile({
    path: `export/out.${ext}`,
    directory: Directory.Cache,
    data: text ? data : bytesToBase64(data),
    encoding: text ? Encoding.UTF8 : undefined,
    recursive: true,
  });
  const r = await Files.saveAs({ name, mimeType: MIME[ext] ?? 'application/octet-stream', path: decodeURIComponent(uri.replace(/^file:\/\//, '')) });
  return !!r.saved;
}

export async function setFullscreen(on: boolean): Promise<void> {
  if (on) await SystemBars.hide();
  else await SystemBars.show();
}
