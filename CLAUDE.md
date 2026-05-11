# Claude Code Instructions for Kaltura Avatar SDK

@AGENTS.md

## Project Context

This repository provides two SDKs for embedding Kaltura AI Avatars into web applications. They are not versions — they are different integration approaches for different use cases:

- **Socket SDK** (`sdk-socket/`) — Direct Socket.IO + WebRTC connection. Full control over video, audio, and GenUI rendering. Choose this when you need custom video styling, event-driven architecture, GenUI content rendering, or low latency.
- **Iframe SDK** (`sdk-iframe/`) — Sandboxed iframe embed, ~6KB minified, zero dependencies. Choose this when you need drop-in simplicity, iframe isolation, minimal bundle size, or a quick proof-of-concept.

Both connect to the same Kaltura AI Avatar backend — same avatars, same Knowledge Base, same server-side AI.

## Before Modifying the Socket SDK

**Read first:**
- `sdk-socket/ARCHITECTURE.md` — class map, connection flow, event pipeline, gotchas
- `CONTRIBUTING.md` — code standards, testing, release process

**Key constraints:**
- Single UMD file, no build step, no bundler, no imports
- After editing `src/`, always copy to `dist/`
- Always run `cd sdk-socket && npm test` before committing
- Never delete/recreate git tags (jsDelivr caches permanently per version)
- Version must be synced in 3 places: `@version` header, `const VERSION`, `package.json`

## Socket SDK (full control)

- Source: `sdk-socket/src/kaltura-avatar-sdk.js`
- Dist: `sdk-socket/dist/kaltura-avatar-sdk.js`
- Types: `sdk-socket/dist/kaltura-avatar-sdk.d.ts`
- Architecture: `sdk-socket/ARCHITECTURE.md`
- Demo: `sdk-socket/examples/demo/index.html`
- Tests: `sdk-socket/tests/e2e/` (243 tests via Playwright)
- Plugins: `sdk-socket/plugins/` (optional extensions — kava-analytics)
- Peer dependency: Socket.IO client v4

### Key Socket SDK Patterns

1. **Connect**: `await sdk.connect()` (no iframe, direct socket)
2. **Events**: `sdk.on('avatar-speech', ...)`, `sdk.on('user-speech', ...)`
3. **DPP**: `sdk.injectDPP(data)` — accepts object or string, works any time after connect
4. **Commands**: `sdk.registerCommand(name, pattern, handler, { timing })` — before/after/both
5. **GenUI**: Built-in renderers for charts, tables, videos, code, diagrams, etc.
6. **Transcript**: `sdk.getTranscript()`, `sdk.downloadTranscript()`
7. **Captions**: `captions: { enabled: true }` — WCAG 2.1 AA closed captions with built-in renderer, tick-based timing, rate auto-calibration
8. **Contact**: `sdk.submitContact(type, value)` / `sdk.rejectContact(type)` — must call one or avatar hangs
9. **Queue**: `queue: { enabled: true, maxWaitMs: 0 }` — automatic retry when server is at capacity, cyclic polling with configurable delays
10. **Analytics**: `new KalturaAvatarAnalytics(sdk, { ks, partnerId })` — optional KAVA plugin, auto-reports call lifecycle and message events

### Running Socket SDK Tests

```bash
cd sdk-socket
npm install
npm test          # 243 unit + GenUI + analytics tests (~18s)
npm run test:all  # All including live integration
```

## Iframe SDK (simple embed)

- Source: `sdk-iframe/kaltura-avatar-sdk.min.js`
- Types: `sdk-iframe/kaltura-avatar-sdk.d.ts`
- Demos: `sdk-iframe/examples/` (att_lily, hr_avatar, code_interview, basic_demo)

### Key Iframe SDK Patterns

1. **DPP Injection**: Always inject on `SHOWING_AGENT` event with 500ms delay
2. **Spoken Commands**: Pattern-match on `AGENT_TALKED` text
3. **Transcript**: Capture BEFORE calling `sdk.end()` (end removes the iframe)

## When Users Ask to Build Something

If a user says "Build me X using this SDK" or provides a client ID / flow ID:
1. **Default to Socket SDK** unless they specifically need iframe isolation or minimal bundle
2. Read AGENTS.md for the Iframe SDK API, or sdk-socket/README.md for Socket SDK API
3. Customize the DPP structure and avatar spoken commands for their use case
4. Generate both the JavaScript app code AND the Kaltura Studio Knowledge Base prompt

## Testing

```bash
npm test                        # All tests (iframe + socket)
npm run test:socket             # Socket SDK unit tests only
cd sdk-socket && npm test       # Same, from sdk-socket directory
npm run test:iframe             # Iframe SDK E2E tests
```

Demos run on any static server: `python3 -m http.server 8080`

## Release Process

See `CONTRIBUTING.md` for the full checklist. The critical points:
1. Sync 3 version strings (`@version` header, `const VERSION`, `package.json`)
2. Copy src → dist
3. Tests pass
4. Commit, push, `gh release create vX.Y.Z`
5. Wait 10 min, purge jsDelivr, verify `x-jsd-version` header

**IMPORTANT: Always create a release tag and verify CDN deployment after pushing changes.** jsDelivr's `@latest` resolves to the latest GitHub release tag, not the latest commit. Without a release, changes are invisible to CDN consumers. Every version bump must be followed by `gh release create` + jsDelivr purge + verification.
