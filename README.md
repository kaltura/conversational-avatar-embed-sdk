# Kaltura Conversational Avatar Embed SDK

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

## Use This Repo as an AI Skill

This repository is designed to work as an instant skill for AI coding agents (Claude, ChatGPT, Copilot, etc.). Point your agent at this repo and ask it to build something — it will understand the full SDK, advanced patterns, and how to write the avatar's Knowledge Base prompt.

### Claude Code / Claude Projects

Add this repo as context, then prompt:

```
Build me a customer support avatar using this SDK.
My Kaltura client ID is: 123456
My flow ID is: agent-7
```

Claude reads `AGENTS.md` automatically (via `CLAUDE.md` → `@AGENTS.md`) and generates both the app code **and** the Knowledge Base prompt for Kaltura Studio.

### Any AI Agent (ChatGPT, Copilot, etc.)

Paste the contents of [`AGENTS.md`](AGENTS.md) into your system prompt or project knowledge, then ask:

```
Using the Kaltura Avatar SDK, build me a product training quiz
that asks 5 questions, gives feedback after each, and ends with
a score summary. My avatar ID is XYZ.
```

The agent will generate:
1. **HTML + JavaScript** — complete app with DPP injection, spoken command detection, and UI
2. **Knowledge Base prompt** — paste directly into Kaltura Studio (RICECO-structured)

### What the AI Agent Will Know

| Capability | Covered |
|-----------|---------|
| Full SDK API (constructor, events, lifecycle, transcript) | Yes |
| Dynamic Prompt Injection (real-time context updates) | Yes |
| Avatar Spoken Commands (trigger JS from speech) | Yes |
| Multi-persona switching via DPP | Yes |
| Visual effects (images, popup links, email collection) | Yes |
| Pronunciation / lexeme instructions | Yes |
| RICECO framework for writing Knowledge Base prompts | Yes |
| Complete working example with fictional company | Yes |
| Pre-ship checklist | Yes |

## Documentation

- [AI Agent Guide](AGENTS.md) — Complete SDK reference + advanced patterns for AI coding agents
- [TypeScript API Reference](sdk/kaltura-avatar-sdk.d.ts) — Complete type definitions
- [Analysis Backend](examples/hr_avatar/lambda/README.md) — Shared Lambda (AWS Bedrock) for all demos
- [Contributing](CONTRIBUTING.md) — How to add a new demo application

## Browser Support

Chrome 60+ · Firefox 55+ · Safari 11+ · Edge 79+

## License

[MIT](LICENSE)
