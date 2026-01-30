// Tool identifiers
export const TOOLS = {
  SELECT: 'select',
  PEN: 'pen',
  TEXT: 'text',
  RECTANGLE: 'rectangle',
  CIRCLE: 'circle',
  ARROW: 'arrow',
  BLUR: 'blur'
};

// Selection tool configuration
export const SELECTION = {
  handleSize: 8,      // Size of resize handles in pixels
  hitTolerance: 10    // Distance tolerance for line hit detection
};

// Default values
export const DEFAULTS = {
  color: '#ef4444',
  lineWidth: 4,
  fontSize: 24,
  filled: false
};

// History configuration
export const HISTORY = {
  maxEntries: 20
};

// Canvas thresholds
export const CANVAS = {
  minStrokeLength: 5,
  minShapeSize: 10,
  minArrowLength: 5,
  textBaselineRatio: 0.8
};

// Arrow drawing constants
export const ARROW = {
  headMultiplier: 4,
  minHeadLength: 15
};

// Text background styling
export const TEXT_BG = {
  padding: 4,
  opacity: 0.85
};

// Blur/pixelation settings
export const BLUR = {
  pixelSize: 8
};

// Timeouts in milliseconds
export const TIMEOUTS = {
  textInputFocus: 10,
  textBlurDelay: 100,
  popupClose: 1000,
  captureTimeout: 10000
};
