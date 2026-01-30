import state, { setIsEditingText, setPendingText } from '../state.js';
import { TextAnnotation } from '../annotations.js';
import { redrawCanvas } from '../canvas-renderer.js';
import { saveToHistory } from '../history.js';
import { CANVAS, TIMEOUTS } from '../constants.js';

// Setup text input event listeners
export function setupTextInput() {
  const textInput = document.getElementById('textInput');

  // Confirm text on Enter
  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmTextInput();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelTextInput();
    }
  });

  // Confirm text on blur (clicking elsewhere)
  textInput.addEventListener('blur', () => {
    // Small delay to allow for intentional cancel
    setTimeout(() => {
      if (state.isEditingText) {
        confirmTextInput();
      }
    }, TIMEOUTS.textBlurDelay);
  });
}

// Show text input at click position
export function showTextInput(coords) {
  const container = document.getElementById('textInputContainer');
  const input = document.getElementById('textInput');

  // Position the input at click location
  // Account for canvas wrapper padding (8px)
  container.style.display = 'block';
  container.style.left = '8px';
  container.style.top = '8px';
  container.style.width = state.canvas.width + 'px';
  container.style.height = state.canvas.height + 'px';

  // Get canvas display scale
  const rect = state.canvas.getBoundingClientRect();
  const displayX = coords.screenX;
  const displayY = coords.screenY;

  input.style.left = displayX + 'px';
  input.style.top = displayY + 'px';
  input.style.fontSize = (state.fontSize * rect.width / state.canvas.width) + 'px';
  input.style.color = state.color;
  input.value = '';

  setIsEditingText(true);
  setPendingText({
    x: coords.x,
    y: coords.y + state.fontSize * CANVAS.textBaselineRatio, // Adjust for baseline
    fontSize: state.fontSize,
    color: state.color
  });

  // Focus input
  setTimeout(() => input.focus(), TIMEOUTS.textInputFocus);

  console.log('[Editor] Text input shown at:', coords.x.toFixed(0), coords.y.toFixed(0));
}

// Confirm and add text annotation
export function confirmTextInput() {
  const input = document.getElementById('textInput');
  const container = document.getElementById('textInputContainer');
  const text = input.value.trim();

  if (text && state.pendingText) {
    const textAnnotation = new TextAnnotation(
      state.pendingText.x,
      state.pendingText.y,
      text,
      state.pendingText.fontSize,
      state.pendingText.color
    );
    state.texts.push(textAnnotation);
    console.log('[Editor] Text added:', text);
    saveToHistory();
    redrawCanvas();
  }

  // Hide input
  container.style.display = 'none';
  input.value = '';
  setIsEditingText(false);
  setPendingText(null);
}

// Cancel text input
export function cancelTextInput() {
  const input = document.getElementById('textInput');
  const container = document.getElementById('textInputContainer');

  container.style.display = 'none';
  input.value = '';
  setIsEditingText(false);
  setPendingText(null);

  console.log('[Editor] Text input cancelled');
}
