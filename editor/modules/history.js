import state, {
  setStrokes, setArrows, setRectangles, setEllipses, setBlurs, setTexts,
  setHistory, setHistoryIndex, clearSelection
} from './state.js';
import { Stroke, Arrow, Rectangle, Ellipse, BlurRegion, TextAnnotation } from './annotations.js';
import { redrawCanvas } from './canvas-renderer.js';
import { HISTORY } from './constants.js';
import { scheduleDraftSave } from './draft.js';

// Save current state to history
export function saveToHistory() {
  if (state.historyIndex < state.history.length - 1) {
    state.history = state.history.slice(0, state.historyIndex + 1);
  }

  const historyEntry = {
    strokes: state.strokes.map(stroke => {
      const copy = new Stroke(stroke.color, stroke.lineWidth);
      copy.points = [...stroke.points];
      return copy;
    }),
    arrows: state.arrows.map(arrow => {
      const copy = new Arrow(arrow.startX, arrow.startY, arrow.color, arrow.lineWidth);
      copy.endX = arrow.endX;
      copy.endY = arrow.endY;
      return copy;
    }),
    rectangles: state.rectangles.map(rect => {
      const copy = new Rectangle(rect.x, rect.y, rect.color, rect.lineWidth, rect.filled);
      copy.width = rect.width;
      copy.height = rect.height;
      return copy;
    }),
    ellipses: state.ellipses.map(ellipse => {
      const copy = new Ellipse(ellipse.startX, ellipse.startY, ellipse.color, ellipse.lineWidth, ellipse.filled);
      copy.centerX = ellipse.centerX;
      copy.centerY = ellipse.centerY;
      copy.radiusX = ellipse.radiusX;
      copy.radiusY = ellipse.radiusY;
      return copy;
    }),
    blurs: state.blurs.map(blur => {
      const copy = new BlurRegion(blur.x, blur.y);
      copy.width = blur.width;
      copy.height = blur.height;
      return copy;
    }),
    texts: state.texts.map(text => {
      return new TextAnnotation(text.x, text.y, text.text, text.fontSize, text.color);
    })
  };

  state.history.push(historyEntry);
  state.historyIndex = state.history.length - 1;

  if (state.history.length > HISTORY.maxEntries) {
    state.history.shift();
    state.historyIndex--;
  }

  console.log('[Editor] Saved to history, index:', state.historyIndex,
    'strokes:', state.strokes.length, 'arrows:', state.arrows.length,
    'rectangles:', state.rectangles.length, 'ellipses:', state.ellipses.length,
    'blurs:', state.blurs.length, 'texts:', state.texts.length);

  // Schedule debounced draft save
  if (state.image) {
    scheduleDraftSave(state.image.src);
  }
}

// Undo last action
export function undo() {
  if (state.historyIndex > 0) {
    state.historyIndex--;
    restoreFromHistory();
    console.log('[Editor] Undo, index:', state.historyIndex);
  } else {
    console.log('[Editor] Nothing to undo');
  }
}

// Redo last undone action
export function redo() {
  if (state.historyIndex < state.history.length - 1) {
    state.historyIndex++;
    restoreFromHistory();
    console.log('[Editor] Redo, index:', state.historyIndex);
  } else {
    console.log('[Editor] Nothing to redo');
  }
}

// Restore state from history entry
function restoreFromHistory() {
  // Clear any active selection when restoring history
  clearSelection();

  const entry = state.history[state.historyIndex];

  state.strokes = entry.strokes.map(stroke => {
    const copy = new Stroke(stroke.color, stroke.lineWidth);
    copy.points = [...stroke.points];
    return copy;
  });

  state.arrows = entry.arrows.map(arrow => {
    const copy = new Arrow(arrow.startX, arrow.startY, arrow.color, arrow.lineWidth);
    copy.endX = arrow.endX;
    copy.endY = arrow.endY;
    return copy;
  });

  state.rectangles = (entry.rectangles || []).map(rect => {
    const copy = new Rectangle(rect.x, rect.y, rect.color, rect.lineWidth, rect.filled);
    copy.width = rect.width;
    copy.height = rect.height;
    return copy;
  });

  state.ellipses = (entry.ellipses || []).map(ellipse => {
    const copy = new Ellipse(ellipse.startX, ellipse.startY, ellipse.color, ellipse.lineWidth, ellipse.filled);
    copy.centerX = ellipse.centerX;
    copy.centerY = ellipse.centerY;
    copy.radiusX = ellipse.radiusX;
    copy.radiusY = ellipse.radiusY;
    return copy;
  });

  state.blurs = (entry.blurs || []).map(blur => {
    const copy = new BlurRegion(blur.x, blur.y);
    copy.width = blur.width;
    copy.height = blur.height;
    return copy;
  });

  state.texts = entry.texts.map(text => {
    return new TextAnnotation(text.x, text.y, text.text, text.fontSize, text.color);
  });

  redrawCanvas();

  // Schedule debounced draft save after undo/redo
  if (state.image) {
    scheduleDraftSave(state.image.src);
  }
}
