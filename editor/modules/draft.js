// Draft save/load module for auto-saving work to chrome.storage.local
import state from './state.js';
import { Stroke, Arrow, Rectangle, Ellipse, BlurRegion, TextAnnotation } from './annotations.js';
import { redrawCanvas } from './canvas-renderer.js';

const STORAGE_KEY = 'editorDraft';
const DEBOUNCE_DELAY = 1000;  // 1 second debounce
const AUTO_SAVE_INTERVAL = 30000;  // 30 seconds

// Storage limits (chrome.storage.local has ~10MB limit per item)
const MAX_STORAGE_SIZE = 5 * 1024 * 1024;  // 5MB recommended max for draft
const WARNING_SIZE = 2 * 1024 * 1024;  // 2MB warning threshold

let debounceTimer = null;
let autoSaveIntervalId = null;
let currentImageDataUrl = null;
let lastSaveError = null;
let onStorageErrorCallback = null;

/**
 * Set callback for storage errors (quota exceeded, etc.)
 */
export function setStorageErrorCallback(callback) {
  onStorageErrorCallback = callback;
}

/**
 * Get last save error
 */
export function getLastSaveError() {
  return lastSaveError;
}

/**
 * Clear last save error
 */
export function clearLastSaveError() {
  lastSaveError = null;
}

/**
 * Estimate the size of a data URL in bytes
 */
export function estimateDataUrlSize(dataUrl) {
  if (!dataUrl) return 0;
  // Base64 is ~4/3 the size of binary, but stored as string (2 bytes per char in JS)
  // Rough estimate: string length is close to actual storage size
  return dataUrl.length;
}

/**
 * Check if image size is within recommended limits
 * @returns {{ ok: boolean, size: number, warning: boolean, message?: string }}
 */
export function checkImageSize(imageDataUrl) {
  const size = estimateDataUrlSize(imageDataUrl);

  if (size > MAX_STORAGE_SIZE) {
    return {
      ok: false,
      size,
      warning: true,
      message: `Image is too large (${formatBytes(size)}). Maximum recommended size is ${formatBytes(MAX_STORAGE_SIZE)}.`
    };
  }

  if (size > WARNING_SIZE) {
    return {
      ok: true,
      size,
      warning: true,
      message: `Large image (${formatBytes(size)}). Auto-save may be slower.`
    };
  }

  return { ok: true, size, warning: false };
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Serialize current annotations to plain objects (no class instances)
 */
function serializeAnnotations() {
  return {
    strokes: state.strokes.map(stroke => ({
      type: 'stroke',
      points: [...stroke.points],
      color: stroke.color,
      lineWidth: stroke.lineWidth
    })),
    arrows: state.arrows.map(arrow => ({
      type: 'arrow',
      startX: arrow.startX,
      startY: arrow.startY,
      endX: arrow.endX,
      endY: arrow.endY,
      color: arrow.color,
      lineWidth: arrow.lineWidth
    })),
    rectangles: state.rectangles.map(rect => ({
      type: 'rectangle',
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      color: rect.color,
      lineWidth: rect.lineWidth,
      filled: rect.filled
    })),
    ellipses: state.ellipses.map(ellipse => ({
      type: 'ellipse',
      startX: ellipse.startX,
      startY: ellipse.startY,
      centerX: ellipse.centerX,
      centerY: ellipse.centerY,
      radiusX: ellipse.radiusX,
      radiusY: ellipse.radiusY,
      color: ellipse.color,
      lineWidth: ellipse.lineWidth,
      filled: ellipse.filled
    })),
    blurs: state.blurs.map(blur => ({
      type: 'blur',
      x: blur.x,
      y: blur.y,
      width: blur.width,
      height: blur.height
    })),
    texts: state.texts.map(text => ({
      type: 'text',
      x: text.x,
      y: text.y,
      text: text.text,
      fontSize: text.fontSize,
      color: text.color
    }))
  };
}

/**
 * Check if error is a quota exceeded error
 */
function isQuotaExceededError(error) {
  if (!error) return false;
  const message = error.message || String(error);
  return (
    message.includes('QUOTA_BYTES') ||
    message.includes('quota') ||
    message.includes('QuotaExceededError') ||
    message.includes('storage quota')
  );
}

/**
 * Save draft to chrome.storage.local
 * @returns {{ success: boolean, error?: string, quotaExceeded?: boolean }}
 */
export async function saveDraft(imageDataUrl) {
  if (!imageDataUrl) {
    console.log('[Draft] No image data URL provided, skipping save');
    return { success: false, error: 'No image data' };
  }

  // Check size before attempting save
  const sizeCheck = checkImageSize(imageDataUrl);
  if (!sizeCheck.ok) {
    lastSaveError = { type: 'size', message: sizeCheck.message };
    console.warn('[Draft] Image too large for storage:', sizeCheck.message);
    return { success: false, error: sizeCheck.message, quotaExceeded: true };
  }

  const draft = {
    imageDataUrl: imageDataUrl,
    annotations: serializeAnnotations(),
    lastModified: Date.now()
  };

  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: draft });
    lastSaveError = null;
    console.log('[Draft] Saved draft to storage', {
      size: formatBytes(estimateDataUrlSize(imageDataUrl)),
      strokes: draft.annotations.strokes.length,
      arrows: draft.annotations.arrows.length,
      rectangles: draft.annotations.rectangles.length,
      ellipses: draft.annotations.ellipses.length,
      blurs: draft.annotations.blurs.length,
      texts: draft.annotations.texts.length
    });
    return { success: true };
  } catch (error) {
    console.error('[Draft] Failed to save draft:', error);

    const quotaExceeded = isQuotaExceededError(error);
    lastSaveError = {
      type: quotaExceeded ? 'quota' : 'unknown',
      message: quotaExceeded
        ? 'Storage full. Please download your image and clear the draft.'
        : error.message || 'Failed to save draft'
    };

    // Notify via callback if set
    if (onStorageErrorCallback && quotaExceeded) {
      onStorageErrorCallback(lastSaveError);
    }

    return {
      success: false,
      error: lastSaveError.message,
      quotaExceeded
    };
  }
}

/**
 * Schedule a debounced draft save (waits 1s after last change)
 */
export function scheduleDraftSave(imageDataUrl) {
  currentImageDataUrl = imageDataUrl;

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(async () => {
    const result = await saveDraft(currentImageDataUrl);
    debounceTimer = null;

    // If quota exceeded, notify user
    if (result.quotaExceeded && onStorageErrorCallback) {
      onStorageErrorCallback(lastSaveError);
    }
  }, DEBOUNCE_DELAY);
}

/**
 * Start auto-save interval (every 30 seconds)
 */
export function startAutoSave(imageDataUrl) {
  currentImageDataUrl = imageDataUrl;

  // Clear any existing interval
  stopAutoSave();

  // Check initial size and warn if large
  const sizeCheck = checkImageSize(imageDataUrl);
  if (sizeCheck.warning && sizeCheck.ok) {
    console.warn('[Draft] ' + sizeCheck.message);
  }

  autoSaveIntervalId = setInterval(async () => {
    if (currentImageDataUrl) {
      await saveDraft(currentImageDataUrl);
    }
  }, AUTO_SAVE_INTERVAL);

  console.log('[Draft] Started auto-save interval (30s)');
}

/**
 * Stop auto-save interval and clear debounce timer
 */
export function stopAutoSave() {
  if (autoSaveIntervalId) {
    clearInterval(autoSaveIntervalId);
    autoSaveIntervalId = null;
  }

  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  console.log('[Draft] Stopped auto-save');
}

/**
 * Load draft from chrome.storage.local
 * @returns {Object|null} Draft object or null if not found
 */
export async function loadDraft() {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    const draft = result[STORAGE_KEY];

    if (draft && draft.imageDataUrl && draft.annotations) {
      console.log('[Draft] Found draft from', new Date(draft.lastModified).toLocaleString());
      return draft;
    }

    return null;
  } catch (error) {
    console.error('[Draft] Failed to load draft:', error);
    return null;
  }
}

/**
 * Clear draft from storage and stop auto-save
 */
export async function clearDraft() {
  stopAutoSave();
  currentImageDataUrl = null;
  lastSaveError = null;

  try {
    await chrome.storage.local.remove([STORAGE_KEY]);
    console.log('[Draft] Cleared draft from storage');
    return { success: true };
  } catch (error) {
    console.error('[Draft] Failed to clear draft:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get storage usage info
 * @returns {{ used: number, total: number, percentage: number }}
 */
export async function getStorageInfo() {
  try {
    const usage = await chrome.storage.local.getBytesInUse(null);
    // chrome.storage.local has a 10MB limit for extensions
    const total = 10 * 1024 * 1024;
    return {
      used: usage,
      total,
      percentage: Math.round((usage / total) * 100),
      formatted: {
        used: formatBytes(usage),
        total: formatBytes(total)
      }
    };
  } catch (error) {
    console.error('[Draft] Failed to get storage info:', error);
    return { used: 0, total: 10 * 1024 * 1024, percentage: 0 };
  }
}

/**
 * Restore annotations from plain JSON objects to class instances
 * @param {Object} annotations - Plain object with annotation arrays
 */
export function restoreAnnotations(annotations) {
  // Restore strokes
  state.strokes = (annotations.strokes || []).map(data => {
    const stroke = new Stroke(data.color, data.lineWidth);
    stroke.points = [...data.points];
    return stroke;
  });

  // Restore arrows
  state.arrows = (annotations.arrows || []).map(data => {
    const arrow = new Arrow(data.startX, data.startY, data.color, data.lineWidth);
    arrow.endX = data.endX;
    arrow.endY = data.endY;
    return arrow;
  });

  // Restore rectangles
  state.rectangles = (annotations.rectangles || []).map(data => {
    const rect = new Rectangle(data.x, data.y, data.color, data.lineWidth, data.filled);
    rect.width = data.width;
    rect.height = data.height;
    return rect;
  });

  // Restore ellipses
  state.ellipses = (annotations.ellipses || []).map(data => {
    const ellipse = new Ellipse(data.startX, data.startY, data.color, data.lineWidth, data.filled);
    ellipse.centerX = data.centerX;
    ellipse.centerY = data.centerY;
    ellipse.radiusX = data.radiusX;
    ellipse.radiusY = data.radiusY;
    return ellipse;
  });

  // Restore blurs
  state.blurs = (annotations.blurs || []).map(data => {
    const blur = new BlurRegion(data.x, data.y);
    blur.width = data.width;
    blur.height = data.height;
    return blur;
  });

  // Restore texts
  state.texts = (annotations.texts || []).map(data => {
    return new TextAnnotation(data.x, data.y, data.text, data.fontSize, data.color);
  });

  console.log('[Draft] Restored annotations:', {
    strokes: state.strokes.length,
    arrows: state.arrows.length,
    rectangles: state.rectangles.length,
    ellipses: state.ellipses.length,
    blurs: state.blurs.length,
    texts: state.texts.length
  });

  // Redraw canvas with restored annotations
  redrawCanvas();
}

/**
 * Update the stored image data URL (used when image changes)
 */
export function setDraftImageUrl(imageDataUrl) {
  currentImageDataUrl = imageDataUrl;
}

/**
 * Get the current stored image data URL
 */
export function getDraftImageUrl() {
  return currentImageDataUrl;
}
