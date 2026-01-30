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
  console.log('[Background] Message received:', message.action, message.mode || '');

  // Unified capture action with mode
  if (message.action === 'capture') {
    if (message.mode === 'visible') {
      console.log('[Background] Mode: visible');
      captureVisible(sendResponse);
    } else if (message.mode === 'fullPage') {
      console.log('[Background] Mode: fullPage');
      captureFullPage(message.tabId, sendResponse);
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
    console.log('[Background] Full page capture complete');
    if (message.dataUrl) {
      openEditor(message.dataUrl).then(result => {
        if (!result.success) {
          // Can't send response here as popup may be closed
          console.error('[Background] Failed to open editor:', result.error);
        }
      });
    }
    return false;
  }

  // Full page capture error
  if (message.action === 'fullPageError') {
    console.error('[Background] Full page capture error:', message.error);
    return false;
  }
});

async function captureVisible(sendResponse) {
  console.log('[Background] Capturing visible area');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      console.error('[Background] No active tab found');
      sendResponse(createErrorResponse(CaptureError.NO_TAB));
      return;
    }

    // Check for protected URLs before attempting capture
    if (isProtectedUrl(tab.url)) {
      console.error('[Background] Protected URL:', tab.url);
      sendResponse(createErrorResponse(CaptureError.PROTECTED_PAGE));
      return;
    }

    console.log('[Background] Capturing tab:', tab.id, 'URL:', tab.url?.substring(0, 50));

    chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }, async (dataUrl) => {
      if (chrome.runtime.lastError) {
        const errorMessage = chrome.runtime.lastError.message;
        console.error('[Background] Capture failed:', errorMessage);

        const errorType = classifyError({ message: errorMessage });
        sendResponse(createErrorResponse(errorType, { message: errorMessage }));
        return;
      }

      if (!dataUrl) {
        console.error('[Background] No data URL returned');
        sendResponse(createErrorResponse(CaptureError.CAPTURE_FAILED, { message: 'Screenshot capture returned empty' }));
        return;
      }

      console.log('[Background] Screenshot captured, length:', dataUrl.length);

      // Check image size
      const sizeInMB = dataUrl.length / (1024 * 1024);
      if (sizeInMB > 10) {
        console.warn('[Background] Very large screenshot:', sizeInMB.toFixed(2), 'MB');
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
    console.error('[Background] Unexpected error:', error);
    const errorType = classifyError(error);
    sendResponse(createErrorResponse(errorType, error));
  }
}

async function captureFullPage(tabId, sendResponse) {
  console.log('[Background] Starting full-page capture for tab:', tabId);

  try {
    // Get tab info to check URL
    const tab = await chrome.tabs.get(tabId);

    if (isProtectedUrl(tab.url)) {
      console.error('[Background] Protected URL:', tab.url);
      sendResponse(createErrorResponse(CaptureError.PROTECTED_PAGE));
      return;
    }

    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['scripts/full-page.js']
    });

    console.log('[Background] Full-page script injected successfully');
    sendResponse({ success: true });
  } catch (error) {
    console.error('[Background] Failed to inject script:', error);

    const errorType = classifyError(error, { action: 'inject', isProtectedUrl: true });
    sendResponse(createErrorResponse(errorType, error));
  }
}

function captureSegment(windowId, sendResponse) {
  console.log('[Background] Capturing segment for window:', windowId);

  try {
    chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        const errorMessage = chrome.runtime.lastError.message;
        console.error('[Background] Segment capture failed:', errorMessage);

        const errorType = classifyError({ message: errorMessage });
        sendResponse(createErrorResponse(errorType, { message: errorMessage }));
        return;
      }

      if (!dataUrl) {
        sendResponse(createErrorResponse(CaptureError.CAPTURE_FAILED, { message: 'Segment capture returned empty' }));
        return;
      }

      console.log('[Background] Segment captured, length:', dataUrl.length);
      sendResponse({ dataUrl: dataUrl });
    });
  } catch (error) {
    console.error('[Background] Segment capture error:', error);
    const errorType = classifyError(error);
    sendResponse(createErrorResponse(errorType, error));
  }
}

async function openEditor(dataUrl) {
  console.log('[Background] Opening editor...');

  try {
    // Store screenshot data
    await chrome.storage.local.set({ screenshotData: dataUrl });
    console.log('[Background] Screenshot saved to storage');

    // Open editor page
    const editorUrl = chrome.runtime.getURL('editor/editor.html');
    const tab = await chrome.tabs.create({ url: editorUrl });
    console.log('[Background] Editor opened in tab:', tab.id);

    return { success: true };
  } catch (error) {
    console.error('[Background] Failed to open editor:', error);

    // Check if it's a storage quota error
    if (error.message && (error.message.includes('QUOTA') || error.message.includes('quota'))) {
      console.error('[Background] Storage quota exceeded');
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
