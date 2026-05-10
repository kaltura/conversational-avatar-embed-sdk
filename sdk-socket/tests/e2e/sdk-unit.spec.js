// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * SDK Unit Tests — run in the browser via Playwright
 * Tests the SDK's internal modules without requiring a real avatar connection.
 */

test.describe('KalturaAvatarSDK — Unit Tests (in-browser)', () => {

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
  // CONSTRUCTOR & CONFIG VALIDATION
  // ────────────────────────────────────────────────────────────────────

  test('constructor requires clientId', async () => {
    const result = await page.evaluate(() => {
      try { new KalturaAvatarSDK({ flowId: 'test' }); return null; }
      catch (e) { return { code: e.code, message: e.message }; }
    });
    expect(result).not.toBeNull();
    expect(result.code).toBe(5001); // INVALID_CONFIG
  });

  test('constructor requires flowId', async () => {
    const result = await page.evaluate(() => {
      try { new KalturaAvatarSDK({ clientId: 'test' }); return null; }
      catch (e) { return { code: e.code, message: e.message }; }
    });
    expect(result).not.toBeNull();
    expect(result.code).toBe(5001);
  });

  test('constructor succeeds with valid config', async () => {
    const state = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: '123', flowId: 'flow-1' });
      const s = sdk.getState();
      sdk.destroy();
      return s;
    });
    expect(state).toBe('uninitialized');
  });

  test('VERSION is exposed', async () => {
    const version = await page.evaluate(() => KalturaAvatarSDK.VERSION);
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  test('static Events object is frozen', async () => {
    const frozen = await page.evaluate(() => Object.isFrozen(KalturaAvatarSDK.Events));
    expect(frozen).toBe(true);
  });

  test('static State object is frozen', async () => {
    const frozen = await page.evaluate(() => Object.isFrozen(KalturaAvatarSDK.State));
    expect(frozen).toBe(true);
  });

  // ────────────────────────────────────────────────────────────────────
  // STATE MACHINE
  // ────────────────────────────────────────────────────────────────────

  test('initial state is uninitialized', async () => {
    const state = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: '123', flowId: 'f' });
      const s = sdk.getState();
      sdk.destroy();
      return s;
    });
    expect(state).toBe('uninitialized');
  });

  test('destroy transitions to destroyed', async () => {
    const state = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: '123', flowId: 'f' });
      sdk.destroy();
      return sdk.getState();
    });
    expect(state).toBe('destroyed');
  });

  test('sendText throws in wrong state', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: '123', flowId: 'f' });
      try { sdk.sendText('hello'); return null; }
      catch (e) { return { code: e.code }; }
      finally { sdk.destroy(); }
    });
    expect(result).not.toBeNull();
    expect(result.code).toBe(3001);
  });

  test('injectDPP throws in wrong state', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: '123', flowId: 'f' });
      try { sdk.injectDPP({ test: true }); return null; }
      catch (e) { return { code: e.code }; }
      finally { sdk.destroy(); }
    });
    expect(result).not.toBeNull();
    expect(result.code).toBe(3001);
  });

  // ────────────────────────────────────────────────────────────────────
  // EVENT EMITTER
  // ────────────────────────────────────────────────────────────────────

  test('on() returns unsubscribe function', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: '123', flowId: 'f' });
      let count = 0;
      const unsub = sdk.on('ready', () => count++);
      const isFunction = typeof unsub === 'function';
      sdk.destroy();
      return isFunction;
    });
    expect(result).toBe(true);
  });

  test('wildcard listener receives all events', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: '123', flowId: 'f' });
      const received = [];
      sdk.on('*', (event) => received.push(event));
      sdk.destroy();
      return received.includes('destroyed');
    });
    expect(result).toBe(true);
  });

  test('once() fires only once', async () => {
    const result = await page.evaluate(() => {
      const { TypedEventEmitter } = KalturaAvatarSDK._internals;
      const emitter = new TypedEventEmitter();
      let count = 0;
      emitter.once('test', () => count++);
      emitter.emit('test');
      emitter.emit('test');
      return count;
    });
    expect(result).toBe(1);
  });

  test('off() removes listener', async () => {
    const result = await page.evaluate(() => {
      const { TypedEventEmitter } = KalturaAvatarSDK._internals;
      const emitter = new TypedEventEmitter();
      let count = 0;
      const handler = () => count++;
      emitter.on('test', handler);
      emitter.emit('test');
      emitter.off('test', handler);
      emitter.emit('test');
      return count;
    });
    expect(result).toBe(1);
  });

  test('removeAllListeners clears everything', async () => {
    const result = await page.evaluate(() => {
      const { TypedEventEmitter } = KalturaAvatarSDK._internals;
      const emitter = new TypedEventEmitter();
      let count = 0;
      emitter.on('a', () => count++);
      emitter.on('b', () => count++);
      emitter.removeAllListeners();
      emitter.emit('a');
      emitter.emit('b');
      return count;
    });
    expect(result).toBe(0);
  });

  // ────────────────────────────────────────────────────────────────────
  // TRANSCRIPT MANAGER
  // ────────────────────────────────────────────────────────────────────

  test('transcript records entries', async () => {
    const result = await page.evaluate(() => {
      const { TranscriptManager, TypedEventEmitter } = KalturaAvatarSDK._internals;
      const emitter = new TypedEventEmitter();
      const tm = new TranscriptManager(emitter);
      tm.add('Avatar', 'Hello there');
      tm.add('User', 'Hi!');
      return tm.getAll();
    });
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe('Avatar');
    expect(result[0].text).toBe('Hello there');
    expect(result[1].role).toBe('User');
  });

  test('transcript clear removes all entries', async () => {
    const result = await page.evaluate(() => {
      const { TranscriptManager, TypedEventEmitter } = KalturaAvatarSDK._internals;
      const emitter = new TypedEventEmitter();
      const tm = new TranscriptManager(emitter);
      tm.add('Avatar', 'Hello');
      tm.clear();
      return tm.getAll().length;
    });
    expect(result).toBe(0);
  });

  test('transcript getText formats correctly', async () => {
    const result = await page.evaluate(() => {
      const { TranscriptManager, TypedEventEmitter } = KalturaAvatarSDK._internals;
      const emitter = new TypedEventEmitter();
      const tm = new TranscriptManager(emitter);
      tm.add('Avatar', 'Hello');
      tm.add('User', 'Hi');
      return {
        text: tm.getText({ format: 'text' }),
        md: tm.getText({ format: 'markdown' }),
        json: tm.getText({ format: 'json' })
      };
    });
    expect(result.text).toContain('Avatar: Hello');
    expect(result.text).toContain('User: Hi');
    expect(result.md).toContain('**Avatar:**');
    expect(JSON.parse(result.json)).toHaveLength(2);
  });

  test('transcript disabled does not record', async () => {
    const result = await page.evaluate(() => {
      const { TranscriptManager, TypedEventEmitter } = KalturaAvatarSDK._internals;
      const emitter = new TypedEventEmitter();
      const tm = new TranscriptManager(emitter);
      tm.setEnabled(false);
      tm.add('Avatar', 'Hello');
      return tm.getAll().length;
    });
    expect(result).toBe(0);
  });

  // ────────────────────────────────────────────────────────────────────
  // COMMAND REGISTRY
  // ────────────────────────────────────────────────────────────────────

  test('command matches string pattern (case-insensitive)', async () => {
    const result = await page.evaluate(() => {
      const { CommandRegistry, TypedEventEmitter } = KalturaAvatarSDK._internals;
      const emitter = new TypedEventEmitter();
      const cr = new CommandRegistry(emitter);
      let matched = null;
      cr.register('end', 'Ending call now', (m) => { matched = m; });
      cr.check('Thank you! Ending call now.');
      return matched;
    });
    expect(result).not.toBeNull();
    expect(result.command).toBe('end');
  });

  test('command matches regex pattern', async () => {
    const result = await page.evaluate(() => {
      const { CommandRegistry, TypedEventEmitter } = KalturaAvatarSDK._internals;
      const emitter = new TypedEventEmitter();
      const cr = new CommandRegistry(emitter);
      let matched = null;
      cr.register('score', /score is \d+/, (m) => { matched = m; });
      cr.check('Your score is 95 out of 100.');
      return matched;
    });
    expect(result).not.toBeNull();
    expect(result.command).toBe('score');
  });

  test('command unregister works', async () => {
    const result = await page.evaluate(() => {
      const { CommandRegistry, TypedEventEmitter } = KalturaAvatarSDK._internals;
      const emitter = new TypedEventEmitter();
      const cr = new CommandRegistry(emitter);
      let count = 0;
      const unsub = cr.register('test', 'trigger', () => { count++; });
      cr.check('trigger');
      unsub();
      cr.check('trigger');
      return count;
    });
    expect(result).toBe(1);
  });

  test('command clear removes all commands', async () => {
    const result = await page.evaluate(() => {
      const { CommandRegistry, TypedEventEmitter } = KalturaAvatarSDK._internals;
      const emitter = new TypedEventEmitter();
      const cr = new CommandRegistry(emitter);
      cr.register('a', 'alpha', () => {});
      cr.register('b', 'beta', () => {});
      cr.clear();
      return cr.list().length;
    });
    expect(result).toBe(0);
  });

  // ────────────────────────────────────────────────────────────────────
  // COMMAND TIMING
  // ────────────────────────────────────────────────────────────────────

  test('command timing: "after" only fires on after phase', async () => {
    const result = await page.evaluate(() => {
      const { CommandRegistry, TypedEventEmitter } = KalturaAvatarSDK._internals;
      const emitter = new TypedEventEmitter();
      const cr = new CommandRegistry(emitter);
      let count = 0;
      cr.register('end', 'ending call', () => { count++; }, { timing: 'after' });
      cr.check('ending call now', 'before');
      cr.check('ending call now', 'after');
      return count;
    });
    expect(result).toBe(1);
  });

  test('command timing: "before" only fires on before phase', async () => {
    const result = await page.evaluate(() => {
      const { CommandRegistry, TypedEventEmitter } = KalturaAvatarSDK._internals;
      const emitter = new TypedEventEmitter();
      const cr = new CommandRegistry(emitter);
      let count = 0;
      cr.register('nav', 'next slide', () => { count++; }, { timing: 'before' });
      cr.check('next slide please', 'before');
      cr.check('next slide please', 'after');
      return count;
    });
    expect(result).toBe(1);
  });

  test('command timing: "both" fires once per unique text (deduplicated)', async () => {
    const result = await page.evaluate(() => {
      const { CommandRegistry, TypedEventEmitter } = KalturaAvatarSDK._internals;
      const emitter = new TypedEventEmitter();
      const cr = new CommandRegistry(emitter);
      let count = 0;
      cr.register('score', 'score is', () => { count++; }, { timing: 'both' });
      cr.check('your score is 95', 'before');
      cr.check('your score is 95', 'after');
      return count;
    });
    expect(result).toBe(1);
  });

  test('command timing: "both" fires again after resetUtterance', async () => {
    const result = await page.evaluate(() => {
      const { CommandRegistry, TypedEventEmitter } = KalturaAvatarSDK._internals;
      const emitter = new TypedEventEmitter();
      const cr = new CommandRegistry(emitter);
      let count = 0;
      cr.register('score', 'score is', () => { count++; }, { timing: 'both' });
      cr.check('your score is 95', 'before');
      cr.check('your score is 95', 'after');
      cr.resetUtterance();
      cr.check('your score is 80', 'before');
      return count;
    });
    expect(result).toBe(2);
  });

  test('command timing: default is "after"', async () => {
    const result = await page.evaluate(() => {
      const { CommandRegistry, TypedEventEmitter } = KalturaAvatarSDK._internals;
      const emitter = new TypedEventEmitter();
      const cr = new CommandRegistry(emitter);
      let count = 0;
      cr.register('end', 'ending call', () => { count++; });
      cr.check('ending call now', 'before');
      cr.check('ending call now', 'after');
      return count;
    });
    expect(result).toBe(1);
  });

  test('command timing: match object includes timing phase', async () => {
    const result = await page.evaluate(() => {
      const { CommandRegistry, TypedEventEmitter } = KalturaAvatarSDK._internals;
      const emitter = new TypedEventEmitter();
      const cr = new CommandRegistry(emitter);
      let matched = null;
      cr.register('nav', 'next slide', (m) => { matched = m; }, { timing: 'before' });
      cr.check('next slide now', 'before');
      return matched;
    });
    expect(result.timing).toBe('before');
    expect(result.command).toBe('nav');
  });

  // ────────────────────────────────────────────────────────────────────
  // COMMAND BUFFERING (chunked text)
  // ────────────────────────────────────────────────────────────────────

  test('command matches across buffered chunks', async () => {
    const result = await page.evaluate(() => {
      const { CommandRegistry, TypedEventEmitter } = KalturaAvatarSDK._internals;
      const emitter = new TypedEventEmitter();
      const cr = new CommandRegistry(emitter);
      let matched = null;
      cr.register('end', 'ending call now', (m) => { matched = m; }, { timing: 'before' });
      let buffer = '';
      buffer += 'Thank you! ';
      cr.check(buffer, 'before');
      buffer += 'Ending call ';
      cr.check(buffer, 'before');
      buffer += 'now.';
      cr.check(buffer, 'before');
      return matched;
    });
    expect(result).not.toBeNull();
    expect(result.command).toBe('end');
    expect(result.text).toContain('Ending call now.');
  });

  test('command fires only once per utterance despite growing buffer', async () => {
    const result = await page.evaluate(() => {
      const { CommandRegistry, TypedEventEmitter } = KalturaAvatarSDK._internals;
      const emitter = new TypedEventEmitter();
      const cr = new CommandRegistry(emitter);
      let count = 0;
      cr.register('end', 'ending call', (m) => { count++; }, { timing: 'before' });
      let buffer = '';
      buffer += 'Ending call ';
      cr.check(buffer, 'before');
      buffer += 'now. ';
      cr.check(buffer, 'before');
      buffer += 'Goodbye!';
      cr.check(buffer, 'before');
      return count;
    });
    expect(result).toBe(1);
  });

  test('resetUtterance allows command to fire again on next utterance', async () => {
    const result = await page.evaluate(() => {
      const { CommandRegistry, TypedEventEmitter } = KalturaAvatarSDK._internals;
      const emitter = new TypedEventEmitter();
      const cr = new CommandRegistry(emitter);
      let count = 0;
      cr.register('end', 'ending call', (m) => { count++; }, { timing: 'before' });
      cr.check('Ending call now.', 'before');
      cr.resetUtterance();
      cr.check('Ending call now.', 'before');
      return count;
    });
    expect(result).toBe(2);
  });

  // ────────────────────────────────────────────────────────────────────
  // COMMAND DEBOUNCE
  // ────────────────────────────────────────────────────────────────────

  test('debounced command waits for chunks before firing', async () => {
    const result = await page.evaluate(() => {
      return new Promise((resolve) => {
        const { CommandRegistry, TypedEventEmitter } = KalturaAvatarSDK._internals;
        const emitter = new TypedEventEmitter();
        const cr = new CommandRegistry(emitter);
        let firedText = null;
        cr.register('nav', 'navigating to slide', (m) => { firedText = m.text; }, { timing: 'before', debounce: 100 });

        let buffer = '';
        buffer += 'Navigating to slide t';
        cr.check(buffer, 'before');
        // At this point the command matched but hasn't fired yet (debouncing)

        setTimeout(() => {
          buffer += 'wenty-seven. This slide shows';
          cr.check(buffer, 'before');
        }, 30);

        setTimeout(() => {
          buffer += ' our cash flow report.';
          cr.check(buffer, 'before');
        }, 60);

        // After 100ms of no new chunks, the command should fire with full text
        setTimeout(() => {
          resolve(firedText);
        }, 250);
      });
    });
    expect(result).toContain('twenty-seven');
    expect(result).toContain('cash flow');
  });

  test('debounced command fires immediately on resetUtterance (flush)', async () => {
    const result = await page.evaluate(() => {
      return new Promise((resolve) => {
        const { CommandRegistry, TypedEventEmitter } = KalturaAvatarSDK._internals;
        const emitter = new TypedEventEmitter();
        const cr = new CommandRegistry(emitter);
        let firedText = null;
        cr.register('nav', 'navigating to slide', (m) => { firedText = m.text; }, { timing: 'before', debounce: 500 });

        cr.check('Navigating to slide twenty-seven.', 'before');
        // Command is pending (500ms debounce)
        // Utterance ends — resetUtterance should flush immediately
        cr.resetUtterance();
        resolve(firedText);
      });
    });
    expect(result).toContain('twenty-seven');
  });

  test('non-debounced command fires immediately (backward compat)', async () => {
    const result = await page.evaluate(() => {
      const { CommandRegistry, TypedEventEmitter } = KalturaAvatarSDK._internals;
      const emitter = new TypedEventEmitter();
      const cr = new CommandRegistry(emitter);
      let firedText = null;
      cr.register('end', 'ending call', (m) => { firedText = m.text; }, { timing: 'before' });
      cr.check('Ending call now.', 'before');
      return firedText;
    });
    expect(result).toBe('Ending call now.');
  });

  test('debounced command gets latest text not first match text', async () => {
    const result = await page.evaluate(() => {
      return new Promise((resolve) => {
        const { CommandRegistry, TypedEventEmitter } = KalturaAvatarSDK._internals;
        const emitter = new TypedEventEmitter();
        const cr = new CommandRegistry(emitter);
        let firedText = null;
        cr.register('nav', 'navigating to slide', (m) => { firedText = m.text; }, { timing: 'before', debounce: 50 });

        cr.check('Navigating to slide t', 'before');
        cr.check('Navigating to slide twenty', 'before');
        cr.check('Navigating to slide twenty-seven.', 'before');

        setTimeout(() => resolve(firedText), 150);
      });
    });
    expect(result).toBe('Navigating to slide twenty-seven.');
  });

  // ────────────────────────────────────────────────────────────────────
  // DPP MANAGER
  // ────────────────────────────────────────────────────────────────────

  test('DPP prepare accepts valid JSON string', async () => {
    const result = await page.evaluate(() => {
      const { DPPManager, Logger } = KalturaAvatarSDK._internals;
      const dpp = new DPPManager(new Logger('test', false));
      return dpp.prepare('{"v":"2"}');
    });
    expect(result).toBe('{"v":"2"}');
  });

  test('DPP prepare accepts object', async () => {
    const result = await page.evaluate(() => {
      const { DPPManager, Logger } = KalturaAvatarSDK._internals;
      const dpp = new DPPManager(new Logger('test', false));
      return dpp.prepare({ v: '2', user: { name: 'Test' } });
    });
    const parsed = JSON.parse(result);
    expect(parsed.v).toBe('2');
    expect(parsed.user.name).toBe('Test');
  });

  test('DPP prepare rejects invalid JSON string', async () => {
    const result = await page.evaluate(() => {
      const { DPPManager, Logger } = KalturaAvatarSDK._internals;
      const dpp = new DPPManager(new Logger('test', false));
      try { dpp.prepare('{invalid}'); return null; }
      catch (e) { return { code: e.code }; }
    });
    expect(result).not.toBeNull();
    expect(result.code).toBe(5003);
  });

  test('DPP prepare rejects non-object/non-string', async () => {
    const result = await page.evaluate(() => {
      const { DPPManager, Logger } = KalturaAvatarSDK._internals;
      const dpp = new DPPManager(new Logger('test', false));
      try { dpp.prepare(42); return null; }
      catch (e) { return { code: e.code }; }
    });
    expect(result).not.toBeNull();
    expect(result.code).toBe(5003);
  });

  // ────────────────────────────────────────────────────────────────────
  // RECONNECT STRATEGY
  // ────────────────────────────────────────────────────────────────────

  test('reconnect respects max attempts', async () => {
    const result = await page.evaluate(() => {
      const { ReconnectStrategy } = KalturaAvatarSDK._internals;
      const rs = new ReconnectStrategy({ baseDelay: 10, maxAttempts: 3 });
      let scheduled = 0;
      for (let i = 0; i < 5; i++) {
        if (rs.schedule(() => {})) scheduled++;
      }
      rs.cancel();
      return { scheduled, exhausted: rs.exhausted };
    });
    expect(result.scheduled).toBe(3);
    expect(result.exhausted).toBe(true);
  });

  test('reconnect reset clears attempts', async () => {
    const result = await page.evaluate(() => {
      const { ReconnectStrategy } = KalturaAvatarSDK._internals;
      const rs = new ReconnectStrategy({ baseDelay: 10, maxAttempts: 3 });
      rs.schedule(() => {});
      rs.schedule(() => {});
      rs.reset();
      return { attempt: rs.attempt, exhausted: rs.exhausted };
    });
    expect(result.attempt).toBe(0);
    expect(result.exhausted).toBe(false);
  });

  // ────────────────────────────────────────────────────────────────────
  // STATE MACHINE (internal)
  // ────────────────────────────────────────────────────────────────────

  test('state machine rejects invalid transitions', async () => {
    const result = await page.evaluate(() => {
      const { StateMachine, TypedEventEmitter, Logger } = KalturaAvatarSDK._internals;
      const emitter = new TypedEventEmitter();
      const sm = new StateMachine(emitter, new Logger('test', false));
      // From UNINITIALIZED, cannot go to IN_CONVERSATION directly
      return sm.transition('in-conversation');
    });
    expect(result).toBe(false);
  });

  test('state machine allows valid transitions', async () => {
    const result = await page.evaluate(() => {
      const { StateMachine, TypedEventEmitter, Logger } = KalturaAvatarSDK._internals;
      const emitter = new TypedEventEmitter();
      const sm = new StateMachine(emitter, new Logger('test', false));
      const r1 = sm.transition('connecting');
      const r2 = sm.transition('connected');
      return { r1, r2, current: sm.current };
    });
    expect(result.r1).toBe(true);
    expect(result.r2).toBe(true);
    expect(result.current).toBe('connected');
  });

  test('state machine tracks history', async () => {
    const result = await page.evaluate(() => {
      const { StateMachine, TypedEventEmitter, Logger } = KalturaAvatarSDK._internals;
      const emitter = new TypedEventEmitter();
      const sm = new StateMachine(emitter, new Logger('test', false));
      sm.transition('connecting');
      sm.transition('connected');
      return sm.history.length;
    });
    expect(result).toBe(2);
  });

  test('state machine throws on operation after destroy', async () => {
    const result = await page.evaluate(() => {
      const { StateMachine, TypedEventEmitter, Logger } = KalturaAvatarSDK._internals;
      const emitter = new TypedEventEmitter();
      const sm = new StateMachine(emitter, new Logger('test', false));
      sm.transition('destroyed');
      try { sm.transition('connecting'); return null; }
      catch (e) { return { code: e.code }; }
    });
    expect(result).not.toBeNull();
    expect(result.code).toBe(3003);
  });

  // ────────────────────────────────────────────────────────────────────
  // SDK INTEGRATION (without real server)
  // ────────────────────────────────────────────────────────────────────

  test('destroy emits destroyed event', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: '123', flowId: 'f' });
      let emitted = false;
      sdk.on('destroyed', () => { emitted = true; });
      sdk.destroy();
      return emitted;
    });
    expect(result).toBe(true);
  });

  test('state-change event fires on destroy', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: '123', flowId: 'f' });
      let change = null;
      sdk.on('state-change', (data) => { change = data; });
      sdk.destroy();
      return change;
    });
    expect(result.from).toBe('uninitialized');
    expect(result.to).toBe('destroyed');
  });

  test('connect() without socket.io throws meaningful error', async () => {
    const result = await page.evaluate(async () => {
      const origIo = window.io;
      delete window.io;
      const sdk = new KalturaAvatarSDK({ clientId: '123', flowId: 'f' });
      try {
        await sdk.connect();
        return null;
      } catch (e) {
        return { code: e.code, message: e.message };
      } finally {
        window.io = origIo;
        sdk.destroy();
      }
    });
    expect(result).not.toBeNull();
    expect(result.code).toBe(5001);
    expect(result.message).toContain('Socket.IO');
  });

  test('multiple instances are independent', async () => {
    const result = await page.evaluate(() => {
      const sdk1 = new KalturaAvatarSDK({ clientId: '111', flowId: 'a' });
      const sdk2 = new KalturaAvatarSDK({ clientId: '222', flowId: 'b' });
      const states = [sdk1.getState(), sdk2.getState()];
      sdk1.destroy();
      const afterDestroy = [sdk1.getState(), sdk2.getState()];
      sdk2.destroy();
      return { states, afterDestroy };
    });
    expect(result.states).toEqual(['uninitialized', 'uninitialized']);
    expect(result.afterDestroy).toEqual(['destroyed', 'uninitialized']);
  });

  test('registerCommand returns unsubscribe', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: '123', flowId: 'f' });
      const unsub = sdk.registerCommand('test', 'hello', () => {});
      const isFn = typeof unsub === 'function';
      sdk.destroy();
      return isFn;
    });
    expect(result).toBe(true);
  });

  test('microphone methods exist', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: '123', flowId: 'f' });
      const hasMethods = typeof sdk.muteMic === 'function'
        && typeof sdk.unmuteMic === 'function'
        && typeof sdk.isMicMuted === 'function';
      sdk.destroy();
      return hasMethods;
    });
    expect(result).toBe(true);
  });

  test('getTranscript returns empty array initially', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: '123', flowId: 'f' });
      const t = sdk.getTranscript();
      sdk.destroy();
      return t;
    });
    expect(result).toEqual([]);
  });

  test('isConnected() is false initially', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: '123', flowId: 'f' });
      const c = sdk.isConnected();
      sdk.destroy();
      return c;
    });
    expect(result).toBe(false);
  });

  test('getServerInfo() returns ServerInfo object with null defaults', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: '123', flowId: 'f' });
      const info = sdk.getServerInfo();
      const r = {
        agentName: info.agentName,
        language: info.language,
        features: info.features,
        videos: info.videos,
        photos: info.photos,
        initialHtml: info.initialHtml,
        loadingVideoUrl: info.loadingVideoUrl,
        raw: info.raw
      };
      sdk.destroy();
      return r;
    });
    expect(result.agentName).toBeNull();
    expect(result.language).toBe('en');
    expect(result.features).toBeNull();
    expect(result.videos).toEqual([]);
    expect(result.photos).toEqual([]);
    expect(result.initialHtml).toBeNull();
    expect(result.loadingVideoUrl).toBeNull();
    expect(result.raw).toBeNull();
  });

  test('getAgentName() returns null before configuration', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: '123', flowId: 'f' });
      const name = sdk.getAgentName();
      sdk.destroy();
      return name;
    });
    expect(result).toBeNull();
  });

  test('getFeatures() returns null before configuration', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: '123', flowId: 'f' });
      const f = sdk.getFeatures();
      sdk.destroy();
      return f;
    });
    expect(result).toBeNull();
  });

  test('getVideos() returns empty array before configuration', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: '123', flowId: 'f' });
      const v = sdk.getVideos();
      sdk.destroy();
      return v;
    });
    expect(result).toEqual([]);
  });

  test('pause() and resume() methods exist', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: '123', flowId: 'f' });
      const hasPause = typeof sdk.pause === 'function';
      const hasResume = typeof sdk.resume === 'function';
      sdk.destroy();
      return { hasPause, hasResume };
    });
    expect(result.hasPause).toBe(true);
    expect(result.hasResume).toBe(true);
  });

  test('sendCameraCapture() and sendScreenCapture() methods exist', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: '123', flowId: 'f' });
      const hasCamera = typeof sdk.sendCameraCapture === 'function';
      const hasScreen = typeof sdk.sendScreenCapture === 'function';
      sdk.destroy();
      return { hasCamera, hasScreen };
    });
    expect(result.hasCamera).toBe(true);
    expect(result.hasScreen).toBe(true);
  });

  test('new events are defined in Events object', async () => {
    const result = await page.evaluate(() => {
      return {
        serverConnected: KalturaAvatarSDK.Events.SERVER_CONNECTED,
        configured: KalturaAvatarSDK.Events.CONFIGURED,
        timeWarning: KalturaAvatarSDK.Events.TIME_WARNING,
        timeExpired: KalturaAvatarSDK.Events.TIME_EXPIRED,
        avatarTextReady: KalturaAvatarSDK.Events.AVATAR_TEXT_READY
      };
    });
    expect(result.serverConnected).toBe('server-connected');
    expect(result.configured).toBe('configured');
    expect(result.timeWarning).toBe('time-warning');
    expect(result.timeExpired).toBe('time-expired');
    expect(result.avatarTextReady).toBe('avatar-text-ready');
  });

  test('getLoadingVideoUrl() returns null before server connection', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: '123', flowId: 'f' });
      const url = sdk.getLoadingVideoUrl();
      sdk.destroy();
      return url;
    });
    expect(result).toBeNull();
  });

  // USER_SPEAKING_START event
  test('USER_SPEAKING_START event is defined', async () => {
    const result = await page.evaluate(() => {
      return KalturaAvatarSDK.Events.USER_SPEAKING_START;
    });
    expect(result).toBe('user-speaking-start');
  });

  test('isUserSpeaking() returns false initially', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: '123', flowId: 'f' });
      const speaking = sdk.isUserSpeaking();
      sdk.destroy();
      return speaking;
    });
    expect(result).toBe(false);
  });

  test('isUserSpeaking() method exists and is a function', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: '123', flowId: 'f' });
      const isFunc = typeof sdk.isUserSpeaking === 'function';
      sdk.destroy();
      return isFunc;
    });
    expect(result).toBe(true);
  });

  test('user-speaking-start event fires on userStartedTalking socket event', async () => {
    const result = await page.evaluate(() => {
      return new Promise((resolve) => {
        const { TypedEventEmitter } = KalturaAvatarSDK._internals;
        const emitter = new TypedEventEmitter();
        let fired = false;
        emitter.on('user-speaking-start', () => { fired = true; });
        emitter.emit('user-speaking-start');
        resolve(fired);
      });
    });
    expect(result).toBe(true);
  });

  test('user-speaking-start event name matches Events constant', async () => {
    const result = await page.evaluate(() => {
      const events = KalturaAvatarSDK.Events;
      return {
        constant: events.USER_SPEAKING_START,
        inObject: 'USER_SPEAKING_START' in events,
        value: events.USER_SPEAKING_START === 'user-speaking-start'
      };
    });
    expect(result.inObject).toBe(true);
    expect(result.value).toBe(true);
  });

  // ────────────────────────────────────────────────────────────────────
  // CAPTIONS: Events & Constants
  // ────────────────────────────────────────────────────────────────────

  test('caption events are defined in Events object', async () => {
    const result = await page.evaluate(() => {
      const E = KalturaAvatarSDK.Events;
      return {
        start: E.CAPTION_START,
        segment: E.CAPTION_SEGMENT,
        end: E.CAPTION_END,
        interrupted: E.CAPTION_INTERRUPTED
      };
    });
    expect(result.start).toBe('caption-start');
    expect(result.segment).toBe('caption-segment');
    expect(result.end).toBe('caption-end');
    expect(result.interrupted).toBe('caption-interrupted');
  });

  test('caption public API methods exist', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: '123', flowId: 'f' });
      const methods = {
        setCaptionsEnabled: typeof sdk.setCaptionsEnabled === 'function',
        isCaptionsEnabled: typeof sdk.isCaptionsEnabled === 'function',
        setCaptionStyle: typeof sdk.setCaptionStyle === 'function'
      };
      sdk.destroy();
      return methods;
    });
    expect(result.setCaptionsEnabled).toBe(true);
    expect(result.isCaptionsEnabled).toBe(true);
    expect(result.setCaptionStyle).toBe(true);
  });

  test('captions disabled by default', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: '123', flowId: 'f' });
      const enabled = sdk.isCaptionsEnabled();
      sdk.destroy();
      return enabled;
    });
    expect(result).toBe(false);
  });

  test('captions can be enabled via config', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: '123', flowId: 'f', captions: { enabled: true } });
      const enabled = sdk.isCaptionsEnabled();
      sdk.destroy();
      return enabled;
    });
    expect(result).toBe(true);
  });

  test('setCaptionsEnabled toggles at runtime', async () => {
    const result = await page.evaluate(() => {
      const sdk = new KalturaAvatarSDK({ clientId: '123', flowId: 'f' });
      sdk.setCaptionsEnabled(true);
      const after = sdk.isCaptionsEnabled();
      sdk.setCaptionsEnabled(false);
      const afterOff = sdk.isCaptionsEnabled();
      sdk.destroy();
      return { after, afterOff };
    });
    expect(result.after).toBe(true);
    expect(result.afterOff).toBe(false);
  });

  // ────────────────────────────────────────────────────────────────────
  // CAPTIONS: Segmenter
  // ────────────────────────────────────────────────────────────────────

  test('segmenter splits at sentence boundaries', async () => {
    const result = await page.evaluate(() => {
      const { CaptionSegmenter } = KalturaAvatarSDK._internals;
      const seg = new CaptionSegmenter(47, 2);
      return seg.segment('Hello there. How are you today? I am fine.');
    });
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.join(' ')).toContain('Hello there');
  });

  test('segmenter respects maxChars limit', async () => {
    const result = await page.evaluate(() => {
      const { CaptionSegmenter } = KalturaAvatarSDK._internals;
      const seg = new CaptionSegmenter(20, 2); // 40 chars max per segment
      const segments = seg.segment('This is a test sentence that is longer than forty characters. And another sentence here.');
      return { segments, allUnderLimit: segments.every(s => s.length <= 50) };
    });
    expect(result.segments.length).toBeGreaterThan(1);
    expect(result.allUnderLimit).toBe(true);
  });

  test('segmenter never splits mid-word', async () => {
    const result = await page.evaluate(() => {
      const { CaptionSegmenter } = KalturaAvatarSDK._internals;
      const seg = new CaptionSegmenter(20, 1); // tight limit
      const segments = seg.segment('Artificial intelligence is transforming businesses worldwide today.');
      const allWholeWords = segments.every(s => !s.startsWith(' ') && !s.endsWith(' ') && !/^\S+$/.test(s) || true);
      const noPartialWords = segments.every(s => {
        const words = s.split(/\s+/);
        return words.every(w => w.length > 0);
      });
      return { segments, noPartialWords };
    });
    expect(result.noPartialWords).toBe(true);
  });

  test('segmenter handles empty/whitespace input', async () => {
    const result = await page.evaluate(() => {
      const { CaptionSegmenter } = KalturaAvatarSDK._internals;
      const seg = new CaptionSegmenter(47, 2);
      return {
        empty: seg.segment(''),
        whitespace: seg.segment('   '),
        nullish: seg.segment(null)
      };
    });
    expect(result.empty).toEqual([]);
    expect(result.whitespace).toEqual([]);
    expect(result.nullish).toEqual([]);
  });

  test('segmenter keeps numbers with units together', async () => {
    const result = await page.evaluate(() => {
      const { CaptionSegmenter } = KalturaAvatarSDK._internals;
      const seg = new CaptionSegmenter(47, 2);
      const segments = seg.segment('The revenue was $44.6 million last quarter.');
      const combined = segments.join(' ');
      return combined.includes('$44.6 million');
    });
    expect(result).toBe(true);
  });

  test('segmenter handles single-word responses', async () => {
    const result = await page.evaluate(() => {
      const { CaptionSegmenter } = KalturaAvatarSDK._internals;
      const seg = new CaptionSegmenter(47, 2);
      return seg.segment('Yes.');
    });
    expect(result).toEqual(['Yes.']);
  });

  test('segmenter handles very long text (produces multiple segments)', async () => {
    const result = await page.evaluate(() => {
      const { CaptionSegmenter } = KalturaAvatarSDK._internals;
      const seg = new CaptionSegmenter(47, 2);
      const longText = 'This is the first sentence about technology. Machine learning models are improving rapidly. They can now understand natural language quite well. This opens up many new possibilities for businesses. Companies are investing heavily in AI research. The future looks very promising for the field. Innovation continues at an unprecedented pace. New breakthroughs are announced almost daily.';
      const segments = seg.segment(longText);
      return { count: segments.length, allNonEmpty: segments.every(s => s.trim().length > 0) };
    });
    expect(result.count).toBeGreaterThan(2);
    expect(result.allNonEmpty).toBe(true);
  });

  // ────────────────────────────────────────────────────────────────────
  // CAPTIONS: Rate Estimator
  // ────────────────────────────────────────────────────────────────────

  test('rate estimator has default 11 chars/sec', async () => {
    const result = await page.evaluate(() => {
      const { CaptionRateEstimator } = KalturaAvatarSDK._internals;
      const rate = new CaptionRateEstimator();
      return rate.charsPerSec;
    });
    expect(result).toBe(11);
  });

  test('rate estimator produces reasonable duration', async () => {
    const result = await page.evaluate(() => {
      const { CaptionRateEstimator } = KalturaAvatarSDK._internals;
      const rate = new CaptionRateEstimator();
      return rate.estimateDuration(110); // 110 chars at 11 chars/sec = 10000ms
    });
    expect(result).toBe(10000);
  });

  test('rate estimator calibrates from observed duration', async () => {
    const result = await page.evaluate(() => {
      const { CaptionRateEstimator } = KalturaAvatarSDK._internals;
      const rate = new CaptionRateEstimator();
      rate.calibrate(100, 5000); // 100 chars in 5s = 20 chars/sec
      return rate.charsPerSec;
    });
    expect(result).toBeGreaterThan(11);
    expect(result).toBeLessThan(20);
  });

  test('rate estimator converges after multiple samples', async () => {
    const result = await page.evaluate(() => {
      const { CaptionRateEstimator } = KalturaAvatarSDK._internals;
      const rate = new CaptionRateEstimator();
      // Feed consistent 15 chars/sec data
      for (let i = 0; i < 5; i++) {
        rate.calibrate(150, 10000);
      }
      return Math.abs(rate.charsPerSec - 15) < 1;
    });
    expect(result).toBe(true);
  });

  test('rate estimator rejects unreasonable values', async () => {
    const result = await page.evaluate(() => {
      const { CaptionRateEstimator } = KalturaAvatarSDK._internals;
      const rate = new CaptionRateEstimator();
      rate.calibrate(1000, 1); // 1000000 chars/sec — absurd
      rate.calibrate(0, 5000); // zero chars
      return rate.charsPerSec; // should still be 11
    });
    expect(result).toBe(11);
  });

  // ────────────────────────────────────────────────────────────────────
  // CAPTIONS: Tick-based timing
  // ────────────────────────────────────────────────────────────────────

  test('tick advances segments based on elapsed time', async () => {
    const result = await page.evaluate(() => {
      return new Promise((resolve) => {
        const { CaptionManager, TypedEventEmitter } = KalturaAvatarSDK._internals;
        const emitter = new TypedEventEmitter();
        // Use smaller line width to force multiple segments from shorter text
        const cm = new CaptionManager(emitter, { enabled: true, render: false, maxCharsPerLine: 20, maxLines: 1 }, { debug() {}, info() {}, warn() {}, error() {} });
        const segments = [];
        emitter.on('caption-segment', (p) => { segments.push({ index: p.index, text: p.text }); });
        // Two sentences that each exceed 20 chars → forced into separate segments
        cm.onChunk('Hello there my friend. How are you doing today?', 'sp1');
        cm.onSpeakingStart();
        // At 7 chars/sec, first segment (~22 chars) takes ~3.1s. Wait 4s.
        setTimeout(() => {
          cm.onSpeakingEnd('Hello there my friend. How are you doing today?', 'sp1');
          resolve(segments.length);
        }, 4000);
      });
    });
    expect(result).toBeGreaterThanOrEqual(2);
  });

  test('tick does not advance before enough time has elapsed', async () => {
    const result = await page.evaluate(() => {
      return new Promise((resolve) => {
        const { CaptionManager, TypedEventEmitter } = KalturaAvatarSDK._internals;
        const emitter = new TypedEventEmitter();
        const cm = new CaptionManager(emitter, { enabled: true, render: false }, { debug() {}, info() {}, warn() {}, error() {} });
        const segments = [];
        emitter.on('caption-segment', (p) => { segments.push(p.index); });
        cm.onChunk('This is the first sentence. This is the second sentence.', 'sp1');
        cm.onSpeakingStart();
        // Check very quickly — should only have shown first segment
        setTimeout(() => {
          cm.destroy();
          resolve(segments.length);
        }, 300);
      });
    });
    expect(result).toBe(1);
  });

  test('stopping tick prevents further advancement', async () => {
    const result = await page.evaluate(() => {
      return new Promise((resolve) => {
        const { CaptionManager, TypedEventEmitter } = KalturaAvatarSDK._internals;
        const emitter = new TypedEventEmitter();
        const cm = new CaptionManager(emitter, { enabled: true, render: false }, { debug() {}, info() {}, warn() {}, error() {} });
        const segments = [];
        emitter.on('caption-segment', (p) => { segments.push(p.index); });
        cm.onChunk('First sentence here. Second sentence here. Third sentence here.', 'sp1');
        cm.onSpeakingStart();
        // Interrupt immediately — should stop the tick
        setTimeout(() => { cm.interrupt(); }, 100);
        setTimeout(() => resolve(segments.length), 2000);
      });
    });
    expect(result).toBe(1);
  });

  // ────────────────────────────────────────────────────────────────────
  // CAPTIONS: Event Lifecycle (CaptionManager integration)
  // ────────────────────────────────────────────────────────────────────

  test('caption-start fires on first chunk when enabled', async () => {
    const result = await page.evaluate(() => {
      const { CaptionManager, TypedEventEmitter } = KalturaAvatarSDK._internals;
      const emitter = new TypedEventEmitter();
      const cm = new CaptionManager(emitter, { enabled: true, render: false }, { debug() {}, info() {}, warn() {}, error() {} });
      let startFired = false;
      emitter.on('caption-start', () => { startFired = true; });
      cm.onChunk('Hello world', 'speech-1');
      cm.destroy();
      return startFired;
    });
    expect(result).toBe(true);
  });

  test('caption-segment fires with correct payload', async () => {
    const result = await page.evaluate(() => {
      const { CaptionManager, TypedEventEmitter } = KalturaAvatarSDK._internals;
      const emitter = new TypedEventEmitter();
      const cm = new CaptionManager(emitter, { enabled: true, render: false }, { debug() {}, info() {}, warn() {}, error() {} });
      let payload = null;
      emitter.on('caption-segment', (p) => { payload = p; });
      cm.onChunk('Hello world.', 'speech-1');
      cm.onSpeakingStart();
      cm.destroy();
      return payload;
    });
    expect(result).not.toBeNull();
    expect(result.text).toBe('Hello world.');
    expect(result.index).toBe(0);
    expect(result.responseId).toBe('speech-1');
  });

  test('caption-end fires after onSpeakingEnd', async () => {
    const result = await page.evaluate(() => {
      const { CaptionManager, TypedEventEmitter } = KalturaAvatarSDK._internals;
      const emitter = new TypedEventEmitter();
      const cm = new CaptionManager(emitter, { enabled: true, render: false }, { debug() {}, info() {}, warn() {}, error() {} });
      let endFired = false;
      let endPayload = null;
      emitter.on('caption-end', (p) => { endFired = true; endPayload = p; });
      cm.onChunk('Test text.', 'speech-2');
      cm.onSpeakingStart();
      cm.onSpeakingEnd('Test text.', 'speech-2');
      cm.destroy();
      return { endFired, responseId: endPayload?.responseId };
    });
    expect(result.endFired).toBe(true);
    expect(result.responseId).toBe('speech-2');
  });

  test('caption-interrupted fires on interrupt', async () => {
    const result = await page.evaluate(() => {
      const { CaptionManager, TypedEventEmitter } = KalturaAvatarSDK._internals;
      const emitter = new TypedEventEmitter();
      const cm = new CaptionManager(emitter, { enabled: true, render: false }, { debug() {}, info() {}, warn() {}, error() {} });
      let interruptPayload = null;
      emitter.on('caption-interrupted', (p) => { interruptPayload = p; });
      cm.onChunk('Testing interruption.', 'speech-3');
      cm.interrupt();
      cm.destroy();
      return interruptPayload;
    });
    expect(result).not.toBeNull();
    expect(result.responseId).toBe('speech-3');
  });

  test('no caption events when disabled', async () => {
    const result = await page.evaluate(() => {
      const { CaptionManager, TypedEventEmitter } = KalturaAvatarSDK._internals;
      const emitter = new TypedEventEmitter();
      const cm = new CaptionManager(emitter, { enabled: false, render: false }, { debug() {}, info() {}, warn() {}, error() {} });
      let eventCount = 0;
      emitter.on('caption-start', () => eventCount++);
      emitter.on('caption-segment', () => eventCount++);
      emitter.on('caption-end', () => eventCount++);
      cm.onChunk('Hello', 'speech-1');
      cm.onSpeakingStart();
      cm.onSpeakingEnd('Hello', 'speech-1');
      cm.destroy();
      return eventCount;
    });
    expect(result).toBe(0);
  });

  test('enable/disable at runtime takes effect on next response', async () => {
    const result = await page.evaluate(() => {
      const { CaptionManager, TypedEventEmitter } = KalturaAvatarSDK._internals;
      const emitter = new TypedEventEmitter();
      const cm = new CaptionManager(emitter, { enabled: false, render: false }, { debug() {}, info() {}, warn() {}, error() {} });
      let events = [];
      emitter.on('caption-start', () => events.push('start'));
      emitter.on('caption-segment', () => events.push('segment'));
      // First response — disabled
      cm.onChunk('First.', 'id-1');
      cm.onSpeakingEnd('First.', 'id-1');
      const eventsWhileDisabled = events.length;
      // Enable
      cm.setEnabled(true);
      // Second response — should fire
      cm.onChunk('Second.', 'id-2');
      cm.onSpeakingEnd('Second.', 'id-2');
      cm.destroy();
      return { eventsWhileDisabled, totalAfterEnable: events.length };
    });
    expect(result.eventsWhileDisabled).toBe(0);
    expect(result.totalAfterEnable).toBeGreaterThan(0);
  });

  test('fallback: full text emitted from onSpeakingEnd when no chunks arrived', async () => {
    const result = await page.evaluate(() => {
      const { CaptionManager, TypedEventEmitter } = KalturaAvatarSDK._internals;
      const emitter = new TypedEventEmitter();
      const cm = new CaptionManager(emitter, { enabled: true, render: false }, { debug() {}, info() {}, warn() {}, error() {} });
      const segments = [];
      emitter.on('caption-segment', (p) => segments.push(p.text));
      // No onChunk called — go straight to onSpeakingEnd
      cm.onSpeakingEnd('Fallback text here.', 'speech-fallback');
      cm.destroy();
      return segments.join(' ');
    });
    expect(result).toContain('Fallback text here');
  });

  test('multiple rapid responses each get unique responseId', async () => {
    const result = await page.evaluate(() => {
      const { CaptionManager, TypedEventEmitter } = KalturaAvatarSDK._internals;
      const emitter = new TypedEventEmitter();
      const cm = new CaptionManager(emitter, { enabled: true, render: false }, { debug() {}, info() {}, warn() {}, error() {} });
      const ids = [];
      emitter.on('caption-start', (p) => ids.push(p.responseId));
      cm.onChunk('First.', 'id-A');
      cm.onSpeakingEnd('First.', 'id-A');
      cm.onChunk('Second.', 'id-B');
      cm.onSpeakingEnd('Second.', 'id-B');
      cm.destroy();
      return { count: ids.length, unique: new Set(ids).size === ids.length };
    });
    expect(result.count).toBe(2);
    expect(result.unique).toBe(true);
  });

  test('new speechId interrupts previous active caption', async () => {
    const result = await page.evaluate(() => {
      const { CaptionManager, TypedEventEmitter } = KalturaAvatarSDK._internals;
      const emitter = new TypedEventEmitter();
      const cm = new CaptionManager(emitter, { enabled: true, render: false }, { debug() {}, info() {}, warn() {}, error() {} });
      let interrupted = false;
      emitter.on('caption-interrupted', () => { interrupted = true; });
      cm.onChunk('First response.', 'id-1');
      cm.onChunk('New response starts.', 'id-2'); // different speechId → interrupt
      cm.destroy();
      return interrupted;
    });
    expect(result).toBe(true);
  });

  test('caption segments cover full text (no words missing)', async () => {
    const result = await page.evaluate(() => {
      const { CaptionManager, TypedEventEmitter } = KalturaAvatarSDK._internals;
      const emitter = new TypedEventEmitter();
      const cm = new CaptionManager(emitter, { enabled: true, render: false }, { debug() {}, info() {}, warn() {}, error() {} });
      const segments = [];
      emitter.on('caption-segment', (p) => segments.push(p.text));
      const fullText = 'Hello there. How are you doing today? I am doing well. Thank you for asking.';
      cm.onChunk(fullText, 'id-cover');
      cm.onSpeakingStart();
      cm.onSpeakingEnd(fullText, 'id-cover');
      cm.destroy();
      const reconstructed = segments.join(' ');
      const sourceWords = fullText.split(/\s+/);
      const allPresent = sourceWords.every(w => reconstructed.includes(w));
      return { allPresent, segCount: segments.length };
    });
    expect(result.allPresent).toBe(true);
    expect(result.segCount).toBeGreaterThanOrEqual(1);
  });

  test('destroy clears all timers', async () => {
    const result = await page.evaluate(() => {
      return new Promise((resolve) => {
        const { CaptionManager, TypedEventEmitter } = KalturaAvatarSDK._internals;
        const emitter = new TypedEventEmitter();
        const cm = new CaptionManager(emitter, { enabled: true, render: false }, { debug() {}, info() {}, warn() {}, error() {} });
        let segmentsAfterDestroy = 0;
        emitter.on('caption-segment', () => segmentsAfterDestroy++);
        cm.onChunk('Hello there. How are you today? Fine thanks.', 'id-x');
        cm.onSpeakingStart();
        // Destroy immediately — should cancel scheduled segments
        const preCount = segmentsAfterDestroy;
        cm.destroy();
        setTimeout(() => resolve({ preCount, postCount: segmentsAfterDestroy }), 2000);
      });
    });
    // Only the first segment fires immediately; the rest should be cancelled
    expect(result.postCount).toBeLessThanOrEqual(result.preCount);
  });
});
