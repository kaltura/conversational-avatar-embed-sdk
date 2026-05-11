// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Live Integration Tests — connects to the real Kaltura Avatar server.
 * These tests require network access and a valid clientId/flowId.
 *
 * Run with: npx playwright test tests/e2e/live-flow.spec.js
 */

const CLIENT_ID = '115767973963657880005';
const FLOW_ID = 'agent-1';

test.describe('KalturaAvatarSDK — Live Integration', () => {

  test('full connection flow: connect → ready → avatar greets', async ({ page }) => {
    await page.goto('/tests/e2e/test-runner.html');
    await page.waitForFunction(() => typeof window.KalturaAvatarSDK !== 'undefined');

    const result = await page.evaluate(async ({ clientId, flowId }) => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout: avatar did not greet within 30s')), 30000);

        const sdk = new KalturaAvatarSDK({
          clientId,
          flowId,
          container: '#test-container',
          debug: true
        });

        const events = [];

        sdk.on('state-change', ({ from, to }) => {
          events.push(`${from} → ${to}`);
        });

        sdk.on('ready', () => {
          events.push('READY');
        });

        sdk.on('avatar-speech', ({ text }) => {
          events.push(`SPEECH: ${text.substring(0, 50)}`);
          clearTimeout(timeout);
          sdk.destroy();
          resolve({
            events,
            hadReady: events.includes('READY'),
            hadSpeech: events.some(e => e.startsWith('SPEECH:')),
            greeting: text.substring(0, 100)
          });
        });

        sdk.on('error', (err) => {
          events.push(`ERROR: ${err.code} ${err.message}`);
        });

        sdk.connect().catch((err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
    }, { clientId: CLIENT_ID, flowId: FLOW_ID });

    expect(result.hadReady).toBe(true);
    expect(result.hadSpeech).toBe(true);
    expect(result.greeting.length).toBeGreaterThan(5);

    // Verify state transitions happened in order
    expect(result.events).toContain('uninitialized → connecting');
    expect(result.events).toContain('connecting → connected');
  });

  test('sendText: avatar responds to text input', async ({ page }) => {
    await page.goto('/tests/e2e/test-runner.html');
    await page.waitForFunction(() => typeof window.KalturaAvatarSDK !== 'undefined');

    const result = await page.evaluate(async ({ clientId, flowId }) => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout: no response to text input')), 45000);

        const sdk = new KalturaAvatarSDK({
          clientId,
          flowId,
          container: '#test-container',
          debug: true
        });

        let gotGreeting = false;
        let responseText = '';

        sdk.on('avatar-speech', ({ text }) => {
          if (!gotGreeting) {
            gotGreeting = true;
            // Wait a moment then send text
            setTimeout(() => {
              sdk.sendText('What is 2 plus 2?');
            }, 1000);
          } else {
            responseText = text;
            clearTimeout(timeout);
            sdk.destroy();
            resolve({ gotGreeting: true, responseText: text.substring(0, 200) });
          }
        });

        sdk.connect().catch((err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
    }, { clientId: CLIENT_ID, flowId: FLOW_ID });

    expect(result.gotGreeting).toBe(true);
    expect(result.responseText.length).toBeGreaterThan(0);
  });

  test('DPP injection: avatar uses injected context', async ({ page }) => {
    await page.goto('/tests/e2e/test-runner.html');
    await page.waitForFunction(() => typeof window.KalturaAvatarSDK !== 'undefined');

    const result = await page.evaluate(async ({ clientId, flowId }) => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout: DPP test')), 45000);

        const sdk = new KalturaAvatarSDK({
          clientId,
          flowId,
          container: '#test-container',
          debug: true
        });

        let gotGreeting = false;
        let responseText = '';

        sdk.on('ready', () => {
          sdk.injectDPP({
            v: '2',
            user: { first_name: 'TestUserZebra' },
            inst: ['The user name is TestUserZebra. Remember this name.']
          });
        });

        sdk.on('avatar-speech', ({ text }) => {
          if (!gotGreeting) {
            gotGreeting = true;
            setTimeout(() => {
              sdk.sendText('What is my name?');
            }, 1500);
          } else {
            responseText = text;
            clearTimeout(timeout);
            sdk.destroy();
            resolve({
              responseText: text,
              mentionsName: text.toLowerCase().includes('testuserzebra') || text.toLowerCase().includes('zebra')
            });
          }
        });

        sdk.connect().catch((err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
    }, { clientId: CLIENT_ID, flowId: FLOW_ID });

    expect(result.responseText.length).toBeGreaterThan(0);
    expect(result.mentionsName).toBe(true);
  });

  test('transcript records conversation', async ({ page }) => {
    await page.goto('/tests/e2e/test-runner.html');
    await page.waitForFunction(() => typeof window.KalturaAvatarSDK !== 'undefined');

    const result = await page.evaluate(async ({ clientId, flowId }) => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout: transcript test')), 45000);

        const sdk = new KalturaAvatarSDK({
          clientId,
          flowId,
          container: '#test-container',
          debug: true
        });

        let gotGreeting = false;
        let hasUserEntry = false;
        let hasSecondAvatar = false;

        function checkDone() {
          if (hasUserEntry && hasSecondAvatar) {
            clearTimeout(timeout);
            const transcript = sdk.getTranscript();
            const transcriptText = sdk.getTranscriptText({ format: 'text' });
            sdk.destroy();
            resolve({
              entryCount: transcript.length,
              hasAvatarEntry: transcript.some(e => e.role === 'Avatar'),
              hasUserEntry: transcript.some(e => e.role === 'User'),
              textFormat: transcriptText.substring(0, 200)
            });
          }
        }

        sdk.on('transcript-entry', (entry) => {
          if (entry.role === 'User') { hasUserEntry = true; checkDone(); }
        });

        sdk.on('avatar-speech', ({ text }) => {
          if (!gotGreeting) {
            gotGreeting = true;
            sdk.sendText('Hello avatar!');
            sdk.once('avatar-speech', () => { hasSecondAvatar = true; checkDone(); });
          }
        });

        sdk.connect().catch((err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
    }, { clientId: CLIENT_ID, flowId: FLOW_ID });

    expect(result.entryCount).toBeGreaterThanOrEqual(2);
    expect(result.hasAvatarEntry).toBe(true);
    expect(result.hasUserEntry).toBe(true);
  });

  test('command registry fires on avatar speech', async ({ page }) => {
    await page.goto('/tests/e2e/test-runner.html');
    await page.waitForFunction(() => typeof window.KalturaAvatarSDK !== 'undefined');

    const result = await page.evaluate(async ({ clientId, flowId }) => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          // Even if no command matched, resolve with what we have
          sdk.destroy();
          resolve({ commandFired: false, avatarSpoke: greetingReceived });
        }, 30000);

        const sdk = new KalturaAvatarSDK({
          clientId,
          flowId,
          container: '#test-container',
          debug: true
        });

        let greetingReceived = false;
        let commandFired = false;

        // Register a command that matches common greeting patterns
        sdk.registerCommand('greeting-detect', /hello|hi|welcome|kaltura/i, (match) => {
          commandFired = true;
        });

        sdk.on('avatar-speech', ({ text }) => {
          greetingReceived = true;
          // Give commands a tick to fire
          setTimeout(() => {
            clearTimeout(timeout);
            sdk.destroy();
            resolve({ commandFired, avatarSpoke: true, speechText: text.substring(0, 80) });
          }, 100);
        });

        sdk.connect().catch((err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
    }, { clientId: CLIENT_ID, flowId: FLOW_ID });

    expect(result.avatarSpoke).toBe(true);
    // The greeting should match our broad pattern
    expect(result.commandFired).toBe(true);
  });

  test('avatar-text-ready fires BEFORE avatar-speaking-start (streaming text)', async ({ page }) => {
    await page.goto('/tests/e2e/test-runner.html');
    await page.waitForFunction(() => typeof window.KalturaAvatarSDK !== 'undefined');

    const result = await page.evaluate(async ({ clientId, flowId }) => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          sdk.destroy();
          resolve({ timeline, error: 'Timeout — avatar did not speak within 30s' });
        }, 30000);

        const sdk = new KalturaAvatarSDK({
          clientId,
          flowId,
          container: '#test-container',
          debug: true
        });

        const timeline = [];

        sdk.on('avatar-text-ready', ({ text, fullText }) => {
          if (timeline.length === 0 || !timeline.some(e => e.event === 'text-ready')) {
            timeline.push({ event: 'text-ready', text: fullText.substring(0, 50) });
          }
        });

        sdk.on('avatar-speaking-start', () => {
          timeline.push({ event: 'speaking-start' });
        });

        sdk.on('avatar-speech', ({ text }) => {
          timeline.push({ event: 'avatar-speech', text: text.substring(0, 50) });
          clearTimeout(timeout);
          sdk.destroy();
          resolve({ timeline });
        });

        sdk.connect().catch((err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
    }, { clientId: CLIENT_ID, flowId: FLOW_ID });

    // avatar-text-ready must exist (proves debug_stvTaskGenerated is arriving)
    const textReadyIdx = result.timeline.findIndex(e => e.event === 'text-ready');
    const speakingStartIdx = result.timeline.findIndex(e => e.event === 'speaking-start');
    const speechIdx = result.timeline.findIndex(e => e.event === 'avatar-speech');

    expect(textReadyIdx).toBeGreaterThanOrEqual(0); // text-ready fired
    expect(speakingStartIdx).toBeGreaterThanOrEqual(0); // speaking-start fired
    expect(textReadyIdx).toBeLessThan(speakingStartIdx); // text arrived BEFORE audio
    expect(speechIdx).toBeGreaterThan(speakingStartIdx); // speech (final) after speaking
  });

  test('timing "before" command fires before avatar-speech event', async ({ page }) => {
    await page.goto('/tests/e2e/test-runner.html');
    await page.waitForFunction(() => typeof window.KalturaAvatarSDK !== 'undefined');

    const result = await page.evaluate(async ({ clientId, flowId }) => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          sdk.destroy();
          resolve({ timeline, error: 'Timeout' });
        }, 30000);

        const sdk = new KalturaAvatarSDK({
          clientId,
          flowId,
          container: '#test-container',
          debug: true
        });

        const timeline = [];

        // Register a broad command that will match the greeting
        sdk.registerCommand('greet-detect', /./i, (match) => {
          if (!timeline.some(e => e.event === 'before-command')) {
            timeline.push({ event: 'before-command', text: match.text.substring(0, 50) });
          }
        }, { timing: 'before' });

        sdk.on('avatar-speaking-start', () => {
          timeline.push({ event: 'speaking-start' });
        });

        sdk.on('avatar-speech', ({ text }) => {
          timeline.push({ event: 'avatar-speech' });
          clearTimeout(timeout);
          sdk.destroy();
          resolve({ timeline });
        });

        sdk.connect().catch((err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
    }, { clientId: CLIENT_ID, flowId: FLOW_ID });

    const beforeCmdIdx = result.timeline.findIndex(e => e.event === 'before-command');
    const speakingStartIdx = result.timeline.findIndex(e => e.event === 'speaking-start');
    const speechIdx = result.timeline.findIndex(e => e.event === 'avatar-speech');

    expect(beforeCmdIdx).toBeGreaterThanOrEqual(0); // before-command fired
    expect(beforeCmdIdx).toBeLessThan(speakingStartIdx); // fired BEFORE avatar started talking
    expect(beforeCmdIdx).toBeLessThan(speechIdx); // fired BEFORE final speech event
  });

  test('disconnect and state transition to ended', async ({ page }) => {
    await page.goto('/tests/e2e/test-runner.html');
    await page.waitForFunction(() => typeof window.KalturaAvatarSDK !== 'undefined');

    const result = await page.evaluate(async ({ clientId, flowId }) => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout')), 30000);

        const sdk = new KalturaAvatarSDK({
          clientId,
          flowId,
          container: '#test-container',
          debug: true
        });

        sdk.on('ready', () => {
          // Disconnect immediately after ready
          sdk.disconnect();
          clearTimeout(timeout);
          resolve({
            stateAfterDisconnect: sdk.getState(),
            isConnected: sdk.isConnected(),
            isInConversation: sdk.isInConversation()
          });
          sdk.destroy();
        });

        sdk.connect().catch((err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
    }, { clientId: CLIENT_ID, flowId: FLOW_ID });

    expect(result.stateAfterDisconnect).toBe('ended');
    expect(result.isConnected).toBe(false);
    expect(result.isInConversation).toBe(false);
  });
});
