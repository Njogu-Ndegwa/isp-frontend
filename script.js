console.log('═══════════════════════════════════════════════════════');
console.log('🚀 [ROUTER DEBUG] SCRIPT.JS LOADING...');
console.log('═══════════════════════════════════════════════════════');
console.log('📅 Timestamp:', new Date().toISOString());

// ========================================
// DUMP SAVED RADIUS LOGIN DATA ON EVERY PAGE LOAD
// This survives redirects and page refreshes via localStorage
// ========================================
(function dumpSavedRadiusLogin() {
    try {
        const saved = localStorage.getItem('bitwave_last_radius_login');
        if (saved) {
            const data = JSON.parse(saved);
            console.log('═══════════════════════════════════════════════════════');
            console.log('🔐 [RADIUS] SAVED LOGIN DATA (from localStorage)');
            console.log('═══════════════════════════════════════════════════════');
            console.log('🔗 Login URL:', data.loginUrl);
            console.log('👤 Username:', data.username);
            console.log('🔑 Password:', data.password);
            console.log('🌐 Gateway:', data.gateway);
            console.log('📱 Phone:', data.phone);
            console.log('📦 Plan:', data.planName);
            console.log('⏰ Expiry:', data.expiry);
            console.log('🕐 Saved at:', data.savedAt);
            console.log('📋 Full status response:', JSON.stringify(data.fullResponse, null, 2));
            console.log('═══════════════════════════════════════════════════════');
            console.log('💡 To clear: localStorage.removeItem("bitwave_last_radius_login")');
            console.log('💡 To view again: dumpRadiusLogin()');
            console.log('═══════════════════════════════════════════════════════');
        }
    } catch (e) {
        // Silently ignore if localStorage is unavailable
    }
})();

// Helper to view saved RADIUS login data anytime from console
window.dumpRadiusLogin = function() {
    try {
        const saved = localStorage.getItem('bitwave_last_radius_login');
        if (!saved) {
            console.log('ℹ️ No saved RADIUS login data found.');
            return null;
        }
        const data = JSON.parse(saved);
        console.log('═══════════════════════════════════════════════════════');
        console.log('🔐 [RADIUS] SAVED LOGIN DATA');
        console.log('═══════════════════════════════════════════════════════');
        console.log('🔗 Login URL:', data.loginUrl);
        console.log('👤 Username:', data.username);
        console.log('🔑 Password:', data.password);
        console.log('🌐 Gateway:', data.gateway);
        console.log('📱 Phone:', data.phone);
        console.log('📦 Plan:', data.planName);
        console.log('⏰ Expiry:', data.expiry);
        console.log('🕐 Saved at:', data.savedAt);
        console.log('📋 Full status response:', JSON.stringify(data.fullResponse, null, 2));
        console.log('═══════════════════════════════════════════════════════');
        return data;
    } catch (e) {
        console.error('❌ Error reading saved RADIUS data:', e);
        return null;
    }
};

// Plan flags — populated from portal API response
let planFlags = {
    has_emergency_plans: false,
    has_special_offers: false,
    emergency_mode_active: false,
    sharing_enabled: false
};

// Portal settings — populated from portal API response
let portalSettings = {};

// ========================================
// API CONFIGURATION (with fallback)
// ========================================
const PRIMARY_API_BASE = 'https://isp.bitwavetechnologies.com/api';
// Same-origin proxy (api/bw/[...path].js on this origin). A phone that loaded
// this page can reach this origin by definition, even when the walled garden
// or its own DNS setup breaks the path to the primary API host.
const FALLBACK_API_BASE = '/api/bw';
const API_BASE_URL = PRIMARY_API_BASE;

// Shared fallback state — ads.js and pwa.js read this to rewrite their URLs too
window.__apiFallback = { primary: PRIMARY_API_BASE, fallback: FALLBACK_API_BASE, active: false };

function activateApiFallback() {
    if (!window.__apiFallback.active) {
        window.__apiFallback.active = true;
        console.warn('⚠️ Primary API unreachable — switched to fallback:', FALLBACK_API_BASE);
    }
}

// Single portal endpoint — returns router, plans, and ads in one request
const PORTAL_ENDPOINT = `${API_BASE_URL}/public/portal`;
// Legacy endpoints (used as fallback if portal endpoint fails)
function getPlansUrl(rId) {
    return `${API_BASE_URL}/public/plans/${rId || FALLBACK_ROUTER_ID}`;
}
const PAYMENT_ENDPOINT = `${API_BASE_URL}/hotspot/register-and-pay`;
const PAYMENT_STATUS_ENDPOINT = `${API_BASE_URL}/hotspot/payment-status`;
const ROUTER_LOOKUP_ENDPOINT = `${API_BASE_URL}/routers/by-identity`;
// Unified access-code endpoints (public, no auth). One code — voucher,
// post-payment access code, or M-Pesa receipt — works on every device the
// plan covers; the backend decides what the code is.
const ACCESS_CODE_REDEEM_ENDPOINT = `${API_BASE_URL}/public/access-code/redeem`;
const ACCESS_CODE_DISCONNECT_ENDPOINT = `${API_BASE_URL}/public/access-code/disconnect`;
const ACCESS_CODE_STORAGE_KEY = 'bitwave_access_code';
// Reconnect endpoint (public, no auth)
const RECONNECT_ENDPOINT = `${API_BASE_URL}/public/reconnect`;
// Free-trial endpoints (public, no auth). GET takes /{router_id}/{mac}.
const FREE_TRIAL_ENDPOINT = `${API_BASE_URL}/public/free-trial`;
const FREE_TRIAL_CLAIM_ENDPOINT = `${API_BASE_URL}/public/free-trial/claim`;

// RADIUS-specific endpoints (used when router auth_method is "RADIUS")
const RADIUS_PAYMENT_ENDPOINT = `${API_BASE_URL}/radius/hotspot/register-and-pay`;
const RADIUS_PAYMENT_STATUS_ENDPOINT = `${API_BASE_URL}/radius/hotspot/payment-status`;

// Router ID - Will be looked up dynamically from router identity
// Fallback used only if lookup fails
const FALLBACK_ROUTER_ID = 2;
let routerId = null; // Will be set after lookup
let routerAuthMethod = 'DIRECT_API'; // Will be set after lookup ('DIRECT_API' or 'RADIUS')
let routerBusinessName = null; // Will be set after lookup from backend
let routerPaymentMethods = ['mpesa', 'voucher']; // Default — updated from portal/router API
let routerPaymentProvider = 'mpesa'; // Collection gateway assigned to this router
// Support phone is reseller-specific and comes from the backend ONLY.
// Never hardcode a number here — a stale default sends customers to the
// wrong person. Empty means "unknown", and every support link stays hidden.
let routerSupportPhone = ''; // from router API (data.router.support_phone)

// Payment polling configuration
const PAYMENT_POLL_INTERVAL = 3000; // Poll every 3 seconds
// Max 120 seconds (40 * 3s). The backend rescues lost Safaricom callbacks at
// ~30-50s (on-demand STK query during status polling) and ~60-150s (background
// sweep) — giving up at 60s made customers think payment failed and pay again.
const PAYMENT_POLL_MAX_ATTEMPTS = 40;

// TEMPORARY: Use CORS proxy for development/testing ONLY if backend CORS is not configured
// Remove this in production once backend adds proper CORS headers!
const USE_CORS_PROXY = false; // Set to true only for local testing
const CORS_PROXY = 'https://corsproxy.io/?';

function getProxiedUrl(url) {
    if (window.__apiFallback.active) {
        url = url.replace(PRIMARY_API_BASE, FALLBACK_API_BASE);
    }
    return USE_CORS_PROXY ? CORS_PROXY + encodeURIComponent(url) : url;
}

// ========================================
// PLANS FAILURE BEACON
// When a customer ends up staring at "Couldn't load plans", fire one tiny GET
// whose query string lands in the server's access log — the endpoint 404s and
// that's fine, the log line IS the record. Apache logs the request even while
// the app behind it is down, so the only unreported case is a phone that
// cannot reach the server at all.
// ========================================
const _pageLoadTs = Date.now();
let _plansFailureReported = false;
function reportPlansFailure(stage, err) {
    try {
        if (_plansFailureReported) return; // one report per page load
        if (sessionStorage.getItem('__DEMO_PORTAL__') ||
            sessionStorage.getItem('__DEV_MOCK_PORTAL__') ||
            window.__MOCK_PORTAL_DATA) return;
        _plansFailureReported = true;
        const params = new URLSearchParams({
            router: mikrotikParams.router || 'unknown',
            stage: stage, // 'empty' | 'fallback' | 'reload'
            err: String((err && err.message) || err || 'unknown').slice(0, 120),
            t: String(Date.now() - _pageLoadTs) // ms from page load to failure
        });
        fetch(`${API_BASE_URL}/public/plans-fail-beacon?${params.toString()}`, {
            method: 'GET', mode: 'no-cors', keepalive: true, cache: 'no-store'
        }).catch(() => {});
        // Second copy via the same-origin proxy: reaches the server even when
        // the phone cannot reach the primary API host at all — previously the
        // exact failures we most needed to see were the ones never reported.
        fetch(`${FALLBACK_API_BASE}/public/plans-fail-beacon?${params.toString()}`, {
            method: 'GET', keepalive: true, cache: 'no-store'
        }).catch(() => {});
        console.warn('📡 [BEACON] Plans failure reported:', stage);
    } catch (_) { /* telemetry must never break the page */ }
}

// ========================================
// ROUTER IDENTITY LOOKUP
// ========================================
async function getRouterId(identity) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔍 [ROUTER DEBUG] STEP 2: ROUTER LOOKUP FUNCTION CALLED');
    console.log('═══════════════════════════════════════════════════════');
    console.log('📥 Identity received:', `"${identity}"`);
    console.log('📥 Identity type:', typeof identity);
    console.log('📥 Identity is falsy:', !identity);
    console.log('📥 Identity length:', identity ? identity.length : 'N/A');
    
    if (!identity) {
        console.warn('⚠️ [ROUTER DEBUG] No router identity provided!');
        console.warn('⚠️ [ROUTER DEBUG] Returning FALLBACK_ROUTER_ID:', FALLBACK_ROUTER_ID);
        // Keep routerAuthMethod as default 'DIRECT_API' when no identity provided
        routerAuthMethod = 'DIRECT_API';
        console.log('🔐 [ROUTER DEBUG] routerAuthMethod set to DIRECT_API (no identity)');
        console.log('═══════════════════════════════════════════════════════');
        return FALLBACK_ROUTER_ID;
    }
    
    console.log('🔍 Looking up router by identity:', identity);
    
    try {
        const url = `${ROUTER_LOOKUP_ENDPOINT}/${encodeURIComponent(identity)}`;
        console.log('📡 [ROUTER DEBUG] API URL:', url);
        console.log('📡 [ROUTER DEBUG] Encoded identity:', encodeURIComponent(identity));
        
        const response = await fetch(getProxiedUrl(url), {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            mode: 'cors'
        });
        
        console.log('📡 [ROUTER DEBUG] Response status:', response.status);
        console.log('📡 [ROUTER DEBUG] Response ok:', response.ok);
        
        if (!response.ok) {
            if (response.status === 404) {
                console.error(`❌ [ROUTER DEBUG] Router "${identity}" not found in database (404)`);
                throw new Error(`Router "${identity}" not found. Please contact support.`);
            }
            console.error(`❌ [ROUTER DEBUG] API error: ${response.status} ${response.statusText}`);
            throw new Error('Failed to lookup router');
        }
        
        const data = await response.json();
        console.log('✅ [ROUTER DEBUG] API Response data:', JSON.stringify(data, null, 2));
        console.log('✅ [ROUTER DEBUG] Extracted router_id from response:', data.router_id);
        console.log('✅ [ROUTER DEBUG] router_id type:', typeof data.router_id);
        console.log('✅ [ROUTER DEBUG] auth_method from response:', data.auth_method);
        console.log('═══════════════════════════════════════════════════════');
        
        // Store auth_method globally for use in payment flow
        routerAuthMethod = data.auth_method || 'DIRECT_API';
        console.log('🔐 [ROUTER DEBUG] Router auth_method set to:', routerAuthMethod);
        
        // Store business name for branding
        if (data.business_name) {
            routerBusinessName = data.business_name;
            console.log('🏢 [ROUTER DEBUG] Business name:', routerBusinessName);
        }

        // Store payment methods
        if (data.payment_methods) {
            routerPaymentMethods = data.payment_methods;
            applyPaymentMethods(routerPaymentMethods);
            console.log('💳 [ROUTER DEBUG] Payment methods:', routerPaymentMethods);
        }
        setPaymentProvider(data.payment_provider);

        updateSupportPhone(data.support_phone);
        
        return data.router_id;
        
    } catch (error) {
        console.error('❌ [ROUTER DEBUG] Router lookup FAILED:', error.message);
        console.error('❌ [ROUTER DEBUG] Full error:', error);
        console.log('═══════════════════════════════════════════════════════');
        throw error;
    }
}

// ========================================
// DEV PREVIEW — shows a badge and clears mock data when clicked
// ========================================
function _showDevPreviewBadge() {
    if (document.getElementById('dev-preview-badge')) return;
    const badge = document.createElement('div');
    badge.id = 'dev-preview-badge';
    badge.style.cssText = [
        'position:fixed', 'top:8px', 'right:8px', 'z-index:99999',
        'background:#7c3aed', 'color:#fff', 'font:bold 11px/1.4 monospace',
        'padding:5px 10px', 'border-radius:5px', 'box-shadow:0 2px 10px rgba(0,0,0,.4)',
        'cursor:pointer', 'letter-spacing:.5px'
    ].join(';');
    badge.textContent = '🧪 DEV PREVIEW';
    badge.title = 'Using local mock data.\nClick to clear and use the live API on next reload.';
    badge.onclick = () => {
        try { sessionStorage.removeItem('__DEV_MOCK_PORTAL__'); } catch {}
        badge.remove();
        const msg = document.createElement('div');
        msg.style.cssText = badge.style.cssText + ';background:#16a34a;cursor:default';
        msg.textContent = '✅ Mock cleared — reload to use live API';
        document.body.appendChild(msg);
        setTimeout(() => msg.remove(), 3000);
    };
    document.body.appendChild(badge);
}

// ========================================
// PORTAL DATA FETCH — single request for router + plans + ads
// GET /api/public/portal/{identity}
// ========================================
async function fetchPortalData(identity) {
    // Demo mode shortcut — set via demo.html redirect.  No badge, silent.
    try {
        const _demoRaw = sessionStorage.getItem('__DEMO_PORTAL__');
        if (_demoRaw) {
            console.log('%c🎬 DEMO MODE — using local mock portal data', 'background:#0369a1;color:#fff;padding:2px 8px;border-radius:3px;font-weight:bold');
            return Promise.resolve(JSON.parse(_demoRaw));
        }
    } catch (_) {}

    // Dev preview shortcut — set via dev-preview.html or manually via sessionStorage /
    // window.__MOCK_PORTAL_DATA.  Persists across reloads in the same tab.
    try {
        const _raw = sessionStorage.getItem('__DEV_MOCK_PORTAL__');
        const mockData = window.__MOCK_PORTAL_DATA || (_raw && JSON.parse(_raw));
        if (mockData) {
            console.log('%c🧪 DEV PREVIEW — using local mock portal data', 'background:#7c3aed;color:#fff;padding:2px 8px;border-radius:3px;font-weight:bold');
            // Defer badge so it appears after the DOM is ready
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', _showDevPreviewBadge, { once: true });
            } else {
                setTimeout(_showDevPreviewBadge, 0);
            }
            return Promise.resolve(mockData);
        }
    } catch (_) {}

    if (!identity) {
        throw new Error('No router identity for portal lookup');
    }

    const url = `${PORTAL_ENDPOINT}/${encodeURIComponent(identity)}`;
    console.log('📡 [PORTAL] Fetching all data from:', url);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
        const response = await fetch(getProxiedUrl(url), {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            mode: 'cors',
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Portal API ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log('✅ [PORTAL] Response:', JSON.stringify(data, null, 2));
        return data;
    } catch (err) {
        clearTimeout(timeoutId);

        const isNetworkErr = err instanceof TypeError || err.name === 'AbortError';
        if (!window.__apiFallback.active && isNetworkErr) {
            activateApiFallback();

            const fb = new AbortController();
            const fbTimeout = setTimeout(() => fb.abort(), 15000);

            const response = await fetch(getProxiedUrl(url), {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                mode: 'cors',
                signal: fb.signal
            });

            clearTimeout(fbTimeout);

            if (!response.ok) {
                throw new Error(`Fallback Portal API ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            console.log('✅ [PORTAL] Response (via fallback):', JSON.stringify(data, null, 2));
            return data;
        }

        throw err;
    }
}

// Plans are always fetched fresh from the backend — never read from or written
// to localStorage.  Any previously cached plans are purged on first load.
(function clearLegacyPlanCache() {
    try { localStorage.removeItem('isp_cached_plans'); } catch {}
})();

// Bestseller plan ID - highlighted and shown first (updated from API if is_bestseller flag present)
let BESTSELLER_PLAN_ID = 13;

// ========================================
// EXTRACT MIKROTIK URL PARAMETERS
// ========================================
function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    
    // DEBUG: Log raw URL and all parameters
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔍 [ROUTER DEBUG] STEP 1: EXTRACTING URL PARAMETERS');
    console.log('═══════════════════════════════════════════════════════');
    console.log('📍 Full URL:', window.location.href);
    console.log('📍 Search string:', window.location.search);
    console.log('📍 All URL params:');
    for (const [key, value] of params.entries()) {
        console.log(`   - ${key}: "${value}"`);
    }
    
    const routerParam = params.get('router');
    console.log('📍 Raw router param from URL:', routerParam);
    console.log('📍 Router param type:', typeof routerParam);
    console.log('📍 Router param is null:', routerParam === null);
    console.log('📍 Router param is empty string:', routerParam === '');
    
    const result = {
        mac: params.get('mac') || '',
        ip: params.get('ip') || '',
        dst: params.get('dst') || '',
        gw: params.get('gw') || '',
        router: params.get('router') || ''
    };
    
    console.log('📍 Final router value after || fallback:', `"${result.router}"`);
    console.log('═══════════════════════════════════════════════════════');
    
    return result;
}

function normalizeGateway(gw) {
    if (!gw) return '';
    let value = String(gw).trim();
    value = value.replace(/^https?:\/\//i, '');
    value = value.split('/')[0];
    return value;
}

function normalizeDestination(dst, gw) {
    if (!dst) return '';

    let value = String(dst).trim();
    if (!value) return '';

    // `dst` must be an absolute URL for MikroTik post-login redirect.
    if (!/^https?:\/\//i.test(value)) {
        return '';
    }

    const gatewayHost = normalizeGateway(gw).toLowerCase();

    try {
        const parsed = new URL(value);
        const dstHost = (parsed.hostname || '').toLowerCase();
        const dstPath = (parsed.pathname || '/').toLowerCase();

        // Prevent redirecting back to hotspot control pages, which often show 404/loop.
        const isGatewayHost = gatewayHost && dstHost === gatewayHost;
        const isRouterMgmtHost = dstHost === '192.168.88.1';
        const isHotspotControlPath =
            dstPath === '/' ||
            dstPath.startsWith('/login') ||
            dstPath.startsWith('/logout') ||
            dstPath.startsWith('/status') ||
            dstPath.startsWith('/error');

        if ((isGatewayHost || isRouterMgmtHost) && isHotspotControlPath) {
            console.warn('[RADIUS] Ignoring unsafe dst redirect target:', value);
            return '';
        }

        return value;
    } catch (e) {
        console.warn('[RADIUS] Invalid dst URL, ignoring:', value);
        return '';
    }
}

function buildRadiusLoginUrl(gw, username, password, dst) {
    const gateway = normalizeGateway(gw);
    if (!gateway || !username || !password) return '';
    let url = `http://${gateway}/login?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
    const safeDst = normalizeDestination(dst, gateway);
    if (safeDst) {
        url += `&dst=${encodeURIComponent(safeDst)}`;
    }
    return url;
}

// Store MikroTik parameters globally
const mikrotikParams = getUrlParams();

// Log extracted parameters for debugging
console.log('🔧 MikroTik Parameters:', mikrotikParams);
console.log('🔧 mikrotikParams.router value:', `"${mikrotikParams.router}"`);

// ========================================
// STATE MANAGEMENT
// ========================================
let selectedPlan = null;
let allPlans = [];
let hotspotOffersFreeTrial = false; // set by displayPlans(); gates loadFreeTrials()

// ========================================
// DOM ELEMENTS
// ========================================
const plansSection = document.getElementById('plansSection');
const paymentSection = document.getElementById('paymentSection');
const processingSection = document.getElementById('processingSection');
const successSection = document.getElementById('successSection');
const errorSection = document.getElementById('errorSection');

const plansGrid = document.getElementById('plansGrid');
const selectedPlanInfo = document.getElementById('selectedPlanInfo');
const paymentForm = document.getElementById('paymentForm');
const phoneNumberInput = document.getElementById('phoneNumber');
const submitButton = document.getElementById('submitButton');
const buttonText = submitButton.querySelector('.button-text');
const buttonLoader = submitButton.querySelector('.button-loader');

const backButton = document.getElementById('backButton');
const newPurchaseButton = document.getElementById('newPurchaseButton');
const retryButton = document.getElementById('retryButton');

const errorMessage = document.getElementById('errorMessage');

// Processing section elements
const processingTitle = document.getElementById('processingTitle');
const processingSubtext = document.getElementById('processingSubtext');
const processingPlanInfo = document.getElementById('processingPlanInfo');
const processingStep1 = document.getElementById('step1');
const processingStep2 = document.getElementById('step2');
const processingStep3 = document.getElementById('step3');


// ========================================
// SAVED RADIUS LOGIN CHECK (handles redirect loop after payment)
// ========================================
function checkSavedRadiusLogin() {
    try {
        var saved = localStorage.getItem('bitwave_last_radius_login');
        if (!saved) return;
        var data = JSON.parse(saved);
        if (!data || !data.username || !data.password) return;
        var savedAt = new Date(data.savedAt);
        var ageMs = Date.now() - savedAt.getTime();
        if (ageMs > 5 * 60 * 1000) {
            localStorage.removeItem('bitwave_last_radius_login');
            return;
        }
        console.log('[RADIUS] Found recent saved login, attempting auto-login');
        var gw = mikrotikParams.gw || data.gateway;
        var dst = mikrotikParams.dst || data.dst || '';
        var loginUrl = buildRadiusLoginUrl(gw, data.username, data.password, dst);
        localStorage.removeItem('bitwave_last_radius_login');
        if (!loginUrl) {
            showSavedRadiusScreen(data);
            return;
        }
        hideSection(plansSection);
        hideSection(paymentSection);
        hideSection(errorSection);
        showSection(successSection);
        var sd = document.getElementById('successDetails');
        if (sd) {
            sd.innerHTML = '<div style="text-align:center;padding:20px;">' +
                '<div style="font-size:18px;font-weight:600;margin-bottom:8px;">Connecting you to the internet...</div>' +
                '<div style="font-size:14px;opacity:0.8;">Redirecting to login automatically</div>' +
                '<div style="margin-top:16px;font-size:13px;opacity:0.7;">Username: <strong>' + data.username + '</strong></div>' +
                '<div style="margin-top:16px;"><a href="' + loginUrl + '" style="display:inline-block;padding:10px 20px;background:#10b981;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Tap here if not redirected</a></div></div>';
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(function() { window.location.href = loginUrl; }, 1500);
    } catch (e) {
        console.warn('[RADIUS] Error checking saved login:', e);
    }
}

function showSavedRadiusScreen(data) {
    hideSection(plansSection);
    hideSection(paymentSection);
    hideSection(processingSection);
    hideSection(errorSection);
    showSection(successSection);
    var sd = document.getElementById('successDetails');
    if (sd) {
        var gw = mikrotikParams.gw || data.gateway;
        var dst = mikrotikParams.dst || data.dst || '';
        var loginUrl = buildRadiusLoginUrl(gw, data.username, data.password, dst);
        var html = '<div style="text-align:center;padding:20px;">' +
            '<div style="font-size:18px;font-weight:600;margin-bottom:8px;">Your plan is active!</div>' +
            '<div style="font-size:14px;opacity:0.8;margin-bottom:16px;">Use the credentials below to connect</div>' +
            '<div style="padding:12px;background:#111827;border-radius:8px;color:#fff;text-align:left;">' +
            '<div style="font-weight:600;margin-bottom:6px;">Login Details</div>' +
            '<div style="font-size:13px;opacity:0.85;">Username: <strong>' + data.username + '</strong></div>' +
            '<div style="font-size:13px;opacity:0.85;">Password: <strong>' + data.password + '</strong></div></div>';
        if (loginUrl) {
            html += '<div style="margin-top:16px;"><a href="' + loginUrl + '" style="display:inline-block;padding:10px 20px;background:#10b981;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Tap to Connect</a></div>';
        }
        html += '</div>';
        sd.innerHTML = html;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
// ========================================
// INITIALIZATION
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🚀 [ROUTER DEBUG] DOM CONTENT LOADED - INITIALIZATION');
    console.log('═══════════════════════════════════════════════════════');

    // ── Instant render from cache ──────────────────────────────────────────────
    // Apply the last-known full portal settings (theme, header style, branding,
    // feature flags) so returning users see the correct UI on the very first
    // paint — before the API responds.  Falls back to a neutral slate_gray theme
    // on a first visit so there is no sunset-orange flash.
    // Only reused when the cache was written for THIS router — otherwise a
    // device that connected to another reseller's hotspot would briefly show
    // that reseller's branding and support number.
    try {
        const rawSettings = localStorage.getItem('_cached_portal_settings');
        const cachedRouter = localStorage.getItem('_cached_portal_settings_router');
        if (rawSettings && cachedRouter === (mikrotikParams.router || '')) {
            applyPortalSettings(JSON.parse(rawSettings));
        } else {
            applyTheme('slate_gray');
        }
    } catch {
        applyTheme('slate_gray');
    }

    // Apply cached payment-method flags so the plans / voucher sections render
    // correctly from the first frame (before router data comes back).
    try {
        const rawMethods = localStorage.getItem('_cached_payment_methods');
        if (rawMethods) applyPaymentMethods(JSON.parse(rawMethods));
    } catch { /* ignore — HTML defaults (mpesa visible, voucher hidden) are safe */ }
    try {
        setPaymentProvider(localStorage.getItem('_cached_payment_provider'));
    } catch { /* ignore — M-Pesa is the safe default */ }

    // Check for saved RADIUS credentials from a previous payment session
    checkSavedRadiusLogin();
    
    // Validate required parameters
    if (!mikrotikParams.mac) {
        console.warn('⚠️ Warning: Missing MAC address from MikroTik.');
        console.log('💡 This page should be accessed via MikroTik hotspot redirect.');
    }
    
    // Disable pay button until router_id is resolved
    if (submitButton) {
        submitButton.disabled = true;
        console.log('🔒 [ROUTER DEBUG] Pay button DISABLED until router_id resolves');
    }
    
    const routerIdentity = mikrotikParams.router || 'MikroTik';
    console.log('📍 Router identity:', `"${routerIdentity}"`);

    // Single portal fetch — router + plans + ads in one request
    // Falls back to individual endpoints if the portal endpoint fails
    window.portalDataPromise = fetchPortalData(routerIdentity)
        .then(data => {
            // ---- Router info ----
            if (data.router) {
                routerId = data.router.router_id;
                routerAuthMethod = data.router.auth_method || 'DIRECT_API';
                routerBusinessName = data.router.business_name || null;
                window._routerBusinessName = routerBusinessName;
                routerPaymentMethods = data.router.payment_methods || ['mpesa', 'voucher'];
                setPaymentProvider(data.router.payment_provider);
                console.log('✅ [PORTAL] Router resolved — id:', routerId, 'auth:', routerAuthMethod, 'methods:', routerPaymentMethods);
                updateBranding();
                applyPaymentMethods(routerPaymentMethods);
                try { localStorage.setItem('_cached_payment_methods', JSON.stringify(routerPaymentMethods)); } catch {}
                try { localStorage.setItem('_cached_payment_provider', routerPaymentProvider); } catch {}
                updateSupportPhone(data.router.support_phone);
            }

            // ---- Plan Flags (must be set before plans are rendered) ----
            if (data.plan_flags) {
                planFlags = data.plan_flags;
                console.log('✅ [PORTAL] Plan flags:', planFlags);
                applyPlanFlags(planFlags);
                applyPaymentMethods(routerPaymentMethods);
            }

            // ---- Portal Settings (must run BEFORE plans so flags like
            //      show_plan_speed are in portalSettings when cards render) ----
            if (data.portal_settings) {
                if (data.portal_settings.featured_plan_ids) {
                    window.featuredPlanIds = data.portal_settings.featured_plan_ids
                        .split(',').map(Number).filter(Boolean);
                }
                applyPortalSettings(data.portal_settings); // also sets portalSettings global
            }

            // ---- Plans ----
            if (Array.isArray(data.plans) && data.plans.length > 0) {
                const apiBestseller = data.plans.find(p => p.is_bestseller);
                if (apiBestseller) {
                    BESTSELLER_PLAN_ID = apiBestseller.id;
                }
                displayPlans(data.plans);
                console.log('✅ [PORTAL] Plans loaded:', data.plans.length);
            } else {
                reportPlansFailure('empty', 'portal response had no plans');
                showPlansError();
            }

            // ---- Ads (store for ads.js to consume) ----
            window._portalAds = data.ads || [];
            console.log('✅ [PORTAL] Ads received:', window._portalAds.length);

            return data;
        })
        .catch(async (error) => {
            console.warn('⚠️ [PORTAL] Portal fetch failed, falling back to individual endpoints:', error.message);
            window._portalAds = null; // signal ads.js to fetch independently

            // Fallback: individual router lookup + plans fetch
            try {
                routerId = await getRouterId(routerIdentity);
                updateBranding();
            } catch (err) {
                console.error('❌ Router lookup fallback failed:', err.message);
                routerId = FALLBACK_ROUTER_ID;
                routerAuthMethod = 'DIRECT_API';
                applyPaymentMethods(['mpesa', 'voucher']);
            }

            try {
                const freshPlans = await fetchPlansFromAPI(routerId);
                displayPlans(freshPlans);
            } catch (err) {
                console.warn('⚠️ Plans fallback failed:', err.message);
                reportPlansFailure('fallback',
                    'portal: ' + (error && error.message) + ' | plans: ' + err.message);
                showPlansError();
            }
        })
        .finally(() => {
            console.log('🏁 Portal data resolved. routerId:', routerId);
            if (submitButton) {
                submitButton.disabled = false;
                console.log('🔓 Pay button ENABLED');
            }

            // router_id and the plan list are both known now.
            loadFreeTrials();

            // Safety net: clear the loading shimmer on the standard header
            // and fill in a fallback name so the header never stays blank.
            const brandLink = document.getElementById('brandLink');
            if (brandLink) brandLink.classList.remove('brand-loading');
            const logoEl = document.querySelector('.logo');
            if (logoEl && !logoEl.textContent.trim()) {
                logoEl.textContent = 'WiFi Portal';
            }
        });
    
    setupEventListeners();
    setupVoucherUI();
    setupReconnectUI();
    loadSavedPhoneNumber(); // Works on desktop; mobile captive portals wipe storage
    setupBrandLink(); // Preserve MikroTik params when clicking logo
});

// ========================================
// ESCAPE HTML — XSS protection for dynamic content
// ========================================
function escapeHtml(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ========================================
// THEMES — full colour palettes for applyTheme()
// ========================================
const THEMES = {
    sunset_orange: {
        primary: '#E85D04', primaryLight: '#F48C06', primaryDark: '#DC2F02',
        accent: '#FFBA08', background: '#FFFCF2', surface: '#FFFFFF',
        text: '#1A1A1A', textSecondary: '#6B7280', textInverse: '#FFFFFF',
        border: '#E5E7EB', success: '#10B981', error: '#EF4444', info: '#3B82F6', warning: '#F59E0B'
    },
    ocean_blue: {
        primary: '#3B82F6', primaryLight: '#60A5FA', primaryDark: '#2563EB',
        accent: '#06B6D4', background: '#F0F7FF', surface: '#FFFFFF',
        text: '#1A1A1A', textSecondary: '#6B7280', textInverse: '#FFFFFF',
        border: '#E5E7EB', success: '#10B981', error: '#EF4444', info: '#0EA5E9', warning: '#F59E0B'
    },
    emerald_green: {
        primary: '#10B981', primaryLight: '#34D399', primaryDark: '#059669',
        accent: '#84CC16', background: '#F0FDF4', surface: '#FFFFFF',
        text: '#1A1A1A', textSecondary: '#6B7280', textInverse: '#FFFFFF',
        border: '#E5E7EB', success: '#16A34A', error: '#EF4444', info: '#3B82F6', warning: '#F59E0B'
    },
    bright_violet: {
        primary: '#8B5CF6', primaryLight: '#A78BFA', primaryDark: '#7C3AED',
        accent: '#F472B6', background: '#FAF5FF', surface: '#FFFFFF',
        text: '#1A1A1A', textSecondary: '#6B7280', textInverse: '#FFFFFF',
        border: '#E5E7EB', success: '#10B981', error: '#EF4444', info: '#3B82F6', warning: '#F59E0B'
    },
    rose_gold: {
        primary: '#E11D48', primaryLight: '#FB7185', primaryDark: '#BE123C',
        accent: '#FB923C', background: '#FFF1F2', surface: '#FFFFFF',
        text: '#1A1A1A', textSecondary: '#6B7280', textInverse: '#FFFFFF',
        border: '#E5E7EB', success: '#10B981', error: '#EF4444', info: '#3B82F6', warning: '#F59E0B'
    },
    slate_gray: {
        primary: '#475569', primaryLight: '#64748B', primaryDark: '#334155',
        accent: '#F97316', background: '#F8FAFC', surface: '#FFFFFF',
        text: '#1A1A1A', textSecondary: '#6B7280', textInverse: '#FFFFFF',
        border: '#E5E7EB', success: '#10B981', error: '#EF4444', info: '#3B82F6', warning: '#F59E0B'
    }
};

function applyTheme(themeName) {
    const palette = THEMES[themeName] || THEMES.sunset_orange;
    const root = document.documentElement;

    // New --p-* variables (used by new theme-aware components)
    root.style.setProperty('--p-primary',        palette.primary);
    root.style.setProperty('--p-primary-light',  palette.primaryLight);
    root.style.setProperty('--p-primary-dark',   palette.primaryDark);
    root.style.setProperty('--p-accent',         palette.accent);
    root.style.setProperty('--p-bg',             palette.background);
    root.style.setProperty('--p-surface',        palette.surface);
    root.style.setProperty('--p-text',           palette.text);
    root.style.setProperty('--p-text-sec',       palette.textSecondary);
    root.style.setProperty('--p-text-inv',       palette.textInverse);
    root.style.setProperty('--p-border',         palette.border);
    root.style.setProperty('--p-success',        palette.success);
    root.style.setProperty('--p-error',          palette.error);
    root.style.setProperty('--p-info',           palette.info);
    root.style.setProperty('--p-warning',        palette.warning);

    // Bridge to existing styles003.css variable names so existing
    // plan cards, buttons, steps, etc. all pick up the theme too.
    root.style.setProperty('--primary',          palette.primary);
    root.style.setProperty('--primary-light',    palette.primaryLight);
    root.style.setProperty('--primary-dark',     palette.primaryDark);
    root.style.setProperty('--accent',           palette.accent);
    root.style.setProperty('--accent-soft',      palette.accent);
    root.style.setProperty('--bg',               palette.background);
    root.style.setProperty('--bg-warm',          palette.background);
    root.style.setProperty('--surface',          palette.surface);
    root.style.setProperty('--surface-raised',   palette.surface);
    root.style.setProperty('--text',             palette.text);
    root.style.setProperty('--text-secondary',   palette.textSecondary);
    root.style.setProperty('--text-light',       palette.textSecondary);
    root.style.setProperty('--text-inverse',     palette.textInverse);
    root.style.setProperty('--success',          palette.success);
    root.style.setProperty('--error',            palette.error);
    // Update glow shadow to match primary
    root.style.setProperty('--shadow-glow', `0 4px 20px ${palette.primary}40`);

    // RGB decomposed vars so CSS can do rgba(var(--primary-rgb), 0.1) etc.
    const hexRgb = (hex) => {
        const h = hex.replace('#', '');
        return `${parseInt(h.slice(0,2),16)}, ${parseInt(h.slice(2,4),16)}, ${parseInt(h.slice(4,6),16)}`;
    };
    const rgb = hexRgb(palette.primary);
    root.style.setProperty('--primary-rgb', rgb);
    root.style.setProperty('--accent-rgb',  hexRgb(palette.accent));

    // Precomputed tint variables — slate_gray's primary is near-neutral so we
    // scale opacity up (2.8×) to achieve the same visual weight as saturated
    // primaries.  All other themes use 1× (unchanged).  CSS background tints
    // reference these vars so the whole page adapts automatically.
    const tintScale = (themeName === 'slate_gray') ? 2.8 : 1;
    const tint = (base) => `rgba(${rgb}, ${Math.min(+(base * tintScale).toFixed(3), 0.42)})`;
    root.style.setProperty('--pt-03', tint(0.03));
    root.style.setProperty('--pt-05', tint(0.05));
    root.style.setProperty('--pt-07', tint(0.07));
    root.style.setProperty('--pt-10', tint(0.10));
    root.style.setProperty('--pt-12', tint(0.12));
    root.style.setProperty('--pt-15', tint(0.15));
    root.style.setProperty('--pt-18', tint(0.18));

    document.documentElement.dataset.theme = themeName;
}

// ========================================
// HEADER RENDERING — standard & hero modes
// ========================================
function isSafeImageUrl(url) {
    if (!url) return false;
    try {
        const { protocol } = new URL(url);
        // Allow any HTTPS image (URLs come from trusted admin portal settings).
        // Also allow HTTP on localhost for local dev.
        return protocol === 'https:'
            || (protocol === 'http:' && location.hostname === 'localhost');
    } catch { return false; }
}

function wifiSvgHtml() {
    return `<svg class="hero-wifi-icon" viewBox="0 0 80 60" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M40 48l6-6a8.5 8.5 0 00-12 0l6 6z" fill="white" opacity="0.9"/>
        <path d="M40 48l10-10a14 14 0 00-20 0l10 10z" fill="white" opacity="0.6"/>
        <path d="M40 48l15-15a21 21 0 00-30 0l15 15z" fill="white" opacity="0.35"/>
        <circle cx="40" cy="50" r="3" fill="white"/>
    </svg>`;
}

// Device-allowance icon. Inline SVG rather than an emoji: the portal is loaded
// almost entirely by low-end Android handsets, where emoji font coverage is
// patchy and a missing glyph renders as a blank box next to the text.
function devicesSvgHtml() {
    return `<svg class="plan-devices-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false">
        <circle cx="5.75" cy="4.5" r="2.5"/>
        <path d="M5.75 8.25c-2.485 0-4.5 1.455-4.5 3.25v1.25c0 .414.336.75.75.75h7.5a.75.75 0 00.75-.75V11.5c0-1.795-2.015-3.25-4.5-3.25z"/>
        <circle cx="12" cy="5.75" r="2"/>
        <path d="M12 9c-.62 0-1.199.1-1.71.276.6.66.96 1.472.96 2.224v1.25c0 .263-.05.515-.14.75h3.14a.75.75 0 00.75-.75v-1C15 10.25 13.68 9 12 9z"/>
    </svg>`;
}

function renderStandardHeader(settings) {
    const header = document.getElementById('portal-header');
    if (!header) return;

    // If the header was previously rendered as a hero (e.g. from cached settings
    // that have since been changed to standard), rebuild the standard HTML.
    if (header.classList.contains('portal-header--hero')) {
        const name = escapeHtml(settings.welcome_title || '');
        header.className = 'header';
        header.innerHTML = `
            <div class="header-inner">
                <a href="#" class="brand ${name ? '' : 'brand-loading'}" id="brandLink">
                    <span class="brand-icon">📡</span>
                    <div class="brand-text">
                        <h1 class="logo">${name}</h1>
                        <span class="tagline">Public WiFi</span>
                    </div>
                </a>
                <a href="#" class="help-btn" data-support-link style="display:none">
                    <span class="help-icon">📞</span>
                    <span class="help-text" data-i18n="helpBtn">Help</span>
                </a>
            </div>`;
        // Re-attach the brand-link reset behaviour after innerHTML was replaced
        setupBrandLink();
        refreshSupportLinks();
        return;
    }

    // Standard header already rendered — make sure the Help button is opted in
    // to the support-phone wiring (refreshSupportLinks fills in the number).
    const helpBtn = header.querySelector('.help-btn');
    if (helpBtn) helpBtn.setAttribute('data-support-link', '');
    refreshSupportLinks();
}

function renderHeroHeader(settings) {
    const header = document.getElementById('portal-header');
    if (!header) return;
    const palette = THEMES[settings.color_theme] || THEMES.sunset_orange;
    const title = settings.welcome_title || window._routerBusinessName || 'Welcome';
    const subtitle = settings.welcome_subtitle || 'Fast & Reliable Internet Access';

    // Portal runs behind a walled garden — always use a bundled local preset.
    // Resolution order:
    //   1. Match the Unsplash photo ID stored by the admin portal → preset name
    //   2. Keyword in the URL (e.g. "/presets/nature.webp")
    //   3. Default to 'city'
    const PRESET_PHOTO_IDS = {
        '1477959858617-67f85cf4f1df': 'city',
        '1529156069898-49953e39b3ac': 'people',
        '1523805009345-7448845a9e53': 'nature',
        '1554118811-1e0d58224f24':    'cafe',
        '1518770660439-4636190af475': 'tech',
    };
    const PRESET_NAMES = ['city', 'cafe', 'nature', 'people', 'tech'];
    const configuredUrl = (settings.header_bg_image_url || '').toLowerCase();
    const photoIdMatch  = configuredUrl.match(/photo-([\w-]+)/);
    const preset =
        (photoIdMatch && PRESET_PHOTO_IDS[photoIdMatch[1]]) ||
        PRESET_NAMES.find(p => configuredUrl.includes(p))   ||
        'city';

    const picHtml = `
        <picture class="hero-bg-img">
            <source srcset="images/presets/${preset}.webp" type="image/webp">
            <img src="images/presets/${preset}.jpg" alt="" aria-hidden="true" decoding="async" fetchpriority="high">
        </picture>`;

    // Always offer Call Support — never WhatsApp. WhatsApp deep-links are
    // unreliable behind the captive-portal walled garden, so we ignore
    // settings.portal_support_whatsapp even when the reseller has one set.
    // The number itself is filled in by refreshSupportLinks() below.
    const supportHtml = `<a href="#" class="hero-support-btn" data-support-link style="display:none">
               <span>📞</span> Call Support
           </a>`;

    header.className = 'portal-header portal-header--hero';
    header.innerHTML = `
        ${picHtml}
        <div class="hero-gradient-overlay" style="background: linear-gradient(135deg, ${palette.primary}bb 0%, ${palette.primaryDark}88 100%)"></div>
        <div class="hero-content">
            ${wifiSvgHtml()}
            <h1 class="hero-title">${escapeHtml(title)}</h1>
            <p class="hero-subtitle">${escapeHtml(subtitle)}</p>
            <div class="hero-pills">
                <span class="hero-pill" data-i18n="fastPill">⚡ Fast</span>
                <span class="hero-pill" data-i18n="securePill">🔒 Secure</span>
                <span class="hero-pill" data-i18n="easyPill">📱 Easy</span>
            </div>
            ${supportHtml}
        </div>`;

    refreshSupportLinks();

    const img = header.querySelector('.hero-bg-img img');
    if (img) {
        const markLoaded = () => img.closest('picture').classList.add('loaded');
        if (img.complete && img.naturalWidth > 0) {
            markLoaded();
        } else {
            img.addEventListener('load', markLoaded);
            img.addEventListener('error', markLoaded); // gradient-only fallback (local file missing)
        }
    }
}

function renderHeader(settings) {
    if (settings.header_style === 'hero') {
        renderHeroHeader(settings);
    } else {
        renderStandardHeader(settings);
    }
}

// ========================================
// FEATURE FLAGS — show/hide portal sections
// ========================================
function applyFeatureFlags(settings) {
    // Expose show_ads flag globally so ads.js can respect it during its own init
    window._portalShowAds = !!settings.show_ads;

    const adsSection = document.getElementById('ads-section');
    if (adsSection) {
        const showAds = settings.show_ads && window._portalAds && window._portalAds.length > 0;
        adsSection.style.display = showAds ? '' : 'none';
    }

    const reconnectBlock = document.getElementById('reconnectSection');
    if (reconnectBlock) {
        reconnectBlock.style.display = settings.show_reconnect_button !== false ? '' : 'none';
    }

    const welcomeBanner = document.getElementById('welcome-banner');
    if (welcomeBanner) {
        // The title is already prominent in both modes (hero heading / sticky header brand),
        // so only show the welcome banner when there is a subtitle with extra context.
        const showBanner = settings.show_welcome_banner && !!settings.welcome_subtitle;
        welcomeBanner.style.display = showBanner ? '' : 'none';
        if (showBanner) {
            const titleEl = welcomeBanner.querySelector('.welcome-banner-title');
            const subEl = welcomeBanner.querySelector('.welcome-banner-sub');
            if (titleEl) {
                titleEl.style.display = 'none'; // title always visible elsewhere
            }
            if (subEl) subEl.textContent = settings.welcome_subtitle;
        }
    }

    const announcement = document.getElementById('announcement-banner');
    if (announcement) {
        const showAnnouncement = settings.show_announcement && settings.announcement_text;
        announcement.style.display = showAnnouncement ? '' : 'none';
        if (showAnnouncement) {
            announcement.dataset.type = settings.announcement_type || 'info';
            const textEl = announcement.querySelector('.announcement-text');
            if (textEl) textEl.textContent = settings.announcement_text;
        }
    }

    const ratings = document.getElementById('ratings-section');
    if (ratings) {
        ratings.style.display = settings.show_ratings ? '' : 'none';
    }

    const socialSection = document.getElementById('social-links');
    if (socialSection) {
        const hasSocial = settings.show_social_links &&
            (settings.facebook_url || settings.whatsapp_group_url || settings.instagram_url);
        socialSection.style.display = hasSocial ? '' : 'none';
        if (hasSocial) {
            const fbLink = socialSection.querySelector('.social-link--facebook');
            const waLink = socialSection.querySelector('.social-link--whatsapp');
            const igLink = socialSection.querySelector('.social-link--instagram');
            if (fbLink) { fbLink.href = settings.facebook_url || '#'; fbLink.style.display = settings.facebook_url ? '' : 'none'; }
            if (waLink) { waLink.href = settings.whatsapp_group_url ? `https://wa.me/${settings.whatsapp_group_url}` : '#'; waLink.style.display = settings.whatsapp_group_url ? '' : 'none'; }
            if (igLink) { igLink.href = settings.instagram_url || '#'; igLink.style.display = settings.instagram_url ? '' : 'none'; }
        }
    }
}

// ========================================
// BRANDING — titles, footer, promo phone
// ========================================
function applyBranding(settings) {
    const title = settings.welcome_title || window._routerBusinessName || 'Demo ISP';

    document.title = title;

    const planHeading = document.getElementById('plans-section-title');
    if (planHeading) planHeading.textContent = settings.plans_section_title || 'Choose Your Plan';

    const footer = document.getElementById('portal-footer-text');
    if (footer) footer.textContent = settings.footer_text || `© ${new Date().getFullYear()} Bitwave Technologies. All rights reserved.`;

    // The home-installation promo and every other "call us" CTA get their
    // number from refreshSupportLinks() — see applyPortalSettings().
}

// ========================================
// FEATURED PLAN ORDERING
// ========================================
function applyFeaturedOrder(plans, featuredIds) {
    if (!featuredIds || !featuredIds.length) return plans;
    const featured = featuredIds.map(id => plans.find(p => p.id === id)).filter(Boolean);
    const rest = plans.filter(p => !featuredIds.includes(p.id));
    return [...featured, ...rest];
}

// ========================================
// I18N — multi-language support
// ========================================
const I18N = {
    en: {
        choosePlan: 'Choose Your Plan',
        enterPhone: 'Enter Phone Number',
        pay: 'Pay & Connect',
        reconnectTitle: 'Already paid? Reconnect',
        reconnectSub: 'Enter your phone number or code to reconnect',
        reconnectHint: 'Enter your {provider} phone number or code',
        reconnectPlaceholder: 'Phone or code e.g. 0712… or ABC-DEF',
        reconnectInvalid: 'Please enter a valid {provider} phone number or code (e.g. ABC-DEF or your {provider} receipt)',
        reconnectPhoneDetected: '📱 Phone number detected',
        reconnectCodeDetected: '🎟️ Code detected',
        codeTitle: 'Have a Voucher or access code?',
        codeSub: 'Use the same code on every device your plan covers',
        codePlaceholder: 'Voucher, access code or receipt',
        codeConnect: 'Connect',
        codeShareHint: 'Use this same code on up to {n} devices',
        codePlanStarted: 'Your plan has started',
        codeDeviceAdded: 'Connected. This device is now sharing the plan',
        codeMainDevice: "You're back online",
        codeNotFound: 'Code not found. Check it and try again.',
        codeExpired: 'This plan has expired. Buy a new plan to get back online.',
        codeTooMany: 'Too many wrong attempts. Please wait a few minutes and try again.',
        noMac: "We couldn't identify this device. Turn WiFi off and on, reconnect to this network, then open this page again.",
        limitTitle: 'Device limit reached',
        limitSub: 'This plan is already in use on {n} devices. Remove one to connect this device.',
        limitNoCode: 'Enter your access code or {provider} receipt to manage these devices.',
        limitRemove: 'Remove',
        limitRemoving: 'Removing…',
        limitConfirmTitle: 'Remove device?',
        limitConfirmMsg: '{name} will lose internet.',
        limitCancel: 'Cancel',
        mainDevice: 'Main device',
        deviceLabel: 'Device',
        thisDevice: 'This device',
        accessCodeTitle: 'Your access code',
        accessCodeBody: "Enter it on your other devices (up to {n}) under 'Voucher or access code'.",
        copy: 'Copy',
        copied: 'Copied',
        reconnectBtn: 'Reconnect',
        helpBtn: 'Help',
        callSupport: 'Call Support',
        fastPill: '⚡ Fast',
        securePill: '🔒 Secure',
        easyPill: '📱 Easy',
        followUs: 'Follow Us',
        ratingsLabel: 'How was your connection?',
        swipeHint: '← Swipe for more deals →',
        adsBadge: 'Soko Deals Today',
        trialTry: 'Try free for {duration}',
        trialNoPayment: 'No payment needed',
        trialStarted: 'Your free trial has started',
        trialMethod: 'Free trial',
        trialFailed: "Couldn't start the free trial. Please try again.",
        trialNotPayable: 'This plan is free. Use the "Try free" button to get it.',
    },
    sw: {
        choosePlan: 'Chagua Mpango',
        enterPhone: 'Ingiza Nambari ya Simu',
        pay: 'Lipa & Unganisha',
        reconnectTitle: 'Ulisha lipa? Unganisha tena',
        reconnectSub: 'Ingiza nambari ya simu au msimbo kuunganisha tena',
        reconnectHint: 'Ingiza nambari ya simu ya {provider} au msimbo',
        reconnectPlaceholder: 'Simu au msimbo k.m. 0712… au ABC-DEF',
        reconnectInvalid: 'Ingiza nambari sahihi ya simu ya {provider} au msimbo (k.m. ABC-DEF au risiti ya {provider})',
        reconnectPhoneDetected: '📱 Nambari ya simu imetambuliwa',
        reconnectCodeDetected: '🎟️ Msimbo umetambuliwa',
        codeTitle: 'Una voucher au msimbo wa kuingia?',
        codeSub: 'Tumia msimbo huo huo kwenye kila kifaa mpango wako unaruhusu',
        codePlaceholder: 'Voucher, msimbo au risiti',
        codeConnect: 'Unganisha',
        codeShareHint: 'Tumia msimbo huu huu kwenye hadi vifaa {n}',
        codePlanStarted: 'Mpango wako umeanza',
        codeDeviceAdded: 'Umeunganishwa. Kifaa hiki sasa kinashiriki mpango',
        codeMainDevice: 'Umerudi mtandaoni',
        codeNotFound: 'Msimbo haujapatikana. Kagua na ujaribu tena.',
        codeExpired: 'Mpango huu umeisha. Nunua mpango mpya ili kuunganisha tena.',
        codeTooMany: 'Majaribio mengi yasiyo sahihi. Subiri dakika chache kisha ujaribu tena.',
        noMac: 'Hatukuweza kutambua kifaa hiki. Zima na uwashe WiFi, unganisha kwenye mtandao huu tena, kisha fungua ukurasa huu upya.',
        limitTitle: 'Idadi ya vifaa imefikia kikomo',
        limitSub: 'Mpango huu tayari unatumika kwenye vifaa {n}. Ondoa kimoja ili kuunganisha kifaa hiki.',
        limitNoCode: 'Ingiza msimbo wako au risiti ya {provider} ili kusimamia vifaa hivi.',
        limitRemove: 'Ondoa',
        limitRemoving: 'Inaondoa…',
        limitConfirmTitle: 'Ondoa kifaa?',
        limitConfirmMsg: '{name} kitapoteza intaneti.',
        limitCancel: 'Ghairi',
        mainDevice: 'Kifaa kikuu',
        deviceLabel: 'Kifaa',
        thisDevice: 'Kifaa hiki',
        accessCodeTitle: 'Msimbo wako wa kuingia',
        accessCodeBody: "Uingize kwenye vifaa vyako vingine (hadi {n}) chini ya 'Voucher au msimbo wa kuingia'.",
        copy: 'Nakili',
        copied: 'Imenakiliwa',
        reconnectBtn: 'Unganisha',
        helpBtn: 'Msaada',
        callSupport: 'Piga Simu',
        fastPill: '⚡ Haraka',
        securePill: '🔒 Salama',
        easyPill: '📱 Rahisi',
        followUs: 'Tufuate',
        ratingsLabel: 'Muunganiko ulikuwaje?',
        swipeHint: '← Sogeza zaidi →',
        adsBadge: 'Ofa za Leo',
        trialTry: 'Jaribu bure kwa {duration}',
        trialNoPayment: 'Hakuna malipo',
        trialStarted: 'Majaribio yako ya bure yameanza',
        trialMethod: 'Majaribio ya bure',
        trialFailed: 'Imeshindikana kuanza majaribio ya bure. Tafadhali jaribu tena.',
        trialNotPayable: 'Mpango huu ni wa bure. Tumia kitufe cha "Jaribu bure" kuupata.',
    },
    fr: {
        choosePlan: 'Choisissez votre forfait',
        enterPhone: 'Entrez votre numéro',
        pay: 'Payer & Connecter',
        reconnectTitle: 'Déjà payé? Reconnectez',
        reconnectSub: 'Entrez votre numéro ou code',
        reconnectHint: 'Entrez votre numéro {provider} ou code',
        reconnectPlaceholder: 'Numéro ou code ex. 0712… ou ABC-DEF',
        reconnectInvalid: 'Entrez un numéro {provider} valide ou un code (ex. ABC-DEF ou votre reçu {provider})',
        reconnectPhoneDetected: '📱 Numéro détecté',
        reconnectCodeDetected: '🎟️ Code détecté',
        codeTitle: "Vous avez un voucher ou un code d'accès ?",
        codeSub: 'Utilisez le même code sur chaque appareil couvert par votre forfait',
        codePlaceholder: "Voucher, code d'accès ou reçu",
        codeConnect: 'Connecter',
        codeShareHint: "Utilisez ce même code sur jusqu'à {n} appareils",
        codePlanStarted: 'Votre forfait a démarré',
        codeDeviceAdded: 'Connecté. Cet appareil partage maintenant le forfait',
        codeMainDevice: 'Vous êtes de nouveau en ligne',
        codeNotFound: 'Code introuvable. Vérifiez-le et réessayez.',
        codeExpired: 'Ce forfait a expiré. Achetez un nouveau forfait pour vous reconnecter.',
        codeTooMany: 'Trop de tentatives incorrectes. Patientez quelques minutes puis réessayez.',
        noMac: "Impossible d'identifier cet appareil. Désactivez puis réactivez le WiFi, reconnectez-vous à ce réseau, puis rouvrez cette page.",
        limitTitle: "Limite d'appareils atteinte",
        limitSub: 'Ce forfait est déjà utilisé sur {n} appareils. Retirez-en un pour connecter cet appareil.',
        limitNoCode: "Entrez votre code d'accès ou votre reçu {provider} pour gérer ces appareils.",
        limitRemove: 'Retirer',
        limitRemoving: 'Retrait…',
        limitConfirmTitle: "Retirer l'appareil ?",
        limitConfirmMsg: '{name} perdra internet.',
        limitCancel: 'Annuler',
        mainDevice: 'Appareil principal',
        deviceLabel: 'Appareil',
        thisDevice: 'Cet appareil',
        accessCodeTitle: "Votre code d'accès",
        accessCodeBody: "Saisissez-le sur vos autres appareils (jusqu'à {n}) dans « Voucher ou code d'accès ».",
        copy: 'Copier',
        copied: 'Copié',
        reconnectBtn: 'Reconnecter',
        helpBtn: 'Aide',
        callSupport: 'Appeler Support',
        fastPill: '⚡ Rapide',
        securePill: '🔒 Sécurisé',
        easyPill: '📱 Facile',
        followUs: 'Suivez-nous',
        ratingsLabel: 'Comment était votre connexion?',
        swipeHint: '← Glissez pour plus →',
        adsBadge: 'Offres du Jour',
        trialTry: 'Essai gratuit : {duration}',
        trialNoPayment: 'Aucun paiement requis',
        trialStarted: 'Votre essai gratuit a commencé',
        trialMethod: 'Essai gratuit',
        trialFailed: "Impossible de démarrer l'essai gratuit. Veuillez réessayer.",
        trialNotPayable: 'Ce forfait est gratuit. Utilisez le bouton « Essai gratuit » pour en profiter.',
    }
};

let currentLang = 'en';

// Translate a key for the active portal language, filling {placeholders}.
// {provider} defaults to the router's mobile-money label.
function tr(key, vars = {}) {
    const dict = I18N[currentLang] || I18N.en;
    const template = dict[key] !== undefined ? dict[key] : (I18N.en[key] !== undefined ? I18N.en[key] : key);
    const values = { provider: getPaymentProviderLabel(), ...vars };
    return String(template).replace(/\{(\w+)\}/g, (m, name) => (values[name] !== undefined ? String(values[name]) : m));
}

function applyLanguage(lang) {
    currentLang = I18N[lang] ? lang : 'en';
    const t = I18N[currentLang];
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        if (t[key] !== undefined) el.textContent = t[key];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.dataset.i18nPlaceholder;
        if (t[key] !== undefined) el.placeholder = t[key];
    });
    updateReconnectHint();
}

// ========================================
// APPLY PORTAL SETTINGS — orchestrator
// ========================================
function applyPortalSettings(settings) {
    portalSettings = settings; // keep global in sync (covers startup-cache path)
    applyTheme(settings.color_theme || 'sunset_orange');
    // Persist the full settings object so the next page load renders
    // the correct theme, header style, branding, and feature flags
    // instantly — before the API responds (stale-while-revalidate).
    // Tagged with the router identity: the same device can hop between two
    // resellers' hotspots on this portal, and a cross-reseller cache hit would
    // show the wrong support number on first paint.
    try {
        localStorage.setItem('_cached_portal_settings', JSON.stringify(settings));
        localStorage.setItem('_cached_portal_settings_router', mikrotikParams.router || '');
    } catch {}
    renderHeader(settings);
    applyFeatureFlags(settings);
    applyBranding(settings);
    applyLanguage(settings.portal_language || 'en');
    refreshSupportLinks(); // reseller's number into every call CTA
}

// ========================================
// PLAN FLAGS — show/hide emergency & offer UI from API
// ========================================
function applyPlanFlags(flags) {
    console.log('🚨 Plan flags applied:', flags);
}

// ========================================
// SETUP BRAND LINK - Preserve URL Parameters
// ========================================
function setupBrandLink() {
    const brandLink = document.getElementById('brandLink');
    if (!brandLink) return;
    
    brandLink.addEventListener('click', (e) => {
        e.preventDefault();
        
        // Reset to home section (plans section with maintenance banner if active)
        hideSection(paymentSection);
        hideSection(processingSection);
        hideSection(successSection);
        hideSection(errorSection);
        showSection(plansSection);
        
        resetForm();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    
    console.log('🔗 Brand link configured');
}

// ========================================
// UPDATE BRANDING - Apply business name from router lookup
// ========================================
function updateBranding() {
    if (!routerBusinessName) return;
    
    const logoEl = document.querySelector('.logo');
    if (logoEl) logoEl.textContent = routerBusinessName;

    const brandLink = document.getElementById('brandLink');
    if (brandLink) brandLink.classList.remove('brand-loading');
    
    document.title = `${routerBusinessName} - Get Connected`;
    
    console.log('🏢 Branding updated to:', routerBusinessName);
}

// ========================================
// PAYMENT METHODS — show/hide UI based on router config
// ========================================
function applyPaymentMethods(methods) {
    const hasMpesa   = methods.includes('mpesa');
    const hasVoucher = methods.includes('voucher');
    const hasShareCode = Boolean(planFlags && planFlags.sharing_enabled);
    // A saved access code from an earlier multi-device purchase keeps the box
    // visible so the customer can reuse it on this visit.
    const hasSavedCode = Boolean(loadSavedAccessCode());
    const showCodeSection = hasVoucher || hasShareCode || hasSavedCode;

    const voucherSection  = document.getElementById('voucherSection');
    const mpesaSection    = document.getElementById('mpesaSection');
    const mpesaQuickSteps = document.getElementById('mpesaQuickSteps');
    const paymentDivider  = document.getElementById('paymentDivider');

    // Voucher section
    if (voucherSection) {
        voucherSection.classList.toggle('hidden', !showCodeSection);
    }

    // M-Pesa plans + quick steps
    if (mpesaSection) {
        mpesaSection.classList.toggle('hidden', !hasMpesa);
    }
    if (mpesaQuickSteps) {
        mpesaQuickSteps.classList.toggle('hidden', !hasMpesa);
    }

    // "OR" divider only when both methods are active
    if (paymentDivider) {
        paymentDivider.classList.toggle('hidden', !(hasMpesa && showCodeSection));
    }

    console.log('💳 Payment methods applied:', methods, '| mpesa:', hasMpesa, '| voucher:', hasVoucher, '| share code:', hasShareCode, '| saved code:', hasSavedCode);
}

function normalizePaymentProvider(provider) {
    const normalized = String(provider || '').trim().toLowerCase();
    return ['fapshi', 'zenopay', 'mtn_momo'].includes(normalized) ? normalized : 'mpesa';
}

function getPaymentProviderLabel() {
    if (routerPaymentProvider === 'fapshi') return 'Mobile Money';
    if (routerPaymentProvider === 'mtn_momo') return 'MTN MoMo';
    if (routerPaymentProvider === 'zenopay') return 'Mobile Money';
    return 'M-Pesa';
}

function getPaymentCurrencyCode() {
    return routerPaymentProvider === 'fapshi' ? 'XAF' : 'KSH';
}

function setPaymentProvider(provider) {
    routerPaymentProvider = normalizePaymentProvider(provider || routerPaymentProvider);
    const isFapshi = routerPaymentProvider === 'fapshi';
    const label = getPaymentProviderLabel();
    const phoneInput = document.getElementById('phoneNumber');
    const prefix = document.getElementById('phoneInputPrefix');
    const hint = document.getElementById('phoneInputHint');
    const prompt = document.getElementById('paymentPromptText');
    const security = document.getElementById('paymentSecurityNote');
    const confirmation = document.getElementById('paymentConfirmationHint');
    const balance = document.getElementById('paymentBalanceHint');
    const payText = document.querySelector('#submitButton .button-text');
    const reconnectHint = document.getElementById('reconnectHint');
    const devicePhoneInput = document.getElementById('devicePhoneInput');
    const devicePrefix = document.querySelector('.device-phone-prefix');
    const deviceTitle = document.querySelector('#deviceStep3 .device-step-title');
    const devicePayText = document.getElementById('devicePayText');
    const deviceSecurity = document.querySelector('.device-security-note');
    const deviceProcessingSub = document.getElementById('deviceProcessingSub');

    if (phoneInput) {
        phoneInput.maxLength = isFapshi ? 14 : 10;
        phoneInput.placeholder = isFapshi ? '6XXXXXXXX or 2376XXXXXXXX' : '7XXXXXXXX or 07XXXXXXXX';
    }
    if (prefix) prefix.textContent = isFapshi ? '+237' : '+254';
    if (hint) hint.textContent = isFapshi ? 'E.g., 670000000 or 237670000000' : 'E.g., 0712345678 or 712345678';
    if (prompt) prompt.textContent = `You'll receive a ${label} prompt`;
    if (payText) payText.textContent = `Pay with ${label}`;
    if (security) security.innerHTML = `<span>🔒</span> Secure payment via ${label}`;
    if (confirmation) confirmation.textContent = `Confirmation can take up to a minute or two. Please do not pay again — you will be connected automatically as soon as ${label} confirms.`;
    if (balance) balance.textContent = `Check your ${label} balance`;
    if (reconnectHint) updateReconnectHint();
    if (devicePhoneInput) {
        devicePhoneInput.maxLength = isFapshi ? 14 : 10;
        devicePhoneInput.placeholder = isFapshi ? '6XXXXXXXX or 2376XXXXXXXX' : '7XXXXXXXX';
    }
    if (devicePrefix) devicePrefix.textContent = isFapshi ? '+237' : '+254';
    if (deviceTitle) deviceTitle.textContent = `Pay with ${label}`;
    if (devicePayText) devicePayText.textContent = `Pay with ${label}`;
    if (deviceSecurity) deviceSecurity.innerHTML = `<span>🔒</span> Secure payment via ${label}`;
    if (deviceProcessingSub) deviceProcessingSub.textContent = `Check your phone for the ${label} prompt and approve it.`;
}

// ========================================
// SUPPORT PHONE — single source of truth for every "call us" link
// ========================================
// The number belongs to the reseller who owns this router, so it is always
// resolved from the backend: portal_settings.portal_support_phone first
// (what the reseller typed in the admin portal), then the router record's
// support_phone. There is deliberately NO hardcoded fallback — if neither is
// set, support links are hidden rather than pointing at somebody else's phone.
function getSupportPhone() {
    const fromSettings = portalSettings && portalSettings.portal_support_phone;
    return String(fromSettings || routerSupportPhone || '').trim();
}

// Marks up every support CTA in the page from the resolved number.
// Elements opt in with [data-support-link] (the anchor itself) or
// [data-support-section] (a whole banner that only exists to trigger a call).
// Safe to call repeatedly — ads.js re-runs it after it toggles ad sections.
function refreshSupportLinks() {
    const phone = getSupportPhone();

    document.querySelectorAll('[data-support-link]').forEach(link => {
        if (phone) {
            link.href = `tel:${phone}`;
            link.removeAttribute('aria-hidden');
            if (link.style.display === 'none') link.style.display = '';
        } else {
            link.removeAttribute('href');
            link.style.display = 'none';
            link.setAttribute('aria-hidden', 'true');
        }
    });

    document.querySelectorAll('[data-support-section]').forEach(section => {
        // Sections can also be hidden by other rules (e.g. ads disabled) —
        // only take responsibility for the no-phone case.
        if (!phone) {
            section.style.display = 'none';
        } else if (section.dataset.hiddenByAds !== 'true' && section.style.display === 'none') {
            section.style.display = '';
        }
    });

    return phone;
}
// ads.js runs in its own file — expose the refresher so it can re-apply the
// number after re-showing ad banners.
window.refreshSupportLinks = refreshSupportLinks;

function updateSupportPhone(phone) {
    if (phone) routerSupportPhone = String(phone).trim();
    const resolved = refreshSupportLinks();
    console.log('📞 Support phone resolved to:', resolved || '(none — support links hidden)');
}

// ========================================
// COOKIE HELPERS (backup storage for desktop browsers)
// ========================================
function setCookie(name, value, days = 365) {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
}

function getCookie(name) {
    const cookies = document.cookie.split('; ');
    for (const cookie of cookies) {
        const [cookieName, cookieValue] = cookie.split('=');
        if (cookieName === name) {
            return decodeURIComponent(cookieValue);
        }
    }
    return null;
}

// ========================================
// SAVE PHONE NUMBER (localStorage + cookies)
// Works on desktop browsers. Mobile captive portals wipe this when closed.
// ========================================
function savePhoneNumber(phoneNumber) {
    if (!phoneNumber || phoneNumber.length < 9) return;
    
    // Save to localStorage
    try {
        localStorage.setItem('bitwave_phone_number', phoneNumber);
    } catch (e) {
        console.warn('⚠️ localStorage not available:', e);
    }
    
    // Also save to cookie as backup
    try {
        setCookie('bitwave_phone', phoneNumber, 365);
    } catch (e) {
        console.warn('⚠️ Cookie not available:', e);
    }
    
    console.log('💾 Phone number saved');
}

// ========================================
// LOAD SAVED PHONE NUMBER (for returning users)
// Works on desktop browsers. Mobile captive portals wipe storage when closed.
// ========================================
function loadSavedPhoneNumber() {
    let savedPhone = null;
    
    // Try localStorage first
    try {
        savedPhone = localStorage.getItem('bitwave_phone_number');
    } catch (e) {
        console.warn('⚠️ localStorage not available:', e);
    }
    
    // Fall back to cookies
    if (!savedPhone) {
        savedPhone = getCookie('bitwave_phone');
    }
    
    // Apply saved phone number to input
    if (savedPhone && phoneNumberInput) {
        phoneNumberInput.value = savedPhone;
        console.log('📱 Phone pre-filled for returning user');
    }
}

// ========================================
// LOAD PLANS - Fetches from API with cache + retry UI
// ========================================
function displayPlans(rawPlans) {
    console.log(`📋 Displaying ${rawPlans.length} plans from API`);
    // Free trials never join the paid list, but their presence is what tells
    // us this hotspot offers one — see loadFreeTrials().
    hotspotOffersFreeTrial = rawPlans.some(isFreeTrialPlan);
    const plans = transformPlansData(rawPlans);
    allPlans = plans;
    renderPlans(plans);
}

function showPlansError() {
    plansGrid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:2rem 1rem;">
            <div style="font-size:2rem;margin-bottom:.5rem;">📡</div>
            <p style="font-weight:600;margin:0 0 .25rem;">Couldn't load plans</p>
            <p style="opacity:.65;font-size:.85rem;margin:0 0 1rem;">Check your connection and try again</p>
            <button id="retryPlansBtn"
                style="padding:.6rem 1.5rem;border:none;border-radius:8px;
                       background:var(--primary,#2563eb);color:#fff;font-weight:600;
                       cursor:pointer;font-size:.9rem;">
                🔄 Retry
            </button>
        </div>
    `;
    document.getElementById('retryPlansBtn')
        .addEventListener('click', () => forceRefreshPlans());
}

async function fetchPlansFromAPI(rId) {
    const url = getPlansUrl(rId);
    console.log('📡 Fetching plans from:', url);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(getProxiedUrl(url), {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        mode: 'cors',
        signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
        throw new Error(`API ${response.status} ${response.statusText}`);
    }

    const apiPlans = await response.json();

    if (!Array.isArray(apiPlans) || apiPlans.length === 0) {
        throw new Error('Empty plans response');
    }

    // If the API returns a bestseller flag, use it
    const apiBestseller = apiPlans.find(p => p.is_bestseller);
    if (apiBestseller) {
        BESTSELLER_PLAN_ID = apiBestseller.id;
        console.log('🏷️ Bestseller ID from API:', BESTSELLER_PLAN_ID);
    }

    return apiPlans;
}

async function loadPlans(rId) {
    try {
        const freshPlans = await fetchPlansFromAPI(rId);
        displayPlans(freshPlans);
        console.log('✅ Plans loaded from API:', freshPlans.length);
    } catch (error) {
        console.warn('⚠️ API plan fetch failed:', error.message);
        reportPlansFailure('reload', error);
        showPlansError();
    }
}

async function forceRefreshPlans() {
    plansGrid.innerHTML = `
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
    `;
    return loadPlans(routerId);
}

// ========================================
// TRANSFORM API PLANS DATA
// ========================================
function transformPlansData(apiPlans) {
    const visiblePlans = apiPlans.filter(p => {
        if (p.is_hidden) return false;
        // Claimed through the "Try free" button, never bought: a KSH 0 card
        // would start an STK push the backend refuses.
        if (isFreeTrialPlan(p)) return false;
        if (p.connection_type && p.connection_type !== 'hotspot') return false;
        if (p.plan_type === 'emergency' && !planFlags.emergency_mode_active) return false;
        if (p.plan_type === 'special_offer' && !planFlags.has_special_offers) return false;
        return true;
    });

    const regularPlans = visiblePlans.filter(p => !p.plan_type || p.plan_type === 'regular');

    // Calculate best time-to-price ratio among regular plans only
    let bestRegularPlanId = null;
    if (regularPlans.length > 0) {
        const withRatio = regularPlans.map(p => ({
            id: p.id,
            ratio: convertToHours(p.duration_value, p.duration_unit) / p.price
        }));
        bestRegularPlanId = withRatio.reduce((best, cur) => cur.ratio > best.ratio ? cur : best).id;
    }

    const transformedPlans = visiblePlans.map((plan) => {
        const duration = formatDuration(plan.duration_value, plan.duration_unit);
        const currency = getPaymentCurrencyCode();
        const price = `${currency} ${plan.price}${currency === 'KSH' ? '/-' : ''}`;
        const speed = formatSpeed(plan.speed);

        const isEmergency = plan.plan_type === 'emergency';
        const isSpecialOffer = plan.plan_type === 'special_offer';
        const isRegular = !isEmergency && !isSpecialOffer;

        const bestseller = isRegular && plan.id === BESTSELLER_PLAN_ID;
        const popular = isRegular && plan.id === bestRegularPlanId && !bestseller;

        let valueMessage = '';
        if (isSpecialOffer && plan.original_price) {
            const pct = Math.round((1 - plan.price / plan.original_price) * 100);
            valueMessage = `Save ${pct}%`;
        } else if (bestseller) {
            valueMessage = '🔥 Bestseller';
        } else if (popular) {
            const hours = convertToHours(plan.duration_value, plan.duration_unit);
            const pricePerDay = (plan.price / (hours / 24)).toFixed(0);
            valueMessage = `Only ${currency} ${pricePerDay}/day`;
        }

        return {
            id: plan.id,
            // The package name exactly as the reseller typed it in the admin
            // panel. Resellers advertise packages by name off-portal ("ask for
            // Bingwa Night"), so the card has to carry that name verbatim —
            // never re-worded, never shortened. Empty only for older plans.
            name: typeof plan.name === 'string' ? plan.name.trim() : '',
            duration: duration,
            price: price,
            speed: speed,
            popular: popular,
            bestseller: bestseller,
            valueMessage: valueMessage,
            planType: plan.plan_type || 'regular',
            badgeText: plan.badge_text || null,
            originalPrice: plan.original_price || null,
            validUntil: plan.valid_until || null,
            maxDevices: Math.max(1, parseInt(plan.max_shared_users, 10) || 1),
            originalData: plan
        };
    });

    // Sort: special offers and emergency plans always lead — they are rendered
    // under their own notice card. Everything after that is the reseller's
    // choice (portal_settings.plan_sort_order).
    const typeOrder = { special_offer: 0, emergency: 1 };
    const sortOrder = getPlanSortOrder();
    transformedPlans.sort((a, b) => {
        const ta = typeOrder[a.planType] ?? 2;
        const tb = typeOrder[b.planType] ?? 2;
        if (ta !== tb) return ta - tb;
        if (sortOrder === 'default') {
            // Legacy merchandised order: pin what we want people to buy, then
            // most expensive first.
            if (a.bestseller && !b.bestseller) return -1;
            if (!a.bestseller && b.bestseller) return 1;
            if (a.popular && !b.popular) return -1;
            if (!a.popular && b.popular) return 1;
            return b.originalData.price - a.originalData.price;
        }
        return comparePlansBy(sortOrder, a.originalData, b.originalData);
    });

    return transformedPlans;
}

// ========================================
// PLAN SORT ORDER — reseller-configurable
// ========================================
// portal_settings.plan_sort_order decides how packages are listed. 'default' is
// the merchandised order this portal has always used (bestseller/popular pinned,
// then price high→low) and stays the fallback, so a reseller who never touches
// the setting sees no change. The backend sorts the payload the same way; this
// runs anyway because the client re-sorts after its own filtering, and because a
// cached script.js must not undo the reseller's choice.
const PLAN_SORT_ORDERS = ['default', 'price_asc', 'price_desc', 'duration_asc', 'duration_desc'];

function getPlanSortOrder() {
    const raw = portalSettings && portalSettings.plan_sort_order;
    const order = String(raw || 'default').toLowerCase();
    return PLAN_SORT_ORDERS.includes(order) ? order : 'default';
}

function comparePlansBy(sortOrder, a, b) {
    let diff;
    switch (sortOrder) {
        case 'price_asc':
            diff = a.price - b.price;
            break;
        case 'price_desc':
            diff = b.price - a.price;
            break;
        case 'duration_asc':
            diff = convertToHours(a.duration_value, a.duration_unit)
                 - convertToHours(b.duration_value, b.duration_unit);
            break;
        case 'duration_desc':
            diff = convertToHours(b.duration_value, b.duration_unit)
                 - convertToHours(a.duration_value, a.duration_unit);
            break;
        default:
            diff = 0;
    }
    // Break ties on id, ascending in both directions, so two packages at the
    // same price never swap places between page loads.
    return diff !== 0 ? diff : a.id - b.id;
}

// ========================================
// CONVERT DURATION TO HOURS
// ========================================
function convertToHours(value, unit) {
    const conversionMap = {
        'MINUTES': 1 / 60,      // 1 minute = 1/60 hours
        'HOURS': 1,             // 1 hour = 1 hour
        'DAYS': 24,             // 1 day = 24 hours
        'WEEKS': 24 * 7,        // 1 week = 168 hours
        'MONTHS': 24 * 30       // 1 month ≈ 720 hours (30 days)
    };
    
    const multiplier = conversionMap[unit.toUpperCase()] || 1;
    return value * multiplier;
}

// ========================================
// FORMAT DURATION TEXT
// ========================================
function formatDuration(value, unit) {
    // Convert unit to readable format
    const unitMap = {
        'MINUTES': value === 1 ? 'Minute' : 'Minutes',
        'HOURS': value === 1 ? 'Hour' : 'Hours',
        'DAYS': value === 1 ? 'Day' : 'Days',
        'WEEKS': value === 1 ? 'Week' : 'Weeks',
        'MONTHS': value === 1 ? 'Month' : 'Months'
    };
    
    const unitText = unitMap[unit] || unit.toLowerCase();
    return `${value} ${unitText}`;
}

// ========================================
// FORMAT SPEED TEXT
// ========================================
function formatSpeed(speed) {
    if (!speed || speed === 'Unlimited' || speed.toLowerCase() === 'unlimited') {
        return 'Unlimited';
    }
    
    // Handle various formats:
    // "1M/2M" -> "1Mbps"
    // "2M/4M" -> "2Mbps"
    // "512k/1M" -> "512Kbps"
    // "10M" -> "10Mbps"
    
    // Extract download speed (first part before /)
    const downloadSpeed = speed.split('/')[0].trim();
    
    // If already has "Mbps" or "Kbps", return as is
    if (downloadSpeed.match(/mbps|kbps/i)) {
        return downloadSpeed;
    }
    
    // Convert "M" to "Mbps" and "k" or "K" to "Kbps"
    if (downloadSpeed.match(/^\d+(\.\d+)?[mM]$/)) {
        return downloadSpeed.replace(/[mM]$/, 'Mbps');
    }
    
    if (downloadSpeed.match(/^\d+(\.\d+)?[kK]$/)) {
        return downloadSpeed.replace(/[kK]$/, 'Kbps');
    }
    
    // If just a number, assume Mbps
    if (downloadSpeed.match(/^\d+(\.\d+)?$/)) {
        return `${downloadSpeed}Mbps`;
    }
    
    // Fallback: return original
    return downloadSpeed;
}

// ========================================
// RENDER PLANS
// ========================================
function renderPlans(plans) {
    plansGrid.innerHTML = '';

    // Above 640px the grid widens to three columns, which inside the portal's
    // 480px shell leaves each card about 130px across — fine for "1 Day", far
    // too narrow for a package name, which would wrap into a tall ragged
    // column. Resellers who name their packages stay two-up at every width;
    // resellers who don't keep exactly the layout they have today.
    plansGrid.classList.toggle('has-names', plans.some(p => planNameLine(p)));

    if (window.featuredPlanIds && window.featuredPlanIds.length) {
        plans = applyFeaturedOrder(plans, window.featuredPlanIds);
    }

    const specialPlans = plans.filter(p => p.planType === 'special_offer' || p.planType === 'emergency');
    const regularPlans = plans.filter(p => p.planType !== 'special_offer' && p.planType !== 'emergency');

    if (specialPlans.length > 0) {
        // Build an inline message card that sits inside the grid, above the special plan cards
        const msgCard = document.createElement('div');
        msgCard.className = 'plans-notice-card';

        if (planFlags.emergency_mode_active) {
            msgCard.classList.add('emergency');
            const msg = planFlags.emergency_message || 'We\'re sorry for the disruption. Enjoy these deals on us!';
            msgCard.innerHTML = `
                <span class="plans-notice-icon">⚠️</span>
                <div class="plans-notice-body">
                    <div class="plans-notice-title">Service Notice</div>
                    <p class="plans-notice-msg">${msg}</p>
                </div>
            `;
        } else {
            msgCard.innerHTML = `
                <span class="plans-notice-icon">🔥</span>
                <div class="plans-notice-body">
                    <div class="plans-notice-title">Limited-Time Offers</div>
                    <p class="plans-notice-msg">Grab these deals before they're gone!</p>
                </div>
            `;
        }
        plansGrid.appendChild(msgCard);

        specialPlans.forEach(plan => plansGrid.appendChild(createPlanCard(plan)));

        if (regularPlans.length > 0) {
            const divider = document.createElement('div');
            divider.className = 'plans-group-divider';
            divider.innerHTML = '<span>All Plans</span>';
            plansGrid.appendChild(divider);
        }
    }

    regularPlans.forEach(plan => plansGrid.appendChild(createPlanCard(plan)));

    startPlanCountdowns();
}

// ========================================
// COUNTDOWN TIMERS for valid_until plans
// ========================================
let countdownInterval = null;

function startPlanCountdowns() {
    if (countdownInterval) clearInterval(countdownInterval);

    const countdownEls = document.querySelectorAll('.plan-countdown[data-expires]');
    if (countdownEls.length === 0) return;

    function tick() {
        countdownEls.forEach(el => {
            const expires = new Date(el.dataset.expires);
            const now = new Date();
            const diff = expires - now;

            if (diff <= 0) {
                el.textContent = 'Expired';
                el.classList.add('expired');
                return;
            }

            const days = Math.floor(diff / 86400000);
            const hours = Math.floor((diff % 86400000) / 3600000);
            const mins = Math.floor((diff % 3600000) / 60000);

            if (days > 0) {
                el.textContent = `⏳ ${days}d ${hours}h left`;
            } else if (hours > 0) {
                el.textContent = `⏳ ${hours}h ${mins}m left`;
            } else {
                el.textContent = `⏳ ${mins}m left`;
                el.classList.add('urgent');
            }
        });
    }

    tick();
    countdownInterval = setInterval(tick, 60000);
}

// ========================================
// CREATE PLAN CARD - Simplified Design
// ========================================
// The package name as the reseller typed it, or '' when there is nothing worth
// printing. The one name we drop is one that merely repeats the duration line
// ("24 Hours"), which would otherwise print the same words twice on one card.
// Everything else goes through untouched — no shortening, no title-casing.
function planNameLine(plan) {
    const name = plan && typeof plan.name === 'string' ? plan.name.trim() : '';
    if (!name) return '';
    if (normalizeText(name) === normalizeText(plan.duration)) return '';
    return name;
}

function normalizeText(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// A name the reseller already wrote the duration into ("Siku Nzima 1 Day")
// doesn't need the duration printed under it as well. Dropping that line buys
// back a whole row of height on exactly the cards that are tightest.
function planDurationIsRedundant(plan) {
    const name = planNameLine(plan);
    if (!name) return false;
    return normalizeText(name).includes(normalizeText(plan.duration));
}

// Fit the type to the name instead of letting the name dictate the card's
// height. A phone card is ~160px wide, which is roughly 14 characters per line
// at the base size — so a 40-character name set at the base size is three
// ragged lines and a card half again as tall as its neighbours. Stepping the
// size down keeps the card's proportions while still printing every character.
// Below the smallest step the name is a data problem, not a layout problem:
// see the admin-side guardrail in the handover notes.
function planNameSizeClass(name) {
    const len = name.length;
    if (len <= 16) return '';
    if (len <= 28) return ' plan-name--sm';
    if (len <= 44) return ' plan-name--xs';
    return ' plan-name--xxs';
}

function createPlanCard(plan) {
    const card = document.createElement('div');

    let cardClass = 'plan-card';
    if (plan.planType === 'emergency') cardClass += ' emergency';
    else if (plan.planType === 'special_offer') cardClass += ' special-offer';
    else if (plan.bestseller) cardClass += ' bestseller';
    else if (plan.popular) cardClass += ' popular';
    card.className = cardClass;

    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    const devicesLabel = plan.maxDevices > 1 ? `, up to ${plan.maxDevices} devices` : '';
    const planName = planNameLine(plan);
    const spokenName = planName ? `${planName}, ` : '';
    card.setAttribute('aria-label', `Select ${spokenName}${plan.duration} plan for ${plan.price}, ${plan.speed}${devicesLabel}`);

    const formattedPrice = formatPrice(plan.price);

    // Package name headline. Escaped because the text is reseller input.
    const nameHtml = planName
        ? `<div class="plan-name${planNameSizeClass(planName)}">${escapeHtml(planName)}</div>`
        : '';

    const durationHtml = planDurationIsRedundant(plan)
        ? ''
        : `<div class="plan-duration${planName ? ' has-name' : ''}">${plan.duration}</div>`;

    // Badge ribbon (emergency / special offer / bestseller / best value handled by CSS ::after)
    let badgeHtml = '';
    if (plan.badgeText) {
        badgeHtml = `<span class="plan-badge-text">${plan.badgeText}</span>`;
    }

    // Original price strikethrough for discounted plans
    let originalPriceHtml = '';
    if (plan.originalPrice) {
        const currency = getPaymentCurrencyCode();
        originalPriceHtml = `<div class="plan-original-price">${currency} ${plan.originalPrice}${currency === 'KSH' ? '/-' : ''}</div>`;
    }

    // Countdown for time-limited offers
    let countdownHtml = '';
    if (plan.validUntil) {
        countdownHtml = `<div class="plan-countdown" data-expires="${plan.validUntil}"></div>`;
    }

    const speedHtml = (portalSettings.show_plan_speed !== false && plan.speed)
        ? `<div class="plan-speed">${plan.speed}</div>`
        : '';

    // Device allowance. Only shown when the plan actually covers more than one
    // device — printing "1 device" on every plan of a reseller who never turned
    // sharing on reads as a new restriction rather than as information.
    const devicesHtml = plan.maxDevices > 1
        ? `<div class="plan-devices">${devicesSvgHtml()}<span>Up to ${plan.maxDevices} devices</span></div>`
        : '';

    card.innerHTML = `
        ${badgeHtml}
        ${nameHtml}
        ${durationHtml}
        ${originalPriceHtml}
        <div class="plan-price">${formattedPrice}</div>
        ${speedHtml}
        ${devicesHtml}
        ${plan.valueMessage ? `<div class="plan-value-msg">${plan.valueMessage}</div>` : ''}
        ${countdownHtml}
    `;

    card.addEventListener('click', () => selectPlan(plan));
    card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectPlan(plan);
        }
    });

    return card;
}

// ========================================
// FORMAT PRICE - Make currency code smaller
// ========================================
function formatPrice(price) {
    // Split the provider-specific currency code from the amount.
    const match = price.match(/^(KSH|XAF)\s*(.+)$/);
    if (match) {
        return `<span class="currency-code">${match[1]}</span> ${match[2]}`;
    }
    return price;
}

// ========================================
// SELECT PLAN
// ========================================
function selectPlan(plan) {
    selectedPlan = plan;
    
    // Update selected plan display. The buyer is about to be charged, so the
    // package name they were sold on has to be the thing they can read back.
    const selectedName = planNameLine(plan);
    selectedPlanInfo.innerHTML = `
        <div class="selected-plan-name">${selectedName ? escapeHtml(selectedName) : plan.duration}</div>
        ${selectedName ? `<div class="selected-plan-duration">${plan.duration}</div>` : ''}
        <div class="selected-plan-price">${formatPrice(plan.price)}</div>
        ${portalSettings.show_plan_speed !== false && plan.speed ? `<div class="selected-plan-speed">${plan.speed}</div>` : ''}
        ${plan.maxDevices > 1 ? `<div class="selected-plan-devices">${devicesSvgHtml()}<span>Up to ${plan.maxDevices} devices</span></div>` : ''}
    `;
    
    // Show payment section, hide plans
    showSection(paymentSection);
    hideSection(plansSection);
    
    // Scroll to top smoothly. The phone field is left unfocused on purpose:
    // auto-focus pops the keyboard over the selected plan before the
    // customer has read it, so they tap the field when they're ready.
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ========================================
// ACCESS CODE: SHARED HELPERS
// One purchase = one code that works on every device the plan covers.
// The customer types the same code everywhere: a voucher (8 digits or legacy
// XXXX-XXXX), the 6-char access code shown after payment (ABC-DEF), or their
// M-Pesa receipt. The backend decides which kind it is.
// ========================================

// The device MAC comes from the MikroTik redirect. Without it the backend
// cannot authorise anything, so we never invent one.
function getClientMac() {
    return String(mikrotikParams.mac || '').trim();
}

function normalizeAccessCode(value) {
    return String(value || '').trim().replace(/\s+/g, '').toUpperCase();
}

// Loose shape check only — anything 6-20 alphanumerics (dashes allowed) is
// sent to the backend, which is the source of truth.
function looksLikeAccessCode(value) {
    const cleaned = normalizeAccessCode(value);
    const alnum = cleaned.replace(/-/g, '');
    return /^[A-Z0-9-]+$/.test(cleaned) && alnum.length >= 6 && alnum.length <= 20;
}

// Best-effort label so the device list reads "iPhone" rather than a bare MAC.
function guessClientDevice() {
    const ua = navigator.userAgent || '';
    if (/iPad/i.test(ua)) return { device_name: 'iPad', device_type: 'other' };
    if (/iPhone/i.test(ua)) return { device_name: 'iPhone', device_type: 'other' };
    if (/Android/i.test(ua)) {
        return /Mobile/i.test(ua)
            ? { device_name: 'Android phone', device_type: 'other' }
            : { device_name: 'Android tablet', device_type: 'other' };
    }
    if (/Windows/i.test(ua)) return { device_name: 'Windows laptop', device_type: 'laptop' };
    if (/Macintosh|Mac OS X/i.test(ua)) return { device_name: 'Mac', device_type: 'laptop' };
    if (/CrOS/i.test(ua)) return { device_name: 'Chromebook', device_type: 'laptop' };
    if (/Linux/i.test(ua)) return { device_name: 'Linux computer', device_type: 'laptop' };
    return { device_name: 'Device', device_type: 'other' };
}

// FastAPI errors: detail is a string, an object (device_limit_reached) or a
// validation array. Turn any of them into an Error carrying status + detail.
function buildApiError(response, data, fallbackMessage) {
    const detail = data ? data.detail : undefined;
    let message = fallbackMessage;
    if (typeof detail === 'string' && detail) {
        message = detail;
    } else if (detail && typeof detail === 'object' && !Array.isArray(detail) && detail.message) {
        message = detail.message;
    } else if (Array.isArray(detail) && detail.length) {
        message = detail.map(d => (d && d.msg) || '').filter(Boolean).join('; ') || fallbackMessage;
    } else if (data && data.message) {
        message = data.message;
    }
    const err = new Error(message);
    err.status = response.status;
    err.detail = detail;
    return err;
}

function isDeviceLimitError(err) {
    return Boolean(err && err.status === 409 && err.detail && typeof err.detail === 'object'
        && err.detail.error === 'device_limit_reached');
}

async function postPublicJson(endpoint, body, timeoutMs, fallbackMessage) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
        response = await fetch(getProxiedUrl(endpoint), {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            mode: 'cors',
            body: JSON.stringify(body),
            signal: controller.signal
        });
    } finally {
        clearTimeout(timeoutId);
    }

    let data = null;
    try { data = await response.json(); } catch (e) { data = null; }

    if (!response.ok) {
        throw buildApiError(response, data, fallbackMessage);
    }
    return data || {};
}

// Customer-facing wording for the redeem/reconnect error codes.
function friendlyAccessCodeError(err) {
    if (!err) return 'Something went wrong. Please try again.';
    if (err.name === 'AbortError') return 'The request timed out. Please check your connection and try again.';
    if (err.status === 404) return tr('codeNotFound');
    if (err.status === 410) return tr('codeExpired');
    if (err.status === 429) return tr('codeTooMany');
    return err.message || 'Something went wrong. Please try again.';
}

// ---- Saved access code (post-payment) ----
function loadSavedAccessCode() {
    try {
        const raw = localStorage.getItem(ACCESS_CODE_STORAGE_KEY);
        if (!raw) return null;
        let saved;
        try { saved = JSON.parse(raw); } catch (e) { saved = { code: raw }; }
        if (typeof saved === 'string') saved = { code: saved };
        if (!saved || !saved.code) return null;
        // A code only works on the network it was bought on.
        if (saved.router && mikrotikParams.router && saved.router !== mikrotikParams.router) return null;
        if (saved.expires_at && new Date(saved.expires_at).getTime() < Date.now()) {
            localStorage.removeItem(ACCESS_CODE_STORAGE_KEY);
            return null;
        }
        return saved;
    } catch (e) {
        return null;
    }
}

function saveAccessCode(code, maxDevices, expiresAt) {
    try {
        localStorage.setItem(ACCESS_CODE_STORAGE_KEY, JSON.stringify({
            code: code,
            max_devices: maxDevices || null,
            expires_at: expiresAt || null,
            router: mikrotikParams.router || '',
            saved_at: new Date().toISOString()
        }));
        console.log('💾 [ACCESS CODE] Saved for later visits');
    } catch (e) {
        console.warn('⚠️ [ACCESS CODE] Could not save to localStorage:', e);
    }
}

async function copyTextToClipboard(text) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch (e) { /* fall through to the legacy path */ }
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        ta.style.fontSize = '16px'; // under 16px, iOS zooms the page on select
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
    } catch (e) {
        return false;
    }
}

// ========================================
// ACCESS CODE: API CALLS
// POST /api/public/access-code/redeem
// POST /api/public/access-code/disconnect
// ========================================
async function redeemAccessCode(code, macAddress, rId) {
    const requestBody = {
        code: normalizeAccessCode(code),
        router_id: rId,
        mac_address: macAddress,
        ...guessClientDevice()
    };
    console.log('🎟️ [ACCESS CODE] Redeem request:', requestBody);
    const data = await postPublicJson(ACCESS_CODE_REDEEM_ENDPOINT, requestBody, 30000, 'Could not use this code');
    console.log('✅ [ACCESS CODE] Redeem result:', data);
    return data;
}

async function disconnectAccessCodeDevice(code, device) {
    const requestBody = {
        code: normalizeAccessCode(code),
        router_id: routerId || FALLBACK_ROUTER_ID
    };
    if (device.is_main_device || device.pairing_id == null) {
        requestBody.main_device = true;
    } else {
        requestBody.pairing_id = device.pairing_id;
    }
    const mac = getClientMac();
    if (mac) requestBody.mac_address = mac;

    console.log('🔌 [ACCESS CODE] Disconnect request:', requestBody);
    const data = await postPublicJson(ACCESS_CODE_DISCONNECT_ENDPOINT, requestBody, 20000, 'Could not remove the device');
    console.log('✅ [ACCESS CODE] Disconnect result:', data);
    return data;
}

// ========================================
// DEVICE LIMIT PANEL
// Shown on 409 device_limit_reached (redeem or reconnect). Lists the devices
// on the plan; removing one retries the original request for this device.
// device_name is user-controlled — every string goes in via textContent.
// ========================================
let pendingDeviceLimitRetry = null; // { code, retry } — remembered for "Remove" → retry

function confirmDeviceRemoval(deviceLabel) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'device-confirm-overlay';

        const box = document.createElement('div');
        box.className = 'device-confirm-box';

        const title = document.createElement('div');
        title.className = 'device-confirm-title';
        title.textContent = tr('limitConfirmTitle');

        const msg = document.createElement('p');
        msg.className = 'device-confirm-msg';
        msg.textContent = tr('limitConfirmMsg', { name: deviceLabel });

        const actions = document.createElement('div');
        actions.className = 'device-confirm-actions';
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'device-confirm-cancel';
        cancelBtn.textContent = tr('limitCancel');
        const okBtn = document.createElement('button');
        okBtn.type = 'button';
        okBtn.className = 'device-confirm-ok';
        okBtn.textContent = tr('limitRemove');
        actions.append(cancelBtn, okBtn);

        box.append(title, msg, actions);
        overlay.appendChild(box);

        const close = (value) => { overlay.remove(); resolve(value); };
        cancelBtn.addEventListener('click', () => close(false));
        okBtn.addEventListener('click', () => close(true));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });

        document.body.appendChild(overlay);
    });
}

function deviceDisplayName(device) {
    const name = String(device.device_name || '').trim();
    if (name) return name;
    return device.is_main_device ? tr('mainDevice') : tr('deviceLabel');
}

// container: #voucherResult or #reconnectResult
// options.code: the code to disconnect with (null when the request used a phone)
// options.retry: async () => void — re-runs the original request for this device
function renderDeviceLimitPanel(container, detail, options) {
    if (!container) return;
    const code = options && options.code ? options.code : null;
    pendingDeviceLimitRetry = code ? { code, retry: options.retry } : null;

    const devices = Array.isArray(detail.devices) ? detail.devices : [];
    const maxDevices = detail.max_devices || devices.length;
    console.log('🚧 [ACCESS CODE] Device limit reached:', maxDevices, 'devices', devices);

    container.textContent = '';

    const header = document.createElement('div');
    header.className = 'voucher-result-error';
    const icon = document.createElement('span');
    icon.className = 'voucher-error-icon';
    icon.textContent = '!';
    const text = document.createElement('span');
    text.className = 'voucher-error-text';
    const strong = document.createElement('strong');
    strong.textContent = tr('limitTitle');
    text.append(strong, document.createElement('br'),
        document.createTextNode(tr('limitSub', { n: maxDevices })));
    header.append(icon, text);
    container.appendChild(header);

    if (!code) {
        const note = document.createElement('p');
        note.className = 'reconnect-hint';
        note.textContent = tr('limitNoCode');
        container.appendChild(note);
    }

    devices.forEach(device => {
        const label = deviceDisplayName(device);

        const card = document.createElement('div');
        card.className = 'device-my-card';
        card.style.marginTop = '10px';

        const cardHeader = document.createElement('div');
        cardHeader.className = 'device-my-card-header';
        const cardIcon = document.createElement('span');
        cardIcon.className = 'device-my-card-icon';
        cardIcon.textContent = device.is_main_device ? '⭐' : '📱';
        const cardName = document.createElement('span');
        cardName.className = 'device-my-card-name';
        cardName.textContent = device.is_main_device && device.device_name
            ? `${label} (${tr('mainDevice')})`
            : label;
        cardHeader.append(cardIcon, cardName);
        if (device.is_this_device) {
            const badge = document.createElement('span');
            badge.className = 'device-my-card-status active';
            badge.textContent = tr('thisDevice');
            cardHeader.appendChild(badge);
        }
        card.appendChild(cardHeader);

        const macRow = document.createElement('div');
        macRow.className = 'device-my-card-detail';
        const macLabel = document.createElement('span');
        macLabel.textContent = 'MAC';
        const macValue = document.createElement('span');
        macValue.textContent = device.device_mac || '—';
        macRow.append(macLabel, macValue);
        card.appendChild(macRow);

        if (code && !device.is_this_device) {
            const actions = document.createElement('div');
            actions.className = 'device-my-card-actions';
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'device-my-action-btn danger';
            removeBtn.textContent = `🗑 ${tr('limitRemove')}`;
            removeBtn.addEventListener('click', () => handleDeviceLimitRemove(removeBtn, device, label));
            actions.appendChild(removeBtn);
            card.appendChild(actions);
        }

        container.appendChild(card);
    });

    container.classList.remove('hidden');
}

async function handleDeviceLimitRemove(btn, device, label) {
    const pending = pendingDeviceLimitRetry;
    if (!pending) return;

    const confirmed = await confirmDeviceRemoval(label);
    if (!confirmed) return;

    btn.disabled = true;
    btn.textContent = `⏳ ${tr('limitRemoving')}`;

    try {
        await disconnectAccessCodeDevice(pending.code, device);
    } catch (err) {
        console.error('❌ [ACCESS CODE] Disconnect failed:', err.message);
        btn.disabled = false;
        btn.textContent = `🗑 ${tr('limitRemove')}`;
        alert(friendlyAccessCodeError(err));
        return;
    }

    // Slot freed — connect this device with the same code.
    console.log('🔁 [ACCESS CODE] Device removed, retrying for this device');
    pendingDeviceLimitRetry = null;
    await pending.retry();
}

// ========================================
// VOUCHER / ACCESS CODE BOX: UI SETUP & HANDLERS
// Every code goes straight to /public/access-code/redeem. There is no verify
// preview any more: /voucher/verify reports an already-redeemed voucher as
// "used", which is exactly the code customers now type on their 2nd device.
// ========================================
function setupVoucherUI() {
    const input = document.getElementById('voucherCodeInput');
    const verifyBtn = document.getElementById('voucherVerifyBtn');
    const result = document.getElementById('voucherResult');

    if (!input || !verifyBtn) return;

    // Prefill the access code saved after an earlier multi-device purchase.
    const saved = loadSavedAccessCode();
    if (saved && !input.value) {
        input.value = saved.code;
        console.log('🎟️ [ACCESS CODE] Prefilled saved code');
    }

    // Auto-format: allow alphanumeric and dashes
    input.addEventListener('input', () => {
        input.value = input.value.replace(/[^a-zA-Z0-9\-]/g, '');
        if (result) result.classList.add('hidden');
        pendingDeviceLimitRetry = null;
    });

    // Enter key triggers connect
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            verifyBtn.click();
        }
    });

    verifyBtn.addEventListener('click', () => {
        const code = normalizeAccessCode(input.value);
        if (!code) {
            input.focus();
            return;
        }
        if (!looksLikeAccessCode(code)) {
            showVoucherError(tr('codeNotFound'));
            return;
        }
        submitAccessCode(code);
    });
}

function setVoucherLoading(isLoading) {
    const verifyBtn = document.getElementById('voucherVerifyBtn');
    const verifyText = verifyBtn?.querySelector('.voucher-verify-text');
    const verifyLoader = document.getElementById('voucherVerifyLoader');
    if (verifyBtn) verifyBtn.disabled = isLoading;
    if (verifyText) verifyText.classList.toggle('hidden', isLoading);
    if (verifyLoader) verifyLoader.classList.toggle('hidden', !isLoading);
}

async function submitAccessCode(code) {
    const result = document.getElementById('voucherResult');
    const macAddress = getClientMac();
    if (!macAddress) {
        console.warn('⚠️ [ACCESS CODE] No client MAC — not sending a request');
        showVoucherError(tr('noMac'));
        return;
    }

    setVoucherLoading(true);
    if (result) result.classList.add('hidden');

    try {
        const rId = routerId || FALLBACK_ROUTER_ID;
        const data = await redeemAccessCode(code, macAddress, rId);
        handleRedeemSuccess(data, macAddress);
    } catch (err) {
        if (isDeviceLimitError(err)) {
            renderDeviceLimitPanel(result, err.detail, {
                code,
                retry: () => submitAccessCode(code)
            });
        } else {
            console.error('❌ [ACCESS CODE] Redeem failed:', err.message);
            showVoucherError(friendlyAccessCodeError(err));
        }
    } finally {
        setVoucherLoading(false);
    }
}

// Access granted without a payment to wait on: a redeemed voucher / access
// code, or a claimed free trial. Both endpoints return the same shape, so both
// land here: RADIUS auto-login when credentials come back, otherwise the
// "You're Online!" screen and the auto "Start Browsing".
// source.method / source.headline / source.planName label the success screen
// for callers other than the code box.
function handleRedeemSuccess(data, macAddress, source = {}) {
    console.log('✅ [ACCESS CODE] Outcome:', data.outcome);
    const expiry = data.expires_at || data.expiry;

    // RADIUS auto-login if credentials returned
    if (data.radius_username && data.radius_password) {
        const loginUrl = buildRadiusLoginUrl(mikrotikParams.gw, data.radius_username, data.radius_password, mikrotikParams.dst);
        if (loginUrl) {
            try {
                localStorage.setItem('bitwave_last_radius_login', JSON.stringify({
                    loginUrl, username: data.radius_username,
                    password: data.radius_password, gateway: mikrotikParams.gw,
                    dst: mikrotikParams.dst, mac: macAddress,
                    planName: data.plan_name || source.planName || 'Voucher Plan',
                    expiry: expiry,
                    savedAt: new Date().toISOString()
                }));
            } catch (e) { /* ignore */ }

            hideSection(plansSection);
            showSection(successSection);
            showVoucherSuccessDetails(data, source);
            window.scrollTo({ top: 0, behavior: 'smooth' });

            setTimeout(() => { window.location.href = loginUrl; }, 2000);
            return;
        }
    }

    // Non-RADIUS success: show success screen
    hideSection(plansSection);
    showSection(successSection);
    showVoucherSuccessDetails(data, source);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    scheduleAutoStartBrowsing();
}

function showVoucherError(message) {
    renderResultError(document.getElementById('voucherResult'), message);
}

// Red "✕ message" row used under the code box and the free-trial buttons.
// The message is backend text, so it goes in via textContent.
function renderResultError(result, message) {
    if (!result) return;

    result.innerHTML = `
        <div class="voucher-result-error">
            <span class="voucher-error-icon">✕</span>
            <span class="voucher-error-text"></span>
        </div>
    `;
    result.querySelector('.voucher-error-text').textContent = message;

    result.classList.remove('hidden');
}

// Headline for a redeem/reconnect outcome, or '' when the backend sent none.
function accessCodeOutcomeMessage(data) {
    if (data.outcome === 'device_added') return tr('codeDeviceAdded');
    if (data.outcome === 'main_device') return tr('codeMainDevice');
    if (data.outcome === 'plan_started') return tr('codePlanStarted');
    return '';
}

function accessCodeShareHint(data) {
    const maxDevices = Number(data.max_devices) || 0;
    if (data.outcome === 'plan_started' && data.sharing_enabled && maxDevices > 1) {
        return tr('codeShareHint', { n: maxDevices });
    }
    return '';
}

function showVoucherSuccessDetails(data, source = {}) {
    const connectionDetails = document.getElementById('connectionDetails');
    if (!connectionDetails) return;

    const expiry = data.expires_at || data.expiry;
    const expiryDate = expiry ? new Date(expiry) : null;
    const expiryText = expiryDate ? expiryDate.toLocaleDateString('en-KE', {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi'
    }) : 'N/A';

    const outcomeMessage = accessCodeOutcomeMessage(data) || source.headline || '';
    const subtext = document.querySelector('#successSection .success-subtext');
    if (subtext && outcomeMessage) subtext.textContent = outcomeMessage;

    const method = data.outcome === 'device_added' ? 'Shared plan'
        : (source.method || data.redemption_method || 'Voucher / access code');

    let html = `
        <div class="detail-row">
            <span class="detail-label">Plan</span>
            <span class="detail-value">${escapeHtml(data.plan_name || 'Internet Plan')}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Method</span>
            <span class="detail-value">${escapeHtml(method)}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Valid Until</span>
            <span class="detail-value">${escapeHtml(expiryText)}</span>
        </div>
    `;

    const shareHint = accessCodeShareHint(data);
    if (shareHint) {
        html += `
        <div class="detail-row" style="margin-top: 14px; padding: 12px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 8px; color: #fff;">
            <div style="width:100%;">
                <div style="font-weight: 600;">📱 ${escapeHtml(shareHint)}</div>
                ${data.access_code ? `<div style="font-size: 13px; opacity: 0.9; margin-top: 4px;">Code: <strong>${escapeHtml(data.access_code)}</strong></div>` : ''}
            </div>
        </div>`;
    }

    if (data.radius_username && data.radius_password) {
        const loginUrl = buildRadiusLoginUrl(mikrotikParams.gw, data.radius_username, data.radius_password, mikrotikParams.dst);
        html += `
        <div class="detail-row" style="margin-top: 14px; padding: 12px; background: #111827; border-radius: 8px; color: #fff;">
            <div style="width:100%;">
                <div style="font-weight: 600; margin-bottom: 6px;">Login Credentials</div>
                <div style="font-size: 13px; opacity: 0.85;">Username: <strong>${escapeHtml(data.radius_username)}</strong></div>
                <div style="font-size: 13px; opacity: 0.85;">Password: <strong>${escapeHtml(data.radius_password)}</strong></div>
                ${loginUrl ? `
                <div style="margin-top: 10px;">
                    <a href="${escapeHtml(loginUrl)}" style="display: inline-block; padding: 8px 12px; background: #10b981; color: #fff; border-radius: 6px; text-decoration: none; font-weight: 600;">Tap to Connect</a>
                </div>` : ''}
            </div>
        </div>`;
    }

    connectionDetails.innerHTML = html;

    if (typeof populateSuccessAds === 'function') {
        populateSuccessAds();
    }
}

// ========================================
// ACCESS CODE CARD — after an M-Pesa payment for a multi-device plan
// payment-status returns access_code (e.g. "ABC-DEF") for the paying device.
// ========================================
function renderAccessCodeCard(container, accessCode, maxDevices) {
    if (!container || !accessCode) return;

    const card = document.createElement('div');
    card.className = 'detail-row access-code-card';
    card.style.cssText = 'margin-top: 14px; padding: 14px; background: linear-gradient(135deg, var(--primary, #E85D04) 0%, var(--primary-dark, #DC2F02) 100%); border-radius: 10px; color: #fff; display: block;';

    const title = document.createElement('div');
    title.style.cssText = 'font-size: 13px; opacity: 0.9;';
    title.textContent = tr('accessCodeTitle');

    const row = document.createElement('div');
    row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 6px 0;';

    const codeEl = document.createElement('strong');
    codeEl.style.cssText = 'font-size: 28px; letter-spacing: 3px; font-family: monospace; user-select: all;';
    codeEl.textContent = accessCode;

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.style.cssText = 'padding: 8px 14px; border: none; border-radius: 6px; background: #fff; color: #111827; font-weight: 700; cursor: pointer; font-family: inherit;';
    copyBtn.textContent = `📋 ${tr('copy')}`;
    copyBtn.addEventListener('click', async () => {
        const ok = await copyTextToClipboard(accessCode);
        if (ok) {
            copyBtn.textContent = `✓ ${tr('copied')}`;
            setTimeout(() => { copyBtn.textContent = `📋 ${tr('copy')}`; }, 2000);
        } else {
            // Clipboard blocked (common in captive-portal webviews): select the
            // code so the customer can long-press → copy.
            try {
                const range = document.createRange();
                range.selectNodeContents(codeEl);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            } catch (e) { /* ignore */ }
        }
    });

    row.append(codeEl, copyBtn);

    const body = document.createElement('div');
    body.style.cssText = 'font-size: 13px; opacity: 0.95;';
    body.textContent = tr('accessCodeBody', { n: maxDevices || '—' });

    card.append(title, row, body);
    container.appendChild(card);
}

// ========================================
// FREE TRIAL — "Try free for 30 Minutes"
// GET  /api/public/free-trial/{router_id}/{mac} → trials this device may claim
// POST /api/public/free-trial/claim             → same response as a code redeem
// A reseller offers a trial by creating a plan with plan_type "free_trial"
// (price 0). It is never sold: it stays out of the paid list and the backend
// refuses to charge for it, so the only way in is the button built here.
// ========================================
function isFreeTrialPlan(plan) {
    if (!plan) return false;
    const type = plan.plan_type || plan.planType
        || (plan.originalData && plan.originalData.plan_type);
    return type === 'free_trial';
}

async function fetchFreeTrials(rId, macAddress) {
    const url = `${FREE_TRIAL_ENDPOINT}/${encodeURIComponent(rId)}/${encodeURIComponent(macAddress)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
        const response = await fetch(getProxiedUrl(url), {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            mode: 'cors',
            signal: controller.signal
        });
        if (!response.ok) throw new Error(`Free trial API ${response.status}`);
        const data = await response.json();
        return Array.isArray(data && data.trials) ? data.trials : [];
    } finally {
        clearTimeout(timeoutId);
    }
}

// Asks the backend only when this hotspot's plans include a trial, so portals
// of resellers who never set one up make no extra request. Trials this device
// can't claim (already used a once-only trial, or already online) are left
// out rather than shown disabled: a button the customer can never press only
// teases, and the paid plans right below are what they need instead.
async function loadFreeTrials() {
    const section = document.getElementById('freeTrialSection');
    if (!section) return;
    const macAddress = getClientMac();
    if (!hotspotOffersFreeTrial || !routerId || !macAddress) {
        section.classList.add('hidden');
        return;
    }
    try {
        const trials = await fetchFreeTrials(routerId, macAddress);
        console.log('🎁 [FREE TRIAL] Eligibility:', trials);
        renderFreeTrials(trials.filter(t => t && t.eligible));
    } catch (err) {
        // A trial is a bonus — its lookup failing must never get in the way
        // of buying a plan.
        console.warn('⚠️ [FREE TRIAL] Eligibility check failed:', err.message);
        section.classList.add('hidden');
    }
}

function renderFreeTrials(trials) {
    const section = document.getElementById('freeTrialSection');
    const list = document.getElementById('freeTrialList');
    const result = document.getElementById('freeTrialResult');
    if (!section || !list) return;

    list.textContent = '';
    if (result) result.classList.add('hidden');
    trials.forEach(trial => list.appendChild(createFreeTrialButton(trial)));
    section.classList.toggle('hidden', trials.length === 0);
}

// Reseller-typed name and speed go in via textContent.
function createFreeTrialButton(trial) {
    const duration = formatDuration(trial.duration_value, trial.duration_unit);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'free-trial-btn';
    btn.dataset.planId = String(trial.plan_id);

    const icon = document.createElement('span');
    icon.className = 'free-trial-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '🎁';

    const text = document.createElement('span');
    text.className = 'free-trial-text';
    const title = document.createElement('span');
    title.className = 'free-trial-title';
    title.textContent = tr('trialTry', { duration });
    const sub = document.createElement('span');
    sub.className = 'free-trial-sub';
    const name = planNameLine({ name: trial.name, duration });
    const speed = portalSettings.show_plan_speed !== false && trial.speed ? formatSpeed(trial.speed) : '';
    sub.textContent = [name, speed, tr('trialNoPayment')].filter(Boolean).join(' · ');
    text.append(title, sub);

    const arrow = document.createElement('span');
    arrow.className = 'free-trial-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '→';

    const loader = document.createElement('span');
    loader.className = 'free-trial-loader hidden';
    loader.innerHTML = '<span class="loader-spinner"></span>';

    btn.append(icon, text, arrow, loader);
    btn.addEventListener('click', () => claimFreeTrial(trial, btn));
    return btn;
}

function setFreeTrialLoading(activeBtn, isLoading) {
    document.querySelectorAll('#freeTrialList .free-trial-btn').forEach(b => {
        b.disabled = isLoading;
    });
    if (!activeBtn) return;
    activeBtn.querySelector('.free-trial-arrow')?.classList.toggle('hidden', isLoading);
    activeBtn.querySelector('.free-trial-loader')?.classList.toggle('hidden', !isLoading);
}

let freeTrialClaimInFlight = false;

async function claimFreeTrial(trial, btn) {
    if (freeTrialClaimInFlight) return;
    const result = document.getElementById('freeTrialResult');
    const macAddress = getClientMac();
    if (!macAddress) {
        renderResultError(result, tr('noMac'));
        return;
    }

    freeTrialClaimInFlight = true;
    setFreeTrialLoading(btn, true);
    if (result) result.classList.add('hidden');

    try {
        const requestBody = {
            plan_id: trial.plan_id,
            mac_address: macAddress,
            router_id: routerId
        };
        // A phone saved from an earlier purchase on this device lets the
        // backend's once-per-customer rule recognise the same person across
        // devices. Never asked for here: sent only when already saved.
        let savedPhone = '';
        try { savedPhone = (localStorage.getItem('bitwave_phone_number') || '').trim(); } catch (e) { /* storage blocked */ }
        if (savedPhone) requestBody.phone = savedPhone;
        console.log('🎁 [FREE TRIAL] Claim request:', requestBody);
        const data = await postPublicJson(FREE_TRIAL_CLAIM_ENDPOINT, requestBody, 30000, tr('trialFailed'));
        console.log('✅ [FREE TRIAL] Claimed:', data);
        handleRedeemSuccess(data, macAddress, {
            method: tr('trialMethod'),
            headline: tr('trialStarted'),
            planName: trial.name
        });
    } catch (err) {
        console.error('❌ [FREE TRIAL] Claim failed:', err.message);
        // The backend's `detail` explains the refusal ("You have already used
        // this free trial."); only transport failures get our own wording.
        let message = err.message || tr('trialFailed');
        if (err.name === 'AbortError') message = friendlyAccessCodeError(err);
        else if (err instanceof TypeError) message = tr('trialFailed');
        renderResultError(result, message);
    } finally {
        freeTrialClaimInFlight = false;
        setFreeTrialLoading(btn, false);
    }
}

// ========================================
// RECONNECT: API CALL
// POST /api/public/reconnect
// voucher_code accepts any code (voucher / access code / receipt); the
// response has the same shape as access-code/redeem.
// ========================================
const VOUCHER_CODE_REGEX = /^\d{4}-\d{4}$/;

function isVoucherCode(value) {
    return VOUCHER_CODE_REGEX.test(value.trim());
}

// Phone = only phone characters (digits, spaces, +, dashes, brackets) with at
// least 9 digits, and not the XXXX-XXXX voucher shape. Everything else —
// 8-digit vouchers, ABC-DEF access codes, SIG7X2ABCD receipts — is a code.
function isPhoneInput(value) {
    const trimmed = value.trim();
    if (!/^\+?[\d\s()\-]+$/.test(trimmed) || isVoucherCode(trimmed)) return false;
    return trimmed.replace(/[^0-9]/g, '').length >= 9;
}

function isReconnectCodeInput(value) {
    return !isPhoneInput(value) && looksLikeAccessCode(value);
}

async function reconnectUser(inputValue) {
    const macAddress = getClientMac();
    if (!macAddress) {
        const err = new Error(tr('noMac'));
        err.status = 0;
        throw err;
    }
    const rId = routerId || FALLBACK_ROUTER_ID;
    const trimmed = inputValue.trim();

    let requestBody;
    if (isPhoneInput(trimmed)) {
        requestBody = {
            phone: formatPhoneForPaymentProvider(trimmed),
            mac_address: macAddress,
            router_id: rId
        };
    } else {
        requestBody = {
            voucher_code: normalizeAccessCode(trimmed),
            mac_address: macAddress,
            router_id: rId
        };
    }

    console.log('🔄 [RECONNECT] Sending request:', requestBody);
    const data = await postPublicJson(RECONNECT_ENDPOINT, requestBody, 20000, 'Reconnection failed');
    console.log('✅ [RECONNECT] Success:', data);
    return data;
}

// ========================================
// RECONNECT: UI SETUP & HANDLERS
// ========================================
function updateReconnectHint() {
    const hint = document.getElementById('reconnectHint');
    const input = document.getElementById('reconnectInput');
    if (!hint) return;
    const val = input ? input.value : '';
    if (val && isPhoneInput(val)) {
        hint.textContent = tr('reconnectPhoneDetected');
    } else if (val && isReconnectCodeInput(val)) {
        hint.textContent = tr('reconnectCodeDetected');
    } else {
        hint.textContent = tr('reconnectHint');
    }
}

function setupReconnectUI() {
    const input = document.getElementById('reconnectInput');
    const btn = document.getElementById('reconnectBtn');
    const btnText = btn?.querySelector('.reconnect-btn-text');
    const hint = document.getElementById('reconnectHint');
    const result = document.getElementById('reconnectResult');

    if (!input || !btn) return;

    input.addEventListener('input', () => {
        let val = input.value;

        // Auto-insert dash for voucher codes: after 4 consecutive digits, add dash
        const digitsOnly = val.replace(/[^0-9]/g, '');
        if (digitsOnly.length <= 8 && val === digitsOnly && digitsOnly.length === 5) {
            val = digitsOnly.slice(0, 4) + '-' + digitsOnly.slice(4);
            input.value = val;
        }

        // Update visual hints
        input.classList.remove('input-phone', 'input-voucher');
        hint.classList.remove('hint-phone', 'hint-voucher');
        if (result) result.classList.add('hidden');
        pendingDeviceLimitRetry = null;

        if (isPhoneInput(val)) {
            input.classList.add('input-phone');
            hint.classList.add('hint-phone');
        } else if (isReconnectCodeInput(val)) {
            input.classList.add('input-voucher');
            hint.classList.add('hint-voucher');
        }
        updateReconnectHint();
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            btn.click();
        }
    });

    const runReconnect = async (val) => {
        btn.disabled = true;
        btnText.textContent = 'Reconnecting...';
        if (result) result.classList.add('hidden');

        try {
            const data = await reconnectUser(val);
            showReconnectSuccess(data);
        } catch (err) {
            if (isDeviceLimitError(err)) {
                const code = isPhoneInput(val) ? null : normalizeAccessCode(val);
                renderDeviceLimitPanel(result, err.detail, {
                    code,
                    retry: () => runReconnect(val)
                });
                return;
            }
            let message = friendlyAccessCodeError(err);
            if (err.status === 404) {
                message = 'No active subscription found. Please check your input or purchase a new plan.';
            } else if (err.status === 409) {
                message = err.message || 'This device is already registered to another active account.';
            }
            showReconnectError(message);
        } finally {
            btn.disabled = false;
            btnText.textContent = tr('reconnectBtn');
        }
    };

    btn.addEventListener('click', () => {
        const val = input.value.trim();
        if (!val) {
            input.focus();
            return;
        }

        // Validate: either a valid phone number or something shaped like a code
        const validPhone = isPhoneInput(val) && validatePhoneNumber(val.replace(/[^0-9]/g, ''));
        if (!validPhone && !isReconnectCodeInput(val)) {
            showReconnectError(tr('reconnectInvalid'));
            return;
        }

        runReconnect(val);
    });
}

function showReconnectSuccess(data) {
    const result = document.getElementById('reconnectResult');
    if (!result) return;

    const expiryDate = data.expires_at ? new Date(data.expires_at) : null;
    const expiryText = expiryDate ? expiryDate.toLocaleDateString('en-KE', {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi'
    }) : 'N/A';

    const remaining = data.remaining_hours != null
        ? (data.remaining_hours >= 24
            ? `${Math.floor(data.remaining_hours / 24)}d ${Math.round(data.remaining_hours % 24)}h`
            : `${Math.round(data.remaining_hours * 10) / 10}h`)
        : '';

    const headline = accessCodeOutcomeMessage(data) || 'Welcome back!';
    const shareHint = accessCodeShareHint(data);

    result.innerHTML = `
        <div class="reconnect-result-success">
            <div class="reconnect-success-header">
                <span class="reconnect-success-check">✓</span>
                <div>
                    <div class="reconnect-success-label">${escapeHtml(headline)}</div>
                    <div class="reconnect-success-name">${escapeHtml(data.customer_name || data.plan_name || 'Customer')}</div>
                </div>
            </div>
            <div class="reconnect-details">
                <div class="reconnect-detail-row">
                    <span class="reconnect-detail-label">Plan</span>
                    <span class="reconnect-detail-value">${escapeHtml(data.plan_name || '—')}</span>
                </div>
                <div class="reconnect-detail-row">
                    <span class="reconnect-detail-label">Expires</span>
                    <span class="reconnect-detail-value">${escapeHtml(expiryText)}</span>
                </div>
                ${remaining ? `
                <div class="reconnect-detail-row">
                    <span class="reconnect-detail-label">Remaining</span>
                    <span class="reconnect-detail-value">${escapeHtml(remaining)}</span>
                </div>` : ''}
                ${shareHint ? `
                <div class="reconnect-detail-row">
                    <span class="reconnect-detail-label">📱</span>
                    <span class="reconnect-detail-value">${escapeHtml(shareHint)}</span>
                </div>` : ''}
            </div>
            <a href="http://google.com" class="reconnect-browse-btn">
                <span>📶</span>
                <span>Start Browsing</span>
                <span>→</span>
            </a>
        </div>
    `;

    result.classList.remove('hidden');

    // RADIUS auto-login if credentials present
    let radiusRedirecting = false;
    if (data.radius_username && data.radius_password) {
        const loginUrl = buildRadiusLoginUrl(mikrotikParams.gw, data.radius_username, data.radius_password, mikrotikParams.dst);
        if (loginUrl) {
            radiusRedirecting = true;
            try {
                localStorage.setItem('bitwave_last_radius_login', JSON.stringify({
                    loginUrl, username: data.radius_username,
                    password: data.radius_password, gateway: mikrotikParams.gw,
                    dst: mikrotikParams.dst, mac: mikrotikParams.mac,
                    planName: data.plan_name,
                    expiry: data.expires_at,
                    savedAt: new Date().toISOString()
                }));
            } catch (e) { /* ignore */ }

            setTimeout(() => { window.location.href = loginUrl; }, 2500);
        }
    }

    // DIRECT_API reconnect: no RADIUS redirect in play, so auto-fire "Start Browsing".
    if (!radiusRedirecting) scheduleAutoStartBrowsing();
}

function showReconnectError(message) {
    const result = document.getElementById('reconnectResult');
    if (!result) return;

    result.innerHTML = `
        <div class="reconnect-result-error">
            <span class="reconnect-error-icon">✕</span>
            <span class="reconnect-error-text"></span>
        </div>
    `;
    result.querySelector('.reconnect-error-text').textContent = message;

    result.classList.remove('hidden');
}

// ========================================
// SETUP EVENT LISTENERS
// ========================================
function setupEventListeners() {
    // Back button - always goes to plans section (which has maintenance banner if active)
    backButton.addEventListener('click', () => {
        showSection(plansSection);
        hideSection(paymentSection);
        resetForm();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    
    // Form submission
    paymentForm.addEventListener('submit', handlePayment);
    
    // Phone number formatting (only allow digits, auto-format)
    phoneNumberInput.addEventListener('input', (e) => {
        // Remove all non-numeric characters
        let value = e.target.value.replace(/[^\d]/g, '');
        
        const maxDigits = routerPaymentProvider === 'fapshi' ? 14 : 10;
        if (value.length > maxDigits) {
            value = value.substring(0, maxDigits);
        }
        
        e.target.value = value;
        
        // Save phone number for returning users (localStorage + cookies)
        if (value.length >= 9) {
            savePhoneNumber(value);
        }
    });
    
    // New purchase button - always goes to plans section
    newPurchaseButton.addEventListener('click', () => {
        showSection(plansSection);
        hideSection(successSection);
        hideSection(processingSection);
        resetForm();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    
    // Retry button - go back to payment section to try again
    retryButton.addEventListener('click', () => {
        showSection(paymentSection);
        hideSection(errorSection);
        hideSection(processingSection);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

// ========================================
// HANDLE PAYMENT
// ========================================
async function handlePayment(e) {
    e.preventDefault();
    
    const phoneNumber = phoneNumberInput.value.trim();
    
    // Basic validation
    if (!phoneNumber) {
        alert('Please provide your mobile number to continue');
        phoneNumberInput.focus();
        return;
    }
    
    // Validate phone number format
    if (!validatePhoneNumber(phoneNumber)) {
        alert(routerPaymentProvider === 'fapshi'
            ? 'Please enter a valid Cameroon phone number (e.g., 670000000 or 237670000000)'
            : 'Please enter a valid phone number (e.g., 0712345678 or 712345678)');
        phoneNumberInput.focus();
        return;
    }
    
    // Save valid phone number for returning users (localStorage + cookies)
    savePhoneNumber(phoneNumber);
    
    if (!selectedPlan) {
        alert('Please select a plan first');
        return;
    }
    
    // Show loading state
    setLoadingState(true);
    
    try {
        // Step 1: Initiate payment
        const paymentResponse = await processPayment(phoneNumber, selectedPlan);
        console.log('✅ Payment initiated:', paymentResponse);

        // Backend refused a duplicate charge (409) — resume waiting on the
        // existing in-flight payment instead of treating it as an error
        if (paymentResponse && paymentResponse.payment_in_progress) {
            console.log('⏳ Resuming wait on in-flight payment (no second charge)');
            showPaymentPendingMessage(phoneNumber, selectedPlan);
            // They already entered their PIN — show confirmation copy instead
            if (processingSubtext) {
                processingSubtext.textContent = `Your payment is being confirmed. Please do not pay again — you will be connected automatically as soon as ${getPaymentProviderLabel()} confirms.`;
            }
            hideSection(paymentSection);
            showSection(processingSection);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            await pollPaymentStatusAndLogin(paymentResponse.customer_id, phoneNumber, selectedPlan);
            return;
        }

        // If backend returned RADIUS credentials immediately (already-active customer),
        // skip polling and go straight to auto-login
        if (paymentResponse.radius_username && paymentResponse.radius_password && paymentResponse.status === 'active') {
            console.log('[RADIUS] Already-active customer, redirecting to login');
            var loginUrl = buildRadiusLoginUrl(mikrotikParams.gw, paymentResponse.radius_username, paymentResponse.radius_password, mikrotikParams.dst);
            if (loginUrl) {
                try { localStorage.setItem('bitwave_last_radius_login', JSON.stringify({
                    loginUrl: loginUrl, username: paymentResponse.radius_username,
                    password: paymentResponse.radius_password, gateway: mikrotikParams.gw,
                    dst: mikrotikParams.dst, mac: mikrotikParams.mac, phone: phoneNumber,
                    planName: selectedPlan.name || selectedPlan.duration,
                    savedAt: new Date().toISOString()
                })); } catch(e) {}
                hideSection(paymentSection);
                showSection(successSection);
                window.scrollTo({ top: 0, behavior: 'smooth' });
                setTimeout(function() { window.location.href = loginUrl; }, 1500);
                return;
            }
        }
// Update UI to show waiting for payment confirmation
        showPaymentPendingMessage(phoneNumber, selectedPlan);
        hideSection(paymentSection);
        showSection(processingSection);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // Step 2: Poll for payment status and auto-login
        // The backend should return customer_id in the payment response
        const customerId = paymentResponse.customer_id || paymentResponse.id;
        
        if (customerId) {
            await pollPaymentStatusAndLogin(customerId, phoneNumber, selectedPlan);
            // If we reach here, payment was successful and user was authenticated
            // Success message already shown by pollPaymentStatusAndLogin
        } else {
            throw new Error('Payment initiated but no customer ID returned. Please contact support.');
        }
        
    } catch (error) {
        // Show error
        showErrorMessage(error.message);
        hideSection(paymentSection);
        hideSection(processingSection);
        hideSection(successSection);
        showSection(errorSection);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
        setLoadingState(false);
    }
}

// ========================================
// PROCESS PAYMENT - Backend API Call
// ========================================
async function processPayment(phoneNumber, plan) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('💳 [ROUTER DEBUG] STEP 5: PROCESS PAYMENT CALLED');
    console.log('═══════════════════════════════════════════════════════');
    console.log('💳 Processing payment...');
    console.log('📞 Phone (original):', phoneNumber);
    
    const formattedPhone = formatPhoneForPaymentProvider(phoneNumber);
    console.log('📞 Phone (formatted):', formattedPhone);
    
    console.log('📦 Plan:', plan);
    console.log('📦 Plan ID:', plan.id);
    console.log('🔧 MAC:', mikrotikParams.mac);
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('🆔 [ROUTER DEBUG] ROUTER_ID CHECK AT PAYMENT TIME');
    console.log('═══════════════════════════════════════════════════════');
    console.log('🆔 Global routerId variable:', routerId);
    console.log('🆔 routerId type:', typeof routerId);
    console.log('🆔 routerId is null:', routerId === null);
    console.log('🆔 routerId is undefined:', routerId === undefined);
    console.log('🆔 routerId is falsy:', !routerId);
    console.log('🆔 FALLBACK_ROUTER_ID constant:', FALLBACK_ROUTER_ID);
    console.log('🆔 Would use fallback:', !routerId);
    console.log('═══════════════════════════════════════════════════════');
    
    // A free trial (or any KSH 0 plan) must never reach the STK push. They are
    // filtered out of the paid list; this is the last line if one slips through.
    const planAmount = Number(plan.originalData ? plan.originalData.price : plan.price);
    if (isFreeTrialPlan(plan) || !(planAmount > 0)) {
        console.error('❌ Refusing to charge a free / zero-price plan:', plan.id);
        throw new Error(tr('trialNotPayable'));
    }

    // Ensure router_id is available
    if (!routerId) {
        console.error('❌ [ROUTER DEBUG] router_id is NOT available at payment time!');
        console.error('❌ [ROUTER DEBUG] This should not happen - button should be disabled');
        throw new Error('Router not configured. Please refresh the page or contact support.');
    }
    
    try {
        // Add timeout to payment request (60 seconds for M-Pesa processing)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);
        
        const requestBody = {
            phone: formattedPhone,
            plan_id: plan.id,
            mac_address: mikrotikParams.mac,
            router_id: routerId,  // Database ID of router (looked up from identity)
            payment_method: "mobile_money"
        };
        
        // Determine which endpoint to use based on router auth_method
        const isRadiusRouter = routerAuthMethod === 'RADIUS';
        const paymentEndpoint = isRadiusRouter ? RADIUS_PAYMENT_ENDPOINT : PAYMENT_ENDPOINT;
        
        console.log('═══════════════════════════════════════════════════════');
        console.log('📤 [ROUTER DEBUG] PAYMENT REQUEST BODY');
        console.log('═══════════════════════════════════════════════════════');
        console.log('📤 Full request body:', JSON.stringify(requestBody, null, 2));
        console.log('📤 router_id in request:', requestBody.router_id);
        console.log('📤 router_id type in request:', typeof requestBody.router_id);
        console.log('🔐 [ROUTER DEBUG] Router auth_method:', routerAuthMethod);
        console.log('🔐 [ROUTER DEBUG] Using RADIUS endpoint:', isRadiusRouter);
        console.log('🔐 [ROUTER DEBUG] Payment endpoint:', paymentEndpoint);
        console.log('═══════════════════════════════════════════════════════');
        console.log('📤 Sending payment request:', requestBody);
        
        const response = await fetch(getProxiedUrl(paymentEndpoint), {
        method: 'POST',
        headers: {
                'Accept': 'application/json',
            'Content-Type': 'application/json',
        },
            mode: 'cors', // Enable CORS
            body: JSON.stringify(requestBody),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        const responseData = await response.json();
        console.log('═══════════════════════════════════════════════════════');
        console.log('📨 [ROUTER DEBUG] PAYMENT API RESPONSE');
        console.log('═══════════════════════════════════════════════════════');
        console.log('📨 Response status:', response.status);
        console.log('📨 Response ok:', response.ok);
        console.log('📨 Full response data:', JSON.stringify(responseData, null, 2));
        console.log('📨 router_id in RESPONSE:', responseData.router_id);
        console.log('📨 COMPARE: Sent router_id:', routerId, '| Received router_id:', responseData.router_id);
        if (routerId !== responseData.router_id) {
            console.error('🚨 [ROUTER DEBUG] MISMATCH! Sent router_id differs from response router_id!');
            console.error('🚨 This indicates the backend might be overriding the router_id');
        }
        console.log('═══════════════════════════════════════════════════════');

        // 409 = backend refused a duplicate charge (payment already in flight).
        // Not an error — the caller should resume waiting on the existing payment.
        if (response.status === 409) {
            const detail = responseData.detail || {};
            if (detail.status === 'payment_in_progress' && detail.customer_id) {
                console.log('⏳ Payment already in progress for customer', detail.customer_id);
                return {
                    payment_in_progress: true,
                    customer_id: detail.customer_id,
                    message: detail.message,
                };
            }
        }

    if (!response.ok) {
            throw new Error(responseData.message || responseData.error || 'Payment failed. Please try again.');
        }
        
        return responseData;
        
    } catch (error) {
        console.error('❌ Payment error:', error);
        
        // Handle specific error types
        if (error.name === 'AbortError') {
            throw new Error('Payment request timed out. Please check your connection and try again.');
        }
        
        if (error instanceof TypeError && error.message.includes('fetch')) {
            throw new Error('Network error. Please check your internet connection and try again.');
        }
        
        // Re-throw error with original message
        throw error;
    }
}

// ========================================
// POLL PAYMENT STATUS & WAIT FOR INTERNET ACCESS
// ========================================
async function pollPaymentStatusAndLogin(customerId, phoneNumber, plan) {
    console.log('🔄 Checking payment status and internet access...');
    console.log('📋 Customer ID:', customerId);
    
    // Determine which endpoint to use based on router auth_method
    const isRadiusRouter = routerAuthMethod === 'RADIUS';
    const statusEndpoint = isRadiusRouter ? RADIUS_PAYMENT_STATUS_ENDPOINT : PAYMENT_STATUS_ENDPOINT;
    console.log('🔐 [ROUTER DEBUG] Using RADIUS status endpoint:', isRadiusRouter);
    console.log('🔐 [ROUTER DEBUG] Status endpoint:', statusEndpoint);
    
    let attempts = 0;
    
    return new Promise((resolve, reject) => {
        const pollInterval = setInterval(async () => {
            attempts++;
            console.log(`🔍 Polling attempt ${attempts}/${PAYMENT_POLL_MAX_ATTEMPTS}...`);
            
            try {
                // mac lets the backend return the multi-device access_code
                // only to the device that paid.
                const clientMac = getClientMac();
                const statusUrl = clientMac
                    ? `${statusEndpoint}/${customerId}?mac=${encodeURIComponent(clientMac)}`
                    : `${statusEndpoint}/${customerId}`;
                const response = await fetch(getProxiedUrl(statusUrl), {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                    },
                    mode: 'cors'
                });
                
                if (!response.ok) {
                    throw new Error(`Status check failed: ${response.status}`);
                }
                
                const data = await response.json();
                console.log('📊 Status:', data);
                
                // Check if payment is successful (status is "active")
                if (data.status === 'active') {
                    // Payment confirmed and user is active
                    clearInterval(pollInterval);
                    console.log('✅ Payment confirmed!');
                    console.log('🎉 Customer status is active! Plan activated!');
                    console.log('📡 Plan:', data.plan_name);
                    console.log('⏰ Expiry:', data.expiry);

                    // Multi-device plan: remember the access code so it can be
                    // prefilled on later visits.
                    const hasAccessCode = Boolean(data.access_code);
                    if (hasAccessCode) {
                        console.log('🎟️ [ACCESS CODE] Received for multi-device plan, max devices:', data.max_devices);
                        saveAccessCode(data.access_code, data.max_devices, data.expiry);
                    }
                    // Give the customer time to note the code before navigating away.
                    const radiusRedirectDelayMs = hasAccessCode ? 12000 : 2000;
                    
                    // RADIUS auto-login: redirect to MikroTik login with credentials
                    if (isRadiusRouter && data.radius_username && data.radius_password) {
                        console.log('🔐 [RADIUS] Credentials received for auto-login');
                        console.log('🔐 [RADIUS] Username:', data.radius_username);
                        console.log('🔐 [RADIUS] Gateway (gw):', mikrotikParams.gw);
                        
                        // Build MikroTik auto-login URL
                        const loginUrl = buildRadiusLoginUrl(mikrotikParams.gw, data.radius_username, data.radius_password, mikrotikParams.dst);
                        if (loginUrl) {
                            console.log('🔐 [RADIUS] Auto-login URL:', loginUrl);
                            
                            // PERSIST to localStorage before redirect (survives navigation & refresh)
                            try {
                                localStorage.removeItem('bitwave_last_radius_login');
                                const radiusLoginData = {
                                    loginUrl: loginUrl,
                                    username: data.radius_username,
                                    password: data.radius_password,
                                    gateway: mikrotikParams.gw,
                                    dst: mikrotikParams.dst,
                                    mac: mikrotikParams.mac,
                                    phone: phoneNumber,
                                    planName: data.plan_name || plan.duration,
                                    expiry: data.expiry,
                                    customerId: customerId,
                                    savedAt: new Date().toISOString(),
                                    fullResponse: data
                                };
                                localStorage.setItem('bitwave_last_radius_login', JSON.stringify(radiusLoginData));
                                console.log('💾 [RADIUS] Login data saved to localStorage (survives redirect)');
                                console.log('💾 [RADIUS] View anytime with: dumpRadiusLogin()');
                            } catch (e) {
                                console.warn('⚠️ [RADIUS] Could not save to localStorage:', e);
                            }
                            
                            // Show success message briefly, then redirect
                            showAuthenticatedMessage(phoneNumber, plan, data, true, radiusRedirectDelayMs); // true = isRadius
                            
                            // Redirect to MikroTik login after a short delay
                            setTimeout(() => {
                                console.log('🔐 [RADIUS] Redirecting to MikroTik login...');
                                window.location.href = loginUrl;
                            }, radiusRedirectDelayMs); // longer when an access code is on screen
                            
                            resolve(data);
                            return;
                        } else {
                            console.warn('⚠️ [RADIUS] No gateway IP available, cannot auto-login');
                            console.warn('⚠️ [RADIUS] User will need to login manually');
                        }
                    }
                    
                    // Show final success message (for non-RADIUS or if auto-login not possible)
                    showAuthenticatedMessage(phoneNumber, plan, data);

                    // DIRECT_API only: device is already authorised, so auto-fire
                    // the "Start Browsing" action (RADIUS handles its own redirect).
                    // Skipped when an access code is on screen: auto-navigating
                    // would hide it before the customer can copy it (captive
                    // portal webviews often wipe localStorage too).
                    if (!isRadiusRouter && !hasAccessCode) scheduleAutoStartBrowsing();

                    resolve(data);
                } else if (data.status === 'pending') {
                    // Payment is still pending
                    console.log(`⏳ Payment status: pending. Retrying in ${PAYMENT_POLL_INTERVAL/1000}s...`);
                    console.log(`🔄 Attempt ${attempts}/${PAYMENT_POLL_MAX_ATTEMPTS}`);
                    
                    if (attempts >= PAYMENT_POLL_MAX_ATTEMPTS) {
                        clearInterval(pollInterval);
                        console.warn('⏱️ Polling timeout - max attempts reached');
                        reject(new Error(`Payment verification timeout. Please check your ${getPaymentProviderLabel()} messages and try again, or contact support if payment was deducted.`));
                    }
                } else if (attempts >= PAYMENT_POLL_MAX_ATTEMPTS) {
                    clearInterval(pollInterval);
                    console.warn('⏱️ Polling timeout - max attempts reached');
                    reject(new Error('Payment verification timeout. Please refresh the page or contact support.'));
                } else {
                    console.log(`⏳ Waiting for payment confirmation. Retrying in ${PAYMENT_POLL_INTERVAL/1000}s...`);
                }
                
            } catch (error) {
                console.error('❌ Error polling status:', error);
                
                if (attempts >= PAYMENT_POLL_MAX_ATTEMPTS) {
                    clearInterval(pollInterval);
                    reject(error);
                }
                // Continue polling on error (unless max attempts reached)
            }
        }, PAYMENT_POLL_INTERVAL);
    });
}

// ========================================
// SHOW PROCESSING PAYMENT MESSAGE (After PIN is entered)
// ========================================
function showProcessingPaymentMessage(phoneNumber, plan) {
    // Update title and subtitle
    if (processingTitle) {
        processingTitle.textContent = 'Processing Payment...';
    }
    if (processingSubtext) {
        processingSubtext.textContent = 'Setting up your WiFi connection';
    }
    
    // Update steps - Step 2 complete, Step 3 pending
    updateProcessingSteps(2);
}

// ========================================
// SHOW SUCCESS MESSAGE (PAYMENT CONFIRMED & INTERNET ACCESS GRANTED)
// ========================================
function showAuthenticatedMessage(phoneNumber, plan, data, isRadiusAutoLogin = false, redirectDelayMs = 2000) {
    const formattedPhone = formatPhoneForPaymentProvider(phoneNumber);
    
    // Hide processing, show success
    hideSection(processingSection);
    showSection(successSection);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Populate connection details card
    const connectionDetails = document.getElementById('connectionDetails');
    if (connectionDetails) {
        const expiryDate = data.expiry ? new Date(data.expiry) : null;
        // Format expiry in Nairobi timezone (GMT+3 / East Africa Time)
        const expiryText = expiryDate ? expiryDate.toLocaleDateString('en-KE', { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Africa/Nairobi'
        }) : 'N/A';
        
        // Build connection details HTML
        let detailsHtml = `
            <div class="detail-row">
                <span class="detail-label">Plan</span>
                <span class="detail-value">${data.plan_name || plan.duration}</span>
            </div>
            ${portalSettings.show_plan_speed !== false ? `<div class="detail-row">
                <span class="detail-label">Speed</span>
                <span class="detail-value">${plan.speed || 'Standard'}</span>
            </div>` : ''}
            <div class="detail-row">
                <span class="detail-label">Phone</span>
                <span class="detail-value">${formattedPhone}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Valid Until</span>
                <span class="detail-value">${expiryText}</span>
            </div>
        `;
        
        const hasRadiusCreds = data && data.radius_username && data.radius_password;
        const radiusLoginUrl = hasRadiusCreds
            ? buildRadiusLoginUrl(mikrotikParams.gw, data.radius_username, data.radius_password, mikrotikParams.dst)
            : '';

        // Add RADIUS auto-login notice if applicable
        if (isRadiusAutoLogin) {
            detailsHtml += `
            <div class="detail-row radius-notice" style="margin-top: 16px; padding: 12px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 8px; color: white;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 20px;">🔐</span>
                    <span style="font-weight: 600;">Connecting you automatically...</span>
                </div>
                <div style="font-size: 13px; opacity: 0.9; margin-top: 4px;">You will be redirected to login in ${Math.round(redirectDelayMs / 1000)} seconds</div>
            </div>
            `;
        }

        if (hasRadiusCreds) {
            detailsHtml += `
            <div class="detail-row" style="margin-top: 14px; padding: 12px; background: #111827; border-radius: 8px; color: #fff;">
                <div style="font-weight: 600; margin-bottom: 6px;">RADIUS Login Details</div>
                <div style="font-size: 13px; opacity: 0.85;">Username: <strong>${data.radius_username}</strong></div>
                <div style="font-size: 13px; opacity: 0.85;">Password: <strong>${data.radius_password}</strong></div>
                ${radiusLoginUrl ? `
                <div style="margin-top: 10px;">
                    <a href="${radiusLoginUrl}" style="display: inline-block; padding: 8px 12px; background: #10b981; color: #fff; border-radius: 6px; text-decoration: none; font-weight: 600;">Tap to Connect</a>
                </div>
                ` : `
                <div style="margin-top: 8px; font-size: 12px; opacity: 0.75;">
                    Open the login page and enter the credentials above.
                </div>
                `}
                <div style="margin-top: 8px; font-size: 12px; opacity: 0.7;">
                    Tip: Disable Private/Randomized MAC for this Wi‑Fi to avoid repeat payments.
                </div>
            </div>
            `;
        }

        connectionDetails.innerHTML = detailsHtml;

        if (data && data.access_code) {
            renderAccessCodeCard(connectionDetails, data.access_code, data.max_devices);
        }
    }
    
    // Populate success page ads from the global ads data
    if (typeof populateSuccessAds === 'function') {
        populateSuccessAds();
    }
}

// ========================================
// UI HELPER FUNCTIONS
// ========================================
function showSection(section) {
    section.classList.remove('hidden');
}

function hideSection(section) {
    section.classList.add('hidden');
}

// ========================================
// AUTO "START BROWSING" — after a DIRECT_API success the device MAC is already
// authorised, so we replicate the manual "Start Browsing" tap automatically:
// navigating to a normal http URL makes the phone's OS detect connectivity and
// dismiss the captive-portal sheet (landing the user on Wi-Fi settings).  The
// visible button is kept as a fallback in case the OS blocks auto-navigation.
// One-shot guarded so it can never double-fire across success paths.
// ========================================
let _autoBrowseScheduled = false;
function scheduleAutoStartBrowsing(delayMs = 1500) {
    if (_autoBrowseScheduled) return;
    _autoBrowseScheduled = true;

    // Single-source the URL from whichever success button is on screen.
    const btn = document.getElementById('startBrowsingBtn')
             || document.querySelector('.reconnect-browse-btn');

    // Thin progress bar so the auto-redirect doesn't feel abrupt — it fills over
    // the same delay, then we navigate. Sits under the success headline on the
    // main card, or just above the button on the reconnect card.
    if (!document.getElementById('autoBrowseProgress')) {
        const bar = document.createElement('div');
        bar.id = 'autoBrowseProgress';
        bar.className = 'auto-browse-progress';
        bar.setAttribute('role', 'progressbar');
        bar.setAttribute('aria-label', 'Connecting you to the internet');
        const fill = document.createElement('div');
        fill.className = 'auto-browse-progress-fill';
        bar.appendChild(fill);

        const heroAnchor = document.querySelector('#successSection:not(.hidden) .success-hero .success-subtext');
        if (heroAnchor && heroAnchor.parentNode) {
            heroAnchor.parentNode.insertBefore(bar, heroAnchor.nextSibling);
        } else if (btn && btn.parentNode) {
            btn.parentNode.insertBefore(bar, btn);
        }

        // Kick off the fill on the next frame so the CSS transition animates.
        requestAnimationFrame(() => {
            fill.style.transitionDuration = delayMs + 'ms';
            fill.style.width = '100%';
        });
    }

    setTimeout(() => {
        const target = (btn && btn.getAttribute('href')) || 'http://google.com';
        console.log('📶 [AUTO-BROWSE] Redirecting to dismiss captive portal:', target);
        window.location.href = target;
    }, delayMs);
}
window.scheduleAutoStartBrowsing = scheduleAutoStartBrowsing;

function setLoadingState(isLoading) {
    if (isLoading) {
        submitButton.disabled = true;
        buttonText.classList.add('hidden');
        buttonLoader.classList.remove('hidden');
    } else {
        submitButton.disabled = false;
        buttonText.classList.remove('hidden');
        buttonLoader.classList.add('hidden');
    }
}

function showPaymentPendingMessage(phoneNumber, plan) {
    // Format phone number for display
    const formattedPhone = formatPhoneForPaymentProvider(phoneNumber);
    
    // Update processing section UI
    if (processingTitle) {
        processingTitle.textContent = 'Check Your Phone';
    }
    if (processingSubtext) {
        processingSubtext.textContent = `Approve the ${getPaymentProviderLabel()} prompt to complete payment. Confirmation can take up to a minute or two — please do not pay again.`;
    }
    
    // Update plan info card
    if (processingPlanInfo) {
        processingPlanInfo.innerHTML = `
            <div class="processing-plan-row">
                <span class="processing-plan-label">Plan</span>
                <span class="processing-plan-value">${plan.duration}</span>
            </div>
            <div class="processing-plan-row">
                <span class="processing-plan-label">Amount</span>
                <span class="processing-plan-value">${plan.price}</span>
            </div>
            <div class="processing-plan-row">
                <span class="processing-plan-label">Phone</span>
                <span class="processing-plan-value">${formattedPhone}</span>
            </div>
        `;
    }
    
    // Update steps - Step 1 completed, Step 2 active
    updateProcessingSteps(1);
}

// Update the processing steps visual state
function updateProcessingSteps(currentStep) {
    const steps = [processingStep1, processingStep2, processingStep3];
    
    steps.forEach((step, index) => {
        if (!step) return;
        
        // Remove all state classes
        step.classList.remove('completed', 'active');
        
        const indicator = step.querySelector('.step-indicator');
        if (!indicator) return;
        
        if (index < currentStep) {
            // Completed step
            step.classList.add('completed');
            indicator.innerHTML = '<span class="step-check">✓</span>';
        } else if (index === currentStep) {
            // Active step (in progress)
            step.classList.add('active');
            indicator.innerHTML = '<span class="step-spinner"></span>';
        } else {
            // Future step (pending)
            indicator.innerHTML = `<span class="step-number">${index + 1}</span>`;
        }
    });
}

// showSuccessMessage removed - now using showWaitingForConnectionMessage and showAuthenticatedMessage instead

function showErrorMessage(message) {
    // Update the error message text
    if (errorMessage) {
        errorMessage.textContent = message || 'The payment could not be completed. Please try again.';
    }
}

function resetForm() {
    paymentForm.reset();
    selectedPlan = null;
}

// ========================================
// UTILITY: Format Currency (if needed)
// ========================================
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-KE', {
        style: 'currency',
        currency: 'KES'
    }).format(amount);
}

// ========================================
// PHONE NUMBER VALIDATION (Enhanced)
// Accepts both formats:
// - 10 digits starting with 0: 07XXXXXXXX or 01XXXXXXXX
// - 9 digits without leading 0: 7XXXXXXXX or 1XXXXXXXX
// ========================================
function validatePhoneNumber(phoneNumber) {
    const digits = String(phoneNumber || '').replace(/\D/g, '');
    if (routerPaymentProvider === 'fapshi') {
        const local = digits.startsWith('00237')
            ? digits.substring(5)
            : (digits.startsWith('237') ? digits.substring(3) : (digits.startsWith('0') ? digits.substring(1) : digits));
        return /^6[0-9]{8}$/.test(local);
    }
    // Kenya format - either:
    // 1. 10 digits starting with 07 or 01 (e.g., 0712345678, 0112345678)
    // 2. 9 digits starting with 7 or 1 (e.g., 712345678, 112345678)
    const tenDigitRegex = /^0[17][0-9]{8}$/;  // 0712345678 or 0112345678
    const nineDigitRegex = /^[17][0-9]{8}$/;   // 712345678 or 112345678
    
    return tenDigitRegex.test(digits) || nineDigitRegex.test(digits);
}

function formatPhoneForPaymentProvider(phoneNumber) {
    const digits = String(phoneNumber || '').replace(/\D/g, '');
    if (routerPaymentProvider === 'fapshi') {
        let local = digits;
        if (local.startsWith('00237')) local = local.substring(5);
        else if (local.startsWith('237')) local = local.substring(3);
        if (local.startsWith('0')) local = local.substring(1);
        return `237${local}`;
    }
    return formatPhoneForMpesa(phoneNumber);
}

// ========================================
// PHONE NUMBER FORMATTING for M-Pesa
// ========================================
function formatPhoneForMpesa(phoneNumber) {
    // Convert Kenyan format to international format
    // Input: 0712345678 or 712345678 or 0112345678 or 112345678
    // Output: 254712345678 or 254112345678
    
    // Remove any spaces, dashes, or special characters
    let cleaned = phoneNumber.replace(/[\s\-\(\)]/g, '');
    
    // If already has 254 prefix, keep as is
    if (cleaned.startsWith('254')) {
        return cleaned;
    }
    
    // If starts with +254, remove the +
    if (cleaned.startsWith('+254')) {
        return cleaned.substring(1);
    }
    
    // If starts with 0, replace with 254
    if (cleaned.startsWith('0')) {
        return '254' + cleaned.substring(1);
    }
    
    // If 9 digits starting with 7 or 1 (no leading 0), add 254
    if (cleaned.length === 9 && /^[17]/.test(cleaned)) {
        return '254' + cleaned;
    }
    
    return cleaned;
}

// Real-time validation feedback
phoneNumberInput.addEventListener('blur', function() {
    if (this.value && !validatePhoneNumber(this.value)) {
        this.style.borderColor = 'var(--error-color)';
        this.style.boxShadow = '0 0 0 3px rgba(239, 68, 68, 0.2)';
    } else if (this.value && validatePhoneNumber(this.value)) {
        this.style.borderColor = 'var(--success-color)';
        this.style.boxShadow = '0 0 0 3px rgba(34, 197, 94, 0.2)';
    } else {
        this.style.borderColor = '';
        this.style.boxShadow = '';
    }
});

// ========================================
// CONSOLE LOGS FOR DEBUGGING
// ========================================
console.log('🌐 WiFi Portal Initialized');
console.log('⚡ Plans: Using HARDCODED data (instant load)');
console.log('🔗 API Endpoints:');
console.log('  - Payment:', PAYMENT_ENDPOINT);
console.log('  - Router Lookup:', ROUTER_LOOKUP_ENDPOINT);
console.log('💡 Ready to connect!');

// Display CORS proxy status
if (USE_CORS_PROXY) {
    console.warn('⚠️ CORS PROXY MODE ENABLED - FOR TESTING ONLY!');
    console.log('🔧 Make sure backend adds proper CORS headers for production.');
}

// ========================================
// DEBUG HELPER: Check current router state
// ========================================
window.debugRouterState = function() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔍 [ROUTER DEBUG] CURRENT STATE SUMMARY');
    console.log('═══════════════════════════════════════════════════════');
    console.log('📍 URL:', window.location.href);
    console.log('📍 mikrotikParams.router:', `"${mikrotikParams.router}"`);
    console.log('📍 Global routerId:', routerId);
    console.log('📍 FALLBACK_ROUTER_ID:', FALLBACK_ROUTER_ID);
    console.log('📍 Submit button disabled:', submitButton ? submitButton.disabled : 'N/A');
    console.log('═══════════════════════════════════════════════════════');
    return { 
        url: window.location.href,
        routerParam: mikrotikParams.router, 
        routerId: routerId, 
        fallback: FALLBACK_ROUTER_ID 
    };
};

console.log('💡 [ROUTER DEBUG] Call debugRouterState() in console anytime to check router state');


