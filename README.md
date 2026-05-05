# Kaltura Avatar SDK

Embed AI avatar conversations in any website. Real-time video, speech recognition, dynamic context injection, and rich visual content — all from a few lines of JavaScript.

## Two SDKs, One Avatar

| | **SDK v2** (Recommended) | **SDK v1** (Legacy) |
|---|---|---|
| **Connection** | Direct Socket.IO + WebRTC | Iframe + postMessage |
| **Size** | ~45KB (+ Socket.IO peer dep) | ~6KB, zero deps |
| **Video control** | You own the `<video>` element | Iframe-managed |
| **GenUI rendering** | Built-in charts, tables, code, diagrams, video | Events only |
| **Latency** | Lower (no iframe layer) | Standard |
| **CSP** | No `frame-src` needed | Requires `frame-src` |
| **Path** | [`sdk-v2/`](sdk-v2/) | [`sdk/`](sdk/) |

**Use v2 for new projects.** Use v1 if you need maximum simplicity or iframe sandboxing.

---

## Quick Start — SDK v2

```html
<div id="avatar" style="width: 800px; height: 600px; background: #000;"></div>

<script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
<script src="https://cdn.jsdelivr.net/gh/kaltura/conversational-avatar-embed-sdk@latest/sdk-v2/dist/kaltura-avatar-sdk.js"></script>

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

[Full v2 documentation →](sdk-v2/README.md) · [TypeScript API →](sdk-v2/dist/kaltura-avatar-sdk.d.ts)

---

## Quick Start — SDK v1

```html
<div id="avatar" style="width: 800px; height: 600px;"></div>

<script src="https://cdn.jsdelivr.net/gh/kaltura/conversational-avatar-embed-sdk@latest/sdk/kaltura-avatar-sdk.min.js"></script>

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

## Project Structure

```
├── sdk-v2/               ← SDK v2: Direct connection (recommended)
│   ├── dist/             ← Production bundle + TypeScript declarations
│   ├── src/              ← Source code
│   ├── tests/            ← 125 Playwright tests
│   ├── examples/demo/    ← Interactive demo app
│   └── README.md         ← Complete v2 documentation
│
├── sdk/                  ← SDK v1: Iframe-based (legacy)
│   ├── kaltura-avatar-sdk.min.js
│   ├── kaltura-avatar-sdk.js
│   └── kaltura-avatar-sdk.d.ts
│
├── examples/             ← Demo applications (v1)
│   ├── att_lily/         ← AT&T Seller Hub (sales coaching)
│   ├── hr_avatar/        ← HR Avatar (interview simulations)
│   ├── code_interview/   ← Code Interview (pair programming)
│   ├── basic_demo/       ← Minimal starter
│   └── test_harness/     ← SDK testing tool
│
├── AGENTS.md             ← AI Agent guide (complete SDK reference)
└── index.html            ← Landing page (GitHub Pages)
```

## Live Demos

| Demo | Description | Link |
|------|-------------|------|
| **SDK v2 Demo** | Interactive demo with GenUI, events panel, transcript | [Launch](sdk-v2/examples/demo/) |
| **AT&T Seller Hub** | Dual-avatar sales coaching with knowledge checks | [Launch](examples/att_lily/) |
| **HR Avatar** | Interview simulations with AI call analysis | [Launch](examples/hr_avatar/) |
| **Code Interview** | Pair programming with live code context | [Launch](examples/code_interview/) |
| **Basic Demo** | Minimal v1 starter example | [Launch](examples/basic_demo/) |

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

# SDK v2 only (125 unit + GenUI tests)
cd sdk-v2 && npm test

# SDK v1 E2E tests
npm run test:v1
```

## Documentation

- [SDK v2 — Complete Guide](sdk-v2/README.md) — Configuration, events, methods, error codes
- [AI Agent Guide](AGENTS.md) — Full reference for AI coding agents (DPP, commands, RICECO)
- [TypeScript API (v2)](sdk-v2/dist/kaltura-avatar-sdk.d.ts) — Complete type definitions
- [TypeScript API (v1)](sdk/kaltura-avatar-sdk.d.ts) — v1 type definitions
- [Contributing](CONTRIBUTING.md) — How to add demo applications

## Browser Support

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| SDK v2 (WebRTC) | 72+ | 68+ | 14+ | 79+ |
| SDK v1 (iframe) | 60+ | 55+ | 11+ | 79+ |

## License

[MIT](LICENSE)
