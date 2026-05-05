# Kaltura Avatar SDK v2 — Direct Connection

The recommended SDK for embedding Kaltura AI Avatars. Connects directly to the avatar server via Socket.IO + WebRTC — no iframe required. Full control over video, audio, events, and rich visual content.

---

## Why v2?

Compared to the iframe-based v1, this SDK gives you:

- **You own the `<video>` element** — style it, position it, overlay it however you want
- **Lower latency** — no extra iframe message-passing layer
- **Full event access** — see every socket event, state change, and GenUI payload
- **Works in CSP-restricted environments** — no `frame-src` needed
- **Same avatar, same Knowledge Base** — the server-side is identical

---

## Quick Start (5 minutes)

### Step 1: Add two script tags

```html
<!-- Socket.IO (required peer dependency) -->
<script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>

<!-- The SDK -->
<script src="https://cdn.jsdelivr.net/gh/kaltura/conversational-avatar-embed-sdk@latest/sdk-v2/dist/kaltura-avatar-sdk.js"></script>
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
  <script src="https://cdn.jsdelivr.net/gh/kaltura/conversational-avatar-embed-sdk@latest/sdk-v2/dist/kaltura-avatar-sdk.js"></script>
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
| `'avatar-speech'` | Avatar finished saying something | `{ text: "Hello! How can I help?" }` |
| `'avatar-speaking-start'` | Avatar started talking (lips moving) | Nothing |
| `'avatar-speaking-end'` | Avatar stopped talking | Nothing |
| `'user-speech'` | Server recognized what the user said (via mic) | `{ text: "...", isFinal: true/false }` |

**Most important:** `'avatar-speech'` gives you the complete sentence the avatar just said.

```javascript
sdk.on('avatar-speech', ({ text }) => {
  document.getElementById('chat').innerHTML += `<p>Avatar: ${text}</p>`;
});

sdk.on('user-speech', ({ text, isFinal }) => {
  if (isFinal) {
    document.getElementById('chat').innerHTML += `<p>You: ${text}</p>`;
  }
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

### Checking State

```javascript
sdk.getState();          // 'uninitialized', 'connecting', 'in-conversation', etc.
sdk.isConnected();       // true/false
sdk.isInConversation();  // true/false  
sdk.isAvatarSpeaking();  // true while avatar is talking
sdk.getSessionId();      // WebRTC session ID (for debugging)
sdk.getVideoElement();   // The <video> DOM element
sdk.getMicStream();      // The MediaStream from getUserMedia
```

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
<script src="https://cdn.jsdelivr.net/gh/kaltura/conversational-avatar-embed-sdk@latest/sdk-v2/dist/kaltura-avatar-sdk.js"></script>
```

Pin to a specific version:
```html
<script src="https://cdn.jsdelivr.net/gh/kaltura/conversational-avatar-embed-sdk@v2.0.0/sdk-v2/dist/kaltura-avatar-sdk.js"></script>
```

---

## Browser Support

Chrome 72+ · Firefox 68+ · Safari 14+ · Edge 79+

Requires: WebRTC, getUserMedia, fetch API

---

## Running Tests

```bash
cd sdk-v2
npm install
npm test           # Unit + GenUI tests (125 tests, runs in ~2 seconds)
npm run test:live  # Live integration tests (connects to real server)
npm run test:all   # All tests
```

---

## License

MIT
