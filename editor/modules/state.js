import { DEFAULTS } from './constants.js';

// Editor state object
const state = {
  canvas: null,
  ctx: null,
  image: null,
  currentTool: 'select',
  color: DEFAULTS.color,
  lineWidth: DEFAULTS.lineWidth,
  fontSize: DEFAULTS.fontSize,
  filled: DEFAULTS.filled,
  isDrawing: false,

  // Stroke-based drawing (pen tool)
  strokes: [],
  currentStroke: null,

  // Arrow annotations
  arrows: [],
  currentArrow: null,

  // Rectangle annotations
  rectangles: [],
  currentRectangle: null,

  // Ellipse annotations
  ellipses: [],
  currentEllipse: null,

  // Blur/pixelation regions
  blurs: [],
  currentBlur: null,

  // Text annotations
  texts: [],
  isEditingText: false,
  pendingText: null,

  // Selection state
  selectedAnnotation: null,  // Reference to selected annotation object
  selectedType: null,        // 'stroke', 'arrow', 'rectangle', 'ellipse', 'text', 'blur'
  selectedIndex: null,       // Index in respective array
  dragMode: null,            // 'move', 'resize-nw', 'resize-ne', 'resize-sw', 'resize-se'
  dragStartX: 0,
  dragStartY: 0,
  originalBounds: null,      // Store original bounds before drag

  // History for undo/redo
  history: [],
  historyIndex: -1
};

// Export the state object (for direct access when needed)
export default state;

// Getters
export function getCanvas() { return state.canvas; }
export function getCtx() { return state.ctx; }
export function getImage() { return state.image; }
export function getCurrentTool() { return state.currentTool; }
export function getColor() { return state.color; }
export function getLineWidth() { return state.lineWidth; }
export function getFontSize() { return state.fontSize; }
export function getFilled() { return state.filled; }
export function getIsDrawing() { return state.isDrawing; }
export function getStrokes() { return state.strokes; }
export function getCurrentStroke() { return state.currentStroke; }
export function getArrows() { return state.arrows; }
export function getCurrentArrow() { return state.currentArrow; }
export function getRectangles() { return state.rectangles; }
export function getCurrentRectangle() { return state.currentRectangle; }
export function getEllipses() { return state.ellipses; }
export function getCurrentEllipse() { return state.currentEllipse; }
export function getBlurs() { return state.blurs; }
export function getCurrentBlur() { return state.currentBlur; }
export function getTexts() { return state.texts; }
export function getIsEditingText() { return state.isEditingText; }
export function getPendingText() { return state.pendingText; }
export function getSelectedAnnotation() { return state.selectedAnnotation; }
export function getSelectedType() { return state.selectedType; }
export function getSelectedIndex() { return state.selectedIndex; }
export function getDragMode() { return state.dragMode; }
export function getDragStartX() { return state.dragStartX; }
export function getDragStartY() { return state.dragStartY; }
export function getOriginalBounds() { return state.originalBounds; }
export function getHistory() { return state.history; }
export function getHistoryIndex() { return state.historyIndex; }

// Setters
export function setCanvas(canvas) { state.canvas = canvas; }
export function setCtx(ctx) { state.ctx = ctx; }
export function setImage(image) { state.image = image; }
export function setCurrentTool(tool) { state.currentTool = tool; }
export function setColor(color) { state.color = color; }
export function setLineWidth(width) { state.lineWidth = width; }
export function setFontSize(size) { state.fontSize = size; }
export function setFilled(filled) { state.filled = filled; }
export function setIsDrawing(isDrawing) { state.isDrawing = isDrawing; }
export function setStrokes(strokes) { state.strokes = strokes; }
export function setCurrentStroke(stroke) { state.currentStroke = stroke; }
export function setArrows(arrows) { state.arrows = arrows; }
export function setCurrentArrow(arrow) { state.currentArrow = arrow; }
export function setRectangles(rectangles) { state.rectangles = rectangles; }
export function setCurrentRectangle(rectangle) { state.currentRectangle = rectangle; }
export function setEllipses(ellipses) { state.ellipses = ellipses; }
export function setCurrentEllipse(ellipse) { state.currentEllipse = ellipse; }
export function setBlurs(blurs) { state.blurs = blurs; }
export function setCurrentBlur(blur) { state.currentBlur = blur; }
export function setTexts(texts) { state.texts = texts; }
export function setIsEditingText(isEditing) { state.isEditingText = isEditing; }
export function setPendingText(text) { state.pendingText = text; }
export function setSelectedAnnotation(annotation) { state.selectedAnnotation = annotation; }
export function setSelectedType(type) { state.selectedType = type; }
export function setSelectedIndex(index) { state.selectedIndex = index; }
export function setDragMode(mode) { state.dragMode = mode; }
export function setDragStartX(x) { state.dragStartX = x; }
export function setDragStartY(y) { state.dragStartY = y; }
export function setOriginalBounds(bounds) { state.originalBounds = bounds; }
export function setHistory(history) { state.history = history; }
export function setHistoryIndex(index) { state.historyIndex = index; }

// Clear selection helper
export function clearSelection() {
  state.selectedAnnotation = null;
  state.selectedType = null;
  state.selectedIndex = null;
  state.dragMode = null;
  state.originalBounds = null;
}
