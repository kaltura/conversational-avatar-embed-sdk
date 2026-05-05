# Claude Code Instructions for Kaltura Avatar SDK

@AGENTS.md

## Project Context

This repository provides two SDKs for embedding Kaltura AI Avatars into web applications. They are not versions — they are different integration approaches for different use cases:

- **Socket SDK** (`sdk-socket/`) — Direct Socket.IO + WebRTC connection. Full control over video, audio, and GenUI rendering. Choose this when you need custom video styling, event-driven architecture, GenUI content rendering, or low latency.
- **Iframe SDK** (`sdk-iframe/`) — Sandboxed iframe embed, ~6KB minified, zero dependencies. Choose this when you need drop-in simplicity, iframe isolation, minimal bundle size, or a quick proof-of-concept.

Both connect to the same Kaltura AI Avatar backend — same avatars, same Knowledge Base, same server-side AI.

## Socket SDK (full control)

- Source: `sdk-socket/src/kaltura-avatar-sdk.js`
- Dist: `sdk-socket/dist/kaltura-avatar-sdk.js`
- Types: `sdk-socket/dist/kaltura-avatar-sdk.d.ts`
- Demo: `sdk-socket/examples/demo/index.html`
- Tests: `sdk-socket/tests/e2e/` (125 tests via Playwright)
- Peer dependency: Socket.IO client v4

### Key Socket SDK Patterns

1. **Connect**: `await sdk.connect()` (no iframe, direct socket)
2. **Events**: `sdk.on('avatar-speech', ...)`, `sdk.on('user-speech', ...)`
3. **DPP**: `sdk.injectDPP(data)` — accepts object or string, works any time after connect
4. **Commands**: `sdk.registerCommand(name, pattern, handler)`
5. **GenUI**: Built-in renderers for charts, tables, videos, code, diagrams, etc.
6. **Transcript**: `sdk.getTranscript()`, `sdk.downloadTranscript()`

### Running Socket SDK Tests

```bash
cd sdk-socket
npm install
npm test          # 125 unit + GenUI tests (~2s)
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
