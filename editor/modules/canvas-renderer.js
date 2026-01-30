import state from './state.js';
import { ARROW, TEXT_BG, BLUR, SELECTION } from './constants.js';

// Get canvas coordinates from mouse/touch event
export function getCanvasCoords(e) {
  const rect = state.canvas.getBoundingClientRect();
  const scaleX = state.canvas.width / rect.width;
  const scaleY = state.canvas.height / rect.height;

  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
    // Also return screen coords for positioning input
    screenX: e.clientX - rect.left,
    screenY: e.clientY - rect.top
  };
}

// Redraw entire canvas
export function redrawCanvas() {
  state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);

  if (state.image) {
    state.ctx.drawImage(state.image, 0, 0);
  }

  // Draw blurs first (directly modifies pixels)
  state.blurs.forEach(blur => drawBlur(blur));

  state.strokes.forEach(stroke => drawStroke(stroke));
  state.arrows.forEach(arrow => drawArrow(arrow));
  state.rectangles.forEach(rect => drawRectangle(rect));
  state.ellipses.forEach(ellipse => drawEllipse(ellipse));
  state.texts.forEach(text => drawText(text));
}

// Draw a single line segment (for incremental pen drawing)
export function drawLineSegment(ctx, from, to, color, lineWidth) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

// Draw stroke (freehand drawing)
export function drawStroke(stroke) {
  if (!stroke || stroke.points.length < 2) {
    if (stroke && stroke.points.length === 1) {
      const point = stroke.points[0];
      state.ctx.beginPath();
      state.ctx.arc(point.x, point.y, stroke.lineWidth / 2, 0, Math.PI * 2);
      state.ctx.fillStyle = stroke.color;
      state.ctx.fill();
    }
    return;
  }

  state.ctx.beginPath();
  state.ctx.strokeStyle = stroke.color;
  state.ctx.lineWidth = stroke.lineWidth;
  state.ctx.lineCap = 'round';
  state.ctx.lineJoin = 'round';

  state.ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

  for (let i = 1; i < stroke.points.length; i++) {
    state.ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
  }

  state.ctx.stroke();
}

// Draw arrow
export function drawArrow(arrow) {
  if (!arrow) return;

  const ctx = state.ctx;
  const { startX, startY, endX, endY, color, lineWidth } = arrow;

  const dx = endX - startX;
  const dy = endY - startY;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length < 1) return;

  const nx = dx / length;
  const ny = dy / length;

  const headLength = Math.max(lineWidth * ARROW.headMultiplier, ARROW.minHeadLength);

  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.moveTo(startX, startY);
  ctx.lineTo(endX - nx * headLength * 0.5, endY - ny * headLength * 0.5);
  ctx.stroke();

  const angle = Math.atan2(dy, dx);

  const tipX = endX;
  const tipY = endY;
  const leftX = endX - headLength * Math.cos(angle - Math.PI / 6);
  const leftY = endY - headLength * Math.sin(angle - Math.PI / 6);
  const rightX = endX - headLength * Math.cos(angle + Math.PI / 6);
  const rightY = endY - headLength * Math.sin(angle + Math.PI / 6);

  ctx.beginPath();
  ctx.fillStyle = color;
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(leftX, leftY);
  ctx.lineTo(rightX, rightY);
  ctx.closePath();
  ctx.fill();
}

// Draw rectangle
export function drawRectangle(rect) {
  if (!rect) return;

  const ctx = state.ctx;
  const { x, y, width, height, color, lineWidth, filled } = rect;

  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'miter';

  if (filled) {
    ctx.fillRect(x, y, width, height);
  } else {
    ctx.strokeRect(x, y, width, height);
  }
}

// Draw ellipse
export function drawEllipse(ellipse) {
  if (!ellipse) return;

  const ctx = state.ctx;
  const { centerX, centerY, radiusX, radiusY, color, lineWidth, filled } = ellipse;

  if (radiusX < 1 || radiusY < 1) return;

  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;

  ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);

  if (filled) {
    ctx.fill();
  } else {
    ctx.stroke();
  }
}

// Draw text annotation
export function drawText(textObj) {
  if (!textObj || !textObj.text) return;

  const ctx = state.ctx;
  const { x, y, text, fontSize, color } = textObj;

  // Set font
  ctx.font = `bold ${fontSize}px Arial, sans-serif`;

  // Measure text for background
  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;
  const textHeight = fontSize;
  const padding = TEXT_BG.padding;

  // Draw white background for readability
  ctx.fillStyle = `rgba(255, 255, 255, ${TEXT_BG.opacity})`;
  ctx.fillRect(
    x - padding,
    y - textHeight + padding,
    textWidth + padding * 2,
    textHeight + padding
  );

  // Draw text
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
}

// Draw blur/pixelation region
export function drawBlur(blur) {
  if (!blur) return;

  // Normalize coordinates (handle negative width/height)
  let x = blur.x, y = blur.y;
  let width = blur.width, height = blur.height;

  if (width < 0) { x += width; width = Math.abs(width); }
  if (height < 0) { y += height; height = Math.abs(height); }

  if (width < 1 || height < 1) return;

  // Clamp to canvas bounds
  x = Math.max(0, Math.floor(x));
  y = Math.max(0, Math.floor(y));
  width = Math.min(Math.floor(width), state.canvas.width - x);
  height = Math.min(Math.floor(height), state.canvas.height - y);

  if (width < 1 || height < 1) return;

  // Get image data and apply pixelation
  const imageData = state.ctx.getImageData(x, y, width, height);
  const data = imageData.data;
  const pixelSize = BLUR.pixelSize;

  for (let py = 0; py < height; py += pixelSize) {
    for (let px = 0; px < width; px += pixelSize) {
      // Sample center pixel of block
      const sampleX = Math.min(px + Math.floor(pixelSize / 2), width - 1);
      const sampleY = Math.min(py + Math.floor(pixelSize / 2), height - 1);
      const idx = (sampleY * width + sampleX) * 4;

      const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];

      // Fill block with sampled color
      for (let by = 0; by < pixelSize && py + by < height; by++) {
        for (let bx = 0; bx < pixelSize && px + bx < width; bx++) {
          const i = ((py + by) * width + (px + bx)) * 4;
          data[i] = r;
          data[i + 1] = g;
          data[i + 2] = b;
          data[i + 3] = a;
        }
      }
    }
  }

  state.ctx.putImageData(imageData, x, y);
}

// Draw selection handles around selected annotation
export function drawSelectionHandles(bounds) {
  if (!bounds) return;

  const ctx = state.ctx;
  const hs = SELECTION.handleSize;

  // Draw selection border (dashed)
  ctx.strokeStyle = '#0066ff';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
  ctx.setLineDash([]);

  // Draw corner handles
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#0066ff';
  ctx.lineWidth = 1;

  const corners = [
    [bounds.x, bounds.y],                           // NW
    [bounds.x + bounds.width, bounds.y],            // NE
    [bounds.x, bounds.y + bounds.height],           // SW
    [bounds.x + bounds.width, bounds.y + bounds.height]  // SE
  ];

  corners.forEach(([x, y]) => {
    ctx.fillRect(x - hs / 2, y - hs / 2, hs, hs);
    ctx.strokeRect(x - hs / 2, y - hs / 2, hs, hs);
  });
}
