// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Analytics Plugin Integration Tests — Real SDK + Plugin (no mocks)
 * Validates that the plugin correctly attaches to a real KalturaAvatarSDK instance,
 * subscribes to events, and fires analytics requests with correct params.
 * Uses the real SDK's internal socket simulation (no live server needed).
 */

test.describe('Analytics Plugin — Integration with Real SDK', () => {

  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto('/tests/e2e/test-runner.html');
    await page.waitForFunction(() =>
      typeof window.KalturaAvatarSDK !== 'undefined' &&
      typeof window.KalturaAvatarAnalytics !== 'undefined'
    );

    // Intercept fetch/sendBeacon globally
    await page.evaluate(() => {
      window._analyticsFetches = [];
      window._analyticsBeacons = [];
      window._originalFetch = window.fetch;
      window._originalBeacon = navigator.sendBeacon.bind(navigator);

      window.fetch = function (url, opts) {
        if (typeof url === 'string' && url.includes('analytics.kaltura.com')) {
          const body = opts && opts.body ? Object.fromEntries(new URLSearchParams(opts.body.toString())) : {};
          window._analyticsFetches.push({ url, method: opts?.method, body, timestamp: Date.now() });
          return Promise.resolve({ ok: true, status: 200 });
        }
        return window._originalFetch.apply(window, arguments);
      };

      navigator.sendBeacon = function (url, data) {
        if (typeof url === 'string' && url.includes('analytics.kaltura.com')) {
          const body = data ? Object.fromEntries(new URLSearchParams(data.toString())) : {};
          window._analyticsBeacons.push({ url, body, timestamp: Date.now() });
          return true;
        }
        return window._originalBeacon.apply(navigator, arguments);
      };
    });
  });

  test.beforeEach(async () => {
    await page.evaluate(() => {
      window._analyticsFetches = [];
      window._analyticsBeacons = [];
    });
  });

  test.afterAll(async () => {
    await page.evaluate(() => {
      window.fetch = window._originalFetch;
      navigator.sendBeacon = window._originalBeacon;
    });
    await page.close();
  });

  test('plugin attaches to real SDK and reads clientId/flowId', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({
        clientId: '115767973963657880005',
        flowId: 'agent-1',
        container: '#test-container',
        debug: false
      });

      const kava = new KalturaAvatarAnalytics(sdk, {
        ks: 'test-ks-token-integration',
        partnerId: 5975432,
        hostingApp: 'integration-test',
        hostingAppVer: '1.0.0'
      });

      const stats = kava.getStats();
      const clientId = sdk.getClientId();
      const flowId = sdk.getFlowId();

      kava.destroy();
      sdk.destroy();

      return { stats, clientId, flowId };
    });

    expect(result.clientId).toBe('115767973963657880005');
    expect(result.flowId).toBe('agent-1');
    expect(result.stats.eventsSent).toBe(0);
    expect(result.stats.sessionId).toBeTruthy();
  });

  test('plugin fires callStarted when SDK emits ready event', async () => {
    const result = await page.evaluate(async () => {
      const sdk = new KalturaAvatarSDK({
        clientId: '115767973963657880005',
        flowId: 'agent-1',
        container: '#test-container',
        debug: false
      });

      const kava = new KalturaAvatarAnalytics(sdk, {
        ks: 'test-ks-integration',
        partnerId: 5975432,
        autoStart: true,
        autoEnd: true,
        autoMessages: true
      });

      // Simulate the SDK emitting 'ready' by directly emitting on the SDK's emitter
      sdk._emitter.emit('ready');

      // Wait a tick for async processing
      await new Promise(r => setTimeout(r, 50));

      const fetches = [...window._analyticsFetches];
      const stats = kava.getStats();

      kava.destroy();
      sdk.destroy();

      return { fetches, stats };
    });

    expect(result.fetches.length).toBe(1);
    expect(result.fetches[0].body.eventType).toBe('80002');
    expect(result.fetches[0].body.partnerId).toBe('5975432');
    expect(result.fetches[0].body.ks).toBe('test-ks-integration');
    expect(result.stats.eventsSent).toBe(1);
  });

  test('plugin fires messageResponse on avatar-speech with correct fields', async () => {
    const result = await page.evaluate(async () => {
      const sdk = new KalturaAvatarSDK({
        clientId: '115767973963657880005',
        flowId: 'agent-1',
        container: '#test-container'
      });

      const kava = new KalturaAvatarAnalytics(sdk, {
        ks: 'test-ks',
        partnerId: 5975432
      });

      // Fire ready first (callStarted)
      sdk._emitter.emit('ready');
      await new Promise(r => setTimeout(r, 20));

      // Clear to isolate messageResponse
      window._analyticsFetches = [];

      // Simulate avatar speech
      sdk._emitter.emit('avatar-speech', { text: 'Hello, welcome to the demo!' });
      await new Promise(r => setTimeout(r, 20));

      const fetches = [...window._analyticsFetches];
      const stats = kava.getStats();

      kava.destroy();
      sdk.destroy();

      return { fetches, stats };
    });

    expect(result.fetches.length).toBe(1);
    expect(result.fetches[0].body.eventType).toBe('80001');
    expect(result.fetches[0].body.experience).toBe('2'); // CALL experience
    expect(result.fetches[0].body.responseType).toBe('1'); // TEXT
    expect(result.stats.messageCount).toBeGreaterThanOrEqual(1);
  });

  test('plugin fires messageResponse on user-speech (isFinal only)', async () => {
    const result = await page.evaluate(async () => {
      const sdk = new KalturaAvatarSDK({
        clientId: '115767973963657880005',
        flowId: 'agent-1',
        container: '#test-container'
      });

      const kava = new KalturaAvatarAnalytics(sdk, {
        ks: 'test-ks',
        partnerId: 5975432
      });

      sdk._emitter.emit('ready');
      await new Promise(r => setTimeout(r, 20));
      window._analyticsFetches = [];

      // Non-final should be ignored
      sdk._emitter.emit('user-speech', { text: 'Hello', isFinal: false });
      await new Promise(r => setTimeout(r, 20));

      const afterInterim = window._analyticsFetches.length;

      // Final should fire
      sdk._emitter.emit('user-speech', { text: 'Hello world', isFinal: true });
      await new Promise(r => setTimeout(r, 20));

      const fetches = [...window._analyticsFetches];
      kava.destroy();
      sdk.destroy();

      return { afterInterim, fetches };
    });

    expect(result.afterInterim).toBe(0);
    expect(result.fetches.length).toBe(1);
    expect(result.fetches[0].body.eventType).toBe('80001');
    expect(result.fetches[0].body.experience).toBe('1'); // CHAT experience
  });

  test('plugin fires callEnded on SDK disconnected event with duration', async () => {
    const result = await page.evaluate(async () => {
      const sdk = new KalturaAvatarSDK({
        clientId: '115767973963657880005',
        flowId: 'agent-1',
        container: '#test-container'
      });

      const kava = new KalturaAvatarAnalytics(sdk, {
        ks: 'test-ks',
        partnerId: 5975432
      });

      sdk._emitter.emit('ready');
      await new Promise(r => setTimeout(r, 100)); // Wait to accumulate some duration

      window._analyticsFetches = [];

      sdk._emitter.emit('disconnected');
      await new Promise(r => setTimeout(r, 20));

      const fetches = [...window._analyticsFetches];
      kava.destroy();
      sdk.destroy();

      return { fetches };
    });

    expect(result.fetches.length).toBe(1);
    expect(result.fetches[0].body.eventType).toBe('80003');
    expect(Number(result.fetches[0].body.totalCallTime)).toBeGreaterThanOrEqual(0);
  });

  test('plugin handles reconnect: new threadId + callId + callStarted', async () => {
    const result = await page.evaluate(async () => {
      const sdk = new KalturaAvatarSDK({
        clientId: '115767973963657880005',
        flowId: 'agent-1',
        container: '#test-container'
      });

      const kava = new KalturaAvatarAnalytics(sdk, {
        ks: 'test-ks',
        partnerId: 5975432
      });

      sdk._emitter.emit('ready');
      await new Promise(r => setTimeout(r, 20));

      const firstCallStarted = window._analyticsFetches[0];
      const firstThreadId = firstCallStarted.body.threadId;

      window._analyticsFetches = [];

      // Simulate reconnect
      sdk._emitter.emit('reconnected');
      await new Promise(r => setTimeout(r, 20));

      const reconnectFetches = [...window._analyticsFetches];
      const stats = kava.getStats();

      kava.destroy();
      sdk.destroy();

      return { firstThreadId, reconnectFetches, newThreadId: stats.threadId };
    });

    // Reconnect should fire callEnded + callStarted
    expect(result.reconnectFetches.length).toBe(2);
    expect(result.reconnectFetches[0].body.eventType).toBe('80003'); // callEnded
    expect(result.reconnectFetches[1].body.eventType).toBe('80002'); // new callStarted
    // New threadId should differ
    expect(result.newThreadId).not.toBe(result.firstThreadId);
  });

  test('eventIndex increments correctly across events', async () => {
    const result = await page.evaluate(async () => {
      const sdk = new KalturaAvatarSDK({
        clientId: '115767973963657880005',
        flowId: 'agent-1',
        container: '#test-container'
      });

      const kava = new KalturaAvatarAnalytics(sdk, {
        ks: 'test-ks',
        partnerId: 5975432
      });

      // Emit 3 events: ready, avatar-speech, avatar-speech
      sdk._emitter.emit('ready');
      await new Promise(r => setTimeout(r, 10));
      sdk._emitter.emit('avatar-speech', { text: 'First message' });
      await new Promise(r => setTimeout(r, 10));
      sdk._emitter.emit('avatar-speech', { text: 'Second message' });
      await new Promise(r => setTimeout(r, 10));

      const indices = window._analyticsFetches.map(f => f.body.eventIndex);

      kava.destroy();
      sdk.destroy();

      return { indices };
    });

    expect(result.indices).toEqual(['1', '2', '3']);
  });

  test('manual sendFeedback fires event type 80005', async () => {
    const result = await page.evaluate(async () => {
      const sdk = new KalturaAvatarSDK({
        clientId: '115767973963657880005',
        flowId: 'agent-1',
        container: '#test-container'
      });

      const kava = new KalturaAvatarAnalytics(sdk, {
        ks: 'test-ks',
        partnerId: 5975432
      });

      sdk._emitter.emit('ready');
      await new Promise(r => setTimeout(r, 10));
      window._analyticsFetches = [];

      kava.sendFeedback('msg-123', 'like');
      await new Promise(r => setTimeout(r, 10));

      const fetches = [...window._analyticsFetches];
      kava.destroy();
      sdk.destroy();

      return { fetches };
    });

    expect(result.fetches.length).toBe(1);
    expect(result.fetches[0].body.eventType).toBe('80005');
    expect(result.fetches[0].body.messageId).toBe('msg-123');
    expect(result.fetches[0].body.reactionType).toBe('1'); // LIKE
  });

  test('manual pageView fires event type 10003', async () => {
    const result = await page.evaluate(async () => {
      const sdk = new KalturaAvatarSDK({
        clientId: '115767973963657880005',
        flowId: 'agent-1',
        container: '#test-container'
      });

      const kava = new KalturaAvatarAnalytics(sdk, {
        ks: 'test-ks',
        partnerId: 5975432
      });

      window._analyticsFetches = [];
      kava.pageView('Slide 1 - Intro', '1');
      await new Promise(r => setTimeout(r, 10));

      const fetches = [...window._analyticsFetches];
      kava.destroy();
      sdk.destroy();

      return { fetches };
    });

    expect(result.fetches.length).toBe(1);
    expect(result.fetches[0].body.eventType).toBe('10003');
    expect(result.fetches[0].body.pageName).toBe('Slide 1 - Intro');
  });

  test('setContextId affects subsequent events', async () => {
    const result = await page.evaluate(async () => {
      const sdk = new KalturaAvatarSDK({
        clientId: '115767973963657880005',
        flowId: 'agent-1',
        container: '#test-container'
      });

      const kava = new KalturaAvatarAnalytics(sdk, {
        ks: 'test-ks',
        partnerId: 5975432
      });

      sdk._emitter.emit('ready');
      await new Promise(r => setTimeout(r, 10));

      kava.setContextId('3:earnings');
      window._analyticsFetches = [];

      sdk._emitter.emit('avatar-speech', { text: 'Context test' });
      await new Promise(r => setTimeout(r, 10));

      const fetches = [...window._analyticsFetches];
      kava.destroy();
      sdk.destroy();

      return { fetches };
    });

    expect(result.fetches[0].body.contextId).toBe('3:earnings');
  });

  test('destroy fires callEnded and stops subsequent events', async () => {
    const result = await page.evaluate(async () => {
      const sdk = new KalturaAvatarSDK({
        clientId: '115767973963657880005',
        flowId: 'agent-1',
        container: '#test-container'
      });

      const kava = new KalturaAvatarAnalytics(sdk, {
        ks: 'test-ks',
        partnerId: 5975432
      });

      sdk._emitter.emit('ready');
      await new Promise(r => setTimeout(r, 10));
      window._analyticsFetches = [];

      kava.destroy();
      await new Promise(r => setTimeout(r, 10));

      const afterDestroy = window._analyticsFetches.length;

      // Events after destroy should not fire
      sdk._emitter.emit('avatar-speech', { text: 'Should be ignored' });
      await new Promise(r => setTimeout(r, 10));

      const afterPostDestroy = window._analyticsFetches.length;
      sdk.destroy();

      return { afterDestroy, afterPostDestroy };
    });

    // destroy should fire callEnded (1 event)
    expect(result.afterDestroy).toBe(1);
    // No more events after destroy
    expect(result.afterPostDestroy).toBe(1);
  });

  test('plugin emits sent/error events for observability', async () => {
    const result = await page.evaluate(async () => {
      const sdk = new KalturaAvatarSDK({
        clientId: '115767973963657880005',
        flowId: 'agent-1',
        container: '#test-container'
      });

      const kava = new KalturaAvatarAnalytics(sdk, {
        ks: 'test-ks',
        partnerId: 5975432
      });

      const sentEvents = [];
      kava.on('sent', (e) => sentEvents.push(e));

      sdk._emitter.emit('ready');
      await new Promise(r => setTimeout(r, 30));

      kava.destroy();
      sdk.destroy();

      return { sentCount: sentEvents.length, firstType: sentEvents[0]?.eventType };
    });

    expect(result.sentCount).toBeGreaterThanOrEqual(1);
    expect(result.firstType).toBe(80002);
  });

  test('full lifecycle: connect → speak → disconnect generates correct sequence', async () => {
    const result = await page.evaluate(async () => {
      const sdk = new KalturaAvatarSDK({
        clientId: '115767973963657880005',
        flowId: 'agent-1',
        container: '#test-container'
      });

      const kava = new KalturaAvatarAnalytics(sdk, {
        ks: 'djJ8NjQ5NjMwMn...',
        partnerId: 5975432,
        hostingApp: 'demo-app',
        hostingAppVer: '2.4.7'
      });

      // Full lifecycle simulation
      sdk._emitter.emit('ready');
      await new Promise(r => setTimeout(r, 10));

      sdk._emitter.emit('avatar-speech', { text: 'Welcome to our demo.' });
      await new Promise(r => setTimeout(r, 10));

      sdk._emitter.emit('user-speech', { text: 'Thanks!', isFinal: true });
      await new Promise(r => setTimeout(r, 10));

      sdk._emitter.emit('avatar-speech', { text: 'How can I help you today?' });
      await new Promise(r => setTimeout(r, 10));

      sdk._emitter.emit('disconnected');
      await new Promise(r => setTimeout(r, 10));

      const fetches = window._analyticsFetches.map(f => ({
        eventType: f.body.eventType,
        eventIndex: f.body.eventIndex,
        partnerId: f.body.partnerId,
        threadId: f.body.threadId,
        sessionId: f.body.sessionId
      }));

      const stats = kava.getStats();
      kava.destroy();
      sdk.destroy();

      return { fetches, stats };
    });

    // Should be: callStarted, messageResponse x2, messageResponse (user), callEnded
    expect(result.fetches.length).toBe(5);
    expect(result.fetches.map(f => f.eventType)).toEqual(['80002', '80001', '80001', '80001', '80003']);
    expect(result.fetches.map(f => f.eventIndex)).toEqual(['1', '2', '3', '4', '5']);

    // All events share same threadId and sessionId
    const threadIds = new Set(result.fetches.map(f => f.threadId));
    const sessionIds = new Set(result.fetches.map(f => f.sessionId));
    expect(threadIds.size).toBe(1);
    expect(sessionIds.size).toBe(1);

    // Stats reflect the session
    expect(result.stats.eventsSent).toBe(5);
    expect(result.stats.messageCount).toBe(3);
  });

  test('plugin does not interfere with SDK event handling', async () => {
    const result = await page.evaluate(async () => {
      const sdk = new KalturaAvatarSDK({
        clientId: '115767973963657880005',
        flowId: 'agent-1',
        container: '#test-container'
      });

      // SDK listener should still work normally
      const sdkEvents = [];
      sdk.on('avatar-speech', (data) => sdkEvents.push(data));
      sdk.on('ready', () => sdkEvents.push('ready'));

      const kava = new KalturaAvatarAnalytics(sdk, {
        ks: 'test-ks',
        partnerId: 5975432
      });

      sdk._emitter.emit('ready');
      sdk._emitter.emit('avatar-speech', { text: 'Test message' });
      await new Promise(r => setTimeout(r, 20));

      kava.destroy();
      sdk.destroy();

      return { sdkEvents };
    });

    expect(result.sdkEvents).toContain('ready');
    expect(result.sdkEvents.find(e => e?.text === 'Test message')).toBeTruthy();
  });

  test('static constants are accessible', async () => {
    const result = await page.evaluate(() => {
      return {
        eventType: KalturaAvatarAnalytics.EventType,
        experienceType: KalturaAvatarAnalytics.ExperienceType,
        responseType: KalturaAvatarAnalytics.ResponseType,
        reactionType: KalturaAvatarAnalytics.ReactionType,
        contextType: KalturaAvatarAnalytics.ContextType
      };
    });

    expect(result.eventType.MESSAGE_RESPONSE).toBe(80001);
    expect(result.eventType.CALL_STARTED).toBe(80002);
    expect(result.eventType.CALL_ENDED).toBe(80003);
    expect(result.eventType.MESSAGE_FEEDBACK).toBe(80005);
    expect(result.experienceType.CHAT).toBe(1);
    expect(result.experienceType.CALL).toBe(2);
    expect(result.responseType.TEXT).toBe(1);
    expect(result.reactionType.LIKE).toBe(1);
    expect(result.reactionType.DISLIKE).toBe(2);
  });

  test('genieId and agentId auto-populated from SDK', async () => {
    const result = await page.evaluate(async () => {
      const sdk = new KalturaAvatarSDK({
        clientId: '115767973963657880005',
        flowId: 'agent-1',
        container: '#test-container'
      });

      const kava = new KalturaAvatarAnalytics(sdk, {
        ks: 'test-ks',
        partnerId: 5975432
      });

      sdk._emitter.emit('ready');
      await new Promise(r => setTimeout(r, 10));

      const fetch = window._analyticsFetches[0];
      kava.destroy();
      sdk.destroy();

      return { genieId: fetch.body.genieId, agentId: fetch.body.agentId };
    });

    expect(result.genieId).toBe('115767973963657880005');
    expect(result.agentId).toBe('agent-1');
  });

});
