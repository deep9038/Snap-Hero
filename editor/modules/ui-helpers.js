// UI helper functions

export function hideLoading() {
  document.getElementById('loading').classList.add('hidden');
}

export function showError(message) {
  const el = document.getElementById('error');
  el.textContent = message;
  el.classList.remove('success', 'warning');
  el.classList.add('visible');

  setTimeout(() => {
    el.classList.remove('visible');
  }, 5000);
}

export function showSuccess(message) {
  const el = document.getElementById('error');
  el.textContent = message;
  el.classList.remove('warning');
  el.classList.add('success', 'visible');

  setTimeout(() => {
    el.classList.remove('visible', 'success');
  }, 3000);
}

export function showWarning(message, duration = 5000) {
  const el = document.getElementById('error');
  el.textContent = message;
  el.classList.remove('success');
  el.classList.add('warning', 'visible');

  setTimeout(() => {
    el.classList.remove('visible', 'warning');
  }, duration);
}

/**
 * Show storage error modal with download and clear options
 * @param {Object} options - Modal configuration
 * @param {string} options.message - Error message to display
 * @param {Function} options.onDownload - Callback when download is clicked
 * @param {Function} options.onClear - Callback when clear is clicked
 * @param {Function} options.onDismiss - Callback when dismissed
 */
export function showStorageErrorModal({ message, onDownload, onClear, onDismiss }) {
  const modal = document.getElementById('storageErrorModal');
  if (!modal) {
    console.error('[UI] Storage error modal not found');
    showError(message);
    return;
  }

  const messageEl = modal.querySelector('.storage-error-message');
  const downloadBtn = modal.querySelector('#storageDownloadBtn');
  const clearBtn = modal.querySelector('#storageClearBtn');
  const dismissBtn = modal.querySelector('#storageDismissBtn');

  if (messageEl) messageEl.textContent = message;

  // Show modal
  modal.style.display = 'flex';

  // Button handlers
  const closeModal = () => {
    modal.style.display = 'none';
    // Remove event listeners
    downloadBtn?.removeEventListener('click', handleDownload);
    clearBtn?.removeEventListener('click', handleClear);
    dismissBtn?.removeEventListener('click', handleDismiss);
  };

  const handleDownload = () => {
    onDownload?.();
    // Don't close modal - let user also clear after download
  };

  const handleClear = async () => {
    await onClear?.();
    closeModal();
  };

  const handleDismiss = () => {
    onDismiss?.();
    closeModal();
  };

  downloadBtn?.addEventListener('click', handleDownload);
  clearBtn?.addEventListener('click', handleClear);
  dismissBtn?.addEventListener('click', handleDismiss);
}

/**
 * Show large image warning with optional scale-down option
 * @param {Object} options - Warning configuration
 * @param {string} options.message - Warning message
 * @param {number} options.size - Image size in bytes
 * @param {Function} options.onContinue - Continue without scaling
 * @param {Function} options.onScaleDown - Scale down image (optional)
 */
export function showLargeImageWarning({ message, size, onContinue, onScaleDown }) {
  const modal = document.getElementById('largeImageModal');
  if (!modal) {
    // Fallback to simple warning
    showWarning(message, 8000);
    onContinue?.();
    return;
  }

  const messageEl = modal.querySelector('.large-image-message');
  const sizeEl = modal.querySelector('.large-image-size');
  const continueBtn = modal.querySelector('#largeImageContinueBtn');
  const scaleBtn = modal.querySelector('#largeImageScaleBtn');

  if (messageEl) messageEl.textContent = message;
  if (sizeEl) sizeEl.textContent = formatBytes(size);

  // Hide scale button if not supported
  if (scaleBtn) {
    scaleBtn.style.display = onScaleDown ? 'block' : 'none';
  }

  // Show modal
  modal.style.display = 'flex';

  const closeModal = () => {
    modal.style.display = 'none';
    continueBtn?.removeEventListener('click', handleContinue);
    scaleBtn?.removeEventListener('click', handleScale);
  };

  const handleContinue = () => {
    closeModal();
    onContinue?.();
  };

  const handleScale = () => {
    closeModal();
    onScaleDown?.();
  };

  continueBtn?.addEventListener('click', handleContinue);
  scaleBtn?.addEventListener('click', handleScale);
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
