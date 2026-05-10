<p align="center">
  <strong>Kaltura Avatar SDK</strong><br>
  <em>Embed AI-powered video avatar conversations in any website</em>
</p>

<p align="center">
  <a href="https://github.com/kaltura/conversational-avatar-embed-sdk/actions"><img src="https://github.com/kaltura/conversational-avatar-embed-sdk/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <a href="sdk-socket/dist/kaltura-avatar-sdk.d.ts"><img src="https://img.shields.io/badge/types-TypeScript-blue.svg" alt="TypeScript"></a>
  <a href="https://github.com/kaltura/conversational-avatar-embed-sdk/stargazers"><img src="https://img.shields.io/github/stars/kaltura/conversational-avatar-embed-sdk?style=social" alt="GitHub Stars"></a>
</p>

---

Add a real-time AI avatar to your app in under 5 minutes. Users talk to a lifelike video avatar that sees, hears, and responds — with built-in speech recognition, dynamic prompts, and rich visual content (charts, tables, code, diagrams).

**Two integration options** — pick the one that fits your project:

| | **Socket SDK** | **Iframe SDK** |
|---|---|---|
| **Best for** | Full-featured apps needing control over video, events, and visuals | Quick embeds, sandboxed environments, or minimal integration |
| **How it works** | Direct Socket.IO + WebRTC | Iframe + postMessage |
| **You get** | Own the `<video>` element, real-time events, GenUI rendering, plugin system | Zero-config embed, automatic UI, browser sandbox isolation |
| **Size** | ~100KB (+ Socket.IO) | ~6KB, zero dependencies |
| **GenUI** | Built-in renderers for charts, tables, code, diagrams, video, images | Event notifications only |
| **Path** | [`sdk-socket/`](sdk-socket/) | [`sdk-iframe/`](sdk-iframe/) |

> Both SDKs connect to the same Kaltura AI Avatar backend — same avatars, same Knowledge Base, same server-side AI.

---

## Get Started in 60 Seconds

### Socket SDK (full control)

```html
<div id="avatar" style="width: 800px; height: 600px; background: #000;"></div>

<script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
<script src="https://cdn.jsdelivr.net/gh/kaltura/conversational-avatar-embed-sdk@latest/sdk-socket/dist/kaltura-avatar-sdk.js"></script>

<script>
const sdk = new KalturaAvatarSDK({
  clientId: 'YOUR_CLIENT_ID',
  flowId: 'YOUR_FLOW_ID',
  container: '#avatar'
});

sdk.on('avatar-speech', ({ text }) => console.log('Avatar:', text));
sdk.on('user-speech', ({ text, isFinal }) => { if (isFinal) console.log('You:', text); });

sdk.connect();
</script>
```

### Iframe SDK (drop-in simple)

```html
<div id="avatar" style="width: 800px; height: 600px;"></div>

<script src="https://cdn.jsdelivr.net/gh/kaltura/conversational-avatar-embed-sdk@latest/sdk-iframe/kaltura-avatar-sdk.min.js"></script>

<script>
const sdk = new KalturaAvatarSDK({
  clientId: 'YOUR_CLIENT_ID',
  flowId: 'YOUR_FLOW_ID',
  container: '#avatar'
});

sdk.on('showing-agent', () => {
  setTimeout(() => sdk.injectPrompt(JSON.stringify({ greeting: "Hello!" })), 500);
});

sdk.on('agent-talked', (data) => console.log('Avatar:', data.agentContent || data));
await sdk.start();
</script>
```

---

## Key Capabilities

- **Real-time video avatar** — lifelike face, lip-sync, expressions
- **Speech recognition** — built-in mic capture with live transcription
- **Dynamic Prompt Injection (DPP)** — inject JSON context at runtime to control behavior
- **GenUI rendering** (Socket) — charts, tables, code editors, diagrams, videos, images render automatically
- **Avatar spoken commands** — trigger JS functions when the avatar says specific phrases
- **Transcripts** — built-in recording with export to text, markdown, or JSON
- **Auto-reconnect** (Socket) — exponential backoff handles network drops
- **Graceful degradation** (Socket) — falls back to audio-only or text-only automatically
- **Multiple avatars** — run independent instances on the same page
- **TypeScript** — full type definitions for both SDKs

---

## Use with AI Coding Agents

This repo works as an **instant skill** for Claude, ChatGPT, Copilot, Cursor, and any AI coding agent. Point your agent at this repo and describe what you want:

```
Build me a customer onboarding avatar. My client ID is 123456, flow ID is agent-7.
```

The agent generates both the **app code** and the **Knowledge Base prompt** for Kaltura Studio.

See [`AGENTS.md`](AGENTS.md) for the complete AI agent reference including the RICECO prompt framework.

---

## Live Demos

| Demo | SDK | Description |
|------|-----|-------------|
| [Socket SDK Demo](sdk-socket/examples/demo/) | Socket | GenUI rendering, events panel, transcript, full control |
| [AT&T Seller Hub](sdk-iframe/examples/att_lily/) | Iframe | Dual-avatar sales coaching with knowledge checks |
| [HR Avatar](sdk-iframe/examples/hr_avatar/) | Iframe | Interview simulations with AI call analysis |
| [Code Interview](sdk-iframe/examples/code_interview/) | Iframe | Pair programming with live code context |
| [Basic Demo](sdk-iframe/examples/basic_demo/) | Iframe | Minimal starter example |

Run any demo locally: `python3 -m http.server 8080`

---

## Getting Your Client ID and Flow ID

1. Log into [Kaltura Studio](https://studio.kaltura.com) (or your org's instance)
2. Create or select an **AI Avatar agent**
3. Find your **Client ID** and **Flow ID** in Embed / Integration settings

---

## Project Structure

```
sdk-socket/             ← Socket SDK: Direct Socket.IO + WebRTC
  ├── src/              ← Source code
  ├── dist/             ← Production bundle + TypeScript declarations
  ├── tests/            ← 195 Playwright tests
  └── examples/demo/    ← Interactive demo

sdk-iframe/             ← Iframe SDK: Sandboxed iframe embed
  ├── kaltura-avatar-sdk.min.js / .js / .d.ts
  └── examples/         ← Demo applications
      ├── att_lily/     ← AT&T Seller Hub
      ├── hr_avatar/    ← HR Avatar
      ├── code_interview/ ← Code Interview
      └── basic_demo/   ← Minimal starter
```

---

## Running Tests

```bash
npm test                   # All tests (Iframe E2E + Socket unit)
cd sdk-socket && npm test  # Socket SDK only (195 tests, ~15 seconds)
npm run test:iframe        # Iframe SDK E2E only
```

---

## Documentation

| Resource | Description |
|----------|-------------|
| [Socket SDK Guide](sdk-socket/README.md) | Configuration, events, methods, GenUI, error codes |
| [Iframe SDK / AI Agent Guide](AGENTS.md) | Full API reference, DPP patterns, RICECO framework |
| [TypeScript API (Socket)](sdk-socket/dist/kaltura-avatar-sdk.d.ts) | Complete type definitions |
| [TypeScript API (Iframe)](sdk-iframe/kaltura-avatar-sdk.d.ts) | Type definitions |
| [Contributing](CONTRIBUTING.md) | How to contribute and add demos |

---

## Browser Support

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| Socket SDK (WebRTC) | 72+ | 68+ | 14+ | 79+ |
| Iframe SDK | 60+ | 55+ | 11+ | 79+ |

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE) — Kaltura Inc.
