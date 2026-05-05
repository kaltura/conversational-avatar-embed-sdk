// @ts-check
const { test, expect } = require('@playwright/test');

test('ASR WebRTC diagnostic', async ({ page }) => {
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('ASR') || text.includes('asr') || text.includes('ICE') ||
        text.includes('ice') || text.includes('WARN') || text.includes('ERROR') ||
        text.includes('connection state') || text.includes('Mic') || text.includes('mic')) {
      console.log(`[BROWSER] ${text}`);
    }
  });

  await page.goto('/examples/demo/');
  await page.waitForFunction(() => typeof window.KalturaAvatarSDK !== 'undefined');

  const result = await page.evaluate(async () => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => resolve({ status: 'timeout', logs }), 40000);
      const logs = [];

      const sdk = new KalturaAvatarSDK({
        clientId: '115767973963657880005',
        flowId: 'agent-1',
        container: '#avatar-container',
        debug: true
      });

      sdk.on('ready', () => {
        logs.push('SDK READY - ASR should be starting');
        setTimeout(() => {
          clearTimeout(timeout);
          sdk.destroy();
          resolve({ status: 'done', logs });
        }, 12000);
      });

      sdk.on('error', (err) => {
        logs.push(`ERROR: ${err.code} ${err.message}`);
      });

      sdk.connect().catch(err => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  });

  console.log('Result:', JSON.stringify(result, null, 2));
});
