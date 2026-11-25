/** Downloads exactly the string it is given, so the file byte-matches the preview (EX-007). */
export function downloadText(filename: string, content: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type SaveOutcome = 'saved' | 'declined' | 'unsupported';

/**
 * Saves a generated file. On a normal site this is a browser download. Inside a Claude artifact
 * preview, pages can't download directly, so the file is offered through the viewer's own save prompt.
 */
export async function saveFile(filename: string, data: string | Blob, mime = 'text/plain'): Promise<SaveOutcome> {
  const claude = (window as unknown as { claude?: { use?: (name: string) => Promise<any> } }).claude;
  if (claude?.use) {
    const downloads = await claude.use('downloads').catch(() => null);
    if (!downloads) return 'unsupported';
    try {
      await downloads.save({ filename, data });
      return 'saved';
    } catch (e) {
      return (e as { code?: string })?.code === 'declined' ? 'declined' : 'unsupported';
    }
  }
  if (typeof data === 'string') downloadText(filename, data, mime);
  else downloadBlob(filename, data);
  return 'saved';
}
