# Kaltura Avatar SDK

> **Note:** This is a non-official, research-level SDK. For official Kaltura SDKs, see [github.com/kaltura](https://github.com/kaltura/).

Embed AI avatar conversations in any website with just a few lines of code.

**Zero dependencies** · **~4KB minified** · **Works everywhere**

## Quick Start

```html
<div id="avatar" style="width: 800px; height: 600px;"></div>
<script src="sdk/kaltura-avatar-sdk.min.js"></script>
<script>
  const sdk = new KalturaAvatarSDK({
    clientId: 'YOUR_CLIENT_ID',
    flowId: 'YOUR_FLOW_ID',
    container: '#avatar'
  });

  await sdk.start();

  sdk.on('agent-talked', (data) => {
    console.log('Avatar said:', data.agentContent || data);
  });
</script>
```

## Project Structure

```
├── sdk/                  ← The SDK (what you ship)
├── examples/             ← Demo applications
│   ├── att_lily/         ← AT&T Seller Hub (sales training)
│   ├── hr_avatar/        ← HR Avatar (interview simulations)
│   ├── code_interview/   ← Code Interview (pair programming)
│   └── basic_demo/       ← Minimal starter example
└── index.html            ← Landing page (GitHub Pages)
```

## Live Demos

| Demo | Description | Link |
|------|-------------|------|
| **AT&T Seller Hub** | Dual-avatar sales coaching with knowledge checks and graded reports | [Launch](examples/att_lily/) · [Docs](examples/att_lily/README.md) |
| **HR Avatar** | Interview simulations, CV upload, AI call analysis | [Launch](examples/hr_avatar/) · [Docs](examples/hr_avatar/README.md) |
| **Code Interview** | AI pair programming with Monaco editor and real-time code context | [Launch](examples/code_interview/) · [Docs](examples/code_interview/README.md) |
| **Basic Demo** | Minimal example showing all SDK features | [Launch](examples/basic_demo/) · [Source](examples/basic_demo/demo.js) |

All demos run via any static server: `python3 -m http.server 8080`

## Key Concepts

**Events** — Subscribe to avatar speech, user transcription, state changes:
```javascript
sdk.on('agent-talked', (data) => { /* avatar spoke */ });
sdk.on('user-transcription', (data) => { /* user spoke */ });
sdk.on('stateChange', ({ from, to }) => { /* lifecycle */ });
```

**Dynamic Page Prompt (DPP)** — Inject JSON context at runtime to customize avatar behavior per session:
```javascript
sdk.on('showing-agent', () => {
  setTimeout(() => sdk.injectPrompt(JSON.stringify(scenarioData)), 500);
});
```

**Transcripts** — Built-in recording with export:
```javascript
sdk.getTranscript();           // Array of {role, text, timestamp}
sdk.downloadTranscript();      // Downloads as file
```

## Documentation

- [AI Agent Guide](AGENTS.md) — Complete SDK reference + advanced patterns for AI coding agents
- [TypeScript API Reference](sdk/kaltura-avatar-sdk.d.ts) — Complete type definitions
- [Analysis Backend](examples/hr_avatar/lambda/README.md) — Shared Lambda (AWS Bedrock) for all demos
- [Contributing](CONTRIBUTING.md) — How to add a new demo application

## Browser Support

Chrome 60+ · Firefox 55+ · Safari 11+ · Edge 79+

## License

[MIT](LICENSE)
