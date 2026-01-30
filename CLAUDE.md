# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Snap Hero is a Chrome Extension (Manifest V3) for capturing and editing screenshots. No build system, bundler, or package manager — plain ES6 modules loaded directly by the browser.

## Development

**Load the extension locally:**
1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the project root

**Verify JS syntax (no test runner exists):**
```bash
find . -name "*.js" -exec node --check {} \;
```

There is no linter, test framework, or build step configured.

## Architecture

Three isolated runtime contexts communicate via `chrome.runtime.sendMessage`:

```
Popup (popup/popup.js)
  → sends {action: 'capture', mode} to Background

Background Service Worker (scripts/background.js)
  → captures screenshot via chrome.tabs.captureVisibleTab
  → OR injects scripts/full-page.js for scroll-and-stitch capture
  → stores dataUrl in chrome.storage.local
  → opens editor tab

Editor (editor/editor.js + editor/modules/)
  → loads image from chrome.storage.local
  → canvas-based annotation with 7 drawing tools
  → auto-saves drafts to chrome.storage.local
  → exports PNG/JPEG or copies to clipboard
```

## Editor Module Dependency Graph

`editor/editor.js` is the entry point. All modules are under `editor/modules/`:

- **state.js** — Central mutable state object + ~50 getter/setter exports. All modules read/write through this.
- **constants.js** — Tool names, defaults (color `#ef4444`, lineWidth 4, fontSize 24), thresholds, timeouts.
- **annotations.js** — Class definitions: `Stroke`, `Arrow`, `Rectangle`, `Ellipse`, `TextAnnotation`, `BlurRegion`. Each has `getBounds()` and update methods.
- **canvas-renderer.js** — `redrawCanvas()` draws layers in order: image → blurs → strokes → arrows → rectangles → ellipses → texts. Also handles selection handles and incremental pen drawing.
- **tools/tool-manager.js** — Mouse/touch event handlers on canvas. Creates annotation instances, manages drag/resize, hit detection for selection.
- **tools/text-tool.js** — Text input overlay positioning, confirmation, and editing flow.
- **toolbar.js** — Toolbar button events, color/width/font selectors, dropdown menu, tooltips, mobile menu toggle.
- **history.js** — Undo/redo via deep-copy snapshots of all annotation arrays (max 20 entries). Calls `scheduleDraftSave()` after each save.
- **draft.js** — Auto-save to `chrome.storage.local` with 1s debounce + 30s interval. Serializes annotations to plain objects, deserializes back to class instances on restore.
- **export.js** — Download as PNG/JPEG with quality slider, copy to clipboard via `ClipboardItem` API.
- **ui-helpers.js** — Toast messages (`showSuccess`/`showError`/`showWarning`), modal display helpers for storage errors and large image warnings.

## Key Patterns

**State management:** Single mutable `state` object in `state.js`. Modules import getter/setter functions rather than accessing properties directly.

**Canvas rendering:** Pen uses incremental segment drawing for performance. Shapes use `requestAnimationFrame` throttling during drag. `redrawCanvas()` does full clear-and-redraw of all layers.

**History:** Each entry is a deep clone of all annotation arrays (class instances reconstructed). `saveToHistory()` is called before mutations.

**Draft serialization:** Class instances → plain objects for storage, plain objects → class instances on restore. Draft key: `editorDraft` in `chrome.storage.local`.

**Error classification:** `background.js` uses a `CaptureError` enum and `classifyError()` to map browser errors to user-friendly messages. Protected URLs (chrome://, about:, file://) are detected before capture attempt.

## Storage Limits

- Draft warning threshold: 2MB
- Recommended max: 5MB
- Chrome hard limit: 10MB per extension
- Storage key for screenshots: `screenshotData`
- Storage key for drafts: `editorDraft`

## Keyboard Shortcuts

Tools: S (select), P (pen), T (text), R (rectangle), C (circle), A (arrow), B (blur)
Actions: Ctrl+Z (undo), Ctrl+Y/Ctrl+Shift+Z (redo), Ctrl+S (download), Ctrl+C (copy)
