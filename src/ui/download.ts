/** Hands a file to the browser's download (MIDI export, saved ideas export). */
export function downloadFile(name: string, data: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  // The click starts the download; the URL can go once it has.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
