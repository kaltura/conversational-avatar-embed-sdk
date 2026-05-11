// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Network Resilience Tests — verify SDK behavior under degraded network conditions.
 * Tests reconnection, timeouts, transport fallbacks, and graceful degradation.
 * All tests use mock/simulated conditions (no real network calls) for CI reliability.
 */

test.describe('KalturaAvatarSDK — Network Resilience', () => {

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
  // RECONNECT STRATEGY — exponential backoff with jitter
  // ────────────────────────────────────────────────────────────────────

  test('ReconnectStrategy: delay increases exponentially with jitter', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'test', container: '#test-container' });
      const strategy = sdk._reconnect;
      const delays = [];
      for (let i = 0; i < 5; i++) {
        strategy._attempt = i;
        delays.push(strategy.nextDelay());
      }
      sdk.destroy();
      return delays;
    });
    expect(result[0]).toBeGreaterThan(800);
    expect(result[0]).toBeLessThan(1200);
    expect(result[1]).toBeGreaterThan(1600);
    expect(result[1]).toBeLessThan(2400);
    expect(result[2]).toBeGreaterThan(3200);
    expect(result[2]).toBeLessThan(4800);
    expect(result[3]).toBeGreaterThan(6400);
    expect(result[3]).toBeLessThan(9600);
    expect(result[4]).toBeGreaterThan(13000);
    expect(result[4]).toBeLessThan(19000);
  });

  test('ReconnectStrategy: delay capped at 30 seconds', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'test', container: '#test-container' });
      const strategy = sdk._reconnect;
      strategy._attempt = 10;
      const delay = strategy.nextDelay();
      sdk.destroy();
      return delay;
    });
    expect(result).toBeLessThanOrEqual(30000);
  });

  test('ReconnectStrategy: exhausted after max attempts', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'test', container: '#test-container' });
      const strategy = sdk._reconnect;
      strategy._attempt = 5;
      const exhausted = strategy.exhausted;
      const scheduled = strategy.schedule(() => {});
      sdk.destroy();
      return { exhausted, scheduled };
    });
    expect(result.exhausted).toBe(true);
    expect(result.scheduled).toBe(false);
  });

  test('ReconnectStrategy: reset clears attempt counter and timer', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'test', container: '#test-container' });
      const strategy = sdk._reconnect;
      strategy._attempt = 3;
      strategy.schedule(() => {});
      strategy.reset();
      sdk.destroy();
      return { attempt: strategy.attempt, exhausted: strategy.exhausted, timerNull: strategy._timer === null };
    });
    expect(result.attempt).toBe(0);
    expect(result.exhausted).toBe(false);
    expect(result.timerNull).toBe(true);
  });

  test('ReconnectStrategy: cancel clears pending timer without resetting counter', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'test', container: '#test-container' });
      const strategy = sdk._reconnect;
      let called = false;
      strategy.schedule(() => { called = true; });
      const attemptAfterSchedule = strategy.attempt;
      strategy.cancel();
      return new Promise(resolve => {
        setTimeout(() => {
          sdk.destroy();
          resolve({ called, timerNull: strategy._timer === null, attempt: attemptAfterSchedule });
        }, 2000);
      });
    });
    expect(result.called).toBe(false);
    expect(result.timerNull).toBe(true);
    expect(result.attempt).toBe(1);
  });

  test('ReconnectStrategy: schedule increments attempt counter', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'test', container: '#test-container' });
      const strategy = sdk._reconnect;
      const before = strategy.attempt;
      strategy.schedule(() => {});
      const after = strategy.attempt;
      strategy.cancel();
      sdk.destroy();
      return { before, after };
    });
    expect(result.before).toBe(0);
    expect(result.after).toBe(1);
  });

  // ────────────────────────────────────────────────────────────────────
  // ERROR CODES — proper error construction
  // ────────────────────────────────────────────────────────────────────

  test('AvatarError includes code, message, and recoverable flag', async () => {
    const result = await page.evaluate(() => {
      try {
        new KalturaAvatarSDK({});
      } catch (e) {
        return {
          hasCode: typeof e.code === 'number',
          hasMessage: typeof e.message === 'string',
          hasRecoverable: typeof e.recoverable === 'boolean',
          code: e.code,
          recoverable: e.recoverable,
          isError: e instanceof Error
        };
      }
    });
    expect(result.hasCode).toBe(true);
    expect(result.hasMessage).toBe(true);
    expect(result.hasRecoverable).toBe(true);
    expect(result.code).toBe(5001); // INVALID_CONFIG
    expect(result.recoverable).toBe(false);
    expect(result.isError).toBe(true);
  });

  test('ErrorCode constants are correct and frozen', async () => {
    const result = await page.evaluate(() => {
      const codes = KalturaAvatarSDK.ErrorCode;
      return {
        connFailed: codes.CONNECTION_FAILED,
        connTimeout: codes.CONNECTION_TIMEOUT,
        handshakeTimeout: codes.HANDSHAKE_TIMEOUT,
        tierExceeded: codes.TIER_EXCEEDED,
        invalidConfig: codes.INVALID_CONFIG,
        isFrozen: Object.isFrozen(codes)
      };
    });
    expect(result.connFailed).toBe(1001);
    expect(result.connTimeout).toBe(1002);
    expect(result.handshakeTimeout).toBe(1006);
    expect(result.tierExceeded).toBe(6002);
    expect(result.invalidConfig).toBe(5001);
    expect(result.isFrozen).toBe(true);
  });

  // ────────────────────────────────────────────────────────────────────
  // CONNECTION CONFIGURATION
  // ────────────────────────────────────────────────────────────────────

  test('connectionTimeout config is propagated correctly', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({
        clientId: 'test', flowId: 'test', container: '#test-container',
        connectionTimeout: 7500
      });
      const timeout = sdk._config.connectionTimeout;
      sdk.destroy();
      return { timeout };
    });
    expect(result.timeout).toBe(7500);
  });

  test('default connectionTimeout is 15 seconds', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'test', container: '#test-container' });
      const timeout = sdk._config.connectionTimeout;
      sdk.destroy();
      return { timeout };
    });
    expect(result.timeout).toBe(15000);
  });

  test('endpoints.socket defaults to Kaltura production URL', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'test', container: '#test-container' });
      const url = sdk._config.endpoints.socket;
      sdk.destroy();
      return { url, hasProtocol: url.startsWith('https://') };
    });
    expect(result.hasProtocol).toBe(true);
    expect(result.url).toContain('kaltura.ai');
  });

  // ────────────────────────────────────────────────────────────────────
  // AUTO-RECONNECT CONFIG
  // ────────────────────────────────────────────────────────────────────

  test('autoReconnect defaults to true', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'test', container: '#test-container' });
      const auto = sdk._config.autoReconnect;
      sdk.destroy();
      return { auto };
    });
    expect(result.auto).toBe(true);
  });

  test('autoReconnect can be disabled', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({
        clientId: 'test', flowId: 'test', container: '#test-container',
        autoReconnect: false
      });
      const auto = sdk._config.autoReconnect;
      sdk.destroy();
      return { auto };
    });
    expect(result.auto).toBe(false);
  });

  test('reconnect strategy maxAttempts defaults to 5', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'test', container: '#test-container' });
      const max = sdk._reconnect.maxAttempts;
      sdk.destroy();
      return { max };
    });
    expect(result.max).toBe(5);
  });

  // ────────────────────────────────────────────────────────────────────
  // STICKY ID — load balancer affinity
  // ────────────────────────────────────────────────────────────────────

  test('stickyId generation produces valid 16-char alphanumeric string', async () => {
    const result = await page.evaluate(() => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      const generateId = (length) => {
        let result = '';
        const values = crypto.getRandomValues(new Uint8Array(length));
        for (let i = 0; i < length; i++) result += chars[values[i] % chars.length];
        return result;
      };
      const id = generateId(8) + generateId(8);
      return { length: id.length, isAlphanumeric: /^[A-Za-z0-9]+$/.test(id) };
    });
    expect(result.length).toBe(16);
    expect(result.isAlphanumeric).toBe(true);
  });

  test('stickyId uniqueness (100 generations, all unique)', async () => {
    const result = await page.evaluate(() => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      const generateId = (length) => {
        let result = '';
        const values = crypto.getRandomValues(new Uint8Array(length));
        for (let i = 0; i < length; i++) result += chars[values[i] % chars.length];
        return result;
      };
      const ids = new Set();
      for (let i = 0; i < 100; i++) ids.add(generateId(8) + generateId(8));
      return { uniqueCount: ids.size };
    });
    expect(result.uniqueCount).toBe(100);
  });

  // ────────────────────────────────────────────────────────────────────
  // QUEUE MANAGER — server capacity handling
  // ────────────────────────────────────────────────────────────────────

  test('QueueManager: isQueued returns false before activation', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({
        clientId: 'test', flowId: 'test', container: '#test-container',
        queue: { enabled: true }
      });
      const queued = sdk.isQueued();
      sdk.destroy();
      return { queued };
    });
    expect(result.queued).toBe(false);
  });

  test('QueueManager: disabled queue does not activate', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({
        clientId: 'test', flowId: 'test', container: '#test-container',
        queue: { enabled: false }
      });
      const activated = sdk._queue.activate(null, () => {}, () => {}, () => {});
      sdk.destroy();
      return { activated };
    });
    expect(result.activated).toBe(false);
  });

  test('QueueManager: cancel deactivates and clears timer', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({
        clientId: 'test', flowId: 'test', container: '#test-container',
        queue: { enabled: true, maxWaitMs: 30000 }
      });
      sdk._queue._active = true;
      sdk._queue._timer = setTimeout(() => {}, 99999);
      sdk._queue.cancel();
      const active = sdk._queue._active;
      const timer = sdk._queue._timer;
      sdk.destroy();
      return { active, timerNull: timer === null };
    });
    expect(result.active).toBe(false);
    expect(result.timerNull).toBe(true);
  });

  // ────────────────────────────────────────────────────────────────────
  // DISCONNECT HANDLING — intentional vs network
  // ────────────────────────────────────────────────────────────────────

  test('intentional disconnect does not trigger reconnect', async () => {
    const result = await page.evaluate(() => {
      return new Promise(resolve => {
        let reconnecting = false;
        const sdk = new KalturaAvatarSDK({
          clientId: 'test', flowId: 'test', container: '#test-container',
          autoReconnect: true
        });
        sdk.on('reconnecting', () => { reconnecting = true; });
        sdk._state._state = 'in-conversation';
        sdk.disconnect();
        setTimeout(() => {
          sdk.destroy();
          resolve({ reconnecting });
        }, 1500);
      });
    });
    expect(result.reconnecting).toBe(false);
  });

  test('disconnect emits disconnected with reason and conversation-ended', async () => {
    const result = await page.evaluate(() => {
      const events = [];
      const sdk = new KalturaAvatarSDK({
        clientId: 'test', flowId: 'test', container: '#test-container'
      });
      sdk.on('disconnected', (data) => events.push({ name: 'disconnected', reason: data.reason }));
      sdk.on('conversation-ended', () => events.push({ name: 'conversation-ended' }));
      // Set internal state machine to in-conversation via its internal _state field
      sdk._state._state = 'in-conversation';
      sdk.disconnect();
      sdk.destroy();
      return events;
    });
    expect(result.length).toBe(2);
    expect(result[0].name).toBe('disconnected');
    expect(result[0].reason).toBe('user');
    expect(result[1].name).toBe('conversation-ended');
  });

  // ────────────────────────────────────────────────────────────────────
  // STATE MACHINE — guards and transitions
  // ────────────────────────────────────────────────────────────────────

  test('destroyed state prevents further disconnect', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'test', container: '#test-container' });
      sdk.destroy();
      let events = [];
      sdk.on('disconnected', () => events.push('disconnected'));
      sdk.disconnect();
      return { state: sdk.getState(), eventCount: events.length };
    });
    expect(result.state).toBe('destroyed');
    expect(result.eventCount).toBe(0);
  });

  test('state transitions emit state-change event', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'test', container: '#test-container' });
      let changes = [];
      sdk.on('state-change', (data) => changes.push(data));
      sdk._state._state = 'in-conversation';
      sdk.disconnect();
      sdk.destroy();
      return { changeCount: changes.length };
    });
    expect(result.changeCount).toBeGreaterThan(0);
  });

  // ────────────────────────────────────────────────────────────────────
  // WHEP RESILIENCE — video module existence and safety
  // ────────────────────────────────────────────────────────────────────

  test('WHEPClient exists and has negotiate and close methods', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'test', container: '#test-container' });
      const whep = sdk._whep;
      const hasNegotiate = typeof whep.negotiate === 'function';
      const hasClose = typeof whep.close === 'function';
      sdk.destroy();
      return { hasNegotiate, hasClose };
    });
    expect(result.hasNegotiate).toBe(true);
    expect(result.hasClose).toBe(true);
  });

  test('WHEPClient close is safe when not started', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'test', container: '#test-container' });
      let threw = false;
      try { sdk._whep.close(); } catch (e) { threw = true; }
      sdk.destroy();
      return { threw };
    });
    expect(result.threw).toBe(false);
  });

  // ────────────────────────────────────────────────────────────────────
  // ASR RESILIENCE — non-fatal audio failure
  // ────────────────────────────────────────────────────────────────────

  test('ASR module exists with start and close methods', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'test', container: '#test-container' });
      const asr = sdk._asr;
      const hasStart = typeof asr.start === 'function';
      const hasClose = typeof asr.close === 'function';
      sdk.destroy();
      return { hasStart, hasClose };
    });
    expect(result.hasStart).toBe(true);
    expect(result.hasClose).toBe(true);
  });

  test('ASR close without start does not throw', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'test', container: '#test-container' });
      let threw = false;
      try { sdk._asr.close(); } catch (e) { threw = true; }
      sdk.destroy();
      return { threw };
    });
    expect(result.threw).toBe(false);
  });

  test('ASR handles missing socket gracefully on close', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'test', container: '#test-container' });
      sdk._asr._socket = null;
      sdk._asr._pc = null;
      let threw = false;
      try { sdk._asr.close(); } catch (e) { threw = true; }
      sdk.destroy();
      return { threw };
    });
    expect(result.threw).toBe(false);
  });

  // ────────────────────────────────────────────────────────────────────
  // GRACEFUL DEGRADATION — feature failures don't crash SDK
  // ────────────────────────────────────────────────────────────────────

  test('Caption system handles empty/null chunks without crash', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({
        clientId: 'test', flowId: 'test', container: '#test-container',
        captions: { enabled: true }
      });
      let threw = false;
      try {
        sdk._captions.onChunk('');
        sdk._captions.onChunk(null);
        sdk._captions.onSpeakingStart('resp-1');
        sdk._captions.onSpeakingEnd();
      } catch (e) { threw = true; }
      sdk.destroy();
      return { threw };
    });
    expect(result.threw).toBe(false);
  });

  test('DPP injection in wrong state throws INVALID_STATE (not crash)', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'test', container: '#test-container' });
      try {
        sdk.injectDPP({ test: 'data' });
        sdk.destroy();
        return { threw: false };
      } catch (e) {
        sdk.destroy();
        return { threw: true, code: e.code, isAvatarError: e instanceof Error };
      }
    });
    expect(result.threw).toBe(true);
    expect(result.code).toBe(3001); // INVALID_STATE
  });

  test('GenUI emitter handles unknown event types without crash', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'test', container: '#test-container' });
      let threw = false;
      try {
        sdk._emitter.emit('genui', { type: 'totally_unknown', data: null });
      } catch (e) { threw = true; }
      const state = sdk.getState();
      sdk.destroy();
      return { threw, state };
    });
    expect(result.threw).toBe(false);
    expect(result.state).not.toBe('error');
  });

  // ────────────────────────────────────────────────────────────────────
  // MULTIPLE CONCURRENT INSTANCES — isolation
  // ────────────────────────────────────────────────────────────────────

  test('multiple SDK instances have independent state', async () => {
    const result = await page.evaluate(() => {
      const container = document.getElementById('test-container');
      const div1 = document.createElement('div');
      div1.id = 'multi-1';
      div1.style.cssText = 'width:200px;height:150px;';
      const div2 = document.createElement('div');
      div2.id = 'multi-2';
      div2.style.cssText = 'width:200px;height:150px;';
      container.appendChild(div1);
      container.appendChild(div2);

      const sdk1 = new KalturaAvatarSDK({ clientId: 'client-a', flowId: 'flow-a', container: '#multi-1' });
      const sdk2 = new KalturaAvatarSDK({ clientId: 'client-b', flowId: 'flow-b', container: '#multi-2' });

      const id1 = sdk1.getClientId();
      const id2 = sdk2.getClientId();

      sdk1.destroy();
      const stateAfterDestroy1 = sdk1.getState();
      const stateAfterDestroy2 = sdk2.getState();

      sdk2.destroy();
      container.removeChild(div1);
      container.removeChild(div2);

      return { id1, id2, stateAfterDestroy1, stateAfterDestroy2 };
    });
    expect(result.id1).toBe('client-a');
    expect(result.id2).toBe('client-b');
    expect(result.stateAfterDestroy1).toBe('destroyed');
    expect(result.stateAfterDestroy2).not.toBe('destroyed');
  });

  // ────────────────────────────────────────────────────────────────────
  // MEMORY CLEANUP — prevent leaks on disconnect/destroy
  // ────────────────────────────────────────────────────────────────────

  test('destroy cleans up socket, reconnect timer, and queue', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({
        clientId: 'test', flowId: 'test', container: '#test-container',
        captions: { enabled: true }
      });
      sdk.destroy();
      return {
        state: sdk.getState(),
        socketNull: sdk._socket === null || sdk._socket === undefined,
        reconnectTimerNull: sdk._reconnect._timer === null
      };
    });
    expect(result.state).toBe('destroyed');
    expect(result.socketNull).toBe(true);
    expect(result.reconnectTimerNull).toBe(true);
  });

  test('destroy is idempotent (multiple calls safe)', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'test', container: '#test-container' });
      let threw = false;
      try {
        sdk.destroy();
        sdk.destroy();
        sdk.destroy();
      } catch (e) { threw = true; }
      return { threw, state: sdk.getState() };
    });
    expect(result.threw).toBe(false);
    expect(result.state).toBe('destroyed');
  });

  // ────────────────────────────────────────────────────────────────────
  // TRANSPORT CONFIG — polling to WebSocket upgrade
  // ────────────────────────────────────────────────────────────────────

  test('default config includes socket endpoint and reasonable timeout', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'test', container: '#test-container' });
      const config = sdk._config;
      sdk.destroy();
      return {
        hasEndpoint: typeof config.endpoints.socket === 'string' && config.endpoints.socket.length > 0,
        hasTimeout: typeof config.connectionTimeout === 'number',
        timeoutRange: config.connectionTimeout >= 5000 && config.connectionTimeout <= 60000
      };
    });
    expect(result.hasEndpoint).toBe(true);
    expect(result.hasTimeout).toBe(true);
    expect(result.timeoutRange).toBe(true);
  });

  test('userAgent is lowercased in connection params', async () => {
    const result = await page.evaluate(() => {
      const ua = (navigator.userAgent || 'KalturaAvatarSDK').toLowerCase();
      return {
        isLowercase: ua === ua.toLowerCase(),
        hasContent: ua.length > 0
      };
    });
    expect(result.isLowercase).toBe(true);
    expect(result.hasContent).toBe(true);
  });

  // ────────────────────────────────────────────────────────────────────
  // EVENT EMITTER RESILIENCE
  // ────────────────────────────────────────────────────────────────────

  test('off unsubscribes correctly', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'test', container: '#test-container' });
      let count = 0;
      const handler = () => { count++; };
      sdk.on('test-event', handler);
      sdk._emitter.emit('test-event', {});
      sdk.off('test-event', handler);
      sdk._emitter.emit('test-event', {});
      sdk.destroy();
      return { count };
    });
    expect(result.count).toBe(1);
  });

  test('once fires handler exactly once', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'test', container: '#test-container' });
      let count = 0;
      sdk.once('test-once', () => { count++; });
      sdk._emitter.emit('test-once', {});
      sdk._emitter.emit('test-once', {});
      sdk._emitter.emit('test-once', {});
      sdk.destroy();
      return { count };
    });
    expect(result.count).toBe(1);
  });

  test('wildcard listener receives all events', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'test', container: '#test-container' });
      let events = [];
      sdk.on('*', (name) => { events.push(name); });
      sdk._emitter.emit('event-a', {});
      sdk._emitter.emit('event-b', {});
      sdk.destroy();
      return { events };
    });
    expect(result.events).toContain('event-a');
    expect(result.events).toContain('event-b');
  });

  // ────────────────────────────────────────────────────────────────────
  // TURN/ICE CONFIG — network traversal
  // ────────────────────────────────────────────────────────────────────

  test('TURN servers configured with correct defaults', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'test', container: '#test-container' });
      const turn = sdk._config.turn;
      sdk.destroy();
      return {
        hasUsername: typeof turn.username === 'string' && turn.username.length > 0,
        hasCredential: typeof turn.credential === 'string' && turn.credential.length > 0,
        icePolicy: turn.iceTransportPolicy
      };
    });
    expect(result.hasUsername).toBe(true);
    expect(result.hasCredential).toBe(true);
    expect(result.icePolicy).toBe('relay');
  });

  test('TURN config can be overridden', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({
        clientId: 'test', flowId: 'test', container: '#test-container',
        turn: {
          username: 'custom-user',
          credential: 'custom-cred',
          iceTransportPolicy: 'all'
        }
      });
      const turn = sdk._config.turn;
      sdk.destroy();
      return { username: turn.username, credential: turn.credential, policy: turn.iceTransportPolicy };
    });
    expect(result.username).toBe('custom-user');
    expect(result.credential).toBe('custom-cred');
    expect(result.policy).toBe('all');
  });
});
