(async function fullPageCapture() {
  // Constants
  const CAPTURE_DELAY = 150;
  const LAZY_LOAD_DELAY = 300;
  const MAX_CANVAS_HEIGHT = 16000;
  const MIN_ELEMENT_SIZE = 10;
  const IMAGE_LOAD_TIMEOUT = 1500;

  // Create progress overlay
  const progressOverlay = createProgressOverlay();
  document.body.appendChild(progressOverlay);

  function updateProgress(message, current, total) {
    const text = progressOverlay.querySelector('.progress-text');
    const bar = progressOverlay.querySelector('.progress-bar-fill');
    if (text) text.textContent = message;
    if (bar && total > 0) {
      bar.style.width = `${(current / total) * 100}%`;
    }
  }

  function removeProgressOverlay() {
    if (progressOverlay && progressOverlay.parentNode) {
      progressOverlay.parentNode.removeChild(progressOverlay);
    }
  }

  // Get page dimensions
  const scrollHeight = Math.max(
    document.body.scrollHeight,
    document.documentElement.scrollHeight
  );
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;

  // Check if page exceeds max canvas size
  const effectiveHeight = Math.min(scrollHeight, MAX_CANVAS_HEIGHT);
  if (scrollHeight > effectiveHeight) {
    updateProgress('Warning: Page is very long, some content may be truncated', 0, 0);
    await delay(1500);
  }

  // Detect fixed/sticky elements
  const fixedElements = detectFixedElements();
  // Store original scroll position
  const originalScrollY = window.scrollY;

  // Store fixed elements original state
  const fixedElementsState = fixedElements.map(el => ({
    element: el,
    visibility: el.style.visibility
  }));

  // Scroll to top
  window.scrollTo(0, 0);
  await delay(CAPTURE_DELAY);

  // Calculate number of captures needed
  const totalCaptures = Math.ceil(effectiveHeight / viewportHeight);
  const captures = [];

  updateProgress(`Preparing to capture ${totalCaptures} segments...`, 0, totalCaptures);

  try {
    for (let i = 0; i < totalCaptures; i++) {
      const scrollY = i * viewportHeight;
      const isLastCapture = i === totalCaptures - 1;
      const isFirstCapture = i === 0;

      updateProgress(`Capturing segment ${i + 1} of ${totalCaptures}...`, i, totalCaptures);

      // Scroll to position
      window.scrollTo(0, scrollY);
      await delay(CAPTURE_DELAY);

      // Wait for lazy-loaded content
      await waitForImages();
      await delay(LAZY_LOAD_DELAY);

      // Hide fixed elements for non-first captures
      if (!isFirstCapture) {
        fixedElements.forEach(el => {
          el.style.visibility = 'hidden';
        });
      }

      // Request capture from background script
      const dataUrl = await requestCapture();

      if (!dataUrl) {
        throw new Error(`Failed to capture segment ${i + 1}`);
      }

      // Calculate capture height
      let captureHeight = viewportHeight;
      if (isLastCapture) {
        captureHeight = effectiveHeight - scrollY;
      }

      captures.push({
        dataUrl,
        scrollY,
        captureHeight,
        isPartial: isLastCapture && captureHeight < viewportHeight
      });

      // Restore fixed elements visibility
      if (!isFirstCapture) {
        fixedElements.forEach(el => {
          el.style.visibility = '';
        });
      }
    }

    // Restore everything
    restoreState();

    updateProgress('Stitching images together...', totalCaptures, totalCaptures);

    // Stitch images together and get blob
    const blob = await stitchImages(captures, viewportWidth, effectiveHeight);

    if (!blob) {
      throw new Error('Failed to create final image');
    }

    updateProgress('Finalizing...', totalCaptures, totalCaptures);

    // Convert blob to data URL for editor
    const dataUrl = await blobToDataUrl(blob);

    removeProgressOverlay();

    // Send to background to open in editor
    chrome.runtime.sendMessage({
      action: 'fullPageComplete',
      dataUrl: dataUrl
    });

  } catch (error) {
    restoreState();
    removeProgressOverlay();

    // Show user-friendly error
    const userMessage = getUserMessage(error);
    alert('Full page capture failed: ' + userMessage);

    chrome.runtime.sendMessage({
      action: 'fullPageError',
      error: error.message
    });
  }

  function restoreState() {
    fixedElementsState.forEach(state => {
      state.element.style.visibility = state.visibility;
    });
    window.scrollTo(0, originalScrollY);
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function detectFixedElements() {
    const fixed = [];
    const elements = document.querySelectorAll('*');

    elements.forEach(el => {
      try {
        const style = window.getComputedStyle(el);
        if (style.position === 'fixed' || style.position === 'sticky') {
          const rect = el.getBoundingClientRect();
          if (rect.height > MIN_ELEMENT_SIZE && rect.width > MIN_ELEMENT_SIZE && style.display !== 'none') {
            fixed.push(el);
          }
        }
      } catch (e) {}
    });

    return fixed;
  }

  function waitForImages() {
    return new Promise(resolve => {
      const images = document.querySelectorAll('img');
      let pending = 0;

      images.forEach(img => {
        if (!img.complete) {
          pending++;
          const done = () => {
            pending--;
            if (pending === 0) resolve();
          };
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
        }
      });

      if (pending === 0) {
        resolve();
      } else {
        setTimeout(resolve, IMAGE_LOAD_TIMEOUT);
      }
    });
  }




  

  function requestCapture() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'captureSegment' }, response => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response && response.error) {
          reject(new Error(response.error));
        } else if (response && response.dataUrl) {
          resolve(response.dataUrl);
        } else {
          reject(new Error('Invalid capture response'));
        }
      });
  
  
    });
  }

  async function stitchImages(captures, width, totalHeight) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = totalHeight;

    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    for (let i = 0; i < captures.length; i++) {
      const capture = captures[i];

      const img = await loadImage(capture.dataUrl);

      const scale = img.width / width;
      const sourceY = capture.isPartial ? img.height - (capture.captureHeight * scale) : 0;
      const sourceHeight = capture.captureHeight * scale;

      ctx.drawImage(
        img,
        0, sourceY,
        img.width, sourceHeight,
        0, capture.scrollY,
        width, capture.captureHeight
      );
    }

    // Convert canvas to blob (more reliable than toDataURL for large images)
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) {
          resolve(blob);
        } else {
          // Try JPEG if PNG fails
          canvas.toBlob(jpegBlob => {
            if (jpegBlob) {
              resolve(jpegBlob);
            } else {
              reject(new Error('Failed to convert canvas to blob'));
            }
          }, 'image/jpeg', 0.92);
        }
      }, 'image/png');
    });
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = dataUrl;
    });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function createProgressOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'snap-hero-progress';
    overlay.innerHTML = `
      <div style="
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      ">
        <div style="
          background: white;
          padding: 24px 32px;
          border-radius: 12px;
          text-align: center;
          min-width: 280px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        ">
          <div style="font-size: 18px; font-weight: 600; margin-bottom: 16px; color: #333;">
            Snap Hero
          </div>
          <div class="progress-text" style="font-size: 14px; color: #666; margin-bottom: 12px;">
            Preparing capture...
          </div>
          <div style="
            background: #e0e0e0;
            height: 6px;
            border-radius: 3px;
            overflow: hidden;
          ">
            <div class="progress-bar-fill" style="
              background: linear-gradient(90deg, #4f46e5, #7c3aed);
              height: 100%;
              width: 0%;
              transition: width 0.3s ease;
            "></div>
          </div>
        </div>
      </div>
    `;
    return overlay;
  }

  function getUserMessage(error) {
    const ErrorMessages = {
      'Failed to load image': 'Could not load a captured segment.',
      'Failed to create final image': 'Could not create the final image. The page may be too large.',
      'Invalid capture response': 'Received invalid data. Please try again.',
      'Failed to get canvas context': 'Browser could not create the image canvas.',
      'Failed to convert canvas to blob': 'Could not save the final image.'
    };

    const msg = error?.message || String(error);
    const key = Object.keys(ErrorMessages).find(k => msg.includes(k));
    return key ? ErrorMessages[key] : msg;
  }
})();
