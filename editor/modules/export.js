import state from './state.js';
import { showSuccess, showError } from './ui-helpers.js';

// Generate formatted timestamp: YYYY-MM-DD-HHMMSS
function getTimestamp() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const time = now.toTimeString().slice(0, 8).replace(/:/g, ''); // HHMMSS
  return `${date}-${time}`;
}

// Download with format options
export function downloadAsFormat(format = 'png', quality = 0.9) {
  console.log('[Editor] Downloading as', format, 'quality:', quality);

  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const extension = format === 'jpeg' ? 'jpg' : 'png';

  const link = document.createElement('a');
  link.download = `screenshot-${getTimestamp()}.${extension}`;
  link.href = state.canvas.toDataURL(mimeType, quality);
  link.click();

  showSuccess(`Saved as ${extension.toUpperCase()}!`);
}

// Download canvas as PNG image (backward compatibility / keyboard shortcut)
export function downloadImage() {
  downloadAsFormat('png');
}

// Copy canvas to clipboard
export async function copyToClipboard() {
  console.log('[Editor] Copying to clipboard...');

  try {
    const blob = await new Promise(resolve => {
      state.canvas.toBlob(resolve, 'image/png');
    });

    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob })
    ]);

    showSuccess('Copied to clipboard!');
  } catch (error) {
    console.error('[Editor] Copy failed:', error);
    showError('Failed to copy: ' + error.message);
  }
}
