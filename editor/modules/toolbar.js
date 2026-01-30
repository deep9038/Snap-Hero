import state, { setColor, setLineWidth, setFontSize, setFilled, setCurrentTool, clearSelection } from './state.js';
import { undo, redo } from './history.js';
import { downloadImage, downloadAsFormat, copyToClipboard } from './export.js';
import { cancelTextInput } from './tools/text-tool.js';

// Setup all toolbar event listeners
export function setupToolbar() {
  // Drawing tool buttons
  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tool = btn.dataset.tool;
      console.log('[Editor] Tool selected:', tool);

      if (tool === 'undo') {
        undo();
        return;
      }

      if (tool === 'redo') {
        redo();
        return;
      }

      // Cancel any pending text input when switching tools
      if (state.isEditingText) {
        cancelTextInput();
      }

      // Clear selection when switching away from select tool
      if (state.currentTool === 'select' && tool !== 'select') {
        clearSelection();
      }

      // Update active state for drawing tools only
      document.querySelectorAll('.tool-btn[data-tool]:not([data-tool="undo"]):not([data-tool="redo"])').forEach(b => {
        b.classList.remove('active');
      });
      btn.classList.add('active');

      setCurrentTool(tool);

      // Toggle toolbar options based on tool
      updateToolbarForTool(tool);
    });
  });

  // Color swatch buttons
  document.querySelectorAll('.color-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      const color = btn.dataset.color;
      handleSetColor(color);

      document.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      document.getElementById('colorPicker').value = color;
    });
  });

  // Color picker
  const colorPicker = document.getElementById('colorPicker');
  colorPicker.addEventListener('input', (e) => {
    handleSetColor(e.target.value);
    document.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('active'));
  });

  // Line width buttons
  document.querySelectorAll('#lineWidthGroup .option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const width = parseInt(btn.dataset.width);
      handleSetLineWidth(width);

      document.querySelectorAll('#lineWidthGroup .option-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Font size buttons
  document.querySelectorAll('#fontSizeGroup .option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const size = parseInt(btn.dataset.size);
      handleSetFontSize(size);

      document.querySelectorAll('#fontSizeGroup .option-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Fill toggle buttons
  document.querySelectorAll('#fillToggleGroup .option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const fill = btn.dataset.fill;
      handleSetFilled(fill === 'filled');

      document.querySelectorAll('#fillToggleGroup .option-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  setupDownloadDropdown();
  setupMobileMenu();
  setupTooltips();

  document.getElementById('copyBtn').addEventListener('click', copyToClipboard);
}

// Setup download dropdown
function setupDownloadDropdown() {
  const dropdown = document.getElementById('downloadDropdown');
  const btn = document.getElementById('downloadBtn');
  const menu = document.getElementById('downloadMenu');
  const qualityGroup = document.getElementById('qualityGroup');
  const qualitySlider = document.getElementById('qualitySlider');
  const qualityValue = document.getElementById('qualityValue');

  let selectedFormat = 'png';

  // Toggle dropdown
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = menu.classList.toggle('visible');
    dropdown.classList.toggle('open', isOpen);
  });

  // Close on outside click
  document.addEventListener('click', () => {
    menu.classList.remove('visible');
    dropdown.classList.remove('open');
  });

  // Prevent dropdown from closing when clicking inside
  menu.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // Format selection
  document.querySelectorAll('.dropdown-item[data-format]').forEach(item => {
    item.addEventListener('click', () => {
      selectedFormat = item.dataset.format;

      // Update active state
      document.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      // Show/hide quality slider
      qualityGroup.style.display = selectedFormat === 'jpeg' ? 'block' : 'none';

      // Trigger download
      const quality = selectedFormat === 'jpeg' ? qualitySlider.value / 100 : 1;
      downloadAsFormat(selectedFormat, quality);
      menu.classList.remove('visible');
      dropdown.classList.remove('open');
    });
  });

  // Quality slider update
  qualitySlider.addEventListener('input', () => {
    qualityValue.textContent = qualitySlider.value;
  });
}

// Setup mobile menu toggle
function setupMobileMenu() {
  const menuBtn = document.getElementById('mobileMenuBtn');
  const toolbar = document.querySelector('.toolbar');

  if (menuBtn) {
    menuBtn.addEventListener('click', () => {
      toolbar.classList.toggle('menu-open');
    });

    // Close menu when clicking outside on mobile
    document.addEventListener('click', (e) => {
      if (!toolbar.contains(e.target)) {
        toolbar.classList.remove('menu-open');
      }
    });
  }
}

// Setup tooltip system
function setupTooltips() {
  const tooltip = document.getElementById('tooltip');
  if (!tooltip) return;

  let showTimeout = null;

  // All elements with data-tooltip attribute
  document.querySelectorAll('[data-tooltip]').forEach(el => {
    el.addEventListener('mouseenter', () => {
      const text = el.dataset.tooltip;
      const shortcut = el.dataset.shortcut;

      // Build tooltip content
      let content = text;
      if (shortcut) {
        content += `<span class="shortcut">${shortcut}</span>`;
      }

      tooltip.innerHTML = content;

      // Position tooltip
      showTimeout = setTimeout(() => {
        const rect = el.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();

        // Position below the element
        let top = rect.bottom + 8;
        let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);

        // Keep tooltip within viewport
        if (left < 8) left = 8;
        if (left + tooltipRect.width > window.innerWidth - 8) {
          left = window.innerWidth - tooltipRect.width - 8;
        }

        // If tooltip would go below viewport, show above
        if (top + tooltipRect.height > window.innerHeight - 8) {
          top = rect.top - tooltipRect.height - 8;
        }

        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;
        tooltip.classList.add('visible');
      }, 400); // Delay before showing
    });

    el.addEventListener('mouseleave', () => {
      clearTimeout(showTimeout);
      tooltip.classList.remove('visible');
    });

    el.addEventListener('click', () => {
      clearTimeout(showTimeout);
      tooltip.classList.remove('visible');
    });
  });
}

// Update toolbar visibility based on selected tool
export function updateToolbarForTool(tool) {
  const lineWidthGroup = document.getElementById('lineWidthGroup');
  const fontSizeGroup = document.getElementById('fontSizeGroup');
  const fillToggleGroup = document.getElementById('fillToggleGroup');

  if (tool === 'text') {
    lineWidthGroup.style.display = 'none';
    fontSizeGroup.style.display = 'flex';
    fillToggleGroup.style.display = 'none';
  } else if (tool === 'rectangle' || tool === 'circle') {
    lineWidthGroup.style.display = 'flex';
    fontSizeGroup.style.display = 'none';
    fillToggleGroup.style.display = 'flex';
  } else if (tool === 'blur' || tool === 'select') {
    lineWidthGroup.style.display = 'none';
    fontSizeGroup.style.display = 'none';
    fillToggleGroup.style.display = 'none';
  } else {
    lineWidthGroup.style.display = 'flex';
    fontSizeGroup.style.display = 'none';
    fillToggleGroup.style.display = 'none';
  }
}

// Internal handlers with logging
function handleSetColor(color) {
  setColor(color);
  console.log('[Editor] Color changed:', color);
}

function handleSetLineWidth(width) {
  setLineWidth(width);
  console.log('[Editor] Line width changed:', width);
}

function handleSetFontSize(size) {
  setFontSize(size);
  console.log('[Editor] Font size changed:', size);
}

function handleSetFilled(filled) {
  setFilled(filled);
  console.log('[Editor] Filled changed:', filled);
}

// Select a tool programmatically
export function selectTool(tool) {
  const btn = document.querySelector(`.tool-btn[data-tool="${tool}"]`);
  if (btn) btn.click();
}
