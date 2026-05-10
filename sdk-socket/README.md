# Kaltura Avatar SDK — Socket (Direct Connection)

Connect directly to the Kaltura avatar server via Socket.IO + WebRTC — no iframe required. Full control over video, audio, events, and rich visual content.

---

## When to Use This SDK

Choose the **Socket SDK** when you need:

- **Full video control** — you own the `<video>` element, style it, position it, overlay it
- **Low latency** — no iframe message-passing layer between you and the server
- **GenUI rendering** — charts, tables, code editors, diagrams, images render automatically
- **Event-driven architecture** — access every socket event, state change, and GenUI payload
- **CSP-restricted environments** — no `frame-src` needed
- **Extensibility** — custom renderers, middleware, library providers

Choose the [Iframe SDK](../sdk-iframe/) instead when you want drop-in simplicity, browser sandbox isolation, or the smallest possible bundle (~6KB).

---

## Quick Start (5 minutes)

### Step 1: Add two script tags

```html
<!-- Socket.IO (required peer dependency) -->
<script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>

<!-- The SDK -->
<script src="https://cdn.jsdelivr.net/gh/kaltura/conversational-avatar-embed-sdk@latest/sdk-socket/dist/kaltura-avatar-sdk.js"></script>
```

### Step 2: Add a container for the avatar video

```html
<div id="avatar" style="width: 800px; height: 600px;"></div>
```

### Step 3: Connect

```html
<script>
const sdk = new KalturaAvatarSDK({
  clientId: 'YOUR_CLIENT_ID',   // Get from Kaltura Studio
  flowId: 'YOUR_FLOW_ID',       // Get from Kaltura Studio
  container: '#avatar'
});

// The avatar will greet automatically once connected
sdk.on('avatar-speech', ({ text }) => {
  console.log('Avatar said:', text);
});

sdk.connect();
</script>
```

That's it. The avatar video will render, the microphone will be requested, and the avatar will greet you.

---

## Where to Get Your Client ID and Flow ID

1. Go to **Kaltura Studio** (studio.kaltura.com or your organization's instance)
2. Open or create an **AI Avatar agent**
3. Look in the **Embed / Integration** settings
4. Copy the **Client ID** (a long number) and **Flow ID** (like "agent-1")

---

## Complete Working Example

```html
<!DOCTYPE html>
<html>
<head>
  <title>My Avatar App</title>
</head>
<body>
  <div id="avatar" style="width: 800px; height: 600px; background: #000;"></div>
  <input type="text" id="message" placeholder="Type a message...">
  <button onclick="send()">Send</button>

  <script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
  <script src="https://cdn.jsdelivr.net/gh/kaltura/conversational-avatar-embed-sdk@latest/sdk-socket/dist/kaltura-avatar-sdk.js"></script>
  <script>
    const sdk = new KalturaAvatarSDK({
      clientId: 'YOUR_CLIENT_ID',
      flowId: 'YOUR_FLOW_ID',
      container: '#avatar'
    });

    // Avatar is ready and will greet
    sdk.on('ready', () => {
      console.log('Avatar is live!');
    });

    // Avatar said something
    sdk.on('avatar-speech', ({ text }) => {
      console.log('Avatar:', text);
    });

    // Send text to the avatar (instead of speaking)
    function send() {
      const input = document.getElementById('message');
      sdk.sendText(input.value);
      input.value = '';
    }

    sdk.connect();
  </script>
</body>
</html>
```

---

## Configuration Reference

Every option explained — only `clientId` and `flowId` are required.

```javascript
const sdk = new KalturaAvatarSDK({

  // ┌─────────────────────────────────────────────────────────┐
  // │ REQUIRED                                                 │
  // └─────────────────────────────────────────────────────────┘

  clientId: '115767973963657880005',
  // What: Your Kaltura account identifier
  // Where: Kaltura Studio → Avatar → Embed settings
  // Example: A long numeric string

  flowId: 'agent-1',
  // What: Which avatar agent to connect to
  // Where: Kaltura Studio → Avatar → Embed settings
  // Example: 'agent-1', 'sales-coach', 'hr-interviewer'

  // ┌─────────────────────────────────────────────────────────┐
  // │ WHERE TO SHOW THE AVATAR                                 │
  // └─────────────────────────────────────────────────────────┘

  container: '#avatar',
  // What: Where to put the avatar video on your page
  // Accepts: CSS selector string (like '#my-div') or an HTMLElement
  // Default: null (you must provide a video element via media.videoElement)
  // Tip: The container needs explicit width and height set in CSS

  // ┌─────────────────────────────────────────────────────────┐
  // │ BEHAVIOR                                                 │
  // └─────────────────────────────────────────────────────────┘

  debug: false,
  // What: Print detailed logs to the browser console
  // When to enable: During development or troubleshooting
  // Default: false

  autoReconnect: true,
  // What: Automatically try to reconnect if the connection drops
  // When to disable: If you want full control over reconnection logic
  // Default: true

  maxReconnectAttempts: 5,
  // What: How many times to try reconnecting before giving up
  // Range: 1–20 (higher = more persistent, but slower to surface errors)
  // Default: 5

  reconnectBaseDelay: 1000,
  // What: Starting delay (in milliseconds) between reconnect attempts
  // How it works: Each attempt waits longer (exponential backoff)
  //   Attempt 1: ~1s, Attempt 2: ~2s, Attempt 3: ~4s, etc.
  // Default: 1000

  connectionTimeout: 15000,
  // What: How long to wait (ms) for initial connection before giving up
  // Tip: Increase this on slow networks
  // Default: 15000 (15 seconds)

  transcriptEnabled: true,
  // What: Automatically record all avatar and user speech
  // Why disable: If you don't need transcript and want less memory usage
  // Default: true

  peerName: 'SDKUser',
  // What: Display name sent to the server (appears in server logs)
  // Default: 'SDKUser'

  // ┌─────────────────────────────────────────────────────────┐
  // │ SERVER ENDPOINTS (rarely need to change)                 │
  // └─────────────────────────────────────────────────────────┘

  endpoints: {
    socket: 'https://conversation.avatar.us.kaltura.ai',
    // What: The Socket.IO server URL
    // When to change: Only if using a different Kaltura region/datacenter

    socketPath: '/socket.io',
    // What: Path for the Socket.IO connection
    // When to change: Likely never

    whep: 'https://srs.avatar.us.kaltura.ai',
    // What: The video streaming server (WebRTC-HTTP Egress Protocol)
    // When to change: Only if using a different Kaltura region/datacenter
  },

  // ┌─────────────────────────────────────────────────────────┐
  // │ VIDEO/AUDIO SETTINGS                                     │
  // └─────────────────────────────────────────────────────────┘

  media: {
    video: true,
    // What: Show the avatar as video (face + body)
    // Set to false: If you only want audio (saves bandwidth)
    // Default: true

    audioOnly: false,
    // What: Force audio-only mode (skip video entirely)
    // When to use: Low-bandwidth scenarios, audio-only interfaces
    // Default: false

    videoElement: null,
    // What: Use your own <video> element instead of creating one
    // Example: document.getElementById('my-video')
    // Default: null (SDK creates one inside the container)

    audioElement: null,
    // What: Use your own <audio> element for avatar speech audio
    // Default: null (SDK creates a hidden one)

    micConstraints: null,
    // What: Custom microphone settings
    // Example: { echoCancellation: true, noiseSuppression: true }
    // Default: null (uses server-requested constraints)

    autoPlay: true,
    // What: Start playing video as soon as it's ready
    // Default: true

    ariaLabel: 'AI Avatar Video',
    // What: Accessibility label for screen readers
    // Tip: Describe what the video shows (e.g., "Virtual sales coach")
    // Default: 'AI Avatar Video'
  },

  // ┌─────────────────────────────────────────────────────────┐
  // │ NETWORK / TURN SERVERS (rarely need to change)           │
  // └─────────────────────────────────────────────────────────┘

  turn: {
    urls: null,
    // What: TURN server URLs for WebRTC relay
    // Default: Kaltura's TURN servers (automatically configured)
    // When to change: Only if behind a restrictive corporate firewall
    //   that blocks Kaltura's servers

    username: 'kaltura',
    // What: TURN server authentication
    // Default: 'kaltura'

    credential: 'avatar',
    // What: TURN server password
    // Default: 'avatar'

    iceTransportPolicy: 'relay',
    // What: How WebRTC finds a connection path
    // 'relay': Always go through TURN server (most reliable)
    // 'all': Try direct connection first, fall back to relay
    // Default: 'relay'
  }
});
```

---

## Events Reference

Events let you react when things happen. Subscribe with `sdk.on(eventName, handler)`.

### Lifecycle Events

| Event | When It Fires | What You Get |
|-------|---------------|--------------|
| `'connecting'` | SDK starts connecting to the server | Nothing |
| `'connected'` | Socket connection established | Nothing |
| `'ready'` | Avatar is visible, mic is set up, avatar will greet | Nothing |
| `'disconnected'` | Connection ended (by you or the server) | `{ reason: 'user' }` or `{ reason: 'transport close' }` |
| `'destroyed'` | SDK instance permanently shut down | Nothing |

**Most important:** Listen for `'ready'` — that's when the avatar is fully operational.

```javascript
sdk.on('ready', () => {
  // Safe to send text, inject DPP, etc.
  console.log('Avatar is ready!');
});
```

### Speech Events

| Event | When It Fires | What You Get |
|-------|---------------|--------------|
| `'avatar-text-ready'` | Avatar's response text is ready (before speaking starts) | `{ text: "Hello! How can I help?" }` |
| `'avatar-speaking-start'` | Avatar started talking (lips moving) | Nothing |
| `'avatar-speech'` | Avatar finished saying something | `{ text: "Hello! How can I help?" }` |
| `'avatar-speaking-end'` | Avatar stopped talking | Nothing |
| `'user-speaking-start'` | Server VAD detected user started speaking | Nothing |
| `'user-speech'` | Server recognized what the user said (via mic) | `{ text: "...", isFinal: true/false }` |

**Most important:** `'avatar-text-ready'` gives you the text *before* the avatar speaks it — use this for real-time subtitles, early command detection, or UI pre-loading. `'avatar-speech'` gives you the same text *after* the avatar finishes speaking. `'user-speaking-start'` fires the instant the server's VAD detects voice — use it for UI indicators ("user is talking") before transcription arrives.

```javascript
sdk.on('avatar-speech', ({ text }) => {
  document.getElementById('chat').innerHTML += `<p>Avatar: ${text}</p>`;
});

sdk.on('user-speech', ({ text, isFinal }) => {
  if (isFinal) {
    document.getElementById('chat').innerHTML += `<p>You: ${text}</p>`;
  }
});

// Show a "listening" indicator as soon as the user starts speaking
sdk.on('user-speaking-start', () => {
  document.getElementById('status').textContent = 'Listening...';
});
```

### Media Events

| Event | When It Fires | What You Get |
|-------|---------------|--------------|
| `'video-ready'` | Avatar video stream is playing | `{ element: HTMLVideoElement }` |
| `'audio-fallback'` | Video failed, switched to audio-only | Nothing |
| `'mic-granted'` | User allowed microphone access | `{ stream: MediaStream }` |
| `'mic-denied'` | User blocked microphone (SDK continues in text-only mode) | `{ error: Error }` |

```javascript
sdk.on('mic-denied', () => {
  alert('No mic detected — you can still type messages to the avatar.');
});
```

### Error Events

| Event | When It Fires | What You Get |
|-------|---------------|--------------|
| `'error'` | Something went wrong | `AvatarError` object (see below) |
| `'reconnecting'` | Auto-reconnect is trying | `{ attempt: 2, maxAttempts: 5 }` |
| `'reconnected'` | Successfully reconnected after a drop | Nothing |

```javascript
sdk.on('error', (err) => {
  console.error(`Error ${err.code}: ${err.message}`);
  if (!err.recoverable) {
    alert('Connection lost. Please refresh the page.');
  }
});
```

### State Change Event

| Event | When It Fires | What You Get |
|-------|---------------|--------------|
| `'state-change'` | Any time the SDK state changes | `{ from: 'connecting', to: 'connected' }` |

Possible states: `uninitialized` → `connecting` → `connected` → `joining` → `joined` → `in-conversation` → `ended`

```javascript
sdk.on('state-change', ({ from, to }) => {
  document.getElementById('status').textContent = to;
});
```

### GenUI Events

| Event | When It Fires | What You Get |
|-------|---------------|--------------|
| `'genui'` | Avatar sent visual content (HTML, code, images, etc.) | `{ type: 'showHtml', data: {...} }` |

GenUI types: `showHtml`, `showMedia`, `showCode`, `showDiagram`, `showChart`, `showIFrame`, `showLatex`, `showGeneratedImages`, `showVisualChart`, `showVisualItems`, `showVisualLink`, `showVisualPhoto`, `showVisualTable`, `showVisualVideo`

```javascript
sdk.on('genui', ({ type, data }) => {
  if (type === 'showHtml') {
    document.getElementById('content').innerHTML = data.html;
  }
});
```

#### Auto-Pause During Video

By default, the SDK automatically pauses the conversation when a `showVisualVideo` is rendered. The avatar goes idle and silent while the user watches. When the user dismisses the video (close button or Escape), the conversation resumes automatically.

```javascript
// Enabled by default — no configuration needed
const sdk = new KalturaAvatarSDK({ clientId, flowId, container: '#avatar' });

// Disable auto-pause:
const sdk = new KalturaAvatarSDK({
  clientId, flowId, container: '#avatar',
  genui: { pauseTypes: [] }
});

// Extend to pause for other content types too:
const sdk = new KalturaAvatarSDK({
  clientId, flowId, container: '#avatar',
  genui: { pauseTypes: ['showVisualVideo', 'showIFrame', 'showCode'] }
});
```

### Server Info & Session Events

| Event | When It Fires | What You Get |
|-------|---------------|--------------|
| `'server-connected'` | Server connection established (before join) | `{ agentName, loadingVideoUrl }` |
| `'configured'` | Server sent full client configuration | `{ agentName, language, features, videosCount, photosCount, hasInitialHtml }` |
| `'time-warning'` | Session is about to expire | `{ remainingSeconds: 10 }` |
| `'time-expired'` | Session time limit reached | Nothing |

**Most important:** `'configured'` gives you access to the agent's video/photo library, feature flags, and initial HTML configured in Kaltura Studio.

```javascript
sdk.on('configured', (info) => {
  console.log(`Agent: ${info.agentName}, ${info.videosCount} videos available`);
  
  // Access the full server info anytime after this event
  const serverInfo = sdk.getServerInfo();
  console.log('Features:', serverInfo.features);
  console.log('Videos:', serverInfo.videos);
});

sdk.on('time-warning', ({ remainingSeconds }) => {
  showToast(`Session ending in ${remainingSeconds} seconds`);
});
```

### Command Events

| Event | When It Fires | What You Get |
|-------|---------------|--------------|
| `'command-matched'` | Avatar said a phrase matching a registered command | `{ command: 'end', text: '...', pattern: '...' }` |
| `'transcript-entry'` | A new line was added to the transcript | `{ role: 'Avatar', text: '...', timestamp: Date }` |

### v1 Compatibility Events

If you're migrating from the iframe SDK, these event names still work:

| v1 Event | Same As |
|----------|---------|
| `'agent-talked'` | `'avatar-speech'` (payload: `{ agentContent: text }`) |
| `'showing-agent'` | Fires when server sends `showAgent` |
| `'user-transcription'` | `'user-speech'` (payload: `{ userTranscription: text }`) |
| `'conversation-ended'` | `'disconnected'` |

---

## API Methods

### Starting and Stopping

```javascript
await sdk.connect();  // Connect and start the avatar session
sdk.disconnect();     // End the session gracefully
sdk.destroy();        // Permanently destroy (cannot reconnect)

// Aliases (v1 compatible)
await sdk.start();    // Same as connect()
sdk.end();            // Same as disconnect()
```

### Sending Messages

```javascript
// Send text to the avatar (like typing instead of speaking)
sdk.sendText('What is your name?');
```

### Dynamic Prompt Injection (DPP)

DPP lets you inject context at runtime — the avatar reads this JSON and adjusts its behavior.

```javascript
// Object form (recommended)
sdk.injectDPP({
  v: '2',
  user: { first_name: 'Jane', role: 'Manager' },
  inst: ['Greet the user by name.', 'Be concise.']
});

// String form (if you already have JSON)
sdk.injectDPP('{"v":"2","inst":["Be friendly."]}');

// Debounced — for rapid updates (e.g., live code editor sending context)
sdk.injectDPPDebounced(data, 200); // Only sends after 200ms of no changes
```

### Avatar Spoken Commands

Make the avatar trigger JavaScript functions by speaking specific phrases:

```javascript
// When the avatar says "ending call now", run this function
sdk.registerCommand('end-session', 'ending call now', (match) => {
  console.log('Avatar ended the session!');
  sdk.end();
});

// Works with regex too
sdk.registerCommand('score', /your score is (\d+)/, (match) => {
  console.log('Score mentioned in:', match.text);
});

// Convenience shortcut for end phrases
sdk.onEndPhrase('ending call now', () => sdk.end());

// Remove all commands
sdk.clearCommands();
```

#### Command Timing

By default, commands fire **after** the avatar finishes speaking. You can fire them **before** (as soon as the text is ready, before audio plays) for faster response:

```javascript
// Fire BEFORE the avatar finishes speaking (instant reaction)
sdk.registerCommand('next-slide', 'navigating to slide', (match) => {
  goToNextSlide();
}, { timing: 'before' });

// Fire AFTER the avatar finishes speaking (default behavior)
sdk.registerCommand('end-session', 'ending call now', (match) => {
  sdk.end();
}, { timing: 'after' });

// Fire on BOTH phases (deduplicated — handler runs only once per unique text)
sdk.registerCommand('score', /score is \d+/, (match) => {
  updateScoreDisplay(match.text);
}, { timing: 'both' });
```

The `match` object includes a `timing` field indicating which phase triggered it (`'before'` or `'after'`).

#### Command Debounce

When using `timing: 'before'`, the avatar's text arrives in chunks. A command may match on the first chunk before the full sentence has arrived — for example, "Navigating to slide t" (where "t" is just the start of "twenty-seven").

Use `debounce` to wait for more chunks before firing:

```javascript
// Wait 150ms after the last chunk before firing — gets complete text
sdk.registerCommand('navigate-slide', 'navigating to slide', (match) => {
  const slideNum = parseSlideNumber(match.text); // full sentence available
  goToSlide(slideNum);
}, { timing: 'before', debounce: 150 });
```

**How it works:** When the pattern matches, the SDK waits `debounce` ms. If more chunks arrive, the timer resets. The handler fires with the latest accumulated text once chunks stop arriving. If the utterance ends (`stvFinishedTalking`) before the timer fires, the command flushes immediately with whatever text is available.

**When to use:**
- `debounce: 0` (default) — fire immediately on match. Use for end-of-sentence phrases like "ending call now" where the full text is guaranteed.
- `debounce: 100-200` — use when the matched phrase is followed by dynamic content (like a slide number, score, or name) that arrives in subsequent chunks.

### Transcript

```javascript
// Get all transcript entries
sdk.getTranscript();
// → [{ role: 'Avatar', text: '...', timestamp: Date }, ...]

// Export as formatted text
sdk.getTranscriptText({ format: 'text' });       // "Avatar: Hi!\nUser: Hello!"
sdk.getTranscriptText({ format: 'markdown' });   // "**Avatar:** Hi!\n\n**User:** Hello!"
sdk.getTranscriptText({ format: 'json' });       // JSON array

// Download as a file
sdk.downloadTranscript({ format: 'markdown', filename: 'session.md' });

// Control
sdk.clearTranscript();
sdk.setTranscriptEnabled(false);
```

### Microphone Control

```javascript
sdk.muteMic();       // Mute your microphone
sdk.unmuteMic();     // Unmute
sdk.isMicMuted();    // → true or false
```

### Conversation Control

```javascript
sdk.pause();    // Pause: mutes mic + tells server to stop (avatar goes idle)
sdk.resume();   // Resume: unmutes mic + tells server to continue
```

`pause()` mutes the microphone AND emits `pauseConversation` to the server. The avatar stops listening and stops generating responses. `resume()` does the reverse. This matches the production app's pause button behavior.

For mic-only control (without pausing the conversation flow):

```javascript
sdk.muteMic();       // Stop sending audio (avatar may still speak)
sdk.unmuteMic();     // Resume sending audio
sdk.isMicMuted();    // Check current state
```

### Contact Collection

When the avatar asks the user for their email or phone number, **the server pauses and waits** for a response. The avatar will remain unresponsive until your app either submits the contact info or explicitly rejects the request.

```javascript
// User provided their email — submit it to resume the conversation
sdk.submitContact('email', 'user@example.com');

// User provided their phone number
sdk.submitContact('phone', '15551234567');

// User declined to share — this also resumes the conversation
sdk.rejectContact('email');
sdk.rejectContact('phone');
```

**If you're using the built-in GenUI renderer** (default), the SDK renders a contact form automatically with validation, submit, and skip buttons — no code needed.

**If you've disabled GenUI rendering** (`genui: { enabled: false }`) or are building a custom UI, you must listen for the contact request and call one of the above methods:

```javascript
sdk.on('genui', ({ type, data }) => {
  if (type === 'contactEmail') {
    showMyEmailForm({
      onSubmit: (email) => sdk.submitContact('email', email),
      onCancel: () => sdk.rejectContact('email')
    });
  }
  if (type === 'contactPhone') {
    showMyPhoneForm({
      onSubmit: (phone) => sdk.submitContact('phone', phone),
      onCancel: () => sdk.rejectContact('phone')
    });
  }
});
```

### Camera & Screen Capture

Send visual context to the avatar for analysis (when enabled in Studio):

```javascript
// Send a camera snapshot
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
ctx.drawImage(videoElement, 0, 0);
sdk.sendCameraCapture(canvas.toDataURL('image/jpeg'));

// Send a screen capture
sdk.sendScreenCapture(screenshotDataUrl);
```

### Server Info

Access server-provided configuration (available after the `'configured'` event):

```javascript
sdk.getAgentName();       // Agent's display name from Studio
sdk.getFeatures();        // { tapToTalk, interruptions, pause, screenShare, cameraAnalysis, webSearch, smartTurn }
sdk.getVideos();          // Pre-configured video library with metadata
sdk.getPhotos();          // Pre-configured photo library
sdk.getLoadingVideoUrl(); // Loading animation video URL
sdk.getServerInfo();      // Full ServerInfo object (all of the above + raw config)

// Example: list available contextual videos
sdk.getVideos().forEach(v => {
  console.log(v.id, v.url, v.metadata);
});
```

### Checking State

```javascript
sdk.getState();          // 'uninitialized', 'connecting', 'in-conversation', etc.
sdk.isConnected();       // true/false
sdk.isInConversation();  // true/false  
sdk.isAvatarSpeaking();  // true while avatar is talking
sdk.isUserSpeaking();    // true while user is talking (server VAD)
sdk.getSessionId();      // WebRTC session ID (for debugging)
sdk.getVideoElement();   // The <video> DOM element
sdk.getMicStream();      // The MediaStream from getUserMedia
```

---

## Closed Captions

The SDK provides built-in closed captions that synchronize with avatar speech. Captions are WCAG 2.1 AA compliant with full ARIA support, keyboard navigation, and assistive technology announcements.

### Enable Captions

```javascript
const sdk = new KalturaAvatarSDK({
  clientId, flowId, container: '#avatar',
  captions: {
    enabled: true,         // emit caption events + render overlay
    maxCharsPerLine: 47,   // WCAG-friendly line width
    maxLines: 2            // max lines per segment
  }
});
```

If `enabled` is omitted, the SDK checks localStorage for the user's previous preference (set via the CC toggle button). This allows users to enable captions once and have them persist across sessions.

### Runtime Control

```javascript
sdk.setCaptionsEnabled(true);   // enable
sdk.setCaptionsEnabled(false);  // disable
sdk.isCaptionsEnabled();        // check state

// Override styles at runtime
sdk.setCaptionStyle({
  fontSize: 20,
  backgroundColor: 'rgba(0,0,0,0.9)'
});

// Move captions to a different container
sdk.setCaptionContainer('#my-caption-area');
sdk.setCaptionContainer(document.getElementById('custom-container'));

// Show/hide the CC toggle button (captions still work, just no built-in toggle)
sdk.setCaptionToggleVisible(false);  // hide toggle button
sdk.setCaptionToggleVisible(true);   // show toggle button
sdk.isCaptionToggleVisible();        // check visibility
```

### Caption Events

| Event | Payload | When |
|-------|---------|------|
| `caption-start` | `{ responseId }` | First text arrives for a new response |
| `caption-segment` | `{ text, index, total, isFinal, responseId }` | Each displayable caption segment |
| `caption-end` | `{ responseId }` | All segments emitted, speech finished |
| `caption-interrupted` | `{ responseId, lastSegmentIndex }` | User interrupted avatar speech |

### Timing

Segments are displayed at a default rate of 11 characters/second. After the first utterance, the SDK calibrates the rate from actual observed speaking duration using an exponential moving average. This self-tunes within 2-3 utterances to match the avatar's actual speaking pace.

### Custom Rendering

Set `render: false` to disable the built-in overlay and render captions yourself:

```javascript
const sdk = new KalturaAvatarSDK({
  clientId, flowId, container: '#avatar',
  captions: { enabled: true, render: false }
});

sdk.on('caption-segment', ({ text, index, total, isFinal }) => {
  myCustomCaptionElement.textContent = text;
});

sdk.on('caption-end', () => {
  setTimeout(() => { myCustomCaptionElement.textContent = ''; }, 2000);
});

sdk.on('caption-interrupted', () => {
  myCustomCaptionElement.textContent = '';
});
```

### Built-in Renderer

When `render: true` (default), the SDK renders an accessible caption overlay with:
- White text on 80% opacity black background (17:1 contrast ratio, exceeds 4.5:1 AA)
- Fade-in/out transitions (respects `prefers-reduced-motion`)
- CC toggle button (44x44px touch target, `role="switch"`, keyboard accessible)
- Screen-reader status announcements on toggle ("Captions on" / "Captions off")
- `aria-live="polite"` when video is muted (screen readers announce caption text)
- `aria-hidden="true"` when audio is audible (no double-announcement)
- High contrast mode support (`forced-colors: active`)
- User preference persisted in localStorage

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `C` | Toggle captions on/off (ignored when typing in input fields) |
| `Escape` | Hide captions temporarily |
| `Tab` | Navigate to CC toggle button |
| `Enter` / `Space` | Activate CC toggle button |

### Full Configuration

```javascript
captions: {
  enabled: undefined,          // undefined = check localStorage; true/false = explicit
  maxCharsPerLine: 47,         // WCAG-friendly line width
  maxLines: 2,                 // lines per segment
  render: true,                // show built-in overlay (false = events only)
  position: 'bottom',          // 'bottom' or 'top'
  fontSize: 18,                // px or CSS value, WCAG AA minimum 18px
  fontFamily: 'system-ui, -apple-system, sans-serif',
  textColor: '#FFFFFF',
  backgroundColor: 'rgba(0,0,0,0.8)',
  lineHeight: 1.4,             // line height multiplier
  letterSpacing: null,         // CSS letter-spacing (e.g., '0.05em')
  wordSpacing: null,           // CSS word-spacing (e.g., '0.1em')
  textShadow: null,            // character edge effect (e.g., '2px 2px 4px #000')
  textStroke: null,            // text outline (e.g., '1px black')
  textAlign: 'center',         // 'center', 'left', or 'right'
  padding: '8px 16px',         // inner padding of caption box
  fadeInMs: 120,               // segment appear transition
  fadeOutMs: 200,              // segment disappear transition
  holdAfterEndMs: 2000,        // hold last segment after speech ends
  container: null              // custom container element/selector (default: video container)
}
```

### Styling for ADA / CVAA Compliance

Different accessibility regulations (ADA, CVAA, FCC) require user-customizable caption appearance. The SDK supports all standard caption styling properties:

```javascript
// Example: Large high-contrast captions with drop shadow edge
sdk.setCaptionStyle({
  fontSize: 24,
  fontFamily: 'Arial, Helvetica, sans-serif',
  textColor: '#FFFF00',
  backgroundColor: 'rgba(0,0,0,0.9)',
  textShadow: '2px 2px 4px rgba(0,0,0,1)',
  lineHeight: 1.6,
  position: 'bottom'
});

// Example: Outlined text on semi-transparent background
sdk.setCaptionStyle({
  textColor: '#FFFFFF',
  backgroundColor: 'rgba(0,0,0,0.5)',
  textStroke: '1px black',
  fontSize: 20
});

// Example: Top-positioned, left-aligned for RTL-adjacent layouts
sdk.setCaptionStyle({
  position: 'top',
  textAlign: 'left',
  padding: '12px 24px'
});
```

**`setCaptionStyle()` properties:**

| Property | Type | Description |
|----------|------|-------------|
| `fontSize` | `number \| string` | Font size in px or CSS value |
| `fontFamily` | `string` | CSS font-family |
| `textColor` | `string` | Text color (CSS color value) |
| `backgroundColor` | `string` | Caption box background (CSS color value) |
| `lineHeight` | `number \| string` | Line height multiplier or CSS value |
| `letterSpacing` | `string` | CSS letter-spacing (e.g., `'0.05em'`) |
| `wordSpacing` | `string` | CSS word-spacing |
| `textShadow` | `string` | Drop shadow / edge effect (CSS text-shadow) |
| `textStroke` | `string` | Text outline (CSS -webkit-text-stroke) |
| `textAlign` | `'center' \| 'left' \| 'right'` | Horizontal alignment |
| `padding` | `string` | Inner padding of caption box (CSS shorthand) |
| `position` | `'bottom' \| 'top'` | Vertical position of captions |

Set any property to `null` to revert to the CSS default.

### CSS Custom Properties

The built-in renderer uses CSS custom properties for theming. Override them on the container element for full control:

| Property | Default | Description |
|----------|---------|-------------|
| `--kav-cc-bg` | `rgba(0,0,0,0.8)` | Caption background |
| `--kav-cc-text` | `#FFFFFF` | Caption text color |
| `--kav-cc-font` | `system-ui, sans-serif` | Font family |
| `--kav-cc-size` | `18px` | Font size |
| `--kav-cc-line-height` | `1.4` | Line height |
| `--kav-cc-letter-spacing` | `normal` | Letter spacing |
| `--kav-cc-word-spacing` | `normal` | Word spacing |
| `--kav-cc-text-shadow` | `none` | Character edge / drop shadow |
| `--kav-cc-text-stroke` | `unset` | Text outline stroke |
| `--kav-cc-text-align` | `center` | Text alignment |
| `--kav-cc-padding` | `8px 16px` | Caption box inner padding |
| `--kav-cc-padding-x` | `12.5%` | Horizontal margin from container edges |
| `--kav-cc-align` | `center` | Container flex alignment |
| `--kav-cc-fade-in` | `120ms` | Fade-in duration |
| `--kav-cc-fade-out` | `200ms` | Fade-out duration |
| `--kav-cc-lines` | `2` | Max lines (affects min-height) |

---

## Conversation Memory

The avatar automatically remembers prior conversations with the same user. This is entirely server-side — no client API needed.

**How it works:** The server associates conversations with the `clientId` + `flowId` combination. When the same user reconnects, the avatar recalls previous interactions and can reference them naturally.

**Key points:**
- Memory is automatic — no setup required
- Keyed by `clientId` + `flowId` (same user + same avatar = memory)
- No client-side storage (not localStorage, not cookies)
- No events fired when memory is loaded — the avatar just "knows"
- No API to read, clear, or manipulate memory from the client
- To create a "fresh" session with no memory, use a different `clientId`

---

## Error Codes

When something goes wrong, the `'error'` event gives you an `AvatarError` with a numeric code:

| Code | Name | What Happened | What To Do |
|------|------|---------------|-----------|
| 1001 | CONNECTION_FAILED | Couldn't connect to server | Check network, verify clientId |
| 1002 | CONNECTION_TIMEOUT | Server didn't respond in time | Increase `connectionTimeout` or check network |
| 1003 | CONNECTION_LOST | Connection dropped during session | SDK will auto-reconnect if enabled |
| 1004 | JOIN_FAILED | Couldn't join the room | Check flowId |
| 1005 | FLOW_CONFIG_ERROR | Invalid clientId or flowId | Double-check your credentials in Kaltura Studio |
| 2001 | MIC_PERMISSION_DENIED | User blocked microphone | SDK continues in text-only mode |
| 2002 | MIC_NOT_AVAILABLE | No microphone found | SDK continues in text-only mode |
| 2003 | WHEP_NEGOTIATION_FAILED | Video stream setup failed | SDK falls back to audio-only |
| 2004 | WEBRTC_FAILED | WebRTC connection failed | Check firewall/network |
| 2005 | VIDEO_PLAYBACK_FAILED | Browser can't play the video | Usually autoplay policy — user interaction required |
| 3001 | INVALID_STATE | Called a method at the wrong time | e.g., `sendText()` before `connect()` |
| 3003 | ALREADY_DESTROYED | Used SDK after `destroy()` | Create a new instance |
| 4002 | SESSION_EXPIRED | Server ended the session | Start a new session |
| 4003 | CONVERSATION_TIME_EXPIRED | Time limit reached | Start a new session |
| 5001 | INVALID_CONFIG | Bad configuration | Check the error message for details |
| 5002 | CONTAINER_NOT_FOUND | CSS selector doesn't match anything | Check your `container` value |
| 5003 | INVALID_DPP_JSON | DPP data isn't valid JSON | Fix the JSON string |

---

## How It Works (Under the Hood)

If you're curious what happens when you call `sdk.connect()`:

```
1. Socket.IO connects to the avatar server
2. Server responds with "onServerConnected"
3. SDK joins a room (like joining a video call)
4. Server responds with "joinComplete"
5. SDK requests a new avatar session (with video mode)
6. Server responds with a session ID
7. SDK negotiates WebRTC video (WHEP protocol)
8. Video starts streaming to your <video> element
9. SDK requests microphone permission
10. Once both video + mic are ready → SDK tells server "approvedPermissions"
11. Avatar starts speaking its greeting
12. You're in a conversation!
```

---

## Graceful Degradation

The SDK handles failures automatically:

| What Fails | What Happens | User Experience |
|------------|--------------|-----------------|
| Video stream | Falls back to audio-only | User hears avatar but doesn't see it |
| Microphone denied | Switches to text-only mode | User types instead of speaks |
| Connection drops | Auto-reconnects (up to 5 times) | Brief pause, then continues |
| All reconnects fail | Emits error event | You decide what to show |

---

## Multiple Avatars on One Page

Each SDK instance is fully independent:

```javascript
const coach = new KalturaAvatarSDK({ clientId: ID, flowId: 'coach', container: '#left' });
const expert = new KalturaAvatarSDK({ clientId: ID, flowId: 'expert', container: '#right' });

await Promise.all([coach.connect(), expert.connect()]);
```

---

## CDN URL

Load directly from GitHub via jsDelivr (no npm install needed):

```html
<script src="https://cdn.jsdelivr.net/gh/kaltura/conversational-avatar-embed-sdk@latest/sdk-socket/dist/kaltura-avatar-sdk.js"></script>
```

Pin to a specific version:
```html
<script src="https://cdn.jsdelivr.net/gh/kaltura/conversational-avatar-embed-sdk@v2.0.0/sdk-socket/dist/kaltura-avatar-sdk.js"></script>
```

---

## Browser Support

Chrome 72+ · Firefox 68+ · Safari 14+ · Edge 79+

Requires: WebRTC, getUserMedia, fetch API

---

## Running Tests

```bash
cd sdk-socket
npm install
npm test           # Unit + GenUI tests (125 tests, runs in ~2 seconds)
npm run test:live  # Live integration tests (connects to real server)
npm run test:all   # All tests
```

---

## License

MIT
