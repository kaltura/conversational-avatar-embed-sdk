// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Demo App Smoke Test — verifies the analytics plugin loads cleanly
 * alongside the real SDK in the demo app context without errors.
 */

test.describe('Demo App — Analytics Plugin Smoke Test', () => {

  test('demo page loads SDK + plugin without console errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    // Load demo page
    await page.goto('/examples/demo/index.html');

    // Verify SDK loaded
    const sdkLoaded = await page.evaluate(() => typeof window.KalturaAvatarSDK !== 'undefined');
    expect(sdkLoaded).toBe(true);

    // Inject the analytics plugin script dynamically (as a user would)
    await page.addScriptTag({ url: '/plugins/kava-analytics/kaltura-avatar-analytics.js' });

    const pluginLoaded = await page.evaluate(() => typeof window.KalturaAvatarAnalytics !== 'undefined');
    expect(pluginLoaded).toBe(true);

    // Verify no errors from loading
    expect(errors).toEqual([]);
  });

  test('plugin attaches to SDK created by demo doConnect() without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/examples/demo/index.html');
    await page.addScriptTag({ url: '/plugins/kava-analytics/kaltura-avatar-analytics.js' });

    // Simulate what a user would do: create SDK and attach plugin
    const result = await page.evaluate(() => {
      // Create SDK just like the demo's doConnect()
      const sdk = new KalturaAvatarSDK({
        clientId: '115767973963657880005',
        flowId: 'agent-1',
        container: '#avatar-container',
        debug: false
      });

      // Attach analytics plugin
      const kava = new KalturaAvatarAnalytics(sdk, {
        ks: 'test-demo-ks',
        partnerId: 5975432,
      });

      const stats = kava.getStats();
      const version = KalturaAvatarSDK.VERSION;

      // Cleanup without connecting (no real server)
      kava.destroy();
      sdk.destroy();

      return { stats, version, pluginAttached: true };
    });

    expect(result.pluginAttached).toBe(true);
    expect(result.stats.sessionId).toBeTruthy();
    expect(result.version).toBeTruthy();
    expect(errors).toEqual([]);
  });

  test('plugin fires analytics on simulated SDK events in demo context', async ({ page }) => {
    await page.goto('/examples/demo/index.html');
    await page.addScriptTag({ url: '/plugins/kava-analytics/kaltura-avatar-analytics.js' });

    const result = await page.evaluate(async () => {
      // Intercept fetch
      const captured = [];
      const origFetch = window.fetch;
      window.fetch = function (url, opts) {
        if (typeof url === 'string' && url.includes('analytics.kaltura.com')) {
          const body = opts?.body ? Object.fromEntries(new URLSearchParams(opts.body.toString())) : {};
          captured.push({ eventType: body.eventType, partnerId: body.partnerId });
          return Promise.resolve({ ok: true, status: 200 });
        }
        return origFetch.apply(window, arguments);
      };

      const sdk = new KalturaAvatarSDK({
        clientId: '115767973963657880005',
        flowId: 'agent-1',
        container: '#avatar-container',
        debug: false
      });

      const kava = new KalturaAvatarAnalytics(sdk, {
        ks: 'test-ks',
        partnerId: 5975432
      });

      // Simulate lifecycle
      sdk._emitter.emit('ready');
      await new Promise(r => setTimeout(r, 20));

      sdk._emitter.emit('avatar-speech', { text: 'Hello from demo!' });
      await new Promise(r => setTimeout(r, 20));

      sdk._emitter.emit('disconnected');
      await new Promise(r => setTimeout(r, 20));

      kava.destroy();
      sdk.destroy();
      window.fetch = origFetch;

      return { captured };
    });

    // callStarted, messageResponse, callEnded
    expect(result.captured.length).toBe(3);
    expect(result.captured[0].eventType).toBe('80002');
    expect(result.captured[1].eventType).toBe('80001');
    expect(result.captured[2].eventType).toBe('80003');
    expect(result.captured[0].partnerId).toBe('5975432');
  });

});
