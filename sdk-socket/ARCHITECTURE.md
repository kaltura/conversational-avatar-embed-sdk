# Socket SDK Architecture

Internal reference for developers and AI agents contributing to `sdk-socket/src/kaltura-avatar-sdk.js`.

---

## File Structure

The entire SDK is a single ~3600-line UMD file. No build step, no bundler, no transpilation. The dist file is a direct copy of the source.

```
sdk-socket/
├── src/kaltura-avatar-sdk.js     ← Single source file (edit this)
├── dist/kaltura-avatar-sdk.js    ← Exact copy of src (commit both)
├── dist/kaltura-avatar-sdk.d.ts  ← TypeScript declarations (manual)
├── tests/e2e/sdk-unit.spec.js    ← 195 Playwright-based unit tests
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
| `QueueManager` | Cyclic-delay availability polling when server is at capacity |
| `CaptionFilter` | TTS word replacements + punctuation normalization for display text |
| `DPPManager` | Validates and emits Dynamic Prompt Injection |
| `MicrophoneManager` | getUserMedia wrapper with mute/unmute |
| `WHEPClient` | WebRTC-HTTP Egress Protocol for avatar video |
| `ASRConnection` | WebRTC send-only for user audio (speech recognition) |
| `AudioFallback` | Socket.IO binary audio when WHEP fails |
| `LibraryLoader` | Lazy CDN loading for Chart.js, Mermaid, KaTeX, CodeMirror |
| `RendererRegistry` | Plugin storage + middleware chain for GenUI |
| `GenUIContainer` | DOM layers (board overlay + visual panel) |
| `GenUIManager` | Orchestrator: socket events → renderer dispatch |
| `CaptionSegmenter` | Splits text into display-ready segments respecting word/sentence boundaries |
| `CaptionScheduler` | Schedules segment emissions at estimated timing intervals |
| `CaptionRateEstimator` | Calibrates chars/sec from observed speaking durations |
| `CaptionRenderer` | DOM rendering with WCAG AA accessibility, keyboard, ARIA |
| `CaptionManager` | Orchestrator: text chunks → segmentation → scheduled emission |
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
┌──────────────────────────────────────────────────────┐
│ Detect cumulative vs. delta text, accumulate buffer  │
│ CommandRegistry.check(_beforeBuffer, 'before')       │
│ Emit AVATAR_TEXT_READY { text: delta, fullText }     │
│ CaptionManager.onChunk(delta, speechId)              │
└──────────────────────────────────────────────────────┘

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

## Event Pipeline (User Speech)

```
Server → 'userStartedTalking' (server-side VAD onset)
       │
       ▼
  _userSpeaking = true
  Emit USER_SPEAKING_START

Server → 'debug_vad_speech_detected' (interim ASR, streaming)
       │
       ▼
  Emit USER_SPEECH { text, isFinal: false }

Server → 'agentTurnToTalk' { userTranscription } (turn complete)
       │
       ▼
  _userSpeaking = false
  Emit USER_SPEECH { text, isFinal: true }
  TranscriptManager.add('User', text)
```

**Key:** `userStartedTalking` is a non-debug event — it fires without debug mode. The `debug_vad_speech_detected` interim transcripts require `setDebugMode: { debugMode: true }` (the SDK enables this automatically).

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

## Caption Pipeline

```
debug_stvTaskGenerated { text, speechId }   ← text chunks arrive BEFORE audio
       │
       ▼
CaptionManager.onChunk(delta, speechId)
  • _textBuffer += delta
  • If new speechId: emit 'caption-start', interrupt previous
  • _appendNewSegments(): commit text up to last sentence boundary
    (segments are APPEND-ONLY — never rebuilt or mutated)

stvStartedTalking                           ← audio playback begins
       │
       ▼
CaptionManager.onSpeakingStart()
  • Record start timestamp (t₀)
  • _appendNewSegments(), show segment[0] if complete
  • Start 200ms tick

tick (every 200ms)                          ← timing loop
       │
       ▼
  • Check: has current segment been visible for (chars / rate) seconds?
  • If yes: advance to next segment
  • If no complete segment yet: wait for more chunks

debug_stvTaskGenerated (while speaking)     ← more chunks stream in
       │
       ▼
CaptionManager.onChunk(delta, speechId)
  • _textBuffer += delta
  • _appendNewSegments(): new complete sentences become new segments
  • Tick picks up new trailing segments naturally

stvFinishedTalking { agentContent }         ← audio ends
       │
       ▼
CaptionManager.onSpeakingEnd(fullText)
  • Stop tick
  • Commit ALL remaining uncommitted text (flush)
  • Show all unseen segments immediately
  • Calibrate rate: actualDuration / totalChars → chars/sec (EMA α=0.3)
  • Emit 'caption-end'
  • Hold last segment visible (default 2s), then fade out

userStartedTalking                          ← user interrupts
       │
       ▼
CaptionManager.interrupt()
  • Stop tick
  • Emit 'caption-interrupted'
  • Immediate fade out
```

**Key design decisions:**
- **Append-only segments:** `_segments[]` is never rebuilt. Once a segment is committed it never changes. This eliminates display-index drift that caused skipped content.
- **Commit boundary:** `_commitBoundary` tracks how many chars of `_textBuffer` have been consumed into segments. Only text up to the last sentence boundary is committed (incomplete trailing text waits for more chunks).
- **Delta accumulation:** The socket handler detects whether the server sends cumulative or delta text and accumulates `_beforeBuffer` correctly in both modes.
- Text arrives BEFORE audio → chunks buffer silently until speaking starts
- First segment only shown when it ends at a natural boundary (sentence punctuation or segmenter split)
- No word-level timing from server → tick-based advancement using chars/sec rate
- Default rate: 11 chars/sec; calibrates from observed speaking duration after each utterance
- Rate calibration converges after 2-3 utterances via exponential moving average (α=0.3)
- Each segment's display time is self-contained (its own char count / rate) — no cumulative drift
- **Caption filter:** `CaptionFilter` reverses TTS phonetic spellings (word-boundary-aware, longest-match-first) and normalizes punctuation/spacing before display
- `aria-live="off"` when audio audible (deaf/HoH read visually); switches to `aria-live="polite"` when video muted
- Toggle state announced to screen readers via `role="status"` live region
- User toggle preference persisted in localStorage

---

## Queue / Capacity Pipeline

```
sdk.connect()
  └─> _initSocket(cancelTimeout, outerReject)
       ├─ socket connects → 'onServerConnected' → emit 'join'
       │
       ├─ NORMAL: joinComplete → showAgent → resolve ✓
       │
       ├─ QUEUE: 'throwToNoAgent' fires
       │   ├─ queue.enabled=false → reject(CAPACITY_UNAVAILABLE)
       │   └─ queue.enabled=true → QueueManager.activate()
       │        ├─ cancelTimeout() — disables 15s deadline
       │        ├─ emits 'queue-started'
       │        ├─ waits delays[0]=30s → checkAvailability
       │        │   └─ availabilityResult { available: false }
       │        │        └─ waits delays[1]=45s → poll again...
       │        │   └─ availabilityResult { available: true }
       │        │        ├─ emits 'queue-available'
       │        │        └─ re-emits 'join' (same socket)
       │        │             └─ joinComplete → showAgent → resolve ✓
       │        └─ maxWaitMs exceeded → reject(QUEUE_TIMEOUT)
       │
       └─ HARD FAIL: 'throwToExceededTier' → reject(TIER_EXCEEDED)
```

**Key design decisions:**
- State stays `CONNECTING` throughout queue wait — no new state machine states needed
- Socket remains alive during wait; re-emit `join` on the same connection when available
- Delay cycle: `[30s, 45s, 1m, 1.5m, 2m, 3m, 4m, 5m, 6m]` — wraps via modulo, infinite
- `connectionTimeout` (15s) is cancelled when queue activates — queue manages its own timeout via `maxWaitMs`
- Default `maxWaitMs: 0` = wait forever (suitable for kiosks, embedded displays)

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
npm test           # 195 tests, ~15 seconds
npm run test:live  # Live server integration tests
npm run test:all   # Everything
```

Test structure:
- Each test creates a fresh `KalturaAvatarSDK` instance with mock socket
- Socket events are simulated by calling `sdk._socket.emit(event, data)` on the mock
- DOM-dependent tests (GenUI) use the real browser DOM
- No mocking frameworks — just plain JavaScript

---

## Plugins

Optional extensions live in `plugins/` — separate from core SDK source and dist.

```
plugins/
└── kava-analytics/
    ├── kaltura-avatar-analytics.js    ← KAVA analytics plugin (UMD)
    ├── kaltura-avatar-analytics.d.ts  ← TypeScript declarations
    └── README.md                      ← Plugin docs
```

### KAVA Analytics Plugin

Reports Immersive Agent events (80001-80005) and standard KAVA events (pageView, buttonClick) to `analytics.kaltura.com`. Attaches to the SDK via public API only:

```javascript
const kava = new KalturaAvatarAnalytics(sdk, { ks, partnerId });
// Auto-fires: callStarted on ready, callEnded on disconnect, messageResponse on speech
```

Internal classes: `SessionTracker`, `TransportLayer`, `EventBuilder`, `PluginEmitter`, `KalturaAvatarAnalytics` (facade).

Transport: HTTP POST via `fetch({keepalive:true})`; `sendBeacon` for page-leave events.

See [`plugins/kava-analytics/README.md`](plugins/kava-analytics/README.md) for full API docs.

### Adding a New Plugin

1. Create `plugins/your-plugin/` directory
2. Single UMD file (same pattern as core SDK — no build step)
3. TypeScript declarations in same directory
4. Test file in `tests/e2e/your-plugin.spec.js`
5. Add to `test-runner.html` and `package.json` test script
6. Plugin uses only public SDK API (`.on()`, `.getState()`, `.getClientId()`)

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
| Command fires on partial text | Server sends deltas not cumulative | Handler detects mode and appends; use `debounce` for incremental commands |
| Intro speech clipped | `approvedPermissions` fired before video ready | Wait for canplay + 300ms |
| Avatar freezes on contact request | Server waits for `contactInfoReceived`/`Rejected` | Always provide submit AND skip path |
| GenUI video triggers "are you there" | Server silence detection fires during video | Mute mic + pause conversation |
| Tests fail on `check()` without phase | `check(text)` defaults to `'after'` | Always pass phase explicitly in new code |
