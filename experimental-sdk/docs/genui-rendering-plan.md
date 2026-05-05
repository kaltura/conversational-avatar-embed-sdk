# GenUI Rendering System — Implementation Plan

## Context

The experimental SDK connects directly to Kaltura's server via Socket.IO. The server sends GenUI events that command the client to display rich content (videos, charts, code editors, diagrams, tables, images, links, HTML, LaTeX, iframes). Currently, the SDK only re-emits these events as a unified `GENUI` event — it renders nothing. We need a full rendering system that works out-of-the-box with zero config, while remaining fully extensible for developers who want to customize, override, or integrate with their own frameworks.

## Architecture Overview

```
KalturaAvatarSDK
  └── GenUIManager (orchestrator — new)
        ├── RendererRegistry (plugin registration)
        ├── GenUIContainer (DOM layers: board + visual)
        ├── LibraryLoader (lazy CDN loading)
        └── Built-in Renderers (14 vanilla JS render functions)
```

Follows existing modular pattern (like DPPManager, TranscriptManager, CommandRegistry). All code in the single UMD file.

---

## File: `src/kaltura-avatar-sdk.js`

### 1. New Constants (after line ~127, after existing GENUI_EVENTS)

```javascript
const GENUI_CATEGORY = Object.freeze({ BOARD: 'board', VISUAL: 'visual' });

const BOARD_TYPES = new Set([
  'showLatex', 'showChart', 'showHtml', 'showDiagram', 'showCode', 'showIFrame',
  'contactEmail', 'contactPhone'  // contact collection is a board (pauses avatar)
]);

const GENUI_HIDE_EVENTS = [
  'hideVisuals', 'hideCode', 'hideDiagram', 'hideIFrame', 'hideMedia', 'hideGeneratedImages'
];

// Map hide events to what they hide
const HIDE_EVENT_MAP = {
  hideVisuals: 'visual',    // hides all visuals
  hideCode: 'board',
  hideDiagram: 'board', 
  hideIFrame: 'board',
  hideMedia: 'visual',
  hideGeneratedImages: 'visual'
};

const CONTACT_VALIDATION = {
  email: /^[a-zA-Z0-9.+_-]+@[a-zA-Z0-9.-]+\.[a-zA-Z0-9-]{2,24}$/,
  phone: /^\d{8,}$/
};
```

Add to Events enum:
```javascript
GENUI_BEFORE_RENDER: 'genui:before-render',
GENUI_RENDERED: 'genui:rendered',
GENUI_HIDDEN: 'genui:hidden',
GENUI_INTERACTION: 'genui:interaction',
GENUI_ERROR: 'genui:error',
```

Remove the existing `CONTACT_COLLECTION` event — contact collection now fires through the unified `genui:*` lifecycle events.

### 2. LibraryLoader Class

**Purpose:** Lazy-load heavy rendering libraries (Chart.js, Mermaid, KaTeX, CodeMirror) from CDN only when needed. Developers can override URLs or provide their own instances.

**Public interface:**
- `setUrl(name, url)` — override CDN URL for a library
- `provide(name, library)` — skip CDN, use this instance directly
- `load(name)` → `Promise<any>` — load and cache a library

**Default CDN URLs:**
- `chartjs` → Chart.js v4 UMD
- `mermaid` → Mermaid v10
- `katex` → KaTeX v0.16 (+ CSS)
- `codemirror` → CodeMirror v5 (+ CSS)

**Resolution priority:**
1. Developer-provided instance (`provide()`)
2. Already on `window` (check `window.Chart`, `window.mermaid`, `window.katex`, `window.CodeMirror`)
3. Load from CDN URL via script tag injection

### 3. GenUIContainer Class

**Purpose:** Manages two DOM layers (board overlay + visual panel) inside the avatar container or a separate developer-provided container.

**DOM structure created:**
```html
<div class="kav-genui" aria-live="polite">
  <div class="kav-genui__board" role="dialog" style="display:none">
    <!-- full-screen overlay content -->
    <button class="kav-genui__dismiss" aria-label="Close">×</button>
  </div>
  <div class="kav-genui__visual" style="display:none">
    <!-- overlay panel content -->
    <button class="kav-genui__dismiss" aria-label="Close">×</button>
  </div>
</div>
```

**Methods:**
- `attach(parentElement)` — create DOM structure, inject CSS
- `showBoard(element)` → hides previous board, shows new one
- `showVisual(element)` → hides previous visual, shows new one
- `hideBoard()` / `hideVisual()` / `hideAll()`
- `detach()` — remove from DOM

**CSS injection:** Default dark-theme styles using CSS custom properties for easy theming:
```css
.kav-genui { --kav-bg: rgba(0,0,0,0.9); --kav-text: #e0e0e8; --kav-accent: #667eea; --kav-radius: 12px; --kav-padding: 20px; }
```

### 4. RendererRegistry Class

**Purpose:** Stores renderer plugins per GenUI type. Supports middleware (before/after hooks).

**Renderer interface:**
```javascript
{
  render(data, container, context) → void|Promise<void>,
  hide?(container) → void   // optional cleanup
}
```

**RenderContext passed to every renderer:**
```javascript
{
  loader: LibraryLoader,       // to load heavy libraries
  emit: (event, payload) => {} // to emit interactions back to server+SDK
  type: string,                // e.g. 'showChart'
  category: 'board'|'visual'
}
```

**Middleware interface:**
```javascript
{
  beforeRender?(ctx) → void|Promise<void>,  // can set ctx.cancelled = true
  afterRender?(ctx) → void|Promise<void>    // access rendered element
}
```

### 5. GenUIManager Class (Orchestrator)

**Purpose:** Receives socket events, dispatches to renderers, manages lifecycle.

**Flow for a show event:**
1. Socket event arrives (e.g., `showChart` with `{mediaUrl: "..."}`)
2. Determine category (board vs visual)
3. Emit `genui:before-render` event (middleware can cancel)
4. Emit existing `genui` event (backward compat)
5. If rendering enabled: look up renderer, create container div, call `renderer.render(data, div, context)`
6. Insert rendered div into appropriate DOM layer (auto-hides previous)
7. Emit `genui:rendered` with `{ type, data, category, element }`

**Flow for a hide event:**
1. Socket event arrives (e.g., `hideVisuals`)
2. Determine what to hide (board or visual layer)
3. Call renderer's `hide()` if exists, remove from DOM
4. Emit `genui:hidden`

**Flow for interactions (clicks in showHtml, showVisualItems, code submission):**
1. User clicks element inside rendered content
2. Built-in renderer captures click
3. Calls `context.emit('onHtmlElementClick', { htmlText })` → sends to server socket AND emits `genui:interaction` locally

### 6. Built-in Renderers (16 total — 14 GenUI + 2 Data Collection)

**Simple renderers (no external library):**
| Type | Rendering approach |
|------|-------------------|
| `showHtml` | `innerHTML` (matches prod). Click handler on all elements → `onHtmlElementClick` |
| `showIFrame` | `<iframe src=url sandbox="allow-scripts allow-same-origin allow-forms">` |
| `showVisualVideo` | `<iframe src=url allow="autoplay; encrypted-media; fullscreen">` |
| `showVisualLink` | `<a href=url target="_blank">linkText</a>` styled as button |
| `showVisualPhoto` | `<img src=url>` with object-fit contain |
| `showVisualItems` | `<button>` per item, click → `onHtmlElementClick` |
| `showVisualTable` | `<table>` with `<thead>` + `<tbody>` from column-oriented data |
| `showMedia` | Image gallery (single or multiple `<img>` in flex container) |
| `showGeneratedImages` | Image grid (`<img>` elements in CSS grid) |
| `contactEmail` | Email input form with validation + submit/dismiss buttons |
| `contactPhone` | Phone input form with validation + submit/dismiss buttons |

**Library-dependent renderers:**
| Type | Library | Rendering approach |
|------|---------|-------------------|
| `showChart` | Chart.js | Parse JSON config → `new Chart(canvas, config)` |
| `showVisualChart` | Chart.js | Same as showChart but in visual layer |
| `showDiagram` | Mermaid | `mermaid.render(id, syntax)` → insert SVG |
| `showLatex` | KaTeX | `katex.render(formula, el, {displayMode: true})` |
| `showCode` | CodeMirror | Editor with code + question + Submit button → `codeBlockComplete` |

### 6a. Contact Collection — Unified with Renderer Architecture

**Problem solved:** The `contactCollector` socket event pauses the avatar until the client responds with `contactInfoReceived` or `contactInfoRejected`. Currently handled via `window.prompt()` in the demo — not production-quality and not customizable.

**Solution:** Treat contact collection as a special "board" type renderer. It uses the same GenUIManager pipeline (middleware, custom renderers, events, DOM layers) so developers can:
- Override with their own styled form (React, Material UI, etc.)
- Intercept via middleware (pre-fill from CRM, auto-submit known contacts)
- Listen to events (analytics on submit/reject rates)

**How it integrates:**

1. The `contactCollector` socket event is handled by GenUIManager (not separately):
   ```javascript
   socket.on('contactCollector', (data) => {
     const type = 'contact' + capitalize(data.contact_type); // 'contactEmail' or 'contactPhone'
     this._handleShow(type, { contact_type: data.contact_type }, GENUI_CATEGORY.BOARD);
   });
   ```

2. Built-in `contactEmail` renderer creates:
   ```html
   <div class="kav-genui__contact">
     <p class="kav-genui__contact-label">The avatar is waiting for your email address</p>
     <input type="email" class="kav-genui__contact-input" placeholder="Your Email Address">
     <div class="kav-genui__contact-actions">
       <button class="kav-genui__contact-submit" disabled>Submit</button>
       <button class="kav-genui__contact-skip">Skip</button>
     </div>
     <p class="kav-genui__contact-hint">The avatar is not listening during input</p>
   </div>
   ```

3. Validation (same as production):
   - Email: `/^[a-zA-Z0-9.+_-]+@[a-zA-Z0-9.-]+\.[a-zA-Z0-9-]{2,24}$/`
   - Phone: `/^\d{8,}$/`
   - Submit button enables only when valid

4. Interactions via `context.emit()`:
   - Submit → `context.emit('contactInfoReceived', { contact_info: { info_type, info_value } })`
   - Skip → `context.emit('contactInfoRejected', { type })`
   - Both auto-hide the form

5. Events emitted:
   - `genui:before-render` with `{ type: 'contactEmail', data, category: 'board' }`
   - `genui:rendered` after form shown
   - `genui:interaction` with `{ interactionType: 'contactInfoReceived'|'contactInfoRejected', payload }`
   - `genui:hidden` after form dismissed

**Developer override example:**
```javascript
// Custom Material UI contact form
sdk.registerRenderer('contactEmail', {
  render(data, container, ctx) {
    const form = document.createElement('div');
    form.innerHTML = `<my-fancy-email-form></my-fancy-email-form>`;
    container.appendChild(form);
    
    form.querySelector('my-fancy-email-form').addEventListener('submit', (e) => {
      ctx.emit('contactInfoReceived', { 
        contact_info: { info_type: 'email', info_value: e.detail.email }
      });
    });
    
    form.querySelector('my-fancy-email-form').addEventListener('cancel', () => {
      ctx.emit('contactInfoRejected', { type: 'email' });
    });
  }
});
```

**Middleware example (auto-fill known user):**
```javascript
sdk.useGenUIMiddleware({
  beforeRender(ctx) {
    if (ctx.type === 'contactEmail' && currentUser.email) {
      // Auto-submit without showing form
      ctx.cancelled = true;
      sdk._socket.emit('contactInfoReceived', {
        contact_info: { info_type: 'email', info_value: currentUser.email }
      });
    }
  }
});
```

**CSS for contact forms:**
```css
.kav-genui__contact { text-align: center; padding: 32px; max-width: 360px; margin: 0 auto; }
.kav-genui__contact-label { font-size: 14px; margin-bottom: 16px; color: var(--kav-text); }
.kav-genui__contact-input { width: 100%; padding: 12px 16px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; color: var(--kav-text); font-size: 14px; outline: none; }
.kav-genui__contact-input:focus { border-color: var(--kav-accent); }
.kav-genui__contact-input:invalid { border-color: #f87171; }
.kav-genui__contact-actions { display: flex; gap: 12px; margin-top: 16px; justify-content: center; }
.kav-genui__contact-submit { padding: 10px 24px; background: var(--kav-accent); border: none; color: #fff; border-radius: 8px; cursor: pointer; font-size: 14px; }
.kav-genui__contact-submit:disabled { opacity: 0.4; cursor: not-allowed; }
.kav-genui__contact-skip { padding: 10px 24px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: var(--kav-text); border-radius: 8px; cursor: pointer; font-size: 14px; }
.kav-genui__contact-hint { font-size: 11px; color: rgba(255,255,255,0.4); margin-top: 12px; }
```

**Data normalization:** Each renderer normalizes the incoming payload:
- `mediaUrl` can be a URL string (fetch it) OR inline content string
- Visual events check `videoUrl || mediaUrl`, `linkUrl || mediaUrl`, `photoUrl || mediaUrl`
- `showVisualTable.mediaUrl` can be JSON string or object
- `showVisualItems.mediaUrl` can be JSON string or array

### 7. SDK Integration Points

**Constructor — add to config parsing (after media config):**
```javascript
genui: {
  enabled: true,              // render by default; false = events only
  container: null,            // separate container (selector/element), null = overlay on video
  position: 'overlay',        // 'overlay' (on video) | 'below' | 'custom'
  autoHide: true,             // auto-hide previous content when new arrives
  dismissible: true,          // show close button
  cssPrefix: 'kav-genui',    // BEM prefix
  libraries: {},              // { chartjs: Chart, mermaid: window.mermaid, ... }
  renderers: {}               // { showHtml: customRenderer, ... }
}
```

**Constructor — instantiate GenUIManager:**
```javascript
this._genui = new GenUIManager(this._emitter, this._config.genui, this._log);
```

**`_setupContainer()` — attach GenUI DOM after video element:**
```javascript
const genuiTarget = this._config.genui.container 
  ? resolveElement(this._config.genui.container) 
  : container;
this._genui.attach(genuiTarget);
```

**`_initSocket()` — replace simple GENUI_EVENTS loop:**
```javascript
this._genui.bindSocket(this._socket);
```
(GenUIManager still emits `Events.GENUI` for backward compat)

**`destroy()` — cleanup:**
```javascript
this._genui.destroy();
```

### 8. New Public API Methods on KalturaAvatarSDK

```javascript
// Register/override a renderer for any GenUI type (including 'contactEmail', 'contactPhone')
registerRenderer(type, renderer) → () => void

// Add middleware (before/after render hooks)
useGenUIMiddleware(middleware) → () => void

// Provide a library instance (avoids CDN load)
provideLibrary(name, library) → void

// Override CDN URL for a library
setLibraryUrl(name, url) → void

// Manually hide current GenUI content
hideGenUI(category?) → void

// Get what's currently shown
getActiveGenUI() → { type: string, category: string } | null

// Enable/disable rendering (events still fire when disabled)
setGenUIEnabled(enabled) → void

// Check if rendering is active
isGenUIEnabled() → boolean
```

**Backward compatibility:** The existing `submitContact(type, value)` and `rejectContact(type)` methods remain as convenience shortcuts that emit the correct socket events directly (useful for event-only mode or custom renderer implementations). The existing `CONTACT_COLLECTION` event is removed — replaced by `genui:before-render` with `type: 'contactEmail'|'contactPhone'`.

### 9. New Events

| Event | Payload | When |
|-------|---------|------|
| `genui:before-render` | `{ type, data, category }` | Before render (cancellable via middleware) |
| `genui:rendered` | `{ type, data, category, element }` | After DOM updated |
| `genui:hidden` | `{ type, category }` | After content hidden |
| `genui:interaction` | `{ interactionType, payload }` | User clicked/submitted |
| `genui:error` | `{ type, error }` | Render failed |

Existing `genui` event continues to fire (backward compat).

---

## File: `dist/kaltura-avatar-sdk.d.ts`

Add TypeScript interfaces:
- `GenUIConfig` — config shape
- `GenUIRenderer` — renderer plugin interface
- `GenUIMiddleware` — middleware interface  
- `GenUIRenderContext` — context passed to renderers
- `GenUIRenderedPayload`, `GenUIHiddenPayload`, `GenUIInteractionPayload`, `GenUIErrorPayload`
- Update `AvatarConfig` with `genui?: Partial<GenUIConfig>`
- Update `AvatarEventMap` with new events
- Update `KalturaAvatarSDK` class with new methods

---

## File: `examples/demo/index.html`

Update demo to showcase GenUI:
- Keep Events tab showing all events (including GenUI lifecycle)
- Update Commands tab to properly show GenUI rendered content (or a dedicated "Content" tab)
- No app-level rendering code needed — SDK handles it via the overlay on the video container

---

## File: `tests/e2e/sdk-unit.spec.js`

Add unit tests:
- GenUIManager instantiation and config
- RendererRegistry: register, get, override, middleware
- LibraryLoader: provide, URL override
- Built-in renderers: mock data → verify DOM output
- Event emission: before-render, rendered, hidden, interaction
- Middleware: cancel render, modify data
- Container: attach, show/hide board/visual layers

---

## CSS Default Theme

Injected as a `<style id="kav-genui-styles">` element (skipped if already exists):

```css
.kav-genui { position: absolute; inset: 0; pointer-events: none; z-index: 10; font-family: inherit; }
.kav-genui__board { position: absolute; inset: 0; z-index: 100; pointer-events: all; background: var(--kav-bg, rgba(13,13,24,0.95)); display: flex; align-items: center; justify-content: center; padding: var(--kav-padding, 20px); overflow: auto; }
.kav-genui__visual { position: absolute; bottom: 16px; right: 16px; z-index: 90; pointer-events: all; background: var(--kav-bg, rgba(13,13,24,0.95)); border-radius: var(--kav-radius, 12px); padding: var(--kav-padding, 16px); max-width: 400px; max-height: 60%; overflow: auto; box-shadow: 0 8px 32px rgba(0,0,0,0.5); }
.kav-genui__dismiss { position: absolute; top: 8px; right: 8px; background: rgba(255,255,255,0.1); border: none; color: var(--kav-text, #e0e0e8); width: 28px; height: 28px; border-radius: 50%; cursor: pointer; font-size: 16px; z-index: 10; }
.kav-genui__content { color: var(--kav-text, #e0e0e8); width: 100%; }
/* Type-specific styles... */
.kav-genui__visual-table { width: 100%; border-collapse: collapse; }
.kav-genui__visual-table th, .kav-genui__visual-table td { padding: 8px 12px; border: 1px solid rgba(255,255,255,0.1); text-align: left; }
.kav-genui__visual-link { display: inline-block; padding: 10px 20px; background: var(--kav-accent, #667eea); color: #fff; text-decoration: none; border-radius: 8px; }
.kav-genui__visual-items { display: flex; flex-wrap: wrap; gap: 8px; }
.kav-genui__visual-item-btn { padding: 8px 16px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: var(--kav-text); border-radius: 20px; cursor: pointer; }
.kav-genui__code-question { margin-bottom: 12px; font-size: 14px; }
.kav-genui__code-submit { margin-top: 12px; padding: 10px 24px; background: var(--kav-accent); border: none; color: #fff; border-radius: 8px; cursor: pointer; }
.kav-genui__iframe { width: 100%; height: 100%; min-height: 400px; border: none; }
.kav-genui__media-gallery, .kav-genui__generated-gallery { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; }
.kav-genui__media-item, .kav-genui__generated-item { width: 100%; border-radius: 8px; object-fit: cover; }
```

---

## Implementation Order

1. **Constants** — GENUI_CATEGORY, BOARD_TYPES, HIDE_EVENT_MAP, CONTACT_VALIDATION, new Events entries
2. **LibraryLoader** class
3. **GenUIContainer** class (DOM + CSS injection, including contact form styles)
4. **RendererRegistry** class
5. **Built-in renderers** — simple ones first (html, iframe, link, photo, items, table, media, images, contactEmail, contactPhone), then library-dependent (chart, diagram, latex, code)
6. **GenUIManager** class (orchestrator, handles both GENUI_EVENTS and `contactCollector` socket event)
7. **SDK integration** — config, constructor, `_setupContainer`, `_initSocket`, public API methods, `destroy`. Remove separate `contactCollector` handler from `_initSocket`. Keep `submitContact()`/`rejectContact()` as convenience methods.
8. **TypeScript declarations** update
9. **Demo** update — remove `window.prompt()` contact handler (SDK renders the form automatically)
10. **Unit tests** — include contact form render, validation, submit/reject event flow

---

## Developer Usage Examples

### Zero-config (just works):
```javascript
const sdk = new KalturaAvatarSDK({
  clientId: '...', flowId: '...', container: '#avatar'
});
// GenUI content renders automatically as overlays on the video
```

### Custom container:
```javascript
const sdk = new KalturaAvatarSDK({
  clientId: '...', flowId: '...',
  container: '#avatar',
  genui: { container: '#sidebar-content', position: 'custom' }
});
```

### Override a renderer:
```javascript
sdk.registerRenderer('showChart', {
  async render(data, container, ctx) {
    // Use D3 instead of Chart.js
    const config = JSON.parse(data.mediaUrl);
    renderD3Chart(container, config);
  }
});
```

### Middleware (analytics, modification, suppression):
```javascript
sdk.useGenUIMiddleware({
  beforeRender(ctx) {
    analytics.track('genui_shown', { type: ctx.type });
    if (ctx.type === 'showHtml' && isSensitive(ctx.data)) {
      ctx.cancelled = true; // suppress render
    }
  },
  afterRender(ctx) {
    ctx.element.classList.add('fade-in');
  }
});
```

### Event-only mode (render yourself):
```javascript
const sdk = new KalturaAvatarSDK({
  clientId: '...', flowId: '...',
  genui: { enabled: false } // no auto-rendering
});
sdk.on('genui', ({ type, data }) => {
  // Full control — render in React/Vue/Svelte
  myFramework.renderGenUI(type, data);
});
```

### Provide libraries (skip CDN):
```javascript
import Chart from 'chart.js/auto';
sdk.provideLibrary('chartjs', Chart);
```

### Custom contact collection form:
```javascript
sdk.registerRenderer('contactEmail', {
  render(data, container, ctx) {
    container.innerHTML = `
      <div class="my-form">
        <h3>We'd love to stay in touch!</h3>
        <input type="email" id="email-input" placeholder="name@company.com">
        <button id="submit-btn" disabled>Send</button>
        <button id="skip-btn">No thanks</button>
      </div>`;
    
    const input = container.querySelector('#email-input');
    const submit = container.querySelector('#submit-btn');
    
    input.addEventListener('input', () => {
      submit.disabled = !input.validity.valid;
    });
    
    submit.addEventListener('click', () => {
      ctx.emit('contactInfoReceived', { 
        contact_info: { info_type: 'email', info_value: input.value }
      });
    });
    
    container.querySelector('#skip-btn').addEventListener('click', () => {
      ctx.emit('contactInfoRejected', { type: 'email' });
    });
  }
});
```

### Auto-submit contact for known users (middleware):
```javascript
sdk.useGenUIMiddleware({
  beforeRender(ctx) {
    if (ctx.type === 'contactEmail' && knownUser.email) {
      ctx.cancelled = true; // don't show form
      sdk.submitContact('email', knownUser.email); // auto-submit
    }
  }
});
```

---

## Quality & Code Standards

### Enterprise/Government Audit Requirements

1. **No `eval()`, `new Function()`, or dynamic code execution** — all rendering uses DOM APIs
2. **Content Security Policy (CSP) friendly** — styles injected via `<style>` not inline `style=""` attributes on dynamic content; no `javascript:` URLs
3. **XSS prevention** — `showHtml` renderer documents the risk clearly; all other renderers use `textContent` (not `innerHTML`) for user-derived data. Recommend DOMPurify middleware in docs.
4. **Input validation** — contact forms validate before submit; all payloads validated for expected types before processing
5. **No secrets or credentials** in code — library URLs are public CDNs, no tokens
6. **Accessibility (WCAG 2.1 AA):**
   - Board layer uses `role="dialog"` + `aria-modal="true"`
   - Visual layer uses `aria-live="polite"` for screen reader announcements
   - Dismiss buttons have `aria-label="Close"`
   - Contact inputs have associated `<label>` elements
   - Focus management: focus trapped in board overlays, returned on dismiss
   - Keyboard navigation: Escape key dismisses, Tab cycles within boards
7. **Memory leak prevention:**
   - All event listeners tracked and removed on hide/destroy
   - Chart.js instances `.destroy()`'d on hide
   - MutationObserver/ResizeObserver cleaned up
   - Interval/timeout IDs tracked and cleared
8. **Error isolation** — renderer failures caught per-renderer, emit `genui:error`, never crash the SDK
9. **Frozen configs** — `Object.freeze()` on all config objects (existing pattern)
10. **No global pollution** — all state encapsulated in class instances; CSS uses BEM prefix

### Code Structure Principles

1. **Single Responsibility** — each class does one thing (LibraryLoader loads, Container manages DOM, Registry stores renderers, Manager orchestrates)
2. **Open/Closed** — new renderer types added via `registerRenderer()` without modifying SDK internals
3. **Dependency Inversion** — renderers receive context (loader, emitter) via injection, never import globals
4. **Consistent naming** — BEM for CSS (`kav-genui__board`), camelCase for JS, SCREAMING_SNAKE for constants
5. **JSDoc on every public method** — type annotations, param descriptions, return types, usage examples
6. **Defensive programming** — null checks on all external data, type assertions, graceful degradation

### Documentation

1. **JSDoc comments** on every public class, method, and interface
2. **TypeScript `.d.ts`** fully typed — all new interfaces, overloads, generics where appropriate
3. **README section** — "GenUI Rendering" with:
   - Architecture diagram (text)
   - Quick start (zero-config)
   - Custom renderer guide
   - Middleware guide
   - Contact collection customization
   - CSS theming guide
   - Library providers guide
   - Event reference table
4. **Inline code examples** in JSDoc for key methods

---

## Testing Strategy — 100% Coverage

### File: `tests/e2e/genui.spec.js` (new, dedicated GenUI test file)

All tests run in-browser via Playwright (same pattern as `sdk-unit.spec.js`).

#### Test Suite 1: GenUIManager Core

```
- instantiates with default config
- instantiates with custom config
- attach() creates correct DOM structure (root, board layer, visual layer)
- attach() injects CSS stylesheet (verify <style> tag exists)
- attach() skips CSS injection if already exists
- bindSocket() registers listeners for all 14 GENUI_EVENTS + hide events + contactCollector
- destroy() removes DOM elements and cleans up
- setEnabled(false) prevents rendering but events still fire
- setEnabled(true) re-enables rendering
- getActiveType() returns null when nothing shown
- getActiveType() returns correct type after render
```

#### Test Suite 2: RendererRegistry

```
- register() stores renderer and returns unsubscribe function
- register() accepts function shorthand (auto-wraps in {render})
- unsubscribe function removes renderer
- get() returns null for unregistered type
- get() returns renderer for registered type
- register() overrides previous renderer for same type
- has() returns correct boolean
- use() adds middleware and returns unsubscribe
- middleware unsubscribe removes it
- getMiddleware() returns copy (not reference)
```

#### Test Suite 3: LibraryLoader

```
- provide() makes library available immediately (no network)
- load() returns provided library without CDN fetch
- load() caches result (second call returns same promise)
- load() checks window global before CDN fetch
- setUrl() overrides default CDN URL
- load() rejects with clear error for unknown library name
- _loadScript() injects <script> tag into DOM
- _loadCSS() injects <link> tag into DOM
```

#### Test Suite 4: GenUIContainer DOM Management

```
- showBoard() inserts element into board layer and shows it
- showBoard() hides previous board content
- showVisual() inserts element into visual layer and shows it
- showVisual() hides previous visual content
- hideBoard() removes board content and hides layer
- hideVisual() removes visual content and hides layer
- hideAll() hides both layers
- dismiss button click triggers hideBoard/hideVisual
- Escape key dismisses active board
- only one board OR visual shown at a time per category
```

#### Test Suite 5: Built-in Renderers — Simple

```
- showHtml: renders HTML content in container
- showHtml: click handler emits onHtmlElementClick
- showIFrame: creates iframe with correct src and sandbox
- showVisualVideo: creates iframe with correct allow attributes
- showVisualLink: creates anchor with href, target, rel
- showVisualPhoto: creates img with src and object-fit
- showVisualItems: creates button per item
- showVisualItems: click emits onHtmlElementClick with item text
- showVisualTable: creates table with headers and rows from column data
- showVisualTable: handles JSON string input (parses it)
- showMedia: creates image gallery from single URL
- showMedia: creates image gallery from array of URLs
- showGeneratedImages: creates grid of images
```

#### Test Suite 6: Built-in Renderers — Contact Collection

```
- contactEmail: renders form with email input, submit, skip buttons
- contactEmail: submit disabled when input empty
- contactEmail: submit disabled for invalid email
- contactEmail: submit enabled for valid email
- contactEmail: submit emits contactInfoReceived with correct payload
- contactEmail: skip emits contactInfoRejected
- contactEmail: form auto-hides after submit
- contactEmail: form auto-hides after skip
- contactPhone: renders form with phone input
- contactPhone: submit disabled for <8 digits
- contactPhone: submit enabled for 8+ digits
- contactPhone: submit emits contactInfoReceived
- contactCollector socket event routes to contactEmail renderer
- contactCollector socket event routes to contactPhone renderer
```

#### Test Suite 7: Built-in Renderers — Library-Dependent

```
- showChart: calls loader.load('chartjs')
- showChart: creates canvas element
- showChart: parses JSON config from mediaUrl string
- showDiagram: calls loader.load('mermaid')
- showDiagram: renders SVG from mermaid syntax
- showLatex: calls loader.load('katex') and loader.load('katex-css')
- showLatex: renders formula
- showCode: calls loader.load('codemirror')
- showCode: displays question text
- showCode: creates editor with code content
- showCode: submit button emits codeBlockComplete
- showVisualChart: delegates to chart renderer in visual layer
```

#### Test Suite 8: Event Lifecycle

```
- genui:before-render fires before DOM update
- genui:before-render payload contains { type, data, category }
- genui:rendered fires after DOM update
- genui:rendered payload contains { type, data, category, element }
- genui:hidden fires after hide
- genui:interaction fires on user interaction
- genui:interaction payload contains { interactionType, payload }
- genui:error fires on renderer failure
- existing 'genui' event still fires (backward compat)
- events fire even when rendering is disabled
```

#### Test Suite 9: Middleware

```
- beforeRender middleware called before rendering
- beforeRender middleware receives { type, data, category, cancelled }
- setting cancelled=true prevents rendering
- setting cancelled=true still emits 'genui' event (just no DOM)
- afterRender middleware called after rendering
- afterRender middleware receives { element }
- multiple middleware execute in registration order
- middleware errors don't crash render pipeline
- middleware unsubscribe removes it from chain
```

#### Test Suite 10: Custom Renderer Override

```
- registerRenderer() replaces built-in renderer
- custom renderer receives correct data, container, context
- context.emit() sends to socket and fires genui:interaction
- context.loader accessible from custom renderer
- unsubscribe restores... (no — just removes, built-in is gone)
- multiple types can have different custom renderers
```

#### Test Suite 11: Public API Integration

```
- sdk.registerRenderer() accessible from SDK instance
- sdk.useGenUIMiddleware() accessible from SDK instance
- sdk.provideLibrary() makes library available to renderers
- sdk.setLibraryUrl() updates CDN URL
- sdk.hideGenUI() hides active content
- sdk.hideGenUI('board') hides only board
- sdk.hideGenUI('visual') hides only visual
- sdk.getActiveGenUI() returns current state
- sdk.setGenUIEnabled() toggles rendering
- sdk.isGenUIEnabled() returns current state
- sdk.submitContact() emits contactInfoReceived (convenience method)
- sdk.rejectContact() emits contactInfoRejected (convenience method)
```

#### Test Suite 12: CSS & Theming

```
- default styles injected once (not duplicated on multiple attach)
- CSS custom properties applied (verify computed styles)
- custom cssPrefix config changes class names
- CSS variables overridable via :root or container
```

#### Test Suite 13: Edge Cases & Resilience

```
- rapid sequential show events (10 in <100ms) — only last one visible
- renderer that throws — error caught, genui:error emitted, SDK stable
- renderer that returns rejected promise — same as throw
- show event with null/undefined data — graceful no-op or error event
- show event with malformed mediaUrl — error event, no crash
- hide event when nothing is shown — no-op, no error
- destroy() during active render — cleanup without errors
- bindSocket() called multiple times — no duplicate listeners
- renderer modifies container after hide — no DOM leak
```

### File: `tests/e2e/genui-live.spec.js` (live integration tests)

Tests that require real server connection (run separately):
```
- connect → trigger showVisualVideo via conversation → verify iframe rendered
- connect → trigger contactCollector → verify form rendered → submit → avatar resumes
- connect → trigger contactCollector → reject → avatar resumes  
- connect → trigger showHtml → click element → verify onHtmlElementClick sent
```

---

## Verification Checklist

1. **Unit tests pass** — `npx playwright test tests/e2e/genui.spec.js` — all suites green
2. **Existing tests still pass** — `npx playwright test tests/e2e/sdk-unit.spec.js` — no regressions
3. **Live demo works** — `python3 -m http.server 8090`, open demo, verify GenUI renders automatically
4. **Manual console tests** — inject mock events:
   ```javascript
   sdk._genui._handleShow('showVisualTable', { mediaUrl: { Name: ['Alice', 'Bob'], Score: ['95', '87'] } });
   sdk._genui._handleShow('showVisualPhoto', { mediaUrl: 'https://picsum.photos/400/300' });
   sdk._genui._handleShow('showHtml', { mediaUrl: '<h2>Hello World</h2><p>Click <b>here</b></p>' });
   sdk._genui._handleShow('contactEmail', { contact_type: 'email' });
   ```
5. **Interaction verification** — click items, confirm socket emits in Events tab
6. **Hide verification** — dismiss button, Escape key, `sdk.hideGenUI()`, auto-hide on new content
7. **Override verification** — register custom renderer, confirm it replaces built-in
8. **Middleware verification** — cancel render, modify data, analytics hook
9. **Contact form verification** — validation works, submit/skip emits correct events, avatar resumes
10. **Accessibility** — keyboard nav (Tab, Escape), screen reader (aria attributes), focus management
11. **TypeScript** — `tsc --noEmit` passes on `.d.ts` file
12. **Memory** — no DOM leaks after repeated show/hide cycles (DevTools Heap snapshot)
13. **CSP** — no inline event handlers, no eval, no javascript: URLs
