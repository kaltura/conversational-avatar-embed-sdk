/**
 * Kaltura Avatar SDK (Socket)
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
  /** GenUI rendering configuration */
  genui?: Partial<GenUIConfig>;
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
  timing: 'before' | 'after';
}

export interface CommandOptions {
  /** When to fire: 'before' (on text-ready), 'after' (on finished speaking), 'both' (default: 'after') */
  timing?: 'before' | 'after' | 'both';
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

export interface GenUIConfig {
  /** Enable automatic rendering (default: true). When false, events still fire. */
  enabled: boolean;
  /** Separate container for GenUI content (default: overlay on video container) */
  container: string | HTMLElement | null;
  /** Positioning mode: 'overlay' | 'below' | 'custom' (default: 'overlay') */
  position: 'overlay' | 'below' | 'custom';
  /** Auto-hide previous content when new arrives (default: true) */
  autoHide: boolean;
  /** Show dismiss/close button (default: true) */
  dismissible: boolean;
  /** BEM CSS class prefix (default: 'kav-genui') */
  cssPrefix: string;
  /** Pre-provide library instances to avoid CDN loads */
  libraries: Record<string, unknown>;
  /** Pre-register custom renderers by type */
  renderers: Record<string, GenUIRenderer>;
  /**
   * GenUI types that ignore server-sent hide events (default: ['showVisualVideo']).
   *
   * Sticky content stays visible until the user dismisses it (close button / Escape),
   * a new show* event replaces it, or the developer calls sdk.hideGenUI().
   * This prevents videos from closing prematurely when the server reacts to user speech.
   *
   * Set to an empty array to disable sticky behavior entirely.
   */
  stickyTypes: string[];
  /**
   * GenUI types that auto-pause the conversation while displayed (default: ['showVisualVideo']).
   *
   * When content of a matching type is rendered, the avatar pauses (stops listening/responding).
   * The conversation resumes automatically when the content is dismissed.
   *
   * Set to an empty array to disable auto-pause entirely.
   */
  pauseTypes: string[];
}

export interface GenUIRenderer {
  /** Render the GenUI content into the provided container element */
  render(data: unknown, container: HTMLElement, context: GenUIRenderContext): void | Promise<void>;
  /** Optional cleanup when content is hidden */
  hide?(container: HTMLElement): void;
}

export interface GenUIRenderContext {
  /** Lazy library loader */
  loader: {
    load(name: string): Promise<unknown>;
    provide(name: string, lib: unknown): void;
    setUrl(name: string, url: string): void;
  };
  /** The GenUI type being rendered (e.g. 'showChart') */
  type: string;
  /** Category: 'board' (full-screen) or 'visual' (overlay panel) */
  category: 'board' | 'visual';
  /** Emit an event to the server socket and fire genui:interaction locally */
  emit(event: string, payload?: unknown): void;
  /** Hide the current GenUI content */
  hideGenUI(): void;
}

export interface GenUIMiddleware {
  /** Called before rendering. Set ctx.cancelled = true to prevent rendering. */
  beforeRender?(ctx: GenUIMiddlewareContext): void | Promise<void>;
  /** Called after rendering completes. */
  afterRender?(ctx: GenUIAfterRenderContext): void | Promise<void>;
}

export interface GenUIMiddlewareContext {
  type: string;
  data: unknown;
  category: 'board' | 'visual';
  cancelled: boolean;
}

export interface GenUIAfterRenderContext {
  type: string;
  data: unknown;
  category: 'board' | 'visual';
  element: HTMLElement;
}

export interface GenUIRenderedPayload {
  type: string;
  data: unknown;
  category: 'board' | 'visual';
  element: HTMLElement;
}

export interface GenUIHiddenPayload {
  type: string | null;
  category: 'board' | 'visual';
}

export interface GenUIInteractionPayload {
  interactionType: string;
  payload: unknown;
}

export interface GenUIErrorPayload {
  type: string;
  error: Error;
}

export interface ReconnectingPayload {
  attempt: number;
  maxAttempts: number;
}

export interface ServerConnectedPayload {
  agentName: string | null;
  loadingVideoUrl: string | null;
}

export interface ConfiguredPayload {
  agentName: string | null;
  language: string;
  features: ServerFeatures | null;
  videosCount: number;
  photosCount: number;
  hasInitialHtml: boolean;
}

export interface TimeWarningPayload {
  remainingSeconds: number;
}

export interface ServerFeatures {
  tapToTalk: boolean;
  interruptions: boolean;
  pause: boolean;
  screenShare: boolean;
  cameraAnalysis: boolean;
  webSearch: boolean;
  smartTurn: { enabled: boolean; timeoutMs: number } | null;
}

export interface ServerVideoAsset {
  id: string;
  url: string;
  metadata: Record<string, string>;
}

export interface ServerPhotoAsset {
  id: string;
  url: string;
  metadata: Record<string, string>;
}

export interface ServerInfo {
  /** Agent name (from server connection or persona config) */
  readonly agentName: string | null;
  /** Language code (default: 'en') */
  readonly language: string;
  /** Server-reported feature flags */
  readonly features: ServerFeatures | null;
  /** Pre-configured video library with contextual metadata */
  readonly videos: readonly ServerVideoAsset[];
  /** Pre-configured photo library */
  readonly photos: readonly ServerPhotoAsset[];
  /** Initial HTML to display on connect */
  readonly initialHtml: string | null;
  /** Loading video URL (shown while avatar initializes) */
  readonly loadingVideoUrl: string | null;
  /** Raw server configuration object (for advanced use) */
  readonly raw: Record<string, unknown> | null;
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
  'avatar-text-ready': AvatarSpeechPayload;
  'avatar-speech': AvatarSpeechPayload;
  'avatar-speaking-end': void;

  'user-speech': UserSpeechPayload;

  'video-ready': { element: HTMLVideoElement };
  'audio-fallback': void;
  'mic-granted': { stream: MediaStream };
  'mic-denied': { error: Error };

  'genui': GenUIPayload;
  'genui:before-render': { type: string; data: unknown; category: 'board' | 'visual' };
  'genui:rendered': GenUIRenderedPayload;
  'genui:hidden': GenUIHiddenPayload;
  'genui:interaction': GenUIInteractionPayload;
  'genui:error': GenUIErrorPayload;
  'command-matched': CommandMatch;
  'transcript-entry': TranscriptEntry;

  'reconnecting': ReconnectingPayload;
  'reconnected': void;

  // Server configuration & lifecycle
  'server-connected': ServerConnectedPayload;
  'configured': ConfiguredPayload;
  'time-warning': TimeWarningPayload;
  'time-expired': void;

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
  registerCommand(name: string, pattern: string | RegExp, handler: (match: CommandMatch) => void, options?: CommandOptions): () => void;
  /** Convenience: register an end-of-session trigger phrase */
  onEndPhrase(phrase: string, handler: (match: CommandMatch) => void, options?: CommandOptions): () => void;
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

  // ── Server Info ──
  /** Full server configuration object (available after 'configured' event) */
  getServerInfo(): ServerInfo;
  /** Agent name (from server config or persona setting) */
  getAgentName(): string | null;
  /** Server-reported feature flags */
  getFeatures(): ServerFeatures | null;
  /** Pre-configured video library with contextual metadata from Studio */
  getVideos(): readonly ServerVideoAsset[];
  /** Pre-configured photo library from Studio */
  getPhotos(): readonly ServerPhotoAsset[];
  /** Loading video URL (shown while avatar initializes) */
  getLoadingVideoUrl(): string | null;

  // ── Conversation Control ──
  /** Pause the avatar conversation */
  pause(): void;
  /** Resume the avatar conversation */
  resume(): void;

  // ── Microphone ──
  muteMic(): void;
  unmuteMic(): void;
  isMicMuted(): boolean;

  // ── Camera & Screen Capture ──
  /** Send camera screenshot to avatar for visual analysis */
  sendCameraCapture(imageDataUrl: string): void;
  /** Send screen screenshot to avatar for visual analysis */
  sendScreenCapture(imageDataUrl: string): void;

  // ── GenUI Rendering ──
  /** Register or override a renderer for a GenUI type */
  registerRenderer(type: string, renderer: GenUIRenderer | ((data: unknown, container: HTMLElement, ctx: GenUIRenderContext) => void | Promise<void>)): () => void;
  /** Add middleware hooks (before/after render) */
  useGenUIMiddleware(middleware: GenUIMiddleware): () => void;
  /** Provide a library instance to avoid CDN loading */
  provideLibrary(name: string, library: unknown): void;
  /** Override the CDN URL for a library */
  setLibraryUrl(name: string, url: string): void;
  /** Hide currently active GenUI content */
  hideGenUI(category?: 'board' | 'visual'): void;
  /** Get the currently active GenUI type and category */
  getActiveGenUI(): { type: string; category: 'board' | 'visual' } | null;
  /** Enable or disable GenUI rendering (events still fire when disabled) */
  setGenUIEnabled(enabled: boolean): void;
  /** Check if GenUI rendering is enabled */
  isGenUIEnabled(): boolean;

  // ── Contact Collection (convenience) ──
  /** Submit contact info to server (convenience method for custom contact forms) */
  submitContact(type: 'email' | 'phone', value: string): void;
  /** Reject contact collection request */
  rejectContact(type: 'email' | 'phone'): void;
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
  readonly AVATAR_TEXT_READY: 'avatar-text-ready';
  readonly AVATAR_SPEECH: 'avatar-speech';
  readonly AVATAR_SPEAKING_END: 'avatar-speaking-end';
  readonly USER_SPEECH: 'user-speech';
  readonly VIDEO_READY: 'video-ready';
  readonly AUDIO_FALLBACK: 'audio-fallback';
  readonly MIC_GRANTED: 'mic-granted';
  readonly MIC_DENIED: 'mic-denied';
  readonly GENUI: 'genui';
  readonly GENUI_BEFORE_RENDER: 'genui:before-render';
  readonly GENUI_RENDERED: 'genui:rendered';
  readonly GENUI_HIDDEN: 'genui:hidden';
  readonly GENUI_INTERACTION: 'genui:interaction';
  readonly GENUI_ERROR: 'genui:error';
  readonly COMMAND_MATCHED: 'command-matched';
  readonly TRANSCRIPT_ENTRY: 'transcript-entry';
  readonly RECONNECTING: 'reconnecting';
  readonly RECONNECTED: 'reconnected';
  readonly SERVER_CONNECTED: 'server-connected';
  readonly CONFIGURED: 'configured';
  readonly TIME_WARNING: 'time-warning';
  readonly TIME_EXPIRED: 'time-expired';
  readonly SHOWING_AGENT: 'showing-agent';
  readonly AGENT_TALKED: 'agent-talked';
  readonly USER_TRANSCRIPTION: 'user-transcription';
  readonly CONVERSATION_ENDED: 'conversation-ended';
};

export default KalturaAvatarSDK;
