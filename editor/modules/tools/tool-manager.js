import state, {
  setIsDrawing, setCurrentStroke, setCurrentArrow, setCurrentRectangle, setCurrentEllipse, setCurrentBlur,
  setSelectedAnnotation, setSelectedType, setSelectedIndex, setDragMode,
  setDragStartX, setDragStartY, setOriginalBounds, clearSelection
} from '../state.js';
import { Stroke, Arrow, Rectangle, Ellipse, BlurRegion } from '../annotations.js';
import { getCanvasCoords, redrawCanvas, drawStroke, drawArrow, drawRectangle, drawEllipse, drawBlur, drawLineSegment, drawSelectionHandles } from '../canvas-renderer.js';
import { saveToHistory } from '../history.js';
import { CANVAS, SELECTION, TOOLS } from '../constants.js';
import { showTextInput, confirmTextInput } from './text-tool.js';

// ==================== Hit Detection Functions ====================

// Check if point is within bounds
function pointInBounds(x, y, bounds) {
  return x >= bounds.x && x <= bounds.x + bounds.width &&
         y >= bounds.y && y <= bounds.y + bounds.height;
}

// Calculate distance from point to line segment
function distanceToLine(px, py, x1, y1, x2, y2) {
  const A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1;
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let t = lenSq !== 0 ? dot / lenSq : -1;
  t = Math.max(0, Math.min(1, t));
  const nearX = x1 + t * C, nearY = y1 + t * D;
  return Math.sqrt((px - nearX) ** 2 + (py - nearY) ** 2);
}

// Find annotation at given point (checks in reverse render order - top-most first)
function findAnnotationAtPoint(x, y) {
  const tolerance = SELECTION.hitTolerance;

  // Text (top layer)
  for (let i = state.texts.length - 1; i >= 0; i--) {
    const bounds = state.texts[i].getBounds(state.ctx);
    if (pointInBounds(x, y, bounds)) {
      return { type: 'text', index: i, annotation: state.texts[i] };
    }
  }

  // Ellipses
  for (let i = state.ellipses.length - 1; i >= 0; i--) {
    const bounds = state.ellipses[i].getBounds();
    if (pointInBounds(x, y, bounds)) {
      return { type: 'ellipse', index: i, annotation: state.ellipses[i] };
    }
  }

  // Rectangles
  for (let i = state.rectangles.length - 1; i >= 0; i--) {
    const bounds = state.rectangles[i].getBounds();
    if (pointInBounds(x, y, bounds)) {
      return { type: 'rectangle', index: i, annotation: state.rectangles[i] };
    }
  }

  // Arrows (distance to line)
  for (let i = state.arrows.length - 1; i >= 0; i--) {
    const arrow = state.arrows[i];
    if (distanceToLine(x, y, arrow.startX, arrow.startY, arrow.endX, arrow.endY) < tolerance) {
      return { type: 'arrow', index: i, annotation: arrow };
    }
  }

  // Strokes (distance to any segment)
  for (let i = state.strokes.length - 1; i >= 0; i--) {
    const stroke = state.strokes[i];
    for (let j = 1; j < stroke.points.length; j++) {
      const p1 = stroke.points[j-1], p2 = stroke.points[j];
      if (distanceToLine(x, y, p1.x, p1.y, p2.x, p2.y) < tolerance) {
        return { type: 'stroke', index: i, annotation: stroke };
      }
    }
  }

  // Blurs (bottom layer)
  for (let i = state.blurs.length - 1; i >= 0; i--) {
    const bounds = state.blurs[i].getBounds();
    if (pointInBounds(x, y, bounds)) {
      return { type: 'blur', index: i, annotation: state.blurs[i] };
    }
  }

  return null;
}

// Check if point is on a resize handle
function getHandleAtPoint(x, y, bounds) {
  const hs = SELECTION.handleSize;
  const handles = {
    'resize-nw': { x: bounds.x, y: bounds.y },
    'resize-ne': { x: bounds.x + bounds.width, y: bounds.y },
    'resize-sw': { x: bounds.x, y: bounds.y + bounds.height },
    'resize-se': { x: bounds.x + bounds.width, y: bounds.y + bounds.height }
  };

  for (const [mode, pos] of Object.entries(handles)) {
    if (Math.abs(x - pos.x) <= hs && Math.abs(y - pos.y) <= hs) {
      return mode;
    }
  }
  return null;
}

// ==================== Move/Resize Functions ====================

function moveAnnotation(annotation, type, dx, dy) {
  switch (type) {
    case 'stroke':
      annotation.points.forEach(p => { p.x += dx; p.y += dy; });
      break;
    case 'arrow':
      annotation.startX += dx; annotation.startY += dy;
      annotation.endX += dx; annotation.endY += dy;
      break;
    case 'rectangle':
    case 'blur':
      annotation.x += dx; annotation.y += dy;
      break;
    case 'ellipse':
      annotation.centerX += dx; annotation.centerY += dy;
      annotation.startX += dx; annotation.startY += dy;
      break;
    case 'text':
      annotation.x += dx; annotation.y += dy;
      break;
  }
}

function resizeAnnotation(annotation, type, mode, dx, dy, original) {
  // Calculate new bounds based on handle being dragged
  let newBounds = {...original};

  if (mode.includes('w')) { newBounds.x += dx; newBounds.width -= dx; }
  if (mode.includes('e')) { newBounds.width += dx; }
  if (mode.includes('n')) { newBounds.y += dy; newBounds.height -= dy; }
  if (mode.includes('s')) { newBounds.height += dy; }

  // Ensure minimum size
  if (newBounds.width < 10) newBounds.width = 10;
  if (newBounds.height < 10) newBounds.height = 10;

  // Apply to annotation based on type
  applyBoundsToAnnotation(annotation, type, newBounds, original);
}

function applyBoundsToAnnotation(annotation, type, newBounds, original) {
  switch (type) {
    case 'rectangle':
    case 'blur':
      annotation.x = newBounds.x;
      annotation.y = newBounds.y;
      annotation.width = newBounds.width;
      annotation.height = newBounds.height;
      break;
    case 'ellipse':
      annotation.centerX = newBounds.x + newBounds.width / 2;
      annotation.centerY = newBounds.y + newBounds.height / 2;
      annotation.radiusX = newBounds.width / 2;
      annotation.radiusY = newBounds.height / 2;
      annotation.startX = newBounds.x;
      annotation.startY = newBounds.y;
      break;
    case 'arrow':
      // Scale arrow endpoints proportionally
      const scaleX = newBounds.width / (original.width || 1);
      const scaleY = newBounds.height / (original.height || 1);
      annotation.startX = newBounds.x + (annotation.startX - original.x) * scaleX;
      annotation.startY = newBounds.y + (annotation.startY - original.y) * scaleY;
      annotation.endX = newBounds.x + (annotation.endX - original.x) * scaleX;
      annotation.endY = newBounds.y + (annotation.endY - original.y) * scaleY;
      break;
    case 'stroke':
      // Scale all points proportionally
      const strokeScaleX = newBounds.width / (original.width || 1);
      const strokeScaleY = newBounds.height / (original.height || 1);
      annotation.points.forEach(p => {
        p.x = newBounds.x + (p.x - original.x) * strokeScaleX;
        p.y = newBounds.y + (p.y - original.y) * strokeScaleY;
      });
      break;
    case 'text':
      // Text doesn't resize, just move
      annotation.x = newBounds.x + 4;  // Account for padding
      annotation.y = newBounds.y + annotation.fontSize;
      break;
  }
}

// ==================== RAF Throttling ====================

// RAF throttling for shape preview
let rafId = null;
let pendingCoords = null;

function scheduleShapeRedraw(coords) {
  pendingCoords = coords;
  if (rafId) return;

  rafId = requestAnimationFrame(() => {
    if (pendingCoords && state.isDrawing) {
      if (state.currentTool === 'arrow' && state.currentArrow) {
        state.currentArrow.setEnd(pendingCoords.x, pendingCoords.y);
        redrawCanvas();
        drawArrow(state.currentArrow);
      } else if (state.currentTool === 'rectangle' && state.currentRectangle) {
        state.currentRectangle.setEnd(pendingCoords.x, pendingCoords.y);
        redrawCanvas();
        drawRectangle(state.currentRectangle);
      } else if (state.currentTool === 'circle' && state.currentEllipse) {
        state.currentEllipse.setEnd(pendingCoords.x, pendingCoords.y);
        redrawCanvas();
        drawEllipse(state.currentEllipse);
      } else if (state.currentTool === 'blur' && state.currentBlur) {
        state.currentBlur.setEnd(pendingCoords.x, pendingCoords.y);
        redrawCanvas();
        drawBlur(state.currentBlur);
      }
    }
    rafId = null;
    pendingCoords = null;
  });
}

// Mouse event handlers
export function handleMouseDown(e) {
  // If editing text and clicking elsewhere, confirm it
  if (state.isEditingText) {
    confirmTextInput();
    return;
  }

  const coords = getCanvasCoords(e);

  // Handle select tool
  if (state.currentTool === TOOLS.SELECT) {
    handleSelectMouseDown(coords);
    return;
  }

  if (state.currentTool === 'text') {
    // Show text input at click position
    showTextInput(coords);
    return;
  }

  setIsDrawing(true);

  if (state.currentTool === 'pen') {
    const stroke = new Stroke(state.color, state.lineWidth);
    stroke.addPoint(coords.x, coords.y);
    setCurrentStroke(stroke);
  } else if (state.currentTool === 'arrow') {
    setCurrentArrow(new Arrow(coords.x, coords.y, state.color, state.lineWidth));
  } else if (state.currentTool === 'rectangle') {
    setCurrentRectangle(new Rectangle(coords.x, coords.y, state.color, state.lineWidth, state.filled));
  } else if (state.currentTool === 'circle') {
    setCurrentEllipse(new Ellipse(coords.x, coords.y, state.color, state.lineWidth, state.filled));
  } else if (state.currentTool === 'blur') {
    setCurrentBlur(new BlurRegion(coords.x, coords.y));
  } else {
    setIsDrawing(false);
  }
}

export function handleMouseMove(e) {
  const coords = getCanvasCoords(e);

  // Handle select tool dragging
  if (state.currentTool === TOOLS.SELECT && state.dragMode && state.selectedAnnotation) {
    handleSelectMouseMove(coords);
    return;
  }

  if (!state.isDrawing) return;

  if (state.currentTool === 'pen' && state.currentStroke) {
    // Incremental drawing for pen tool - only draw the new segment
    const points = state.currentStroke.points;
    const lastPoint = points[points.length - 1];
    state.currentStroke.addPoint(coords.x, coords.y);

    // Draw just the new segment instead of full redraw
    drawLineSegment(state.ctx, lastPoint, coords, state.currentStroke.color, state.currentStroke.lineWidth);
  } else {
    // Use RAF throttling for shape preview (arrow, rectangle, ellipse)
    scheduleShapeRedraw(coords);
  }
}

export function handleMouseUp() {
  // Handle select tool
  if (state.currentTool === TOOLS.SELECT) {
    setDragMode(null);
    return;
  }

  if (!state.isDrawing) return;

  // Cancel any pending RAF
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
    pendingCoords = null;
  }

  setIsDrawing(false);

  if (state.currentTool === 'pen' && state.currentStroke) {
    if (state.currentStroke.points.length > 0) {
      state.strokes.push(state.currentStroke);
      saveToHistory();
    }
    setCurrentStroke(null);
  } else if (state.currentTool === 'arrow' && state.currentArrow) {
    const dx = state.currentArrow.endX - state.currentArrow.startX;
    const dy = state.currentArrow.endY - state.currentArrow.startY;
    const length = Math.sqrt(dx * dx + dy * dy);

    if (length > CANVAS.minArrowLength) {
      state.arrows.push(state.currentArrow);
      saveToHistory();
    }
    setCurrentArrow(null);
  } else if (state.currentTool === 'rectangle' && state.currentRectangle) {
    const size = Math.abs(state.currentRectangle.width) + Math.abs(state.currentRectangle.height);

    if (size > CANVAS.minShapeSize) {
      state.rectangles.push(state.currentRectangle);
      saveToHistory();
    }
    setCurrentRectangle(null);
  } else if (state.currentTool === 'circle' && state.currentEllipse) {
    const size = state.currentEllipse.radiusX + state.currentEllipse.radiusY;

    if (size > CANVAS.minArrowLength) {
      state.ellipses.push(state.currentEllipse);
      saveToHistory();
    }
    setCurrentEllipse(null);
  } else if (state.currentTool === 'blur' && state.currentBlur) {
    const size = Math.abs(state.currentBlur.width) + Math.abs(state.currentBlur.height);

    if (size > CANVAS.minShapeSize) {
      state.blurs.push(state.currentBlur);
      saveToHistory();
    }
    setCurrentBlur(null);
  }

  redrawCanvas();
}

// ==================== Select Tool Handlers ====================

function handleSelectMouseDown(coords) {
  // Check if clicking on resize handle of selected annotation
  if (state.selectedAnnotation) {
    const bounds = state.selectedAnnotation.getBounds(state.ctx);
    if (bounds) {
      const handle = getHandleAtPoint(coords.x, coords.y, bounds);
      if (handle) {
        setDragMode(handle);
        setDragStartX(coords.x);
        setDragStartY(coords.y);
        setOriginalBounds({...bounds});
        saveToHistory();  // Save before resize
        return;
      }
    }
  }

  // Check if clicking on an annotation
  const hit = findAnnotationAtPoint(coords.x, coords.y);
  if (hit) {
    setSelectedAnnotation(hit.annotation);
    setSelectedType(hit.type);
    setSelectedIndex(hit.index);
    setDragMode('move');
    setDragStartX(coords.x);
    setDragStartY(coords.y);
    const bounds = hit.annotation.getBounds(state.ctx);
    setOriginalBounds(bounds ? {...bounds} : null);
    saveToHistory();  // Save before move
    redrawCanvas();
    if (bounds) drawSelectionHandles(bounds);
  } else {
    // Clicked empty space - deselect
    clearSelection();
    redrawCanvas();
  }
}

function handleSelectMouseMove(coords) {
  const dx = coords.x - state.dragStartX;
  const dy = coords.y - state.dragStartY;

  if (state.dragMode === 'move') {
    moveAnnotation(state.selectedAnnotation, state.selectedType, dx, dy);
    setDragStartX(coords.x);
    setDragStartY(coords.y);
  } else if (state.dragMode && state.originalBounds) {
    resizeAnnotation(state.selectedAnnotation, state.selectedType, state.dragMode, dx, dy, state.originalBounds);
  }

  redrawCanvas();
  const bounds = state.selectedAnnotation.getBounds(state.ctx);
  if (bounds) drawSelectionHandles(bounds);
}

// Touch event handlers
export function handleTouchStart(e) {
  e.preventDefault();
  const touch = e.touches[0];
  const mouseEvent = new MouseEvent('mousedown', {
    clientX: touch.clientX,
    clientY: touch.clientY
  });
  handleMouseDown(mouseEvent);
}

export function handleTouchMove(e) {
  e.preventDefault();
  const touch = e.touches[0];
  const mouseEvent = new MouseEvent('mousemove', {
    clientX: touch.clientX,
    clientY: touch.clientY
  });
  handleMouseMove(mouseEvent);
}

export function handleTouchEnd() {
  handleMouseUp();
}
