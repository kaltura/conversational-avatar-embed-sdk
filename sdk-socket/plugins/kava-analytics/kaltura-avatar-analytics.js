/**
 * Kaltura Avatar Analytics (KAVA Plugin)
 * Optional analytics plugin for the Kaltura Avatar SDK (Socket)
 *
 * Reports Immersive Agent events (callStarted, callEnded, messageResponse, messageFeedback)
 * and standard KAVA events (pageView, buttonClick) to Kaltura's analytics endpoint.
 *
 * @license MIT
 * @version 1.0.0
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KalturaAvatarAnalytics = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // CONSTANTS
  // ═══════════════════════════════════════════════════════════════════════════

  const VERSION = '1.0.0';

  const EventType = Object.freeze({
    MESSAGE_RESPONSE: 80001,
    CALL_STARTED: 80002,
    CALL_ENDED: 80003,
    MESSAGE_FEEDBACK: 80005,
    BUTTON_CLICKED: 10002,
    PAGE_LOAD: 10003
  });

  const ExperienceType = Object.freeze({
    CHAT: 1,
    CALL: 2
  });

  const ResponseType = Object.freeze({
    TEXT: 1,
    FLASHCARD: 2
  });

  const ReactionType = Object.freeze({
    LIKE: 1,
    DISLIKE: 2
  });

  const ContextType = Object.freeze({
    ENTRY: 1,
    CHANNEL: 2,
    GLOBAL: 3
  });

  const Defaults = Object.freeze({
    SERVICE_URL: 'https://analytics.kaltura.com/api_v3/index.php',
    REQUEST_METHOD: 'POST',
    MAX_TEXT_LENGTH: 50
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITY
  // ═══════════════════════════════════════════════════════════════════════════

  function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function encodeReferrer() {
    try {
      const ref = document.referrer || document.location.href;
      return btoa(ref).slice(0, 256);
    } catch (e) {
      return '';
    }
  }

  function truncate(str, maxLen) {
    if (!str) return '';
    const s = String(str);
    return s.length > maxLen ? s.slice(0, maxLen) : s;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SESSION TRACKER
  // ═══════════════════════════════════════════════════════════════════════════

  class SessionTracker {
    constructor() {
      this.sessionId = generateUUID();
      this.threadId = generateUUID();
      this.callId = generateUUID();
      this.eventIndex = 1;
      this.callStartTime = null;
      this._messageCounter = 0;
    }

    startCall() {
      this.callStartTime = Date.now();
    }

    getCallDuration() {
      if (!this.callStartTime) return 0;
      return Math.round((Date.now() - this.callStartTime) / 1000);
    }

    nextMessageId() {
      this._messageCounter++;
      return String(this._messageCounter);
    }

    incrementIndex() {
      this.eventIndex++;
    }

    resetForReconnect() {
      this.threadId = generateUUID();
      this.callId = generateUUID();
      this.eventIndex = 1;
      this.callStartTime = null;
      this._messageCounter = 0;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSPORT LAYER
  // ═══════════════════════════════════════════════════════════════════════════

  class TransportLayer {
    constructor(serviceUrl, requestMethod, debug) {
      this._url = serviceUrl;
      this._method = requestMethod;
      this._debug = debug;
    }

    _buildBody(params) {
      const body = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
          body.append(key, String(value));
        }
      }
      return body;
    }

    send(params) {
      const body = this._buildBody(params);
      if (this._debug) {
        console.debug('[KavaAnalytics] send:', Object.fromEntries(body));
      }
      return fetch(this._url, {
        method: this._method,
        body: body,
        keepalive: true
      }).then(response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response;
      });
    }

    sendBeacon(params) {
      const body = this._buildBody(params);
      if (this._debug) {
        console.debug('[KavaAnalytics] beacon:', Object.fromEntries(body));
      }
      return navigator.sendBeacon(this._url, body);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT BUILDER
  // ═══════════════════════════════════════════════════════════════════════════

  class EventBuilder {
    constructor(config, session) {
      this._config = config;
      this._session = session;
      this._contextId = '';
      this._entryId = '';
      this._contextType = '';
      this._metadata = {};
    }

    _commonParams(eventType) {
      const params = {
        service: 'analytics',
        action: 'trackEvent',
        eventType: eventType,
        partnerId: String(this._config.partnerId),
        ks: this._config.ks,
        sessionId: this._session.sessionId,
        threadId: this._session.threadId,
        eventIndex: this._session.eventIndex,
        clientVer: 'avatar-analytics:' + VERSION,
        referrer: encodeReferrer()
      };

      if (this._config.clientTag) params.clientTag = this._config.clientTag;
      if (this._config.hostingApp) params.hostingKalturaApplication = this._config.hostingApp;
      if (this._config.hostingAppVer) params.hostingKalturaApplicationVer = this._config.hostingAppVer;
      if (this._config.agentId) params.agentId = this._config.agentId;
      if (this._config.genieId) params.genieId = this._config.genieId;
      if (this._config.userId) params.userId = this._config.userId;
      if (this._contextId) params.contextId = truncate(this._contextId, Defaults.MAX_TEXT_LENGTH);
      if (this._entryId) params.entryId = this._entryId;
      if (this._contextType) params.contextType = this._contextType;

      for (const [key, value] of Object.entries(this._metadata)) {
        params[key] = truncate(String(value), Defaults.MAX_TEXT_LENGTH);
      }

      return params;
    }

    callStarted() {
      const params = this._commonParams(EventType.CALL_STARTED);
      params.callId = this._session.callId;
      return params;
    }

    callEnded(totalCallTime) {
      const params = this._commonParams(EventType.CALL_ENDED);
      params.callId = this._session.callId;
      params.totalCallTime = totalCallTime;
      return params;
    }

    messageResponse(messageId, experience, responseType, sources) {
      const params = this._commonParams(EventType.MESSAGE_RESPONSE);
      params.messageId = messageId;
      if (experience) params.experience = experience;
      if (responseType) params.responseType = responseType;
      if (sources && sources.length) params.sources = sources.join(',');
      return params;
    }

    messageFeedback(messageId, reactionType) {
      const params = this._commonParams(EventType.MESSAGE_FEEDBACK);
      params.messageId = messageId;
      params.reactionType = reactionType;
      return params;
    }

    pageLoad(pageName, pageType) {
      const params = this._commonParams(EventType.PAGE_LOAD);
      if (pageName) params.pageName = truncate(pageName, Defaults.MAX_TEXT_LENGTH);
      if (pageType) params.pageType = pageType;
      params.feature = 'Avatar';
      params.customId1 = this._session.threadId;
      return params;
    }

    buttonClicked(buttonName, buttonType, buttonValue) {
      const params = this._commonParams(EventType.BUTTON_CLICKED);
      if (buttonName) params.buttonName = truncate(buttonName, Defaults.MAX_TEXT_LENGTH);
      if (buttonType) params.buttonType = buttonType;
      if (buttonValue) params.buttonValue = truncate(buttonValue, Defaults.MAX_TEXT_LENGTH);
      params.feature = 'Avatar';
      params.customId1 = this._session.threadId;
      return params;
    }

    setContextId(id) { this._contextId = id; }
    setEntryId(id) { this._entryId = id; }
    setContextType(type) { this._contextType = type; }
    setMetadata(key, value) { this._metadata[key] = value; }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PLUGIN EMITTER
  // ═══════════════════════════════════════════════════════════════════════════

  class PluginEmitter {
    constructor() {
      this._listeners = {};
    }

    on(event, fn) {
      if (!this._listeners[event]) this._listeners[event] = [];
      this._listeners[event].push(fn);
      return () => this.off(event, fn);
    }

    off(event, fn) {
      const list = this._listeners[event];
      if (!list) return;
      const idx = list.indexOf(fn);
      if (idx !== -1) list.splice(idx, 1);
    }

    emit(event, data) {
      const list = this._listeners[event];
      if (!list) return;
      for (const fn of list) {
        try { fn(data); } catch (e) { /* swallow listener errors */ }
      }
    }

    removeAll() {
      this._listeners = {};
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN PLUGIN CLASS
  // ═══════════════════════════════════════════════════════════════════════════

  class KalturaAvatarAnalytics {
    constructor(sdk, config) {
      if (!sdk || typeof sdk.on !== 'function') {
        throw new Error('[KavaAnalytics] First argument must be a KalturaAvatarSDK instance');
      }
      if (!config || !config.ks) {
        throw new Error('[KavaAnalytics] config.ks is required');
      }
      if (!config.partnerId) {
        throw new Error('[KavaAnalytics] config.partnerId is required');
      }

      this._sdk = sdk;
      this._destroyed = false;
      this._callActive = false;
      this._stats = { eventsSent: 0, errors: 0, messageCount: 0 };

      this._config = {
        ks: config.ks,
        partnerId: config.partnerId,
        agentId: config.agentId || (sdk.getFlowId ? sdk.getFlowId() : ''),
        genieId: config.genieId || (sdk.getClientId ? sdk.getClientId() : ''),
        clientTag: config.clientTag || '',
        hostingApp: config.hostingApp || '',
        hostingAppVer: config.hostingAppVer || '',
        serviceUrl: config.serviceUrl || Defaults.SERVICE_URL,
        requestMethod: config.requestMethod || Defaults.REQUEST_METHOD,
        userId: config.userId || '',
        autoStart: config.autoStart !== false,
        autoEnd: config.autoEnd !== false,
        autoMessages: config.autoMessages !== false,
        beaconOnUnload: config.beaconOnUnload !== false,
        tamperHandler: config.tamperHandler || null,
        debug: config.debug || false
      };

      this._session = new SessionTracker();
      this._transport = new TransportLayer(this._config.serviceUrl, this._config.requestMethod, this._config.debug);
      this._builder = new EventBuilder(this._config, this._session);
      this._emitter = new PluginEmitter();
      this._unsubscribers = [];

      this._bindSDKEvents();
      this._bindUnload();

      // If SDK is already in-conversation, fire callStarted immediately
      if (this._config.autoStart && sdk.getState && sdk.getState() === 'in-conversation') {
        this._handleCallStarted();
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SDK EVENT BINDINGS
    // ─────────────────────────────────────────────────────────────────────────

    _bindSDKEvents() {
      const sdk = this._sdk;

      if (this._config.autoStart) {
        this._unsubscribers.push(sdk.on('ready', () => this._handleCallStarted()));
      }

      if (this._config.autoEnd) {
        this._unsubscribers.push(sdk.on('disconnected', () => this._handleCallEnded(false)));
        this._unsubscribers.push(sdk.on('destroyed', () => this._handleCallEnded(false)));
      }

      if (this._config.autoMessages) {
        this._unsubscribers.push(sdk.on('avatar-speech', (data) => this._handleAvatarSpeech(data)));
        this._unsubscribers.push(sdk.on('user-speech', (data) => this._handleUserSpeech(data)));
      }

      this._unsubscribers.push(sdk.on('reconnected', () => this._handleReconnect()));
    }

    _bindUnload() {
      if (!this._config.beaconOnUnload) return;
      this._visibilityHandler = () => {
        if (document.visibilityState === 'hidden' && this._callActive && !this._destroyed) {
          this._handleCallEnded(true);
        }
      };
      document.addEventListener('visibilitychange', this._visibilityHandler);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INTERNAL EVENT HANDLERS
    // ─────────────────────────────────────────────────────────────────────────

    _handleCallStarted() {
      if (this._destroyed || this._callActive) return;
      this._callActive = true;
      this._session.startCall();
      const params = this._builder.callStarted();
      this._dispatch(params);
    }

    _handleCallEnded(useBeacon) {
      if (this._destroyed || !this._callActive) return;
      this._callActive = false;
      const duration = this._session.getCallDuration();
      const params = this._builder.callEnded(duration);
      if (useBeacon) {
        this._dispatchBeacon(params);
      } else {
        this._dispatch(params);
      }
    }

    _handleAvatarSpeech(data) {
      if (this._destroyed || !this._callActive) return;
      const text = data && data.text;
      if (!text) return;
      const messageId = this._session.nextMessageId();
      const params = this._builder.messageResponse(messageId, ExperienceType.CALL, ResponseType.TEXT);
      this._stats.messageCount++;
      this._dispatch(params);
    }

    _handleUserSpeech(data) {
      if (this._destroyed || !this._callActive) return;
      if (!data || !data.isFinal) return;
      const messageId = this._session.nextMessageId();
      const params = this._builder.messageResponse(messageId, ExperienceType.CHAT);
      this._stats.messageCount++;
      this._dispatch(params);
    }

    _handleReconnect() {
      if (this._destroyed) return;
      if (this._callActive) {
        const duration = this._session.getCallDuration();
        const params = this._builder.callEnded(duration);
        this._dispatch(params);
      }
      this._callActive = false;
      this._session.resetForReconnect();
      this._handleCallStarted();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DISPATCH
    // ─────────────────────────────────────────────────────────────────────────

    _dispatch(params) {
      if (this._config.tamperHandler) {
        const shouldSend = this._config.tamperHandler(params);
        if (shouldSend === false) return;
      }

      this._session.incrementIndex();

      this._transport.send(params).then(() => {
        this._stats.eventsSent++;
        this._emitter.emit('sent', { eventType: params.eventType, params });
      }).catch((err) => {
        this._stats.errors++;
        this._emitter.emit('error', { eventType: params.eventType, error: err });
      });
    }

    _dispatchBeacon(params) {
      if (this._config.tamperHandler) {
        const shouldSend = this._config.tamperHandler(params);
        if (shouldSend === false) return;
      }

      this._session.incrementIndex();
      const sent = this._transport.sendBeacon(params);

      if (sent) {
        this._stats.eventsSent++;
        this._emitter.emit('sent', { eventType: params.eventType, params });
      } else {
        this._stats.errors++;
        this._emitter.emit('error', { eventType: params.eventType, error: new Error('sendBeacon failed') });
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PUBLIC API — MANUAL EVENTS
    // ─────────────────────────────────────────────────────────────────────────

    sendFeedback(messageId, reaction) {
      if (this._destroyed) return;
      const reactionCode = reaction === 'like' ? ReactionType.LIKE : ReactionType.DISLIKE;
      const params = this._builder.messageFeedback(messageId, reactionCode);
      this._dispatch(params);
    }

    pageView(pageName, pageType) {
      if (this._destroyed) return;
      const params = this._builder.pageLoad(pageName, pageType);
      this._dispatch(params);
    }

    buttonClick(name, value, context) {
      if (this._destroyed) return;
      const params = this._builder.buttonClicked(name, context, value);
      this._dispatch(params);
    }

    customEvent(eventType, extraFields) {
      if (this._destroyed) return;
      const params = this._builder._commonParams(eventType);
      if (extraFields) {
        for (const [key, val] of Object.entries(extraFields)) {
          params[key] = val;
        }
      }
      this._dispatch(params);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PUBLIC API — STATE MANAGEMENT
    // ─────────────────────────────────────────────────────────────────────────

    setContextId(id) { this._builder.setContextId(id); }
    setEntryId(id) { this._builder.setEntryId(id); }
    setContextType(type) { this._builder.setContextType(type); }
    setMetadata(key, value) { this._builder.setMetadata(key, value); }

    setKS(ks) {
      this._config.ks = ks;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PUBLIC API — OBSERVABILITY
    // ─────────────────────────────────────────────────────────────────────────

    on(event, handler) { return this._emitter.on(event, handler); }
    off(event, handler) { this._emitter.off(event, handler); }

    getStats() {
      return {
        eventsSent: this._stats.eventsSent,
        errors: this._stats.errors,
        messageCount: this._stats.messageCount,
        callDuration: this._session.getCallDuration(),
        threadId: this._session.threadId,
        sessionId: this._session.sessionId
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LIFECYCLE
    // ─────────────────────────────────────────────────────────────────────────

    destroy() {
      if (this._destroyed) return;

      if (this._callActive) {
        this._callActive = false;
        const duration = this._session.getCallDuration();
        const params = this._builder.callEnded(duration);
        this._dispatch(params);
      }

      this._destroyed = true;

      for (const unsub of this._unsubscribers) {
        try { unsub(); } catch (e) { /* SDK may already be destroyed */ }
      }
      this._unsubscribers = [];

      if (this._visibilityHandler) {
        document.removeEventListener('visibilitychange', this._visibilityHandler);
        this._visibilityHandler = null;
      }

      this._emitter.removeAll();
    }
  }

  // Static references
  KalturaAvatarAnalytics.VERSION = VERSION;
  KalturaAvatarAnalytics.EventType = EventType;
  KalturaAvatarAnalytics.ExperienceType = ExperienceType;
  KalturaAvatarAnalytics.ResponseType = ResponseType;
  KalturaAvatarAnalytics.ReactionType = ReactionType;
  KalturaAvatarAnalytics.ContextType = ContextType;

  return KalturaAvatarAnalytics;
}));
