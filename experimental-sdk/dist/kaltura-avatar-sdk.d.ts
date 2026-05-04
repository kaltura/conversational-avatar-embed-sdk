/**
 * Kaltura Avatar SDK v2 (Experimental)
 * Direct Socket.IO + WebRTC — No iframe required
 */

export interface AvatarConfig {
  /** Kaltura client ID (from Kaltura Studio) */
  clientId: string;
  /** Avatar flow ID (from Kaltura Studio) */
  flowId: string;
  /** CSS selector or HTMLElement to render the avatar video */
  container?: string | HTMLElement;
  /** Enable debug logging (default: false) */
  debug?: boolean;
  /** Auto-reconnect on connection loss (default: true) */
  autoReconnect?: boolean;
  /** Max reconnection attempts (default: 5) */
  maxReconnectAttempts?: number;
  /** Base delay for reconnection backoff in ms (default: 1000) */
  reconnectBaseDelay?: number;
  /** Connection timeout in ms (default: 15000) */
  connectionTimeout?: number;
  /** Server endpoint overrides */
  endpoints?: Partial<EndpointConfig>;
  /** TURN/STUN server configuration */
  turn?: Partial<TurnConfig>;
  /** Media preferences */
  media?: Partial<MediaConfig>;
  /** Enable transcript recording (default: true) */
  transcriptEnabled?: boolean;
  /** Display name sent to server (default: 'SDKUser') */
  peerName?: string;
}

export interface EndpointConfig {
  /** Socket.IO server URL */
  socket: string;
  /** Socket.IO path */
  socketPath: string;
  /** WHEP video server URL */
  whep: string;
}

export interface TurnConfig {
  /** TURN/STUN server URLs */
  urls: string[];
  /** TURN username */
  username: string;
  /** TURN credential */
  credential: string;
  /** ICE transport policy */
  iceTransportPolicy: RTCIceTransportPolicy;
}

export interface MediaConfig {
  /** Enable video via WHEP (default: true) */
  video: boolean;
  /** Force audio-only mode, skip WHEP (default: false) */
  audioOnly: boolean;
  /** User-provided video element */
  videoElement: HTMLVideoElement | null;
  /** User-provided audio element */
  audioElement: HTMLAudioElement | null;
  /** Microphone constraints override */
  micConstraints: MediaTrackConstraints | null;
  /** Auto-play video when ready (default: true) */
  autoPlay: boolean;
  /** ARIA label for video element */
  ariaLabel: string;
}

export interface TranscriptEntry {
  role: 'Avatar' | 'User';
  text: string;
  timestamp: Date;
}

export interface TranscriptExportOptions {
  includeTimestamps?: boolean;
  format?: 'text' | 'markdown' | 'json';
}

export interface TranscriptDownloadOptions extends TranscriptExportOptions {
  filename?: string;
}

export interface CommandMatch {
  command: string;
  text: string;
  pattern: string | RegExp;
}

export interface StateChangePayload {
  from: AvatarState;
  to: AvatarState;
}

export interface AvatarSpeechPayload {
  text: string;
}

export interface UserSpeechPayload {
  text: string;
  isFinal: boolean;
}

export interface GenUIPayload {
  type: string;
  data: unknown;
}

export interface ReconnectingPayload {
  attempt: number;
  maxAttempts: number;
}

export type AvatarState =
  | 'uninitialized'
  | 'connecting'
  | 'connected'
  | 'joining'
  | 'joined'
  | 'in-conversation'
  | 'ended'
  | 'error'
  | 'destroyed';

export interface AvatarEventMap {
  'connecting': void;
  'connected': void;
  'ready': void;
  'disconnected': { reason: string };
  'destroyed': void;
  'state-change': StateChangePayload;
  'error': AvatarError;

  'avatar-speaking-start': void;
  'avatar-speech': AvatarSpeechPayload;
  'avatar-speaking-end': void;

  'user-speech': UserSpeechPayload;

  'video-ready': { element: HTMLVideoElement };
  'audio-fallback': void;
  'mic-granted': { stream: MediaStream };
  'mic-denied': { error: Error };

  'genui': GenUIPayload;
  'command-matched': CommandMatch;
  'transcript-entry': TranscriptEntry;

  'reconnecting': ReconnectingPayload;
  'reconnected': void;

  // v1 compatibility
  'showing-agent': void;
  'agent-talked': { agentContent: string };
  'user-transcription': { userTranscription: string };
  'conversation-ended': void;
}

export declare class AvatarError extends Error {
  readonly code: number;
  readonly recoverable: boolean;
  readonly context: Record<string, unknown> | null;
  readonly timestamp: Date;
  constructor(code: number, message: string, options?: {
    recoverable?: boolean;
    context?: Record<string, unknown>;
    cause?: Error;
  });
}

export declare class KalturaAvatarSDK {
  constructor(config: AvatarConfig);

  // ── Static ──
  static readonly VERSION: string;
  static readonly Events: typeof AvatarEvents;
  static readonly State: Record<string, AvatarState>;
  static readonly ErrorCode: Record<string, number>;
  static readonly AvatarError: typeof AvatarError;

  // ── Lifecycle ──
  /** Connect to the avatar server, negotiate media, and start the session */
  connect(): Promise<void>;
  /** Alias for connect() — familiar from v1 */
  start(): Promise<void>;
  /** Gracefully end the conversation and disconnect */
  disconnect(): void;
  /** Alias for disconnect() */
  end(): void;
  /** Permanently destroy this instance and release all resources */
  destroy(): void;

  // ── Communication ──
  /** Send text to the avatar (bypasses speech recognition) */
  sendText(text: string): void;
  /** Inject Dynamic Page Prompt (DPP) context */
  injectDPP(data: Record<string, unknown> | string): void;
  /** Inject DPP with debounce (for real-time updates) */
  injectDPPDebounced(data: Record<string, unknown> | string, delayMs?: number): void;
  /** v1 compatibility alias for injectDPP */
  injectPrompt(jsonString: string): void;

  // ── Events ──
  on<E extends keyof AvatarEventMap>(event: E, handler: (payload: AvatarEventMap[E]) => void): () => void;
  on(event: '*', handler: (event: string, payload: unknown) => void): () => void;
  once<E extends keyof AvatarEventMap>(event: E, handler: (payload: AvatarEventMap[E]) => void): () => void;
  off<E extends keyof AvatarEventMap>(event: E, handler: (payload: AvatarEventMap[E]) => void): void;
  removeAllListeners(event?: string): void;

  // ── Spoken Commands ──
  /** Register a command triggered when avatar speaks a matching phrase */
  registerCommand(name: string, pattern: string | RegExp, handler: (match: CommandMatch) => void): () => void;
  /** Convenience: register an end-of-session trigger phrase */
  onEndPhrase(phrase: string, handler: (match: CommandMatch) => void): () => void;
  /** Remove all registered commands */
  clearCommands(): void;

  // ── Transcript ──
  getTranscript(): TranscriptEntry[];
  getTranscriptText(options?: TranscriptExportOptions): string;
  downloadTranscript(options?: TranscriptDownloadOptions): void;
  clearTranscript(): void;
  setTranscriptEnabled(enabled: boolean): void;

  // ── State & Info ──
  getState(): AvatarState;
  getSessionId(): string | null;
  getRoomId(): string | null;
  getVideoElement(): HTMLVideoElement | null;
  getAudioElement(): HTMLAudioElement | null;
  getMicStream(): MediaStream | null;
  isConnected(): boolean;
  isInConversation(): boolean;
  isAvatarSpeaking(): boolean;

  // ── Microphone ──
  muteMic(): void;
  unmuteMic(): void;
  isMicMuted(): boolean;
}

declare const AvatarEvents: {
  readonly CONNECTING: 'connecting';
  readonly CONNECTED: 'connected';
  readonly READY: 'ready';
  readonly DISCONNECTED: 'disconnected';
  readonly DESTROYED: 'destroyed';
  readonly STATE_CHANGE: 'state-change';
  readonly ERROR: 'error';
  readonly AVATAR_SPEAKING_START: 'avatar-speaking-start';
  readonly AVATAR_SPEECH: 'avatar-speech';
  readonly AVATAR_SPEAKING_END: 'avatar-speaking-end';
  readonly USER_SPEECH: 'user-speech';
  readonly VIDEO_READY: 'video-ready';
  readonly AUDIO_FALLBACK: 'audio-fallback';
  readonly MIC_GRANTED: 'mic-granted';
  readonly MIC_DENIED: 'mic-denied';
  readonly GENUI: 'genui';
  readonly COMMAND_MATCHED: 'command-matched';
  readonly TRANSCRIPT_ENTRY: 'transcript-entry';
  readonly RECONNECTING: 'reconnecting';
  readonly RECONNECTED: 'reconnected';
  readonly SHOWING_AGENT: 'showing-agent';
  readonly AGENT_TALKED: 'agent-talked';
  readonly USER_TRANSCRIPTION: 'user-transcription';
  readonly CONVERSATION_ENDED: 'conversation-ended';
};

export default KalturaAvatarSDK;
