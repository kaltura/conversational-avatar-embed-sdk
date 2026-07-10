// @ts-check
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

/**
 * Gate 6 — E2E reproduction of issue #2 (P0: _beforeBuffer rewinds mid-utterance).
 *
 * Exercises the REAL socket-driven `_beforeBuffer` reconciliation inside
 * `_initSocket()` — not the isolated `CommandRegistry` — by faking only the
 * transport (`_socket.on`/`emit` actually store/invoke callbacks, unlike the
 * no-op mocks used elsewhere in sdk-unit.spec.js). This closes the exact
 * coverage gap named in the issue: no existing test drives `generatingSpeech`
 * and `debug_stvTaskGenerated` through the real handlers together, so the
 * GT-rewind interaction was never exercised end-to-end.
 */

const OUTPUT_DIR = path.join(__dirname, '..', '..', '.harness-output', 'gate6');

test.use({ video: 'on', trace: 'on' });

test.beforeAll(() => {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
});

test('registerCommand(timing:before) fires with untruncated text despite empty-delta TTS chunk racing generatingSpeech', async ({ page }) => {
  await page.goto('/tests/e2e/test-runner.html');
  await page.waitForFunction(() => typeof window.KalturaAvatarSDK !== 'undefined');

  // Real SDK instance driving the real _initSocket() handler wiring.
  // Only the transport (io/_socket) is faked — CommandRegistry, the
  // _beforeBuffer/_beforeGT closures, and registerCommand() are all real.
  await page.evaluate(() => {
    const handlers = {};
    const fakeSocket = {
      on(event, cb) {
        // Real storage (not a no-op): lets the test drive the exact
        // backend event ordering that reproduces the bug.
        (handlers[event] = handlers[event] || []).push(cb);
      },
      off() {},
      emit() {},
      disconnect() {},
      connected: true
    };
    window.__handlers = handlers;
    window.__fireEvent = (event, data) => {
      (handlers[event] || []).forEach((cb) => cb(data));
    };

    // Stand in for socket.io-client's `io(...)` factory the SDK calls in
    // connect() -> _initSocket(). Returning fakeSocket wires up every
    // `this._socket.on(...)` registration in the real handler code.
    window.io = () => fakeSocket;

    window.__sdk = new window.KalturaAvatarSDK({
      clientId: 'test-client',
      flowId: 'test-flow',
      container: '#test-container',
      autoReconnect: false
    });

    // connect() awaits _connectWithQueue(), which never resolves without a
    // real handshake — that's fine, we only need _initSocket() to have run
    // synchronously so the socket.on(...) handlers are registered.
    window.__sdk.connect().catch(() => {});
  });

  // Register the real user-facing command exactly as documented in AGENTS.md.
  const capturedBefore = await page.evaluate(() => {
    window.__firedMatch = null;
    window.__sdk.registerCommand('goto-slide', /slide (\d+)/i, (match) => {
      window.__firedMatch = match.text;
    }, { timing: 'before', debounce: 50 });
    return window.__firedMatch;
  });
  expect(capturedBefore).toBeNull();

  // Drive the exact backend event sequence from the issue's RCA:
  // ground truth (generatingSpeech) arrives, then the TTS-chunk stream
  // (debug_stvTaskGenerated) fragments the same sentence and sends a
  // whitespace-only delta mid-phrase — the empty-delta window that makes
  // the GT-overlay assignment at kaltura-avatar-sdk.js:3808 rewind
  // _beforeBuffer instead of growing it monotonically.
  await page.evaluate(() => {
    window.__fireEvent('generatingSpeech', { text: 'Navigating to slide 2 now.', speechId: 'speech-1' });
    window.__fireEvent('debug_stvTaskGenerated', { text: 'Navigating to slide 2', speechId: 'speech-1' });
    window.__fireEvent('debug_stvTaskGenerated', { text: ' ', speechId: 'speech-1' });
    window.__fireEvent('debug_stvTaskGenerated', { text: ' now.', speechId: 'speech-1' });
  });

  // Let the 50ms debounce flush the final (debounced) match.
  await page.waitForTimeout(150);

  const result = await page.evaluate(() => ({
    firedMatch: window.__firedMatch
  }));

  await page.screenshot({ path: path.join(OUTPUT_DIR, 'command-truncation-result.png') });

  // Real user-facing flow: the avatar spoke "...slide 2 now." — the command
  // must fire with the full, untruncated phrase containing the slide number.
  // Bug reproduces as: fires with truncated/wrong text (e.g. " now." with
  // the digit dropped) because _beforeBuffer rewound on the empty delta.
  expect(result.firedMatch).not.toBeNull();
  expect(result.firedMatch).toContain('slide 2');
  expect(/slide (\d+)/i.exec(result.firedMatch)?.[1]).toBe('2');
});
