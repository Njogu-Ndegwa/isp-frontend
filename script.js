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

// ========================================
// 🚨 MAINTENANCE MODE CONFIGURATION 🚨
// ========================================
// Set to TRUE to show maintenance page with special offer
// Set to FALSE for normal operation
const MAINTENANCE_MODE = false;

// Special plan for maintenance mode
// IMPORTANT: Create this plan in your backend first!
const MAINTENANCE_PLAN = {
    id: 19,              // Backend plan ID - UPDATE THIS after creating the plan
    name: '24 Hour Free',
    duration: '24 Hours',
    price: 1,
    priceDisplay: 'KSH 1/-',
    speed: '5Mbps',
    speedRaw: '5M/5M'
};

// ========================================
// API CONFIGURATION
// ========================================
const API_BASE_URL = 'https://isp.bitwavetechnologies.net/api';
// Single portal endpoint — returns router, plans, and ads in one request
const PORTAL_ENDPOINT = `${API_BASE_URL}/public/portal`;
// Legacy endpoints (used as fallback if portal endpoint fails)
function getPlansUrl(rId) {
    return `${API_BASE_URL}/public/plans/${rId || FALLBACK_ROUTER_ID}`;
}
const PAYMENT_ENDPOINT = `${API_BASE_URL}/hotspot/register-and-pay`;
const PAYMENT_STATUS_ENDPOINT = `${API_BASE_URL}/hotspot/payment-status`;
const ROUTER_LOOKUP_ENDPOINT = `${API_BASE_URL}/routers/by-identity`;
// Voucher endpoints (public, no auth)
const VOUCHER_VERIFY_ENDPOINT = `${API_BASE_URL}/public/voucher/verify`;
const VOUCHER_REDEEM_ENDPOINT = `${API_BASE_URL}/public/voucher/redeem`;

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
let routerSupportPhone = '0795635364'; // Default — updated from portal/router API

// Payment polling configuration
const PAYMENT_POLL_INTERVAL = 3000; // Poll every 3 seconds
const PAYMENT_POLL_MAX_ATTEMPTS = 20; // Max 60 seconds (20 * 3s)

// TEMPORARY: Use CORS proxy for development/testing ONLY if backend CORS is not configured
// Remove this in production once backend adds proper CORS headers!
const USE_CORS_PROXY = false; // Set to true only for local testing
const CORS_PROXY = 'https://corsproxy.io/?';

function getProxiedUrl(url) {
    return USE_CORS_PROXY ? CORS_PROXY + encodeURIComponent(url) : url;
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
// PORTAL DATA FETCH — single request for router + plans + ads
// GET /api/public/portal/{identity}
// ========================================
async function fetchPortalData(identity) {
    if (!identity) {
        throw new Error('No router identity for portal lookup');
    }

    const url = `${PORTAL_ENDPOINT}/${encodeURIComponent(identity)}`;
    console.log('📡 [PORTAL] Fetching all data from:', url);

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
        throw new Error(`Portal API ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('✅ [PORTAL] Response:', JSON.stringify(data, null, 2));
    return data;
}

// ========================================
// PLAN CACHING (localStorage)
// ========================================
const PLANS_CACHE_KEY = 'isp_cached_plans';
const PLANS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function getCachedPlans() {
    try {
        const raw = localStorage.getItem(PLANS_CACHE_KEY);
        if (!raw) return null;
        const { plans, ts } = JSON.parse(raw);
        if (Date.now() - ts > PLANS_CACHE_TTL) {
            localStorage.removeItem(PLANS_CACHE_KEY);
            return null;
        }
        return plans;
    } catch { return null; }
}

function cachePlans(plans) {
    try {
        localStorage.setItem(PLANS_CACHE_KEY, JSON.stringify({ plans, ts: Date.now() }));
    } catch { /* quota exceeded - ignore */ }
}

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

// ========================================
// DOM ELEMENTS
// ========================================
const plansSection = document.getElementById('plansSection');
const maintenanceBanner = document.getElementById('maintenanceBanner');
const specialOfferCard = document.getElementById('specialOfferCard');
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

    // Show cached plans instantly so users see something while portal data loads
    const cachedPlans = getCachedPlans();
    if (cachedPlans) {
        console.log('⚡ Showing cached plans while portal data loads...');
        displayPlans(cachedPlans);
    }

    // Single portal fetch — router + plans + ads in one request
    // Falls back to individual endpoints if the portal endpoint fails
    window.portalDataPromise = fetchPortalData(routerIdentity)
        .then(data => {
            // ---- Router info ----
            if (data.router) {
                routerId = data.router.router_id;
                routerAuthMethod = data.router.auth_method || 'DIRECT_API';
                routerBusinessName = data.router.business_name || null;
                routerPaymentMethods = data.router.payment_methods || ['mpesa', 'voucher'];
                console.log('✅ [PORTAL] Router resolved — id:', routerId, 'auth:', routerAuthMethod, 'methods:', routerPaymentMethods);
                updateBranding();
                applyPaymentMethods(routerPaymentMethods);
                updateSupportPhone(data.router.support_phone);
            }

            // ---- Plans ----
            if (Array.isArray(data.plans) && data.plans.length > 0) {
                const apiBestseller = data.plans.find(p => p.is_bestseller);
                if (apiBestseller) {
                    BESTSELLER_PLAN_ID = apiBestseller.id;
                }
                cachePlans(data.plans);
                displayPlans(data.plans);
                console.log('✅ [PORTAL] Plans loaded:', data.plans.length);
            } else if (!cachedPlans) {
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
                cachePlans(freshPlans);
                displayPlans(freshPlans);
            } catch (err) {
                console.warn('⚠️ Plans fallback failed:', err.message);
                if (!cachedPlans) {
                    showPlansError();
                }
            }
        })
        .finally(() => {
            console.log('🏁 Portal data resolved. routerId:', routerId);
            if (submitButton) {
                submitButton.disabled = false;
                console.log('🔓 Pay button ENABLED');
            }
        });
    
    // Check maintenance mode - show banner and special offer if active
    if (MAINTENANCE_MODE) {
        console.log('🔧 MAINTENANCE MODE ACTIVE');
        console.log('📦 Special Plan:', MAINTENANCE_PLAN);
        initMaintenanceMode();
    }
    
    setupEventListeners();
    setupVoucherUI();
    loadSavedPhoneNumber(); // Works on desktop; mobile captive portals wipe storage
    setupBrandLink(); // Preserve MikroTik params when clicking logo
});

// ========================================
// MAINTENANCE MODE INITIALIZATION
// ========================================
function initMaintenanceMode() {
    // Show maintenance banner and special offer card
    if (maintenanceBanner) maintenanceBanner.classList.remove('hidden');
    if (specialOfferCard) specialOfferCard.classList.remove('hidden');
    
    // Update special offer display with configured values
    const priceEl = document.getElementById('specialOfferPrice');
    const titleEl = document.getElementById('specialOfferTitle');
    
    if (priceEl) priceEl.textContent = `${MAINTENANCE_PLAN.price}/-`;
    if (titleEl) titleEl.textContent = `${MAINTENANCE_PLAN.duration} Access`;
    
    // Setup special offer card click handler
    if (specialOfferCard) {
        specialOfferCard.addEventListener('click', selectMaintenancePlan);
        specialOfferCard.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                selectMaintenancePlan();
            }
        });
    }
}

// ========================================
// SELECT MAINTENANCE PLAN
// ========================================
function selectMaintenancePlan() {
    // Create a plan object compatible with existing payment flow
    selectedPlan = {
        id: MAINTENANCE_PLAN.id,
        duration: MAINTENANCE_PLAN.duration,
        price: MAINTENANCE_PLAN.priceDisplay,
        speed: MAINTENANCE_PLAN.speed,
        popular: false,
        bestseller: false,
        valueMessage: '',
        originalData: {
            id: MAINTENANCE_PLAN.id,
            name: MAINTENANCE_PLAN.name,
            speed: MAINTENANCE_PLAN.speedRaw,
            price: MAINTENANCE_PLAN.price,
            duration_value: 24,
            duration_unit: 'HOURS'
        }
    };
    
    // Update selected plan display
    selectedPlanInfo.innerHTML = `
        <div class="selected-plan-name">${MAINTENANCE_PLAN.name}</div>
        <div class="selected-plan-price"><span class="currency-code">KSH</span> ${MAINTENANCE_PLAN.price}/-</div>
        <div class="selected-plan-speed">${MAINTENANCE_PLAN.duration} • ${MAINTENANCE_PLAN.speed}</div>
    `;
    
    // Show payment section, hide plans section
    showSection(paymentSection);
    hideSection(plansSection);
    
    // Scroll to top smoothly
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Focus on phone input
    setTimeout(() => {
        phoneNumberInput.focus();
    }, 300);
    
    console.log('✅ Selected maintenance plan:', selectedPlan);
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
    
    document.title = `${routerBusinessName} - Get Connected`;
    
    console.log('🏢 Branding updated to:', routerBusinessName);
}

// ========================================
// PAYMENT METHODS — show/hide UI based on router config
// ========================================
function applyPaymentMethods(methods) {
    const hasMpesa   = methods.includes('mpesa');
    const hasVoucher = methods.includes('voucher');

    const voucherSection  = document.getElementById('voucherSection');
    const mpesaSection    = document.getElementById('mpesaSection');
    const mpesaQuickSteps = document.getElementById('mpesaQuickSteps');
    const paymentDivider  = document.getElementById('paymentDivider');

    // Voucher section
    if (voucherSection) {
        voucherSection.classList.toggle('hidden', !hasVoucher);
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
        paymentDivider.classList.toggle('hidden', !(hasMpesa && hasVoucher));
    }

    console.log('💳 Payment methods applied:', methods, '| mpesa:', hasMpesa, '| voucher:', hasVoucher);
}

// ========================================
// SUPPORT PHONE — update all tel: links from router config
// ========================================
function updateSupportPhone(phone) {
    if (!phone) return;
    routerSupportPhone = phone;

    // Update every tel: link in the page
    document.querySelectorAll('a[href^="tel:"]').forEach(link => {
        link.href = `tel:${phone}`;
    });

    console.log('📞 Support phone updated to:', phone);
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
    // 1. Instant display from cache (zero latency for returning users)
    const cached = getCachedPlans();
    if (cached) {
        console.log('⚡ Rendering cached plans instantly');
        displayPlans(cached);
    }

    // 2. Fetch fresh plans from API
    try {
        const freshPlans = await fetchPlansFromAPI(rId);
        cachePlans(freshPlans);
        displayPlans(freshPlans);
        console.log('✅ Plans loaded from API:', freshPlans.length);
    } catch (error) {
        console.warn('⚠️ API plan fetch failed:', error.message);

        if (!cached) {
            showPlansError();
        }
    }
}

async function forceRefreshPlans() {
    plansGrid.innerHTML = `
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
    `;
    localStorage.removeItem(PLANS_CACHE_KEY);
    return loadPlans(routerId);
}

// ========================================
// TRANSFORM API PLANS DATA
// ========================================
function transformPlansData(apiPlans) {
    // First, calculate time-to-price ratio for each plan
    const plansWithRatio = apiPlans.map((plan) => {
        // Convert duration to hours for comparison
        const durationInHours = convertToHours(plan.duration_value, plan.duration_unit);
        
        // Calculate ratio: hours per KSH (higher is better value)
        const timeToPrice = durationInHours / plan.price;
        
        return {
            ...plan,
            durationInHours: durationInHours,
            timeToPrice: timeToPrice
        };
    });
    
    // Find the plan with the best (highest) time-to-price ratio
    const bestPlan = plansWithRatio.reduce((best, current) => {
        return current.timeToPrice > best.timeToPrice ? current : best;
    });
    
    // Transform plans with popularity/bestseller marking
    const transformedPlans = plansWithRatio.map((plan) => {
        // Parse duration
        const duration = formatDuration(plan.duration_value, plan.duration_unit);
        
        // Format price
        const price = `KSH ${plan.price}/-`;
        
        // Format speed
        const speed = formatSpeed(plan.speed);
        
        // Mark plan as bestseller (high revenue generator)
        const bestseller = plan.id === BESTSELLER_PLAN_ID;
        
        // Mark plan as popular if it has the best time-to-price ratio (and not bestseller)
        const popular = plan.id === bestPlan.id && !bestseller;
        
        // Calculate value message
        let valueMessage = '';
        if (bestseller) {
            valueMessage = '🔥 Bestseller';
        } else if (popular) {
            const hours = convertToHours(plan.duration_value, plan.duration_unit);
            const pricePerDay = (plan.price / (hours / 24)).toFixed(0);
            valueMessage = `Only KSH ${pricePerDay}/day`;
        }
        
        return {
            id: plan.id,
            duration: duration,
            price: price,
            speed: speed,
            popular: popular,
            bestseller: bestseller,
            valueMessage: valueMessage,
            // Keep original data for API submission
            originalData: plan
        };
    });
    
    // Sort plans: Bestseller first → Popular (best value) → Others by price (high to low)
    transformedPlans.sort((a, b) => {
        // Bestseller always comes first
        if (a.bestseller && !b.bestseller) return -1;
        if (!a.bestseller && b.bestseller) return 1;
        // Then popular (best value)
        if (a.popular && !b.popular) return -1;
        if (!a.popular && b.popular) return 1;
        // Sort remaining plans by price (highest first)
        const priceA = a.originalData.price;
        const priceB = b.originalData.price;
        return priceB - priceA; // Descending order (high to low)
    });
    
    return transformedPlans;
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
    // Clear skeleton loaders
    plansGrid.innerHTML = '';
    
    plans.forEach(plan => {
        const planCard = createPlanCard(plan);
        plansGrid.appendChild(planCard);
    });
}

// ========================================
// CREATE PLAN CARD - Simplified Design
// ========================================
function createPlanCard(plan) {
    const card = document.createElement('div');
    // Add appropriate class: bestseller, popular, or regular
    let cardClass = 'plan-card';
    if (plan.bestseller) cardClass += ' bestseller';
    else if (plan.popular) cardClass += ' popular';
    card.className = cardClass;
    
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `Select ${plan.duration} plan for ${plan.price}, ${plan.speed}`);
    
    // Format price with smaller currency code
    const formattedPrice = formatPrice(plan.price);
    
    card.innerHTML = `
        <div class="plan-duration">${plan.duration}</div>
        <div class="plan-price">${formattedPrice}</div>
        <div class="plan-speed">${plan.speed}</div>
        ${plan.valueMessage ? `<div class="plan-value-msg">${plan.valueMessage}</div>` : ''}
    `;
    
    // Add click event to the card
    card.addEventListener('click', () => {
        selectPlan(plan);
    });
    
    // Keyboard accessibility
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
    // Split "KSH 30/-" into currency and amount
    const match = price.match(/^(KSH)\s*(.+)$/);
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
    
    // Update selected plan display
    selectedPlanInfo.innerHTML = `
        <div class="selected-plan-name">${plan.duration}</div>
        <div class="selected-plan-price">${formatPrice(plan.price)}</div>
        <div class="selected-plan-speed">${plan.speed}</div>
    `;
    
    // Show payment section, hide plans
    showSection(paymentSection);
    hideSection(plansSection);
    
    // Scroll to top smoothly
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Focus on phone input
    setTimeout(() => {
        phoneNumberInput.focus();
    }, 300);
}

// ========================================
// VOUCHER: VERIFY CODE
// GET /api/public/voucher/verify/{code}
// ========================================
async function verifyVoucher(code) {
    const url = `${VOUCHER_VERIFY_ENDPOINT}/${encodeURIComponent(code.trim())}`;
    console.log('🎟️ [VOUCHER] Verifying code:', code);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(getProxiedUrl(url), {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        mode: 'cors',
        signal: controller.signal
    });

    clearTimeout(timeoutId);

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.detail || 'Invalid voucher code');
    }

    console.log('✅ [VOUCHER] Verification result:', data);
    return data;
}

// ========================================
// VOUCHER: REDEEM CODE
// POST /api/public/voucher/redeem
// ========================================
async function redeemVoucher(code, macAddress, rId) {
    console.log('🎟️ [VOUCHER] Redeeming code:', code);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const requestBody = {
        code: code.trim(),
        mac_address: macAddress,
        router_id: String(rId)
    };

    console.log('📤 [VOUCHER] Redeem request:', requestBody);

    const response = await fetch(getProxiedUrl(VOUCHER_REDEEM_ENDPOINT), {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        mode: 'cors',
        body: JSON.stringify(requestBody),
        signal: controller.signal
    });

    clearTimeout(timeoutId);

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.detail || data.message || 'Failed to redeem voucher');
    }

    console.log('✅ [VOUCHER] Redeem result:', data);
    return data;
}

// ========================================
// VOUCHER: UI SETUP & HANDLERS
// ========================================
let verifiedVoucher = null; // stores the verified voucher data

function setupVoucherUI() {
    const input = document.getElementById('voucherCodeInput');
    const verifyBtn = document.getElementById('voucherVerifyBtn');
    const verifyText = verifyBtn?.querySelector('.voucher-verify-text');
    const verifyLoader = document.getElementById('voucherVerifyLoader');
    const result = document.getElementById('voucherResult');

    if (!input || !verifyBtn) return;

    // Auto-format: allow alphanumeric and dashes
    input.addEventListener('input', () => {
        input.value = input.value.replace(/[^a-zA-Z0-9\-]/g, '');
        if (result) result.classList.add('hidden');
        verifiedVoucher = null;
    });

    // Enter key triggers verify
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            verifyBtn.click();
        }
    });

    // Verify button click
    verifyBtn.addEventListener('click', async () => {
        const code = input.value.trim();
        if (!code) {
            input.focus();
            return;
        }

        verifyBtn.disabled = true;
        if (verifyText) verifyText.classList.add('hidden');
        if (verifyLoader) verifyLoader.classList.remove('hidden');
        result.classList.add('hidden');
        verifiedVoucher = null;

        try {
            const data = await verifyVoucher(code);
            verifiedVoucher = data;
            showVoucherValid(data);
        } catch (err) {
            showVoucherError(err.message);
        } finally {
            verifyBtn.disabled = false;
            if (verifyText) verifyText.classList.remove('hidden');
            if (verifyLoader) verifyLoader.classList.add('hidden');
        }
    });
}

function showVoucherValid(data) {
    const result = document.getElementById('voucherResult');
    if (!result) return;

    const price = data.price != null ? `KSH ${data.price}/-` : 'Free';
    const speed = data.speed || '—';
    const duration = data.duration || '—';

    result.innerHTML = `
        <div class="voucher-result-valid">
            <div class="voucher-plan-header">
                <span class="voucher-plan-check">✓</span>
                <div>
                    <div class="voucher-plan-label">Valid Voucher</div>
                    <div class="voucher-plan-name">${data.plan_name || 'Internet Plan'}</div>
                </div>
            </div>
            <div class="voucher-plan-details">
                <div class="voucher-plan-stat">
                    <span class="voucher-plan-stat-label">Duration</span>
                    <span class="voucher-plan-stat-value">${duration}</span>
                </div>
                <div class="voucher-plan-stat">
                    <span class="voucher-plan-stat-label">Speed</span>
                    <span class="voucher-plan-stat-value">${speed}</span>
                </div>
                <div class="voucher-plan-stat">
                    <span class="voucher-plan-stat-label">Value</span>
                    <span class="voucher-plan-stat-value">${price}</span>
                </div>
            </div>
            <button type="button" class="voucher-redeem-btn" id="voucherRedeemBtn">
                <span>📶</span>
                <span class="voucher-redeem-text">Redeem & Connect</span>
                <span class="voucher-redeem-loader hidden" id="voucherRedeemLoader">
                    <span class="loader-spinner"></span> Activating...
                </span>
            </button>
        </div>
    `;

    result.classList.remove('hidden');

    // Wire up redeem button
    const redeemBtn = document.getElementById('voucherRedeemBtn');
    if (redeemBtn) {
        redeemBtn.addEventListener('click', handleVoucherRedeem);
    }
}

function showVoucherError(message) {
    const result = document.getElementById('voucherResult');
    if (!result) return;

    result.innerHTML = `
        <div class="voucher-result-error">
            <span class="voucher-error-icon">✕</span>
            <span class="voucher-error-text">${message}</span>
        </div>
    `;

    result.classList.remove('hidden');
}

async function handleVoucherRedeem() {
    if (!verifiedVoucher) return;

    const redeemBtn = document.getElementById('voucherRedeemBtn');
    const redeemText = redeemBtn?.querySelector('.voucher-redeem-text');
    const redeemLoader = document.getElementById('voucherRedeemLoader');

    // Loading state
    if (redeemBtn) redeemBtn.disabled = true;
    if (redeemText) redeemText.classList.add('hidden');
    if (redeemLoader) redeemLoader.classList.remove('hidden');

    try {
        const macAddress = mikrotikParams.mac || 'AA:BB:CC:DD:EE:FF';
        const rId = routerId || verifiedVoucher.router_id || FALLBACK_ROUTER_ID;
        const data = await redeemVoucher(verifiedVoucher.code, macAddress, rId);

        console.log('✅ [VOUCHER] Redeemed successfully:', data);

        // RADIUS auto-login if credentials returned
        if (data.radius_username && data.radius_password) {
            const loginUrl = buildRadiusLoginUrl(mikrotikParams.gw, data.radius_username, data.radius_password, mikrotikParams.dst);
            if (loginUrl) {
                try {
                    localStorage.setItem('bitwave_last_radius_login', JSON.stringify({
                        loginUrl, username: data.radius_username,
                        password: data.radius_password, gateway: mikrotikParams.gw,
                        dst: mikrotikParams.dst, mac: macAddress,
                        planName: verifiedVoucher.plan_name || 'Voucher Plan',
                        expiry: data.expiry,
                        savedAt: new Date().toISOString()
                    }));
                } catch (e) { /* ignore */ }

                hideSection(plansSection);
                showSection(successSection);
                showVoucherSuccessDetails(data);
                window.scrollTo({ top: 0, behavior: 'smooth' });

                setTimeout(() => { window.location.href = loginUrl; }, 2000);
                return;
            }
        }

        // Non-RADIUS success: show success screen
        hideSection(plansSection);
        showSection(successSection);
        showVoucherSuccessDetails(data);
        window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (err) {
        console.error('❌ [VOUCHER] Redeem failed:', err.message);
        showVoucherError(err.message);
    } finally {
        if (redeemBtn) redeemBtn.disabled = false;
        if (redeemText) redeemText.classList.remove('hidden');
        if (redeemLoader) redeemLoader.classList.add('hidden');
    }
}

function showVoucherSuccessDetails(data) {
    const connectionDetails = document.getElementById('connectionDetails');
    if (!connectionDetails) return;

    const expiryDate = data.expiry ? new Date(data.expiry) : null;
    const expiryText = expiryDate ? expiryDate.toLocaleDateString('en-KE', {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi'
    }) : 'N/A';

    let html = `
        <div class="detail-row">
            <span class="detail-label">Plan</span>
            <span class="detail-value">${data.plan_name || verifiedVoucher?.plan_name || 'Voucher Plan'}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Method</span>
            <span class="detail-value">Voucher Code</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">Valid Until</span>
            <span class="detail-value">${expiryText}</span>
        </div>
    `;

    if (data.radius_username && data.radius_password) {
        const loginUrl = buildRadiusLoginUrl(mikrotikParams.gw, data.radius_username, data.radius_password, mikrotikParams.dst);
        html += `
        <div class="detail-row" style="margin-top: 14px; padding: 12px; background: #111827; border-radius: 8px; color: #fff;">
            <div style="width:100%;">
                <div style="font-weight: 600; margin-bottom: 6px;">Login Credentials</div>
                <div style="font-size: 13px; opacity: 0.85;">Username: <strong>${data.radius_username}</strong></div>
                <div style="font-size: 13px; opacity: 0.85;">Password: <strong>${data.radius_password}</strong></div>
                ${loginUrl ? `
                <div style="margin-top: 10px;">
                    <a href="${loginUrl}" style="display: inline-block; padding: 8px 12px; background: #10b981; color: #fff; border-radius: 6px; text-decoration: none; font-weight: 600;">Tap to Connect</a>
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
        
        // Limit to 10 digits (allows both 9-digit and 10-digit formats)
        if (value.length > 10) {
            value = value.substring(0, 10);
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
        alert('Please enter a valid phone number (e.g., 0712345678 or 712345678)');
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
    
    // Format phone number for M-Pesa (convert 07xxx to 2547xxx)
    const formattedPhone = formatPhoneForMpesa(phoneNumber);
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
                const statusUrl = `${statusEndpoint}/${customerId}`;
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
                            showAuthenticatedMessage(phoneNumber, plan, data, true); // true = isRadius
                            
                            // Redirect to MikroTik login after a short delay
                            setTimeout(() => {
                                console.log('🔐 [RADIUS] Redirecting to MikroTik login...');
                                window.location.href = loginUrl;
                            }, 2000); // 2 second delay to show success message
                            
                            resolve(data);
                            return;
                        } else {
                            console.warn('⚠️ [RADIUS] No gateway IP available, cannot auto-login');
                            console.warn('⚠️ [RADIUS] User will need to login manually');
                        }
                    }
                    
                    // Show final success message (for non-RADIUS or if auto-login not possible)
                    showAuthenticatedMessage(phoneNumber, plan, data);
                    
                    resolve(data);
                } else if (data.status === 'pending') {
                    // Payment is still pending
                    console.log(`⏳ Payment status: pending. Retrying in ${PAYMENT_POLL_INTERVAL/1000}s...`);
                    console.log(`🔄 Attempt ${attempts}/${PAYMENT_POLL_MAX_ATTEMPTS}`);
                    
                    if (attempts >= PAYMENT_POLL_MAX_ATTEMPTS) {
                        clearInterval(pollInterval);
                        console.warn('⏱️ Polling timeout - max attempts reached');
                        reject(new Error('Payment verification timeout. Please check your M-Pesa messages and try again, or contact support if payment was deducted.'));
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
function showAuthenticatedMessage(phoneNumber, plan, data, isRadiusAutoLogin = false) {
    const formattedPhone = formatPhoneForMpesa(phoneNumber);
    
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
            <div class="detail-row">
                <span class="detail-label">Speed</span>
                <span class="detail-value">${plan.speed || 'Standard'}</span>
            </div>
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
                <div style="font-size: 13px; opacity: 0.9; margin-top: 4px;">You will be redirected to login in 2 seconds</div>
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
    const formattedPhone = formatPhoneForMpesa(phoneNumber);
    
    // Update processing section UI
    if (processingTitle) {
        processingTitle.textContent = 'Check Your Phone';
    }
    if (processingSubtext) {
        processingSubtext.textContent = 'Enter your M-Pesa PIN to complete payment';
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
    // Kenya format - either:
    // 1. 10 digits starting with 07 or 01 (e.g., 0712345678, 0112345678)
    // 2. 9 digits starting with 7 or 1 (e.g., 712345678, 112345678)
    const tenDigitRegex = /^0[17][0-9]{8}$/;  // 0712345678 or 0112345678
    const nineDigitRegex = /^[17][0-9]{8}$/;   // 712345678 or 112345678
    
    return tenDigitRegex.test(phoneNumber) || nineDigitRegex.test(phoneNumber);
}

// ========================================
// PHONE NUMBER FORMATTING for M-Pesa
// ========================================
function formatPhoneForMpesa(phoneNumber) {
    // Convert Kenyan format to international format
    // Input: 0795635364 or 795635364 or 0112345678 or 112345678
    // Output: 254795635364 or 254112345678
    
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


