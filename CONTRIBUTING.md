# Contributing

Guidelines for humans and AI agents working on this repository.

---

## Repository Layout

```
├── sdk-socket/            ← Socket SDK (Direct Socket.IO + WebRTC)
│   ├── src/               ← Source (single UMD file — edit this)
│   ├── dist/              ← Built output (copy of src + .d.ts)
│   ├── tests/             ← Playwright tests (146 tests)
│   ├── examples/demo/     ← Interactive demo app
│   ├── ARCHITECTURE.md    ← Internal architecture reference
│   └── README.md          ← Developer-facing documentation
│
├── sdk-iframe/            ← Iframe SDK (sandboxed iframe embed)
│   ├── kaltura-avatar-sdk.min.js / .js / .d.ts
│   └── examples/          ← Demo applications
│
├── AGENTS.md              ← AI agent guide (building WITH the SDK)
├── CLAUDE.md              ← AI agent instructions (working ON the SDK)
└── .github/workflows/     ← CI and GitHub Pages deployment
```

---

## Before You Start

1. Read `sdk-socket/ARCHITECTURE.md` — understand class map, connection flow, event pipeline
2. Read the section of `README.md` relevant to your change
3. Check existing tests in `tests/e2e/sdk-unit.spec.js` for patterns

---

## Code Standards

### Style

- **No build step.** The SDK is a single UMD file. Edit `src/`, copy to `dist/`. No transpilation.
- **No comments unless the "why" is non-obvious.** Self-documenting code via clear names.
- **`Object.freeze()` all constants and config objects.** Existing pattern — follow it.
- **Defensive on external data.** Validate all socket payloads. Never trust server data shapes.
- **No `eval()`, `new Function()`, or `innerHTML` on untrusted data.** The `showHtml` renderer is a documented exception (server-controlled content).
- **BEM naming for CSS:** `kav-genui__element--modifier`
- **camelCase** for JS, **SCREAMING_SNAKE** for constants
- **No global pollution.** All state lives in class instances.

### Patterns to Follow

```javascript
// Frozen enums
const MyEnum = Object.freeze({ A: 'a', B: 'b' });

// Class with underscore-prefixed privates
class MyManager {
  constructor(emitter, config, log) {
    this._emitter = emitter;
    this._config = config;
    this._log = log;
  }

  // Public methods: no underscore
  doThing() { ... }

  // Private methods: underscore prefix
  _internalHelper() { ... }
}

// Event emission
this._emitter.emit(Events.SOMETHING, { key: value });

// Error handling — catch per-component, never crash the SDK
try { renderer.render(data, el, ctx); }
catch (e) { this._emitter.emit(Events.GENUI_ERROR, { type, error: e }); }
```

### What NOT to Do

- Don't add npm dependencies. The SDK has zero runtime deps (Socket.IO is a peer dep loaded by the user).
- Don't split into multiple files. The single-file UMD is intentional for CDN distribution.
- Don't add a build/compile step.
- Don't use TypeScript in the source. The `.d.ts` is hand-maintained separately.
- Don't use ES modules syntax in the source (it's UMD wrapped).
- Don't add inline event handlers (`onclick="..."`) — CSP violation.
- Don't use `innerHTML` for user-derived data — XSS risk. Use `textContent` or DOM APIs.

---

## Making Changes to the Socket SDK

### Workflow

```bash
# 1. Edit the source
vim sdk-socket/src/kaltura-avatar-sdk.js

# 2. Copy to dist
cp sdk-socket/src/kaltura-avatar-sdk.js sdk-socket/dist/kaltura-avatar-sdk.js

# 3. Run tests
cd sdk-socket && npm test

# 4. If you changed the public API, update:
#    - dist/kaltura-avatar-sdk.d.ts (TypeScript declarations)
#    - README.md (documentation)
#    - ARCHITECTURE.md (if internal structure changed)
```

### Version Bumping

Three places must be in sync:

1. `src/kaltura-avatar-sdk.js` line 6: `@version X.Y.Z`
2. `src/kaltura-avatar-sdk.js` line 23: `const VERSION = 'X.Y.Z'`
3. `sdk-socket/package.json`: `"version": "X.Y.Z"`

Bump version only when releasing. Use semver:
- **Patch** (2.3.x): Bug fixes, internal improvements
- **Minor** (2.x.0): New features, new events, new public methods
- **Major** (x.0.0): Breaking changes to public API (avoid)

### Testing

Tests run in Chromium via Playwright. Each test creates a fresh SDK instance with a mock socket.

```bash
cd sdk-socket
npm install              # First time only
npm test                 # 146 tests, ~2.5 seconds
npm run test:live        # Live server tests (needs credentials)
npm run test:all         # Everything
```

**Every change must have a test.** If you added a feature, add a test. If you fixed a bug, add a test that would have caught it.

Test pattern:

```javascript
test('descriptive name of behavior', async ({ page }) => {
  const result = await page.evaluate(() => {
    const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'test', container: '#c' });
    // exercise the SDK
    return someResult;
  });
  expect(result).toBe(expectedValue);
});
```

---

## Release Checklist

1. All version strings synced (`@version`, `VERSION`, `package.json`)
2. `cp src/kaltura-avatar-sdk.js dist/kaltura-avatar-sdk.js`
3. `npm test` — all pass
4. Commit and push
5. `gh release create vX.Y.Z --title "..." --notes "..."`
6. **Wait 10 minutes** (jsDelivr metadata cache)
7. Purge: `curl -s "https://purge.jsdelivr.net/gh/kaltura/conversational-avatar-embed-sdk@latest/sdk-socket/dist/kaltura-avatar-sdk.js"`
8. Verify: `curl -sI "https://cdn.jsdelivr.net/gh/kaltura/conversational-avatar-embed-sdk@latest/sdk-socket/dist/kaltura-avatar-sdk.js" | grep x-jsd-version`

**Never delete or recreate a git tag.** jsDelivr permanently caches files per version. If something is wrong, bump to a new version.

---

## Adding a New Demo Application (Iframe SDK)

Each demo lives in its own directory under `sdk-iframe/examples/`:

```
sdk-iframe/examples/your_demo/
├── index.html              ← Entry point
├── your-demo.js            ← Application logic
├── your-demo.css           ← Styles
├── base_prompt.txt         ← Avatar Knowledge Base prompt
├── dynamic_page_prompt.schema.json  ← DPP schema (optional)
└── README.md               ← What it does, how to run
```

### Steps

1. Create your directory under `sdk-iframe/examples/`
2. Add `index.html` that loads the SDK:
   ```html
   <script src="../../kaltura-avatar-sdk.min.js"></script>
   ```
3. Write your `base_prompt.txt` defining the avatar persona
4. Wire up the SDK (see existing demos for patterns)
5. Add your demo to the root `README.md`
6. Test locally: `python3 -m http.server 8080`

---

## CI

GitHub Actions runs on every push and PR:
- **test-socket**: 146 unit + GenUI tests
- **test-iframe**: HR Avatar and Code Interview E2E tests
- **lint**: File size checks, JSON schema validation

---

## Key Rules

| Rule | Why |
|------|-----|
| Never reuse a version/tag | jsDelivr caches permanently per version |
| Reset buffer only on `stvFinishedTalking` | Chunks arrive BEFORE `stvStartedTalking` |
| Fire `approvedPermissions` only after video+mic ready | Otherwise avatar intro gets clipped |
| Always provide submit AND skip for contact collection | Server hangs until one is called |
| Mute mic during auto-pause | Prevents "are you still there" during video |
| Keep `.d.ts` in sync manually | No TypeScript compilation in this project |
| Test count should only go up | Never remove tests without replacing them |
