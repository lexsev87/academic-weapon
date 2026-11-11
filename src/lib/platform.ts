/* Where the app runs: the Mac app (Electron) or the web beta (a claude.ai Artifact).
   Both are built from the same code; `npm run web` sets VITE_TARGET=web. */

export const isWeb = import.meta.env.VITE_TARGET === 'web';

/* Browser storage can be missing or throw (private windows, blocked site data,
   previews): every read and write goes through these, and the app keeps working. */
export function readStore(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
/** False when the value could not be saved (storage full, blocked or missing). */
export function writeStore(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false; // the app keeps running on in-memory state
  }
}

type ClaudeWindow = Window & { claude?: { use?: (name: string) => Promise<unknown> } };

/** True inside a claude.ai Artifact viewer; false on the public site and in the Mac app. */
export const inClaudeViewer = () => typeof (window as ClaudeWindow).claude?.use === 'function';

/* claude.ai runtime capabilities, reached only through `claude.use(name)`.
   Resolves null outside a viewer, or where this view can't run the capability. */
export async function claudeUse<T>(name: string): Promise<T | null> {
  try {
    const use = (window as ClaudeWindow).claude?.use;
    return use ? ((await use(name)) as T | null) : null;
  } catch {
    return null;
  }
}

/** Saves a generated file: the platform's save prompt on the web, a plain download on the Mac. */
export async function saveFile(filename: string, data: string, mime: string): Promise<'saved' | 'declined' | 'unavailable'> {
  // Inside claude.ai direct downloads are blocked, so the platform's save prompt is used;
  // on the public site (GitHub Pages) and the Mac app a plain download works.
  if (isWeb && inClaudeViewer()) {
    const downloads = await claudeUse<{ save: (r: { filename: string; data: string }) => Promise<unknown> }>('downloads');
    if (!downloads) return 'unavailable';
    try {
      await downloads.save({ filename, data });
      return 'saved';
    } catch (e) {
      return (e as { code?: string })?.code === 'declined' ? 'declined' : 'unavailable';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: mime }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return 'saved';
}

/** Opens claude.ai's own comment composer on an element (web beta feedback). */
export async function openFeedback(el: Element): Promise<boolean> {
  const comments = await claudeUse<{ openComposer: (t: { element: Element }) => Promise<{ opened: boolean }> }>('comments');
  if (!comments) return false;
  try {
    return (await comments.openComposer({ element: el })).opened;
  } catch {
    return false;
  }
}

/** Asks for notification permission without ever throwing (sandboxed frames refuse it). */
export async function requestNotifications(): Promise<boolean> {
  try {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}
