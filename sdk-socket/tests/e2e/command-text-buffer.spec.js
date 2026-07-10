// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * CommandTextBuffer Unit Tests — run in the browser via Playwright
 *
 * Defines the contract for the dual-source (debug_stvTaskGenerated +
 * stvSpeechChunk) command-matching text buffer that fixes the
 * empty-delta-rewind regression in issue #2. `CommandTextBuffer` does not
 * exist yet — these tests are expected to FAIL until it is implemented and
 * exposed via `KalturaAvatarSDK._internals.CommandTextBuffer`.
 */

test.describe('CommandTextBuffer — Unit Tests (in-browser)', () => {

  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto('/tests/e2e/test-runner.html');
    await page.waitForFunction(() => typeof window.KalturaAvatarSDK !== 'undefined');
  });

  test.afterAll(async () => {
    await page.close();
  });

  // ────────────────────────────────────────────────────────────────────
  // 3.1 — Monotonicity / empty-delta-rewind regression
  // ────────────────────────────────────────────────────────────────────

  test('empty debug_stvTaskGenerated delta never rewinds the buffer (spec 3.1)', async () => {
    const result = await page.evaluate(() => {
      const { CommandTextBuffer } = KalturaAvatarSDK._internals;
      const buf = new CommandTextBuffer();

      buf.onGeneratingSpeech('Navigating to slide two now.', 'sp1');

      const lengths = [];
      const texts = [];

      buf.onFragment('Navigating to slide t', 'sp1');
      lengths.push(buf.getText().length);
      texts.push(buf.getText());

      // The empty delta that triggered the reported bug.
      buf.onFragment('', 'sp1');
      lengths.push(buf.getText().length);
      texts.push(buf.getText());

      buf.onFragment('wo now.', 'sp1');
      lengths.push(buf.getText().length);
      texts.push(buf.getText());

      let neverDecreased = true;
      for (let i = 1; i < lengths.length; i++) {
        if (lengths[i] < lengths[i - 1]) neverDecreased = false;
      }

      return { lengths, texts, neverDecreased, final: buf.getText() };
    });

    expect(result.neverDecreased).toBe(true);
    expect(result.final).toContain('slide two');
  });

  // ────────────────────────────────────────────────────────────────────
  // 3.3 — stvSpeechChunk-only command matching
  // ────────────────────────────────────────────────────────────────────

  test('buffer works from onServerChunk alone with zero onFragment input (spec 3.3)', async () => {
    const result = await page.evaluate(() => {
      const { CommandTextBuffer } = KalturaAvatarSDK._internals;
      const buf = new CommandTextBuffer();

      buf.onServerChunk('Navigating to slide two now.', 'sp2', 500);

      return buf.getText();
    });

    expect(result).toContain('Navigating to slide two now.');
  });

  // ────────────────────────────────────────────────────────────────────
  // 3.2 — Dual-source no-duplication
  // ────────────────────────────────────────────────────────────────────

  test('server-timed chunk takes over from heuristic fragments without duplicating text (spec 3.2)', async () => {
    const result = await page.evaluate(() => {
      const { CommandTextBuffer } = KalturaAvatarSDK._internals;
      const buf = new CommandTextBuffer();

      buf.onGeneratingSpeech('Navigating to slide two now.', 'sp3');
      // Heuristic path runs first, before the server-timed chunk arrives.
      buf.onFragment('Navigating to slide t', 'sp3');
      // Server-timed chunk arrives and should take precedence.
      buf.onServerChunk('Navigating to slide two now.', 'sp3', 500);
      // A late-arriving heuristic fragment must not be double-counted.
      buf.onFragment('wo now.', 'sp3');

      return { text: buf.getText(), isServerTimed: buf.isServerTimed() };
    });

    expect(result.isServerTimed).toBe(true);
    expect(result.text).toBe('Navigating to slide two now.');
    expect(result.text).not.toContain('slide tNavigating');
    // No repeated "slide t" fragment left over from the superseded heuristic path.
    expect((result.text.match(/slide t/g) || []).length).toBeLessThanOrEqual(1);
  });

  // ────────────────────────────────────────────────────────────────────
  // 4.1 — Bounded state / reset on speech end
  // ────────────────────────────────────────────────────────────────────

  test('reset() clears buffer and server-timed flag with no leakage into next speech (spec 4.1)', async () => {
    const result = await page.evaluate(() => {
      const { CommandTextBuffer } = KalturaAvatarSDK._internals;
      const buf = new CommandTextBuffer();

      buf.onGeneratingSpeech('Navigating to slide two now.', 'sp4');
      buf.onFragment('Navigating to slide t', 'sp4');
      buf.onServerChunk('Navigating to slide two now.', 'sp4', 500);

      buf.reset();
      const afterReset = { text: buf.getText(), isServerTimed: buf.isServerTimed() };

      buf.onFragment('Switching to the next challenge now.', 'sp5');
      const afterNewSpeech = buf.getText();

      return { afterReset, afterNewSpeech };
    });

    expect(result.afterReset.text).toBe('');
    expect(result.afterReset.isServerTimed).toBe(false);
    expect(result.afterNewSpeech).toBe('Switching to the next challenge now.');
    expect(result.afterNewSpeech).not.toContain('slide');
  });

  // ────────────────────────────────────────────────────────────────────
  // Backward compat — onFragment-only accumulation (no stvSpeechChunk)
  // ────────────────────────────────────────────────────────────────────

  test('onFragment-only accumulation is unaffected when onServerChunk is never called', async () => {
    const result = await page.evaluate(() => {
      const { CommandTextBuffer } = KalturaAvatarSDK._internals;
      const buf = new CommandTextBuffer();

      buf.onGeneratingSpeech('Navigating to slide two now.', 'sp6');
      buf.onFragment('Navigating to slide t', 'sp6');
      buf.onFragment('wo now.', 'sp6');

      return { text: buf.getText(), isServerTimed: buf.isServerTimed() };
    });

    expect(result.isServerTimed).toBe(false);
    expect(result.text).toContain('slide two');
  });

});
