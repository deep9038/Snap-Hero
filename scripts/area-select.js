(() => {
  // Prevent double injection
  if (document.getElementById('snap-hero-area-select-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'snap-hero-area-select-overlay';
  Object.assign(overlay.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100vw',
    height: '100vh',
    zIndex: '2147483647',
    cursor: 'crosshair',
    margin: '0',
    padding: '0',
    opacity: '0',
    transition: 'opacity 0.15s ease'
  });

  // 4 dim divs surrounding the selection
  const dimTop = createDim();
  const dimBottom = createDim();
  const dimLeft = createDim();
  const dimRight = createDim();

  // Selection border
  const selectionBorder = document.createElement('div');
  Object.assign(selectionBorder.style, {
    position: 'absolute',
    border: '2px solid #4facfe',
    boxShadow: '0 0 0 1px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(255,255,255,0.2)',
    pointerEvents: 'none',
    display: 'none',
    zIndex: '2',
    willChange: 'top, left, width, height',
    opacity: '0',
    transition: 'opacity 0.1s ease'
  });

  // Size indicator
  const sizeIndicator = document.createElement('div');
  Object.assign(sizeIndicator.style, {
    position: 'absolute',
    background: 'rgba(0, 0, 0, 0.75)',
    color: '#fff',
    fontSize: '12px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    padding: '3px 8px',
    borderRadius: '4px',
    pointerEvents: 'none',
    display: 'none',
    zIndex: '3',
    whiteSpace: 'nowrap',
    willChange: 'top, left, width, height',
    opacity: '0',
    transition: 'opacity 0.1s ease'
  });

  // Instructions
  const instructions = document.createElement('div');
  Object.assign(instructions.style, {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    background: 'rgba(0, 0, 0, 0.75)',
    color: '#fff',
    fontSize: '14px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    padding: '12px 20px',
    borderRadius: '8px',
    pointerEvents: 'none',
    zIndex: '3',
    textAlign: 'center',
    lineHeight: '1.5',
    transition: 'opacity 0.15s ease'
  });
  instructions.textContent = 'Click and drag to select area \u00B7 Press Esc to cancel';

  // Initially show full dim
  setDimFull();

  overlay.appendChild(dimTop);
  overlay.appendChild(dimBottom);
  overlay.appendChild(dimLeft);
  overlay.appendChild(dimRight);
  overlay.appendChild(selectionBorder);
  overlay.appendChild(sizeIndicator);
  overlay.appendChild(instructions);
  document.documentElement.appendChild(overlay);

  // Fade in overlay after appending to DOM
  requestAnimationFrame(() => { overlay.style.opacity = '1'; });

  let startX = 0;
  let startY = 0;
  let isDragging = false;
  let rafId = null;

  overlay.addEventListener('mousedown', onMouseDown);
  overlay.addEventListener('mousemove', onMouseMove);
  overlay.addEventListener('mouseup', onMouseUp);
  document.addEventListener('keydown', onKeyDown);

  function createDim() {
    const dim = document.createElement('div');
    Object.assign(dim.style, {
      position: 'absolute',
      background: 'rgba(0, 0, 0, 0.45)',
      pointerEvents: 'none',
      zIndex: '1',
      willChange: 'top, left, width, height'
    });
    return dim;
  }

  function setDimFull() {
    // Cover entire viewport
    Object.assign(dimTop.style, { top: '0', left: '0', width: '100%', height: '100%' });
    Object.assign(dimBottom.style, { top: '0', left: '0', width: '0', height: '0' });
    Object.assign(dimLeft.style, { top: '0', left: '0', width: '0', height: '0' });
    Object.assign(dimRight.style, { top: '0', left: '0', width: '0', height: '0' });
  }

  function updateDims(x, y, w, h) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Top: full width, from top to selection top
    Object.assign(dimTop.style, {
      top: '0', left: '0',
      width: vw + 'px', height: y + 'px'
    });
    // Bottom: full width, from selection bottom to viewport bottom
    Object.assign(dimBottom.style, {
      top: (y + h) + 'px', left: '0',
      width: vw + 'px', height: (vh - y - h) + 'px'
    });
    // Left: from selection top to selection bottom, left edge to selection left
    Object.assign(dimLeft.style, {
      top: y + 'px', left: '0',
      width: x + 'px', height: h + 'px'
    });
    // Right: from selection top to selection bottom, selection right to viewport right
    Object.assign(dimRight.style, {
      top: y + 'px', left: (x + w) + 'px',
      width: (vw - x - w) + 'px', height: h + 'px'
    });
  }

  function onMouseDown(e) {
    e.preventDefault();
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;

    // Fade out instructions
    instructions.style.opacity = '0';
    instructions.style.pointerEvents = 'none';

    // Show selection border and size indicator, then fade them in
    selectionBorder.style.display = 'block';
    sizeIndicator.style.display = 'block';
    requestAnimationFrame(() => {
      selectionBorder.style.opacity = '1';
      sizeIndicator.style.opacity = '1';
    });
  }

  function onMouseMove(e) {
    if (!isDragging) return;
    e.preventDefault();

    const mx = e.clientX;
    const my = e.clientY;

    if (rafId) return; // already have a frame queued
    rafId = requestAnimationFrame(() => {
      rafId = null;

      const x = Math.min(startX, mx);
      const y = Math.min(startY, my);
      const w = Math.abs(mx - startX);
      const h = Math.abs(my - startY);

      // Update selection border
      Object.assign(selectionBorder.style, {
        left: x + 'px', top: y + 'px',
        width: w + 'px', height: h + 'px'
      });

      // Update dim regions
      updateDims(x, y, w, h);

      // Update size indicator
      sizeIndicator.textContent = Math.round(w) + ' \u00D7 ' + Math.round(h);

      // Position size indicator below selection, or above if near bottom
      const indicatorTop = (y + h + 8 + 24 > window.innerHeight) ? y - 28 : y + h + 8;
      Object.assign(sizeIndicator.style, {
        left: x + 'px',
        top: indicatorTop + 'px'
      });
    });
  }

  function onMouseUp(e) {
    if (!isDragging) return;
    isDragging = false;

    const x = Math.min(startX, e.clientX);
    const y = Math.min(startY, e.clientY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);

    // Minimum selection size check
    if (w < 10 || h < 10) {
      cleanup();
      chrome.runtime.sendMessage({ action: 'areaSelectCancelled' });
      return;
    }

    // Remove overlay first so it's not in the screenshot
    cleanup();

    // Wait for overlay removal to render, then send capture message
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        chrome.runtime.sendMessage({
          action: 'areaSelectComplete',
          rect: { x, y, width: w, height: h },
          devicePixelRatio: window.devicePixelRatio || 1
        });
      });
    });
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cleanup();
      chrome.runtime.sendMessage({ action: 'areaSelectCancelled' });
    }
  }

  function cleanup() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    overlay.removeEventListener('mousedown', onMouseDown);
    overlay.removeEventListener('mousemove', onMouseMove);
    overlay.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('keydown', onKeyDown);
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  }
})();
