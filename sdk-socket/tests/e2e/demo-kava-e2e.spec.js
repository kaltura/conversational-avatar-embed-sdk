// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Demo App KAVA End-to-End Test
 * Uses the actual demo UI to connect with KAVA enabled, verifies all analytics
 * events succeed (HTTP 200), then queries the Kaltura Report API to confirm
 * events were processed.
 *
 * Run with: npx playwright test tests/e2e/demo-kava-e2e.spec.js
 */

const CLIENT_ID = process.env.KALTURA_CLIENT_ID || '115767973963657880005';
const FLOW_ID = process.env.KALTURA_FLOW_ID || 'agent-1';
const PARTNER_ID = process.env.KALTURA_PARTNER_ID || '5896392';
const ADMIN_SECRET = process.env.KALTURA_ADMIN_SECRET || '';
const USER_ID = process.env.KALTURA_USER_ID || '';
const SERVICE_URL = process.env.KALTURA_SERVICE_URL || 'https://www.kaltura.com';

test.describe('Demo App — KAVA End-to-End (Live)', () => {

  test('demo app with KAVA enabled: full lifecycle reports all events successfully', async ({ page }) => {
    test.setTimeout(90000);

    // Collect all analytics requests and responses
    const analyticsEvents = [];
    page.on('request', (req) => {
      if (req.url().includes('analytics.kaltura.com')) {
        const postData = req.postData() || '';
        const params = Object.fromEntries(new URLSearchParams(postData));
        analyticsEvents.push({
          eventType: params.eventType,
          partnerId: params.partnerId,
          sessionId: params.sessionId,
          threadId: params.threadId,
          callId: params.callId,
          messageId: params.messageId,
          eventIndex: params.eventIndex,
          agentId: params.agentId,
          genieId: params.genieId,
          experience: params.experience,
          pageName: params.pageName,
          buttonName: params.buttonName,
          totalCallTime: params.totalCallTime,
          request: req
        });
      }
    });

    const analyticsResponses = [];
    page.on('response', (resp) => {
      if (resp.url().includes('analytics.kaltura.com')) {
        analyticsResponses.push({
          status: resp.status(),
          ok: resp.ok()
        });
      }
    });

    // Load demo app
    await page.goto('/examples/demo/index.html');
    await page.waitForFunction(() => typeof window.KalturaAvatarSDK !== 'undefined');
    await page.waitForFunction(() => typeof window.KalturaAvatarAnalytics !== 'undefined');

    // Configure: set Client ID and Flow ID
    await page.fill('#cfg-client-id', CLIENT_ID);
    await page.fill('#cfg-flow-id', FLOW_ID);

    // Enable KAVA and set Partner ID
    await page.check('#cfg-kava');
    await page.fill('#cfg-partner-id', PARTNER_ID);

    // Click Connect
    await page.click('#btn-connect');

    // Wait for avatar to be ready and speak (greeting triggers messageResponse)
    await page.waitForFunction(() => {
      const log = document.getElementById('event-log');
      return log && log.textContent.includes('Avatar ready');
    }, { timeout: 40000 });

    // Wait for avatar speech (proves messageResponse fires)
    await page.waitForFunction(() => {
      const transcript = document.getElementById('transcript');
      return transcript && transcript.querySelector('.bubble.avatar');
    }, { timeout: 30000 });

    // Give KAVA events time to fire and receive responses
    await page.waitForTimeout(2000);

    // Fire manual KAVA events via the encapsulated demo API
    await page.evaluate(() => {
      const analytics = window._demoApp && window._demoApp.getAnalytics();
      if (analytics) {
        analytics.pageView('DemoTestPage', 'e2e');
        analytics.buttonClick('test-e2e-btn', 'click', 'demo-context');
        analytics.sendFeedback('1', 'like');
      }
    });

    // Wait for manual events to complete
    await page.waitForTimeout(2000);

    // Disconnect to trigger callEnded
    await page.click('#btn-disconnect');
    await page.waitForTimeout(2000);

    // Collect final stats from the event log
    const kavaLogEntries = await page.evaluate(() => {
      const log = document.getElementById('event-log');
      if (!log) return [];
      return Array.from(log.querySelectorAll('.log-entry'))
        .map(el => el.textContent)
        .filter(t => t.includes('kava') || t.includes('Kava') || t.includes('KAVA'));
    });

    console.log('\n=== KAVA Event Log Entries ===');
    kavaLogEntries.forEach(e => console.log(' ', e));

    console.log('\n=== Analytics Requests ===');
    analyticsEvents.forEach((e, i) => {
      console.log(`  [${i}] eventType=${e.eventType} partnerId=${e.partnerId} idx=${e.eventIndex} threadId=${e.threadId?.substring(0, 8)}...`);
    });

    console.log('\n=== Analytics Responses ===');
    analyticsResponses.forEach((r, i) => {
      console.log(`  [${i}] status=${r.status} ok=${r.ok}`);
    });

    // ── Assertions ──

    // All responses should be HTTP 200
    expect(analyticsResponses.length).toBeGreaterThanOrEqual(5);
    for (const resp of analyticsResponses) {
      expect(resp.status).toBe(200);
      expect(resp.ok).toBe(true);
    }

    // Verify specific event types were sent
    const eventTypes = analyticsEvents.map(e => e.eventType);
    expect(eventTypes).toContain('80002'); // callStarted
    expect(eventTypes).toContain('80001'); // messageResponse
    expect(eventTypes).toContain('80003'); // callEnded
    expect(eventTypes).toContain('10003'); // pageLoad
    expect(eventTypes).toContain('10002'); // buttonClicked
    expect(eventTypes).toContain('80005'); // messageFeedback

    // Verify callStarted details
    const callStarted = analyticsEvents.find(e => e.eventType === '80002');
    expect(callStarted.partnerId).toBe(PARTNER_ID);
    expect(callStarted.sessionId).toBeTruthy();
    expect(callStarted.threadId).toBeTruthy();
    expect(callStarted.callId).toBeTruthy();
    expect(callStarted.eventIndex).toBe('1');
    expect(callStarted.agentId).toBeTruthy();
    expect(callStarted.genieId).toBeTruthy();

    // Verify messageResponse (avatar greeting)
    const msgResponse = analyticsEvents.find(e => e.eventType === '80001');
    expect(msgResponse.messageId).toBeTruthy();
    expect(msgResponse.experience).toBe('2'); // CALL experience for avatar-speech

    // Verify callEnded
    const callEnded = analyticsEvents.find(e => e.eventType === '80003');
    expect(callEnded.callId).toBe(callStarted.callId);
    expect(Number(callEnded.totalCallTime)).toBeGreaterThan(0);

    // Verify pageLoad
    const pageLoad = analyticsEvents.find(e => e.eventType === '10003');
    expect(pageLoad.pageName).toBe('DemoTestPage');

    // Verify buttonClicked
    const btnClick = analyticsEvents.find(e => e.eventType === '10002');
    expect(btnClick.buttonName).toBe('test-e2e-btn');

    // Verify messageFeedback
    const feedback = analyticsEvents.find(e => e.eventType === '80005');
    expect(feedback.messageId).toBe('1');

    // Verify event indices are sequential
    const indices = analyticsEvents.map(e => Number(e.eventIndex));
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBe(indices[i - 1] + 1);
    }

    // Verify all events share same session/thread
    const sessionIds = [...new Set(analyticsEvents.map(e => e.sessionId))];
    const threadIds = [...new Set(analyticsEvents.map(e => e.threadId))];
    expect(sessionIds.length).toBe(1);
    expect(threadIds.length).toBe(1);
  });

  test('Kaltura Report API confirms events were processed', async ({ request }) => {
    test.skip(!ADMIN_SECRET, 'KALTURA_ADMIN_SECRET env var required for report API test');
    test.setTimeout(30000);

    // Generate admin KS
    const ksResponse = await request.post(`${SERVICE_URL}/api_v3/service/session/action/start`, {
      form: {
        secret: ADMIN_SECRET,
        partnerId: PARTNER_ID,
        type: '2',
        userId: USER_ID,
        format: '1'
      }
    });
    const ks = (await ksResponse.text()).replace(/"/g, '');
    expect(ks.length).toBeGreaterThan(50);
    console.log(`Admin KS generated (${ks.length} chars)`);

    // Query last 7 days to account for pipeline delay
    const fromDate = Math.floor(Date.now() / 1000) - (7 * 86400);
    const toDate = Math.floor(Date.now() / 1000);

    // Report 80001: Highlights (messageResponse)
    const highlightsResp = await request.post(`${SERVICE_URL}/api_v3/service/report/action/getTotal`, {
      form: {
        ks,
        reportType: '80001',
        'reportInputFilter[fromDate]': String(fromDate),
        'reportInputFilter[toDate]': String(toDate),
        'reportInputFilter[objectType]': 'KalturaReportInputFilter',
        format: '1'
      }
    });
    const highlights = await highlightsResp.json();
    console.log('\n=== Report 80001 (Highlights) ===');
    console.log('  Header:', highlights.header);
    console.log('  Data:  ', highlights.data);
    expect(highlights.objectType).toBe('KalturaReportTotal');
    expect(highlights.header).toContain('messageResponse');

    // Parse highlights data
    const hlHeaders = highlights.header.split(',');
    const hlValues = highlights.data.split(',');
    const threadsIdx = hlHeaders.indexOf('unique_threads');
    const msgIdx = hlHeaders.indexOf('messageResponse');
    if (hlValues[threadsIdx]) {
      const uniqueThreads = Number(hlValues[threadsIdx]);
      const messageCount = Number(hlValues[msgIdx]);
      console.log(`  → ${uniqueThreads} unique threads, ${messageCount} messages`);
      expect(uniqueThreads).toBeGreaterThan(0);
      expect(messageCount).toBeGreaterThan(0);
    }

    // Report 80005: Avatar Sessions (callStarted)
    const sessionsResp = await request.post(`${SERVICE_URL}/api_v3/service/report/action/getTotal`, {
      form: {
        ks,
        reportType: '80005',
        'reportInputFilter[fromDate]': String(fromDate),
        'reportInputFilter[toDate]': String(toDate),
        'reportInputFilter[objectType]': 'KalturaReportInputFilter',
        format: '1'
      }
    });
    const sessions = await sessionsResp.json();
    console.log('\n=== Report 80005 (Avatar Sessions) ===');
    console.log('  Header:', sessions.header);
    console.log('  Data:  ', sessions.data);
    expect(sessions.objectType).toBe('KalturaReportTotal');
    expect(sessions.header).toContain('callStarted');

    const sessHeaders = sessions.header.split(',');
    const sessValues = sessions.data.split(',');
    const callIdx = sessHeaders.indexOf('callStarted');
    if (sessValues[callIdx]) {
      const callCount = Number(sessValues[callIdx]);
      console.log(`  → ${callCount} calls started`);
      expect(callCount).toBeGreaterThan(0);
    }

    // Report 80002: Messages Overtime
    const msgOvertimeResp = await request.post(`${SERVICE_URL}/api_v3/service/report/action/getTotal`, {
      form: {
        ks,
        reportType: '80002',
        'reportInputFilter[fromDate]': String(fromDate),
        'reportInputFilter[toDate]': String(toDate),
        'reportInputFilter[objectType]': 'KalturaReportInputFilter',
        format: '1'
      }
    });
    const msgOvertime = await msgOvertimeResp.json();
    console.log('\n=== Report 80002 (Messages Overtime) ===');
    console.log('  Header:', msgOvertime.header);
    console.log('  Data:  ', msgOvertime.data);
    expect(msgOvertime.objectType).toBe('KalturaReportTotal');

    // Report 80006: Experience Types (Chat vs Call breakdown)
    const expResp = await request.post(`${SERVICE_URL}/api_v3/service/report/action/getTotal`, {
      form: {
        ks,
        reportType: '80006',
        'reportInputFilter[fromDate]': String(fromDate),
        'reportInputFilter[toDate]': String(toDate),
        'reportInputFilter[objectType]': 'KalturaReportInputFilter',
        format: '1'
      }
    });
    const expTypes = await expResp.json();
    console.log('\n=== Report 80006 (Experience Types) ===');
    console.log('  Header:', expTypes.header);
    console.log('  Data:  ', expTypes.data);
    expect(expTypes.objectType).toBe('KalturaReportTotal');

    // Report 80003: Message Feedback
    const feedbackResp = await request.post(`${SERVICE_URL}/api_v3/service/report/action/getTotal`, {
      form: {
        ks,
        reportType: '80003',
        'reportInputFilter[fromDate]': String(fromDate),
        'reportInputFilter[toDate]': String(toDate),
        'reportInputFilter[objectType]': 'KalturaReportInputFilter',
        format: '1'
      }
    });
    const feedback = await feedbackResp.json();
    console.log('\n=== Report 80003 (Message Feedback) ===');
    console.log('  Header:', feedback.header);
    console.log('  Data:  ', feedback.data);
    expect(feedback.objectType).toBe('KalturaReportTotal');

    // Daily breakdown table (last 7 days)
    const tableResp = await request.post(`${SERVICE_URL}/api_v3/service/report/action/getTable`, {
      form: {
        ks,
        reportType: '80001',
        'reportInputFilter[fromDate]': String(fromDate),
        'reportInputFilter[toDate]': String(toDate),
        'reportInputFilter[objectType]': 'KalturaReportInputFilter',
        'pager[pageSize]': '10',
        'pager[pageIndex]': '1',
        'pager[objectType]': 'KalturaFilterPager',
        format: '1'
      }
    });
    const table = await tableResp.json();
    console.log('\n=== Report Table (Daily Breakdown) ===');
    console.log('  Header:', table.header);
    if (table.data) {
      const rows = table.data.split(';').filter(Boolean);
      console.log(`  → ${rows.length} days with data`);
      rows.forEach(r => console.log('    ', r));
      expect(rows.length).toBeGreaterThan(0);
    }

    console.log('\n✓ All Kaltura Report API queries returned valid data');
  });

});
