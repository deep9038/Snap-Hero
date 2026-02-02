const captureVisibleBtn = document.getElementById('captureVisibleBtn');
const captureFullPageBtn = document.getElementById('captureFullPageBtn');
const captureAreaBtn = document.getElementById('captureAreaBtn');

// Error type constants (must match background.js)
const CaptureErrorType = {
  PROTECTED_PAGE: 'PROTECTED_PAGE',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  NO_TAB: 'NO_TAB',
  CAPTURE_FAILED: 'CAPTURE_FAILED',
  STORAGE_FAILED: 'STORAGE_FAILED',
  SCRIPT_INJECTION_FAILED: 'SCRIPT_INJECTION_FAILED',
  UNKNOWN: 'UNKNOWN'
};

// Fallback error messages for legacy responses
const FallbackErrorMessages = {
  'NotAllowedError': 'Permission denied. Please check extension permissions.',
  'AbortError': 'Operation was cancelled.',
  'No active tab': 'No active browser tab found.',
  'Cannot capture': 'Cannot capture this type of page.',
  'chrome://': 'Cannot capture browser internal pages.',
  'chrome-extension://': 'Cannot capture extension pages.',
  'about:': 'Cannot capture browser internal pages.',
  'Capture timed out': 'Capture took too long. Please try again.',
  'Failed to capture': 'Could not capture the page. Please try again.'
};

/**
 * Get user-friendly error message from response or error object
 */
function getUserMessage(errorOrResponse) {
  // If response has error and errorType, use the error message directly
  if (errorOrResponse?.error && errorOrResponse?.errorType) {
    return errorOrResponse.error;
  }

  // Fallback to pattern matching for legacy errors
  const msg = errorOrResponse?.message || errorOrResponse?.error || String(errorOrResponse);
  const key = Object.keys(FallbackErrorMessages).find(k => msg.includes(k));
  return key ? FallbackErrorMessages[key] : msg;
}

/**
 * Check if error is retryable
 */
function isRetryableError(errorType) {
  // Don't retry protected page or permission errors
  return ![
    CaptureErrorType.PROTECTED_PAGE,
    CaptureErrorType.PERMISSION_DENIED,
    CaptureErrorType.SCRIPT_INJECTION_FAILED
  ].includes(errorType);
}

// Capture with retry logic
async function captureWithRetry(mode, maxRetries = 2) {
  let lastResponse = null;

  for (let i = 0; i <= maxRetries; i++) {
    try {
      const response = await Promise.race([
        chrome.runtime.sendMessage({ action: 'capture', mode }),
        timeout(10000, 'Capture timed out')
      ]);

      if (response?.success) return response;

      // Check if error is retryable
      if (response?.error) {
        lastResponse = response;
        if (!isRetryableError(response.errorType)) {
          // Don't retry non-retryable errors
          return response;
        }
        throw new Error(response.error);
      }

      // No response - assume success
      return { success: true };
    } catch (e) {
      console.log(`[Popup] Attempt ${i + 1} failed:`, e.message);
      if (i < maxRetries) {
        await delay(500);
      } else {
        // Return last response if available, otherwise throw
        if (lastResponse) return lastResponse;
        throw e;
      }
    }
  }
}

// Capture Visible button handler
captureVisibleBtn.addEventListener('click', async () => {
  console.log('[Popup] Capture Visible clicked');
  clearMessages();
  setButtonLoading(captureVisibleBtn, true);

  try {
    const response = await captureWithRetry('visible');

    if (response.success) {
      console.log('[Popup] Visible capture successful');
      window.close();
    } else if (response.error) {
      // Handle error response from background
      console.error('[Popup] Capture error:', response.errorType, response.error);
      showError(getUserMessage(response), response.errorType);
      setButtonLoading(captureVisibleBtn, false);
    }
  } catch (error) {
    console.error('[Popup] Failed:', error);
    showError(getUserMessage(error), error.errorType);
    setButtonLoading(captureVisibleBtn, false);
  }
});

// Capture Full Page button handler
captureFullPageBtn.addEventListener('click', async () => {
  console.log('[Popup] Capture Full Page clicked');
  clearMessages();
  setButtonLoading(captureFullPageBtn, true);
  showStatus('Capturing full page...');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      showError(getUserMessage({ message: 'No active tab' }));
      setButtonLoading(captureFullPageBtn, false);
      return;
    }

    console.log('[Popup] Active tab:', tab.id, tab.url);

    // Check for protected pages
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
      showError(getUserMessage({ message: tab.url }));
      setButtonLoading(captureFullPageBtn, false);
      return;
    }

    console.log('[Popup] Starting full-page capture for tab:', tab.id);

    const response = await chrome.runtime.sendMessage({
      action: 'capture',
      mode: 'fullPage',
      tabId: tab.id
    });

    console.log('[Popup] Response:', response);

    if (!response) {
      showStatus('Capture started...');
      setTimeout(() => window.close(), 1000);
      return;
    }

    if (response.error) {
      console.error('[Popup] Full page error:', response.errorType, response.error);
      showError(getUserMessage(response), response.errorType);
      setButtonLoading(captureFullPageBtn, false);
    } else if (response.success) {
      console.log('[Popup] Full page capture initiated');
      showStatus('Scrolling and capturing...');
      setTimeout(() => window.close(), 1500);
    }
  } catch (error) {
    console.error('[Popup] Failed:', error);
    showError(getUserMessage(error), error.errorType);
    setButtonLoading(captureFullPageBtn, false);
  }
});

// Capture Area Select button handler
captureAreaBtn.addEventListener('click', async () => {
  console.log('[Popup] Capture Area Select clicked');
  clearMessages();
  setButtonLoading(captureAreaBtn, true);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      showError(getUserMessage({ message: 'No active tab' }));
      setButtonLoading(captureAreaBtn, false);
      return;
    }

    console.log('[Popup] Active tab:', tab.id, tab.url);

    // Check for protected pages
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
      showError(getUserMessage({ message: tab.url }));
      setButtonLoading(captureAreaBtn, false);
      return;
    }

    console.log('[Popup] Starting area select capture for tab:', tab.id);

    const response = await chrome.runtime.sendMessage({
      action: 'capture',
      mode: 'areaSelect',
      tabId: tab.id
    });

    console.log('[Popup] Response:', response);

    if (!response) {
      setTimeout(() => window.close(), 500);
      return;
    }

    if (response.error) {
      console.error('[Popup] Area select error:', response.errorType, response.error);
      showError(getUserMessage(response), response.errorType);
      setButtonLoading(captureAreaBtn, false);
    } else if (response.success) {
      console.log('[Popup] Area select script injected');
      window.close();
    }
  } catch (error) {
    console.error('[Popup] Failed:', error);
    showError(getUserMessage(error), error.errorType);
    setButtonLoading(captureAreaBtn, false);
  }
});

function timeout(ms, message) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function setButtonLoading(button, isLoading) {
  if (isLoading) {
    button.classList.add('loading');
    captureVisibleBtn.disabled = true;
    captureFullPageBtn.disabled = true;
    captureAreaBtn.disabled = true;
  } else {
    button.classList.remove('loading');
    captureVisibleBtn.disabled = false;
    captureFullPageBtn.disabled = false;
    captureAreaBtn.disabled = false;
  }
}

function showError(message, errorType = null) {
  const errorDiv = document.getElementById('error');
  const statusDiv = document.getElementById('status');
  const errorText = errorDiv.querySelector('.message-text');

  statusDiv.classList.remove('visible');

  if (errorText) {
    errorText.textContent = message;
  } else {
    errorDiv.textContent = message;
  }
  errorDiv.classList.add('visible');

  // Log error type for debugging
  if (errorType) {
    console.log('[Popup] Error type:', errorType);
  }
}

function showStatus(message) {
  const statusDiv = document.getElementById('status');
  const errorDiv = document.getElementById('error');
  const statusText = statusDiv.querySelector('.message-text');

  errorDiv.classList.remove('visible');
  if (statusText) {
    statusText.textContent = message;
  } else {
    statusDiv.textContent = message;
  }
  statusDiv.classList.add('visible');
}

function clearMessages() {
  document.getElementById('error').classList.remove('visible');
  document.getElementById('status').classList.remove('visible');
}
