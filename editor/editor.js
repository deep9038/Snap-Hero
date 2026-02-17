// Entry point for editor - wires all modules together
import state, { setCanvas, setCtx, setImage } from './modules/state.js';
import { setupToolbar, selectTool } from './modules/toolbar.js';
import { setupTextInput } from './modules/tools/text-tool.js';
import { handleMouseDown, handleMouseMove, handleMouseUp, handleTouchStart, handleTouchMove, handleTouchEnd } from './modules/tools/tool-manager.js';
import { saveToHistory, undo, redo } from './modules/history.js';
import { downloadImage } from './modules/export.js';
import { hideLoading, showError, showWarning, showStorageErrorModal, showLargeImageWarning } from './modules/ui-helpers.js';
import { loadDraft, clearDraft, restoreAnnotations, startAutoSave, setDraftImageUrl, setStorageErrorCallback, checkImageSize } from './modules/draft.js';

// Initialize editor
document.addEventListener('DOMContentLoaded', init);

async function init() {
  setCanvas(document.getElementById('canvas'));
  setCtx(state.canvas.getContext('2d'));

  setupToolbar();
  setupCanvasEvents();
  setupKeyboardShortcuts();
  setupTextInput();
  setupStorageErrorHandler();

  try {
    // Check if there's a new image to load
    const hasNewImage = await checkForNewImage();
    const draft = await loadDraft();

    if (draft && hasNewImage) {
      // Both draft and new image exist - ask user what to do
      showDraftModal(draft, true);
    } else if (draft && !hasNewImage) {
      // Only draft exists - restore it automatically
      await loadImageFromUrl(draft.imageDataUrl);
      restoreAnnotations(draft.annotations);
      saveToHistory();
      startAutoSave(draft.imageDataUrl);
      setDraftImageUrl(draft.imageDataUrl);
      hideLoading();
    } else if (hasNewImage) {
      // Only new image - load it normally
      await loadImage();
      saveToHistory();

      // Check image size and warn if large
      const sizeCheck = checkImageSize(state.image.src);
      if (sizeCheck.warning && sizeCheck.ok) {
        showWarning(sizeCheck.message, 6000);
      } else if (!sizeCheck.ok) {
        showLargeImageWarning({
          message: 'This image is very large and may cause storage issues.',
          size: sizeCheck.size,
          onContinue: () => {
            startAutoSave(state.image.src);
          }
        });
        hideLoading();
        return; // Don't start auto-save yet, wait for user decision
      }

      startAutoSave(state.image.src);
      hideLoading();
    } else {
      // No draft and no new image
      throw new Error('No image data found');
    }
  } catch (error) {
    showError('Failed to load image: ' + error.message);
    hideLoading();
  }
}

/**
 * Check if there's a new image available (URL param or storage)
 */
async function checkForNewImage() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('image')) {
    return true;
  }

  const result = await chrome.storage.local.get(['screenshotData']);
  return !!result.screenshotData;
}

/**
 * Show draft recovery modal
 * @param {Object} draft - The draft object
 * @param {boolean} hasNewImage - Whether a new image is available
 */
function showDraftModal(draft, hasNewImage = false) {
  const modal = document.getElementById('draftModal');
  const draftTime = document.getElementById('draftTime');
  const restoreBtn = document.getElementById('restoreDraftBtn');
  const discardBtn = document.getElementById('discardDraftBtn');

  // Format the timestamp
  const date = new Date(draft.lastModified);
  draftTime.textContent = date.toLocaleString();

  // Hide loading before showing modal
  hideLoading();

  // Show modal
  modal.style.display = 'flex';

  // Handle "Continue Editing" button
  restoreBtn.onclick = async () => {
    modal.style.display = 'none';
    try {
      // Load the draft image
      await loadImageFromUrl(draft.imageDataUrl);
      // Restore annotations
      restoreAnnotations(draft.annotations);
      // Save current state to history
      saveToHistory();
      // Start auto-save with the draft image
      startAutoSave(draft.imageDataUrl);
      setDraftImageUrl(draft.imageDataUrl);
      // Clear the new screenshot data since we're using draft
      await chrome.storage.local.remove(['screenshotData']);
    } catch (error) {
      showError('Failed to restore draft: ' + error.message);
    }
  };

  // Handle "Start Fresh" button
  discardBtn.onclick = async () => {
    modal.style.display = 'none';
    await clearDraft();

    if (hasNewImage) {
      // Load the new image
      try {
        await loadImage();
        saveToHistory();
        startAutoSave(state.image.src);
      } catch (error) {
        showError('Failed to load image: ' + error.message);
      }
    } else {
      showError('No new screenshot available. Please capture a new screenshot.');
    }
  };
}

async function loadImage() {
  const urlParams = new URLSearchParams(window.location.search);
  const imageUrl = urlParams.get('image');

  if (imageUrl) {
    await loadImageFromUrl(decodeURIComponent(imageUrl));
    return;
  }

  const result = await chrome.storage.local.get(['screenshotData']);

  if (result.screenshotData) {
    await loadImageFromUrl(result.screenshotData);
    await chrome.storage.local.remove(['screenshotData']);
    return;
  }

  throw new Error('No image data found');
}

function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      setImage(img);
      state.canvas.width = img.width;
      state.canvas.height = img.height;

      state.ctx.drawImage(img, 0, 0);
      resolve();
    };

    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

function setupCanvasEvents() {
  const canvas = state.canvas;

  canvas.addEventListener('mousedown', handleMouseDown);
  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mouseup', handleMouseUp);
  canvas.addEventListener('mouseleave', handleMouseUp);

  canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
  canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
  canvas.addEventListener('touchend', handleTouchEnd);
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Don't process shortcuts while editing text
    if (state.isEditingText) return;

    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    }

    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      redo();
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      downloadImage();
    }

    if (!e.ctrlKey && !e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 's': selectTool('select'); break;
        case 'p': selectTool('pen'); break;
        case 't': selectTool('text'); break;
        case 'r': selectTool('rectangle'); break;
        case 'c': selectTool('circle'); break;
        case 'a': selectTool('arrow'); break;
        case 'b': selectTool('blur'); break;
      }
    }
  });
}

/**
 * Setup handler for storage errors (quota exceeded)
 */
function setupStorageErrorHandler() {
  setStorageErrorCallback((error) => {
    showStorageErrorModal({
      message: error.message || 'Storage is full. Please download your image and clear the draft.',
      onDownload: () => {
        downloadImage();
      },
      onClear: async () => {
        await clearDraft();
        showWarning('Draft cleared. Auto-save disabled until next capture.');
      },
      onDismiss: () => {
        showWarning('Auto-save paused due to storage limit.');
      }
    });
  });
}
