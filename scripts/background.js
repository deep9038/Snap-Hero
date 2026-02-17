// Error types for better error handling
const CaptureError = {
  PROTECTED_PAGE: 'PROTECTED_PAGE',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  NO_TAB: 'NO_TAB',
  CAPTURE_FAILED: 'CAPTURE_FAILED',
  STORAGE_FAILED: 'STORAGE_FAILED',
  SCRIPT_INJECTION_FAILED: 'SCRIPT_INJECTION_FAILED',
  UNKNOWN: 'UNKNOWN'
};

// User-friendly error messages
const ErrorMessages = {
  [CaptureError.PROTECTED_PAGE]: 'Cannot capture this page. Browser internal pages and extension pages are protected.',
  [CaptureError.PERMISSION_DENIED]: 'Permission denied. The page may be blocking screenshots.',
  [CaptureError.NO_TAB]: 'No active browser tab found.',
  [CaptureError.CAPTURE_FAILED]: 'Failed to capture screenshot. Please try again.',
  [CaptureError.STORAGE_FAILED]: 'Failed to save screenshot. Storage may be full.',
  [CaptureError.SCRIPT_INJECTION_FAILED]: 'Cannot capture this page. Script injection is not allowed.',
  [CaptureError.UNKNOWN]: 'An unexpected error occurred. Please try again.'
};

/**
 * Check if a URL is a protected page that cannot be captured
 */
function isProtectedUrl(url) {
  if (!url) return true;
  const protectedPrefixes = [
    'chrome://',
    'chrome-extension://',
    'about:',
    'edge://',
    'brave://',
    'opera://',
    'vivaldi://',
    'moz-extension://',
    'file://', // Local files often have restrictions
    'devtools://',
    'view-source:'
  ];
  return protectedPrefixes.some(prefix => url.startsWith(prefix));
}

/**
 * Classify an error into a CaptureError type
 */
function classifyError(error, context = {}) {
  const message = error?.message || String(error);

  // Check for protected page errors
  if (message.includes('Cannot access') ||
      message.includes('not allowed') ||
      message.includes('cannot be scripted') ||
      context.isProtectedUrl) {
    return CaptureError.PROTECTED_PAGE;
  }

  // Check for permission errors
  if (message.includes('NotAllowedError') ||
      message.includes('Permission denied') ||
      message.includes('not permitted')) {
    return CaptureError.PERMISSION_DENIED;
  }

  // Check for no tab errors
  if (message.includes('No active tab') || context.noTab) {
    return CaptureError.NO_TAB;
  }

  // Check for script injection errors
  if (message.includes('Cannot access') && context.action === 'inject') {
    return CaptureError.SCRIPT_INJECTION_FAILED;
  }

  // Check for storage errors
  if (message.includes('QUOTA') || message.includes('storage')) {
    return CaptureError.STORAGE_FAILED;
  }

  return CaptureError.UNKNOWN;
}

/**
 * Create an error response object
 */
function createErrorResponse(errorType, originalError = null) {
  return {
    error: ErrorMessages[errorType] || ErrorMessages[CaptureError.UNKNOWN],
    errorType,
    details: originalError?.message || null
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Unified capture action with mode
  if (message.action === 'capture') {
    if (message.mode === 'visible') {
      captureVisible(sendResponse);
    } else if (message.mode === 'fullPage') {
      captureFullPage(message.tabId, sendResponse);
    } else if (message.mode === 'areaSelect') {
      captureAreaSelect(message.tabId, sendResponse);
    } else {
      sendResponse(createErrorResponse(CaptureError.UNKNOWN, { message: 'Unknown capture mode: ' + message.mode }));
    }
    return true;
  }

  // Segment capture (called from full-page.js)
  if (message.action === 'captureSegment') {
    captureSegment(sender.tab.windowId, sendResponse);
    return true;
  }

  // Full page capture complete - open in editor
  if (message.action === 'fullPageComplete') {
    if (message.dataUrl) {
      openEditor(message.dataUrl);
    }
    return false;
  }

  // Full page capture error
  if (message.action === 'fullPageError') {
    return false;
  }

  // Area select complete - crop and open editor
  if (message.action === 'areaSelectComplete') {
    cropAndOpenEditor(sender.tab.windowId, message.rect, message.devicePixelRatio);
    return false;
  }

  // Area select cancelled
  if (message.action === 'areaSelectCancelled') {
    return false;
  }
});

async function captureVisible(sendResponse) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      sendResponse(createErrorResponse(CaptureError.NO_TAB));
      return;
    }

    // Check for protected URLs before attempting capture
    if (isProtectedUrl(tab.url)) {
      sendResponse(createErrorResponse(CaptureError.PROTECTED_PAGE));
      return;
    }

    chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }, async (dataUrl) => {
      if (chrome.runtime.lastError) {
        const errorMessage = chrome.runtime.lastError.message;

        const errorType = classifyError({ message: errorMessage });
        sendResponse(createErrorResponse(errorType, { message: errorMessage }));
        return;
      }

      if (!dataUrl) {
        sendResponse(createErrorResponse(CaptureError.CAPTURE_FAILED, { message: 'Screenshot capture returned empty' }));
        return;
      }

      // Open in editor
      const result = await openEditor(dataUrl);
      if (result.success) {
        sendResponse({ success: true });
      } else {
        sendResponse(createErrorResponse(CaptureError.STORAGE_FAILED, { message: result.error }));
      }
    });
  } catch (error) {
    const errorType = classifyError(error);
    sendResponse(createErrorResponse(errorType, error));
  }
}

async function captureFullPage(tabId, sendResponse) {
  try {
    // Get tab info to check URL
    const tab = await chrome.tabs.get(tabId);

    if (isProtectedUrl(tab.url)) {
      sendResponse(createErrorResponse(CaptureError.PROTECTED_PAGE));
      return;
    }

    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['scripts/full-page.js']
    });

    sendResponse({ success: true });
  } catch (error) {
    const errorType = classifyError(error, { action: 'inject', isProtectedUrl: true });
    sendResponse(createErrorResponse(errorType, error));
  }
}

function captureSegment(windowId, sendResponse) {
  try {
    chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        const errorMessage = chrome.runtime.lastError.message;

        const errorType = classifyError({ message: errorMessage });
        sendResponse(createErrorResponse(errorType, { message: errorMessage }));
        return;
      }

      if (!dataUrl) {
        sendResponse(createErrorResponse(CaptureError.CAPTURE_FAILED, { message: 'Segment capture returned empty' }));
        return;
      }

      sendResponse({ dataUrl: dataUrl });
    });
  } catch (error) {
    const errorType = classifyError(error);
    sendResponse(createErrorResponse(errorType, error));
  }
}

async function captureAreaSelect(tabId, sendResponse) {
  try {
    const tab = await chrome.tabs.get(tabId);

    if (isProtectedUrl(tab.url)) {
      sendResponse(createErrorResponse(CaptureError.PROTECTED_PAGE));
      return;
    }

    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['scripts/area-select.js']
    });

    sendResponse({ success: true });
  } catch (error) {
    const errorType = classifyError(error, { action: 'inject', isProtectedUrl: true });
    sendResponse(createErrorResponse(errorType, error));
  }
}

async function cropAndOpenEditor(windowId, rect, dpr) {
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!result) {
          reject(new Error('Screenshot capture returned empty'));
          return;
        }
        resolve(result);
      });
    });

    // Convert dataUrl to ImageBitmap via fetch + blob
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const imageBitmap = await createImageBitmap(blob);

    // Calculate crop coordinates (CSS pixels → device pixels)
    const cropX = Math.round(rect.x * dpr);
    const cropY = Math.round(rect.y * dpr);
    const cropW = Math.round(rect.width * dpr);
    const cropH = Math.round(rect.height * dpr);

    // Clamp to image bounds
    const clampedX = Math.max(0, Math.min(cropX, imageBitmap.width - 1));
    const clampedY = Math.max(0, Math.min(cropY, imageBitmap.height - 1));
    const clampedW = Math.min(cropW, imageBitmap.width - clampedX);
    const clampedH = Math.min(cropH, imageBitmap.height - clampedY);

    // Use OffscreenCanvas to crop
    const canvas = new OffscreenCanvas(clampedW, clampedH);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imageBitmap, clampedX, clampedY, clampedW, clampedH, 0, 0, clampedW, clampedH);

    // Convert back to dataUrl
    const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });
    const arrayBuffer = await croppedBlob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binaryString = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binaryString += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    const croppedDataUrl = 'data:image/png;base64,' + btoa(binaryString);

    // Open in editor
    await openEditor(croppedDataUrl);
  } catch {
    // Crop and open editor failed
  }
}

async function openEditor(dataUrl) {
  try {
    // Store screenshot data
    await chrome.storage.local.set({ screenshotData: dataUrl });

    // Open editor page
    const editorUrl = chrome.runtime.getURL('editor/editor.html');
    await chrome.tabs.create({ url: editorUrl });

    return { success: true };
  } catch (error) {
    // Check if it's a storage quota error
    if (error.message && (error.message.includes('QUOTA') || error.message.includes('quota'))) {
      // Try to open editor anyway - it might be able to recover
      try {
        const editorUrl = chrome.runtime.getURL('editor/editor.html');
        await chrome.tabs.create({ url: editorUrl });
      } catch {
        // Fallback: open raw image as data URL (may not work for large images)
        try {
          await chrome.tabs.create({ url: dataUrl });
        } catch {
          // Nothing we can do
        }
      }
      return { success: false, error: 'Storage quota exceeded' };
    }

    // Fallback: try to open raw image
    try {
      await chrome.tabs.create({ url: dataUrl });
      return { success: true };
    } catch {
      return { success: false, error: error.message || 'Failed to open editor' };
    }
  }
}
