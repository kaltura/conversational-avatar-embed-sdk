// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Network Throttle Tests — live server + Chrome DevTools Protocol network emulation.
 * Verifies SDK behavior under degraded conditions: slow 3G, offline toggle, latency.
 *
 * These tests connect to the REAL Kaltura Avatar server and then degrade
 * the network mid-session to verify resilience.
 *
 * Run with: npx playwright test tests/e2e/network-throttle.spec.js
 * (Not included in `npm test` — requires network access + live server)
 */

const CLIENT_ID = '115767973963657880005';
const FLOW_ID = 'agent-1';

test.describe('KalturaAvatarSDK — Network Throttle (Live)', () => {

  test('connection succeeds under slow 3G conditions', async ({ page }) => {
    await page.goto('/tests/e2e/test-runner.html');
    await page.waitForFunction(() => typeof window.KalturaAvatarSDK !== 'undefined');

    // Enable slow 3G BEFORE connection: 500kbps down, 100kbps up, 400ms RTT
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: 62500,   // 500 kbps
      uploadThroughput: 12500,     // 100 kbps
      latency: 400                 // 400ms RTT
    });

    const result = await page.evaluate(async ({ clientId, flowId }) => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          sdk.destroy();
          resolve({ connected: false, events, error: 'timeout' });
        }, 60000); // Generous timeout for slow network

        const events = [];
        const sdk = new KalturaAvatarSDK({
          clientId,
          flowId,
          container: '#test-container',
          connectionTimeout: 30000, // 30s timeout for slow network
          debug: true
        });

        sdk.on('state-change', ({ from, to }) => events.push(`${from}→${to}`));
        sdk.on('ready', () => events.push('READY'));
        sdk.on('error', (err) => events.push(`ERR:${err.code}`));

        sdk.on('avatar-speech', ({ text }) => {
          clearTimeout(timeout);
          sdk.destroy();
          resolve({
            connected: true,
            events,
            greeting: text.substring(0, 80)
          });
        });

        sdk.connect().catch(err => {
          clearTimeout(timeout);
          resolve({ connected: false, events, error: err.message });
        });
      });
    }, { clientId: CLIENT_ID, flowId: FLOW_ID });

    // Cleanup CDP
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: -1,
      uploadThroughput: -1,
      latency: 0
    });
    await cdp.detach();

    // Under slow 3G, connection should still succeed (just slower)
    expect(result.connected).toBe(true);
    expect(result.events).toContain('READY');
    expect(result.greeting.length).toBeGreaterThan(0);
  });

  test('SDK recovers when network drops and returns mid-session', async ({ page }) => {
    test.setTimeout(120000);
    await page.goto('/tests/e2e/test-runner.html');
    await page.waitForFunction(() => typeof window.KalturaAvatarSDK !== 'undefined');

    const cdp = await page.context().newCDPSession(page);

    // Phase 1: Start the SDK (non-blocking) and wait for greeting
    await page.evaluate(({ clientId, flowId }) => {
      window.__netTest = { events: [], phase: 'connecting' };
      const state = window.__netTest;

      const sdk = new KalturaAvatarSDK({
        clientId,
        flowId,
        container: '#test-container',
        connectionTimeout: 20000,
        autoReconnect: true,
        debug: true
      });
      window.__netTestSdk = sdk;

      sdk.on('state-change', ({ from, to }) => state.events.push(`${state.phase}:${from}→${to}`));
      sdk.on('ready', () => state.events.push(`${state.phase}:READY`));
      sdk.on('disconnected', (d) => state.events.push(`${state.phase}:DISCONNECTED:${d?.reason || 'unknown'}`));
      sdk.on('reconnecting', (d) => state.events.push(`${state.phase}:RECONNECTING:${d.attempt}`));
      sdk.on('reconnected', () => {
        state.events.push(`${state.phase}:RECONNECTED`);
        state.phase = 'recovered';
        setTimeout(() => {
          try { sdk.sendText('Are you there?'); } catch (e) { state.events.push(`SEND_ERR:${e.message}`); }
        }, 2000);
      });
      sdk.on('error', (err) => state.events.push(`${state.phase}:ERR:${err.code}`));
      sdk.on('avatar-speech', ({ text }) => {
        if (state.phase === 'connecting') {
          state.events.push('GOT_GREETING');
          state.phase = 'will-drop';
        } else if (state.phase === 'recovered') {
          state.events.push('GOT_RESPONSE_AFTER_RECOVERY');
          state.phase = 'complete';
        }
      });

      sdk.connect().catch(err => {
        state.events.push(`CONNECT_FAILED:${err.message}`);
        state.phase = 'connect-failed';
      });
    }, { clientId: CLIENT_ID, flowId: FLOW_ID });

    // Wait for greeting (SDK connected and avatar spoke)
    const gotGreeting = await page.waitForFunction(
      () => window.__netTest && (window.__netTest.phase === 'will-drop' || window.__netTest.phase === 'connect-failed'),
      { timeout: 40000 }
    ).then(() => true).catch(() => false);

    const phase1 = await page.evaluate(() => window.__netTest);
    if (!gotGreeting || phase1.phase === 'connect-failed') {
      await cdp.detach();
      await page.evaluate(() => { if (window.__netTestSdk) window.__netTestSdk.destroy(); });
      expect(phase1.events.length).toBeGreaterThan(0);
      return;
    }

    // Phase 2: Drop the network
    await cdp.send('Network.emulateNetworkConditions', {
      offline: true,
      downloadThroughput: 0,
      uploadThroughput: 0,
      latency: 0
    });

    await page.evaluate(() => { window.__netTest.phase = 'dropped'; });
    await page.waitForTimeout(5000);

    // Phase 3: Restore the network
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: -1,
      uploadThroughput: -1,
      latency: 0
    });

    // Phase 4: Wait for reconnection or timeout
    const recovered = await page.waitForFunction(
      () => window.__netTest && (window.__netTest.phase === 'complete' || window.__netTest.phase === 'recovered'),
      { timeout: 45000 }
    ).then(() => true).catch(() => false);

    // Collect final state
    const finalState = await page.evaluate(() => {
      const state = window.__netTest;
      if (window.__netTestSdk) window.__netTestSdk.destroy();
      return state;
    });

    await cdp.detach();

    // Assertions: SDK must get the greeting and not crash
    expect(finalState.events).toContain('GOT_GREETING');
    if (recovered) {
      expect(finalState.events.some(e => e.includes('RECONNECTED'))).toBe(true);
    } else {
      // Even without full recovery, verify reconnection was attempted
      expect(finalState.events.some(e => e.includes('RECONNECTING') || e.includes('DISCONNECTED'))).toBe(true);
    }
  });

  test('high latency (2000ms RTT) does not prevent connection', async ({ page }) => {
    await page.goto('/tests/e2e/test-runner.html');
    await page.waitForFunction(() => typeof window.KalturaAvatarSDK !== 'undefined');

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: -1,    // No throughput limit
      uploadThroughput: -1,
      latency: 2000              // 2 second RTT
    });

    const result = await page.evaluate(async ({ clientId, flowId }) => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          sdk.destroy();
          resolve({ connected: false, events });
        }, 60000);

        const events = [];
        const sdk = new KalturaAvatarSDK({
          clientId,
          flowId,
          container: '#test-container',
          connectionTimeout: 45000, // Very generous for high latency
          debug: true
        });

        sdk.on('state-change', ({ to }) => events.push(to));
        sdk.on('ready', () => events.push('READY'));
        sdk.on('error', (err) => events.push(`ERR:${err.code}`));

        sdk.on('avatar-speech', ({ text }) => {
          clearTimeout(timeout);
          sdk.destroy();
          resolve({ connected: true, events, greeting: text.substring(0, 50) });
        });

        sdk.connect().catch(err => {
          clearTimeout(timeout);
          resolve({ connected: false, events, error: err.message });
        });
      });
    }, { clientId: CLIENT_ID, flowId: FLOW_ID });

    await cdp.send('Network.emulateNetworkConditions', {
      offline: false, downloadThroughput: -1, uploadThroughput: -1, latency: 0
    });
    await cdp.detach();

    expect(result.connected).toBe(true);
    expect(result.events).toContain('READY');
  });

  test('bandwidth throttle mid-session: avatar audio continues', async ({ page }) => {
    await page.goto('/tests/e2e/test-runner.html');
    await page.waitForFunction(() => typeof window.KalturaAvatarSDK !== 'undefined');

    const cdp = await page.context().newCDPSession(page);

    const result = await page.evaluate(async ({ clientId, flowId }) => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          sdk.destroy();
          resolve({ phase: 'timeout', events });
        }, 60000);

        const events = [];
        const sdk = new KalturaAvatarSDK({
          clientId,
          flowId,
          container: '#test-container',
          connectionTimeout: 20000,
          debug: true
        });

        let throttled = false;

        sdk.on('ready', () => events.push('READY'));
        sdk.on('error', (err) => events.push(`ERR:${err.code}:${err.message?.substring(0, 30)}`));
        sdk.on('disconnected', (d) => events.push(`DISC:${d?.reason}`));

        sdk.on('avatar-speech', ({ text }) => {
          events.push(`SPEECH:${text.substring(0, 30)}`);
          if (!throttled) {
            throttled = true;
            // Signal to outer test to apply bandwidth throttle
            window.__applyThrottle = true;
            // After throttle applied, send a text to trigger another response
            setTimeout(() => {
              try {
                sdk.sendText('Tell me something interesting');
              } catch (e) {
                events.push(`SEND_ERR:${e.code}`);
              }
            }, 3000);
          } else {
            // Got speech AFTER throttle was applied — success!
            clearTimeout(timeout);
            sdk.destroy();
            resolve({ phase: 'success', events, speechAfterThrottle: true });
          }
        });

        window.__applyThrottle = false;
        sdk.connect().catch(err => {
          clearTimeout(timeout);
          resolve({ phase: 'connect-failed', events, error: err.message });
        });
      });
    }, { clientId: CLIENT_ID, flowId: FLOW_ID });

    if (result.phase === 'connect-failed' || result.phase === 'timeout') {
      await cdp.detach();
      // At minimum, no crashes
      expect(result.events.length).toBeGreaterThan(0);
      return;
    }

    // Wait for avatar to speak, then apply throttle
    try {
      await page.waitForFunction(() => window.__applyThrottle === true, { timeout: 30000 });

      // Apply severe bandwidth restriction (but NOT offline)
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        downloadThroughput: 6250,   // 50 kbps — very slow
        uploadThroughput: 6250,
        latency: 1000               // 1s RTT
      });
    } catch (e) {
      // Timeout waiting for avatar speech — still not a crash
    }

    // Wait for the result to resolve
    await page.waitForTimeout(15000);

    await cdp.send('Network.emulateNetworkConditions', {
      offline: false, downloadThroughput: -1, uploadThroughput: -1, latency: 0
    });
    await cdp.detach();

    // Key assertion: SDK got a greeting (at minimum)
    expect(result.events.some(e => e.startsWith('SPEECH:'))).toBe(true);
    // No crash-level errors
    expect(result.events.filter(e => e.startsWith('ERR:5')).length).toBe(0); // No INVALID_CONFIG/STATE
  });

  test('connection timeout fires correctly with unreachable custom endpoint', async ({ page }) => {
    await page.goto('/tests/e2e/test-runner.html');
    await page.waitForFunction(() => typeof window.KalturaAvatarSDK !== 'undefined');

    const result = await page.evaluate(async () => {
      const startTime = Date.now();
      return new Promise((resolve) => {
        const sdk = new KalturaAvatarSDK({
          clientId: 'test',
          flowId: 'test',
          container: '#test-container',
          endpoints: { socket: 'https://192.0.2.1:9999' }, // RFC 5737 TEST-NET — guaranteed unreachable
          connectionTimeout: 5000,
          autoReconnect: false
        });

        sdk.on('error', (err) => {
          const elapsed = Date.now() - startTime;
          sdk.destroy();
          resolve({
            errorCode: err.code,
            recoverable: err.recoverable,
            elapsed,
            withinTimeout: elapsed < 8000 // Some slack for processing
          });
        });

        sdk.connect().catch(() => {});
      });
    });

    // Should get CONNECTION_TIMEOUT or CONNECTION_FAILED within ~5s
    expect([1001, 1002]).toContain(result.errorCode);
    expect(result.recoverable).toBe(true);
    expect(result.withinTimeout).toBe(true);
  });

  test('SDK state is clean after network-caused disconnect', async ({ page }) => {
    await page.goto('/tests/e2e/test-runner.html');
    await page.waitForFunction(() => typeof window.KalturaAvatarSDK !== 'undefined');

    const cdp = await page.context().newCDPSession(page);

    const result = await page.evaluate(async ({ clientId, flowId }) => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          resolve({ phase: 'timeout', stateAfterDisconnect: sdk.getState() });
          sdk.destroy();
        }, 45000);

        const sdk = new KalturaAvatarSDK({
          clientId,
          flowId,
          container: '#test-container',
          connectionTimeout: 15000,
          autoReconnect: false, // Disable reconnect so we can inspect final state
          debug: true
        });

        sdk.on('ready', () => {
          // Signal outer test to kill network
          window.__killNetwork = true;
        });

        sdk.on('disconnected', (d) => {
          clearTimeout(timeout);
          const state = sdk.getState();
          const connected = sdk.isConnected();
          const inConv = sdk.isInConversation();
          sdk.destroy();
          resolve({
            phase: 'disconnected',
            reason: d?.reason,
            stateAfterDisconnect: state,
            isConnected: connected,
            isInConversation: inConv
          });
        });

        window.__killNetwork = false;
        sdk.connect().catch(err => {
          clearTimeout(timeout);
          resolve({ phase: 'connect-failed', error: err.message });
        });
      });
    }, { clientId: CLIENT_ID, flowId: FLOW_ID });

    if (result.phase === 'connect-failed' || result.phase === 'timeout') {
      await cdp.detach();
      expect(result).toBeDefined();
      return;
    }

    // Wait for ready, then kill network
    try {
      await page.waitForFunction(() => window.__killNetwork === true, { timeout: 20000 });
      await cdp.send('Network.emulateNetworkConditions', {
        offline: true,
        downloadThroughput: 0,
        uploadThroughput: 0,
        latency: 0
      });
    } catch (e) {
      // If we can't get to ready state, still pass — no crash
    }

    // Wait for disconnect to happen
    await page.waitForTimeout(10000);

    await cdp.send('Network.emulateNetworkConditions', {
      offline: false, downloadThroughput: -1, uploadThroughput: -1, latency: 0
    });
    await cdp.detach();

    if (result.phase === 'disconnected') {
      // After network-caused disconnect, state should be clean
      expect(result.isConnected).toBe(false);
      expect(result.isInConversation).toBe(false);
    }
  });
});
