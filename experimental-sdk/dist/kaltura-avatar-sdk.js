/**
 * Kaltura Avatar SDK v2 (Experimental)
 * Direct Socket.IO + WebRTC — No iframe required
 *
 * @license MIT
 * @version 2.0.0-experimental.1
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KalturaAvatarSDK = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // CONSTANTS
  // ═══════════════════════════════════════════════════════════════════════════

  const VERSION = '2.0.0-experimental.1';

  const State = Object.freeze({
    UNINITIALIZED: 'uninitialized',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    JOINING: 'joining',
    JOINED: 'joined',
    IN_CONVERSATION: 'in-conversation',
    ENDED: 'ended',
    ERROR: 'error',
    DESTROYED: 'destroyed'
  });

  const Events = Object.freeze({
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    READY: 'ready',
    DISCONNECTED: 'disconnected',
    DESTROYED: 'destroyed',
    STATE_CHANGE: 'state-change',
    ERROR: 'error',

    AVATAR_SPEAKING_START: 'avatar-speaking-start',
    AVATAR_SPEECH: 'avatar-speech',
    AVATAR_SPEAKING_END: 'avatar-speaking-end',

    USER_SPEECH: 'user-speech',

    VIDEO_READY: 'video-ready',
    AUDIO_FALLBACK: 'audio-fallback',
    MIC_GRANTED: 'mic-granted',
    MIC_DENIED: 'mic-denied',

    GENUI: 'genui',
    CONTACT_COLLECTION: 'contact-collection',
    COMMAND_MATCHED: 'command-matched',
    TRANSCRIPT_ENTRY: 'transcript-entry',

    RECONNECTING: 'reconnecting',
    RECONNECTED: 'reconnected',

    // v1 compatibility aliases
    SHOWING_AGENT: 'showing-agent',
    AGENT_TALKED: 'agent-talked',
    USER_TRANSCRIPTION: 'user-transcription',
    CONVERSATION_ENDED: 'conversation-ended'
  });

  const ErrorCode = Object.freeze({
    CONNECTION_FAILED: 1001,
    CONNECTION_TIMEOUT: 1002,
    CONNECTION_LOST: 1003,
    JOIN_FAILED: 1004,
    FLOW_CONFIG_ERROR: 1005,

    MIC_PERMISSION_DENIED: 2001,
    MIC_NOT_AVAILABLE: 2002,
    WHEP_NEGOTIATION_FAILED: 2003,
    WEBRTC_FAILED: 2004,
    VIDEO_PLAYBACK_FAILED: 2005,

    INVALID_STATE: 3001,
    ALREADY_DESTROYED: 3003,

    SESSION_EXPIRED: 4002,
    CONVERSATION_TIME_EXPIRED: 4003,

    INVALID_CONFIG: 5001,
    CONTAINER_NOT_FOUND: 5002,
    INVALID_DPP_JSON: 5003
  });

  const DEFAULTS = Object.freeze({
    SOCKET_URL: 'https://conversation.avatar.us.kaltura.ai',
    SOCKET_PATH: '/socket.io',
    WHEP_URL: 'https://srs.avatar.us.kaltura.ai',
    TURN_HOST: 'turn.avatar.us.kaltura.ai',
    TURNS_HOST: 'turns.avatar.us.kaltura.ai',
    TURN_USERNAME: 'kaltura',
    TURN_CREDENTIAL: 'avatar',
    CONNECTION_TIMEOUT: 15000,
    RECONNECT_BASE_DELAY: 1000,
    MAX_RECONNECT_ATTEMPTS: 5,
    DPP_DEBOUNCE_MS: 200,
    ICE_GATHER_TIMEOUT: 3000,
    PEER_NAME: 'SDKUser'
  });

  const VALID_TRANSITIONS = {
    [State.UNINITIALIZED]: [State.CONNECTING, State.DESTROYED],
    [State.CONNECTING]: [State.CONNECTED, State.ERROR, State.DESTROYED],
    [State.CONNECTED]: [State.JOINING, State.ERROR, State.DESTROYED],
    [State.JOINING]: [State.JOINED, State.ERROR, State.DESTROYED],
    [State.JOINED]: [State.IN_CONVERSATION, State.ERROR, State.DESTROYED],
    [State.IN_CONVERSATION]: [State.ENDED, State.ERROR, State.DESTROYED],
    [State.ENDED]: [State.CONNECTING, State.DESTROYED],
    [State.ERROR]: [State.CONNECTING, State.DESTROYED]
  };

  const GENUI_EVENTS = [
    'showMedia', 'showHtml', 'showCode', 'showDiagram', 'showChart',
    'showIFrame', 'showLatex', 'showGeneratedImages', 'showVisualChart',
    'showVisualItems', 'showVisualLink', 'showVisualPhoto',
    'showVisualTable', 'showVisualVideo'
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // ERROR CLASS
  // ═══════════════════════════════════════════════════════════════════════════

  class AvatarError extends Error {
    constructor(code, message, options = {}) {
      super(message);
      this.name = 'AvatarError';
      this.code = code;
      this.recoverable = options.recoverable !== false;
      this.context = options.context || null;
      this.timestamp = new Date();
      if (options.cause) this.cause = options.cause;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════

  function generateId(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const values = crypto.getRandomValues(new Uint8Array(length));
    for (let i = 0; i < length; i++) {
      result += chars[values[i] % chars.length];
    }
    return result;
  }

  function withTimeout(promise, ms, label) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new AvatarError(ErrorCode.CONNECTION_TIMEOUT, `${label} timed out after ${ms}ms`, { recoverable: true }));
      }, ms);
      promise.then(
        (val) => { clearTimeout(timer); resolve(val); },
        (err) => { clearTimeout(timer); reject(err); }
      );
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LOGGER
  // ═══════════════════════════════════════════════════════════════════════════

  class Logger {
    constructor(namespace, enabled) {
      this._ns = namespace;
      this._enabled = enabled;
    }

    _format(level, msg, data) {
      const ts = new Date().toISOString();
      const prefix = `[${ts}] [${this._ns}] ${level}:`;
      return data !== undefined ? [prefix, msg, data] : [prefix, msg];
    }

    debug(msg, data) {
      if (!this._enabled) return;
      console.debug(...this._format('DEBUG', msg, data));
    }

    info(msg, data) {
      if (!this._enabled) return;
      console.info(...this._format('INFO', msg, data));
    }

    warn(msg, data) {
      console.warn(...this._format('WARN', msg, data));
    }

    error(msg, data) {
      console.error(...this._format('ERROR', msg, data));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TYPED EVENT EMITTER
  // ═══════════════════════════════════════════════════════════════════════════

  class TypedEventEmitter {
    constructor() {
      this._listeners = new Map();
      this._onceListeners = new Map();
      this._wildcardListeners = new Set();
    }

    on(event, handler) {
      if (event === '*') {
        this._wildcardListeners.add(handler);
        return () => this._wildcardListeners.delete(handler);
      }
      if (!this._listeners.has(event)) this._listeners.set(event, new Set());
      this._listeners.get(event).add(handler);
      return () => this.off(event, handler);
    }

    once(event, handler) {
      if (!this._onceListeners.has(event)) this._onceListeners.set(event, new Set());
      this._onceListeners.get(event).add(handler);
      return () => {
        const set = this._onceListeners.get(event);
        if (set) set.delete(handler);
      };
    }

    off(event, handler) {
      if (event === '*') {
        this._wildcardListeners.delete(handler);
        return;
      }
      const set = this._listeners.get(event);
      if (set) set.delete(handler);
      const onceSet = this._onceListeners.get(event);
      if (onceSet) onceSet.delete(handler);
    }

    emit(event, payload) {
      const listeners = this._listeners.get(event);
      if (listeners) {
        for (const handler of listeners) {
          try { handler(payload); } catch (e) { console.error(`Event handler error [${event}]:`, e); }
        }
      }

      const onceListeners = this._onceListeners.get(event);
      if (onceListeners && onceListeners.size > 0) {
        const handlers = [...onceListeners];
        onceListeners.clear();
        for (const handler of handlers) {
          try { handler(payload); } catch (e) { console.error(`Once handler error [${event}]:`, e); }
        }
      }

      for (const handler of this._wildcardListeners) {
        try { handler(event, payload); } catch (e) { console.error('Wildcard handler error:', e); }
      }
    }

    removeAllListeners(event) {
      if (event) {
        this._listeners.delete(event);
        this._onceListeners.delete(event);
      } else {
        this._listeners.clear();
        this._onceListeners.clear();
        this._wildcardListeners.clear();
      }
    }

    listenerCount(event) {
      const regular = this._listeners.get(event)?.size || 0;
      const once = this._onceListeners.get(event)?.size || 0;
      return regular + once;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE MACHINE
  // ═══════════════════════════════════════════════════════════════════════════

  class StateMachine {
    constructor(emitter, logger) {
      this._state = State.UNINITIALIZED;
      this._emitter = emitter;
      this._log = logger;
      this._history = [];
    }

    get current() { return this._state; }
    get history() { return [...this._history]; }

    transition(to) {
      const from = this._state;
      if (from === to) return true;

      if (from === State.DESTROYED) {
        throw new AvatarError(ErrorCode.ALREADY_DESTROYED, 'SDK instance has been destroyed', { recoverable: false });
      }

      const allowed = VALID_TRANSITIONS[from];
      if (!allowed || !allowed.includes(to)) {
        this._log.warn(`Invalid state transition: ${from} → ${to}`);
        return false;
      }

      this._state = to;
      this._history.push({ from, to, timestamp: Date.now() });
      this._log.debug(`State: ${from} → ${to}`);
      this._emitter.emit(Events.STATE_CHANGE, { from, to });
      return true;
    }

    is(...states) {
      return states.includes(this._state);
    }

    assertState(...validStates) {
      if (!this.is(...validStates)) {
        throw new AvatarError(
          ErrorCode.INVALID_STATE,
          `Operation requires state [${validStates.join('|')}] but current state is "${this._state}"`,
          { recoverable: false, context: { current: this._state, expected: validStates } }
        );
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECONNECT STRATEGY
  // ═══════════════════════════════════════════════════════════════════════════

  class ReconnectStrategy {
    constructor(config) {
      this._baseDelay = config.baseDelay || DEFAULTS.RECONNECT_BASE_DELAY;
      this._maxAttempts = config.maxAttempts || DEFAULTS.MAX_RECONNECT_ATTEMPTS;
      this._attempt = 0;
      this._timer = null;
    }

    get attempt() { return this._attempt; }
    get maxAttempts() { return this._maxAttempts; }
    get exhausted() { return this._attempt >= this._maxAttempts; }

    nextDelay() {
      const jitter = Math.random() * 0.3 + 0.85;
      return Math.min(this._baseDelay * Math.pow(2, this._attempt) * jitter, 30000);
    }

    schedule(fn) {
      if (this.exhausted) return false;
      this._attempt++;
      const delay = this.nextDelay();
      this._timer = setTimeout(fn, delay);
      return true;
    }

    reset() {
      this._attempt = 0;
      if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    }

    cancel() {
      if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSCRIPT MANAGER
  // ═══════════════════════════════════════════════════════════════════════════

  class TranscriptManager {
    constructor(emitter) {
      this._entries = [];
      this._enabled = true;
      this._emitter = emitter;
    }

    setEnabled(enabled) { this._enabled = enabled; }
    get enabled() { return this._enabled; }

    add(role, text) {
      if (!this._enabled || !text) return;
      const entry = { role, text, timestamp: new Date() };
      this._entries.push(entry);
      this._emitter.emit(Events.TRANSCRIPT_ENTRY, entry);
      return entry;
    }

    getAll() {
      return this._entries.map(e => ({ ...e }));
    }

    clear() {
      this._entries = [];
    }

    getText(options = {}) {
      const { includeTimestamps = false, format = 'text' } = options;

      if (format === 'json') {
        return JSON.stringify(this._entries, null, 2);
      }

      const lines = this._entries.map(e => {
        const ts = includeTimestamps ? `[${e.timestamp.toISOString()}] ` : '';
        const prefix = format === 'markdown' ? `**${e.role}:** ` : `${e.role}: `;
        return `${ts}${prefix}${e.text}`;
      });

      return format === 'markdown' ? lines.join('\n\n') : lines.join('\n');
    }

    download(options = {}) {
      const { filename, format = 'text', includeTimestamps = true } = options;
      const ext = format === 'json' ? 'json' : format === 'markdown' ? 'md' : 'txt';
      const name = filename || `avatar-transcript-${Date.now()}.${ext}`;
      const content = this.getText({ format, includeTimestamps });
      const mime = format === 'json' ? 'application/json' : 'text/plain';

      const blob = new Blob([content], { type: `${mime};charset=utf-8` });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMAND REGISTRY
  // ═══════════════════════════════════════════════════════════════════════════

  class CommandRegistry {
    constructor(emitter) {
      this._commands = new Map();
      this._emitter = emitter;
    }

    register(name, pattern, handler) {
      const matcher = pattern instanceof RegExp
        ? (text) => pattern.test(text)
        : (text) => text.toLowerCase().includes(pattern.toLowerCase());

      this._commands.set(name, { pattern, matcher, handler });
      return () => this._commands.delete(name);
    }

    check(text) {
      if (!text) return;
      for (const [name, cmd] of this._commands) {
        if (cmd.matcher(text)) {
          const match = { command: name, text, pattern: cmd.pattern };
          try {
            cmd.handler(match);
          } catch (e) {
            console.error(`Command handler error [${name}]:`, e);
          }
          this._emitter.emit(Events.COMMAND_MATCHED, match);
        }
      }
    }

    clear() {
      this._commands.clear();
    }

    list() {
      return [...this._commands.keys()];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DPP MANAGER
  // ═══════════════════════════════════════════════════════════════════════════

  class DPPManager {
    constructor(logger) {
      this._log = logger;
      this._debounceTimer = null;
      this._lastInjected = null;
      this._history = [];
    }

    prepare(data) {
      if (typeof data === 'string') {
        try { JSON.parse(data); } catch (e) {
          throw new AvatarError(ErrorCode.INVALID_DPP_JSON, `Invalid DPP JSON: ${e.message}`, { recoverable: false, cause: e });
        }
        return data;
      }
      if (typeof data === 'object' && data !== null) {
        return JSON.stringify(data);
      }
      throw new AvatarError(ErrorCode.INVALID_DPP_JSON, 'DPP must be a JSON string or object', { recoverable: false });
    }

    inject(socket, data) {
      const jsonString = this.prepare(data);
      socket.emit('setDynamicPrompt', { message: jsonString });
      this._lastInjected = jsonString;
      this._history.push({ data: jsonString, timestamp: Date.now() });
      this._log.debug('DPP injected', jsonString.substring(0, 100));
    }

    injectDebounced(socket, data, delay = DEFAULTS.DPP_DEBOUNCE_MS) {
      if (this._debounceTimer) clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => {
        this.inject(socket, data);
        this._debounceTimer = null;
      }, delay);
    }

    cancelDebounce() {
      if (this._debounceTimer) { clearTimeout(this._debounceTimer); this._debounceTimer = null; }
    }

    get lastInjected() { return this._lastInjected; }
    get history() { return [...this._history]; }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MICROPHONE MANAGER
  // ═══════════════════════════════════════════════════════════════════════════

  class MicrophoneManager {
    constructor(logger) {
      this._stream = null;
      this._muted = false;
      this._log = logger;
    }

    get stream() { return this._stream; }
    get active() { return this._stream !== null; }
    get muted() { return this._muted; }

    async acquire(constraints) {
      const finalConstraints = constraints || { audio: { echoCancellation: true }, video: false };
      this._log.debug('Requesting microphone', finalConstraints);
      this._stream = await navigator.mediaDevices.getUserMedia(finalConstraints);
      return this._stream;
    }

    mute() {
      if (!this._stream) return;
      this._stream.getAudioTracks().forEach(t => { t.enabled = false; });
      this._muted = true;
    }

    unmute() {
      if (!this._stream) return;
      this._stream.getAudioTracks().forEach(t => { t.enabled = true; });
      this._muted = false;
    }

    release() {
      if (this._stream) {
        this._stream.getTracks().forEach(t => t.stop());
        this._stream = null;
      }
      this._muted = false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WHEP CLIENT
  // ═══════════════════════════════════════════════════════════════════════════

  class WHEPClient {
    constructor(config, logger) {
      this._config = config;
      this._log = logger;
      this._pc = null;
      this._videoElement = null;
      this._audioElement = null;
    }

    get peerConnection() { return this._pc; }
    get videoElement() { return this._videoElement; }

    _buildIceServers() {
      const turn = this._config.turn?.urls || [
        `turn:${DEFAULTS.TURN_HOST}:80?transport=udp`,
        `turn:${DEFAULTS.TURN_HOST}:443?transport=udp`,
        `turn:${DEFAULTS.TURN_HOST}:80?transport=tcp`,
        `turns:${DEFAULTS.TURNS_HOST}:443?transport=tcp`
      ];
      return [{
        urls: turn,
        username: this._config.turn?.username || DEFAULTS.TURN_USERNAME,
        credential: this._config.turn?.credential || DEFAULTS.TURN_CREDENTIAL
      }];
    }

    async negotiate(sessionId, options = {}) {
      this._log.info(`WHEP negotiating for session: ${sessionId}`);

      this._pc = new RTCPeerConnection({
        iceServers: this._buildIceServers(),
        bundlePolicy: 'max-bundle',
        iceTransportPolicy: this._config.turn?.iceTransportPolicy || 'relay'
      });

      const result = { videoReady: false, pc: this._pc };

      this._pc.addTransceiver('audio', { direction: 'recvonly' });
      this._pc.addTransceiver('video', { direction: 'recvonly' });

      const trackPromise = new Promise((resolve) => {
        this._pc.ontrack = (e) => {
          if (e.streams && e.streams[0]) {
            if (options.videoElement) {
              this._videoElement = options.videoElement;
            }
            if (this._videoElement) {
              this._videoElement.srcObject = e.streams[0];
              this._videoElement.play().then(() => {
                result.videoReady = true;
                resolve(result);
              }).catch(() => {
                result.videoReady = true;
                resolve(result);
              });
            } else {
              result.videoReady = true;
              resolve(result);
            }
          }
        };
      });

      const offer = await this._pc.createOffer();
      await this._pc.setLocalDescription(offer);

      await this._waitForIceGathering();

      const whepBase = this._config.endpoints?.whep || DEFAULTS.WHEP_URL;
      const whepUrl = `${whepBase}/rtc/v1/whep/?app=app&stream=${sessionId}`;

      const resp = await fetch(whepUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: this._pc.localDescription.sdp
      });

      if (!resp.ok) {
        throw new AvatarError(ErrorCode.WHEP_NEGOTIATION_FAILED, `WHEP returned ${resp.status}`, {
          recoverable: true,
          context: { status: resp.status, sessionId }
        });
      }

      const answerSdp = await resp.text();
      await this._pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

      this._log.info('WHEP negotiation successful');
      return { trackPromise, pc: this._pc };
    }

    async _waitForIceGathering() {
      if (this._pc.iceGatheringState === 'complete') return;
      return new Promise((resolve) => {
        const timeout = setTimeout(resolve, DEFAULTS.ICE_GATHER_TIMEOUT);
        this._pc.onicegatheringstatechange = () => {
          if (this._pc.iceGatheringState === 'complete') {
            clearTimeout(timeout);
            resolve();
          }
        };
      });
    }

    setVideoElement(el) {
      this._videoElement = el;
    }

    close() {
      if (this._pc) {
        this._pc.close();
        this._pc = null;
      }
      if (this._videoElement) {
        this._videoElement.srcObject = null;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ASR CONNECTION (WebRTC peer connection for mic audio → server speech recognition)
  // Protocol: asr-webrtc-init → asr-webrtc-ready → offer/answer exchange
  // ═══════════════════════════════════════════════════════════════════════════

  class ASRConnection {
    constructor(config, logger) {
      this._config = config;
      this._log = logger;
      this._pc = null;
      this._socket = null;
    }

    get peerConnection() { return this._pc; }

    _buildIceServers() {
      const turn = this._config.turn?.urls || [
        `turn:${DEFAULTS.TURN_HOST}:80?transport=udp`,
        `turn:${DEFAULTS.TURN_HOST}:443?transport=udp`,
        `turn:${DEFAULTS.TURN_HOST}:80?transport=tcp`,
        `turns:${DEFAULTS.TURNS_HOST}:443?transport=tcp`
      ];
      return [{
        urls: turn,
        username: this._config.turn?.username || DEFAULTS.TURN_USERNAME,
        credential: this._config.turn?.credential || DEFAULTS.TURN_CREDENTIAL
      }];
    }

    async start(socket, sessionId, micStream) {
      this._socket = socket;
      this._pendingCandidates = [];
      this._remoteDescSet = false;
      this._log.info('Initiating ASR WebRTC connection');

      // Register ICE candidate handler FIRST, before any async work
      socket.on('asr-ice-candidate', (data) => {
        if (!data?.candidate) return;
        const candidateInit = {
          candidate: typeof data.candidate === 'string' ? data.candidate : data.candidate.candidate,
          sdpMLineIndex: data.sdpMLineIndex != null ? data.sdpMLineIndex : 0
        };
        if (!this._remoteDescSet || !this._pc) {
          this._pendingCandidates.push(candidateInit);
          this._log.debug('Buffered remote ICE candidate');
        } else {
          this._pc.addIceCandidate(new RTCIceCandidate(candidateInit))
            .then(() => this._log.debug('Added remote ICE candidate'))
            .catch((e) => this._log.debug('ICE candidate error:', e.message));
        }
      });

      try {
        await this._waitForReady(socket, sessionId);
        await this._negotiate(socket, micStream);
      } catch (err) {
        this._log.warn('ASR connection failed, mic will not work:', err.message);
      }
    }

    _waitForReady(socket, sessionId) {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for ASR WebRTC ready'));
        }, 30000);

        socket.once('asr-webrtc-ready', () => {
          clearTimeout(timeout);
          this._log.debug('Server ASR WebRTC ready');
          resolve();
        });

        socket.once('asr-webrtc-error', (data) => {
          clearTimeout(timeout);
          reject(new Error(data?.error || 'ASR WebRTC init error'));
        });

        socket.emit('asr-webrtc-init', { sessionId });
        this._log.debug('Sent asr-webrtc-init', sessionId);
      });
    }

    async _negotiate(socket, micStream) {
      this._pc = new RTCPeerConnection({
        iceServers: this._buildIceServers(),
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
        iceTransportPolicy: 'all'
      });

      if (micStream) {
        const audioTrack = micStream.getAudioTracks()[0];
        if (audioTrack) {
          this._pc.addTrack(audioTrack, micStream);
          this._log.debug('Mic track added to ASR peer connection');
        }
      }

      // Trickle ICE: send candidates as they are gathered
      this._pc.onicecandidate = (e) => {
        if (e.candidate) {
          socket.emit('asr-webrtc-ice-candidate', { candidate: e.candidate });
          this._log.debug('Sent ASR ICE candidate');
        }
      };

      this._pc.onconnectionstatechange = () => {
        this._log.debug('ASR PC connectionState:', this._pc.connectionState);
      };

      this._pc.oniceconnectionstatechange = () => {
        this._log.debug('ASR PC iceConnectionState:', this._pc.iceConnectionState);
      };

      // Remote ICE candidates are buffered by start() handler on the instance

      // Create and send offer
      const offer = await this._pc.createOffer();
      await this._pc.setLocalDescription(offer);
      this._log.debug('Local description set, ICE gathering started');

      // Send offer as full RTCSessionDescription (matches production app)
      const offerDesc = { type: this._pc.localDescription.type, sdp: this._pc.localDescription.sdp };

      const answerData = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for ASR WebRTC answer'));
        }, 30000);

        socket.once('asr-webrtc-answer', (data) => {
          clearTimeout(timeout);
          resolve(data);
        });

        socket.once('asr-webrtc-error', (data) => {
          clearTimeout(timeout);
          reject(new Error(data?.error || 'ASR WebRTC offer error'));
        });

        socket.emit('asr-webrtc-offer', { offer: offerDesc, is_reconnect: false });
        this._log.debug('Sent asr-webrtc-offer');
      });

      // Set remote description
      const answerSdp = answerData?.answer || answerData?.sdp || answerData;
      if (typeof answerSdp === 'string') {
        await this._pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
      } else if (answerSdp?.type && answerSdp?.sdp) {
        await this._pc.setRemoteDescription(answerSdp);
      } else {
        throw new Error('Unexpected ASR answer format: ' + JSON.stringify(answerData).substring(0, 200));
      }
      this._log.debug('Remote description set');

      // Flush buffered ICE candidates
      this._remoteDescSet = true;
      for (const c of this._pendingCandidates) {
        try {
          await this._pc.addIceCandidate(new RTCIceCandidate(c));
          this._log.debug('Flushed buffered ICE candidate');
        } catch (e) {
          this._log.debug('Failed to flush ICE candidate:', e.message);
        }
      }
      this._pendingCandidates = [];
      this._log.info('ASR WebRTC negotiation complete');
    }


    close() {
      if (this._pc) { this._pc.close(); this._pc = null; }
      if (this._socket) {
        this._socket.off('asr-ice-candidate');
        this._socket = null;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIO FALLBACK (WebRTC via socket signaling — used when WHEP video fails)
  // ═══════════════════════════════════════════════════════════════════════════

  class AudioFallback {
    constructor(config, logger) {
      this._config = config;
      this._log = logger;
      this._pc = null;
    }

    get peerConnection() { return this._pc; }

    _buildIceServers() {
      const turn = this._config.turn?.urls || [
        `turn:${DEFAULTS.TURN_HOST}:80?transport=udp`,
        `turn:${DEFAULTS.TURN_HOST}:443?transport=udp`,
        `turn:${DEFAULTS.TURN_HOST}:80?transport=tcp`,
        `turns:${DEFAULTS.TURNS_HOST}:443?transport=tcp`
      ];
      return [{
        urls: turn,
        username: this._config.turn?.username || DEFAULTS.TURN_USERNAME,
        credential: this._config.turn?.credential || DEFAULTS.TURN_CREDENTIAL
      }];
    }

    create(socket, options = {}) {
      this._log.info('Starting audio fallback (WebRTC via socket signaling)');

      this._pc = new RTCPeerConnection({
        iceServers: this._buildIceServers(),
        bundlePolicy: 'max-bundle',
        iceTransportPolicy: this._config.turn?.iceTransportPolicy || 'relay'
      });

      const trackPromise = new Promise((resolve) => {
        this._pc.ontrack = (e) => {
          if (options.audioElement && e.streams[0]) {
            options.audioElement.srcObject = e.streams[0];
            options.audioElement.play().catch(() => {
              document.addEventListener('click', () => options.audioElement.play(), { once: true });
            });
          }
          resolve();
        };
      });

      if (options.micStream) {
        const audioTrack = options.micStream.getAudioTracks()[0];
        if (audioTrack) this._pc.addTrack(audioTrack, options.micStream);
      }

      this._pc.onicecandidate = (e) => {
        if (e.candidate) socket.emit('webrtc-ice-candidate', { candidate: e.candidate });
      };

      socket.emit('webrtc-create-offer');
      return { trackPromise, pc: this._pc };
    }

    async handleOffer(data) {
      if (!this._pc) return null;
      await this._pc.setRemoteDescription(data.offer);
      const answer = await this._pc.createAnswer();
      await this._pc.setLocalDescription(answer);
      return this._pc.localDescription;
    }

    async addIceCandidate(candidate) {
      if (this._pc && candidate) {
        try { await this._pc.addIceCandidate(candidate); } catch (e) { /* ignore */ }
      }
    }

    close() {
      if (this._pc) { this._pc.close(); this._pc = null; }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN SDK CLASS
  // ═══════════════════════════════════════════════════════════════════════════

  class KalturaAvatarSDK {
    constructor(config) {
      this._validateConfig(config);

      this._config = Object.freeze({
        clientId: config.clientId,
        flowId: config.flowId,
        container: config.container || null,
        debug: config.debug || false,
        autoReconnect: config.autoReconnect !== false,
        maxReconnectAttempts: config.maxReconnectAttempts || DEFAULTS.MAX_RECONNECT_ATTEMPTS,
        reconnectBaseDelay: config.reconnectBaseDelay || DEFAULTS.RECONNECT_BASE_DELAY,
        connectionTimeout: config.connectionTimeout || DEFAULTS.CONNECTION_TIMEOUT,
        endpoints: Object.freeze({
          socket: config.endpoints?.socket || DEFAULTS.SOCKET_URL,
          socketPath: config.endpoints?.socketPath || DEFAULTS.SOCKET_PATH,
          whep: config.endpoints?.whep || DEFAULTS.WHEP_URL,
          ...(config.endpoints || {})
        }),
        turn: Object.freeze({
          urls: config.turn?.urls || null,
          username: config.turn?.username || DEFAULTS.TURN_USERNAME,
          credential: config.turn?.credential || DEFAULTS.TURN_CREDENTIAL,
          iceTransportPolicy: config.turn?.iceTransportPolicy || 'relay'
        }),
        media: Object.freeze({
          video: config.media?.video !== false,
          audioOnly: config.media?.audioOnly || false,
          videoElement: config.media?.videoElement || null,
          audioElement: config.media?.audioElement || null,
          micConstraints: config.media?.micConstraints || null,
          autoPlay: config.media?.autoPlay !== false,
          ariaLabel: config.media?.ariaLabel || 'AI Avatar Video'
        }),
        transcriptEnabled: config.transcriptEnabled !== false,
        peerName: config.peerName || DEFAULTS.PEER_NAME
      });

      this._log = new Logger('KalturaAvatar', this._config.debug);
      this._emitter = new TypedEventEmitter();
      this._state = new StateMachine(this._emitter, this._log);
      this._reconnect = new ReconnectStrategy({
        baseDelay: this._config.reconnectBaseDelay,
        maxAttempts: this._config.maxReconnectAttempts
      });
      this._transcript = new TranscriptManager(this._emitter);
      this._transcript.setEnabled(this._config.transcriptEnabled);
      this._commands = new CommandRegistry(this._emitter);
      this._dpp = new DPPManager(this._log);
      this._mic = new MicrophoneManager(this._log);
      this._whep = new WHEPClient(this._config, this._log);
      this._asr = new ASRConnection(this._config, this._log);
      this._audioFallback = new AudioFallback(this._config, this._log);

      this._socket = null;
      this._sessionId = null;
      this._roomId = null;
      this._stickyId = null;
      this._micReady = false;
      this._videoReady = false;
      this._permissionsApproved = false;
      this._videoElement = null;
      this._audioElement = null;
      this._avatarSpeaking = false;
      this._intentionalDisconnect = false;

      this._setupContainer();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STATIC
    // ─────────────────────────────────────────────────────────────────────────

    static get VERSION() { return VERSION; }
    static get Events() { return Events; }
    static get State() { return State; }
    static get ErrorCode() { return ErrorCode; }

    // ─────────────────────────────────────────────────────────────────────────
    // LIFECYCLE
    // ─────────────────────────────────────────────────────────────────────────

    async connect() {
      this._state.assertState(State.UNINITIALIZED, State.ENDED, State.ERROR);

      if (typeof io === 'undefined') {
        throw new AvatarError(ErrorCode.INVALID_CONFIG, 'Socket.IO client (io) is not loaded. Include socket.io-client before using this SDK.', { recoverable: false });
      }

      this._state.transition(State.CONNECTING);
      this._emitter.emit(Events.CONNECTING);
      this._resetInternalState();

      this._stickyId = generateId(8) + generateId(8);
      this._roomId = generateId(8);

      try {
        await withTimeout(this._initSocket(), this._config.connectionTimeout, 'Connection');
      } catch (err) {
        this._state.transition(State.ERROR);
        this._emitter.emit(Events.ERROR, err instanceof AvatarError ? err : new AvatarError(ErrorCode.CONNECTION_FAILED, err.message, { cause: err }));
        if (this._config.autoReconnect) this._attemptReconnect();
        throw err;
      }
    }

    async start() { return this.connect(); }

    disconnect() {
      if (this._state.is(State.DESTROYED, State.UNINITIALIZED)) return;
      this._intentionalDisconnect = true;
      this._cleanupConnection();
      this._state.transition(State.ENDED);
      this._emitter.emit(Events.DISCONNECTED, { reason: 'user' });
      this._emitter.emit(Events.CONVERSATION_ENDED);
      this._intentionalDisconnect = false;
    }

    end() { this.disconnect(); }

    destroy() {
      this._reconnect.cancel();
      this._dpp.cancelDebounce();
      this._cleanupConnection();
      this._cleanupMedia();
      this._removeVideoElement();
      this._state.transition(State.DESTROYED);
      this._emitter.emit(Events.DESTROYED);
      this._emitter.removeAllListeners();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // COMMUNICATION
    // ─────────────────────────────────────────────────────────────────────────

    sendText(text) {
      this._state.assertState(State.IN_CONVERSATION);
      if (!text || typeof text !== 'string') return;
      if (this._avatarSpeaking) {
        this._socket.emit('tapToTalkStart', {});
      }
      this._socket.emit('debug_text_entered', {
        isFinal: true, text,
        room_id: this._roomId, session_id: this._sessionId
      });
      if (this._avatarSpeaking) {
        this._socket.emit('tapToTalkEnd', {});
      }
      this._log.debug('Text sent', text);
    }

    sendTextPartial(text) {
      this._state.assertState(State.IN_CONVERSATION);
      if (!text || typeof text !== 'string') return;
      if (this._avatarSpeaking) {
        this._socket.emit('tapToTalkStart', {});
      }
      this._socket.emit('debug_text_entered', {
        isFinal: false, text,
        room_id: this._roomId, session_id: this._sessionId
      });
    }

    submitContact(type, value) {
      this._state.assertState(State.IN_CONVERSATION);
      this._socket.emit('contactInfoReceived', {
        contact_info: { info_type: type, info_value: value }
      });
      this._log.debug('Contact submitted', type);
    }

    rejectContact(type) {
      this._state.assertState(State.IN_CONVERSATION);
      this._socket.emit('contactInfoRejected', { type: type || 'email' });
      this._log.debug('Contact rejected', type);
    }

    injectDPP(data) {
      this._state.assertState(State.IN_CONVERSATION, State.JOINED);
      this._dpp.inject(this._socket, data);
    }

    injectDPPDebounced(data, delayMs) {
      this._state.assertState(State.IN_CONVERSATION, State.JOINED);
      this._dpp.injectDebounced(this._socket, data, delayMs);
    }

    // v1 compatibility alias
    injectPrompt(jsonString) {
      this.injectDPP(jsonString);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EVENTS
    // ─────────────────────────────────────────────────────────────────────────

    on(event, handler) { return this._emitter.on(event, handler); }
    once(event, handler) { return this._emitter.once(event, handler); }
    off(event, handler) { this._emitter.off(event, handler); }
    removeAllListeners(event) { this._emitter.removeAllListeners(event); }

    // ─────────────────────────────────────────────────────────────────────────
    // COMMANDS
    // ─────────────────────────────────────────────────────────────────────────

    registerCommand(name, pattern, handler) {
      return this._commands.register(name, pattern, handler);
    }

    onEndPhrase(phrase, handler) {
      return this._commands.register('__end__', phrase, (match) => {
        handler(match);
      });
    }

    clearCommands() { this._commands.clear(); }

    // ─────────────────────────────────────────────────────────────────────────
    // TRANSCRIPT
    // ─────────────────────────────────────────────────────────────────────────

    getTranscript() { return this._transcript.getAll(); }
    getTranscriptText(options) { return this._transcript.getText(options); }
    downloadTranscript(options) { this._transcript.download(options); }
    clearTranscript() { this._transcript.clear(); }
    setTranscriptEnabled(enabled) { this._transcript.setEnabled(enabled); }

    // ─────────────────────────────────────────────────────────────────────────
    // STATE & INFO
    // ─────────────────────────────────────────────────────────────────────────

    getState() { return this._state.current; }
    getSessionId() { return this._sessionId; }
    getRoomId() { return this._roomId; }
    getVideoElement() { return this._videoElement; }
    getAudioElement() { return this._audioElement; }
    getMicStream() { return this._mic.stream; }
    isConnected() { return this._state.is(State.CONNECTED, State.JOINING, State.JOINED, State.IN_CONVERSATION); }
    isInConversation() { return this._state.is(State.IN_CONVERSATION); }
    isAvatarSpeaking() { return this._avatarSpeaking; }

    // ─────────────────────────────────────────────────────────────────────────
    // MICROPHONE
    // ─────────────────────────────────────────────────────────────────────────

    muteMic() { this._mic.mute(); }
    unmuteMic() { this._mic.unmute(); }
    isMicMuted() { return this._mic.muted; }

    // ─────────────────────────────────────────────────────────────────────────
    // INTERNAL: SOCKET INITIALIZATION
    // ─────────────────────────────────────────────────────────────────────────

    _initSocket() {
      return new Promise((resolve, reject) => {
        const socketUrl = this._config.endpoints.socket;
        const query = {
          client: this._config.clientId,
          flowId: this._config.flowId,
          level: 'published',
          stickyId: this._stickyId,
          debugMode: 'true'
        };

        this._log.info('Connecting to', socketUrl);

        this._socket = io(socketUrl, {
          path: this._config.endpoints.socketPath,
          transports: ['websocket'],
          query
        });

        let resolved = false;

        this._socket.on('connect', () => {
          this._log.info('Socket connected', this._socket.id);
          this._state.transition(State.CONNECTED);
          this._emitter.emit(Events.CONNECTED);
        });

        this._socket.on('connect_error', (err) => {
          this._log.error('Connection error', err.message);
          if (!resolved) { resolved = true; reject(new AvatarError(ErrorCode.CONNECTION_FAILED, err.message, { cause: err })); }
        });

        this._socket.on('disconnect', (reason) => {
          this._log.info('Socket disconnected', reason);
          if (this._intentionalDisconnect) return;
          if (this._state.is(State.IN_CONVERSATION, State.JOINED, State.JOINING)) {
            this._state.transition(State.ERROR);
            this._emitter.emit(Events.ERROR, new AvatarError(ErrorCode.CONNECTION_LOST, `Disconnected: ${reason}`, { recoverable: true }));
            if (this._config.autoReconnect && reason !== 'io client disconnect') {
              this._attemptReconnect();
            }
          }
          this._emitter.emit(Events.DISCONNECTED, { reason });
        });

        // Protocol flow
        this._socket.on('onServerConnected', (data) => {
          this._log.debug('Server connected', data?.agentName);
          this._socket.emit('setDebugMode', { debugMode: true });
          this._socket.emit('join', {
            client: this._config.clientId,
            channel: this._roomId,
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'KalturaAvatarSDK',
            channel_password: null,
            peer_name: this._config.peerName,
            peer_video: false,
            peer_audio: true,
            isMobile: false
          });
          this._state.transition(State.JOINING);
        });

        this._socket.on('joinComplete', () => {
          this._log.debug('Join complete');
          this._state.transition(State.JOINED);
          this._socket.emit('stvNewSession', { room_id: this._roomId, cast_mode: 'webrtc' });
        });

        this._socket.on('stvNewSession', (data) => {
          if (data?.session_id) {
            this._sessionId = data.session_id;
            this._log.debug('Session created', this._sessionId);
            this._startMedia();
          }
        });

        this._socket.on('showAgent', () => {
          this._log.debug('Agent visible');
          this._emitter.emit(Events.SHOWING_AGENT);
          if (!resolved) { resolved = true; resolve(); }
        });

        this._socket.on('askPermissions', async (data) => {
          this._log.debug('Permissions requested', data?.constraints);
          await this._handlePermissions(data?.constraints);
        });

        // Avatar speech
        this._socket.on('stvStartedTalking', () => {
          this._avatarSpeaking = true;
          this._emitter.emit(Events.AVATAR_SPEAKING_START);
        });

        this._socket.on('stvFinishedTalking', (data) => {
          this._avatarSpeaking = false;
          this._emitter.emit(Events.AVATAR_SPEAKING_END);
          if (data?.agentContent) {
            const text = data.agentContent;
            this._transcript.add('Avatar', text);
            this._commands.check(text);
            this._emitter.emit(Events.AVATAR_SPEECH, { text });
            this._emitter.emit(Events.AGENT_TALKED, { agentContent: text });
          }
        });

        // User speech (via server ASR) — interim/partial only
        this._socket.on('debug_vad_speech_detected', (data) => {
          if (data?.transcript && data.segmentType !== 'final') {
            this._emitter.emit(Events.USER_SPEECH, { text: data.transcript, isFinal: false });
            this._emitter.emit(Events.USER_TRANSCRIPTION, { userTranscription: data.transcript });
          }
        });

        // User speech confirmed (server acknowledged user's turn)
        this._socket.on('agentTurnToTalk', (data) => {
          if (data?.userTranscription) {
            this._emitter.emit(Events.USER_SPEECH, { text: data.userTranscription, isFinal: true });
            this._emitter.emit(Events.USER_TRANSCRIPTION, { userTranscription: data.userTranscription });
            this._transcript.add('User', data.userTranscription);
          }
        });

        // State changes from server
        this._socket.on('debug_conversationStateChange', (data) => {
          this._log.debug('Server state', data);
        });

        // Conversation lifecycle
        this._socket.on('conversationEnded', () => {
          this._log.info('Conversation ended by server');
          this._state.transition(State.ENDED);
          this._emitter.emit(Events.CONVERSATION_ENDED);
        });

        this._socket.on('conversationTimeExpired', () => {
          this._log.warn('Conversation time expired');
          this._emitter.emit(Events.ERROR, new AvatarError(ErrorCode.CONVERSATION_TIME_EXPIRED, 'Session time limit reached', { recoverable: false }));
          this._state.transition(State.ENDED);
          this._emitter.emit(Events.CONVERSATION_ENDED);
        });

        this._socket.on('conversationTimeWarning', (data) => {
          this._log.warn('Time warning', data);
        });

        this._socket.on('flowConfigError', (data) => {
          this._log.error('Flow config error', data);
          const err = new AvatarError(ErrorCode.FLOW_CONFIG_ERROR, 'Invalid clientId or flowId configuration', { recoverable: false, context: data });
          this._emitter.emit(Events.ERROR, err);
          if (!resolved) { resolved = true; reject(err); }
        });

        // WebRTC signaling (audio fallback only — ASR uses asr-* events internally)
        this._socket.on('webrtc-offer', async (data) => {
          this._log.debug('Received webrtc-offer (audio fallback)');
          const answer = await this._audioFallback.handleOffer(data);
          if (answer) this._socket.emit('webrtc-answer', { answer });
        });

        this._socket.on('webrtc-ice-candidate', async (data) => {
          if (data?.candidate) {
            await this._audioFallback.addIceCandidate(data.candidate);
          }
        });

        // Contact collection (server pauses listening until responded)
        this._socket.on('contactCollector', (data) => {
          const type = data?.contact_type?.toLowerCase() || 'email';
          this._log.debug('Contact collection requested', type);
          this._emitter.emit(Events.CONTACT_COLLECTION, { type });
        });

        // GenUI events
        GENUI_EVENTS.forEach(evt => {
          this._socket.on(evt, (data) => {
            this._emitter.emit(Events.GENUI, { type: evt, data });
          });
        });

        // Error events
        this._socket.on('stvTaskFail', (data) => {
          this._log.error('Task failed', data);
        });

        // Fallback: resolve if showAgent comes first
        this._socket.on('showAgent', () => {
          if (!resolved) { resolved = true; resolve(); }
        });
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INTERNAL: MEDIA
    // ─────────────────────────────────────────────────────────────────────────

    async _startMedia() {
      if (this._config.media.audioOnly) {
        this._startAudioFallback();
        return;
      }

      try {
        const videoEl = this._videoElement || this._config.media.videoElement;
        if (videoEl) this._whep.setVideoElement(videoEl);

        const { trackPromise } = await this._whep.negotiate(this._sessionId, {
          videoElement: videoEl
        });

        trackPromise.then(() => {
          this._videoReady = true;
          this._emitter.emit(Events.VIDEO_READY, { element: this._videoElement });
          this._checkApprovePermissions();
        });
      } catch (err) {
        this._log.warn('WHEP failed, falling back to audio', err.message);
        this._emitter.emit(Events.AUDIO_FALLBACK);
        this._startAudioFallback();
      }
    }

    _startAudioFallback() {
      const audioEl = this._audioElement || this._config.media.audioElement || this._createAudioElement();
      const { trackPromise } = this._audioFallback.create(this._socket, { audioElement: audioEl });
      trackPromise.then(() => {
        this._videoReady = true;
        this._checkApprovePermissions();
      });
    }

    async _handlePermissions(constraints) {
      try {
        await this._mic.acquire(constraints || { audio: { echoCancellation: true }, video: false });
        this._micReady = true;
        this._emitter.emit(Events.MIC_GRANTED, { stream: this._mic.stream });
        this._checkApprovePermissions();
      } catch (err) {
        this._log.warn('Mic permission denied, continuing in text-only mode', err.message);
        this._emitter.emit(Events.MIC_DENIED, { error: err });
        this._micReady = true;
        this._checkApprovePermissions();
      }
    }

    _checkApprovePermissions() {
      if (this._permissionsApproved) return;
      if (this._micReady && this._videoReady) {
        this._permissionsApproved = true;
        this._socket.emit('approvedPermissions', {});
        this._log.info('Permissions approved — avatar will greet');
        this._state.transition(State.IN_CONVERSATION);
        this._emitter.emit(Events.READY);
        this._reconnect.reset();
        // Start ASR WebRTC after permissions approved (server needs this sequence)
        // Server expects socket.id as the sessionId for ASR init (matches production app)
        if (this._mic.stream && this._socket?.id) {
          this._asr.start(this._socket, this._socket.id, this._mic.stream);
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INTERNAL: RECONNECT
    // ─────────────────────────────────────────────────────────────────────────

    _attemptReconnect() {
      if (this._reconnect.exhausted) {
        this._log.warn('Max reconnect attempts reached');
        return;
      }

      const scheduled = this._reconnect.schedule(() => {
        this._emitter.emit(Events.RECONNECTING, {
          attempt: this._reconnect.attempt,
          maxAttempts: this._reconnect.maxAttempts
        });
        this._log.info(`Reconnecting (attempt ${this._reconnect.attempt}/${this._reconnect.maxAttempts})`);
        this.connect().then(() => {
          this._emitter.emit(Events.RECONNECTED);
        }).catch(() => {});
      });

      if (!scheduled) {
        this._log.warn('Reconnection failed — max attempts exhausted');
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INTERNAL: SETUP & CLEANUP
    // ─────────────────────────────────────────────────────────────────────────

    _validateConfig(config) {
      if (!config) throw new AvatarError(ErrorCode.INVALID_CONFIG, 'Config is required', { recoverable: false });
      if (!config.clientId) throw new AvatarError(ErrorCode.INVALID_CONFIG, 'clientId is required', { recoverable: false });
      if (!config.flowId) throw new AvatarError(ErrorCode.INVALID_CONFIG, 'flowId is required', { recoverable: false });
    }

    _setupContainer() {
      if (!this._config.container) return;
      const container = typeof this._config.container === 'string'
        ? document.querySelector(this._config.container)
        : this._config.container;

      if (!container) {
        throw new AvatarError(ErrorCode.CONTAINER_NOT_FOUND, `Container not found: ${this._config.container}`, { recoverable: false });
      }

      this._videoElement = this._config.media.videoElement || this._createVideoElement(container);
      this._audioElement = this._config.media.audioElement || this._createAudioElement();
      container.appendChild(this._videoElement);
    }

    _createVideoElement(container) {
      const video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.setAttribute('aria-label', this._config.media.ariaLabel);
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.objectFit = 'contain';
      video.style.backgroundColor = '#000';
      return video;
    }

    _createAudioElement() {
      if (this._audioElement) return this._audioElement;
      const audio = document.createElement('audio');
      audio.autoplay = true;
      audio.style.display = 'none';
      document.body.appendChild(audio);
      this._audioElement = audio;
      return audio;
    }

    _removeVideoElement() {
      if (this._videoElement && this._videoElement.parentNode) {
        this._videoElement.parentNode.removeChild(this._videoElement);
      }
      if (this._audioElement && this._audioElement.parentNode) {
        this._audioElement.parentNode.removeChild(this._audioElement);
      }
    }

    _resetInternalState() {
      this._micReady = false;
      this._videoReady = false;
      this._permissionsApproved = false;
      this._sessionId = null;
      this._avatarSpeaking = false;
    }

    _cleanupConnection() {
      if (this._socket) {
        this._socket.disconnect();
        this._socket = null;
      }
    }

    _cleanupMedia() {
      this._whep.close();
      this._asr.close();
      this._audioFallback.close();
      this._mic.release();
      if (this._videoElement) this._videoElement.srcObject = null;
      if (this._audioElement) this._audioElement.srcObject = null;
    }
  }

  // Expose internals for advanced use and testing
  KalturaAvatarSDK.AvatarError = AvatarError;
  KalturaAvatarSDK._internals = { TypedEventEmitter, StateMachine, TranscriptManager, CommandRegistry, DPPManager, WHEPClient, ASRConnection, AudioFallback, MicrophoneManager, ReconnectStrategy, Logger };

  return KalturaAvatarSDK;
}));
