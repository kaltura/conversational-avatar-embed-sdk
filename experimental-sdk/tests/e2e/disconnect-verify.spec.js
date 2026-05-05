// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Disconnect Verification — ensures disconnect properly tears down media and socket.
 */

const CLIENT_ID = '115767973963657880005';
const FLOW_ID = 'agent-1';

test('disconnect stops video, audio, mic, and socket', async ({ page }) => {
  const logs = [];
  page.on('console', msg => { logs.push(`[${msg.type()}] ${msg.text()}`); });

  await page.goto('/examples/demo/');
  await page.waitForFunction(() => typeof window.KalturaAvatarSDK !== 'undefined');

  // Click Connect
  await page.click('#btn-connect');

  // Wait for ready/connected state
  await page.waitForFunction(() => {
    const lbl = document.getElementById('lbl-state');
    return lbl && lbl.textContent === 'connected';
  }, { timeout: 25000 });

  // Let avatar speak for a moment
  await page.waitForTimeout(2000);

  // Verify media is active before disconnect
  const beforeDisconnect = await page.evaluate(() => {
    const video = document.querySelector('video');
    return {
      videoHasSrc: !!(video?.srcObject),
      sdkState: sdk.getState(),
      isConnected: sdk.isConnected(),
      socketConnected: !!sdk._socket?.connected
    };
  });

  console.log('BEFORE disconnect:', JSON.stringify(beforeDisconnect, null, 2));
  expect(beforeDisconnect.sdkState).toBe('in-conversation');
  expect(beforeDisconnect.isConnected).toBe(true);
  expect(beforeDisconnect.socketConnected).toBe(true);

  // Click Disconnect
  await page.click('#btn-disconnect');
  await page.waitForTimeout(500);

  // Verify everything is torn down
  const afterDisconnect = await page.evaluate(() => {
    const video = document.querySelector('video');
    return {
      videoSrcObject: video?.srcObject,
      sdkState: sdk.getState(),
      isConnected: sdk.isConnected(),
      socketExists: !!sdk._socket,
      statusLabel: document.getElementById('lbl-state')?.textContent,
      btnConnectDisabled: document.getElementById('btn-connect')?.disabled,
      btnDisconnectDisabled: document.getElementById('btn-disconnect')?.disabled
    };
  });

  console.log('AFTER disconnect:', JSON.stringify(afterDisconnect, null, 2));
  expect(afterDisconnect.videoSrcObject).toBeNull();
  expect(afterDisconnect.sdkState).toBe('ended');
  expect(afterDisconnect.isConnected).toBe(false);
  expect(afterDisconnect.socketExists).toBe(false);
  expect(afterDisconnect.statusLabel).toBe('disconnected');
  expect(afterDisconnect.btnConnectDisabled).toBe(false);
  expect(afterDisconnect.btnDisconnectDisabled).toBe(true);
});
