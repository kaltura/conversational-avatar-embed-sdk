/**
 * Kaltura Avatar Analytics (KAVA Plugin)
 * Optional analytics plugin for the Kaltura Avatar SDK (Socket)
 *
 * @version 1.0.0
 * @license MIT
 */

export interface AnalyticsConfig {
  /** Kaltura Session token (required — provided by app, see KS_GUIDE.md) */
  ks: string;
  /** Kaltura partner ID (required) */
  partnerId: number | string;
  /** Agent ID fallback (default: auto-read from sdk.getFlowId(); KS privilege takes precedence server-side) */
  agentId?: string;
  /** Client/embed ID fallback (default: auto-read from sdk.getClientId(); KS privilege takes precedence server-side) */
  genieId?: string;
  /** Hosting application numeric enum (default: 29 = Agentic Avatars Studio). See HostingApplication constants. */
  hostingApplication?: number;
  /** Hosting application version (default: plugin VERSION) */
  hostingApplicationVer?: string;
  /** Client tag for event attribution (e.g., 'my-app:1.0.0') */
  clientTag?: string;
  /** Analytics endpoint URL (default: 'https://analytics.kaltura.com/api_v3/index.php') */
  serviceUrl?: string;
  /** HTTP method (default: 'POST') */
  requestMethod?: 'POST' | 'GET';
  /** User ID for analytics attribution */
  userId?: string;
  /** Auto-fire callStarted on SDK 'ready' event (default: true) */
  autoStart?: boolean;
  /** Auto-fire callEnded on disconnect/unload (default: true) */
  autoEnd?: boolean;
  /** Auto-fire messageResponse on speech events (default: true) */
  autoMessages?: boolean;
  /** Use sendBeacon for unload/visibilitychange events (default: true) */
  beaconOnUnload?: boolean;
  /** Event filter hook — return false to suppress an event before it is sent */
  tamperHandler?: ((params: Record<string, any>) => boolean) | null;
  /** Enable debug logging to console (default: false) */
  debug?: boolean;
}

export interface AnalyticsStats {
  /** Number of events successfully sent to the analytics endpoint */
  eventsSent: number;
  /** Number of SDK errors captured (informational — these enrich callEnded, not sent separately) */
  errors: number;
  /** Number of transport failures (fetch/sendBeacon failures) */
  transportErrors: number;
  /** Number of messageResponse events fired (avatar + user speech combined) */
  messageCount: number;
  /** Call duration in seconds (from SDK getSessionDuration or internal timer) */
  callDuration: number;
  /** Last captured SDK error, or null if none */
  lastError: { code: number; message: string } | null;
  /** Current thread ID (resets on reconnection) */
  threadId: string;
  /** Browser session ID (persists across reconnections within same page load) */
  sessionId: string;
}

export interface AnalyticsSentEvent {
  eventType: number;
  params: Record<string, any>;
}

export interface AnalyticsErrorEvent {
  eventType: number;
  error: Error;
}

export type AnalyticsEventMap = {
  sent: AnalyticsSentEvent;
  error: AnalyticsErrorEvent;
};

export declare class KalturaAvatarAnalytics {
  static readonly VERSION: string;

  /** KAVA event type codes sent in the eventType param */
  static readonly EventType: {
    readonly MESSAGE_RESPONSE: 80001;
    readonly CALL_STARTED: 80002;
    readonly CALL_ENDED: 80003;
    readonly MESSAGE_FEEDBACK: 80005;
    readonly BUTTON_CLICKED: 10002;
    readonly PAGE_LOAD: 10003;
  };

  /** Experience type for messageResponse events */
  static readonly ExperienceType: {
    /** User typed/spoke (text input) */
    readonly CHAT: 1;
    /** Avatar spoke (audio/video response) */
    readonly CALL: 2;
  };

  /** Response format for messageResponse events */
  static readonly ResponseType: {
    readonly TEXT: 1;
    readonly FLASHCARD: 2;
  };

  /** Reaction type for messageFeedback events */
  static readonly ReactionType: {
    readonly LIKE: 1;
    readonly DISLIKE: 2;
  };

  /** Context scope for contextType param */
  static readonly ContextType: {
    readonly ENTRY: 1;
    readonly CHANNEL: 2;
    readonly GLOBAL: 3;
  };

  /** Error position enrichment on callEnded events */
  static readonly ErrorPosition: {
    /** Error occurred before the call was established */
    readonly PRE_CALL: 1;
    /** Error occurred during an active call */
    readonly MID_CALL: 2;
  };

  /** Kaltura hosting application identifiers (server-side enum) */
  static readonly HostingApplication: {
    readonly GENIE: 23;
    readonly AGENTS: 25;
    readonly MODELS_SDK: 26;
    readonly CONVERSATION_MANAGER: 27;
    readonly AVATAR_VIDEOS: 28;
    readonly AGENTIC_AVATARS_STUDIO: 29;
    readonly UNISPHERE_OS: 30;
    readonly KAI_VENDOR: 31;
  };

  constructor(sdk: any, config: AnalyticsConfig);

  /** Send message feedback (like/dislike). No-op if messageId is falsy or reaction is invalid. */
  sendFeedback(messageId: string, reaction: 'like' | 'dislike'): void;

  /** Track a page view. No-op if pageName is falsy. */
  pageView(pageName: string, pageType?: string): void;

  /**
   * Track a button click.
   * @param name - Button identifier (required, max 50 chars)
   * @param type - Button category/type (e.g., 'Open', 'Close', 'Toggle')
   * @param value - Button value or additional context (max 50 chars)
   */
  buttonClick(name: string, type?: string, value?: string): void;

  /** Send a custom event with arbitrary fields. No-op if eventType is not a number. */
  customEvent(eventType: number, extraFields?: Record<string, any>): void;

  /** Set context ID for subsequent events (max 50 chars) */
  setContextId(id: string): void;

  /** Set context type (1=Entry, 2=Channel, 3=Global) */
  setContextType(type: number): void;

  /** Set custom metadata key-value for subsequent events */
  setMetadata(key: string, value: string | number): void;

  /** Update KS token (takes effect on next event) */
  setKS(ks: string): void;

  /** Subscribe to plugin events. Returns an unsubscribe function. */
  on<K extends keyof AnalyticsEventMap>(event: K, handler: (data: AnalyticsEventMap[K]) => void): () => void;

  /** Unsubscribe from plugin events */
  off<K extends keyof AnalyticsEventMap>(event: K, handler: (data: AnalyticsEventMap[K]) => void): void;

  /** Get current analytics stats snapshot */
  getStats(): AnalyticsStats;

  /** Destroy the plugin — unsubscribes all handlers, fires callEnded if call is active */
  destroy(): void;
}

export default KalturaAvatarAnalytics;
