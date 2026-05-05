# Claude Code Instructions for Kaltura Avatar SDK

@AGENTS.md

## Project Context

This repository provides two SDKs for embedding Kaltura AI Avatars into web applications:

- **SDK v1** (`sdk/`) — Iframe-based, ~6KB minified, zero dependencies. Simple embed via postMessage.
- **SDK v2** (`sdk-v2/`) — Direct Socket.IO + WebRTC connection. Full control over video, audio, and GenUI rendering. Richer API, real-time events, extensible renderer system.

## SDK v2 (Recommended for new projects)

- Source: `sdk-v2/src/kaltura-avatar-sdk.js`
- Dist: `sdk-v2/dist/kaltura-avatar-sdk.js`
- Types: `sdk-v2/dist/kaltura-avatar-sdk.d.ts`
- Demo: `sdk-v2/examples/demo/index.html`
- Tests: `sdk-v2/tests/e2e/` (125 tests via Playwright)
- Peer dependency: Socket.IO client v4

### Key v2 Patterns

1. **Connect**: `await sdk.connect()` (no iframe, direct socket)
2. **Events**: `sdk.on('avatar-speech', ...)`, `sdk.on('user-speech', ...)`
3. **DPP**: `sdk.injectDPP(data)` — accepts object or string, works any time after connect
4. **Commands**: `sdk.registerCommand(name, pattern, handler)`
5. **GenUI**: Built-in renderers for charts, tables, videos, code, diagrams, etc.
6. **Transcript**: `sdk.getTranscript()`, `sdk.downloadTranscript()`

### Running v2 Tests

```bash
cd sdk-v2
npm install
npm test          # 125 unit + GenUI tests (~2s)
npm run test:all  # All including live integration
```

## SDK v1 (Legacy / simple use cases)

- Source: `sdk/kaltura-avatar-sdk.min.js`
- Types: `sdk/kaltura-avatar-sdk.d.ts`
- Demos: `examples/` (att_lily, hr_avatar, code_interview, basic_demo)

### Key v1 Patterns

1. **DPP Injection**: Always inject on `SHOWING_AGENT` event with 500ms delay
2. **Spoken Commands**: Pattern-match on `AGENT_TALKED` text
3. **Transcript**: Capture BEFORE calling `sdk.end()` (end removes the iframe)

## When Users Ask to Build Something

If a user says "Build me X using this SDK" or provides a client ID / flow ID:
1. **Default to SDK v2** unless they specifically need iframe isolation
2. Read AGENTS.md for the full API and patterns
3. Customize the DPP structure and avatar spoken commands for their use case
4. Generate both the JavaScript app code AND the Kaltura Studio Knowledge Base prompt

## Testing

```bash
npm test                    # All tests (v1 + v2)
npm run test:v2             # SDK v2 unit tests only
cd sdk-v2 && npm test       # Same, from sdk-v2 directory
```

Demos run on any static server: `python3 -m http.server 8080`
