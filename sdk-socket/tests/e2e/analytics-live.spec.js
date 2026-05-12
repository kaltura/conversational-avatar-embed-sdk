// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Live KAVA Analytics End-to-End Test
 * Connects to a real Kaltura Avatar server AND sends real analytics events
 * to analytics.kaltura.com — verifies HTTP 200 responses.
 *
 * Run with: npm run test:analytics:live
 * Requires network access (both avatar server + analytics endpoint).
 */

const CLIENT_ID = process.env.KALTURA_CLIENT_ID || '115767973963657880005';
const FLOW_ID = process.env.KALTURA_FLOW_ID || 'agent-1';
const PARTNER_ID = process.env.KALTURA_PARTNER_ID || '5975432';
const KS = process.env.KALTURA_KS || '';

test.describe('KAVA Analytics — Live End-to-End', () => {

  test('analytics events reach analytics.kaltura.com successfully (HTTP 200)', async ({ page }) => {
    test.setTimeout(60000);

    await page.goto('/tests/e2e/test-runner.html');
    await page.waitForFunction(() =>
      typeof window.KalturaAvatarSDK !== 'undefined' &&
      typeof window.KalturaAvatarAnalytics !== 'undefined'
    );

    const result = await page.evaluate(async ({ clientId, flowId, partnerId, ks }) => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup();
          resolve({ timedOut: true, analyticsResults, sdkEvents, errors });
        }, 50000);

        const analyticsResults = [];
        const sdkEvents = [];
        const errors = [];
        let sdk, kava;

        // Intercept fetch to capture analytics responses (but still send them!)
        const origFetch = window.fetch;
        window.fetch = function (url, opts) {
          const result = origFetch.apply(window, arguments);
          if (typeof url === 'string' && url.includes('analytics.kaltura.com')) {
            const body = opts?.body ? Object.fromEntries(new URLSearchParams(opts.body.toString())) : {};
            result.then(resp => {
              analyticsResults.push({
                eventType: body.eventType,
                status: resp.status,
                ok: resp.ok,
                partnerId: body.partnerId,
                sessionId: body.sessionId,
                threadId: body.threadId,
                callId: body.callId,
                messageId: body.messageId,
                eventIndex: body.eventIndex
              });
            }).catch(err => {
              errors.push({ eventType: body.eventType, error: err.message });
            });
          }
          return result;
        };

        function cleanup() {
          clearTimeout(timeout);
          window.fetch = origFetch;
          if (kava) { try { kava.destroy(); } catch (e) {} }
          if (sdk) { try { sdk.destroy(); } catch (e) {} }
        }

        try {
          sdk = new KalturaAvatarSDK({
            clientId,
            flowId,
            container: '#test-container',
            debug: false
          });

          // Attach KAVA plugin — let it auto-fire callStarted on 'ready'
          kava = new KalturaAvatarAnalytics(sdk, {
            ks: ks || 'live-test-no-ks',
            partnerId: Number(partnerId),
            debug: true,
            autoStart: true,
            autoEnd: true,
            autoMessages: true
          });

          // Track SDK events
          sdk.on('state-change', ({ from, to }) => sdkEvents.push(`${from}→${to}`));
          sdk.on('ready', () => sdkEvents.push('READY'));
          sdk.on('error', (err) => errors.push({ sdkError: err.message || err.code }));

          // Wait for avatar to speak (proves connection + callStarted + messageResponse)
          sdk.on('avatar-speech', ({ text }) => {
            sdkEvents.push(`SPEECH:${text.substring(0, 40)}`);
            // Give analytics time to fire messageResponse, then collect results
            setTimeout(() => {
              // Fire a manual pageView and buttonClick to test those paths
              kava.pageView('LiveTestPage', 'test');
              kava.buttonClick('test-button', 'click', 'live-test');

              // Wait for those to complete
              setTimeout(() => {
                // Now disconnect to trigger callEnded
                sdk.end();
                // Wait for callEnded analytics
                setTimeout(() => {
                  const stats = kava.getStats();
                  cleanup();
                  resolve({
                    timedOut: false,
                    analyticsResults,
                    sdkEvents,
                    errors,
                    stats
                  });
                }, 2000);
              }, 1000);
            }, 1500);
          });

          sdk.connect().catch((err) => {
            errors.push({ connectError: err.message });
            cleanup();
            resolve({ timedOut: false, analyticsResults, sdkEvents, errors, connectFailed: true });
          });

        } catch (err) {
          cleanup();
          reject(err);
        }
      });
    }, { clientId: CLIENT_ID, flowId: FLOW_ID, partnerId: PARTNER_ID, ks: KS });

    // Log full results for debugging
    console.log('SDK Events:', result.sdkEvents);
    console.log('Analytics Results:', JSON.stringify(result.analyticsResults, null, 2));
    console.log('Errors:', result.errors);
    if (result.stats) console.log('Plugin Stats:', result.stats);

    // Assertions
    expect(result.timedOut).toBe(false);
    expect(result.connectFailed).toBeFalsy();
    expect(result.sdkEvents).toContain('READY');

    // Verify analytics events were sent and got HTTP 200
    expect(result.analyticsResults.length).toBeGreaterThanOrEqual(3);

    // Find specific event types
    const callStarted = result.analyticsResults.find(r => r.eventType === '80002');
    const messageResponse = result.analyticsResults.find(r => r.eventType === '80001');
    const callEnded = result.analyticsResults.find(r => r.eventType === '80003');
    const pageLoad = result.analyticsResults.find(r => r.eventType === '10003');
    const buttonClick = result.analyticsResults.find(r => r.eventType === '10002');

    // callStarted must fire and succeed
    expect(callStarted).toBeTruthy();
    expect(callStarted.ok).toBe(true);
    expect(callStarted.status).toBe(200);
    expect(callStarted.partnerId).toBe(PARTNER_ID);
    expect(callStarted.sessionId).toBeTruthy();
    expect(callStarted.threadId).toBeTruthy();
    expect(callStarted.callId).toBeTruthy();

    // messageResponse should fire for avatar greeting
    expect(messageResponse).toBeTruthy();
    expect(messageResponse.ok).toBe(true);
    expect(messageResponse.status).toBe(200);

    // callEnded should fire on disconnect
    expect(callEnded).toBeTruthy();
    expect(callEnded.ok).toBe(true);
    expect(callEnded.status).toBe(200);

    // Standard KAVA events (pageView, buttonClick)
    expect(pageLoad).toBeTruthy();
    expect(pageLoad.ok).toBe(true);
    expect(pageLoad.status).toBe(200);

    expect(buttonClick).toBeTruthy();
    expect(buttonClick.ok).toBe(true);
    expect(buttonClick.status).toBe(200);

    // Verify event index increments
    const indices = result.analyticsResults.map(r => Number(r.eventIndex));
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]);
    }

    // Verify no transport errors
    expect(result.errors.length).toBe(0);
    if (result.stats) {
      expect(result.stats.transportErrors).toBe(0);
    }
  });

  test('analytics without KS still gets HTTP 200 (server accepts)', async ({ page }) => {
    test.setTimeout(60000);

    await page.goto('/tests/e2e/test-runner.html');
    await page.waitForFunction(() =>
      typeof window.KalturaAvatarSDK !== 'undefined' &&
      typeof window.KalturaAvatarAnalytics !== 'undefined'
    );

    const result = await page.evaluate(async ({ clientId, flowId, partnerId }) => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup();
          resolve({ timedOut: true, responses });
        }, 50000);

        const responses = [];
        let sdk, kava;

        const origFetch = window.fetch;
        window.fetch = function (url, opts) {
          const result = origFetch.apply(window, arguments);
          if (typeof url === 'string' && url.includes('analytics.kaltura.com')) {
            const body = opts?.body ? Object.fromEntries(new URLSearchParams(opts.body.toString())) : {};
            result.then(resp => {
              responses.push({ eventType: body.eventType, status: resp.status, ok: resp.ok });
            }).catch(err => {
              responses.push({ eventType: body.eventType, error: err.message });
            });
          }
          return result;
        };

        function cleanup() {
          clearTimeout(timeout);
          window.fetch = origFetch;
          if (kava) { try { kava.destroy(); } catch (e) {} }
          if (sdk) { try { sdk.destroy(); } catch (e) {} }
        }

        try {
          sdk = new KalturaAvatarSDK({
            clientId,
            flowId,
            container: '#test-container',
            debug: false
          });

          // No KS — just empty string
          kava = new KalturaAvatarAnalytics(sdk, {
            ks: 'no-ks-live-test',
            partnerId: Number(partnerId),
            debug: true
          });

          sdk.on('ready', () => {
            // Wait for callStarted to complete
            setTimeout(() => {
              cleanup();
              resolve({ timedOut: false, responses });
            }, 3000);
          });

          sdk.connect().catch((err) => {
            cleanup();
            resolve({ timedOut: false, responses, connectFailed: true, error: err.message });
          });

        } catch (err) {
          cleanup();
          reject(err);
        }
      });
    }, { clientId: CLIENT_ID, flowId: FLOW_ID, partnerId: PARTNER_ID });

    console.log('No-KS responses:', JSON.stringify(result.responses, null, 2));

    expect(result.timedOut).toBe(false);
    expect(result.connectFailed).toBeFalsy();

    // Server should still accept events (200) even without valid KS
    // It just won't enrich with KS-derived fields
    const callStarted = result.responses.find(r => r.eventType === '80002');
    expect(callStarted).toBeTruthy();
    expect(callStarted.ok).toBe(true);
    expect(callStarted.status).toBe(200);
  });

});
