// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Live test: verifies generatingSpeech ground truth feeds into captions correctly.
 * Connects to QA server where generatingSpeech event is deployed.
 *
 * Run with: npx playwright test tests/e2e/caption-gt-live.spec.js
 */

const QA_CLIENT_ID = '695fc174f8ef6e1f0bde2c40';
const QA_FLOW_ID = 'agent-6';

test.describe('Caption Ground Truth — Live QA', () => {

  test('generatingSpeech events feed GT into captions with correct word boundaries', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/tests/e2e/test-runner.html');
    await page.waitForFunction(() => typeof window.KalturaAvatarSDK !== 'undefined');

    const result = await page.evaluate(async ({ clientId, flowId }) => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout: avatar did not speak within 45s')), 45000);

        const sdk = new KalturaAvatarSDK({
          clientId,
          flowId,
          container: '#test-container',
          captions: { enabled: true, render: false },
          endpoints: { socket: 'https://conversation.avatar.qa.kaltura.ai' },
          debug: true
        });

        const gtEvents = [];
        const captionSegments = [];
        let done = false;

        sdk.on('generating-speech', (data) => {
          gtEvents.push({ text: data.text, speechId: data.speechId });
        });

        sdk.on('caption-segment', (data) => {
          captionSegments.push(data.text);
        });

        sdk.on('avatar-speech', ({ text }) => {
          if (done) return;
          done = true;
          clearTimeout(timeout);
          setTimeout(() => sdk.destroy(), 100);
          resolve({ gtEvents, captionSegments });
        });

        sdk.on('error', (err) => {
          if (!done && err.code !== 'QUEUE_TIMEOUT') {
            clearTimeout(timeout);
            reject(new Error(`SDK error: ${err.code} ${err.message}`));
          }
        });

        sdk.connect().catch((err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
    }, { clientId: QA_CLIENT_ID, flowId: QA_FLOW_ID });

    expect(result.gtEvents.length).toBeGreaterThan(0);
    expect(result.captionSegments.length).toBeGreaterThan(0);

    // No word-merging: punctuation must always be followed by a space before next word
    const joined = result.captionSegments.join(' ');
    expect(joined).not.toMatch(/[.!?,][a-z]/);

    // GT text should be clean (no HTML tags)
    const gtText = result.gtEvents.map(e => e.text).join('');
    expect(gtText.length).toBeGreaterThan(5);
    expect(gtText).not.toMatch(/<[^>]+>/);
  });

});
