// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Analytics Plugin Tests — run in the browser via Playwright
 * Tests the KAVA analytics plugin using a mock SDK to simulate events.
 */

test.describe('KalturaAvatarAnalytics — Unit Tests', () => {

  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto('/tests/e2e/test-runner.html');
    await page.waitForFunction(() =>
      typeof window.KalturaAvatarSDK !== 'undefined' &&
      typeof window.KalturaAvatarAnalytics !== 'undefined'
    );

    // Set up mock SDK factory and fetch interceptor in the page
    await page.evaluate(() => {
      window._fetchCalls = [];
      window._beaconCalls = [];
      window._originalFetch = window.fetch;
      window._originalBeacon = navigator.sendBeacon.bind(navigator);

      window.fetch = function (url, opts) {
        const body = opts && opts.body ? Object.fromEntries(new URLSearchParams(opts.body.toString())) : {};
        window._fetchCalls.push({ url, method: opts?.method, body });
        return Promise.resolve({ ok: true, status: 200 });
      };

      navigator.sendBeacon = function (url, data) {
        const body = data ? Object.fromEntries(new URLSearchParams(data.toString())) : {};
        window._beaconCalls.push({ url, body });
        return true;
      };

      // Mock SDK factory
      window.createMockSDK = function (state) {
        const listeners = {};
        return {
          _state: state || 'uninitialized',
          on(event, handler) {
            if (!listeners[event]) listeners[event] = [];
            listeners[event].push(handler);
            return () => {
              const idx = listeners[event].indexOf(handler);
              if (idx !== -1) listeners[event].splice(idx, 1);
            };
          },
          off(event, handler) {
            if (!listeners[event]) return;
            const idx = listeners[event].indexOf(handler);
            if (idx !== -1) listeners[event].splice(idx, 1);
          },
          emit(event, data) {
            if (listeners[event]) {
              for (const fn of listeners[event]) fn(data);
            }
          },
          getState() { return this._state; },
          getClientId() { return 'test-client-123'; },
          getFlowId() { return 'test-flow-456'; },
          getSessionId() { return 'session-abc'; },
          _listeners: listeners
        };
      };
    });
  });

  test.beforeEach(async () => {
    await page.evaluate(() => {
      window._fetchCalls = [];
      window._beaconCalls = [];
    });
  });

  test.afterAll(async () => {
    await page.evaluate(() => {
      window.fetch = window._originalFetch;
      navigator.sendBeacon = window._originalBeacon;
    });
    await page.close();
  });

  // ────────────────────────────────────────────────────────────────────
  // CONSTRUCTOR VALIDATION
  // ────────────────────────────────────────────────────────────────────

  test('constructor requires SDK instance', async () => {
    const result = await page.evaluate(() => {
      try { new KalturaAvatarAnalytics(null, { ks: 'x', partnerId: 1 }); return null; }
      catch (e) { return e.message; }
    });
    expect(result).toContain('KalturaAvatarSDK instance');
  });

  test('constructor requires config.ks', async () => {
    const result = await page.evaluate(() => {
      try {
        const sdk = window.createMockSDK();
        new KalturaAvatarAnalytics(sdk, { partnerId: 1 });
        return null;
      } catch (e) { return e.message; }
    });
    expect(result).toContain('config.ks is required');
  });

  test('constructor requires config.partnerId', async () => {
    const result = await page.evaluate(() => {
      try {
        const sdk = window.createMockSDK();
        new KalturaAvatarAnalytics(sdk, { ks: 'test-ks' });
        return null;
      } catch (e) { return e.message; }
    });
    expect(result).toContain('config.partnerId is required');
  });

  test('constructor accepts valid minimal config', async () => {
    const result = await page.evaluate(() => {
      const sdk = window.createMockSDK();
      const kava = new KalturaAvatarAnalytics(sdk, { ks: 'test-ks', partnerId: 12345 });
      const stats = kava.getStats();
      kava.destroy();
      return stats;
    });
    expect(result.eventsSent).toBe(0);
    expect(result.sessionId).toBeTruthy();
  });

  // ────────────────────────────────────────────────────────────────────
  // AUTO LIFECYCLE EVENTS
  // ────────────────────────────────────────────────────────────────────

  test('callStarted fires on SDK ready event', async () => {
    const result = await page.evaluate(() => {
      const sdk = window.createMockSDK();
      const kava = new KalturaAvatarAnalytics(sdk, { ks: 'ks1', partnerId: 999 });
      sdk.emit('ready');
      return new Promise(resolve => setTimeout(() => {
        const calls = window._fetchCalls.slice();
        kava.destroy();
        resolve(calls);
      }, 50));
    });
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].body.eventType).toBe('80002');
    expect(result[0].body.callId).toBeTruthy();
  });

  test('callStarted has correct partnerId and ks', async () => {
    const result = await page.evaluate(() => {
      const sdk = window.createMockSDK();
      const kava = new KalturaAvatarAnalytics(sdk, { ks: 'my-ks-token', partnerId: 5975432 });
      sdk.emit('ready');
      return new Promise(resolve => setTimeout(() => {
        const body = window._fetchCalls[0]?.body;
        kava.destroy();
        resolve(body);
      }, 50));
    });
    expect(result.partnerId).toBe('5975432');
    expect(result.ks).toBe('my-ks-token');
  });

  test('callEnded fires on SDK disconnected event', async () => {
    const result = await page.evaluate(() => {
      const sdk = window.createMockSDK();
      const kava = new KalturaAvatarAnalytics(sdk, { ks: 'ks1', partnerId: 1 });
      sdk.emit('ready');
      sdk.emit('disconnected');
      return new Promise(resolve => setTimeout(() => {
        const calls = window._fetchCalls.slice();
        kava.destroy();
        resolve(calls);
      }, 50));
    });
    const endEvent = result.find(c => c.body.eventType === '80003');
    expect(endEvent).toBeTruthy();
    expect(endEvent.body.totalCallTime).toBeDefined();
  });

  test('callEnded includes totalCallTime', async () => {
    const result = await page.evaluate(() => {
      const sdk = window.createMockSDK();
      const kava = new KalturaAvatarAnalytics(sdk, { ks: 'ks1', partnerId: 1 });
      sdk.emit('ready');
      return new Promise(resolve => setTimeout(() => {
        sdk.emit('disconnected');
        setTimeout(() => {
          const endCall = window._fetchCalls.find(c => c.body.eventType === '80003');
          kava.destroy();
          resolve(endCall?.body);
        }, 50);
      }, 100));
    });
    expect(Number(result.totalCallTime)).toBeGreaterThanOrEqual(0);
  });

  test('callEnded fires via visibilitychange hidden', async () => {
    const result = await page.evaluate(() => {
      const sdk = window.createMockSDK();
      const kava = new KalturaAvatarAnalytics(sdk, { ks: 'ks1', partnerId: 1 });
      sdk.emit('ready');
      // Simulate visibilitychange
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      const beacons = window._beaconCalls.slice();
      kava.destroy();
      return beacons;
    });
    const endBeacon = result.find(c => c.body.eventType === '80003');
    expect(endBeacon).toBeTruthy();
  });

  test('no callStarted if autoStart=false', async () => {
    const result = await page.evaluate(() => {
      const sdk = window.createMockSDK();
      const kava = new KalturaAvatarAnalytics(sdk, { ks: 'ks1', partnerId: 1, autoStart: false });
      sdk.emit('ready');
      return new Promise(resolve => setTimeout(() => {
        const calls = window._fetchCalls.slice();
        kava.destroy();
        resolve(calls);
      }, 50));
    });
    const startEvent = result.find(c => c.body.eventType === '80002');
    expect(startEvent).toBeUndefined();
  });

  // ────────────────────────────────────────────────────────────────────
  // MESSAGE TRACKING
  // ────────────────────────────────────────────────────────────────────

  test('messageResponse fires on avatar-speech with experience=2', async () => {
    const result = await page.evaluate(() => {
      const sdk = window.createMockSDK();
      const kava = new KalturaAvatarAnalytics(sdk, { ks: 'ks1', partnerId: 1 });
      sdk.emit('ready');
      sdk.emit('avatar-speech', { text: 'Hello user' });
      return new Promise(resolve => setTimeout(() => {
        const msgEvent = window._fetchCalls.find(c => c.body.eventType === '80001');
        kava.destroy();
        resolve(msgEvent?.body);
      }, 50));
    });
    expect(result).toBeTruthy();
    expect(result.experience).toBe('2');
    expect(result.messageId).toBe('1');
  });

  test('messageResponse fires on user-speech with isFinal=true', async () => {
    const result = await page.evaluate(() => {
      const sdk = window.createMockSDK();
      const kava = new KalturaAvatarAnalytics(sdk, { ks: 'ks1', partnerId: 1 });
      sdk.emit('ready');
      sdk.emit('user-speech', { text: 'Hi there', isFinal: true });
      return new Promise(resolve => setTimeout(() => {
        const msgEvent = window._fetchCalls.find(c => c.body.eventType === '80001' && c.body.experience === '1');
        kava.destroy();
        resolve(msgEvent?.body);
      }, 50));
    });
    expect(result).toBeTruthy();
    expect(result.experience).toBe('1');
  });

  test('user-speech with isFinal=false is ignored', async () => {
    const result = await page.evaluate(() => {
      const sdk = window.createMockSDK();
      const kava = new KalturaAvatarAnalytics(sdk, { ks: 'ks1', partnerId: 1 });
      sdk.emit('ready');
      sdk.emit('user-speech', { text: 'partial', isFinal: false });
      return new Promise(resolve => setTimeout(() => {
        const msgEvents = window._fetchCalls.filter(c => c.body.eventType === '80001');
        kava.destroy();
        resolve(msgEvents.length);
      }, 50));
    });
    expect(result).toBe(0);
  });

  test('empty avatar-speech text is ignored', async () => {
    const result = await page.evaluate(() => {
      const sdk = window.createMockSDK();
      const kava = new KalturaAvatarAnalytics(sdk, { ks: 'ks1', partnerId: 1 });
      sdk.emit('ready');
      sdk.emit('avatar-speech', { text: '' });
      sdk.emit('avatar-speech', {});
      return new Promise(resolve => setTimeout(() => {
        const msgEvents = window._fetchCalls.filter(c => c.body.eventType === '80001');
        kava.destroy();
        resolve(msgEvents.length);
      }, 50));
    });
    expect(result).toBe(0);
  });

  test('messageId auto-increments', async () => {
    const result = await page.evaluate(() => {
      const sdk = window.createMockSDK();
      const kava = new KalturaAvatarAnalytics(sdk, { ks: 'ks1', partnerId: 1 });
      sdk.emit('ready');
      sdk.emit('avatar-speech', { text: 'first' });
      sdk.emit('avatar-speech', { text: 'second' });
      sdk.emit('user-speech', { text: 'third', isFinal: true });
      return new Promise(resolve => setTimeout(() => {
        const msgs = window._fetchCalls.filter(c => c.body.eventType === '80001');
        kava.destroy();
        resolve(msgs.map(m => m.body.messageId));
      }, 50));
    });
    expect(result).toEqual(['1', '2', '3']);
  });

  // ────────────────────────────────────────────────────────────────────
  // MANUAL EVENTS
  // ────────────────────────────────────────────────────────────────────

  test('sendFeedback sends eventType=80005 with reactionType', async () => {
    const result = await page.evaluate(() => {
      const sdk = window.createMockSDK();
      const kava = new KalturaAvatarAnalytics(sdk, { ks: 'ks1', partnerId: 1 });
      kava.sendFeedback('msg-42', 'like');
      return new Promise(resolve => setTimeout(() => {
        const evt = window._fetchCalls.find(c => c.body.eventType === '80005');
        kava.destroy();
        resolve(evt?.body);
      }, 50));
    });
    expect(result.eventType).toBe('80005');
    expect(result.messageId).toBe('msg-42');
    expect(result.reactionType).toBe('1');
  });

  test('pageView sends eventType=10003', async () => {
    const result = await page.evaluate(() => {
      const sdk = window.createMockSDK();
      const kava = new KalturaAvatarAnalytics(sdk, { ks: 'ks1', partnerId: 1 });
      kava.pageView('Slide 1 - Intro', 'View');
      return new Promise(resolve => setTimeout(() => {
        const evt = window._fetchCalls.find(c => c.body.eventType === '10003');
        kava.destroy();
        resolve(evt?.body);
      }, 50));
    });
    expect(result.eventType).toBe('10003');
    expect(result.pageName).toBe('Slide 1 - Intro');
    expect(result.feature).toBe('Avatar');
  });

  test('buttonClick sends eventType=10002', async () => {
    const result = await page.evaluate(() => {
      const sdk = window.createMockSDK();
      const kava = new KalturaAvatarAnalytics(sdk, { ks: 'ks1', partnerId: 1 });
      kava.buttonClick('Mute', 'on', 'Close');
      return new Promise(resolve => setTimeout(() => {
        const evt = window._fetchCalls.find(c => c.body.eventType === '10002');
        kava.destroy();
        resolve(evt?.body);
      }, 50));
    });
    expect(result.eventType).toBe('10002');
    expect(result.buttonName).toBe('Mute');
    expect(result.feature).toBe('Avatar');
  });

  test('customEvent sends arbitrary type and fields', async () => {
    const result = await page.evaluate(() => {
      const sdk = window.createMockSDK();
      const kava = new KalturaAvatarAnalytics(sdk, { ks: 'ks1', partnerId: 1 });
      kava.customEvent(99999, { customField: 'hello', anotherField: 42 });
      return new Promise(resolve => setTimeout(() => {
        const evt = window._fetchCalls.find(c => c.body.eventType === '99999');
        kava.destroy();
        resolve(evt?.body);
      }, 50));
    });
    expect(result.eventType).toBe('99999');
    expect(result.customField).toBe('hello');
    expect(result.anotherField).toBe('42');
  });

  // ────────────────────────────────────────────────────────────────────
  // SESSION MANAGEMENT
  // ────────────────────────────────────────────────────────────────────

  test('eventIndex starts at 1 and increments', async () => {
    const result = await page.evaluate(() => {
      const sdk = window.createMockSDK();
      const kava = new KalturaAvatarAnalytics(sdk, { ks: 'ks1', partnerId: 1 });
      sdk.emit('ready');
      kava.pageView('page1');
      kava.pageView('page2');
      return new Promise(resolve => setTimeout(() => {
        const indices = window._fetchCalls.map(c => c.body.eventIndex);
        kava.destroy();
        resolve(indices);
      }, 50));
    });
    expect(result[0]).toBe('1');
    expect(result[1]).toBe('2');
    expect(result[2]).toBe('3');
  });

  test('reconnection resets threadId, callId, eventIndex', async () => {
    const result = await page.evaluate(() => {
      const sdk = window.createMockSDK();
      const kava = new KalturaAvatarAnalytics(sdk, { ks: 'ks1', partnerId: 1 });
      sdk.emit('ready');
      const firstThread = window._fetchCalls[0]?.body.threadId;
      sdk.emit('reconnected');
      return new Promise(resolve => setTimeout(() => {
        // After reconnect: callEnded for old + callStarted for new
        const startEvents = window._fetchCalls.filter(c => c.body.eventType === '80002');
        const secondStart = startEvents[startEvents.length - 1]?.body;
        kava.destroy();
        resolve({ firstThread, secondThread: secondStart?.threadId, secondIndex: secondStart?.eventIndex });
      }, 50));
    });
    expect(result.firstThread).not.toBe(result.secondThread);
    expect(result.secondIndex).toBe('1');
  });

  test('reconnection fires new callStarted', async () => {
    const result = await page.evaluate(() => {
      const sdk = window.createMockSDK();
      const kava = new KalturaAvatarAnalytics(sdk, { ks: 'ks1', partnerId: 1 });
      sdk.emit('ready');
      sdk.emit('reconnected');
      return new Promise(resolve => setTimeout(() => {
        const starts = window._fetchCalls.filter(c => c.body.eventType === '80002');
        kava.destroy();
        resolve(starts.length);
      }, 50));
    });
    expect(result).toBe(2);
  });

  test('sessionId persists across reconnections', async () => {
    const result = await page.evaluate(() => {
      const sdk = window.createMockSDK();
      const kava = new KalturaAvatarAnalytics(sdk, { ks: 'ks1', partnerId: 1 });
      sdk.emit('ready');
      const firstSession = window._fetchCalls[0]?.body.sessionId;
      sdk.emit('reconnected');
      return new Promise(resolve => setTimeout(() => {
        const all = window._fetchCalls.map(c => c.body.sessionId);
        const allSame = all.every(s => s === firstSession);
        kava.destroy();
        resolve({ allSame, sessionId: firstSession });
      }, 50));
    });
    expect(result.allSame).toBe(true);
    expect(result.sessionId).toBeTruthy();
  });

  test('genieId auto-read from SDK, overrideable', async () => {
    const result = await page.evaluate(() => {
      const sdk = window.createMockSDK();
      // Default: reads from sdk.getClientId()
      const kava1 = new KalturaAvatarAnalytics(sdk, { ks: 'ks1', partnerId: 1 });
      kava1.pageView('test');
      const autoGenie = window._fetchCalls[0]?.body.genieId;
      kava1.destroy();

      window._fetchCalls = [];
      // Override
      const kava2 = new KalturaAvatarAnalytics(sdk, { ks: 'ks1', partnerId: 1, genieId: 'custom-genie' });
      kava2.pageView('test');
      const overrideGenie = window._fetchCalls[0]?.body.genieId;
      kava2.destroy();

      return { autoGenie, overrideGenie };
    });
    expect(result.autoGenie).toBe('test-client-123');
    expect(result.overrideGenie).toBe('custom-genie');
  });

  // ────────────────────────────────────────────────────────────────────
  // CONTEXT & STATE
  // ────────────────────────────────────────────────────────────────────

  test('setContextId affects subsequent events', async () => {
    const result = await page.evaluate(() => {
      const sdk = window.createMockSDK();
      const kava = new KalturaAvatarAnalytics(sdk, { ks: 'ks1', partnerId: 1 });
      kava.pageView('before');
      kava.setContextId('3:earnings');
      kava.pageView('after');
      return new Promise(resolve => setTimeout(() => {
        const pages = window._fetchCalls.filter(c => c.body.eventType === '10003');
        kava.destroy();
        resolve({ before: pages[0]?.body.contextId, after: pages[1]?.body.contextId });
      }, 50));
    });
    expect(result.before).toBeFalsy();
    expect(result.after).toBe('3:earnings');
  });

  test('setEntryId affects subsequent events', async () => {
    const result = await page.evaluate(() => {
      const sdk = window.createMockSDK();
      const kava = new KalturaAvatarAnalytics(sdk, { ks: 'ks1', partnerId: 1 });
      kava.setEntryId('entry_abc');
      kava.pageView('test');
      return new Promise(resolve => setTimeout(() => {
        kava.destroy();
        resolve(window._fetchCalls[0]?.body.entryId);
      }, 50));
    });
    expect(result).toBe('entry_abc');
  });

  test('setMetadata affects subsequent events', async () => {
    const result = await page.evaluate(() => {
      const sdk = window.createMockSDK();
      const kava = new KalturaAvatarAnalytics(sdk, { ks: 'ks1', partnerId: 1 });
      kava.setMetadata('customVar1', 'slide-data');
      kava.pageView('test');
      return new Promise(resolve => setTimeout(() => {
        kava.destroy();
        resolve(window._fetchCalls[0]?.body.customVar1);
      }, 50));
    });
    expect(result).toBe('slide-data');
  });

  test('setKS updates for next event', async () => {
    const result = await page.evaluate(() => {
      const sdk = window.createMockSDK();
      const kava = new KalturaAvatarAnalytics(sdk, { ks: 'old-ks', partnerId: 1 });
      kava.pageView('first');
      kava.setKS('new-ks');
      kava.pageView('second');
      return new Promise(resolve => setTimeout(() => {
        const pages = window._fetchCalls.filter(c => c.body.eventType === '10003');
        kava.destroy();
        resolve({ first: pages[0]?.body.ks, second: pages[1]?.body.ks });
      }, 50));
    });
    expect(result.first).toBe('old-ks');
    expect(result.second).toBe('new-ks');
  });

  // ────────────────────────────────────────────────────────────────────
  // TRANSPORT & HOOKS
  // ────────────────────────────────────────────────────────────────────

  test('fetch called with correct URL and POST method', async () => {
    const result = await page.evaluate(() => {
      const sdk = window.createMockSDK();
      const kava = new KalturaAvatarAnalytics(sdk, { ks: 'ks1', partnerId: 1 });
      kava.pageView('test');
      return new Promise(resolve => setTimeout(() => {
        kava.destroy();
        resolve({ url: window._fetchCalls[0]?.url, method: window._fetchCalls[0]?.method });
      }, 50));
    });
    expect(result.url).toBe('https://analytics.kaltura.com/api_v3/index.php');
    expect(result.method).toBe('POST');
  });

  test('tamperHandler returning false suppresses event', async () => {
    const result = await page.evaluate(() => {
      const sdk = window.createMockSDK();
      const kava = new KalturaAvatarAnalytics(sdk, {
        ks: 'ks1',
        partnerId: 1,
        tamperHandler: (params) => params.eventType !== 10003
      });
      kava.pageView('suppressed');
      kava.buttonClick('allowed');
      return new Promise(resolve => setTimeout(() => {
        kava.destroy();
        resolve(window._fetchCalls.map(c => c.body.eventType));
      }, 50));
    });
    expect(result).not.toContain('10003');
    expect(result).toContain('10002');
  });

  test('destroy stops all event firing', async () => {
    const result = await page.evaluate(() => {
      const sdk = window.createMockSDK();
      const kava = new KalturaAvatarAnalytics(sdk, { ks: 'ks1', partnerId: 1 });
      kava.destroy();
      window._fetchCalls = [];
      sdk.emit('ready');
      kava.pageView('ignored');
      return new Promise(resolve => setTimeout(() => {
        resolve(window._fetchCalls.length);
      }, 50));
    });
    expect(result).toBe(0);
  });

  test('getStats returns correct counts', async () => {
    const result = await page.evaluate(() => {
      const sdk = window.createMockSDK();
      const kava = new KalturaAvatarAnalytics(sdk, { ks: 'ks1', partnerId: 1 });
      sdk.emit('ready');
      sdk.emit('avatar-speech', { text: 'hello' });
      sdk.emit('avatar-speech', { text: 'world' });
      return new Promise(resolve => setTimeout(() => {
        const stats = kava.getStats();
        kava.destroy();
        resolve(stats);
      }, 100));
    });
    expect(result.eventsSent).toBe(3); // callStarted + 2 messageResponse
    expect(result.messageCount).toBe(2);
  });

  // ────────────────────────────────────────────────────────────────────
  // EDGE CASES
  // ────────────────────────────────────────────────────────────────────

  test('plugin created when SDK already in-conversation fires immediate callStarted', async () => {
    const result = await page.evaluate(() => {
      const sdk = window.createMockSDK('in-conversation');
      const kava = new KalturaAvatarAnalytics(sdk, { ks: 'ks1', partnerId: 1 });
      return new Promise(resolve => setTimeout(() => {
        const starts = window._fetchCalls.filter(c => c.body.eventType === '80002');
        kava.destroy();
        resolve(starts.length);
      }, 50));
    });
    expect(result).toBe(1);
  });

  test('multiple destroy calls do not throw', async () => {
    const result = await page.evaluate(() => {
      const sdk = window.createMockSDK();
      const kava = new KalturaAvatarAnalytics(sdk, { ks: 'ks1', partnerId: 1 });
      kava.destroy();
      kava.destroy();
      kava.destroy();
      return 'ok';
    });
    expect(result).toBe('ok');
  });

  test('destroyed plugin methods do not fire events', async () => {
    const result = await page.evaluate(() => {
      const sdk = window.createMockSDK();
      const kava = new KalturaAvatarAnalytics(sdk, { ks: 'ks1', partnerId: 1 });
      kava.destroy();
      window._fetchCalls = [];
      kava.pageView('nope');
      kava.buttonClick('nope');
      kava.sendFeedback('x', 'like');
      kava.customEvent(99, {});
      return new Promise(resolve => setTimeout(() => {
        resolve(window._fetchCalls.length);
      }, 50));
    });
    expect(result).toBe(0);
  });

  test('VERSION is exposed as static property', async () => {
    const result = await page.evaluate(() => KalturaAvatarAnalytics.VERSION);
    expect(result).toBe('1.0.0');
  });

  test('static enums are frozen', async () => {
    const result = await page.evaluate(() => {
      return Object.isFrozen(KalturaAvatarAnalytics.EventType) &&
             Object.isFrozen(KalturaAvatarAnalytics.ExperienceType) &&
             Object.isFrozen(KalturaAvatarAnalytics.ReactionType);
    });
    expect(result).toBe(true);
  });
});
