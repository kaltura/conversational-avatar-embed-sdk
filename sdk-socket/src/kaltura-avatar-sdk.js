/**
 * Kaltura Avatar SDK (Socket)
 * Direct Socket.IO + WebRTC — No iframe required
 *
 * @license MIT
 * @version 2.4.0
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

  const VERSION = '2.4.0';

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
    AVATAR_TEXT_READY: 'avatar-text-ready',
    AVATAR_SPEECH: 'avatar-speech',
    AVATAR_SPEAKING_END: 'avatar-speaking-end',

    USER_SPEECH: 'user-speech',
    USER_SPEAKING_START: 'user-speaking-start',

    VIDEO_READY: 'video-ready',
    AUDIO_FALLBACK: 'audio-fallback',
    MIC_GRANTED: 'mic-granted',
    MIC_DENIED: 'mic-denied',

    GENUI: 'genui',
    GENUI_BEFORE_RENDER: 'genui:before-render',
    GENUI_RENDERED: 'genui:rendered',
    GENUI_HIDDEN: 'genui:hidden',
    GENUI_INTERACTION: 'genui:interaction',
    GENUI_ERROR: 'genui:error',
    COMMAND_MATCHED: 'command-matched',
    TRANSCRIPT_ENTRY: 'transcript-entry',

    CAPTION_START: 'caption-start',
    CAPTION_SEGMENT: 'caption-segment',
    CAPTION_END: 'caption-end',
    CAPTION_INTERRUPTED: 'caption-interrupted',

    RECONNECTING: 'reconnecting',
    RECONNECTED: 'reconnected',

    // Server configuration & lifecycle
    SERVER_CONNECTED: 'server-connected',
    CONFIGURED: 'configured',
    TIME_WARNING: 'time-warning',
    TIME_EXPIRED: 'time-expired',

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
    ICE_GATHER_TIMEOUT: 1000,
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

  const GENUI_CATEGORY = Object.freeze({ BOARD: 'board', VISUAL: 'visual' });

  const BOARD_TYPES = new Set([
    'showLatex', 'showChart', 'showHtml', 'showDiagram', 'showCode', 'showIFrame',
    'contactEmail', 'contactPhone'
  ]);

  // Types that ignore server-sent hide events (e.g. hideVisuals).
  // Sticky content is only dismissed by: user clicking close, a new show* event replacing it,
  // or the developer calling sdk.hideGenUI(). This prevents content from being closed prematurely
  // when the server reacts to user speech during playback.
  // All GenUI types are sticky by default EXCEPT contact collection (which requires server handshake).
  const DEFAULT_STICKY_TYPES = new Set([
    'showMedia', 'showHtml', 'showCode', 'showDiagram', 'showChart',
    'showIFrame', 'showLatex', 'showGeneratedImages', 'showVisualChart',
    'showVisualItems', 'showVisualLink', 'showVisualPhoto',
    'showVisualTable', 'showVisualVideo'
  ]);

  const GENUI_HIDE_EVENTS = [
    'hideVisuals', 'hideCode', 'hideDiagram', 'hideIFrame', 'hideMedia', 'hideGeneratedImages'
  ];

  const HIDE_EVENT_MAP = {
    hideVisuals: 'visual',
    hideCode: 'board',
    hideDiagram: 'board',
    hideIFrame: 'board',
    hideMedia: 'visual',
    hideGeneratedImages: 'visual'
  };

  const CONTACT_VALIDATION = {
    email: /^[a-zA-Z0-9.+_-]+@[a-zA-Z0-9.-]+\.[a-zA-Z0-9-]{2,24}$/,
    phone: /^\d{8,}$/
  };

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

    register(name, pattern, handler, options) {
      const timing = options?.timing || 'after';
      const debounce = options?.debounce || 0;
      const matcher = pattern instanceof RegExp
        ? (text) => pattern.test(text)
        : (text) => text.toLowerCase().includes(pattern.toLowerCase());

      this._commands.set(name, { pattern, matcher, handler, timing, debounce, _firedThisUtterance: false, _pendingTimer: null, _pendingText: null });
      return () => {
        const cmd = this._commands.get(name);
        if (cmd?._pendingTimer) clearTimeout(cmd._pendingTimer);
        this._commands.delete(name);
      };
    }

    check(text, phase = 'after') {
      if (!text) return;
      for (const [name, cmd] of this._commands) {
        const shouldFire = cmd.timing === 'both' || cmd.timing === phase;
        if (!shouldFire) continue;
        if (cmd._firedThisUtterance) {
          // Already matched — update pending text if debouncing
          if (cmd._pendingTimer) {
            cmd._pendingText = text;
            clearTimeout(cmd._pendingTimer);
            cmd._pendingTimer = setTimeout(() => {
              cmd._pendingTimer = null;
              this._fireCommand(name, cmd, cmd._pendingText, phase);
            }, cmd.debounce);
          }
          continue;
        }
        if (!cmd.matcher(text)) continue;
        cmd._firedThisUtterance = true;

        if (cmd.debounce > 0) {
          cmd._pendingText = text;
          cmd._pendingTimer = setTimeout(() => {
            cmd._pendingTimer = null;
            this._fireCommand(name, cmd, cmd._pendingText, phase);
          }, cmd.debounce);
        } else {
          this._fireCommand(name, cmd, text, phase);
        }
      }
    }

    _fireCommand(name, cmd, text, phase) {
      const match = { command: name, text, pattern: cmd.pattern, timing: phase };
      try {
        cmd.handler(match);
      } catch (e) {
        console.error(`Command handler error [${name}]:`, e);
      }
      this._emitter.emit(Events.COMMAND_MATCHED, match);
    }

    resetUtterance() {
      for (const cmd of this._commands.values()) {
        // Flush any pending debounced command before resetting
        if (cmd._pendingTimer) {
          clearTimeout(cmd._pendingTimer);
          cmd._pendingTimer = null;
          if (cmd._pendingText) {
            const match = { command: '', text: cmd._pendingText, pattern: cmd.pattern, timing: 'before' };
            for (const [name, c] of this._commands) {
              if (c === cmd) { match.command = name; break; }
            }
            try { cmd.handler(match); } catch (e) { console.error('Command handler error:', e); }
            this._emitter.emit(Events.COMMAND_MATCHED, match);
          }
        }
        cmd._firedThisUtterance = false;
        cmd._pendingText = null;
      }
    }

    clear() {
      for (const cmd of this._commands.values()) {
        if (cmd._pendingTimer) clearTimeout(cmd._pendingTimer);
      }
      this._commands.clear();
    }

    list() {
      return [...this._commands.keys()];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CAPTION MANAGER
  // ═══════════════════════════════════════════════════════════════════════════

  const CAPTION_CSS = `
.kav-captions{position:absolute;bottom:0;left:0;right:0;display:flex;flex-direction:column;align-items:center;pointer-events:none;z-index:20;padding:0 12.5%}
.kav-captions__track{background:var(--kav-cc-bg,rgba(0,0,0,0.8));color:var(--kav-cc-text,#FFFFFF);font-family:var(--kav-cc-font,system-ui,-apple-system,sans-serif);font-size:var(--kav-cc-size,18px);line-height:1.4;padding:8px 16px;border-radius:4px;margin-bottom:24px;max-width:100%;text-align:center;opacity:0;transition:opacity var(--kav-cc-fade-in,120ms) ease-in;min-height:calc(var(--kav-cc-size,18px) * 1.4 * var(--kav-cc-lines,2) + 16px);display:flex;align-items:center;justify-content:center}
.kav-captions__track--visible{opacity:1}
.kav-captions__track--fading{opacity:0;transition:opacity var(--kav-cc-fade-out,200ms) ease-out}
.kav-captions__toggle{position:absolute;bottom:8px;right:8px;pointer-events:all;min-width:44px;min-height:44px;width:44px;height:44px;border-radius:6px;border:none;background:rgba(0,0,0,0.6);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 150ms,outline 150ms}
.kav-captions__toggle:hover{background:rgba(0,0,0,0.8)}
.kav-captions__toggle:focus-visible{outline:2px solid #fff;outline-offset:2px}
.kav-captions__toggle[aria-checked="false"]{opacity:0.5}
.kav-captions__toggle[aria-checked="false"]:hover{opacity:0.8}
.kav-captions__status{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
@media(forced-colors:active){.kav-captions__track{border:2px solid CanvasText}.kav-captions__toggle{border:2px solid ButtonText}}
@media(prefers-reduced-motion:reduce){.kav-captions__track,.kav-captions__toggle{transition:none}}
@media(max-width:600px){.kav-captions__track{font-size:20px;padding:6px 12px}.kav-captions{padding:0 5%}}
`;

  const CC_ICON_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M2 4c0-1.1.9-2 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6l-4 4V4zm5 5a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-.5H9.5V14H7v-4h2.5v-.5H10v-.5a1 1 0 0 0-1-1H7zm6 0a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-.5h-1.5V14H13v-4h2.5v-.5H16v-.5a1 1 0 0 0-1-1h-2z"/></svg>';

  class CaptionSegmenter {
    constructor(maxCharsPerLine, maxLines) {
      this._maxCharsPerLine = maxCharsPerLine;
      this._maxLines = maxLines;
      this._maxChars = maxCharsPerLine * maxLines;
    }

    segment(text) {
      if (!text || !text.trim()) return [];
      const sentences = this._splitSentences(text.trim());
      const segments = [];
      let buffer = '';

      for (const sentence of sentences) {
        if (!sentence.trim()) continue;

        if (buffer && (buffer.length + sentence.length + 1) > this._maxChars) {
          segments.push(buffer.trim());
          buffer = '';
        }

        if (sentence.length > this._maxChars) {
          if (buffer) { segments.push(buffer.trim()); buffer = ''; }
          const clauses = this._splitClauses(sentence);
          for (const clause of clauses) {
            if (buffer && (buffer.length + clause.length + 1) > this._maxChars) {
              segments.push(buffer.trim());
              buffer = '';
            }
            if (clause.length > this._maxChars) {
              if (buffer) { segments.push(buffer.trim()); buffer = ''; }
              const words = clause.split(/\s+/);
              for (const word of words) {
                if (buffer && (buffer.length + word.length + 1) > this._maxChars) {
                  segments.push(buffer.trim());
                  buffer = '';
                }
                buffer = buffer ? buffer + ' ' + word : word;
              }
            } else {
              buffer = buffer ? buffer + ' ' + clause : clause;
            }
          }
        } else {
          buffer = buffer ? buffer + ' ' + sentence : sentence;
        }
      }

      if (buffer.trim()) segments.push(buffer.trim());
      return segments.length > 0 ? segments : [text.trim()];
    }

    _splitSentences(text) {
      const result = [];
      // Match sentence-ending punctuation followed by space+uppercase or end-of-string
      const boundaries = [];
      const re = /[.!?]+/g;
      let m;
      while ((m = re.exec(text)) !== null) {
        const endPos = m.index + m[0].length;
        if (this._isSentenceEnd(text, m.index, endPos)) {
          boundaries.push(endPos);
        }
      }
      if (boundaries.length === 0) return [text];
      let start = 0;
      for (const end of boundaries) {
        const segment = text.slice(start, end).trim();
        if (segment) result.push(segment);
        start = end;
      }
      if (start < text.length) {
        const remainder = text.slice(start).trim();
        if (remainder) result.push(remainder);
      }
      return result.length > 0 ? result : [text];
    }

    _isSentenceEnd(text, dotStart, dotEnd) {
      if (dotStart <= 0) return false;
      const charBefore = text[dotStart - 1];
      // Not a sentence end if preceded/followed by a digit (e.g., $44.6)
      if (/\d/.test(charBefore) && dotEnd < text.length && /\d/.test(text[dotEnd])) return false;
      // Not a sentence end for abbreviations (single uppercase letter before dot: U.S.A.)
      if (/[A-Z]/.test(charBefore) && dotEnd < text.length && /[A-Z]/.test(text[dotEnd])) return false;
      // Must be followed by whitespace or end-of-string to be a real boundary
      if (dotEnd >= text.length) return true;
      if (/\s/.test(text[dotEnd])) return true;
      return false;
    }

    _splitClauses(text) {
      return text.split(/(?<=[,;:—])\s+/).filter(c => c.trim());
    }
  }

  class CaptionScheduler {
    constructor() { this._timers = []; }
    cancel() { for (const t of this._timers) clearTimeout(t); this._timers = []; }
  }

  class CaptionRateEstimator {
    constructor() {
      this._charsPerSec = 11;
      this._samples = 0;
    }

    get charsPerSec() { return this._charsPerSec; }

    estimateDuration(charCount) {
      return (charCount / this._charsPerSec) * 1000;
    }

    calibrate(charCount, durationMs) {
      if (durationMs <= 0 || charCount <= 0) return;
      const observed = charCount / (durationMs / 1000);
      if (observed < 1 || observed > 50) return;
      this._samples++;
      const alpha = this._samples <= 2 ? 0.5 : 0.3;
      this._charsPerSec = (1 - alpha) * this._charsPerSec + alpha * observed;
    }

    reset() {
      this._charsPerSec = 11;
      this._samples = 0;
    }
  }

  class CaptionRenderer {
    constructor(config) {
      this._config = config;
      this._root = null;
      this._track = null;
      this._segment = null;
      this._status = null;
      this._toggle = null;
      this._keyHandler = null;
      this._holdTimer = null;
      this._mutedObserver = null;
      this._videoElement = null;
    }

    attach(parent) {
      this._injectCSS();
      this._applyVars(parent);

      this._root = document.createElement('div');
      this._root.className = 'kav-captions';
      this._root.setAttribute('role', 'region');
      this._root.setAttribute('aria-label', 'Closed captions');
      this._root.setAttribute('aria-live', 'off');
      this._root.setAttribute('aria-atomic', 'true');

      this._track = document.createElement('div');
      this._track.className = 'kav-captions__track';
      this._track.setAttribute('aria-hidden', 'true');

      this._segment = document.createElement('span');
      this._segment.className = 'kav-captions__segment';
      this._track.appendChild(this._segment);

      // Screen-reader-only live region for toggle state announcements
      this._status = document.createElement('span');
      this._status.className = 'kav-captions__status';
      this._status.setAttribute('role', 'status');
      this._status.setAttribute('aria-live', 'polite');

      this._toggle = document.createElement('button');
      this._toggle.className = 'kav-captions__toggle';
      this._toggle.type = 'button';
      this._toggle.setAttribute('role', 'switch');
      this._toggle.setAttribute('aria-checked', 'true');
      this._toggle.setAttribute('aria-label', 'Closed captions');
      this._toggle.title = 'Toggle closed captions (C)';
      this._toggle.innerHTML = CC_ICON_SVG;
      this._toggle.addEventListener('click', () => this._onToggleClick());

      this._root.appendChild(this._track);
      this._root.appendChild(this._status);
      this._root.appendChild(this._toggle);
      parent.appendChild(this._root);

      this._keyHandler = (e) => {
        if (e.key === 'c' || e.key === 'C') {
          if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
          this._onToggleClick();
        }
        if (e.key === 'Escape' && this._track.classList.contains('kav-captions__track--visible')) {
          this.hideTrack();
        }
      };
      document.addEventListener('keydown', this._keyHandler);
    }

    showSegment(text) {
      if (!this._segment) return;
      if (this._holdTimer) { clearTimeout(this._holdTimer); this._holdTimer = null; }
      this._segment.textContent = text;
      this._track.classList.remove('kav-captions__track--fading');
      this._track.classList.add('kav-captions__track--visible');
    }

    hideTrack() {
      if (!this._track) return;
      this._track.classList.add('kav-captions__track--fading');
      this._track.classList.remove('kav-captions__track--visible');
    }

    hideImmediate() {
      if (this._holdTimer) { clearTimeout(this._holdTimer); this._holdTimer = null; }
      this.hideTrack();
    }

    holdThenHide(ms) {
      if (this._holdTimer) clearTimeout(this._holdTimer);
      this._holdTimer = setTimeout(() => {
        this._holdTimer = null;
        this.hideTrack();
      }, ms);
    }

    setEnabled(enabled) {
      if (!this._toggle) return;
      this._toggle.setAttribute('aria-checked', String(enabled));
      if (!enabled) this.hideImmediate();
    }

    observeMuted(videoElement) {
      this._videoElement = videoElement;
      if (!videoElement || !this._root) return;
      this._checkMuted();
      if (typeof MutationObserver !== 'undefined') {
        this._mutedObserver = new MutationObserver(() => this._checkMuted());
        this._mutedObserver.observe(videoElement, { attributes: true, attributeFilter: ['muted'] });
      }
      videoElement.addEventListener('volumechange', () => this._checkMuted());
    }

    _checkMuted() {
      if (!this._root || !this._videoElement) return;
      const muted = this._videoElement.muted || this._videoElement.volume === 0;
      this._root.setAttribute('aria-live', muted ? 'polite' : 'off');
      this._track.setAttribute('aria-hidden', muted ? 'false' : 'true');
    }

    _onToggleClick() {
      if (!this._toggle) return;
      const current = this._toggle.getAttribute('aria-checked') === 'true';
      const next = !current;
      this._toggle.setAttribute('aria-checked', String(next));
      if (!next) this.hideImmediate();
      if (this._status) this._status.textContent = next ? 'Captions on' : 'Captions off';
      try { localStorage.setItem('kav-captions-enabled', String(next)); } catch (e) { /* ignore */ }
      return next;
    }

    isToggledOn() {
      if (!this._toggle) return true;
      return this._toggle.getAttribute('aria-checked') === 'true';
    }

    setToggleVisible(visible) {
      if (!this._toggle) return;
      this._toggle.style.display = visible ? '' : 'none';
    }

    isToggleVisible() {
      if (!this._toggle) return false;
      return this._toggle.style.display !== 'none';
    }

    reattach(newParent) {
      if (!this._root) return;
      if (this._root.parentNode) this._root.parentNode.removeChild(this._root);
      this._applyVars(newParent);
      newParent.appendChild(this._root);
    }

    _applyVars(parent) {
      const c = this._config;
      if (c.fontSize) parent.style.setProperty('--kav-cc-size', typeof c.fontSize === 'number' ? c.fontSize + 'px' : c.fontSize);
      if (c.fontFamily) parent.style.setProperty('--kav-cc-font', c.fontFamily);
      if (c.textColor) parent.style.setProperty('--kav-cc-text', c.textColor);
      if (c.backgroundColor) parent.style.setProperty('--kav-cc-bg', c.backgroundColor);
      if (c.fadeInMs) parent.style.setProperty('--kav-cc-fade-in', c.fadeInMs + 'ms');
      if (c.fadeOutMs) parent.style.setProperty('--kav-cc-fade-out', c.fadeOutMs + 'ms');
      if (c.maxLines) parent.style.setProperty('--kav-cc-lines', String(c.maxLines));
    }

    _injectCSS() {
      if (document.getElementById('kav-captions-styles')) return;
      const style = document.createElement('style');
      style.id = 'kav-captions-styles';
      style.textContent = CAPTION_CSS;
      document.head.appendChild(style);
    }

    detach() {
      if (this._keyHandler) { document.removeEventListener('keydown', this._keyHandler); this._keyHandler = null; }
      if (this._holdTimer) { clearTimeout(this._holdTimer); this._holdTimer = null; }
      if (this._mutedObserver) { this._mutedObserver.disconnect(); this._mutedObserver = null; }
      if (this._root && this._root.parentNode) { this._root.parentNode.removeChild(this._root); }
      this._root = null;
      this._track = null;
      this._segment = null;
      this._toggle = null;
      this._status = null;
    }
  }

  class CaptionManager {
    /**
     * Timing design:
     *
     *   onChunk()         — Buffers text. Emits caption-start on first chunk.
     *   onSpeakingStart() — Segments the full buffer, shows segment[0], starts tick.
     *   _onTick() (200ms) — Checks if current segment's display time is up.
     *                        Display time = segment.length / rate (chars/sec).
     *                        If time is up, advance to next segment.
     *   onChunk() while speaking — Appends to buffer, re-segments. Tick picks
     *                        up new trailing segments naturally.
     *   onSpeakingEnd()   — Flushes any unseen segments, calibrates rate.
     *
     * Key invariant: each segment's display duration is computed from its own
     * character count at show-time. No cumulative offsets, no total-duration
     * estimation, no reference to buffer length. Simple and drift-free.
     */
    constructor(emitter, config, logger) {
      this._emitter = emitter;
      this._log = logger;

      const c = config || {};
      this._enabled = c.enabled || false;
      this._render = c.render !== false;
      this._maxCharsPerLine = c.maxCharsPerLine || 47;
      this._maxLines = c.maxLines || 2;
      this._holdAfterEndMs = c.holdAfterEndMs || 2000;

      this._segmenter = new CaptionSegmenter(this._maxCharsPerLine, this._maxLines);
      this._scheduler = new CaptionScheduler();
      this._rate = new CaptionRateEstimator();
      this._renderer = this._render ? new CaptionRenderer(c) : null;

      this._responseId = null;
      this._textBuffer = '';
      this._segments = [];
      this._displayedIndex = -1;
      this._displayedAt = 0;
      this._displayedLen = 0;
      this._speakingStartTime = 0;
      this._speaking = false;
      this._active = false;
      this._tick = null;

      if (c.enabled === undefined && typeof localStorage !== 'undefined') {
        try {
          const stored = localStorage.getItem('kav-captions-enabled');
          if (stored === 'false') this._enabled = false;
          else if (stored === 'true') this._enabled = true;
        } catch (e) { /* ignore */ }
      }
    }

    attach(parent, videoElement) {
      if (this._renderer && parent) {
        this._renderer.attach(parent);
        this._renderer.setEnabled(this._enabled);
        if (videoElement) this._renderer.observeMuted(videoElement);
      }
    }

    setEnabled(enabled) {
      this._enabled = enabled;
      if (this._renderer) this._renderer.setEnabled(enabled);
      try { localStorage.setItem('kav-captions-enabled', String(enabled)); } catch (e) { /* ignore */ }
    }

    isEnabled() { return this._enabled; }

    setStyle(style) {
      if (!this._renderer || !this._renderer._root) return;
      const parent = this._renderer._root.parentNode;
      if (!parent) return;
      if (style.fontSize) parent.style.setProperty('--kav-cc-size', typeof style.fontSize === 'number' ? style.fontSize + 'px' : style.fontSize);
      if (style.fontFamily) parent.style.setProperty('--kav-cc-font', style.fontFamily);
      if (style.textColor) parent.style.setProperty('--kav-cc-text', style.textColor);
      if (style.backgroundColor) parent.style.setProperty('--kav-cc-bg', style.backgroundColor);
    }

    setContainer(container) {
      if (!this._renderer) return;
      const el = typeof container === 'string' ? document.querySelector(container) : container;
      if (el) this._renderer.reattach(el);
    }

    setToggleVisible(visible) {
      if (this._renderer) this._renderer.setToggleVisible(visible);
    }

    isToggleVisible() {
      return this._renderer ? this._renderer.isToggleVisible() : false;
    }

    onChunk(text, speechId) {
      if (!this._enabled) return;
      if (!text || !text.trim()) return;

      const rid = speechId || this._responseId || this._generateId();
      if (rid !== this._responseId) {
        if (this._active) this._interrupt();
        this._responseId = rid;
        this._textBuffer = '';
        this._segments = [];
        this._displayedIndex = -1;
        this._displayedAt = 0;
        this._displayedLen = 0;
        this._speaking = false;
        this._active = true;
        this._emitter.emit(Events.CAPTION_START, { responseId: this._responseId });
      }

      this._textBuffer += text;

      // Re-segment on every chunk so the tick has up-to-date segments
      this._segments = this._segmenter.segment(this._textBuffer);
    }

    onSpeakingStart() {
      if (!this._enabled || !this._active) return;
      this._speakingStartTime = Date.now();
      this._speaking = true;

      // Segment current buffer and show first segment if it's complete
      this._segments = this._segmenter.segment(this._textBuffer);
      if (this._segments.length > 0 && this._displayedIndex < 0) {
        // Only show if: multiple segments exist (first ends at natural boundary)
        // OR the buffer ends with sentence punctuation (complete thought)
        if (this._segments.length > 1 || /[.!?]["'’)]*\s*$/.test(this._textBuffer)) {
          this._show(0);
        }
      }

      this._startTick();
    }

    onSpeakingEnd(fullText, speechId) {
      if (!this._enabled) {
        this._reset();
        return;
      }

      this._speaking = false;
      this._stopTick();

      // Fallback: no chunks arrived at all
      if (!this._active && fullText && fullText.trim()) {
        this._responseId = speechId || this._generateId();
        this._textBuffer = fullText;
        this._active = true;
        this._emitter.emit(Events.CAPTION_START, { responseId: this._responseId });
        this._segments = this._segmenter.segment(fullText);
        for (let i = 0; i < this._segments.length; i++) {
          this._show(i);
        }
      } else if (this._active) {
        // Use authoritative full text, flush any remaining segments
        if (fullText && fullText.trim()) this._textBuffer = fullText;
        this._segments = this._segmenter.segment(this._textBuffer);
        for (let i = this._displayedIndex + 1; i < this._segments.length; i++) {
          this._show(i);
        }
      }

      // Calibrate rate from observed speaking duration
      if (this._speakingStartTime > 0 && this._textBuffer) {
        const duration = Date.now() - this._speakingStartTime;
        this._rate.calibrate(this._textBuffer.length, duration);
      }

      if (this._active) {
        this._emitter.emit(Events.CAPTION_END, { responseId: this._responseId });
        if (this._renderer && this._renderer.isToggledOn()) {
          this._renderer.holdThenHide(this._holdAfterEndMs);
        }
      }

      this._reset();
    }

    interrupt() { this._interrupt(); }

    _interrupt() {
      if (!this._active) return;
      this._scheduler.cancel();
      this._stopTick();
      this._emitter.emit(Events.CAPTION_INTERRUPTED, {
        responseId: this._responseId,
        lastSegmentIndex: Math.max(0, this._displayedIndex)
      });
      if (this._renderer) this._renderer.hideImmediate();
      this._reset();
    }

    // ── Tick ──────────────────────────────────────────────────────────────

    _startTick() {
      if (this._tick) return;
      this._tick = setInterval(() => this._onTick(), 200);
    }

    _stopTick() {
      if (this._tick) { clearInterval(this._tick); this._tick = null; }
    }

    _onTick() {
      // Nothing shown yet — wait for a complete first segment
      if (this._displayedIndex < 0) {
        if (this._segments.length > 1 || /[.!?]["'')]*\s*$/.test(this._textBuffer)) {
          this._show(0);
        }
        return;
      }

      const nextIndex = this._displayedIndex + 1;
      if (nextIndex >= this._segments.length) return;

      // Has the current segment been visible long enough?
      const elapsed = Date.now() - this._displayedAt;
      const needed = (this._displayedLen / this._rate.charsPerSec) * 1000;
      if (elapsed >= needed) {
        this._show(nextIndex);
      }
    }

    // ── Display ───────────────────────────────────────────────────────────

    _show(index) {
      if (index <= this._displayedIndex) return;
      const text = this._segments[index];
      if (!text) return;

      this._displayedIndex = index;
      this._displayedAt = Date.now();
      this._displayedLen = text.length;

      this._emitter.emit(Events.CAPTION_SEGMENT, {
        text,
        index,
        total: this._segments.length,
        isFinal: index === this._segments.length - 1,
        responseId: this._responseId
      });
      if (this._renderer && this._renderer.isToggledOn()) {
        this._renderer.showSegment(text);
      }
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────

    _reset() {
      this._active = false;
      this._textBuffer = '';
      this._segments = [];
      this._displayedIndex = -1;
      this._displayedAt = 0;
      this._displayedLen = 0;
      this._speakingStartTime = 0;
      this._speaking = false;
      this._stopTick();
    }

    _generateId() {
      return 'cc-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    destroy() {
      this._scheduler.cancel();
      this._stopTick();
      if (this._renderer) this._renderer.detach();
      this._reset();
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
    set onConnectionLost(fn) { this._onConnectionLost = fn; }

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

      this._pc.oniceconnectionstatechange = () => {
        const state = this._pc?.iceConnectionState;
        this._log.debug('WHEP ICE state:', state);
        if (state === 'failed' || state === 'disconnected') {
          this._log.warn('WHEP connection lost — video stream may be stale');
          if (this._onConnectionLost) this._onConnectionLost(state);
        }
      };

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
        let hasCandidate = false;
        this._pc.onicecandidate = (e) => {
          if (e.candidate && !hasCandidate) {
            hasCandidate = true;
            // With relay-only policy, first TURN candidate is sufficient
            clearTimeout(timeout);
            resolve();
          } else if (!e.candidate) {
            clearTimeout(timeout);
            resolve();
          }
        };
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
  // GENUI: LIBRARY LOADER
  // ═══════════════════════════════════════════════════════════════════════════

  class LibraryLoader {
    constructor(logger) {
      this._log = logger;
      this._loaded = new Map();
      this._providers = new Map();
      this._urls = new Map([
        ['chartjs', 'https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js'],
        ['mermaid', 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js'],
        ['katex', 'https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.js'],
        ['katex-css', 'https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.css'],
        ['codemirror', 'https://cdn.jsdelivr.net/npm/codemirror@5/lib/codemirror.js'],
        ['codemirror-css', 'https://cdn.jsdelivr.net/npm/codemirror@5/lib/codemirror.css']
      ]);
      this._globals = new Map([
        ['chartjs', 'Chart'],
        ['mermaid', 'mermaid'],
        ['katex', 'katex'],
        ['codemirror', 'CodeMirror']
      ]);
    }

    /** @param {string} name @param {string} url */
    setUrl(name, url) { this._urls.set(name, url); }

    /** @param {string} name @param {*} library */
    provide(name, library) { this._providers.set(name, library); }

    /** @param {string} name @returns {Promise<*>} */
    load(name) {
      if (this._loaded.has(name)) return this._loaded.get(name);
      const promise = this._resolve(name);
      this._loaded.set(name, promise);
      return promise;
    }

    async _resolve(name) {
      if (this._providers.has(name)) {
        return this._providers.get(name);
      }
      const globalName = this._globals.get(name);
      if (globalName && typeof window !== 'undefined' && window[globalName]) {
        return window[globalName];
      }
      const url = this._urls.get(name);
      if (!url) throw new Error(`No URL configured for library: ${name}`);
      if (url.endsWith('.css')) return this._loadCSS(url);
      return this._loadScript(url, globalName);
    }

    _loadScript(url, globalName) {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.async = true;
        script.onload = () => resolve(globalName ? window[globalName] : undefined);
        script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
        document.head.appendChild(script);
      });
    }

    _loadCSS(url) {
      return new Promise((resolve, reject) => {
        if (document.querySelector(`link[href="${url}"]`)) { resolve(); return; }
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = url;
        link.onload = () => resolve();
        link.onerror = () => reject(new Error(`Failed to load CSS: ${url}`));
        document.head.appendChild(link);
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GENUI: RENDERER REGISTRY
  // ═══════════════════════════════════════════════════════════════════════════

  class RendererRegistry {
    constructor() {
      this._renderers = new Map();
      this._middleware = [];
    }

    /** @param {string} type @param {object|function} renderer @returns {function} unsubscribe */
    register(type, renderer) {
      if (typeof renderer === 'function') renderer = { render: renderer };
      this._renderers.set(type, renderer);
      return () => this._renderers.delete(type);
    }

    /** @param {string} type @returns {object|null} */
    get(type) { return this._renderers.get(type) || null; }

    /** @param {string} type @returns {boolean} */
    has(type) { return this._renderers.has(type); }

    /** @param {object} middleware @returns {function} unsubscribe */
    use(middleware) {
      this._middleware.push(middleware);
      return () => {
        const idx = this._middleware.indexOf(middleware);
        if (idx >= 0) this._middleware.splice(idx, 1);
      };
    }

    getMiddleware() { return this._middleware.slice(); }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GENUI: CONTAINER (DOM management)
  // ═══════════════════════════════════════════════════════════════════════════

  const GENUI_CSS = `
.kav-genui{position:absolute;inset:0;pointer-events:none;z-index:10;font-family:inherit}
.kav-genui__board{position:absolute;inset:0;z-index:100;pointer-events:all;background:var(--kav-bg,rgba(13,13,24,0.95));display:flex;align-items:center;justify-content:center;padding:var(--kav-padding,20px);overflow:auto;flex-direction:column}
.kav-genui__visual{position:absolute;inset:0;z-index:90;pointer-events:all;display:flex;align-items:stretch;opacity:0;transform:translateX(-20px);transition:opacity 0.4s ease,transform 0.4s ease}
.kav-genui__visual--active{opacity:1;transform:translateX(0)}
.kav-genui__visual-content{flex:1;background:var(--kav-bg,rgba(13,13,24,0.97));padding:var(--kav-padding,24px);overflow:auto;display:flex;align-items:center;justify-content:center;min-width:0}
.kav-genui__visual-pip{width:280px;min-width:280px;display:flex;align-items:flex-end;justify-content:center;padding:12px;background:rgba(0,0,0,0.4)}
.kav-genui__dismiss{position:absolute;top:12px;right:12px;background:rgba(255,255,255,0.1);backdrop-filter:blur(4px);border:none;color:var(--kav-text,#e0e0e8);width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:18px;z-index:10;display:flex;align-items:center;justify-content:center;transition:background 0.2s}
.kav-genui__dismiss:hover{background:rgba(255,255,255,0.25)}
.kav-genui__content{color:var(--kav-text,#e0e0e8);width:100%;max-width:700px}
.kav-genui__visual-table{width:100%;border-collapse:collapse;font-size:14px}
.kav-genui__visual-table th,.kav-genui__visual-table td{padding:10px 14px;border:1px solid rgba(255,255,255,0.1);text-align:left}
.kav-genui__visual-table th{background:rgba(255,255,255,0.05);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:0.5px}
.kav-genui__visual-link{display:inline-block;padding:12px 24px;background:var(--kav-accent,#667eea);color:#fff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:500;transition:opacity 0.2s}
.kav-genui__visual-link:hover{opacity:0.85}
.kav-genui__visual-items{display:flex;flex-wrap:wrap;gap:10px}
.kav-genui__visual-item-btn{padding:10px 20px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);color:var(--kav-text,#e0e0e8);border-radius:24px;cursor:pointer;font-size:14px;transition:background 0.2s,border-color 0.2s}
.kav-genui__visual-item-btn:hover{background:rgba(255,255,255,0.12);border-color:rgba(255,255,255,0.3)}
.kav-genui__code-question{margin-bottom:12px;font-size:14px;color:var(--kav-text,#e0e0e8)}
.kav-genui__code-submit{margin-top:12px;padding:10px 24px;background:var(--kav-accent,#667eea);border:none;color:#fff;border-radius:8px;cursor:pointer;font-size:13px}
.kav-genui__code-submit:hover{opacity:0.9}
.kav-genui__iframe{width:100%;height:100%;min-height:400px;border:none;border-radius:8px}
.kav-genui__media-gallery,.kav-genui__generated-gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.kav-genui__media-item,.kav-genui__generated-item{width:100%;border-radius:8px;object-fit:cover}
.kav-genui__visual-photo{max-width:100%;max-height:100%;object-fit:contain;border-radius:8px}
.kav-genui__contact{text-align:center;padding:32px;max-width:360px;margin:0 auto}
.kav-genui__contact-label{font-size:14px;margin-bottom:16px;color:var(--kav-text,#e0e0e8)}
.kav-genui__contact-input{width:100%;padding:12px 16px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.2);border-radius:8px;color:var(--kav-text,#e0e0e8);font-size:14px;outline:none}
.kav-genui__contact-input:focus{border-color:var(--kav-accent,#667eea)}
.kav-genui__contact-actions{display:flex;gap:12px;margin-top:16px;justify-content:center}
.kav-genui__contact-submit{padding:10px 24px;background:var(--kav-accent,#667eea);border:none;color:#fff;border-radius:8px;cursor:pointer;font-size:14px}
.kav-genui__contact-submit:disabled{opacity:0.4;cursor:not-allowed}
.kav-genui__contact-skip{padding:10px 24px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:var(--kav-text,#e0e0e8);border-radius:8px;cursor:pointer;font-size:14px}
.kav-genui__contact-skip:hover{background:rgba(255,255,255,0.15)}
.kav-genui__contact-hint{font-size:11px;color:rgba(255,255,255,0.4);margin-top:12px}
`;

  class GenUIContainer {
    constructor(config, logger) {
      this._log = logger;
      this._config = config;
      this._root = null;
      this._boardLayer = null;
      this._visualLayer = null;
      this._visualContent = null;
      this._visualPip = null;
      this._boardDismiss = null;
      this._visualDismiss = null;
      this._onHide = null;
      this._keyHandler = null;
      this._parent = null;
      this._videoEl = null;
    }

    attach(parent, onHide) {
      this._onHide = onHide;
      this._parent = parent;
      this._injectCSS();

      this._root = document.createElement('div');
      this._root.className = 'kav-genui';
      this._root.setAttribute('aria-live', 'polite');

      this._boardLayer = document.createElement('div');
      this._boardLayer.className = 'kav-genui__board';
      this._boardLayer.setAttribute('role', 'dialog');
      this._boardLayer.setAttribute('aria-modal', 'true');
      this._boardLayer.style.display = 'none';

      this._boardDismiss = this._createDismissBtn(() => this.hideBoard());
      this._boardLayer.appendChild(this._boardDismiss);

      this._visualLayer = document.createElement('div');
      this._visualLayer.className = 'kav-genui__visual';
      this._visualLayer.style.display = 'none';

      this._visualContent = document.createElement('div');
      this._visualContent.className = 'kav-genui__visual-content';

      this._visualPip = document.createElement('div');
      this._visualPip.className = 'kav-genui__visual-pip';

      this._visualDismiss = this._createDismissBtn(() => this.hideVisual());

      this._visualLayer.appendChild(this._visualContent);
      this._visualLayer.appendChild(this._visualPip);
      this._visualLayer.appendChild(this._visualDismiss);

      this._root.appendChild(this._boardLayer);
      this._root.appendChild(this._visualLayer);
      parent.appendChild(this._root);

      this._keyHandler = (e) => {
        if (e.key === 'Escape') {
          if (this._boardLayer.style.display !== 'none') this.hideBoard();
          else if (this._visualLayer.style.display !== 'none') this.hideVisual();
        }
      };
      document.addEventListener('keydown', this._keyHandler);
    }

    showBoard(element) {
      this._clearLayer(this._boardLayer);
      this._boardLayer.appendChild(element);
      this._boardLayer.appendChild(this._boardDismiss);
      this._boardLayer.style.display = '';
    }

    showVisual(element) {
      this._visualContent.innerHTML = '';
      this._visualContent.appendChild(element);
      this._moveVideoToPip();
      this._visualLayer.style.display = '';
      requestAnimationFrame(() => {
        this._visualLayer.classList.add('kav-genui__visual--active');
      });
    }

    hideBoard() {
      if (!this._boardLayer) return false;
      if (this._boardLayer.style.display === 'none') return false;
      this._clearLayer(this._boardLayer);
      this._boardLayer.style.display = 'none';
      if (this._onHide) this._onHide('board');
      return true;
    }

    hideVisual() {
      if (!this._visualLayer) return false;
      if (this._visualLayer.style.display === 'none') return false;
      this._visualLayer.classList.remove('kav-genui__visual--active');
      this._restoreVideo();
      this._visualContent.innerHTML = '';
      this._visualLayer.style.display = 'none';
      if (this._onHide) this._onHide('visual');
      return true;
    }

    hideAll() { this.hideBoard(); this.hideVisual(); }

    _moveVideoToPip() {
      if (!this._parent) return;
      this._videoEl = this._parent.querySelector('video');
      if (this._videoEl) {
        this._videoEl._origStyles = {
          width: this._videoEl.style.width,
          height: this._videoEl.style.height,
          borderRadius: this._videoEl.style.borderRadius,
          transition: this._videoEl.style.transition,
          objectFit: this._videoEl.style.objectFit
        };
        this._videoEl.style.transition = 'all 0.4s ease';
        this._videoEl.style.width = '100%';
        this._videoEl.style.height = 'auto';
        this._videoEl.style.maxHeight = '240px';
        this._videoEl.style.borderRadius = '12px';
        this._videoEl.style.objectFit = 'cover';
        this._visualPip.appendChild(this._videoEl);
      }
    }

    _restoreVideo() {
      if (this._videoEl && this._parent) {
        const orig = this._videoEl._origStyles || {};
        this._videoEl.style.transition = 'all 0.4s ease';
        this._videoEl.style.width = orig.width || '';
        this._videoEl.style.height = orig.height || '';
        this._videoEl.style.maxHeight = '';
        this._videoEl.style.borderRadius = orig.borderRadius || '';
        this._videoEl.style.objectFit = orig.objectFit || '';
        this._parent.insertBefore(this._videoEl, this._parent.firstChild);
        this._videoEl = null;
      }
    }

    get isAttached() { return this._root !== null && this._root.parentNode !== null; }

    detach() {
      this._restoreVideo();
      if (this._keyHandler) document.removeEventListener('keydown', this._keyHandler);
      if (this._root && this._root.parentNode) this._root.parentNode.removeChild(this._root);
      this._root = null;
    }

    _clearLayer(layer) {
      while (layer.firstChild) layer.removeChild(layer.firstChild);
    }

    _createDismissBtn(onClick) {
      const btn = document.createElement('button');
      btn.className = 'kav-genui__dismiss';
      btn.setAttribute('aria-label', 'Close');
      btn.textContent = '×';
      btn.addEventListener('click', onClick);
      return btn;
    }

    _injectCSS() {
      if (document.getElementById('kav-genui-styles')) return;
      const style = document.createElement('style');
      style.id = 'kav-genui-styles';
      style.textContent = GENUI_CSS;
      document.head.appendChild(style);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GENUI: BUILT-IN RENDERERS
  // ═══════════════════════════════════════════════════════════════════════════

  const builtinRenderers = {
    showHtml: {
      render(data, container, ctx) {
        const content = data.mediaUrl || '';
        container.innerHTML = content;
        container.addEventListener('click', (e) => {
          const text = e.target.textContent || '';
          if (text.trim()) ctx.emit('onHtmlElementClick', { htmlText: text.trim() });
        });
      }
    },

    showIFrame: {
      render(data, container) {
        const url = data.iframeUrl || data.mediaUrl;
        if (!url) return;
        const iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.className = 'kav-genui__iframe';
        iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
        container.appendChild(iframe);
      }
    },

    showVisualVideo: {
      render(data, container) {
        const url = data.videoUrl || data.mediaUrl;
        if (!url || typeof url !== 'string') return;
        try { const u = new URL(url); if (!u.protocol.startsWith('http')) return; } catch (e) { return; }
        const iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.className = 'kav-genui__iframe';
        iframe.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture; microphone; camera');
        iframe.allowFullscreen = true;
        iframe.title = 'visual-video';
        container.appendChild(iframe);
      }
    },

    showVisualLink: {
      render(data, container) {
        const url = data.linkUrl || data.mediaUrl;
        const text = data.linkText || url || 'Open Link';
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.className = 'kav-genui__visual-link';
        a.textContent = text;
        container.appendChild(a);
      }
    },

    showVisualPhoto: {
      render(data, container) {
        const url = data.photoUrl || data.mediaUrl;
        if (!url) return;
        const img = document.createElement('img');
        img.src = url;
        img.className = 'kav-genui__visual-photo';
        img.alt = 'Shared image';
        container.appendChild(img);
      }
    },

    showVisualItems: {
      render(data, container, ctx) {
        let items = data.mediaUrl;
        if (typeof items === 'string') { try { items = JSON.parse(items); } catch (e) { items = [items]; } }
        if (!Array.isArray(items)) items = [items];
        const list = document.createElement('div');
        list.className = 'kav-genui__visual-items';
        items.forEach(item => {
          const btn = document.createElement('button');
          btn.className = 'kav-genui__visual-item-btn';
          btn.textContent = String(item);
          btn.addEventListener('click', () => ctx.emit('onHtmlElementClick', { htmlText: String(item) }));
          list.appendChild(btn);
        });
        container.appendChild(list);
      }
    },

    showVisualTable: {
      render(data, container) {
        let tableData = data.mediaUrl;
        if (typeof tableData === 'string') { try { tableData = JSON.parse(tableData); } catch (e) { return; } }
        if (!tableData || typeof tableData !== 'object') return;
        const columns = Object.keys(tableData);
        if (columns.length === 0) return;
        const table = document.createElement('table');
        table.className = 'kav-genui__visual-table';
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        columns.forEach(col => { const th = document.createElement('th'); th.textContent = col; headerRow.appendChild(th); });
        thead.appendChild(headerRow);
        table.appendChild(thead);
        const tbody = document.createElement('tbody');
        const rowCount = Math.max(...columns.map(c => Array.isArray(tableData[c]) ? tableData[c].length : 0));
        for (let i = 0; i < rowCount; i++) {
          const tr = document.createElement('tr');
          columns.forEach(col => { const td = document.createElement('td'); td.textContent = Array.isArray(tableData[col]) ? (tableData[col][i] ?? '') : ''; tr.appendChild(td); });
          tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        container.appendChild(table);
      }
    },

    showMedia: {
      render(data, container) {
        let urls = data.mediaUrl;
        if (!Array.isArray(urls)) urls = [urls];
        const gallery = document.createElement('div');
        gallery.className = 'kav-genui__media-gallery';
        urls.forEach(src => {
          if (!src) return;
          const img = document.createElement('img');
          img.src = src;
          img.className = 'kav-genui__media-item';
          img.alt = 'Media';
          gallery.appendChild(img);
        });
        container.appendChild(gallery);
      }
    },

    showGeneratedImages: {
      render(data, container) {
        let urls = data.mediaUrl;
        if (!Array.isArray(urls)) urls = [urls];
        const gallery = document.createElement('div');
        gallery.className = 'kav-genui__generated-gallery';
        urls.forEach(src => {
          if (!src) return;
          const img = document.createElement('img');
          img.src = src;
          img.className = 'kav-genui__generated-item';
          img.alt = 'Generated image';
          gallery.appendChild(img);
        });
        container.appendChild(gallery);
      }
    },

    showChart: {
      async render(data, container, ctx) {
        const Chart = await ctx.loader.load('chartjs');
        let config = data.mediaUrl;
        if (typeof config === 'string') { try { config = JSON.parse(config); } catch (e) { return; } }
        if (!config || typeof config !== 'object') return;
        const wrapper = document.createElement('div');
        wrapper.style.position = 'relative';
        wrapper.style.width = '100%';
        wrapper.style.minHeight = '250px';
        const canvas = document.createElement('canvas');
        wrapper.appendChild(canvas);
        container.appendChild(wrapper);
        if (!config.options) config.options = {};
        config.options.responsive = true;
        config.options.maintainAspectRatio = true;
        const instance = new Chart(canvas.getContext('2d'), config);
        container._chartInstance = instance;
      },
      hide(container) {
        if (container._chartInstance) { container._chartInstance.destroy(); container._chartInstance = null; }
      }
    },

    showVisualChart: {
      async render(data, container, ctx) {
        return builtinRenderers.showChart.render(data, container, ctx);
      },
      hide(container) { builtinRenderers.showChart.hide(container); }
    },

    showDiagram: {
      async render(data, container, ctx) {
        const mermaid = await ctx.loader.load('mermaid');
        mermaid.initialize({ startOnLoad: false, theme: 'dark' });
        const syntax = data.mediaUrl || '';
        const id = 'kav-mermaid-' + Date.now();
        const { svg } = await mermaid.render(id, syntax);
        container.innerHTML = svg;
      }
    },

    showLatex: {
      async render(data, container, ctx) {
        await ctx.loader.load('katex-css');
        const katex = await ctx.loader.load('katex');
        const formula = data.mediaUrl || '';
        katex.render(formula, container, { throwOnError: false, displayMode: true });
      }
    },

    showCode: {
      async render(data, container, ctx) {
        await ctx.loader.load('codemirror-css');
        const CM = await ctx.loader.load('codemirror');
        let codeData = data.mediaUrl;
        if (typeof codeData === 'string') { try { codeData = JSON.parse(codeData); } catch (e) { codeData = { code: codeData }; } }
        const { code, question } = codeData || {};
        if (question) {
          const q = document.createElement('div');
          q.className = 'kav-genui__code-question';
          q.textContent = question;
          container.appendChild(q);
        }
        const editorEl = document.createElement('div');
        container.appendChild(editorEl);
        const editor = CM(editorEl, { value: code || '', lineNumbers: true, theme: 'default', mode: 'javascript' });
        const submitBtn = document.createElement('button');
        submitBtn.className = 'kav-genui__code-submit';
        submitBtn.textContent = 'Submit Code';
        submitBtn.addEventListener('click', () => ctx.emit('codeBlockComplete', { code: editor.getValue() }));
        container.appendChild(submitBtn);
      }
    },

    contactEmail: {
      render(data, container, ctx) {
        container.innerHTML = `
          <div class="kav-genui__contact">
            <label class="kav-genui__contact-label" for="kav-contact-email">Please enter your email address</label>
            <input type="email" id="kav-contact-email" class="kav-genui__contact-input" placeholder="Your Email Address" autocomplete="email">
            <div class="kav-genui__contact-actions">
              <button class="kav-genui__contact-submit" disabled>Submit</button>
              <button class="kav-genui__contact-skip">Skip</button>
            </div>
            <p class="kav-genui__contact-hint">The avatar is not listening during input</p>
          </div>`;
        const input = container.querySelector('.kav-genui__contact-input');
        const submit = container.querySelector('.kav-genui__contact-submit');
        const skip = container.querySelector('.kav-genui__contact-skip');
        input.addEventListener('input', () => { submit.disabled = !CONTACT_VALIDATION.email.test(input.value); });
        submit.addEventListener('click', () => {
          ctx.emit('contactInfoReceived', { contact_info: { info_type: 'email', info_value: input.value } });
          ctx.hideGenUI();
        });
        skip.addEventListener('click', () => {
          ctx.emit('contactInfoRejected', { type: 'email' });
          ctx.hideGenUI();
        });
        setTimeout(() => input.focus(), 50);
      }
    },

    contactPhone: {
      render(data, container, ctx) {
        container.innerHTML = `
          <div class="kav-genui__contact">
            <label class="kav-genui__contact-label" for="kav-contact-phone">Please enter your phone number</label>
            <input type="tel" id="kav-contact-phone" class="kav-genui__contact-input" placeholder="Your Phone Number" autocomplete="tel">
            <div class="kav-genui__contact-actions">
              <button class="kav-genui__contact-submit" disabled>Submit</button>
              <button class="kav-genui__contact-skip">Skip</button>
            </div>
            <p class="kav-genui__contact-hint">The avatar is not listening during input</p>
          </div>`;
        const input = container.querySelector('.kav-genui__contact-input');
        const submit = container.querySelector('.kav-genui__contact-submit');
        const skip = container.querySelector('.kav-genui__contact-skip');
        input.addEventListener('input', () => { submit.disabled = !CONTACT_VALIDATION.phone.test(input.value.replace(/\D/g, '')); });
        submit.addEventListener('click', () => {
          ctx.emit('contactInfoReceived', { contact_info: { info_type: 'phone', info_value: input.value } });
          ctx.hideGenUI();
        });
        skip.addEventListener('click', () => {
          ctx.emit('contactInfoRejected', { type: 'phone' });
          ctx.hideGenUI();
        });
        setTimeout(() => input.focus(), 50);
      }
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // GENUI: MANAGER (orchestrator)
  // ═══════════════════════════════════════════════════════════════════════════

  class GenUIManager {
    constructor(emitter, config, logger) {
      this._emitter = emitter;
      this._log = logger;
      this._config = config || {};
      this._enabled = this._config.enabled !== false;
      this._socket = null;

      this._container = new GenUIContainer(this._config, logger);
      this._registry = new RendererRegistry();
      this._loader = new LibraryLoader(logger);

      this._activeType = null;
      this._activeCategory = null;
      this._pausedByGenUI = false;
      this._onPause = null;
      this._onResume = null;
      this._stickyTypes = this._config.stickyTypes instanceof Set
        ? this._config.stickyTypes
        : DEFAULT_STICKY_TYPES;
      this._pauseTypes = this._config.pauseTypes instanceof Set
        ? this._config.pauseTypes
        : new Set(this._config.pauseTypes || ['showVisualVideo']);

      if (this._config.libraries) {
        Object.entries(this._config.libraries).forEach(([name, lib]) => { if (lib) this._loader.provide(name, lib); });
      }
      if (this._config.renderers) {
        Object.entries(this._config.renderers).forEach(([type, r]) => { if (r) this._registry.register(type, r); });
      }

      this._registerBuiltins();
    }

    attach(parent) {
      if (!this._enabled || !parent) return;
      this._container.attach(parent, (category) => {
        this._emitter.emit(Events.GENUI_HIDDEN, { type: this._activeType, category });
        this._activeType = null;
        this._activeCategory = null;
        this._resumeIfPaused();
      });
    }

    bindSocket(socket) {
      this._socket = socket;
      GENUI_EVENTS.forEach(evt => { socket.on(evt, (data) => this._handleShow(evt, data)); });
      GENUI_HIDE_EVENTS.forEach(evt => { socket.on(evt, () => this._handleHide(evt)); });
      socket.on('contactCollector', (data) => {
        const contactType = (data?.contact_type || 'email').toLowerCase();
        const type = 'contact' + contactType.charAt(0).toUpperCase() + contactType.slice(1);
        this._handleShow(type, { contact_type: contactType });
      });
    }

    async _handleShow(type, data) {
      const category = BOARD_TYPES.has(type) ? GENUI_CATEGORY.BOARD : GENUI_CATEGORY.VISUAL;

      if (this._pauseTypes.has(type) && !this._pausedByGenUI) {
        if (this._onPause) this._onPause();
        else if (this._socket) this._socket.emit('pauseConversation', {});
        this._pausedByGenUI = true;
        this._log.debug('Conversation paused for GenUI type:', type);
      }

      const context = { type, data, category, cancelled: false };

      for (const mw of this._registry.getMiddleware()) {
        if (mw.beforeRender) {
          try { await mw.beforeRender(context); } catch (e) { this._log.warn('Middleware error', e.message); }
          if (context.cancelled) { this._log.debug('GenUI render cancelled by middleware', type); break; }
        }
      }

      this._emitter.emit(Events.GENUI_BEFORE_RENDER, { type, data: context.data, category });
      this._emitter.emit(Events.GENUI, { type, data });

      if (context.cancelled || !this._enabled || !this._container.isAttached) return;

      const renderer = this._registry.get(type);
      if (!renderer) { this._log.debug('No renderer for type', type); return; }

      const renderTarget = document.createElement('div');
      renderTarget.className = 'kav-genui__content kav-genui__content--' + type;
      renderTarget.dataset.genuiType = type;

      const self = this;
      const renderContext = {
        loader: this._loader,
        type,
        category,
        emit(event, payload) {
          if (self._socket) self._socket.emit(event, payload);
          self._emitter.emit(Events.GENUI_INTERACTION, { interactionType: event, payload });
        },
        hideGenUI() { self.hide(category); }
      };

      try {
        if (category === GENUI_CATEGORY.BOARD) this._container.showBoard(renderTarget);
        else this._container.showVisual(renderTarget);

        await renderer.render(context.data, renderTarget, renderContext);

        this._activeType = type;
        this._activeCategory = category;

        for (const mw of this._registry.getMiddleware()) {
          if (mw.afterRender) {
            try { await mw.afterRender({ type, data: context.data, category, element: renderTarget }); } catch (e) { /* ignore */ }
          }
        }
        this._emitter.emit(Events.GENUI_RENDERED, { type, data: context.data, category, element: renderTarget });
      } catch (err) {
        this._log.error('GenUI render error [' + type + ']:', err.message);
        this._emitter.emit(Events.GENUI_ERROR, { type, error: err });
      }
    }

    _handleHide(evt) {
      if (this._activeType && this._stickyTypes.has(this._activeType)) {
        this._log.debug('Ignoring server hide event — active type is sticky:', this._activeType);
        return;
      }
      const target = HIDE_EVENT_MAP[evt];
      if (target === 'visual') this._container.hideVisual();
      else if (target === 'board') this._container.hideBoard();
      else this._container.hideAll();
      this._resumeIfPaused();
    }

    hide(category) {
      if (!category) this._container.hideAll();
      else if (category === 'board') this._container.hideBoard();
      else if (category === 'visual') this._container.hideVisual();
      this._resumeIfPaused();
    }

    _resumeIfPaused() {
      if (this._pausedByGenUI) {
        if (this._onResume) this._onResume();
        else if (this._socket) this._socket.emit('resumeConversation', {});
        this._pausedByGenUI = false;
        this._log.debug('Conversation resumed after GenUI dismissed');
      }
    }

    setPauseHandlers(onPause, onResume) { this._onPause = onPause; this._onResume = onResume; }
    registerRenderer(type, renderer) { return this._registry.register(type, renderer); }
    use(middleware) { return this._registry.use(middleware); }
    provideLibrary(name, lib) { this._loader.provide(name, lib); }
    setLibraryUrl(name, url) { this._loader.setUrl(name, url); }
    getActiveType() { return this._activeType ? { type: this._activeType, category: this._activeCategory } : null; }
    setEnabled(enabled) { this._enabled = enabled; }
    isEnabled() { return this._enabled; }

    destroy() {
      this._container.detach();
      this._socket = null;
    }

    _registerBuiltins() {
      Object.entries(builtinRenderers).forEach(([type, renderer]) => {
        if (!this._registry.has(type)) this._registry.register(type, renderer);
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SERVER CONFIGURATION STORE
  // ═══════════════════════════════════════════════════════════════════════════

  class ServerInfo {
    constructor() {
      this._server = null;
      this._config = null;
    }

    _setServer(data) {
      this._server = Object.freeze({
        agentName: data?.agentName || null,
        hostName: data?.hostName || null,
        loadingVideoUrl: data?.loadingVideoURL || null,
        finalUrl: data?.finalUrl || null
      });
    }

    _setConfig(data) {
      const cc = data?.clientConfiguration || data || {};
      this._config = Object.freeze({
        language: cc.languageCode || 'en',
        agentPersonaName: cc.agentPersonaName || null,
        userName: cc.userName || null,
        isTapToTalk: cc.isTapToTalk || false,
        interruptionsEnabled: cc.interruptionsEnabled !== false,
        pauseEnabled: cc.pauseConversationEnabled || false,
        showTranscription: cc.showTranscription || false,
        isScreenShareEnabled: cc.isScreenShareEnabled || false,
        isCameraAnalysisEnabled: cc.isCameraAnalysisEnabled || false,
        isWebSearchEnabled: cc.isWebSearchEnabled || false,
        audioMode: cc.audioMode || false,
        phoneMode: cc.phoneMode || false,
        forwardLoopMode: cc.forwardLoopMode || false,
        imaginativeAiMode: cc.imaginativeAiMode || false,
        initialHtml: cc.initialHtml || null,
        smartTurn: cc.smartTurnConfig ? Object.freeze({
          enabled: cc.smartTurnConfig.enabled || false,
          timeoutMs: cc.smartTurnConfig.timeout_ms || 1500
        }) : null,
        videos: Object.freeze((cc.visualVideos || []).map(v => Object.freeze({
          id: v.id,
          url: v.url,
          metadata: Object.freeze(
            Object.keys(v)
              .filter(k => k.startsWith('custom-field-'))
              .reduce((acc, k) => { acc[k] = v[k]; return acc; }, {})
          )
        }))),
        photos: Object.freeze((cc.visualPhotos || []).map(p => Object.freeze({
          id: p.id,
          url: p.url,
          metadata: Object.freeze(
            Object.keys(p)
              .filter(k => k.startsWith('custom-field-'))
              .reduce((acc, k) => { acc[k] = p[k]; return acc; }, {})
          )
        }))),
        raw: Object.freeze(cc)
      });
    }

    get agentName() { return this._server?.agentName || this._config?.agentPersonaName || null; }
    get language() { return this._config?.language || 'en'; }
    get features() {
      if (!this._config) return null;
      return {
        tapToTalk: this._config.isTapToTalk,
        interruptions: this._config.interruptionsEnabled,
        pause: this._config.pauseEnabled,
        screenShare: this._config.isScreenShareEnabled,
        cameraAnalysis: this._config.isCameraAnalysisEnabled,
        webSearch: this._config.isWebSearchEnabled,
        smartTurn: this._config.smartTurn
      };
    }
    get videos() { return this._config?.videos || []; }
    get photos() { return this._config?.photos || []; }
    get initialHtml() { return this._config?.initialHtml || null; }
    get loadingVideoUrl() { return this._server?.loadingVideoUrl || null; }
    get raw() { return this._config?.raw || null; }
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
        peerName: config.peerName || DEFAULTS.PEER_NAME,
        genui: Object.freeze({
          enabled: config.genui?.enabled !== false,
          container: config.genui?.container || null,
          position: config.genui?.position || 'overlay',
          autoHide: config.genui?.autoHide !== false,
          dismissible: config.genui?.dismissible !== false,
          cssPrefix: config.genui?.cssPrefix || 'kav-genui',
          libraries: config.genui?.libraries || {},
          renderers: config.genui?.renderers || {},
          stickyTypes: config.genui?.stickyTypes !== undefined
            ? new Set(config.genui.stickyTypes)
            : DEFAULT_STICKY_TYPES,
          pauseTypes: config.genui?.pauseTypes !== undefined
            ? config.genui.pauseTypes
            : ['showVisualVideo']
        }),
        captions: Object.freeze({
          enabled: config.captions?.enabled !== undefined ? config.captions.enabled : undefined,
          maxCharsPerLine: config.captions?.maxCharsPerLine || 47,
          maxLines: config.captions?.maxLines || 2,
          render: config.captions?.render !== false,
          fontSize: config.captions?.fontSize || 18,
          fontFamily: config.captions?.fontFamily || 'system-ui, -apple-system, sans-serif',
          textColor: config.captions?.textColor || '#FFFFFF',
          backgroundColor: config.captions?.backgroundColor || 'rgba(0,0,0,0.8)',
          fadeInMs: config.captions?.fadeInMs || 120,
          fadeOutMs: config.captions?.fadeOutMs || 200,
          holdAfterEndMs: config.captions?.holdAfterEndMs || 2000,
          container: config.captions?.container || null
        })
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
      this._genui = new GenUIManager(this._emitter, this._config.genui, this._log);
      this._captions = new CaptionManager(this._emitter, this._config.captions, this._log);

      this._serverInfo = new ServerInfo();
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
      this._userSpeaking = false;
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
      this._genui.hide();
      this._cleanupMedia();
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
      this._genui.destroy();
      this._captions.destroy();
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

    registerCommand(name, pattern, handler, options) {
      return this._commands.register(name, pattern, handler, options);
    }

    onEndPhrase(phrase, handler, options) {
      return this._commands.register('__end__', phrase, (match) => {
        handler(match);
      }, options);
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
    isUserSpeaking() { return this._userSpeaking; }

    /** Server-provided configuration and metadata */
    getServerInfo() { return this._serverInfo; }

    /** Agent name (from server config or persona name) */
    getAgentName() { return this._serverInfo.agentName; }

    /** Feature flags reported by the server */
    getFeatures() { return this._serverInfo.features; }

    /** Pre-configured video library with contextual metadata */
    getVideos() { return this._serverInfo.videos; }

    /** Pre-configured photo library with contextual metadata */
    getPhotos() { return this._serverInfo.photos; }

    /** Loading video URL (shown while avatar initializes) */
    getLoadingVideoUrl() { return this._serverInfo.loadingVideoUrl; }

    /** Pause the avatar conversation */
    pause() {
      this._state.assertState(State.IN_CONVERSATION);
      this._mic.mute();
      this._socket.emit('pauseConversation', {});
      this._log.debug('Conversation paused');
    }

    /** Resume the avatar conversation */
    resume() {
      this._state.assertState(State.IN_CONVERSATION);
      this._mic.unmute();
      this._socket.emit('resumeConversation', {});
      this._log.debug('Conversation resumed');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MICROPHONE
    // ─────────────────────────────────────────────────────────────────────────

    muteMic() { this._mic.mute(); }
    unmuteMic() { this._mic.unmute(); }
    isMicMuted() { return this._mic.muted; }

    /** Send a screenshot of the user's camera to the avatar for analysis */
    sendCameraCapture(imageDataUrl) {
      this._state.assertState(State.IN_CONVERSATION);
      this._socket.emit('userCameraShot', { image: imageDataUrl });
      this._log.debug('Camera capture sent');
    }

    /** Send a screenshot of the user's screen to the avatar for analysis */
    sendScreenCapture(imageDataUrl) {
      this._state.assertState(State.IN_CONVERSATION);
      this._socket.emit('userScreenShareShot', { image: imageDataUrl });
      this._log.debug('Screen capture sent');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GENUI
    // ─────────────────────────────────────────────────────────────────────────

    /** @param {string} type - GenUI type (e.g. 'showChart', 'contactEmail') */
    /** @param {{ render: Function, hide?: Function }|Function} renderer */
    /** @returns {Function} unsubscribe */
    registerRenderer(type, renderer) { return this._genui.registerRenderer(type, renderer); }

    /** @param {{ beforeRender?: Function, afterRender?: Function }} middleware */
    /** @returns {Function} unsubscribe */
    useGenUIMiddleware(middleware) { return this._genui.use(middleware); }

    /** @param {string} name - Library name (e.g. 'chartjs', 'mermaid', 'katex', 'codemirror') */
    /** @param {*} library - The library instance */
    provideLibrary(name, library) { this._genui.provideLibrary(name, library); }

    /** @param {string} name - Library name */
    /** @param {string} url - CDN URL */
    setLibraryUrl(name, url) { this._genui.setLibraryUrl(name, url); }

    /** @param {string} [category] - 'board', 'visual', or omit for all */
    hideGenUI(category) { this._genui.hide(category); }

    /** @returns {{ type: string, category: string }|null} */
    getActiveGenUI() { return this._genui.getActiveType(); }

    /** @param {boolean} enabled */
    setGenUIEnabled(enabled) { this._genui.setEnabled(enabled); }

    /** @returns {boolean} */
    isGenUIEnabled() { return this._genui.isEnabled(); }

    // ─────────────────────────────────────────────────────────────────────────
    // CAPTIONS
    // ─────────────────────────────────────────────────────────────────────────

    setCaptionsEnabled(enabled) { this._captions.setEnabled(enabled); }
    isCaptionsEnabled() { return this._captions.isEnabled(); }
    setCaptionStyle(style) { this._captions.setStyle(style); }
    setCaptionContainer(container) { this._captions.setContainer(container); }
    setCaptionToggleVisible(visible) { this._captions.setToggleVisible(visible); }
    isCaptionToggleVisible() { return this._captions.isToggleVisible(); }

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
          this._genui.hide();
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
          this._serverInfo._setServer(data);
          this._emitter.emit(Events.SERVER_CONNECTED, {
            agentName: data?.agentName || null,
            loadingVideoUrl: data?.loadingVideoURL || null
          });
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

        this._socket.on('clientConfiguration', (data) => {
          this._log.debug('Client configuration received');
          this._serverInfo._setConfig(data);
          this._emitter.emit(Events.CONFIGURED, {
            agentName: this._serverInfo.agentName,
            language: this._serverInfo.language,
            features: this._serverInfo.features,
            videosCount: this._serverInfo.videos.length,
            photosCount: this._serverInfo.photos.length,
            hasInitialHtml: !!this._serverInfo.initialHtml
          });
          if (this._serverInfo.initialHtml && this._genui.isEnabled()) {
            this._genui._handleShow('showHtml', { mediaUrl: this._serverInfo.initialHtml });
          }
        });

        this._socket.on('joinComplete', () => {
          this._log.debug('Join complete');
          this._state.transition(State.JOINED);
          this._preAcquireMic();
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
        let _beforeBuffer = '';

        this._socket.on('debug_stvTaskGenerated', (data) => {
          if (data?.text) {
            // Server sends cumulative text (full response so far), not just the new delta.
            // Extract the delta by comparing with what we already have.
            let delta = data.text;
            if (data.text.length > _beforeBuffer.length && data.text.startsWith(_beforeBuffer)) {
              delta = data.text.slice(_beforeBuffer.length);
            }
            _beforeBuffer = data.text;
            this._commands.check(_beforeBuffer, 'before');
            this._emitter.emit(Events.AVATAR_TEXT_READY, { text: delta, fullText: _beforeBuffer });
            this._captions.onChunk(delta, data.speechId);
          }
        });

        this._socket.on('stvStartedTalking', () => {
          this._avatarSpeaking = true;
          this._emitter.emit(Events.AVATAR_SPEAKING_START);
          this._captions.onSpeakingStart();
        });

        this._socket.on('stvFinishedTalking', (data) => {
          _beforeBuffer = '';
          this._commands.resetUtterance();
          this._avatarSpeaking = false;
          this._emitter.emit(Events.AVATAR_SPEAKING_END);
          if (data?.agentContent) {
            const text = data.agentContent;
            this._transcript.add('Avatar', text);
            this._commands.check(text, 'after');
            this._emitter.emit(Events.AVATAR_SPEECH, { text });
            this._emitter.emit(Events.AGENT_TALKED, { agentContent: text });
            this._captions.onSpeakingEnd(text, data.speechId);
          } else {
            this._captions.onSpeakingEnd('', null);
          }
        });

        // User started speaking (server-side VAD detection)
        this._socket.on('userStartedTalking', () => {
          this._userSpeaking = true;
          this._emitter.emit(Events.USER_SPEAKING_START);
          this._captions.interrupt();
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
          this._userSpeaking = false;
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
          this._emitter.emit(Events.TIME_EXPIRED);
          this._emitter.emit(Events.ERROR, new AvatarError(ErrorCode.CONVERSATION_TIME_EXPIRED, 'Session time limit reached', { recoverable: false }));
          this._state.transition(State.ENDED);
          this._emitter.emit(Events.CONVERSATION_ENDED);
        });

        this._socket.on('conversationTimeWarning', (data) => {
          this._log.warn('Time warning', data?.remainingTime);
          this._emitter.emit(Events.TIME_WARNING, { remainingSeconds: data?.remainingTime || 0 });
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

        // GenUI + contact collection (handled by GenUIManager)
        this._genui.bindSocket(this._socket);
        this._genui.setPauseHandlers(
          () => {
            this._socket.emit('pauseConversation', {});
            this._mic.mute();
          },
          () => {
            this._socket.emit('resumeConversation', {});
            this._mic.unmute();
          }
        );

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

        this._whep.onConnectionLost = (state) => {
          if (this._state.is(State.IN_CONVERSATION)) {
            this._log.warn('WHEP connection lost during conversation — re-negotiating video');
            this._renegotiateVideo();
          }
        };

        const { trackPromise } = await this._whep.negotiate(this._sessionId, {
          videoElement: videoEl
        });

        // Wait for video track to arrive, decode a frame, and allow the WebRTC
        // jitter buffer to stabilize before telling the server to start speaking.
        const videoTimeout = setTimeout(() => {
          if (!this._videoReady) {
            this._log.warn('Video track timeout — approving permissions without video');
            this._videoReady = true;
            this._checkApprovePermissions();
          }
        }, 5000);

        trackPromise.then(() => {
          clearTimeout(videoTimeout);
          this._emitter.emit(Events.VIDEO_READY, { element: this._videoElement });

          // Wait for first decoded frame + jitter buffer stabilization
          const approve = () => {
            setTimeout(() => {
              this._videoReady = true;
              this._checkApprovePermissions();
            }, 300);
          };

          const ve = this._videoElement;
          if (ve && ve.readyState < 3) {
            // HAVE_FUTURE_DATA (3) = enough data to play without stalling
            ve.addEventListener('canplay', approve, { once: true });
            // Safety: if canplay never fires, approve after 2s
            setTimeout(() => {
              if (!this._videoReady) approve();
            }, 2000);
          } else {
            approve();
          }
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

    async _renegotiateVideo() {
      try {
        this._whep.close();
        const videoEl = this._videoElement || this._config.media.videoElement;
        if (videoEl) this._whep.setVideoElement(videoEl);

        this._whep.onConnectionLost = (state) => {
          if (this._state.is(State.IN_CONVERSATION)) {
            this._log.warn('WHEP connection lost again — re-negotiating');
            this._renegotiateVideo();
          }
        };

        const { trackPromise } = await this._whep.negotiate(this._sessionId, {
          videoElement: videoEl
        });

        trackPromise.then(() => {
          this._log.info('WHEP re-negotiation successful — video restored');
          this._emitter.emit(Events.VIDEO_READY, { element: this._videoElement });
        });
      } catch (err) {
        this._log.warn('WHEP re-negotiation failed', err.message);
        this._emitter.emit(Events.AUDIO_FALLBACK);
      }
    }

    _preAcquireMic() {
      this._micPromise = this._mic.acquire({ audio: { echoCancellation: true }, video: false })
        .then(() => {
          this._log.debug('Mic pre-acquired');
          this._emitter.emit(Events.MIC_GRANTED, { stream: this._mic.stream });
          return true;
        })
        .catch((err) => {
          this._log.warn('Mic permission denied, continuing in text-only mode', err.message);
          this._emitter.emit(Events.MIC_DENIED, { error: err });
          return false;
        });
    }

    async _handlePermissions(constraints) {
      // Mic was already pre-acquired at connect() — just await that promise
      await this._micPromise;
      this._micReady = true;
      this._checkApprovePermissions();
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

      const genuiTarget = this._config.genui.container
        ? (typeof this._config.genui.container === 'string'
          ? document.querySelector(this._config.genui.container)
          : this._config.genui.container)
        : container;
      this._genui.attach(genuiTarget);

      const captionTarget = this._config.captions.container
        ? (typeof this._config.captions.container === 'string'
          ? document.querySelector(this._config.captions.container)
          : this._config.captions.container)
        : container;
      this._captions.attach(captionTarget, this._videoElement);
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
      this._userSpeaking = false;
      this._captions.interrupt();
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
  KalturaAvatarSDK._internals = { TypedEventEmitter, StateMachine, TranscriptManager, CommandRegistry, DPPManager, WHEPClient, ASRConnection, AudioFallback, MicrophoneManager, ReconnectStrategy, Logger, GenUIManager, GenUIContainer, RendererRegistry, LibraryLoader, CaptionManager, CaptionSegmenter, CaptionScheduler, CaptionRateEstimator, CaptionRenderer };

  return KalturaAvatarSDK;
}));
