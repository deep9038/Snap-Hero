// Annotation classes for different drawing tools

// Stroke class for freehand drawing
export class Stroke {
  constructor(color, lineWidth) {
    this.type = 'stroke';
    this.points = [];
    this.color = color;
    this.lineWidth = lineWidth;
  }

  addPoint(x, y) {
    this.points.push({ x, y });
  }

  getBounds() {
    if (this.points.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    this.points.forEach(p => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    });
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }
}

// Arrow class for arrow annotations
export class Arrow {
  constructor(startX, startY, color, lineWidth) {
    this.type = 'arrow';
    this.startX = startX;
    this.startY = startY;
    this.endX = startX;
    this.endY = startY;
    this.color = color;
    this.lineWidth = lineWidth;
  }

  setEnd(x, y) {
    this.endX = x;
    this.endY = y;
  }

  getBounds() {
    return {
      x: Math.min(this.startX, this.endX),
      y: Math.min(this.startY, this.endY),
      width: Math.abs(this.endX - this.startX),
      height: Math.abs(this.endY - this.startY)
    };
  }
}

// Text class for text annotations
export class TextAnnotation {
  constructor(x, y, text, fontSize, color) {
    this.type = 'text';
    this.x = x;
    this.y = y;
    this.text = text;
    this.fontSize = fontSize;
    this.color = color;
  }

  getBounds(ctx) {
    ctx.font = `bold ${this.fontSize}px Arial, sans-serif`;
    const metrics = ctx.measureText(this.text);
    const width = metrics.width + 8;  // padding
    const height = this.fontSize + 8;
    return {
      x: this.x - 4,
      y: this.y - this.fontSize,
      width,
      height
    };
  }
}

// Rectangle class for rectangle annotations
export class Rectangle {
  constructor(x, y, color, lineWidth, filled) {
    this.type = 'rectangle';
    this.x = x;
    this.y = y;
    this.width = 0;
    this.height = 0;
    this.color = color;
    this.lineWidth = lineWidth;
    this.filled = filled;
  }

  setEnd(endX, endY) {
    this.width = endX - this.x;
    this.height = endY - this.y;
  }

  getBounds() {
    return {
      x: this.width >= 0 ? this.x : this.x + this.width,
      y: this.height >= 0 ? this.y : this.y + this.height,
      width: Math.abs(this.width),
      height: Math.abs(this.height)
    };
  }
}

// Ellipse class for ellipse annotations
export class Ellipse {
  constructor(x, y, color, lineWidth, filled) {
    this.type = 'ellipse';
    this.startX = x;
    this.startY = y;
    this.centerX = x;
    this.centerY = y;
    this.radiusX = 0;
    this.radiusY = 0;
    this.color = color;
    this.lineWidth = lineWidth;
    this.filled = filled;
  }

  setEnd(endX, endY) {
    // Calculate center and radii from corner-to-corner drawing
    this.centerX = (this.startX + endX) / 2;
    this.centerY = (this.startY + endY) / 2;
    this.radiusX = Math.abs(endX - this.startX) / 2;
    this.radiusY = Math.abs(endY - this.startY) / 2;
  }

  getBounds() {
    return {
      x: this.centerX - this.radiusX,
      y: this.centerY - this.radiusY,
      width: this.radiusX * 2,
      height: this.radiusY * 2
    };
  }
}

// BlurRegion class for pixelation/redaction
export class BlurRegion {
  constructor(x, y) {
    this.type = 'blur';
    this.x = x;
    this.y = y;
    this.width = 0;
    this.height = 0;
  }

  setEnd(endX, endY) {
    this.width = endX - this.x;
    this.height = endY - this.y;
  }

  getBounds() {
    return {
      x: this.width >= 0 ? this.x : this.x + this.width,
      y: this.height >= 0 ? this.y : this.y + this.height,
      width: Math.abs(this.width),
      height: Math.abs(this.height)
    };
  }
}
