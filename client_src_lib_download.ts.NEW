// Helper function for reliable file downloads across environments (including Replit preview)
// Tries multiple strategies: anchor click, blob fallback, and new-tab fallback.

export async function downloadFile(url: string, filename: string) {
  // Strategy 1: direct anchor click. Works best when the browser honors user gestures.
  try {
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    anchor.target = '_self';
    window.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return;
  } catch {
    // proceed to fallback
  }

  // Strategy 2: fetch the file and create a blob URL for download
  try {
    const response = await fetch(url, { method: 'GET', credentials: 'same-origin' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    window.document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
    return;
  } catch {
    // proceed to final fallback
  }

  // Strategy 3: open in new tab as last resort; may require user to allow popups.
  const win = window.open(url, '_blank');
  if (!win) {
    throw new Error('Popup blocked; allow popups or retry the download.');
  }
}
