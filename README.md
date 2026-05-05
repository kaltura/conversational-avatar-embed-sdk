# Kaltura Avatar SDK

Embed AI avatar conversations in any website. Real-time video, speech recognition, dynamic context injection, and rich visual content — all from a few lines of JavaScript.

## Two Integration Approaches

Choose the SDK that fits your project:

| | **Socket SDK** | **Iframe SDK** |
|---|---|---|
| **Best for** | Full-featured apps needing control over video, events, and visuals | Quick embeds, sandboxed environments, or minimal integration effort |
| **Connection** | Direct Socket.IO + WebRTC | Iframe + postMessage |
| **You get** | Own the `<video>` element, all socket events, GenUI rendering, extensible plugin system | Zero-config embed, automatic UI, browser sandbox isolation |
| **Size** | ~100KB (+ Socket.IO peer dep) | ~6KB, zero dependencies |
| **GenUI** | Built-in renderers for charts, tables, code, diagrams, video, images | Event notifications only (render yourself) |
| **Latency** | Lower (no iframe message-passing layer) | Standard |
| **CSP** | No `frame-src` needed | Requires `frame-src` allow |
| **Path** | [`sdk-socket/`](sdk-socket/) | [`sdk-iframe/`](sdk-iframe/) |

**Choose Socket SDK** when you need: custom video styling, GenUI content rendering, real-time event access, low latency, or CSP-restricted environments.

**Choose Iframe SDK** when you need: drop-in simplicity, iframe sandboxing, minimal bundle size, or a quick proof-of-concept.

Both SDKs connect to the same Kaltura AI Avatar backend — same avatars, same Knowledge Base, same server-side AI.

---

## Quick Start — Socket SDK

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

[Full Socket SDK documentation →](sdk-socket/README.md) · [TypeScript API →](sdk-socket/dist/kaltura-avatar-sdk.d.ts)

---

## Quick Start — Iframe SDK

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

[Iframe SDK API reference →](AGENTS.md) · [TypeScript API →](sdk-iframe/kaltura-avatar-sdk.d.ts)

---

## Project Structure

```
├── sdk-socket/             ← Socket SDK: Direct Socket.IO + WebRTC
│   ├── src/                ← Source code
│   ├── dist/               ← Production bundle + TypeScript declarations
│   ├── tests/              ← 125 Playwright tests
│   └── examples/demo/      ← Interactive demo app
│
├── sdk-iframe/             ← Iframe SDK: Sandboxed iframe embed
│   ├── kaltura-avatar-sdk.min.js
│   ├── kaltura-avatar-sdk.js
│   ├── kaltura-avatar-sdk.d.ts
│   └── examples/           ← Demo applications
│       ├── att_lily/       ← AT&T Seller Hub (sales coaching)
│       ├── hr_avatar/      ← HR Avatar (interview simulations)
│       ├── code_interview/ ← Code Interview (pair programming)
│       └── basic_demo/     ← Minimal starter
│
├── AGENTS.md               ← AI Agent guide (Iframe SDK reference + RICECO)
└── index.html              ← Landing page (GitHub Pages)
```

## Live Demos

| Demo | SDK | Description | Link |
|------|-----|-------------|------|
| **Socket SDK Demo** | Socket | GenUI rendering, events panel, transcript, full control | [Launch](sdk-socket/examples/demo/) |
| **AT&T Seller Hub** | Iframe | Dual-avatar sales coaching with knowledge checks | [Launch](sdk-iframe/examples/att_lily/) |
| **HR Avatar** | Iframe | Interview simulations with AI call analysis | [Launch](sdk-iframe/examples/hr_avatar/) |
| **Code Interview** | Iframe | Pair programming with live code context | [Launch](sdk-iframe/examples/code_interview/) |
| **Basic Demo** | Iframe | Minimal starter example | [Launch](sdk-iframe/examples/basic_demo/) |

All demos run via any static server: `python3 -m http.server 8080`

---

## Use with AI Coding Agents

This repo works as an **instant skill** for AI coding agents. Point your agent at this repo and tell it what to build.

**Claude Code / Claude Projects:**
```
Build me a customer onboarding avatar using this SDK.
My client ID is: 123456, flow ID is: agent-7
```

**ChatGPT / Copilot / Any Agent:** Paste [`AGENTS.md`](AGENTS.md) into your system prompt.

The agent generates both the **app code** and the **Knowledge Base prompt** for Kaltura Studio.

---

## Getting Your Client ID and Flow ID

1. Log into [Kaltura Studio](https://studio.kaltura.com) (or your org's instance)
2. Create or select an **AI Avatar agent**
3. Find your **Client ID** and **Flow ID** in the Embed / Integration settings

---

## Running Tests

```bash
# All tests
npm test

# Socket SDK only (125 unit + GenUI tests, ~2 seconds)
cd sdk-socket && npm test

# Iframe SDK E2E tests
npm run test:iframe
```

## Documentation

- [Socket SDK — Complete Guide](sdk-socket/README.md) — Configuration, events, methods, GenUI, error codes
- [Iframe SDK — AI Agent Guide](AGENTS.md) — Full API reference, DPP patterns, RICECO framework
- [TypeScript API (Socket)](sdk-socket/dist/kaltura-avatar-sdk.d.ts) — Complete type definitions
- [TypeScript API (Iframe)](sdk-iframe/kaltura-avatar-sdk.d.ts) — Type definitions
- [Contributing](CONTRIBUTING.md) — How to add demo applications

## Browser Support

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| Socket SDK (WebRTC) | 72+ | 68+ | 14+ | 79+ |
| Iframe SDK | 60+ | 55+ | 11+ | 79+ |

## License

[MIT](LICENSE)
