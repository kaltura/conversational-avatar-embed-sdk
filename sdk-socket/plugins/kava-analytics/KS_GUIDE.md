# Kaltura Session (KS) Guide for the Analytics Plugin

This document explains what Kaltura Session token the hosting app must provide to the analytics plugin, how to generate it, and what the analytics server does with it.

---

## TL;DR

```javascript
// 1. Generate a Widget KS (server-side or client-side)
const ks = await startWidgetSession(partnerId);

// 2. Pass it to the plugin
const kava = new KalturaAvatarAnalytics(sdk, {
  ks: ks,
  partnerId: YOUR_PARTNER_ID
});

// 3. If it expires mid-session, refresh it
kava.setKS(freshKs);
```

---

## What Type of KS to Use

**Use a Widget Session KS.** This is the standard Kaltura pattern for client-side analytics (used by the Kaltura Player, Genie, and all embed widgets).

| KS Type | Type Value | Appropriate? | Why |
|---------|-----------|--------------|-----|
| **Widget Session** | 0 + `widget:1` privilege | **Yes (recommended)** | Anonymous, read-only, no secrets exposed to client, never invalidated by server |
| User Session | 0 with userId | Yes (optional) | Works if your app already has one; adds user attribution |
| Admin Session | 2 | **No** | Requires admin secret; never send to client |

A Widget Session is actually a type-0 (USER) session with `userId=0` (anonymous) and privileges `view:*,widget:1`. It requires no secret client-side — only a public widget ID.

---

## How to Generate the KS

### Option A: Client-Side (Simple)

Call Kaltura's `startWidgetSession` API directly from the browser. No authentication required.

```javascript
async function getWidgetKS(partnerId) {
  const response = await fetch(
    'https://cdnapisec.kaltura.com/api_v3/service/session/action/startWidgetSession?format=1',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ widgetId: `_${partnerId}` })
    }
  );
  const data = await response.json();
  return data.ks;
}

// Usage
const ks = await getWidgetKS(YOUR_PARTNER_ID);
const kava = new KalturaAvatarAnalytics(sdk, { ks, partnerId: YOUR_PARTNER_ID });
```

**Widget ID format:** `_<partnerId>` (underscore prefix + your numeric partner ID). Example: partner `12345` → widget ID `_12345`.

**Alternative widget ID:** If you have a specific widget configured in KMC (Kaltura Management Console), use its ID directly (e.g., `1_abc12xyz`). This provides scoped privileges from the widget configuration.

### Option B: Server-Side (Recommended for Production)

Generate the KS on your backend and pass it to the frontend. This keeps your KS generation logic centralized and allows embedding custom privileges.

```javascript
// Node.js backend example using Kaltura client library
const kaltura = require('kaltura-client');
const config = new kaltura.Configuration();
config.serviceUrl = 'https://www.kaltura.com';
const client = new kaltura.Client(config);

// Option 1: Widget session (anonymous, no secret needed server-side either)
const result = await kaltura.services.session.startWidgetSession(`_${partnerId}`)
  .execute(client);
const ks = result.ks;

// Option 2: User session with custom privileges (needs admin secret)
const ks = await kaltura.services.session.start(
  adminSecret,
  userId,         // e.g., 'user@example.com' or '0' for anonymous
  0,              // type: USER
  partnerId,
  86400,          // expiry: 24 hours
  'view:*,widget:1,virtualeventid:YOUR_EVENT_ID'  // privileges
).execute(client);
```

### Option C: REST API (Any Backend)

```
POST https://www.kaltura.com/api_v3/service/session/action/startWidgetSession
Content-Type: application/json

{
  "widgetId": "_YOUR_PARTNER_ID",
  "format": 1
}
```

Response:
```json
{
  "ks": "djJ8XXXXXXXX...",
  "partnerId": 12345,
  "userId": 0,
  "objectType": "KalturaStartWidgetSessionResponse"
}
```

---

## What the Analytics Server Does With the KS

The KAVA enrichment server (`analytics.kaltura.com`) processes the KS as follows:

### 1. Partner ID Extraction (Fast Path)
The server extracts `partnerId` from the KS via base64 decode (no decryption needed). KS v2 format after decode: `v2|<partnerId>|<encrypted_payload>`.

### 2. KS Decryption and Signature Verification
Using the partner's admin secret (synced from the main Kaltura server), the analytics server:
- AES-decrypts the KS payload (for v2 tokens, prefix `djJ|`)
- Verifies the SHA1 hash signature

If decryption fails, the event is **still processed** — just without KS-derived enrichment.

### 3. Privilege Extraction
If decryption succeeds, the server extracts these fields from the KS privileges string:

| KS Privilege | Output Field | Overrides Param? |
|---|---|---|
| `virtualeventid:<id>` | `virtualEventId` | Yes — KS value takes priority over request param |
| `agentid:<id>` | `agentId` | Yes — KS value takes priority |
| `genieid:<id>` | `genieId` | Yes — KS value takes priority |
| `preview:true` | `preview` | Yes |

### 4. Server-Side Enrichment Adds
After KS parsing, the server enriches the event with:
- Partner metadata (crmId, vertical, serviceEdition, accountType)
- `kuserId` resolution from the userId field
- Enum mapping (experience→Chat/Call, responseType→Text/Flashcard)
- Output to Kafka topic `enriched-immersive-agents-events` (partitioned by threadId)

---

## What Validation the Server Performs

### Does NOT cause rejection:
| Check | Result |
|-------|--------|
| **Expired KS** | Accepted — server does not check `valid_until` |
| **Invalid/malformed KS** | Event still processed (without enrichment) |
| **Empty KS** | Event still processed (no enrichment) |
| **Wrong KS type** | Accepted — any type (0, 2) works |
| **Widget session invalidation** | Skipped — widget sessions are exempt: `if ($this->isWidgetSession()) return self::OK` |

### DOES cause rejection:
| Check | Result |
|-------|--------|
| Missing `eventType` | Event rejected |
| Invalid `eventType` (not 80001/80002/80003/80005) | Event rejected |
| Missing or non-numeric `partnerId` | Event rejected |
| Blocked partner (server-side bitmap) | Event rejected |

**Bottom line:** The `ks` field is optional for event delivery but required for enrichment (virtualEventId extraction, partner metadata, user attribution). The plugin requires it because enrichment data is valuable for analytics dashboards.

---

## KS Privileges for Avatar Analytics

### Minimal (anonymous analytics — most common)

```
view:*,widget:1
```

This is what `startWidgetSession` generates by default. Sufficient for all basic analytics reporting.

### With Virtual Event ID (for virtual event tracking)

```
view:*,widget:1,virtualeventid:YOUR_EVENT_ID
```

Embeds a virtual event context. The server extracts this and adds it to all events, enabling per-event analytics filtering in dashboards.

### With All Avatar Privileges (embedded enrichment)

```
view:*,widget:1,virtualeventid:YOUR_EVENT_ID,agentid:YOUR_AGENT_ID,genieid:YOUR_CLIENT_ID
```

Embeds agentId and genieId directly in the KS. The server will use these values (overriding any explicit params). This is useful if you want server-authoritative identity rather than trusting client-supplied params.

**Note:** For the Avatar SDK plugin, `agentId` and `genieId` are auto-read from `sdk.getFlowId()` and `sdk.getClientId()` and sent as explicit params. Embedding them in the KS is optional — it only matters if you need server-side override authority.

---

## KS Lifecycle and Refresh

### Expiry
- Default widget KS expiry: **24 hours** (86400 seconds)
- Analytics server does not reject expired KS, but some future server changes might
- For long-running sessions (kiosk, always-on display), plan for refresh

### When to Refresh
- If your session lasts longer than the KS TTL
- If you regenerate the KS for other purposes (e.g., video player refresh)
- If you get HTTP errors from `analytics.kaltura.com` (rare but possible with very old KS)

### How to Refresh
```javascript
const freshKs = await getWidgetKS(partnerId);
kava.setKS(freshKs);
// All subsequent events will use the new KS
```

### No Automatic Refresh
The plugin **never** generates, refreshes, or validates the KS. This is the app's responsibility. This matches the pattern used by `playkit-js-kava` (the Kaltura Player's analytics plugin) and `unisphere-class-genie` (Kaltura's production avatar app).

---

## Complete Integration Example

```javascript
// ── KS Generation (client-side for simplicity) ──
const PARTNER_ID = YOUR_PARTNER_ID;

async function initAnalytics(sdk) {
  // Get widget KS
  const res = await fetch(
    'https://cdnapisec.kaltura.com/api_v3/service/session/action/startWidgetSession?format=1',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ widgetId: `_${PARTNER_ID}` })
    }
  );
  const { ks } = await res.json();

  // Attach analytics plugin
  const kava = new KalturaAvatarAnalytics(sdk, {
    ks: ks,
    partnerId: PARTNER_ID,
    hostingApp: 'my-avatar-app',
    hostingAppVer: '1.0.0'
  });

  // Optional: refresh KS every 20 hours (before 24h expiry)
  setInterval(async () => {
    const refresh = await fetch(
      'https://cdnapisec.kaltura.com/api_v3/service/session/action/startWidgetSession?format=1',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ widgetId: `_${PARTNER_ID}` })
      }
    );
    const { ks: freshKs } = await refresh.json();
    kava.setKS(freshKs);
  }, 20 * 60 * 60 * 1000); // 20 hours

  return kava;
}
```

---

## Security Considerations

| Concern | Assessment |
|---------|------------|
| Can someone steal the KS and replay events? | Widget KS is anonymous and read-only (`view:*`). An attacker could only report analytics events for your partner — they cannot access or modify content. Rate limiting on the analytics endpoint mitigates abuse. |
| Does the KS expose sensitive data? | No. Widget KS contains: partnerId, expiry, and `view:*,widget:1` privileges. No user data, no secrets. |
| Should I use HTTPS for `startWidgetSession`? | Yes — use `cdnapisec.kaltura.com` (HTTPS) not `cdnapi.kaltura.com` (HTTP). |
| Can the KS be intercepted in transit? | The KS is sent via HTTPS POST to `analytics.kaltura.com`. In-transit interception requires MITM on TLS. |
| Should I generate KS server-side? | For production apps, yes — it's cleaner and allows embedding custom privileges. For prototypes and demos, client-side generation is fine. |

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Events arrive but `virtualEventId` is empty in dashboards | KS doesn't contain `virtualeventid` privilege | Embed it in the KS privileges string, or pass it as explicit param (if server supports it for your event type) |
| HTTP 200 but no data in reports | `partnerId` mismatch between KS and explicit param | Ensure `config.partnerId` matches the partner ID in the KS |
| `startWidgetSession` returns error | Invalid widget ID format | Use `_<partnerId>` format (underscore + numeric partner ID) |
| KS extraction warning in server logs | Malformed or corrupted KS string | Regenerate — don't modify the KS string after receiving it |

---

## Reference: KS Structure

A Kaltura Session v2 token (prefix `djJ|`) contains:

```
Base64Encode(
  "v2" | partnerId | AES_CBC_Encrypt(
    SHA1(payload) | payload
  )
)

Where payload = partnerId;partnerId;validUntil;type;expiry;userId;privileges;masterPartnerId;additionalData
```

The analytics server decodes this to extract: `partnerId`, `userId`, `type`, `privileges`, `valid_until`.
