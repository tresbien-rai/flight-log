/** Reading a chosen file and handing a made one back to the pilot. Browser only. */

export function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('The file could not be read.'));
    reader.readAsText(file);
  });
}

/** Starts a download of `text` under `name`. */
export function downloadText(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // The download reads the URL after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function asFile(name: string, text: string, type: string): File | undefined {
  try {
    return new File([text], name, { type });
  } catch {
    return undefined;
  }
}

/** Whether the device's share sheet takes a file of this type (it does on an iPad). */
export function canShareFile(name: string, type: string): boolean {
  const file = asFile(name, '', type);
  try {
    return file !== undefined && navigator.canShare?.({ files: [file] }) === true;
  } catch {
    return false;
  }
}

/** Opens the share sheet with the file. Resolves false when the pilot closes it unused. */
export async function shareText(name: string, text: string, type: string): Promise<boolean> {
  const file = asFile(name, text, type);
  if (!file) throw new Error('This browser cannot share files.');
  try {
    await navigator.share({ files: [file], title: name });
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return false;
    throw error;
  }
}
