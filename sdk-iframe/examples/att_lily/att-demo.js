/**
 * AT&T Seller Hub Demo
 * Sales coaching and product knowledge check platform
 *
 * Embeds two Kaltura Avatar SDK instances:
 *   1. Main hero avatar (Lily — general AT&T sales coach)
 *   2. Knowledge check modal avatar (Morgan / Alex / Casey — product-specific trainers)
 *
 * Analysis modes (via shared Lambda):
 *   - "knowledge_check"  → Graded quiz report for knowledge checks
 *   - "general"          → Structured session report with scoring
 *
 * @version 1.0.2
 * @see dynamic_page_prompt.schema.json — DPP v1 schema
 * @see base_prompt.txt — Multi-persona system prompt
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Application configuration constants.
 * Update these values for different deployments.
 */
const CONFIG = Object.freeze({
    VERSION: '1.2.0',

    // Kaltura Avatar SDK credentials — main hero (Lily) and knowledge check (Morgan/Alex/Casey)
    MAIN_AVATAR: Object.freeze({
        CLIENT_ID: '68f91b1f8d6dc1fb0d87f65b',
        FLOW_ID: 'agent-21'
    }),
    CHECK_AVATAR: Object.freeze({
        CLIENT_ID: '695cd19880ea19bd1b816a08',
        FLOW_ID: 'agent-87'
    }),

    // Call analysis API endpoint (shared AWS Lambda + API Gateway)
    ANALYSIS_API_URL: 'https://30vsmo8j0l.execute-api.us-west-2.amazonaws.com',

    // Delay (ms) after SHOWING_AGENT before injecting DPP
    DPP_INJECTION_DELAY_MS: 500,

    // Avatar display names per persona
    AVATAR_NAMES: Object.freeze({
        general: 'Lily',
        wireless: 'Morgan',
        fiber: 'Alex',
        cc: 'Casey'
    })
});

// =============================================================================
// KNOWLEDGE CHECK DEFINITIONS
// =============================================================================

/**
 * Knowledge check card configuration.
 * Each entry defines metadata for display and the path to its DPP JSON file.
 *
 * To add a new check:
 * 1. Create the DPP JSON file in dynamic_page_prompt_samples/
 * 2. Add an entry here with: id, title, description, icon, file, product, badge
 * 3. The cards grid will render automatically
 *
 * @type {ReadonlyArray<Object>}
 */
const CHECKS = Object.freeze([
    // Wireless
    {
        id: 'wireless_unlimited-plans',
        title: 'Unlimited Plans',
        description: 'AT&T unlimited plan tiers, features, and competitive positioning.',
        icon: '\uD83D\uDCF6',
        image: 'https://images.unsplash.com/photo-1676300463288-0a1183aef2fa?w=800&h=400&fit=crop&auto=format',
        file: 'dynamic_page_prompt_samples/wireless_unlimited-plans.json',
        product: 'AT&T Unlimited Plans',
        badge: 'wireless',
        avatar: 'Morgan'
    },
    {
        id: 'wireless_5g-network',
        title: '5G & Network',
        description: '5G vs 5G+, coverage positioning, and FirstNet credibility anchors.',
        icon: '\uD83D\uDCE1',
        image: 'https://images.unsplash.com/photo-1733040581568-18d93f969d2c?w=800&h=400&fit=crop&auto=format',
        file: 'dynamic_page_prompt_samples/wireless_5g-network.json',
        product: 'AT&T 5G & Network Coverage',
        badge: 'wireless',
        avatar: 'Morgan'
    },
    {
        id: 'wireless_device-tradein',
        title: 'Device Trade-In',
        description: 'Trade-in process, AT&T Next Up, and device protection positioning.',
        icon: '\uD83D\uDCF1',
        image: 'https://images.unsplash.com/photo-1691073112675-9685bc6779bf?w=800&h=400&fit=crop&auto=format',
        file: 'dynamic_page_prompt_samples/wireless_device-tradein.json',
        product: 'AT&T Device Trade-In & Upgrades',
        badge: 'wireless',
        avatar: 'Morgan'
    },

    // Fiber
    {
        id: 'fiber_internet-plans',
        title: 'Fiber Internet Plans',
        description: 'Speed tiers, equipment, symmetrical speeds, and remote worker pitch.',
        icon: '\uD83C\uDF10',
        image: 'https://images.unsplash.com/photo-1606778303039-9fc1488b1d8a?w=800&h=400&fit=crop&auto=format',
        file: 'dynamic_page_prompt_samples/fiber_internet-plans.json',
        product: 'AT&T Fiber Internet Plans',
        badge: 'fiber',
        avatar: 'Alex'
    },
    {
        id: 'fiber_vs-cable',
        title: 'Fiber vs Cable',
        description: 'Technical advantages, peak performance, and competitive objections.',
        icon: '\u26A1',
        image: 'https://images.unsplash.com/photo-1717295248494-937c3a5655b1?w=800&h=400&fit=crop&auto=format',
        file: 'dynamic_page_prompt_samples/fiber_vs-cable.json',
        product: 'AT&T Fiber vs Cable',
        badge: 'fiber',
        avatar: 'Alex'
    },
    {
        id: 'fiber_bundle-offers',
        title: 'Bundle Offers',
        description: 'Multi-product bundles, DIRECTV STREAM, and whole-home solutions.',
        icon: '\uD83D\uDCE6',
        image: 'https://images.unsplash.com/photo-1758687125679-d000e186e09b?w=800&h=400&fit=crop&auto=format',
        file: 'dynamic_page_prompt_samples/fiber_bundle-offers.json',
        product: 'AT&T Fiber Bundles',
        badge: 'fiber',
        avatar: 'Alex'
    },

    // Contact Center
    {
        id: 'cc_ccaas-overview',
        title: 'CCaaS Overview',
        description: 'What CCaaS is, ideal customer profiles, and cloud migration benefits.',
        icon: '\uD83C\uDFE2',
        image: 'https://images.unsplash.com/photo-1629904869392-ae2a682d4d01?w=800&h=400&fit=crop&auto=format',
        file: 'dynamic_page_prompt_samples/cc_ccaas-overview.json',
        product: 'AT&T CCaaS Portfolio',
        badge: 'cc',
        avatar: 'Casey'
    },
    {
        id: 'cc_five9-ai',
        title: 'Five9 & AI',
        description: 'Five9 partnership, AI agents vs IVR, and Spotlight feature.',
        icon: '\uD83E\uDD16',
        image: 'https://images.unsplash.com/photo-1644300616688-90b3f5f7792a?w=800&h=400&fit=crop&auto=format',
        file: 'dynamic_page_prompt_samples/cc_five9-ai.json',
        product: 'Five9 & AI Capabilities',
        badge: 'cc',
        avatar: 'Casey'
    },
    {
        id: 'cc_solution-mapping',
        title: 'Solution Mapping',
        description: 'Customer routing, four pillars, and discovery for pain points.',
        icon: '\uD83D\uDDFA\uFE0F',
        image: 'https://images.unsplash.com/photo-1758873268998-2f77c2d38862?w=800&h=400&fit=crop&auto=format',
        file: 'dynamic_page_prompt_samples/cc_solution-mapping.json',
        product: 'AT&T Contact Center Solution Mapping',
        badge: 'cc',
        avatar: 'Casey'
    }
]);

// =============================================================================
// APPLICATION STATE
// =============================================================================

/**
 * Application state container.
 * Centralizes all mutable state for easier debugging and maintenance.
 */
const state = {
    /** @type {string|null} Logged-in user email */
    userEmail: null,

    // ---- Main hero avatar (Lily) ----
    /** @type {KalturaAvatarSDK|null} Main SDK instance */
    mainSDK: null,
    /** @type {boolean} Whether the main conversation is active */
    mainActive: false,
    /** @type {boolean} Flag to prevent duplicate end-of-call handling */
    mainEnding: false,
    /** @type {number} Monotonic session counter — prevents stale timeouts firing into a new session */
    mainSessionId: 0,
    /** @type {Array<{role:string, text:string, timestamp:string}>} Main transcript */
    mainTranscript: [],

    // ---- Knowledge check modal avatar ----
    /** @type {KalturaAvatarSDK|null} Check SDK instance */
    checkSDK: null,
    /** @type {Object|null} Currently active check metadata from CHECKS */
    activeCheck: null,
    /** @type {Object|null} Loaded DPP JSON data for active check */
    checkDPP: null,
    /** @type {boolean} Whether a knowledge check is in progress */
    checkActive: false,
    /** @type {boolean} Flag to prevent duplicate end handling */
    checkEnding: false,
    /** @type {Array<{role:string, text:string, timestamp:string}>} Check transcript */
    checkTranscript: [],

    /** @type {Object|null} Last analysis report (for download) */
    lastReport: null,
    /** @type {string|null} Product label for last report */
    lastReportProduct: null,

    // ---- SME escalation ----
    /** @type {number|null} Auto-hide timer ID for main SME overlay */
    mainSMETimer: null,
    /** @type {number|null} Auto-hide timer ID for check SME overlay */
    checkSMETimer: null,
    /** @type {number|null} Toast auto-dismiss timer ID */
    smeToastTimer: null
};

// =============================================================================
// DOM ELEMENT CACHE
// =============================================================================

/** @type {Object.<string, HTMLElement>} */
let ui = {};

/**
 * Initialize DOM element cache.
 * Call once after DOM is ready.
 */
function initUI() {
    ui = {
        // Screens
        loginScreen: document.getElementById('login-screen'),
        app: document.querySelector('.app'),

        // Login
        loginForm: document.getElementById('login-form'),
        loginEmail: document.getElementById('login-email'),
        loginError: document.getElementById('login-error'),

        // Main avatar
        avatarContainer: document.getElementById('avatar-container'),
        mainSMEOverlay: document.getElementById('main-sme-overlay'),
        mainSMEBtn: document.getElementById('main-sme-btn'),
        mainTranscriptContent: document.getElementById('main-transcript-content'),
        mainDownloadBtn: document.getElementById('main-download-btn'),

        // Knowledge check cards
        cardsGrid: document.getElementById('cards-grid'),

        // Check modal
        checkModal: document.getElementById('check-modal'),
        checkModalTitle: document.getElementById('check-modal-title'),
        checkModalBadge: document.getElementById('check-modal-badge'),
        checkModalClose: document.getElementById('check-modal-close'),
        checkAvatarContainer: document.getElementById('check-avatar-container'),
        checkSMEOverlay: document.getElementById('check-sme-overlay'),
        checkSMEBtn: document.getElementById('check-sme-btn'),
        checkTranscriptContent: document.getElementById('check-transcript-content'),
        checkDownloadBtn: document.getElementById('check-download-btn'),

        // SME toast
        smeToast: document.getElementById('sme-toast'),
        smeToastTitle: document.getElementById('sme-toast-title'),
        smeToastBody: document.getElementById('sme-toast-body'),

        // Report
        reportLoading: document.getElementById('report-loading'),
        reportModal: document.getElementById('report-modal'),
        reportModalTitle: document.getElementById('report-modal-title'),
        reportModalBody: document.getElementById('report-modal-body'),
        reportModalClose: document.getElementById('report-modal-close'),
        reportDownloadBtn: document.getElementById('report-download-btn'),
        reportCloseBtn: document.getElementById('report-close-btn')
    };
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Escape HTML entities to prevent XSS.
 * @param {*} text - Input to escape
 * @returns {string} HTML-safe string
 */
function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

/**
 * Generate a filename-safe slug from text.
 * @param {string} text
 * @returns {string}
 */
function slugify(text) {
    return (text || 'untitled').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

/**
 * Get today's date as YYYY-MM-DD.
 * @returns {string}
 */
function getTodayISO() {
    return new Date().toISOString().slice(0, 10);
}

// =============================================================================
// SDK MANAGEMENT
// =============================================================================

/**
 * Create and configure a Kaltura Avatar SDK instance.
 *
 * @param {string} containerSelector - CSS selector for the avatar container
 * @param {Object} avatarConfig - Kaltura credentials ({ CLIENT_ID, FLOW_ID })
 * @param {Object} options
 * @param {Function} options.onAgentTalked  - Called with avatar speech text
 * @param {Function} options.onUserTalked   - Called with user speech text
 * @param {Function} options.onShowingAgent - Called when avatar is visible (inject DPP here)
 * @param {Function} options.onEnded        - Called when conversation ends
 * @returns {KalturaAvatarSDK}
 */
function createSDK(containerSelector, avatarConfig, { onAgentTalked, onUserTalked, onShowingAgent, onEnded }) {
    const sdk = new KalturaAvatarSDK({
        clientId: avatarConfig.CLIENT_ID,
        flowId: avatarConfig.FLOW_ID,
        container: containerSelector
    });

    sdk.on(KalturaAvatarSDK.Events.SHOWING_AGENT, () => {
        console.log(`[SDK:${containerSelector}] Avatar visible — scheduling DPP injection`);
        setTimeout(onShowingAgent, CONFIG.DPP_INJECTION_DELAY_MS);
    });

    sdk.on(KalturaAvatarSDK.Events.AGENT_TALKED, (data) => {
        const text = data?.agentContent || (typeof data === 'string' ? data : null);
        if (text) onAgentTalked(text);
    });

    sdk.on(KalturaAvatarSDK.Events.USER_TRANSCRIPTION, (data) => {
        const text = data?.userTranscription || (typeof data === 'string' ? data : null);
        if (text) onUserTalked(text);
    });

    sdk.on(KalturaAvatarSDK.Events.CONVERSATION_ENDED, () => {
        console.log(`[SDK:${containerSelector}] CONVERSATION_ENDED`);
        onEnded();
    });

    sdk.on('error', ({ message }) => {
        console.error(`[SDK:${containerSelector}] Error:`, message);
    });

    return sdk;
}

/**
 * Initialize the main hero avatar SDK (Lily).
 */
function initMainSDK() {
    state.mainSDK = createSDK('#avatar-container', CONFIG.MAIN_AVATAR, {
        onShowingAgent() {
            const dpp = buildMainDPP();
            console.log('[Main] Injecting DPP:', dpp);
            state.mainSDK.injectPrompt(dpp);
        },
        onAgentTalked(text) {
            addTranscriptEntry('main', 'avatar', CONFIG.AVATAR_NAMES.general, text);
            checkCallEndTrigger(text, 'main');
        },
        onUserTalked(text) {
            addTranscriptEntry('main', 'user', 'You', text);
            checkSMETrigger(text, 'main');
        },
        async onEnded() {
            await handleMainEnd();
        }
    });
}

/**
 * Initialize the knowledge check modal avatar SDK.
 */
function initCheckSDK() {
    state.checkSDK = createSDK('#check-avatar-container', CONFIG.CHECK_AVATAR, {
        onShowingAgent() {
            if (!state.checkDPP) return;
            const dpp = buildCheckDPP();
            console.log('[Check] Injecting DPP:', dpp);
            state.checkSDK.injectPrompt(dpp);
        },
        onAgentTalked(text) {
            const avatarName = state.activeCheck?.avatar || 'Trainer';
            addTranscriptEntry('check', 'avatar', avatarName, text);
            checkCallEndTrigger(text, 'check');
        },
        onUserTalked(text) {
            addTranscriptEntry('check', 'user', 'You', text);
            checkSMETrigger(text, 'check');
        },
        async onEnded() {
            await handleCheckEnd();
        }
    });
}

// =============================================================================
// DPP CONSTRUCTION
// =============================================================================

/**
 * Build DPP JSON string for the main hero avatar (Lily — general coach).
 * @returns {string} JSON string
 */
function buildMainDPP() {
    const dpp = {
        v: '1',
        inst: ['AT&T GENERAL COACH'],
        product: 'AT&T Products',
        candidate: {
            name: '',
            email: state.userEmail || ''
        }
    };
    return JSON.stringify(dpp);
}

/**
 * Build DPP JSON string for the active knowledge check.
 * Merges the loaded DPP JSON with the logged-in user's email.
 * @returns {string} JSON string
 */
function buildCheckDPP() {
    if (!state.checkDPP) return '{}';

    const dpp = JSON.parse(JSON.stringify(state.checkDPP));

    // Inject user identity
    dpp.candidate = dpp.candidate || {};
    dpp.candidate.email = state.userEmail || '';

    return JSON.stringify(dpp);
}

// =============================================================================
// CALL END DETECTION
// =============================================================================

/**
 * Trigger phrases that indicate the avatar is ending the session.
 * Must match the base_prompt.txt closing instruction: "Ending call now."
 * @type {ReadonlyArray<string>}
 */
const END_CALL_PHRASES = Object.freeze([
    'ending call now',
    'ending the call now',
    'end the call now',
    'ending this call',
    'ending our call'
]);

/**
 * Phrases in user speech that trigger the SME escalation button.
 * Matched case-insensitively as substrings.
 * @type {ReadonlyArray<string>}
 */
const SME_TRIGGERS = Object.freeze([
    'i need more help',
    'i need help',
    'can i speak to',
    'talk to an expert',
    'talk to a specialist',
    'subject matter expert',
    'i\'m not sure about this',
    'i don\'t know'
]);

/** Auto-hide delay (ms) for the SME button after it appears. */
const SME_AUTO_HIDE_MS = 15_000;

/** Display duration (ms) for the SME toast notification. Keep in sync with sme-toast-countdown in CSS. */
const SME_TOAST_DURATION_MS = 4_000;

/**
 * Check if avatar speech contains a call-ending trigger phrase.
 * @param {string} text - Avatar speech text
 * @param {'main'|'check'} target - Which SDK instance
 */
function checkCallEndTrigger(text, target) {
    if (!text || typeof text !== 'string') return;

    const lower = text.toLowerCase();
    const triggered = END_CALL_PHRASES.some(phrase => lower.includes(phrase));
    if (!triggered) return;

    if (target === 'main' && state.mainActive && !state.mainEnding) {
        console.log('[Main] Call end trigger detected');
        state.mainEnding = true;
        const sessionId = state.mainSessionId;
        setTimeout(() => {
            if (state.mainSessionId !== sessionId) return;
            handleMainEnd();
        }, 2000);
    } else if (target === 'check' && state.checkActive && !state.checkEnding) {
        console.log('[Check] Call end trigger detected');
        state.checkEnding = true;
        setTimeout(() => handleCheckEnd(), 2000);
    }
}

// =============================================================================
// SME ESCALATION
// =============================================================================

/**
 * Get the context-aware SME label for the current session.
 * @param {'main'|'check'} target
 * @returns {{ specialist: string, product: string }}
 */
function getSMEContext(target) {
    if (target === 'check' && state.activeCheck) {
        const badge = state.activeCheck.badge;
        const labels = { wireless: 'Wireless', fiber: 'Fiber', cc: 'Contact Center' };
        return {
            specialist: `${labels[badge] || 'Product'} Expert`,
            product: state.activeCheck.product
        };
    }
    return { specialist: 'Sales Expert', product: 'AT&T Products' };
}

/**
 * Check user speech for SME trigger phrases and show the escalation button.
 * @param {string} text - User speech text
 * @param {'main'|'check'} target
 */
function checkSMETrigger(text, target) {
    if (!text || typeof text !== 'string') return;

    const lower = text.toLowerCase();
    const triggered = SME_TRIGGERS.some(phrase => lower.includes(phrase));
    if (!triggered) return;

    console.log(`[SME:${target}] Trigger detected`);
    showSMEButton(target);
}

/**
 * Show the SME escalation button with animated entrance and auto-hide.
 * @param {'main'|'check'} target
 */
function showSMEButton(target) {
    const overlay = target === 'main' ? ui.mainSMEOverlay : ui.checkSMEOverlay;
    const btn = target === 'main' ? ui.mainSMEBtn : ui.checkSMEBtn;
    const timerKey = target === 'main' ? 'mainSMETimer' : 'checkSMETimer';

    // Update label to match context
    const { specialist } = getSMEContext(target);
    btn.innerHTML = `&#128222; Talk to ${escapeHtml(specialist)}`;

    // Show with CSS transition
    overlay.classList.add('visible');

    // Reset auto-hide timer
    clearTimeout(state[timerKey]);
    state[timerKey] = setTimeout(() => hideSMEButton(target), SME_AUTO_HIDE_MS);
}

/**
 * Hide the SME escalation button with animated exit.
 * @param {'main'|'check'} target
 */
function hideSMEButton(target) {
    const overlay = target === 'main' ? ui.mainSMEOverlay : ui.checkSMEOverlay;
    const timerKey = target === 'main' ? 'mainSMETimer' : 'checkSMETimer';

    overlay.classList.remove('visible');
    clearTimeout(state[timerKey]);
    state[timerKey] = null;
}

/**
 * Handle SME button click — show a polished toast simulating expert handoff.
 * @param {'main'|'check'} target
 */
function handleSMEClick(target) {
    hideSMEButton(target);

    const { specialist, product } = getSMEContext(target);

    ui.smeToastTitle.textContent = `Connecting to ${specialist}...`;
    ui.smeToastBody.textContent = `Routing your ${product} question to a live specialist. In production, this connects via Teams or Slack.`;

    // Reset animation by re-inserting progress bar
    const progressBar = ui.smeToast.querySelector('.sme-toast-progress-bar');
    progressBar.style.animation = 'none';
    // Force reflow to restart animation
    void progressBar.offsetWidth;
    progressBar.style.animation = '';

    // Show toast
    ui.smeToast.classList.add('visible');

    // Auto-dismiss
    clearTimeout(state.smeToastTimer);
    state.smeToastTimer = setTimeout(() => {
        ui.smeToast.classList.remove('visible');
        state.smeToastTimer = null;
    }, SME_TOAST_DURATION_MS);
}

// =============================================================================
// END-OF-SESSION HANDLERS
// =============================================================================

/**
 * Handle end of the main hero conversation (Lily).
 */
async function handleMainEnd() {
    if (!state.mainActive && !state.mainEnding) return;

    // Reset both flags immediately to prevent re-entry during the async analysis gap.
    // A stale trigger setTimeout is separately guarded by mainSessionId.
    state.mainActive = false;
    state.mainEnding = false;
    hideSMEButton('main');

    if (state.mainTranscript.length > 0) {
        showReportLoading();
        const report = await analyzeSession(state.mainTranscript);
        hideReportLoading();
        if (report) showReport(report, 'Coaching Session');
    }

    // Restart the main SDK so Lily is ready for the next session
    restartMainAvatar();
}

/**
 * Handle end of a knowledge check session.
 */
async function handleCheckEnd() {
    if (!state.checkActive && !state.checkEnding) return;

    const check = state.activeCheck;
    const transcript = [...state.checkTranscript];
    const questions = state.checkDPP?.mtg?.q_add || [];
    const product = check?.product || 'AT&T Product';

    state.checkActive = false;
    state.checkEnding = false;
    closeCheckModal();

    if (transcript.length > 0) {
        showReportLoading();
        const report = await analyzeKnowledgeCheck(transcript, product, questions);
        hideReportLoading();
        if (report) showReport(report, product);
    }
}

/**
 * Restart the main avatar for a fresh Lily session.
 */
function restartMainAvatar() {
    state.mainTranscript = [];
    clearTranscriptUI('main');

    if (state.mainSDK) {
        state.mainSDK.end();
    }

    // Re-initialize and auto-start so Lily is always present
    setTimeout(() => startMainAvatar(), 500);
}

// =============================================================================
// LOGIN
// =============================================================================

/**
 * Validate and process login.
 * @param {string} email
 */
function handleLogin(email) {
    if (!email || !email.includes('@')) {
        ui.loginError.textContent = 'Please enter a valid email address.';
        return;
    }

    ui.loginError.textContent = '';
    state.userEmail = email;

    // Persist email for return visits
    try { localStorage.setItem('att_hub_email', email); } catch (_) { /* private browsing */ }

    // Transition: fade out login, show app
    ui.loginScreen.classList.add('login-fade-out');
    setTimeout(() => {
        ui.loginScreen.style.display = 'none';
        ui.app.style.display = 'block';
        startMainAvatar();
    }, 380);
}

/**
 * Start the main hero avatar conversation.
 */
async function startMainAvatar() {
    state.mainSessionId++;
    state.mainActive = true;
    state.mainEnding = false;
    state.mainTranscript = [];
    clearTranscriptUI('main');
    ui.mainDownloadBtn.disabled = true;

    try {
        await state.mainSDK.start();
    } catch (error) {
        console.error('[Main] Failed to start:', error);
        state.mainActive = false;
    }
}

// =============================================================================
// KNOWLEDGE CHECK CARDS
// =============================================================================

/**
 * Render knowledge check cards in the grid.
 */
function renderCards() {
    ui.cardsGrid.innerHTML = CHECKS.map(check => `
        <div class="check-card" data-check-id="${escapeHtml(check.id)}">
            <div class="check-card-image">
                <img src="${check.image}" alt="${escapeHtml(check.title)}" loading="lazy">
            </div>
            <div class="check-card-body">
                <span class="product-badge badge-${escapeHtml(check.badge)}">${escapeHtml(check.badge)}</span>
                <h3>${escapeHtml(check.title)}</h3>
                <p>${escapeHtml(check.description)}</p>
                <span class="check-card-cta">Start Knowledge Check &rarr;</span>
            </div>
        </div>
    `).join('');

    // Event delegation for card clicks
    ui.cardsGrid.addEventListener('click', (e) => {
        const card = e.target.closest('.check-card');
        if (card) openCheck(card.dataset.checkId);
    });
}

// =============================================================================
// KNOWLEDGE CHECK MODAL
// =============================================================================

/**
 * Open a knowledge check session.
 * @param {string} checkId - Check ID matching a CHECKS entry
 */
async function openCheck(checkId) {
    const check = CHECKS.find(c => c.id === checkId);
    if (!check) {
        console.error(`Check not found: ${checkId}`);
        return;
    }

    // Prevent opening if one is already active
    if (state.checkActive) {
        console.warn('[Check] A session is already in progress');
        return;
    }

    state.activeCheck = check;

    // Load DPP JSON
    try {
        const url = `${check.file}?v=${CONFIG.VERSION}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        state.checkDPP = await response.json();
    } catch (error) {
        console.error('[Check] Failed to load DPP:', error);
        state.activeCheck = null;
        return;
    }

    // Reset check state
    state.checkActive = true;
    state.checkEnding = false;
    state.checkTranscript = [];
    clearTranscriptUI('check');
    ui.checkDownloadBtn.disabled = true;

    // Update modal header
    ui.checkModalTitle.textContent = check.title;
    ui.checkModalBadge.textContent = check.badge;
    ui.checkModalBadge.className = `product-badge badge-${check.badge}`;

    // Show modal
    ui.checkModal.classList.add('active');

    // Start the check avatar
    try {
        await state.checkSDK.start();
    } catch (error) {
        console.error('[Check] Failed to start:', error);
        state.checkActive = false;
        closeCheckModal();
    }
}

/**
 * Close the knowledge check modal and clean up.
 */
function closeCheckModal() {
    ui.checkModal.classList.remove('active');
    hideSMEButton('check');

    if (state.checkSDK) {
        state.checkSDK.end();
    }

    state.checkActive = false;
    state.checkEnding = false;
    state.activeCheck = null;
    state.checkDPP = null;
}

// =============================================================================
// TRANSCRIPT MANAGEMENT
// =============================================================================

/**
 * Add an entry to a transcript display and state array.
 * @param {'main'|'check'} target - Which transcript
 * @param {'avatar'|'user'} type - Speaker type
 * @param {string} speaker - Display name
 * @param {string} text - Spoken text
 */
function addTranscriptEntry(target, type, speaker, text) {
    const timestamp = new Date().toLocaleTimeString();

    // Store in state
    const transcript = target === 'main' ? state.mainTranscript : state.checkTranscript;
    transcript.push({
        role: type === 'avatar' ? 'assistant' : 'user',
        text,
        timestamp
    });

    // Render in UI
    const container = target === 'main' ? ui.mainTranscriptContent : ui.checkTranscriptContent;

    // Clear empty placeholder
    const empty = container.querySelector('.transcript-empty');
    if (empty) empty.style.display = 'none';

    const entry = document.createElement('div');
    entry.className = 'transcript-entry';
    entry.innerHTML = `
        <span class="speaker ${type === 'avatar' ? 'avatar-speaker' : 'user-speaker'}">${escapeHtml(speaker)}:</span>
        ${escapeHtml(text)}
    `;

    container.appendChild(entry);
    container.scrollTop = container.scrollHeight;

    // Enable download
    const btn = target === 'main' ? ui.mainDownloadBtn : ui.checkDownloadBtn;
    btn.disabled = false;
}

/**
 * Clear transcript UI for a target.
 * @param {'main'|'check'} target
 */
function clearTranscriptUI(target) {
    const container = target === 'main' ? ui.mainTranscriptContent : ui.checkTranscriptContent;
    container.innerHTML = '<div class="transcript-empty">Conversation transcript will appear here...</div>';
}

/**
 * Download transcript as a text file.
 * @param {'main'|'check'} target
 */
function downloadTranscript(target) {
    const transcript = target === 'main' ? state.mainTranscript : state.checkTranscript;
    if (!transcript.length) return;

    const label = target === 'main' ? 'coaching-session' : slugify(state.activeCheck?.title || 'check');
    const lines = transcript.map(t => {
        const speaker = t.role === 'assistant' ? 'AI' : 'You';
        return `[${t.timestamp}] ${speaker}: ${t.text}`;
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `att-transcript-${label}-${getTodayISO()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
}

// =============================================================================
// ANALYSIS API
// =============================================================================

/**
 * Format the internal transcript array for the Lambda API.
 * @param {Array<{role:string, text:string}>} transcript
 * @returns {Array<{role:string, content:string}>}
 */
function formatTranscriptForAPI(transcript) {
    return transcript.map(t => ({ role: t.role, content: t.text }));
}

/**
 * Send an analysis request to the shared Lambda API.
 * Stores the report in state for later download.
 *
 * @param {Object} payload - Request body (must include analysis_mode + transcript)
 * @param {string} productLabel - Label stored alongside the report for download naming
 * @returns {Promise<Object|null>} Analysis report or null on failure
 */
async function callAnalysisAPI(payload, productLabel) {
    try {
        const response = await fetch(CONFIG.ANALYSIS_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (result.success) {
            state.lastReport = result.summary;
            state.lastReportProduct = productLabel;
            return result.summary;
        }

        console.error('[Analysis] Failed:', result.error);
        return null;
    } catch (error) {
        console.error('[Analysis] Request error:', error);
        return null;
    }
}

/**
 * Analyze a knowledge check session.
 * @param {Array} transcript - Transcript entries
 * @param {string} product - Product name
 * @param {string[]} questions - Questions asked
 * @returns {Promise<Object|null>}
 */
function analyzeKnowledgeCheck(transcript, product, questions) {
    return callAnalysisAPI({
        analysis_mode: 'knowledge_check',
        transcript: formatTranscriptForAPI(transcript),
        product,
        questions
    }, product);
}

/**
 * Analyze a general coaching session (main avatar).
 * @param {Array} transcript - Transcript entries
 * @returns {Promise<Object|null>}
 */
function analyzeSession(transcript) {
    return callAnalysisAPI({
        analysis_mode: 'general',
        transcript: formatTranscriptForAPI(transcript),
        context: 'AT&T Seller Hub — open coaching session with Lily'
    }, 'Coaching Session');
}

// =============================================================================
// REPORT DISPLAY
// =============================================================================

/** Human-readable readiness labels keyed by API value. */
const READINESS_LABELS = Object.freeze({
    ready_to_sell: '\u2713 Ready to Sell',
    needs_review: '\u26A0 Needs Review',
    not_ready: '\u2717 Not Ready'
});

/**
 * Map grade letter to a brand-appropriate color.
 * @param {string} grade
 * @returns {string} CSS color value
 */
function gradeColor(grade) {
    if (!grade) return '#666666';
    if (grade[0] === 'A') return '#6EBB1F';  // AT&T Green
    if (grade[0] === 'B') return '#067AB4';  // AT&T Blue
    if (grade[0] === 'C') return '#FF9900';  // AT&T Gold
    if (grade[0] === 'D') return '#FF7200';  // AT&T Orange
    return '#B30A3C';                        // AT&T Burgundy
}

/**
 * Render a 2x2 report card (strong spots, weak spots, etc.).
 * @param {string} cls - Card variant class
 * @param {string} icon - Emoji icon
 * @param {string} title - Card heading
 * @param {Array} items - List items (strings or study suggestion objects)
 * @returns {string} HTML string
 */
function renderReportCard(cls, icon, title, items) {
    let html = `<div class="report-card report-card-${cls}">`;
    html += `<div class="report-card-header"><span>${icon}</span><h4>${title}</h4></div>`;
    html += '<ul class="report-card-list">';
    if (!items?.length) {
        html += '<li class="report-empty-item">None noted</li>';
    } else {
        items.forEach(item => {
            if (typeof item === 'object') {
                const priority = item.priority ? ` <span class="priority-tag priority-${escapeHtml(item.priority)}">${escapeHtml(item.priority)}</span>` : '';
                html += `<li>${escapeHtml(item.topic || '')}${item.why ? ' &mdash; ' + escapeHtml(item.why) : ''}${priority}</li>`;
            } else {
                html += `<li>${escapeHtml(item)}</li>`;
            }
        });
    }
    html += '</ul></div>';
    return html;
}

/**
 * Generate star rating HTML.
 * @param {number} score - Score out of 5
 * @returns {string} HTML string
 */
function renderStars(score) {
    let stars = '';
    for (let i = 1; i <= 5; i++) {
        stars += `<span class="star${i <= score ? ' star-on' : ''}">\u2605</span>`;
    }
    return stars;
}

function showReportLoading() {
    ui.reportLoading.style.display = 'flex';
}

function hideReportLoading() {
    ui.reportLoading.style.display = 'none';
}

/**
 * Display the session report modal.
 * Matches Alon's report layout: grade circle hero + 2x2 card grid + star-rated question breakdown.
 *
 * @param {Object} report - Analysis result from Lambda
 * @param {string} title - Report title
 */
function showReport(report, title) {
    ui.reportModalTitle.textContent = title;

    // Fire-and-forget: email the report to the user
    emailReport(report, title);

    const score = Number(report.overall_score ?? report.score) || 0;
    const grade = report.grade || '';
    const summary = report.summary || report.summary_text || '';
    const product = report.product || report.session_type || title;
    const color = gradeColor(grade);

    let html = '';

    // ── Hero row: grade circle + summary block ────────────────────────
    html += '<div class="report-hero">';
    html += `<div class="report-grade-circle" style="border-color:${color};color:${color}">`;
    html += `<div class="report-grade-letter">${escapeHtml(grade)}</div>`;
    html += `<div class="report-grade-score">${score}<span>/100</span></div>`;
    html += '</div>';
    html += '<div class="report-summary-block">';
    html += `<div class="report-product-label">${escapeHtml(product)}</div>`;
    if (summary) html += `<p class="report-summary-text">${escapeHtml(summary)}</p>`;

    // Readiness badge
    if (report.readiness) {
        const rMap = {
            ready_to_sell: 'badge-ready',
            needs_review: 'badge-review',
            not_ready: 'badge-not-ready'
        };
        const cls = rMap[report.readiness] || 'badge-review';
        html += `<span class="readiness-badge ${cls}">${READINESS_LABELS[report.readiness] || escapeHtml(report.readiness)}</span>`;
    }

    // Engagement / confidence chips
    if (report.engagement || report.confidence) {
        html += '<div class="report-meta-row">';
        if (report.engagement) html += `<span class="meta-chip">Engagement: <strong>${escapeHtml(report.engagement)}</strong></span>`;
        if (report.confidence) html += `<span class="meta-chip">Confidence: <strong>${escapeHtml(report.confidence)}</strong></span>`;
        html += '</div>';
    }

    html += '</div></div>'; // close summary-block + hero

    // ── 2x2 card grid ─────────────────────────────────────────────────
    html += '<div class="report-grid">';
    html += renderReportCard('strong', '\u2705', 'Strong Spots', report.strong_spots);
    html += renderReportCard('weak', '\u26A0\uFE0F', 'Weak Spots', report.weak_spots);
    html += renderReportCard('improve', '\uD83D\uDCC8', 'Areas to Improve', report.areas_to_improve);
    html += renderReportCard('study', '\uD83D\uDCDA', 'Study Suggestions', report.study_suggestions);
    html += '</div>';

    // ── Question breakdown with star ratings ──────────────────────────
    if (report.question_breakdown?.length) {
        html += '<div class="question-breakdown"><h4>Question Breakdown</h4>';
        report.question_breakdown.forEach((q, i) => {
            const qScore = Number(q.score) || 0;
            const quality = String(q.quality || 'adequate');
            const qCls = quality === 'strong' ? 'q-strong' : quality === 'adequate' ? 'q-adequate' : 'q-weak';
            html += `<div class="question-item ${qCls}">`;
            html += '<div class="question-header">';
            html += `<span class="question-num">Q${i + 1}</span>`;
            html += `<span class="question-label">${escapeHtml(q.question_summary || '')}</span>`;
            html += `<span class="question-stars">${renderStars(qScore)}</span>`;
            html += '</div>';
            if (q.feedback) html += `<div class="question-feedback">${escapeHtml(q.feedback)}</div>`;
            html += '</div>';
        });
        html += '</div>';
    }

    ui.reportModalBody.innerHTML = html;
    ui.reportModal.classList.add('active');
}

/**
 * Email the report to the logged-in user (fire-and-forget).
 * @param {Object} report - Report data
 * @param {string} title - Report title
 */
async function emailReport(report, title) {
    if (!state.userEmail || !report) return;

    try {
        await fetch(CONFIG.ANALYSIS_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                analysis_mode: 'send_report_email',
                to_email: state.userEmail,
                report,
                title
            })
        });
    } catch (err) {
        console.warn('[Email] Report email failed:', err.message);
    }
}

/**
 * Close the report modal.
 */
function closeReportModal() {
    ui.reportModal.classList.remove('active');
}

/**
 * Format the last report as human-readable text for download.
 * @param {Object} d - Report data
 * @param {string} title - Report title
 * @returns {string} Formatted text
 */
function formatReportText(d, title) {
    const bullet = (items) => (items || []).map(x => {
        if (typeof x === 'object') return `  [${x.priority || '-'}] ${x.topic}: ${x.why || ''}`;
        return `  ${x}`;
    }).join('\n');

    const lines = [
        `=== ${title} ===`,
        `Grade: ${d.grade || 'N/A'}  Score: ${d.overall_score || 0}/100`,
        '',
        'SUMMARY',
        d.summary || '',
        '',
        'STRONG SPOTS',
        bullet(d.strong_spots) || '  None noted',
        '',
        'WEAK SPOTS',
        bullet(d.weak_spots) || '  None noted',
        '',
        'AREAS TO IMPROVE',
        bullet(d.areas_to_improve) || '  None noted',
        '',
        'STUDY SUGGESTIONS',
        bullet(d.study_suggestions) || '  None noted'
    ];

    if (d.question_breakdown?.length) {
        lines.push('', 'QUESTION BREAKDOWN');
        d.question_breakdown.forEach((q, i) => {
            lines.push(`Q${i + 1} (${q.score || 0}/5, ${q.quality || 'N/A'}): ${q.question_summary || ''}`);
            if (q.feedback) lines.push(`  -> ${q.feedback}`);
        });
    }

    return lines.join('\n');
}

/**
 * Download the last report as a human-readable TXT file.
 */
function downloadReport() {
    if (!state.lastReport) return;

    const label = slugify(state.lastReportProduct || 'report');
    const filename = `att-report-${label}-${getTodayISO()}.txt`;
    const text = formatReportText(state.lastReport, state.lastReportProduct || 'Session Report');

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// =============================================================================
// EVENT LISTENERS
// =============================================================================

/**
 * Attach all event listeners.
 * Called once after DOM is ready.
 */
function attachEventListeners() {
    // Login form
    ui.loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handleLogin(ui.loginEmail.value.trim());
    });

    // SME escalation buttons
    ui.mainSMEBtn.addEventListener('click', () => handleSMEClick('main'));
    ui.checkSMEBtn.addEventListener('click', () => handleSMEClick('check'));

    // Main transcript download
    ui.mainDownloadBtn.addEventListener('click', () => downloadTranscript('main'));

    // Check modal close
    ui.checkModalClose.addEventListener('click', () => {
        if (state.checkActive) {
            if (!confirm('End the current knowledge check?')) return;
        }
        closeCheckModal();
    });

    // Check transcript download
    ui.checkDownloadBtn.addEventListener('click', () => downloadTranscript('check'));

    // Report modal close
    ui.reportModalClose.addEventListener('click', closeReportModal);
    ui.reportCloseBtn.addEventListener('click', closeReportModal);
    ui.reportDownloadBtn.addEventListener('click', downloadReport);

    // Close modals on backdrop click
    ui.checkModal.addEventListener('click', (e) => {
        if (e.target === ui.checkModal) {
            if (state.checkActive && !confirm('End the current knowledge check?')) return;
            closeCheckModal();
        }
    });

    ui.reportModal.addEventListener('click', (e) => {
        if (e.target === ui.reportModal) closeReportModal();
    });

    // Keyboard: Escape closes modals
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;

        if (ui.reportModal.classList.contains('active')) {
            closeReportModal();
        } else if (ui.checkModal.classList.contains('active') && !state.checkActive) {
            closeCheckModal();
        }
    });
}

// =============================================================================
// INITIALIZATION
//
// Lifecycle: DOM ready → cache elements → bind events → render cards →
// create both SDK instances (idle until login) → user logs in → main
// avatar auto-starts → user clicks a card → check modal opens.
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
    initUI();
    attachEventListeners();
    renderCards();
    initMainSDK();
    initCheckSDK();

    // Restore saved email from previous session
    try {
        const saved = localStorage.getItem('att_hub_email');
        if (saved) ui.loginEmail.value = saved;
    } catch (_) { /* private browsing */ }
});
