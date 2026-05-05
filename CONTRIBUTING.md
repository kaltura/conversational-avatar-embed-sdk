# Contributing

## Repository Layout

```
├── sdk-v2/              ← SDK v2 (Direct Socket.IO + WebRTC)
│   ├── src/             ← Source code (single UMD file)
│   ├── dist/            ← Built output (JS + TypeScript declarations)
│   ├── tests/           ← Playwright tests (125 tests)
│   └── examples/demo/   ← Interactive demo app
│
├── sdk/                 ← SDK v1 (Iframe-based, legacy)
│
├── examples/            ← Demo applications (using v1)
│   ├── att_lily/        ← AT&T Seller Hub
│   ├── hr_avatar/       ← HR Avatar + shared Lambda backend
│   ├── code_interview/  ← Code Interview
│   └── basic_demo/      ← Minimal starter
│
└── .github/workflows/   ← CI and GitHub Pages deployment
```

## Working on SDK v2

The SDK is a single file at `sdk-v2/src/kaltura-avatar-sdk.js`. After making changes, copy it to `sdk-v2/dist/kaltura-avatar-sdk.js` and run tests:

```bash
cd sdk-v2
cp src/kaltura-avatar-sdk.js dist/kaltura-avatar-sdk.js
npm test          # 125 unit + GenUI tests (< 3 seconds)
npm run test:all  # All tests including live integration
```

Keep `dist/kaltura-avatar-sdk.d.ts` in sync with any API changes.

## Add a New Demo Application (v1)

Each demo lives in its own directory under `examples/`:

```
examples/your_demo/
├── index.html              ← Entry point
├── your-demo.js            ← Application logic
├── your-demo.css           ← Styles
├── base_prompt.txt         ← Avatar Knowledge Base prompt
├── dynamic_page_prompt.schema.json  ← DPP schema (optional)
└── README.md               ← What it does, how to run
```

### Steps

1. Create your directory under `examples/`
2. Add `index.html` that loads the SDK:
   ```html
   <script src="../../sdk/kaltura-avatar-sdk.min.js"></script>
   ```
3. Write your `base_prompt.txt` defining the avatar persona
4. Wire up the SDK (see existing demos for patterns)
5. Add your demo to `README.md` and `index.html`
6. Test locally: `python3 -m http.server 8080`

## Running Tests

```bash
npm test                    # All tests (v1 E2E + v2 unit)
cd sdk-v2 && npm test       # SDK v2 only (fast, ~2 seconds)
npm run test:v1             # SDK v1 E2E only
```

## CI

The GitHub Actions workflow runs on every push and PR:
- **test-v1**: HR Avatar and Code Interview E2E tests
- **test-v2**: 125 unit + GenUI tests
- **lint**: File size checks, JSON schema validation
