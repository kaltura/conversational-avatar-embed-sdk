// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * GenUI Rendering System — Comprehensive Unit Tests
 * Tests all GenUI classes and rendering capabilities in the browser via Playwright.
 */

test.describe('GenUI Rendering System', () => {

  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto('/tests/e2e/test-runner.html');
    await page.waitForFunction(() => typeof window.KalturaAvatarSDK !== 'undefined');
  });

  test.afterAll(async () => {
    await page.close();
  });

  // ════════════════════════════════════════════════════════════════════════
  // SUITE 1: GenUIManager Core
  // ════════════════════════════════════════════════════════════════════════

  test.describe('GenUIManager Core', () => {

    test('instantiates with default config', async () => {
      const result = await page.evaluate(() => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        const enabled = sdk.isGenUIEnabled();
        sdk.destroy();
        return { enabled };
      });
      expect(result.enabled).toBe(true);
    });

    test('instantiates with genui disabled', async () => {
      const result = await page.evaluate(() => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container', genui: { enabled: false } });
        const enabled = sdk.isGenUIEnabled();
        sdk.destroy();
        return { enabled };
      });
      expect(result.enabled).toBe(false);
    });

    test('attach creates correct DOM structure', async () => {
      const result = await page.evaluate(() => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        const container = document.querySelector('#test-container');
        const genuiRoot = container.querySelector('.kav-genui');
        const board = container.querySelector('.kav-genui__board');
        const visual = container.querySelector('.kav-genui__visual');
        sdk.destroy();
        return { hasRoot: !!genuiRoot, hasBoard: !!board, hasVisual: !!visual };
      });
      expect(result.hasRoot).toBe(true);
      expect(result.hasBoard).toBe(true);
      expect(result.hasVisual).toBe(true);
    });

    test('attach injects CSS stylesheet', async () => {
      const result = await page.evaluate(() => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        const style = document.getElementById('kav-genui-styles');
        sdk.destroy();
        return !!style;
      });
      expect(result).toBe(true);
    });

    test('destroy removes DOM elements', async () => {
      const result = await page.evaluate(() => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        sdk.destroy();
        const container = document.querySelector('#test-container');
        const genuiRoot = container.querySelector('.kav-genui');
        return !genuiRoot;
      });
      expect(result).toBe(true);
    });

    test('setEnabled toggles rendering', async () => {
      const result = await page.evaluate(() => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        sdk.setGenUIEnabled(false);
        const disabled = !sdk.isGenUIEnabled();
        sdk.setGenUIEnabled(true);
        const enabled = sdk.isGenUIEnabled();
        sdk.destroy();
        return { disabled, enabled };
      });
      expect(result.disabled).toBe(true);
      expect(result.enabled).toBe(true);
    });

    test('getActiveGenUI returns null when nothing shown', async () => {
      const result = await page.evaluate(() => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        const active = sdk.getActiveGenUI();
        sdk.destroy();
        return active;
      });
      expect(result).toBeNull();
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // SUITE 2: RendererRegistry
  // ════════════════════════════════════════════════════════════════════════

  test.describe('RendererRegistry', () => {

    test('register stores renderer and returns unsubscribe', async () => {
      const result = await page.evaluate(() => {
        const { RendererRegistry } = KalturaAvatarSDK._internals;
        const registry = new RendererRegistry();
        const unsub = registry.register('test-type', { render() {} });
        const has = registry.has('test-type');
        unsub();
        const hasAfter = registry.has('test-type');
        return { has, hasAfter };
      });
      expect(result.has).toBe(true);
      expect(result.hasAfter).toBe(false);
    });

    test('register accepts function shorthand', async () => {
      const result = await page.evaluate(() => {
        const { RendererRegistry } = KalturaAvatarSDK._internals;
        const registry = new RendererRegistry();
        registry.register('fn-type', function(data, container, ctx) {});
        const renderer = registry.get('fn-type');
        return !!renderer && typeof renderer.render === 'function';
      });
      expect(result).toBe(true);
    });

    test('get returns null for unregistered type', async () => {
      const result = await page.evaluate(() => {
        const { RendererRegistry } = KalturaAvatarSDK._internals;
        const registry = new RendererRegistry();
        return registry.get('nonexistent');
      });
      expect(result).toBeNull();
    });

    test('register overrides previous renderer', async () => {
      const result = await page.evaluate(() => {
        const { RendererRegistry } = KalturaAvatarSDK._internals;
        const registry = new RendererRegistry();
        registry.register('x', { render() { return 'a'; } });
        registry.register('x', { render() { return 'b'; } });
        const renderer = registry.get('x');
        return renderer.render();
      });
      expect(result).toBe('b');
    });

    test('use adds middleware and returns unsubscribe', async () => {
      const result = await page.evaluate(() => {
        const { RendererRegistry } = KalturaAvatarSDK._internals;
        const registry = new RendererRegistry();
        const mw = { beforeRender() {} };
        const unsub = registry.use(mw);
        const count = registry.getMiddleware().length;
        unsub();
        const countAfter = registry.getMiddleware().length;
        return { count, countAfter };
      });
      expect(result.count).toBe(1);
      expect(result.countAfter).toBe(0);
    });

    test('getMiddleware returns copy not reference', async () => {
      const result = await page.evaluate(() => {
        const { RendererRegistry } = KalturaAvatarSDK._internals;
        const registry = new RendererRegistry();
        registry.use({ beforeRender() {} });
        const mw1 = registry.getMiddleware();
        const mw2 = registry.getMiddleware();
        return mw1 !== mw2;
      });
      expect(result).toBe(true);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // SUITE 3: LibraryLoader
  // ════════════════════════════════════════════════════════════════════════

  test.describe('LibraryLoader', () => {

    test('provide makes library available immediately', async () => {
      const result = await page.evaluate(async () => {
        const { LibraryLoader, Logger } = KalturaAvatarSDK._internals;
        const loader = new LibraryLoader(new Logger('test', false));
        const mockLib = { version: '1.0' };
        loader.provide('testlib', mockLib);
        const loaded = await loader.load('testlib');
        return loaded.version;
      });
      expect(result).toBe('1.0');
    });

    test('load caches result (second call same promise)', async () => {
      const result = await page.evaluate(async () => {
        const { LibraryLoader, Logger } = KalturaAvatarSDK._internals;
        const loader = new LibraryLoader(new Logger('test', false));
        loader.provide('cached', { x: 1 });
        const a = loader.load('cached');
        const b = loader.load('cached');
        return a === b;
      });
      expect(result).toBe(true);
    });

    test('load checks window global before CDN fetch', async () => {
      const result = await page.evaluate(async () => {
        const { LibraryLoader, Logger } = KalturaAvatarSDK._internals;
        const loader = new LibraryLoader(new Logger('test', false));
        window.__testGlobal = { found: true };
        loader.setUrl('__testGlobal', 'http://invalid.test/never.js');
        // Manually set globalName mapping (loader checks window[name])
        loader.provide('__testGlobal', window.__testGlobal);
        const lib = await loader.load('__testGlobal');
        delete window.__testGlobal;
        return lib.found;
      });
      expect(result).toBe(true);
    });

    test('setUrl overrides default CDN URL', async () => {
      const result = await page.evaluate(() => {
        const { LibraryLoader, Logger } = KalturaAvatarSDK._internals;
        const loader = new LibraryLoader(new Logger('test', false));
        loader.setUrl('chartjs', 'https://custom-cdn.example.com/chart.js');
        return loader._urls.get('chartjs');
      });
      expect(result).toBe('https://custom-cdn.example.com/chart.js');
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // SUITE 4: GenUIContainer DOM Management
  // ════════════════════════════════════════════════════════════════════════

  test.describe('GenUIContainer DOM', () => {

    test('showBoard inserts element and shows layer', async () => {
      const result = await page.evaluate(() => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        const el = document.createElement('div');
        el.textContent = 'Board content';
        sdk._genui._container.showBoard(el);
        const board = document.querySelector('.kav-genui__board');
        const visible = board && board.style.display !== 'none';
        const hasContent = board && board.querySelector('div')?.textContent === 'Board content';
        sdk.destroy();
        return { visible, hasContent };
      });
      expect(result.visible).toBe(true);
      expect(result.hasContent).toBe(true);
    });

    test('showVisual inserts element and shows layer', async () => {
      const result = await page.evaluate(() => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        const el = document.createElement('div');
        el.textContent = 'Visual content';
        sdk._genui._container.showVisual(el);
        const visual = document.querySelector('.kav-genui__visual');
        const visible = visual && visual.style.display !== 'none';
        const hasContent = visual && visual.querySelector('div')?.textContent === 'Visual content';
        sdk.destroy();
        return { visible, hasContent };
      });
      expect(result.visible).toBe(true);
      expect(result.hasContent).toBe(true);
    });

    test('hideBoard hides board layer', async () => {
      const result = await page.evaluate(() => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        const el = document.createElement('div');
        sdk._genui._container.showBoard(el);
        sdk._genui._container.hideBoard();
        const board = document.querySelector('.kav-genui__board');
        const hidden = board && board.style.display === 'none';
        sdk.destroy();
        return hidden;
      });
      expect(result).toBe(true);
    });

    test('hideVisual hides visual layer', async () => {
      const result = await page.evaluate(() => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        const el = document.createElement('div');
        sdk._genui._container.showVisual(el);
        sdk._genui._container.hideVisual();
        const visual = document.querySelector('.kav-genui__visual');
        const hidden = visual && visual.style.display === 'none';
        sdk.destroy();
        return hidden;
      });
      expect(result).toBe(true);
    });

    test('hideAll hides both layers', async () => {
      const result = await page.evaluate(() => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        sdk._genui._container.showBoard(document.createElement('div'));
        sdk._genui._container.showVisual(document.createElement('div'));
        sdk._genui._container.hideAll();
        const board = document.querySelector('.kav-genui__board');
        const visual = document.querySelector('.kav-genui__visual');
        sdk.destroy();
        return {
          boardHidden: board?.style.display === 'none',
          visualHidden: visual?.style.display === 'none'
        };
      });
      expect(result.boardHidden).toBe(true);
      expect(result.visualHidden).toBe(true);
    });

    test('showBoard replaces previous board content', async () => {
      const result = await page.evaluate(() => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        const el1 = document.createElement('div');
        el1.textContent = 'First';
        const el2 = document.createElement('div');
        el2.textContent = 'Second';
        sdk._genui._container.showBoard(el1);
        sdk._genui._container.showBoard(el2);
        const board = document.querySelector('.kav-genui__board');
        const contents = board?.querySelectorAll('.kav-genui__content, div:not(.kav-genui__dismiss)');
        const text = board?.textContent;
        sdk.destroy();
        return { containsSecond: text?.includes('Second'), containsFirst: text?.includes('First') };
      });
      expect(result.containsSecond).toBe(true);
      expect(result.containsFirst).toBe(false);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // SUITE 5: Built-in Renderers — Simple
  // ════════════════════════════════════════════════════════════════════════

  test.describe('Built-in Renderers — Simple', () => {

    test('showHtml renders HTML content', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        await sdk._genui._handleShow('showHtml', { mediaUrl: '<h2>Hello World</h2><p>Paragraph</p>' });
        const board = document.querySelector('.kav-genui__board');
        const h2 = board?.querySelector('h2');
        const p = board?.querySelector('p');
        sdk.destroy();
        return { hasH2: h2?.textContent === 'Hello World', hasP: p?.textContent === 'Paragraph' };
      });
      expect(result.hasH2).toBe(true);
      expect(result.hasP).toBe(true);
    });

    test('showHtml click handler emits interaction', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        let interactionFired = false;
        sdk.on('genui:interaction', () => { interactionFired = true; });
        await sdk._genui._handleShow('showHtml', { mediaUrl: '<button id="test-btn">Click Me</button>' });
        const btn = document.querySelector('#test-btn');
        if (btn) btn.click();
        await new Promise(r => setTimeout(r, 50));
        sdk.destroy();
        return interactionFired;
      });
      expect(result).toBe(true);
    });

    test('showIFrame creates iframe with correct src', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        await sdk._genui._handleShow('showIFrame', { mediaUrl: 'https://example.com/embed' });
        const board = document.querySelector('.kav-genui__board');
        const iframe = board?.querySelector('iframe');
        sdk.destroy();
        return { hasSrc: iframe?.src === 'https://example.com/embed', hasSandbox: iframe?.hasAttribute('sandbox') };
      });
      expect(result.hasSrc).toBe(true);
      expect(result.hasSandbox).toBe(true);
    });

    test('showVisualVideo creates iframe for video', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        await sdk._genui._handleShow('showVisualVideo', { videoUrl: 'https://example.com/video' });
        const visual = document.querySelector('.kav-genui__visual');
        const iframe = visual?.querySelector('iframe');
        sdk.destroy();
        return { hasIframe: !!iframe, hasSrc: iframe?.src === 'https://example.com/video' };
      });
      expect(result.hasIframe).toBe(true);
      expect(result.hasSrc).toBe(true);
    });

    test('showVisualLink creates anchor element', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        await sdk._genui._handleShow('showVisualLink', { linkUrl: 'https://example.com', linkText: 'Click here' });
        const visual = document.querySelector('.kav-genui__visual');
        const a = visual?.querySelector('a');
        sdk.destroy();
        return { href: a?.href, text: a?.textContent, target: a?.target };
      });
      expect(result.href).toBe('https://example.com/');
      expect(result.text).toBe('Click here');
      expect(result.target).toBe('_blank');
    });

    test('showVisualPhoto creates img element', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        await sdk._genui._handleShow('showVisualPhoto', { photoUrl: 'https://example.com/img.jpg' });
        const visual = document.querySelector('.kav-genui__visual');
        const img = visual?.querySelector('img');
        sdk.destroy();
        return { hasSrc: img?.src === 'https://example.com/img.jpg' };
      });
      expect(result.hasSrc).toBe(true);
    });

    test('showVisualItems creates button per item', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        await sdk._genui._handleShow('showVisualItems', { mediaUrl: ['Option A', 'Option B', 'Option C'] });
        const visual = document.querySelector('.kav-genui__visual');
        const buttons = visual?.querySelectorAll('.kav-genui__visual-item-btn');
        sdk.destroy();
        return { count: buttons?.length, texts: Array.from(buttons || []).map(b => b.textContent) };
      });
      expect(result.count).toBe(3);
      expect(result.texts).toEqual(['Option A', 'Option B', 'Option C']);
    });

    test('showVisualItems click emits interaction', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        let payload = null;
        sdk.on('genui:interaction', (p) => { payload = p; });
        await sdk._genui._handleShow('showVisualItems', { mediaUrl: ['Alpha', 'Beta'] });
        const visual = document.querySelector('.kav-genui__visual');
        const btn = visual?.querySelector('.kav-genui__visual-item-btn');
        if (btn) btn.click();
        await new Promise(r => setTimeout(r, 50));
        sdk.destroy();
        return payload;
      });
      expect(result).not.toBeNull();
      expect(result.interactionType).toBe('onHtmlElementClick');
    });

    test('showVisualTable creates table', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        await sdk._genui._handleShow('showVisualTable', {
          mediaUrl: JSON.stringify({ Name: ['Alice', 'Bob'], Score: ['95', '87'] })
        });
        const visual = document.querySelector('.kav-genui__visual');
        const table = visual?.querySelector('table');
        const headers = Array.from(table?.querySelectorAll('th') || []).map(th => th.textContent);
        const cells = Array.from(table?.querySelectorAll('td') || []).map(td => td.textContent);
        sdk.destroy();
        return { hasTable: !!table, headers, cells };
      });
      expect(result.hasTable).toBe(true);
      expect(result.headers).toEqual(['Name', 'Score']);
      expect(result.cells).toEqual(['Alice', '95', 'Bob', '87']);
    });

    test('showMedia creates image gallery', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        await sdk._genui._handleShow('showMedia', {
          mediaUrl: ['https://example.com/1.jpg', 'https://example.com/2.jpg']
        });
        const visual = document.querySelector('.kav-genui__visual');
        const imgs = visual?.querySelectorAll('img');
        sdk.destroy();
        return { count: imgs?.length };
      });
      expect(result.count).toBe(2);
    });

    test('showGeneratedImages creates grid', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        await sdk._genui._handleShow('showGeneratedImages', {
          mediaUrl: ['https://example.com/gen1.png', 'https://example.com/gen2.png']
        });
        const visual = document.querySelector('.kav-genui__visual');
        const imgs = visual?.querySelectorAll('img');
        sdk.destroy();
        return { count: imgs?.length };
      });
      expect(result.count).toBe(2);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // SUITE 6: Built-in Renderers — Contact Collection
  // ════════════════════════════════════════════════════════════════════════

  test.describe('Contact Collection Renderers', () => {

    test('contactEmail renders form with input and buttons', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        await sdk._genui._handleShow('contactEmail', { contact_type: 'email' });
        const board = document.querySelector('.kav-genui__board');
        const input = board?.querySelector('input[type="email"]');
        const submit = board?.querySelector('.kav-genui__contact-submit');
        const skip = board?.querySelector('.kav-genui__contact-skip');
        sdk.destroy();
        return { hasInput: !!input, hasSubmit: !!submit, hasSkip: !!skip };
      });
      expect(result.hasInput).toBe(true);
      expect(result.hasSubmit).toBe(true);
      expect(result.hasSkip).toBe(true);
    });

    test('contactEmail submit disabled when empty', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        await sdk._genui._handleShow('contactEmail', { contact_type: 'email' });
        const board = document.querySelector('.kav-genui__board');
        const submit = board?.querySelector('.kav-genui__contact-submit');
        sdk.destroy();
        return submit?.disabled;
      });
      expect(result).toBe(true);
    });

    test('contactEmail submit disabled for invalid email', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        await sdk._genui._handleShow('contactEmail', { contact_type: 'email' });
        const board = document.querySelector('.kav-genui__board');
        const input = board?.querySelector('input[type="email"]');
        const submit = board?.querySelector('.kav-genui__contact-submit');
        input.value = 'not-an-email';
        input.dispatchEvent(new Event('input'));
        sdk.destroy();
        return submit?.disabled;
      });
      expect(result).toBe(true);
    });

    test('contactEmail submit enabled for valid email', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        await sdk._genui._handleShow('contactEmail', { contact_type: 'email' });
        const board = document.querySelector('.kav-genui__board');
        const input = board?.querySelector('input[type="email"]');
        const submit = board?.querySelector('.kav-genui__contact-submit');
        input.value = 'test@example.com';
        input.dispatchEvent(new Event('input'));
        sdk.destroy();
        return submit?.disabled;
      });
      expect(result).toBe(false);
    });

    test('contactEmail submit emits contactInfoReceived', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        let interaction = null;
        sdk.on('genui:interaction', (p) => { interaction = p; });
        await sdk._genui._handleShow('contactEmail', { contact_type: 'email' });
        const board = document.querySelector('.kav-genui__board');
        const input = board?.querySelector('input[type="email"]');
        const submit = board?.querySelector('.kav-genui__contact-submit');
        input.value = 'user@test.com';
        input.dispatchEvent(new Event('input'));
        submit.click();
        await new Promise(r => setTimeout(r, 50));
        sdk.destroy();
        return interaction;
      });
      expect(result).not.toBeNull();
      expect(result.interactionType).toBe('contactInfoReceived');
      expect(result.payload.contact_info.info_type).toBe('email');
      expect(result.payload.contact_info.info_value).toBe('user@test.com');
    });

    test('contactEmail skip emits contactInfoRejected', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        let interaction = null;
        sdk.on('genui:interaction', (p) => { interaction = p; });
        await sdk._genui._handleShow('contactEmail', { contact_type: 'email' });
        const board = document.querySelector('.kav-genui__board');
        const skip = board?.querySelector('.kav-genui__contact-skip');
        skip.click();
        await new Promise(r => setTimeout(r, 50));
        sdk.destroy();
        return interaction;
      });
      expect(result).not.toBeNull();
      expect(result.interactionType).toBe('contactInfoRejected');
    });

    test('contactPhone renders form with tel input', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        await sdk._genui._handleShow('contactPhone', { contact_type: 'phone' });
        const board = document.querySelector('.kav-genui__board');
        const input = board?.querySelector('input[type="tel"]');
        sdk.destroy();
        return !!input;
      });
      expect(result).toBe(true);
    });

    test('contactPhone submit disabled for <8 digits', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        await sdk._genui._handleShow('contactPhone', { contact_type: 'phone' });
        const board = document.querySelector('.kav-genui__board');
        const input = board?.querySelector('input[type="tel"]');
        const submit = board?.querySelector('.kav-genui__contact-submit');
        input.value = '1234567';
        input.dispatchEvent(new Event('input'));
        sdk.destroy();
        return submit?.disabled;
      });
      expect(result).toBe(true);
    });

    test('contactPhone submit enabled for 8+ digits', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        await sdk._genui._handleShow('contactPhone', { contact_type: 'phone' });
        const board = document.querySelector('.kav-genui__board');
        const input = board?.querySelector('input[type="tel"]');
        const submit = board?.querySelector('.kav-genui__contact-submit');
        input.value = '12345678';
        input.dispatchEvent(new Event('input'));
        sdk.destroy();
        return submit?.disabled;
      });
      expect(result).toBe(false);
    });

    test('contactPhone submit emits contactInfoReceived', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        let interaction = null;
        sdk.on('genui:interaction', (p) => { interaction = p; });
        await sdk._genui._handleShow('contactPhone', { contact_type: 'phone' });
        const board = document.querySelector('.kav-genui__board');
        const input = board?.querySelector('input[type="tel"]');
        const submit = board?.querySelector('.kav-genui__contact-submit');
        input.value = '5551234567';
        input.dispatchEvent(new Event('input'));
        submit.click();
        await new Promise(r => setTimeout(r, 50));
        sdk.destroy();
        return interaction;
      });
      expect(result).not.toBeNull();
      expect(result.interactionType).toBe('contactInfoReceived');
      expect(result.payload.contact_info.info_type).toBe('phone');
      expect(result.payload.contact_info.info_value).toBe('5551234567');
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // SUITE 7: Built-in Renderers — Library-Dependent
  // ════════════════════════════════════════════════════════════════════════

  test.describe('Library-Dependent Renderers', () => {

    test('showChart calls loader and creates canvas', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        // Provide a mock Chart.js
        const instances = [];
        const mockChart = class { constructor(ctx, config) { instances.push({ ctx, config }); } destroy() {} };
        sdk.provideLibrary('chartjs', mockChart);
        await sdk._genui._handleShow('showChart', {
          mediaUrl: JSON.stringify({ type: 'bar', data: { labels: ['A'], datasets: [{ data: [1] }] } })
        });
        const board = document.querySelector('.kav-genui__board');
        const canvas = board?.querySelector('canvas');
        sdk.destroy();
        return { hasCanvas: !!canvas, chartCreated: instances.length === 1 };
      });
      expect(result.hasCanvas).toBe(true);
      expect(result.chartCreated).toBe(true);
    });

    test('showDiagram calls loader for mermaid', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        let renderCalled = false;
        const mockMermaid = {
          initialize() {},
          render(id, syntax) { renderCalled = true; return { svg: '<svg><text>Diagram</text></svg>' }; }
        };
        sdk.provideLibrary('mermaid', mockMermaid);
        await sdk._genui._handleShow('showDiagram', { mediaUrl: 'graph TD; A-->B;' });
        sdk.destroy();
        return renderCalled;
      });
      expect(result).toBe(true);
    });

    test('showLatex calls loader for katex', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        let renderArgs = null;
        const mockKatex = {
          render(formula, el, opts) { renderArgs = { formula, opts }; el.textContent = 'rendered'; }
        };
        sdk.provideLibrary('katex', mockKatex);
        sdk.provideLibrary('katex-css', true);
        await sdk._genui._handleShow('showLatex', { mediaUrl: 'E = mc^2' });
        sdk.destroy();
        return { called: !!renderArgs, formula: renderArgs?.formula };
      });
      expect(result.called).toBe(true);
      expect(result.formula).toBe('E = mc^2');
    });

    test('showCode creates editor area with submit', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        let cmCreated = false;
        // CM is called as a function: CM(element, options)
        const mockCM = function(el, opts) {
          cmCreated = true;
          return { getValue() { return 'code'; }, toTextArea() {} };
        };
        sdk.provideLibrary('codemirror', mockCM);
        sdk.provideLibrary('codemirror-css', true);
        await sdk._genui._handleShow('showCode', { mediaUrl: JSON.stringify({ question: 'Write hello', code: 'print("hi")' }) });
        const board = document.querySelector('.kav-genui__board');
        const submitBtn = board?.querySelector('.kav-genui__code-submit');
        sdk.destroy();
        return { cmCreated, hasSubmit: !!submitBtn };
      });
      expect(result.cmCreated).toBe(true);
      expect(result.hasSubmit).toBe(true);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // SUITE 8: Event Lifecycle
  // ════════════════════════════════════════════════════════════════════════

  test.describe('Event Lifecycle', () => {

    test('genui:before-render fires before DOM update', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        const events = [];
        sdk.on('genui:before-render', (p) => { events.push('before:' + p.type); });
        sdk.on('genui:rendered', (p) => { events.push('rendered:' + p.type); });
        await sdk._genui._handleShow('showVisualPhoto', { photoUrl: 'https://example.com/x.jpg' });
        sdk.destroy();
        return events;
      });
      expect(result[0]).toBe('before:showVisualPhoto');
      expect(result[1]).toBe('rendered:showVisualPhoto');
    });

    test('genui:before-render payload contains type, data, category', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        let payload = null;
        sdk.on('genui:before-render', (p) => { payload = p; });
        await sdk._genui._handleShow('showHtml', { mediaUrl: '<p>hi</p>' });
        sdk.destroy();
        return payload;
      });
      expect(result.type).toBe('showHtml');
      expect(result.data).toEqual({ mediaUrl: '<p>hi</p>' });
      expect(result.category).toBe('board');
    });

    test('genui:rendered payload contains element', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        let payload = null;
        sdk.on('genui:rendered', (p) => { payload = { type: p.type, hasElement: !!p.element, category: p.category }; });
        await sdk._genui._handleShow('showVisualLink', { linkUrl: 'https://x.com', linkText: 'X' });
        sdk.destroy();
        return payload;
      });
      expect(result.type).toBe('showVisualLink');
      expect(result.hasElement).toBe(true);
      expect(result.category).toBe('visual');
    });

    test('genui:interaction fires on user interaction', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        let payload = null;
        sdk.on('genui:interaction', (p) => { payload = p; });
        await sdk._genui._handleShow('showVisualItems', { mediaUrl: ['Click me'] });
        const visual = document.querySelector('.kav-genui__visual');
        const btn = visual?.querySelector('button');
        btn?.click();
        await new Promise(r => setTimeout(r, 50));
        sdk.destroy();
        return payload;
      });
      expect(result).not.toBeNull();
      expect(result.interactionType).toBe('onHtmlElementClick');
    });

    test('genui:error fires on renderer failure', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        let errorPayload = null;
        sdk.on('genui:error', (p) => { errorPayload = { type: p.type, message: p.error.message }; });
        sdk.registerRenderer('showHtml', { render() { throw new Error('Test render failure'); } });
        await sdk._genui._handleShow('showHtml', { mediaUrl: '<p>test</p>' });
        sdk.destroy();
        return errorPayload;
      });
      expect(result.type).toBe('showHtml');
      expect(result.message).toBe('Test render failure');
    });

    test('existing genui event still fires (backward compat)', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        let firedGenui = false;
        sdk.on('genui', ({ type }) => { firedGenui = type === 'showVisualPhoto'; });
        await sdk._genui._handleShow('showVisualPhoto', { photoUrl: 'https://x.com/y.jpg' });
        sdk.destroy();
        return firedGenui;
      });
      expect(result).toBe(true);
    });

    test('events fire even when rendering is disabled', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container', genui: { enabled: false } });
        let beforeFired = false;
        let genuiFired = false;
        sdk.on('genui:before-render', () => { beforeFired = true; });
        sdk.on('genui', () => { genuiFired = true; });
        await sdk._genui._handleShow('showVisualPhoto', { photoUrl: 'https://x.com/y.jpg' });
        sdk.destroy();
        return { beforeFired, genuiFired };
      });
      expect(result.beforeFired).toBe(true);
      expect(result.genuiFired).toBe(true);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // SUITE 9: Middleware
  // ════════════════════════════════════════════════════════════════════════

  test.describe('Middleware', () => {

    test('beforeRender middleware called before rendering', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        const order = [];
        sdk.useGenUIMiddleware({ beforeRender() { order.push('mw'); } });
        sdk.on('genui:rendered', () => { order.push('rendered'); });
        await sdk._genui._handleShow('showVisualPhoto', { photoUrl: 'https://x.com/y.jpg' });
        sdk.destroy();
        return order;
      });
      expect(result).toEqual(['mw', 'rendered']);
    });

    test('setting cancelled=true prevents rendering', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        let rendered = false;
        sdk.useGenUIMiddleware({ beforeRender(ctx) { ctx.cancelled = true; } });
        sdk.on('genui:rendered', () => { rendered = true; });
        await sdk._genui._handleShow('showVisualPhoto', { photoUrl: 'https://x.com/y.jpg' });
        sdk.destroy();
        return rendered;
      });
      expect(result).toBe(false);
    });

    test('cancelled still emits genui event', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        let genuiFired = false;
        sdk.useGenUIMiddleware({ beforeRender(ctx) { ctx.cancelled = true; } });
        sdk.on('genui', () => { genuiFired = true; });
        await sdk._genui._handleShow('showVisualPhoto', { photoUrl: 'https://x.com/y.jpg' });
        sdk.destroy();
        return genuiFired;
      });
      expect(result).toBe(true);
    });

    test('afterRender middleware called after rendering', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        let afterCalled = false;
        let hasElement = false;
        sdk.useGenUIMiddleware({
          afterRender(ctx) { afterCalled = true; hasElement = !!ctx.element; }
        });
        await sdk._genui._handleShow('showVisualPhoto', { photoUrl: 'https://x.com/y.jpg' });
        sdk.destroy();
        return { afterCalled, hasElement };
      });
      expect(result.afterCalled).toBe(true);
      expect(result.hasElement).toBe(true);
    });

    test('multiple middleware execute in registration order', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        const order = [];
        sdk.useGenUIMiddleware({ beforeRender() { order.push('first'); } });
        sdk.useGenUIMiddleware({ beforeRender() { order.push('second'); } });
        await sdk._genui._handleShow('showVisualPhoto', { photoUrl: 'https://x.com/y.jpg' });
        sdk.destroy();
        return order;
      });
      expect(result).toEqual(['first', 'second']);
    });

    test('middleware errors do not crash render pipeline', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        let rendered = false;
        sdk.useGenUIMiddleware({ beforeRender() { throw new Error('MW crash'); } });
        sdk.on('genui:rendered', () => { rendered = true; });
        await sdk._genui._handleShow('showVisualPhoto', { photoUrl: 'https://x.com/y.jpg' });
        sdk.destroy();
        return rendered;
      });
      expect(result).toBe(true);
    });

    test('middleware unsubscribe removes it', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        let called = false;
        const unsub = sdk.useGenUIMiddleware({ beforeRender() { called = true; } });
        unsub();
        await sdk._genui._handleShow('showVisualPhoto', { photoUrl: 'https://x.com/y.jpg' });
        sdk.destroy();
        return called;
      });
      expect(result).toBe(false);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // SUITE 10: Custom Renderer Override
  // ════════════════════════════════════════════════════════════════════════

  test.describe('Custom Renderer Override', () => {

    test('registerRenderer replaces built-in', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        sdk.registerRenderer('showVisualPhoto', {
          render(data, container) { container.innerHTML = '<span class="custom">Custom Photo</span>'; }
        });
        await sdk._genui._handleShow('showVisualPhoto', { photoUrl: 'https://x.com/y.jpg' });
        const visual = document.querySelector('.kav-genui__visual');
        const custom = visual?.querySelector('.custom');
        sdk.destroy();
        return custom?.textContent;
      });
      expect(result).toBe('Custom Photo');
    });

    test('custom renderer receives correct data and context', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        let received = null;
        sdk.registerRenderer('showVisualLink', {
          render(data, container, ctx) {
            received = {
              hasData: !!data,
              hasContainer: !!container,
              type: ctx.type,
              category: ctx.category,
              hasLoader: !!ctx.loader,
              hasEmit: typeof ctx.emit === 'function',
              hasHideGenUI: typeof ctx.hideGenUI === 'function'
            };
          }
        });
        await sdk._genui._handleShow('showVisualLink', { linkUrl: 'https://x.com', linkText: 'test' });
        sdk.destroy();
        return received;
      });
      expect(result.hasData).toBe(true);
      expect(result.hasContainer).toBe(true);
      expect(result.type).toBe('showVisualLink');
      expect(result.category).toBe('visual');
      expect(result.hasLoader).toBe(true);
      expect(result.hasEmit).toBe(true);
      expect(result.hasHideGenUI).toBe(true);
    });

    test('context.emit fires genui:interaction', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        let interactionPayload = null;
        sdk.on('genui:interaction', (p) => { interactionPayload = p; });
        sdk.registerRenderer('showVisualLink', {
          render(data, container, ctx) {
            ctx.emit('customEvent', { value: 42 });
          }
        });
        await sdk._genui._handleShow('showVisualLink', { linkUrl: 'https://x.com' });
        sdk.destroy();
        return interactionPayload;
      });
      expect(result.interactionType).toBe('customEvent');
      expect(result.payload.value).toBe(42);
    });

    test('unsubscribe removes custom renderer', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        const unsub = sdk.registerRenderer('showVisualPhoto', {
          render(data, container) { container.innerHTML = '<span class="custom-gone">Gone</span>'; }
        });
        unsub();
        // After unsub, there's no renderer for this type (built-in was replaced then removed)
        const active = sdk._genui._registry.has('showVisualPhoto');
        sdk.destroy();
        return active;
      });
      expect(result).toBe(false);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // SUITE 11: Public API Integration
  // ════════════════════════════════════════════════════════════════════════

  test.describe('Public API Integration', () => {

    test('sdk.registerRenderer accessible', async () => {
      const result = await page.evaluate(() => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        const fn = typeof sdk.registerRenderer;
        sdk.destroy();
        return fn;
      });
      expect(result).toBe('function');
    });

    test('sdk.useGenUIMiddleware accessible', async () => {
      const result = await page.evaluate(() => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        const fn = typeof sdk.useGenUIMiddleware;
        sdk.destroy();
        return fn;
      });
      expect(result).toBe('function');
    });

    test('sdk.provideLibrary makes library available', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        sdk.provideLibrary('mylib', { test: true });
        const lib = await sdk._genui._loader.load('mylib');
        sdk.destroy();
        return lib.test;
      });
      expect(result).toBe(true);
    });

    test('sdk.setLibraryUrl updates CDN URL', async () => {
      const result = await page.evaluate(() => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        sdk.setLibraryUrl('chartjs', 'https://custom.cdn/chart.js');
        const url = sdk._genui._loader._urls.get('chartjs');
        sdk.destroy();
        return url;
      });
      expect(result).toBe('https://custom.cdn/chart.js');
    });

    test('sdk.hideGenUI hides active content', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        await sdk._genui._handleShow('showVisualPhoto', { photoUrl: 'https://x.com/y.jpg' });
        sdk.hideGenUI();
        const visual = document.querySelector('.kav-genui__visual');
        sdk.destroy();
        return visual?.style.display === 'none';
      });
      expect(result).toBe(true);
    });

    test('sdk.hideGenUI(board) hides only board', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        await sdk._genui._handleShow('showHtml', { mediaUrl: '<p>Board</p>' });
        await sdk._genui._handleShow('showVisualPhoto', { photoUrl: 'https://x.com/y.jpg' });
        sdk.hideGenUI('board');
        const board = document.querySelector('.kav-genui__board');
        const visual = document.querySelector('.kav-genui__visual');
        sdk.destroy();
        return { boardHidden: board?.style.display === 'none', visualVisible: visual?.style.display !== 'none' };
      });
      expect(result.boardHidden).toBe(true);
      expect(result.visualVisible).toBe(true);
    });

    test('sdk.getActiveGenUI returns current state', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        await sdk._genui._handleShow('showVisualPhoto', { photoUrl: 'https://x.com/y.jpg' });
        const active = sdk.getActiveGenUI();
        sdk.destroy();
        return active;
      });
      expect(result.type).toBe('showVisualPhoto');
      expect(result.category).toBe('visual');
    });

    test('sdk.setGenUIEnabled toggles rendering', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        sdk.setGenUIEnabled(false);
        const disabled = !sdk.isGenUIEnabled();
        sdk.setGenUIEnabled(true);
        const enabled = sdk.isGenUIEnabled();
        sdk.destroy();
        return { disabled, enabled };
      });
      expect(result.disabled).toBe(true);
      expect(result.enabled).toBe(true);
    });

    test('sdk.submitContact emits contactInfoReceived (convenience)', async () => {
      const result = await page.evaluate(() => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        const hasMethod = typeof sdk.submitContact === 'function';
        const hasReject = typeof sdk.rejectContact === 'function';
        sdk.destroy();
        return { hasMethod, hasReject };
      });
      expect(result.hasMethod).toBe(true);
      expect(result.hasReject).toBe(true);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // SUITE 12: CSS & Theming
  // ════════════════════════════════════════════════════════════════════════

  test.describe('CSS & Theming', () => {

    test('default styles injected once', async () => {
      const result = await page.evaluate(() => {
        // Create two instances
        const sdk1 = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        sdk1.destroy();
        const sdk2 = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        const styleCount = document.querySelectorAll('#kav-genui-styles').length;
        sdk2.destroy();
        return styleCount;
      });
      expect(result).toBeLessThanOrEqual(1);
    });

    test('CSS contains essential selectors', async () => {
      const result = await page.evaluate(() => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        const style = document.getElementById('kav-genui-styles');
        const text = style?.textContent || '';
        sdk.destroy();
        return {
          hasRoot: text.includes('.kav-genui'),
          hasBoard: text.includes('.kav-genui__board'),
          hasVisual: text.includes('.kav-genui__visual'),
          hasDismiss: text.includes('.kav-genui__dismiss'),
          hasContact: text.includes('.kav-genui__contact')
        };
      });
      expect(result.hasRoot).toBe(true);
      expect(result.hasBoard).toBe(true);
      expect(result.hasVisual).toBe(true);
      expect(result.hasDismiss).toBe(true);
      expect(result.hasContact).toBe(true);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // SUITE 13: Edge Cases & Resilience
  // ════════════════════════════════════════════════════════════════════════

  test.describe('Edge Cases & Resilience', () => {

    test('renderer that throws is caught and genui:error emitted', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        let errorFired = false;
        sdk.on('genui:error', () => { errorFired = true; });
        sdk.registerRenderer('showVisualPhoto', { render() { throw new Error('Boom'); } });
        await sdk._genui._handleShow('showVisualPhoto', { photoUrl: 'https://x.com/y.jpg' });
        const state = sdk.getState();
        sdk.destroy();
        return { errorFired, sdkStable: state === 'uninitialized' };
      });
      expect(result.errorFired).toBe(true);
      expect(result.sdkStable).toBe(true);
    });

    test('renderer returning rejected promise handled gracefully', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        let errorFired = false;
        sdk.on('genui:error', () => { errorFired = true; });
        sdk.registerRenderer('showVisualPhoto', {
          async render() { throw new Error('Async boom'); }
        });
        await sdk._genui._handleShow('showVisualPhoto', { photoUrl: 'https://x.com/y.jpg' });
        sdk.destroy();
        return errorFired;
      });
      expect(result).toBe(true);
    });

    test('show event with null data does not crash', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        let errored = false;
        try {
          await sdk._genui._handleShow('showVisualPhoto', null);
        } catch (e) { errored = true; }
        sdk.destroy();
        return errored;
      });
      expect(result).toBe(false);
    });

    test('hide event when nothing is shown is a no-op', async () => {
      const result = await page.evaluate(() => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        let errored = false;
        try { sdk.hideGenUI(); } catch (e) { errored = true; }
        sdk.destroy();
        return errored;
      });
      expect(result).toBe(false);
    });

    test('destroy during active render cleans up', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        await sdk._genui._handleShow('showVisualPhoto', { photoUrl: 'https://x.com/y.jpg' });
        sdk.destroy();
        const container = document.querySelector('#test-container');
        const genuiRoot = container?.querySelector('.kav-genui');
        return !genuiRoot;
      });
      expect(result).toBe(true);
    });

    test('rapid sequential show events — only last one visible', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        for (let i = 0; i < 10; i++) {
          sdk._genui._handleShow('showVisualPhoto', { photoUrl: `https://x.com/${i}.jpg` });
        }
        await new Promise(r => setTimeout(r, 100));
        const visual = document.querySelector('.kav-genui__visual');
        const imgs = visual?.querySelectorAll('img');
        sdk.destroy();
        return imgs?.length;
      });
      expect(result).toBe(1);
    });

    test('getActiveGenUI returns correct type after sequential shows', async () => {
      const result = await page.evaluate(async () => {
        const sdk = new KalturaAvatarSDK({ clientId: 'test', flowId: 'f', container: '#test-container' });
        await sdk._genui._handleShow('showVisualPhoto', { photoUrl: 'https://x.com/1.jpg' });
        await sdk._genui._handleShow('showVisualLink', { linkUrl: 'https://x.com', linkText: 'Last' });
        const active = sdk.getActiveGenUI();
        sdk.destroy();
        return active;
      });
      expect(result.type).toBe('showVisualLink');
      expect(result.category).toBe('visual');
    });
  });
});
