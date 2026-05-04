# Claude Code Instructions for Kaltura Avatar SDK

@AGENTS.md

## Project Context

This is a JavaScript SDK for embedding Kaltura AI Avatars into web applications. The SDK is a single UMD file (`sdk/kaltura-avatar-sdk.min.js`, ~6KB) with TypeScript declarations (`sdk/kaltura-avatar-sdk.d.ts`).

## Key Patterns

1. **DPP Injection**: Always inject on `SHOWING_AGENT` event with 500ms delay
2. **Spoken Commands**: Avatar says trigger phrases → JS pattern-matches on `AGENT_TALKED` text
3. **Knowledge Base**: Written in Kaltura Studio using RICECO framework (see AGENTS.md)
4. **Transcript**: Capture BEFORE calling `sdk.end()` (end removes the iframe)

## When Users Ask to Build Something

If a user says "Build me X using this SDK" or provides a client ID / flow ID:
1. Read AGENTS.md for the full API and patterns
2. Use the complete example in AGENTS.md as a starting template
3. Customize the DPP structure and avatar spoken commands for their use case
4. Generate both the JavaScript app code AND the Kaltura Studio Knowledge Base prompt

## File Locations

- SDK source: `sdk/kaltura-avatar-sdk.min.js` (production) / `sdk/kaltura-avatar-sdk.js` (dev)
- Types: `sdk/kaltura-avatar-sdk.d.ts`
- Working demos: `examples/` (att_lily, hr_avatar, code_interview, basic_demo)
- Landing page: `index.html`

## Testing

```bash
npm run test:hr        # HR demo E2E (Playwright)
npm run test:code      # Code interview E2E (Playwright)
```

Demos run on any static server: `python3 -m http.server 8080`
