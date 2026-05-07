# Socket SDK Architecture

Internal reference for developers and AI agents contributing to `sdk-socket/src/kaltura-avatar-sdk.js`.

---

## File Structure

The entire SDK is a single 2700-line UMD file. No build step, no bundler, no transpilation. The dist file is a direct copy of the source.

```
sdk-socket/
├── src/kaltura-avatar-sdk.js     ← Single source file (edit this)
├── dist/kaltura-avatar-sdk.js    ← Exact copy of src (commit both)
├── dist/kaltura-avatar-sdk.d.ts  ← TypeScript declarations (manual)
├── tests/e2e/sdk-unit.spec.js    ← 146 Playwright-based unit tests
├── examples/demo/index.html      ← Interactive demo
└── package.json
```

**After any edit:** `cp src/kaltura-avatar-sdk.js dist/kaltura-avatar-sdk.js`

---

## Class Map

All classes are defined inside the UMD factory function (not exported individually). The public API is `KalturaAvatarSDK` only.

| Class | Responsibility |
|-------|----------------|
| `AvatarError` | Typed error with code, recoverable flag, context |
| `Logger` | Prefixed console logging with debug toggle |
| `TypedEventEmitter` | Pub/sub with wildcard, once, off |
| `StateMachine` | State transitions with validation and history |
| `ReconnectStrategy` | Exponential backoff with jitter |
| `TranscriptManager` | Records speech, formats, exports |
| `CommandRegistry` | Pattern-matching on avatar speech with timing control |
| `DPPManager` | Validates and emits Dynamic Prompt Injection |
| `MicrophoneManager` | getUserMedia wrapper with mute/unmute |
| `WHEPClient` | WebRTC-HTTP Egress Protocol for avatar video |
| `ASRConnection` | WebRTC send-only for user audio (speech recognition) |
| `AudioFallback` | Socket.IO binary audio when WHEP fails |
| `LibraryLoader` | Lazy CDN loading for Chart.js, Mermaid, KaTeX, CodeMirror |
| `RendererRegistry` | Plugin storage + middleware chain for GenUI |
| `GenUIContainer` | DOM layers (board overlay + visual panel) |
| `GenUIManager` | Orchestrator: socket events → renderer dispatch |
| `ServerInfo` | Parses and stores server configuration |
| `KalturaAvatarSDK` | Public API class (facade over all above) |

---

## Connection Flow

```
User calls sdk.connect()
       │
       ▼
┌─────────────────────────────┐
│ 1. Socket.IO connects       │  State: CONNECTING → CONNECTED
│    socket.connect()         │
└──────────────┬──────────────┘
               │ 'onServerConnected'
               ▼
┌─────────────────────────────┐
│ 2. Join room                │  State: CONNECTED → JOINING → JOINED
│    socket.emit('joinRoom')  │
└──────────────┬──────────────┘
               │ 'joinComplete'
               ▼
┌─────────────────────────────┐
│ 3. Start mic + video        │  (parallel)
│    _preAcquireMic()         │
│    _startMedia()            │
└──────────────┬──────────────┘
               │
       ┌───────┴───────┐
       ▼               ▼
┌─────────────┐  ┌──────────────────────────────────┐
│ Mic ready   │  │ WHEP negotiate                   │
│ getUserMedia│  │ → SDP exchange                   │
│ _micReady=1 │  │ → wait for video track arrival   │
└──────┬──────┘  │ → wait for canplay event         │
       │         │ → 300ms jitter buffer delay      │
       │         │ _videoReady = true               │
       │         └──────────────┬───────────────────┘
       │                        │
       └────────┬───────────────┘
                ▼
┌─────────────────────────────┐
│ 4. _checkApprovePermissions │  Both _micReady && _videoReady
│    socket.emit(             │  State: JOINED → IN_CONVERSATION
│      'approvedPermissions') │
└──────────────┬──────────────┘
               │
               ▼
       Avatar speaks intro
```

**Critical timing:** `approvedPermissions` tells the server "start talking." If we fire it before video/audio pipeline is ready, the intro gets clipped. The 300ms post-canplay delay ensures the WebRTC jitter buffer has filled.

---

## Event Pipeline (Avatar Speech)

Server sends avatar speech in two phases:

```
Server → 'debug_stvTaskGenerated' (chunks, BEFORE audio plays)
       │
       ▼
┌─────────────────────────────────────────┐
│ Accumulate in _beforeBuffer             │
│ CommandRegistry.check(buffer, 'before') │
│ Emit AVATAR_TEXT_READY { text, fullText}│
└─────────────────────────────────────────┘

Server → 'stvStartedTalking' (avatar lips start moving)
       │
       ▼
  Emit AVATAR_SPEAKING_START

Server → 'stvFinishedTalking' { agentContent: fullText }
       │
       ▼
┌─────────────────────────────────────────┐
│ Reset _beforeBuffer                     │
│ CommandRegistry.resetUtterance()        │
│ CommandRegistry.check(text, 'after')    │
│ TranscriptManager.add('Avatar', text)   │
│ Emit AVATAR_SPEECH, AGENT_TALKED        │
│ Emit AVATAR_SPEAKING_END                │
└─────────────────────────────────────────┘
```

**Chunk ordering:** `debug_stvTaskGenerated` events arrive BEFORE `stvStartedTalking`. Never reset the buffer on `stvStartedTalking` — only on `stvFinishedTalking`.

---

## GenUI Rendering Pipeline

```
Socket event (e.g., 'showChart')
       │
       ▼
┌───────────────────────────┐
│ GenUIManager._handleShow()│
│  1. Determine category    │  BOARD (full overlay) or VISUAL (panel)
│  2. Auto-pause if needed  │  pauseConversation + mic mute
│  3. Emit genui:before-    │  (middleware can cancel)
│     render                │
│  4. Emit 'genui' event   │  (backward compat)
│  5. Look up renderer      │
│  6. Call renderer.render()│
│  7. Insert into DOM layer │
│  8. Emit genui:rendered   │
└───────────────────────────┘
```

Categories:
- **Board** (full-screen overlay): `showLatex`, `showChart`, `showHtml`, `showDiagram`, `showCode`, `showIFrame`, `contactEmail`, `contactPhone`
- **Visual** (bottom-right panel): `showVisualVideo`, `showVisualLink`, `showVisualPhoto`, `showVisualItems`, `showVisualTable`, `showVisualChart`, `showMedia`, `showGeneratedImages`

---

## State Machine

```
uninitialized → connecting → connected → joining → joined → in-conversation → ended
                    │                                              │
                    └──────────── error ◄──────────────────────────┘
                                   │
                                   ▼
                               destroyed
```

Valid transitions are enforced. Invalid transitions throw `AvatarError(INVALID_STATE)`.

---

## WebRTC Architecture

Two separate WebRTC connections:

1. **WHEP (receive-only)** — avatar video + audio FROM server
   - Uses HTTP-based SDP exchange (POST to WHEP endpoint)
   - Receive-only: `addTransceiver('audio/video', { direction: 'recvonly' })`
   - Fallback: if WHEP fails, `AudioFallback` uses Socket.IO binary frames

2. **ASR (send-only)** — user microphone audio TO server
   - Standard WebRTC offer/answer via socket signaling
   - Send-only: `addTrack(micStream.getAudioTracks()[0])`
   - Server performs speech-to-text and returns transcription events

---

## Design Principles

1. **Single file, no build.** The SDK is one UMD file. No Webpack, no Rollup, no TypeScript compilation. The `.d.ts` is hand-maintained. This keeps distribution trivial (one CDN URL).

2. **Frozen constants.** All enums (`State`, `Events`, `ErrorCode`, etc.) are `Object.freeze()`'d. Config objects are frozen after construction.

3. **Defensive on external data.** All socket payloads are validated/normalized before use. Renderer failures are caught per-renderer and emit `genui:error` — they never crash the SDK.

4. **Graceful degradation.** Video fails → audio fallback. Mic denied → text-only mode. Reconnect drops → exponential backoff. Library load fails → skip that renderer.

5. **Event-first.** Every state change, every piece of content, every interaction emits an event. The SDK is usable in "event-only" mode (rendering disabled) for framework integrations.

6. **Backward compat via aliases.** Old iframe SDK event names (`agent-talked`, `showing-agent`) still fire alongside new names. Both `connect()`/`start()` and `disconnect()`/`end()` work.

---

## Adding a New Feature

### Adding a new event

1. Add to the `Events` object at the top of the file
2. Emit it at the appropriate point: `this._emitter.emit(Events.YOUR_EVENT, payload)`
3. Add to `dist/kaltura-avatar-sdk.d.ts` in the `AvatarEventMap` interface
4. Add to the Events Reference table in `README.md`
5. Add a test verifying it fires with correct payload

### Adding a new socket handler

1. Add in `_initSocket()`
2. Follow the pattern: `this._socket.on('eventName', (data) => { ... })`
3. Validate incoming data before processing
4. Emit the appropriate public event

### Adding a new GenUI renderer

1. Add a renderer function in the `_registerBuiltins()` method of `GenUIManager`
2. Determine category: add to `BOARD_TYPES` set if full-screen, otherwise it's visual
3. If it needs an external library, use `ctx.loader.load('name')` (async)
4. Add the type to `GENUI_EVENTS` array so the socket listener is registered
5. Add CSS classes to the injected stylesheet in `GenUIContainer`
6. Add a test with mock data verifying DOM output

### Adding a new public API method

1. Add the method to the `KalturaAvatarSDK` class
2. Add TypeScript declaration in `dist/kaltura-avatar-sdk.d.ts`
3. Add to the appropriate section of `README.md`
4. Add a test verifying the method exists and works

---

## Testing

Tests run in a real browser (Chromium) via Playwright. The SDK is loaded into the page via `<script>` tag, then exercised from `page.evaluate()` blocks.

```bash
cd sdk-socket
npm test           # 146 tests, ~2.5 seconds
npm run test:live  # Live server integration tests
npm run test:all   # Everything
```

Test structure:
- Each test creates a fresh `KalturaAvatarSDK` instance with mock socket
- Socket events are simulated by calling `sdk._socket.emit(event, data)` on the mock
- DOM-dependent tests (GenUI) use the real browser DOM
- No mocking frameworks — just plain JavaScript

---

## Release Process

1. Sync all version strings:
   - `@version` JSDoc header (top of file)
   - `const VERSION` constant (near top of file)
   - `sdk-socket/package.json` → `version` field
2. `cp src/kaltura-avatar-sdk.js dist/kaltura-avatar-sdk.js`
3. Run `npm test` — all must pass
4. Commit, push
5. `gh release create vX.Y.Z --title "..." --notes "..."`
6. Wait 10 minutes for jsDelivr metadata cache refresh
7. `curl -s "https://purge.jsdelivr.net/gh/kaltura/conversational-avatar-embed-sdk@latest/sdk-socket/dist/kaltura-avatar-sdk.js"`
8. Verify: `curl -sI "https://cdn.jsdelivr.net/gh/kaltura/conversational-avatar-embed-sdk@latest/sdk-socket/dist/kaltura-avatar-sdk.js" | grep x-jsd-version`

**Never delete/recreate a tag.** jsDelivr permanently caches file content at the first fetch for a given version. If something is wrong, bump to a new version.

---

## Gotchas

| Problem | Why | Rule |
|---------|-----|------|
| `@latest` still shows old version | jsDelivr metadata cache is ~10min | Wait, then purge |
| Recreated tag doesn't update CDN | jsDelivr S3 snapshot is permanent | Never reuse versions |
| Buffer reset clears first chunk | `stvStartedTalking` fires AFTER chunks arrive | Only reset on `stvFinishedTalking` |
| Intro speech clipped | `approvedPermissions` fired before video ready | Wait for canplay + 300ms |
| Avatar freezes on contact request | Server waits for `contactInfoReceived`/`Rejected` | Always provide submit AND skip path |
| GenUI video triggers "are you there" | Server silence detection fires during video | Mute mic + pause conversation |
| Tests fail on `check()` without phase | `check(text)` defaults to `'after'` | Always pass phase explicitly in new code |
