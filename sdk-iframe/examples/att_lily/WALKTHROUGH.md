# AT&T Seller Hub: What Changed and Why

**A walkthrough for Alon** — comparing your original `hr_avatar/index.html` with the refactored `att_lily/` version.

Everything below is structured so you can read it top-to-bottom or jump to the section you care about. Each change includes **what** we did, **why** we did it, and a **before/after** code snippet so you can see the exact difference.

---

## Table of Contents

1. [File Structure — Why We Split the Code](#1-file-structure)
2. [Avatar Integration — SDK vs Raw iframe](#2-avatar-integration)
3. [State Management — Globals vs Centralized State](#3-state-management)
4. [Configuration — Scattered vars vs Frozen Config](#4-configuration)
5. [DPP Injection — postMessage vs SDK Method](#5-dpp-injection)
6. [Main Avatar DPP — We Added One](#6-main-avatar-dpp)
7. [Knowledge Checks — 3 Broad to 9 Focused](#7-knowledge-checks)
8. [External DPP Files — Inline JS vs JSON](#8-external-dpp-files)
9. [SME Escalation — More Triggers, Better UX](#9-sme-escalation)
10. [Post-Call Analysis — Silent Email vs Visual Report](#10-post-call-analysis)
11. [Modal UX — Escape Key and Confirm Dialogs](#11-modal-ux)
12. [Call-End Detection — Added Phrase Matching](#12-call-end-detection)
13. [Event Listeners — Inline onclick vs addEventListener](#13-event-listeners)
14. [Lambda Backend — New Modes Added](#14-lambda-backend)
15. [Takeaways — Patterns You Can Reuse](#15-takeaways)

---

<a id="1-file-structure"></a>
## 1. File Structure — Why We Split the Code

### Before (your version)
```
hr_avatar/
  index.html          ← All HTML + all JS inline in one <script> block
  hr-demo.css         ← Styles
```

All ~634 lines of HTML and JavaScript lived in a single `index.html`. The `<script>` tag at the bottom contained every function, every config variable, and every event handler.

### After (att_lily/)
```
att_lily/
  index.html          ← Pure HTML structure (163 lines, zero JS)
  att-demo.js         ← All application logic (separate file)
  att-demo.css        ← Styles (separate file)
  base_prompt.txt     ← Avatar system prompt (version-controlled)
  dynamic_page_prompt_samples/
    wireless_unlimited-plans.json
    wireless_5g-network.json
    ... (9 files)
```

### Why this matters

**Cacheability.** When HTML and JS are in one file, the browser re-downloads everything on every page load (you even have `Cache-Control: no-cache` headers). With separate files + a `?v=` query string, the browser caches `att-demo.js` until the version bumps. Only the HTML reloads each time.

**Readability.** Finding a function in a 634-line mixed HTML/JS file means scrolling past all the markup. With separation, you open `att-demo.js` and every line is logic.

**Collaboration.** Two people can edit CSS and JS simultaneously without merge conflicts in the same file.

**Debugging.** Browser DevTools source panel shows `att-demo.js` as its own file with proper line numbers, instead of an anonymous `<script>` block inside HTML.

---

<a id="2-avatar-integration"></a>
## 2. Avatar Integration — SDK vs Raw iframe

### Before — direct iframe in HTML
```html
<!-- Your version: hardcoded iframe tag -->
<iframe id="main-iframe"
  src="https://meet.avatar.us.kaltura.ai/68f91b1f8d6dc1fb0d87f65b/talk-to-agent?aiclid=awuJ0s1h&flow_id=agent-21"
  allow="camera ...; microphone ...; display-capture ..."
  sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
  style="width:100%;height:100%;border:none;border-radius:12px;">
</iframe>
```

And for events:
```js
// Your version: raw postMessage listener
window.addEventListener('message', function(e) {
    var data = e.data;
    if (!data || data.issuer !== 'eself-conversation-events') return;
    // manual routing based on data.event strings...
});
```

### After — KalturaAvatarSDK constructor
```js
// Our version: typed SDK with event handlers
state.mainSDK = new KalturaAvatarSDK({
    clientId: CONFIG.MAIN_AVATAR.CLIENT_ID,
    flowId:   CONFIG.MAIN_AVATAR.FLOW_ID,
    containerId: 'avatar-container',
    events: {
        SHOWING_AGENT:      () => { /* inject DPP */ },
        AGENT_TALKED:       (data) => { /* add to transcript */ },
        USER_TRANSCRIPTION: (data) => { /* add to transcript */ },
        CONVERSATION_ENDED: () => { /* handle end */ }
    }
});
```

### Why this is better

| Aspect | Raw iframe | SDK |
|--------|-----------|-----|
| **URL management** | You hardcode the full URL. If Kaltura changes path format, you manually update it. | SDK builds the URL from `clientId` + `flowId`. URL changes are transparent. |
| **Event handling** | You listen on `window.message` and manually filter by `issuer`. You need to know the internal event protocol (`eself-conversation-events`, `eself-dynamic-prompt-message`). | SDK gives you named event handlers. You don't need to know the wire protocol. |
| **iframe lifecycle** | You manually set `src = 'about:blank'` and then restore the URL with `setTimeout`. Fragile. | You call `sdk.end()` and `sdk.start()`. The SDK handles cleanup. |
| **DPP injection** | `iframe.contentWindow.postMessage({type: 'eself-dynamic-prompt-message', content: p}, '*')` — you need to know the exact message format. | `sdk.injectPrompt(jsonString)` — one method call. |

**Key lesson:** When an SDK exists, prefer it over raw primitives. The SDK abstracts protocol details that can change between versions. If Kaltura changes their internal `postMessage` format tomorrow, your raw iframe code breaks silently. The SDK version keeps working because Kaltura updates the SDK to match.

---

<a id="3-state-management"></a>
## 3. State Management — Globals vs Centralized State

### Before — loose globals
```js
// Your version: scattered var declarations
var transcripts = { main: [], check: [] };
var activeIframe = null;
var pendingPrompt = null;
var activeCheckKey = null;
var lastReportData = null;
var lastReportTitle = '';
var userEmail = localStorage.getItem('att_hub_email') || '';
```

### After — single state object
```js
// Our version: centralized state container
const state = {
    userEmail: null,

    // Main avatar
    mainSDK: null,
    mainActive: false,
    mainEnding: false,
    mainSessionId: 0,
    mainTranscript: [],

    // Knowledge check
    checkSDK: null,
    activeCheck: null,
    checkDPP: null,
    checkActive: false,
    checkEnding: false,
    checkSessionId: 0,
    checkTranscript: [],

    // SME timers
    mainSMETimer: null,
    checkSMETimer: null,

    // Report cache
    lastReport: null,
    lastReportProduct: null
};
```

### Why this is better

1. **Discoverability.** When debugging, `console.log(state)` shows you every piece of app state in one dump. With loose globals, you have to remember each variable name.

2. **Naming clarity.** Your `activeIframe` serves double duty — it tracks "is a check modal open?" AND "which iframe should I postMessage to?" Our version splits this into `state.checkSDK` (the SDK instance) and `state.activeCheck` (the check metadata). Each variable does one thing.

3. **No accidental collisions.** With `var` at the top level, every function shares the same global namespace. If you accidentally reuse a name (like `text` or `data`), you get silent bugs. With a `const state = {}`, all mutable state lives in one namespace.

4. **Session counters.** We added `mainSessionId` and `checkSessionId` — monotonically increasing counters that prevent stale timeouts from firing into a new session. This solves a subtle bug: if a user starts a call, the call ends, the analysis fires on a 2-second delay, and the user starts a *new* call within those 2 seconds, the old timeout would corrupt the new session. The session counter guards against this.

---

<a id="4-configuration"></a>
## 4. Configuration — Scattered vars vs Frozen Config

### Before
```js
var MAIN_AVATAR_URL = 'https://meet.avatar.us.kaltura.ai/68f91b1f8d6dc1fb0d87f65b/talk-to-agent?aiclid=awuJ0s1h&flow_id=agent-21';
var CHECK_AVATAR_URL = 'https://meet.avatar.us.kaltura.ai/695cd19880ea19bd1b816a08/talk-to-agent?aiclid=ShK7BV3X&flow_id=agent-87';
var PROXY_URL = 'http://localhost:8090';
```

### After
```js
const CONFIG = Object.freeze({
    VERSION: '1.0.2',
    MAIN_AVATAR: Object.freeze({
        CLIENT_ID: '68f91b1f8d6dc1fb0d87f65b',
        FLOW_ID: 'agent-21'
    }),
    CHECK_AVATAR: Object.freeze({
        CLIENT_ID: '695cd19880ea19bd1b816a08',
        FLOW_ID: 'agent-87'
    }),
    ANALYSIS_API_URL: 'https://30vsmo8j0l.execute-api.us-west-2.amazonaws.com',
    DPP_INJECTION_DELAY_MS: 500,
    AVATAR_NAMES: Object.freeze({
        general: 'Lily',
        wireless: 'Morgan',
        fiber: 'Alex',
        cc: 'Casey'
    })
});
```

### Why

- **`Object.freeze()`** prevents accidental mutation. If a function somewhere does `CONFIG.VERSION = 'oops'`, it silently fails (or throws in strict mode). Your `var` declarations can be reassigned from anywhere.

- **`const` vs `var`.** `const` makes the binding immutable. `var` can be reassigned, re-declared, and it hoists to the function scope (not block scope), which causes subtle bugs in loops and conditionals.

- **Nested structure.** `CONFIG.MAIN_AVATAR.CLIENT_ID` is self-documenting. `MAIN_AVATAR_URL` (a full URL string) hides the fact that two pieces of data (client ID and flow ID) are embedded in it. When using the SDK, you need them separately.

- **Named constants for magic numbers.** `DPP_INJECTION_DELAY_MS: 500` tells you what the 500 means. In your version, the `500` just appears in a `setTimeout` with no label.

---

<a id="5-dpp-injection"></a>
## 5. DPP Injection — postMessage vs SDK Method

### Before
```js
// Your version: manual postMessage injection
if (data.event === 'showing-agent' && pendingPrompt) {
    var p = pendingPrompt, t = activeIframe;
    pendingPrompt = null;
    setTimeout(function() {
        if (t && t.contentWindow)
            t.contentWindow.postMessage({
                type: 'eself-dynamic-prompt-message',
                content: p
            }, '*');
    }, 500);
}
```

### After
```js
// Our version: SDK method call
SHOWING_AGENT: () => {
    const dpp = buildCheckDPP();  // or buildMainDPP()
    setTimeout(() => {
        sdk.injectPrompt(JSON.stringify(dpp));
    }, CONFIG.DPP_INJECTION_DELAY_MS);
}
```

### What changed

1. **No raw protocol knowledge.** You had to know that the message type is `'eself-dynamic-prompt-message'` and the payload goes in a `content` field. That's an internal implementation detail. The SDK wraps it in `injectPrompt()`.

2. **No iframe reference juggling.** You tracked `activeIframe` and guarded with `if (t && t.contentWindow)`. The SDK manages its own iframe internally.

3. **No `postMessage(…, '*')`**. Using `'*'` as the target origin is a security concern — it broadcasts to any origin. The SDK sends to the correct origin internally.

4. **Named delay constant.** `CONFIG.DPP_INJECTION_DELAY_MS` instead of a bare `500`.

---

<a id="6-main-avatar-dpp"></a>
## 6. Main Avatar DPP — We Added One

### Before
Your main avatar (Lily) ran on its base flow with **no DPP injection at all**. The iframe loaded the URL and Lily just spoke from her base prompt without any runtime context.

### After
```js
function buildMainDPP() {
    return {
        v: '1',
        inst: ['AT&T GENERAL COACH'],
        product: 'AT&T Products',
        candidate: {
            name: '',
            email: state.userEmail || ''
        }
    };
}
```

This DPP is injected on `SHOWING_AGENT`, just like the check avatar DPP.

### Why this matters

The `inst[0]` value `"AT&T GENERAL COACH"` is a **persona trigger**. The base prompt (`base_prompt.txt`) reads `inst[0]` to determine which persona to activate:

```
inst[0] = "AT&T GENERAL COACH"  → Lily (open coaching conversation)
inst[0] = "AT&T WIRELESS CHECK" → Morgan (structured 5-question quiz)
inst[0] = "AT&T FIBER CHECK"    → Alex (structured 5-question quiz)
inst[0] = "AT&T CC CHECK"       → Casey (structured 5-question quiz)
```

Without DPP injection, the avatar doesn't know which persona to load. It falls back to whatever default the flow has. By explicitly injecting `"AT&T GENERAL COACH"`, we ensure Lily's persona activates reliably every time.

We also pass `candidate.email` so the avatar can personalize the conversation (e.g., "Hi there! I see you're logged in as sarah@att.com").

---

<a id="7-knowledge-checks"></a>
## 7. Knowledge Checks — 3 Broad to 9 Focused

### Before — 3 checks
```js
var CHECKS = {
    wireless: { title: 'AT&T Wireless Knowledge Check', dpp: { ... } },
    fiber:    { title: 'AT&T Fiber Knowledge Check',    dpp: { ... } },
    cc:       { title: 'AT&T Contact Center Knowledge Check', dpp: { ... } }
};
```

Each check was one broad topic with 5 general questions covering everything in that category.

### After — 9 checks (3 per category)
```
Wireless:         Unlimited Plans | 5G & Network | Device Trade-In
Fiber:            Internet Plans  | Fiber vs Cable | Bundle Offers
Contact Center:   CCaaS Overview  | Five9 & AI    | Solution Mapping
```

### Why we expanded

**Depth over breadth.** Your wireless check asked about *everything* — plan tiers, 5G, FirstNet, trade-ins, and competitive positioning — in 5 questions. That's one question per massive topic. The trainee gets surface-level assessment on all five.

Our version splits wireless into 3 focused checks of 5 questions each. Now each topic gets 5 dedicated questions that go deeper:

```
Your version (1 check, broad):
  Q1: What are the AT&T Unlimited plan tiers?
  Q2: What is AT&T 5G?
  Q3: What is FirstNet?
  Q4: Describe the device trade-in deal
  Q5: How do you respond to Verizon objection?

Our version (3 checks, focused — Unlimited Plans only):
  Q1: List the three unlimited tiers and their price points
  Q2: What differentiates Unlimited Premium from Extra?
  Q3: Explain hotspot data allocation per tier
  Q4: Customer on Starter wants to upgrade — walk through the pitch
  Q5: How does AT&T Unlimited compare to T-Mobile Go5G Plus?
```

The focused version reveals whether someone *actually* knows the product vs. can recite a one-line answer.

### Card display change

Your version used product photos (`<img>` tags with external URLs). We use emoji icons instead:

```
Before: <img src="https://sm.pcmag.com/pcmag_me/news/..." alt="AT&T Wireless">
After:  📶 (emoji in the card header)
```

**Why:** External image URLs break when the source site changes or adds hotlink protection. Emojis are self-contained and load instantly with zero HTTP requests.

---

<a id="8-external-dpp-files"></a>
## 8. External DPP Files — Inline JS vs JSON

### Before — DPP inline in JavaScript
```js
var CHECKS = {
    wireless: {
        dpp: {
            inst: ['AT&T WIRELESS CHECK — Run a 5-question product knowledge assessment...'],
            product: 'AT&T Wireless',
            mtg: {
                q_add: [
                    'What are the AT&T Unlimited plan tiers...?',
                    'What is AT&T 5G...?',
                    // ...
                ]
            }
        }
    }
};
```

### After — DPP in external JSON files
```
dynamic_page_prompt_samples/
  wireless_unlimited-plans.json
  wireless_5g-network.json
  fiber_internet-plans.json
  ...
```

Each file is pure JSON:
```json
{
    "v": "1",
    "inst": ["AT&T WIRELESS CHECK"],
    "product": "AT&T Unlimited Plans",
    "mtg": {
        "q_add": [
            "List the three current AT&T Unlimited tiers...",
            "What differentiates Unlimited Premium from Extra?",
            ...
        ]
    }
}
```

The JS just references the file path:
```js
const CHECKS = Object.freeze([
    {
        id: 'wireless_unlimited-plans',
        title: 'Unlimited Plans',
        file: 'dynamic_page_prompt_samples/wireless_unlimited-plans.json',
        // ...
    }
]);
```

And loads it at runtime:
```js
const response = await fetch(check.file);
state.checkDPP = await response.json();
```

### Why this is better

1. **Non-developers can edit questions.** A product manager can open `wireless_unlimited-plans.json` in any text editor, change a question, and save. They don't need to understand JavaScript syntax, worry about breaking commas, or navigate a 600-line HTML file.

2. **JSON validates cleanly.** JSON has strict syntax rules — any editor or linter will catch a missing comma or bracket. JavaScript object literals inside a `var` statement are harder to validate in isolation.

3. **Lazy loading.** Your version loads ALL check DPP data into memory on page load, even if the user never opens a check. Our version fetches only the one JSON file the user clicks on.

4. **Version control.** Each check has its own file with its own git history. You can see exactly when "wireless unlimited plans" questions were last updated without reading through diffs of the entire codebase.

---

<a id="9-sme-escalation"></a>
## 9. SME Escalation — More Triggers, Better UX

### Trigger phrases

**Before — 2 phrases:**
```js
var SME_TRIGGERS = ['i need more help', 'can i speak to a subject matter expert'];
```

**After — 8 phrases:**
```js
const SME_TRIGGERS = [
    'i need help', 'i need more help',
    'can i speak to', 'talk to an expert',
    'subject matter expert', 'talk to a person',
    'i don\'t know', 'can you transfer me'
];
```

**Why:** Real users don't say "can i speak to a subject matter expert" — that's very specific phrasing. They say "I don't know" or "can you transfer me?" or just "I need help." More trigger phrases means less frustration when a user genuinely needs escalation.

### Button label

**Before — static label:**
```html
<button class="sme-btn" onclick="talkToSME()">📞 Talk to SME</button>
```

**After — context-aware label:**
```js
// Label changes based on what session is active
"📞 Talk to Wireless Expert"    // during wireless check
"📞 Talk to Fiber Expert"       // during fiber check
"📞 Talk to Sales Expert"       // during main avatar session
```

**Why:** "Talk to SME" means nothing to a new employee. "Talk to Wireless Expert" tells them exactly who they're connecting to.

### Click action

**Before — browser alert:**
```js
function talkToSME() {
    alert('Connecting you to a Subject Matter Expert...\n\nReplace this with your SME routing URL.');
}
```

**After — polished toast notification:**
```html
<div id="sme-toast" class="sme-toast">
    <div class="sme-toast-header">
        <div class="sme-toast-icon">📞</div>
        <span class="sme-toast-title">Connecting to Expert...</span>
    </div>
    <div class="sme-toast-body">
        In production, this routes to your nearest product specialist via Teams or Slack.
    </div>
    <div class="sme-toast-progress">
        <div class="sme-toast-progress-bar"></div> <!-- 4s countdown animation -->
    </div>
</div>
```

**Why:** `alert()` blocks the entire page. The user can't interact with the avatar, can't read the transcript, can't do anything until they click OK. A toast notification is non-blocking — it slides in, shows for 4 seconds with a progress bar countdown, and auto-dismisses. The avatar conversation continues uninterrupted.

---

<a id="10-post-call-analysis"></a>
## 10. Post-Call Analysis — Silent Email vs Visual Report

### Before — main avatar ends → silent email
```js
if (source === 'main') {
    fetch(PROXY_URL, {
        method: 'POST',
        body: JSON.stringify({
            analysis_mode: 'call_summary_email',
            to_email: userEmail,
            transcript: formatted
        })
    }).then(function(r) { return r.json(); })
      .then(function(res) {
          if (res.success) console.log('[email] call summary sent to', userEmail);
      });
}
```

The user sees nothing. A summary email is sent to `localhost:8090` (a local litellm proxy that forwards to an email service). If the proxy isn't running, it fails silently.

### After — main avatar ends → visual coaching report
```js
// Main session → visual report (same as knowledge checks, different analysis mode)
fetch(CONFIG.ANALYSIS_API_URL, {
    method: 'POST',
    body: JSON.stringify({
        analysis_mode: 'general',
        transcript: formatted,
        product: 'AT&T Products'
    })
}).then(r => r.json())
  .then(result => {
      if (result.success) showReport(result.summary);
  });
```

The user gets the same rich report modal as knowledge checks: grade circle, score, strong/weak spots, study suggestions — but tailored to a free-form coaching session rather than a structured quiz.

### Why we changed this

1. **No local proxy dependency.** Your version requires `localhost:8090` to be running. Our version calls the same AWS Lambda that handles knowledge checks — it's always available.

2. **Immediate feedback.** The whole point of a training session is learning. Showing results immediately (while the conversation is fresh in mind) is more valuable than an email they read hours later.

3. **Consistency.** Knowledge checks showed a visual report; main sessions sent a silent email. This inconsistency was confusing. Now both session types show the same report format.

---

<a id="11-modal-ux"></a>
## 11. Modal UX — Escape Key and Confirm Dialogs

### Before
- Close knowledge check: click X button or click backdrop. No confirmation.
- Close with Escape key: not supported.

### After
- Close knowledge check: click X, click backdrop, OR press Escape. All three show a confirmation dialog first:

```js
function closeCheckModal() {
    if (state.checkActive && !confirm('End the current knowledge check?')) return;
    // ... cleanup
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeCheckModal();
});
```

### Why

**Preventing accidental loss.** A user 3 minutes into a knowledge check accidentally clicks outside the modal — their entire session is lost. The `confirm()` dialog gives them a chance to say "wait, I didn't mean that."

**Keyboard accessibility.** Power users expect Escape to close modals. It's a standard UI convention (WAI-ARIA modal pattern).

---

<a id="12-call-end-detection"></a>
## 12. Call-End Detection — Added Phrase Matching

### Before
Your version relied solely on the SDK's `conversation-ended` event:
```js
if (data.event === 'conversation-ended') {
    // handle end
}
```

### After
We watch for call-ending phrases in the avatar's speech as a **backup trigger**:
```js
const END_CALL_PHRASES = [
    'ending call now',
    'ending the call now',
    'end the call now',
    'ending this call',
    'ending our call'
];

function checkCallEndTrigger(text, target) {
    const lower = text.toLowerCase();
    if (END_CALL_PHRASES.some(phrase => lower.includes(phrase))) {
        state[target + 'Ending'] = true;
        setTimeout(() => handleEnd(target), 2000);
    }
}
```

### Why

The `CONVERSATION_ENDED` SDK event sometimes fires late or not at all (network glitches, iframe unload race conditions). The base prompt instructs the avatar to say "Ending call now." at the end of every session. By detecting that phrase in the transcript, we can trigger the post-call analysis flow even if the SDK event doesn't fire. It's a belt-and-suspenders approach:

1. Avatar says "Ending call now." → phrase detection fires → analysis starts
2. SDK fires `CONVERSATION_ENDED` → if analysis hasn't started yet, it starts now
3. `state.mainEnding` / `state.checkEnding` flag prevents duplicate handling

---

<a id="13-event-listeners"></a>
## 13. Event Listeners — Inline onclick vs addEventListener

### Before — inline handlers
```html
<div class="product-card" onclick="startCheck('wireless')">
<button onclick="closeCheck()">✕</button>
<button onclick="talkToSME()">📞 Talk to SME</button>
<button onclick="downloadTranscript('main')">Download TXT</button>
```

### After — event delegation and addEventListener
```html
<!-- HTML is clean — no JS in markup -->
<div class="cards-grid" id="cards-grid">
    <!-- Cards rendered by JS -->
</div>
```

```js
// JS attaches listeners
document.getElementById('cards-grid').addEventListener('click', (e) => {
    const card = e.target.closest('[data-check-id]');
    if (card) openCheck(card.dataset.checkId);
});

document.getElementById('check-modal-close').addEventListener('click', closeCheckModal);
document.getElementById('main-sme-btn').addEventListener('click', () => handleSMEClick('main'));
```

### Why

1. **Separation of concerns.** HTML defines structure. JS defines behavior. When they're mixed, changing one means editing the other.

2. **Event delegation.** Instead of 9 `onclick` handlers (one per card), we put one listener on the parent `.cards-grid`. When a card is clicked, the event bubbles up, and we find the clicked card with `e.target.closest('[data-check-id]')`. This works even for cards added dynamically after page load.

3. **No global function requirement.** `onclick="startCheck('wireless')"` requires `startCheck` to be a global function. With `addEventListener`, the function can be scoped inside a module or IIFE — better encapsulation.

4. **Content Security Policy (CSP).** Inline event handlers are blocked by strict CSP policies (`script-src` without `'unsafe-inline'`). `addEventListener` works with any CSP.

---

<a id="14-lambda-backend"></a>
## 14. Lambda Backend — New Modes Added

### Before
Your frontend used two Lambda modes:
- `knowledge_check` → visual report for checks
- `call_summary_email` → silent email via local proxy for main avatar

### After
We added/changed:

| Mode | What it does | Why we added it |
|------|-------------|-----------------|
| `general` | Structured coaching report with grade, score, strong/weak spots | Powers the visual report for main avatar sessions |
| `call_summary_email` | Now an alias for `training_summary` in Lambda | Backward compatibility — your existing code still works |
| `training_summary` | Prose summary (max 250 words) | Kept for email use cases |

The `general` mode prompt instructs Claude to evaluate a free-form coaching conversation and return the same JSON schema as `knowledge_check` (grade, score, spots, suggestions) but adapted for unstructured dialogue rather than a quiz.

---

<a id="15-takeaways"></a>
## 15. Takeaways — Patterns You Can Reuse

Here are the key patterns from this refactor that apply to any project:

### Use the SDK, not raw iframes
If there's an SDK available for an integration, use it. Raw `postMessage` and `iframe.src` manipulation is fragile and ties you to internal implementation details.

### Separate HTML from JS
Put JS in `.js` files. Put CSS in `.css` files. Keep HTML as pure structure. This is the most basic web development best practice, and it pays off immediately in readability and maintainability.

### Centralize state
One `state` object is infinitely easier to debug than scattered global variables. `console.log(state)` gives you the full picture.

### Freeze your config
`Object.freeze()` + `const` prevents accidental mutation of configuration values. If you're not going to change it at runtime, make it immutable.

### Use `const` and `let`, not `var`
`var` hoists to function scope and can be re-declared. `const` and `let` are block-scoped and predictable. Use `const` by default; `let` only when you need reassignment.

### External data files for non-developers
If product managers, trainers, or other non-developers need to edit content (like quiz questions), put that content in JSON files. Don't make them edit JavaScript.

### Belt-and-suspenders for critical events
If an event is critical (like "session ended"), don't rely on a single signal. Watch for it from multiple sources (SDK event + phrase detection) and deduplicate with a flag.

### Toast > alert()
Never use `alert()` in production UI. It blocks the entire page. Toast notifications are non-blocking and look professional.

### Confirm before destructive actions
If closing a modal loses data (like an in-progress session), ask the user to confirm first. One `confirm()` call prevents hours of frustration.

### Event delegation
One listener on a parent element beats N listeners on N children. It's more performant, works with dynamic content, and keeps your HTML clean.

---

*This document was generated from a side-by-side comparison of the two codebases. If you have questions about any specific change, the code is the source of truth — `att_lily/att-demo.js` for the logic, `att_lily/att-demo.css` for the styles, and `att_lily/base_prompt.txt` for the avatar system prompt.*
