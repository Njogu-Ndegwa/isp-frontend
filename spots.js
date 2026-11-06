// ========================================
// ADS SERVICE - Bitwave Soko WiFi
// Handles ad fetching, display, and click tracking
// ========================================

// ========================================
// BACKEND API CONFIGURATION
// ========================================
const ADS_API_BASE_URL = 'https://isp.bitwavetechnologies.com/api';
// Neutral paths: ad blockers block URLs like /ads and /ads/click, and hide
// elements named like them. tests/neutral-names.spec.js keeps those words out.
// The backend's old /api/ads paths stay only for pages cached on phones.
const ADS_ENDPOINT = `${ADS_API_BASE_URL}/public/spots`;
const AD_CLICK_ENDPOINT = `${ADS_API_BASE_URL}/public/spots/tap`;
const AD_IMPRESSION_ENDPOINT = `${ADS_API_BASE_URL}/public/spots/seen`;

// Resolves a URL through the global fallback state set by script.js
function resolveAdsUrl(url) {
    const fb = window.__apiFallback;
    if (fb && fb.active) {
        return url.replace(fb.primary, fb.fallback);
    }
    return url;
}

// Note: Backend API format from https://isp.bitwavetechnologies.com/api/public/spots

// ========================================
// DATA TRANSFER OBJECTS (DTOs)
// These define the structure of data exchanged with the backend
// API Base: https://isp.bitwavetechnologies.com/api
// ========================================

/**
 * Ad DTO - Structure of an ad from the backend
 * 
 * GET /api/public/spots Response:
 * {
 *   "ads": [
 *     {
 *       "id": 1,
 *       "title": "Fresh Tomatoes",
 *       "description": "Farm-fresh tomatoes picked daily from Kiambu",
 *       "image_url": "https://res.cloudinary.com/dhffnvn2d/image/upload/...",
 *       "seller_name": "Mama Njeri",
 *       "seller_location": "Stall 42, Section A",
 *       "phone_number": "0712345678",
 *       "whatsapp_number": "254712345678",
 *       "price": "KSH 80/kg",
 *       "price_value": 80.0,
 *       "badge_type": "hot",              // "hot", "new", "sale", or null
 *       "badge_text": "🔥 Hot",
 *       "category": "produce",
 *       "is_active": true,
 *       "priority": 1,
 *       "views_count": 1,
 *       "clicks_count": 1,
 *       "created_at": "2026-01-17T08:35:37.190605",
 *       "expires_at": "2026-02-15T10:30:00",
 *       "advertiser_id": 1
 *     }
 *   ],
 *   "pagination": {
 *     "page": 1,
 *     "per_page": 20,
 *     "total": 1,
 *     "total_pages": 1
 *   }
 * }
 */

/**
 * Ad Click Event DTO - What we POST when user clicks an ad
 * 
 * POST /api/public/spots/tap
 * {
 *   "ad_id": 1,
 *   "click_type": "whatsapp",           // "view_details", "call", "whatsapp"
 *   "device_id": "dev_abc123",          // Anonymous device identifier
 *   "user_agent": "Mozilla/5.0...",
 *   "session_id": "sess_xyz789",
 *   "referrer": "wifi_portal",
 *   "mac_address": "AA:BB:CC:DD:EE:FF"  // From MikroTik params
 * }
 */

/**
 * Ad Impression Event DTO - What we POST when ad is displayed
 * 
 * POST /api/public/spots/seen
 * {
 *   "ad_ids": [1],                      // Array of ad IDs shown
 *   "device_id": "dev_abc123",
 *   "session_id": "sess_xyz789",
 *   "placement": "showcase_carousel"    // Where the ads were shown
 * }
 */

// ========================================
// STATE MANAGEMENT
// ========================================
let adsData = [];
let sessionId = generateSessionId();
let deviceId = getOrCreateDeviceId();

// ========================================
// LOCAL PRIMARY IMAGES
// These ads use local images as the primary source (not CDN)
// Using WebP for better performance (80% smaller than PNG)
// ========================================
const AD_LOCAL_IMAGES = {
    9: 'images/Internet-Technician.webp', // Fast Home Wi-Fi Installation
    10: 'images/Onions.webp'              // Fresh Onions
};

// Fallback to PNG if WebP not created yet
const AD_LOCAL_IMAGES_FALLBACK = {
    9: 'images/Internet-Technician.png'
};

/**
 * Process ads to use local images where configured
 * Call this after fetching ads from API
 * Tries WebP first for better performance, falls back to PNG
 */
function applyLocalImages(ads) {
    return ads.map(ad => {
        if (AD_LOCAL_IMAGES[ad.id]) {
            console.log(`🖼️ Using local image for ad #${ad.id}: ${AD_LOCAL_IMAGES[ad.id]}`);
            return { 
                ...ad, 
                image_url: AD_LOCAL_IMAGES[ad.id],
                image_fallback: AD_LOCAL_IMAGES_FALLBACK[ad.id] // PNG fallback
            };
        }
        return ad;
    });
}

// ========================================
// WHEN A PHOTO IS MISSING OR WON'T LOAD
// The same neutral tile as the installed app (pwa.js). It is inline, so it also
// works behind the walled garden, where a CDN photo often can't load.
// ========================================
const AD_BLANK_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect fill='%23f5f5f5' width='100' height='100'/%3E%3Ctext x='50' y='55' text-anchor='middle' font-size='30'%3E%F0%9F%9B%92%3C/text%3E%3C/svg%3E";

function adImageSrc(ad) {
    return ad.image_url || ad.poster_url || AD_BLANK_IMAGE;
}

/**
 * A photo that fails ends on the neutral tile, never on a broken-picture icon.
 * @param {HTMLImageElement} imgElement - The image element
 * @param {number} adId - Ad ID, for the local PNG twin of a local WebP
 */
function setupImageFallback(imgElement, adId) {
    if (!imgElement) return;

    imgElement.onerror = function() {
        if (!this.dataset.pngAttempted && AD_LOCAL_IMAGES_FALLBACK[adId]) {
            this.dataset.pngAttempted = 'true';
            this.src = AD_LOCAL_IMAGES_FALLBACK[adId];
            return;
        }
        this.onerror = null;
        this.src = AD_BLANK_IMAGE;
    };
}

// ========================================
// UTILITY FUNCTIONS
// ========================================
function generateSessionId() {
    return 'sess_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function getOrCreateDeviceId() {
    let deviceId = localStorage.getItem('bitwave_device_id');
    if (!deviceId) {
        deviceId = 'dev_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('bitwave_device_id', deviceId);
    }
    return deviceId;
}

function formatPhoneForCall(phone) {
    // Remove any spaces or special characters
    return phone.replace(/[\s\-\(\)]/g, '');
}

function formatPhoneForWhatsApp(phone) {
    let cleaned = phone.replace(/[\s\-\(\)]/g, '');
    // Convert to international format if needed
    if (cleaned.startsWith('0')) {
        cleaned = '254' + cleaned.substring(1);
    }
    if (cleaned.startsWith('+')) {
        cleaned = cleaned.substring(1);
    }
    return cleaned;
}

// ========================================
// OPTIONAL FIELDS
// Only title, seller and phone are required on the ad form. Everything else can
// be null, so every list passes through cleanAds() on its way in: from there on
// each field is a plain string, '' when missing, and no surface has to check.
// One ad that makes no sense is dropped here and the rest carry on.
// ========================================
const AD_TEXT_FIELDS = ['title', 'description', 'seller_name', 'seller_location', 'price', 'image_url',
    'video_url', 'poster_url', 'badge_type', 'badge_text', 'category', 'placement', 'media_type',
    'image_fit', 'bg_color', 'slot'];

function adText(value) {
    if (typeof value !== 'string' && typeof value !== 'number') return '';
    const text = String(value).trim();
    return /^(null|undefined)$/i.test(text) ? '' : text;
}

function adPhone(value) {
    const phone = adText(value).replace(/[^\d+]/g, '');
    return /\d/.test(phone) ? phone : '';
}

function cleanAds(list) {
    const ads = [];
    (Array.isArray(list) ? list : []).forEach(raw => {
        const id = raw && typeof raw === 'object' ? parseInt(raw.id, 10) : NaN;
        if (!(id > 0)) return;
        const ad = { ...raw, id };
        AD_TEXT_FIELDS.forEach(field => { ad[field] = adText(raw[field]); });
        ad.phone_number = adPhone(raw.phone_number);
        ad.whatsapp_number = adPhone(raw.whatsapp_number);
        if (ad.title || ad.seller_name || ad.image_url || ad.video_url) ads.push(ad);
    });
    return ads;
}

// Builds one thing per ad. An ad that still throws is left out, not the row.
function eachAd(ads, build) {
    const built = [];
    ads.forEach((ad, index) => {
        try {
            built.push(build(ad, index));
        } catch (error) {
            console.warn('⚠️ Skipped ad #' + (ad && ad.id) + ':', error.message);
        }
    });
    return built;
}

function adLabel(ad) {
    return adEsc(ad.title || ad.seller_name || 'this offer');
}

// ========================================
// FETCH ADS FROM BACKEND
// ========================================
async function fetchAds() {
    console.log('📢 Fetching ads from backend...');
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(resolveAdsUrl(ADS_ENDPOINT), {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            mode: 'cors',
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }
        
        const apiResponse = await response.json();
        
        // API returns { ads: [...], pagination: {...} }
        const apiAds = cleanAds(apiResponse.ads || apiResponse);
        console.log('✅ Ads fetched from API:', apiAds.length, 'ads');
        console.log('📊 Pagination:', apiResponse.pagination);
        
        if (apiAds.length > 0) {
            adsData = applyLocalImages(apiAds);
            if (window._portalShowAds === false) {
                hideAdSections();
            } else {
                showAdSections();
                renderAds(adsData);
                recordImpression(adsData.map(ad => ad.id));
            }
            return adsData;
        }
        
        // No ads from backend - hide all ad sections
        console.log('📭 No ads from backend - hiding ad sections');
        adsData = [];
        hideAdSections();
        return [];
        
    } catch (error) {
        console.warn('⚠️ Could not fetch ads from API:', error.message);
        // No fallback to hardcoded - hide ad sections instead
        console.log('📭 API error - hiding ad sections');
        adsData = [];
        hideAdSections();
        return [];
    }
}

// ========================================
// HIDE AD SECTIONS (no ads, ads switched off, or the request failed)
// Nothing asks customers to advertise: with no ad the login page goes straight
// from the header to the steps. index.html starts these hidden too, so they
// never flash while the answer is on its way.
// ========================================
function hideAdSections() {
    ['.spots-showcase', '.pay-spot', '.done-spots'].forEach(selector => {
        const section = document.querySelector(selector);
        if (section) section.style.display = 'none';
    });
}

// ========================================
// SHOW ALL AD SECTIONS (when ads are available)
// ========================================
function showAdSections() {
    // Never show ads if the portal has disabled them
    if (window._portalShowAds === false) {
        hideAdSections();
        return;
    }

    const showcaseSection = document.querySelector('.spots-showcase');
    if (showcaseSection) showcaseSection.style.display = '';

    
    const paymentAd = document.querySelector('.pay-spot');
    if (paymentAd) paymentAd.style.display = '';

    const successAds = document.querySelector('.done-spots');
    if (successAds) successAds.style.display = '';


    console.log('👁️ All ad sections visible');
}

// ========================================
// RENDER ADS IN SHOWCASE
// ========================================
function renderAds(ads) {
    const showcaseScroll = document.getElementById('showcaseScroll');
    const showcaseSection = document.querySelector('.spots-showcase');
    
    if (!showcaseScroll) {
        console.warn('⚠️ Showcase scroll element not found');
        return;
    }
    
    showcaseScroll.querySelectorAll('.spot-card').forEach(card => card.remove());

    if (!ads || ads.length === 0) return;

    if (showcaseSection) showcaseSection.style.display = '';

    eachAd(ads, createAdCard).forEach(card => showcaseScroll.appendChild(card));

    console.log('🎨 Rendered', ads.length, 'ads in showcase');
}

// ========================================
// CREATE AD CARD ELEMENT
// ========================================
function createAdCard(ad, index) {
    const card = document.createElement('div');
    card.className = 'spot-card';
    card.setAttribute('data-spot-id', ad.id);
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `View details for ${ad.title || ad.seller_name || 'this offer'}`);
    
    // Badge HTML
    let badgeHtml = '';
    if (ad.badge_type && ad.badge_text) {
        badgeHtml = `<span class="product-badge ${adEsc(ad.badge_type)}">${adEsc(ad.badge_text)}</span>`;
    }
    
    // First 2 images are above the fold - don't lazy load, prioritize first one
    const loadingAttr = index < 2 ? '' : 'loading="lazy"';
    const priorityAttr = index === 0 ? 'fetchpriority="high"' : '';
    
    // Location is optional, and only its first part fits on the card.
    const seller = [ad.seller_name, ad.seller_location.split(',')[0].trim()].filter(Boolean).join(' - ');

    card.innerHTML = `
        <div class="product-image">
            <img src="${adEsc(adImageSrc(ad))}" alt="${adEsc(ad.title)}" ${loadingAttr} ${priorityAttr}>
            ${badgeHtml}
        </div>
        <div class="product-info">
            ${ad.title ? `<h4 class="product-name">${adEsc(ad.title)}</h4>` : ''}
            ${seller ? `<p class="product-seller">${adEsc(seller)}</p>` : ''}
            ${ad.price ? `<p class="product-price">${adEsc(ad.price)}</p>` : ''}
        </div>
    `;

    // Setup image fallback for walled garden restrictions
    const imgElement = card.querySelector('img');
    setupImageFallback(imgElement, ad.id);
    
    // Click handler
    card.addEventListener('click', () => {
        openAdDetails(ad);
        recordClick(ad.id, 'view_details');
    });
    
    // Keyboard accessibility
    card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openAdDetails(ad);
            recordClick(ad.id, 'view_details');
        }
    });
    
    // Animation delay for staggered entrance
    card.style.animationDelay = `${index * 50}ms`;
    
    return card;
}

// ========================================
// OPEN AD DETAILS MODAL
// ========================================
function openAdDetails(ad) {
    const overlay = document.getElementById('spotSheetOverlay');
    const modal = document.getElementById('spotSheet');
    
    if (!overlay || !modal) {
        console.error('❌ Ad modal elements not found');
        return;
    }
    
    // Populate modal content
    const modalImg = document.getElementById('spotSheetImg');
    // The sheet is reused from ad to ad, so its fallback starts over each time.
    modalImg.dataset.pngAttempted = '';
    setupImageFallback(modalImg, ad.id);
    modalImg.src = adImageSrc(ad);
    modalImg.alt = ad.title;

    // A row with nothing to say is left out, and comes back for the next ad.
    const fillRow = (id, text, row) => {
        const el = document.getElementById(id);
        el.textContent = text;
        (row ? el.closest(row) : el).style.display = text ? '' : 'none';
    };
    fillRow('spotSheetTitle', ad.title);
    fillRow('spotSheetDescription', ad.description);
    fillRow('spotSheetSeller', ad.seller_name);
    fillRow('spotSheetLocation', ad.seller_location);
    document.querySelector('.spot-sheet-seller').style.display = (ad.seller_name || ad.seller_location) ? '' : 'none';
    fillRow('spotSheetPrice', ad.price, '.spot-sheet-price-section');
    document.getElementById('spotSheetViews').innerHTML = `👁️ <span>${ad.views_count || 0}</span> views`;
    document.getElementById('spotSheetId').textContent = `Ad #${ad.id}`;
    
    // Badge
    const badgeEl = document.getElementById('spotSheetBadge');
    if (ad.badge_type && ad.badge_text) {
        badgeEl.textContent = ad.badge_text;
        badgeEl.className = `spot-sheet-badge ${ad.badge_type}`;
        badgeEl.style.display = 'block';
    } else {
        badgeEl.style.display = 'none';
    }
    
    // Phone call link
    const callBtn = document.getElementById('spotSheetCallBtn');
    callBtn.closest('.spot-sheet-contact').style.display = ad.phone_number ? '' : 'none';
    callBtn.href = ad.phone_number ? `tel:${formatPhoneForCall(ad.phone_number)}` : '#';
    callBtn.onclick = () => recordClick(ad.id, 'call');
    
    // Show modal
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // If something (an ad blocker's cosmetic filter) still hides the sheet, the
    // overlay would leave a dimmed screen with nothing in it and scrolling
    // locked. Back out instead, so the portal stays usable.
    if (!modal.offsetWidth) {
        closeAdDetails();
        return;
    }

    // Focus management
    setTimeout(() => {
        document.getElementById('spotSheetClose').focus();
    }, 100);
    
    console.log('📖 Opened ad details:', ad.title);
}

// ========================================
// OPEN AD DETAILS BY ID - Helper for onclick handlers
// ========================================
function openAdDetailsById(adId) {
    if (adsData.length === 0) {
        console.warn('⚠️ No ads available');
        return;
    }
    
    const ad = adsData.find(a => a.id === adId);
    
    if (ad) {
        openAdDetails(ad);
        recordClick(ad.id, 'view_details');
    } else {
        console.warn('⚠️ Ad not found with id:', adId);
    }
}

// Make it available globally for onclick handlers
window.openAdDetailsById = openAdDetailsById;
window.openAdDetails = openAdDetails;

// ========================================
// CLOSE AD DETAILS MODAL
// ========================================
function closeAdDetails() {
    const overlay = document.getElementById('spotSheetOverlay');
    
    if (overlay) {
        overlay.classList.add('hidden');
        document.body.style.overflow = '';
    }
}

// ========================================
// RECORD AD CLICK - Analytics
// POST https://isp.bitwavetechnologies.com/api/public/spots/tap
// ========================================
async function recordClick(adId, clickType, placement = 'local') {
    console.log(`📊 Recording click: Ad #${adId}, Type: ${clickType}`);
    
    // DTO format expected by backend:
    // {
    //   "ad_id": 1,
    //   "click_type": "whatsapp",  // "view_details", "call", "whatsapp"
    //   "device_id": "dev_abc123",
    //   "user_agent": "Mozilla/5.0...",
    //   "session_id": "sess_xyz789",
    //   "referrer": "wifi_portal",
    //   "mac_address": "AA:BB:CC:DD:EE:FF"
    // }
    const clickData = {
        ad_id: adId,
        click_type: clickType,
        device_id: deviceId,
        user_agent: navigator.userAgent,
        session_id: sessionId,
        referrer: 'wifi_portal',
        mac_address: (typeof mikrotikParams !== 'undefined' && mikrotikParams?.mac) || null,
        // Where the tap happened and on which hotspot: what the advertiser
        // is billed by, and what the reseller's share is worked out from.
        placement,
        router_identity: (typeof mikrotikParams !== 'undefined' && mikrotikParams?.router) || null
    };
    
    try {
        const response = await fetch(resolveAdsUrl(AD_CLICK_ENDPOINT), {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            mode: 'cors',
            body: JSON.stringify(clickData)
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('✅ Click recorded:', result);
        } else {
            console.warn('⚠️ Failed to record click:', response.status);
        }
    } catch (error) {
        console.warn('⚠️ Could not record click:', error.message);
        storeClickLocally(clickData);
    }
}

// ========================================
// RECORD AD IMPRESSION - Analytics
// POST https://isp.bitwavetechnologies.com/api/public/spots/seen
// ========================================
async function recordImpression(adIds, placement = 'showcase_carousel') {
    console.log(`📊 Recording impression for ${adIds.length} ads`);
    
    // DTO format expected by backend:
    // {
    //   "ad_ids": [1],
    //   "device_id": "dev_abc123",
    //   "session_id": "sess_xyz789",
    //   "placement": "showcase_carousel"
    // }
    const impressionData = {
        ad_ids: adIds,
        device_id: deviceId,
        session_id: sessionId,
        placement,
        // The backend counts one view per ad, placement and phone per day;
        // the MAC is how it knows two loads came from the same phone.
        mac_address: (typeof mikrotikParams !== 'undefined' && mikrotikParams?.mac) || null,
        router_identity: (typeof mikrotikParams !== 'undefined' && mikrotikParams?.router) || null
    };
    
    try {
        const response = await fetch(resolveAdsUrl(AD_IMPRESSION_ENDPOINT), {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            mode: 'cors',
            body: JSON.stringify(impressionData)
        });
        
        if (response.ok) {
            console.log('✅ Impression recorded');
        }
    } catch (error) {
        console.warn('⚠️ Could not record impression:', error.message);
    }
}

// ========================================
// LOCAL STORAGE FOR OFFLINE CLICKS
// ========================================
function storeClickLocally(clickData) {
    try {
        const pendingClicks = JSON.parse(localStorage.getItem('bitwave_pending_clicks') || '[]');
        pendingClicks.push(clickData);
        localStorage.setItem('bitwave_pending_clicks', JSON.stringify(pendingClicks));
        console.log('💾 Click stored locally for retry');
    } catch (error) {
        console.warn('⚠️ Could not store click locally:', error);
    }
}

// Retry sending stored clicks
async function retryPendingClicks() {
    try {
        const pendingClicks = JSON.parse(localStorage.getItem('bitwave_pending_clicks') || '[]');
        if (pendingClicks.length === 0) return;
        
        console.log(`🔄 Retrying ${pendingClicks.length} pending clicks...`);
        
        const successfulClicks = [];
        
        for (const click of pendingClicks) {
            try {
                const response = await fetch(resolveAdsUrl(AD_CLICK_ENDPOINT), {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    mode: 'cors',
                    body: JSON.stringify(click)
                });
                
                if (response.ok) {
                    successfulClicks.push(click);
                }
            } catch (e) {
                // Keep for next retry
            }
        }
        
        // Remove successful clicks from pending
        const remainingClicks = pendingClicks.filter(c => !successfulClicks.includes(c));
        localStorage.setItem('bitwave_pending_clicks', JSON.stringify(remainingClicks));
        
        if (successfulClicks.length > 0) {
            console.log(`✅ Sent ${successfulClicks.length} pending clicks`);
        }
    } catch (error) {
        console.warn('⚠️ Error retrying pending clicks:', error);
    }
}

// ========================================
// MODAL EVENT LISTENERS
// ========================================
function setupModalListeners() {
    const overlay = document.getElementById('spotSheetOverlay');
    const closeBtn = document.getElementById('spotSheetClose');
    
    if (closeBtn) {
        closeBtn.addEventListener('click', closeAdDetails);
    }
    
    if (overlay) {
        // Close on overlay click (outside modal)
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeAdDetails();
            }
        });
    }
    
    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAdDetails();
        }
    });
}

// ========================================
// POPULATE SUCCESS PAGE ADS
// ========================================
function populateSuccessAds() {
    const container = document.getElementById('doneSpotsScroll');
    const successAdsSection = document.querySelector('.done-spots');

    if (!container) return;

    if (window._heroAdsActive) {
        try {
            renderSuccessSponsor();
        } catch (error) {
            console.warn('⚠️ Sponsor card not shown:', error.message);
        }
    }

    // No ads available - hide the section
    if (adsData.length === 0 || window._portalShowAds === false) {
        if (successAdsSection) {
            successAdsSection.style.display = 'none';
        }
        console.log('📭 No ads - hiding success page ads section');
        return;
    }
    
    // Show section and populate
    if (successAdsSection) {
        successAdsSection.style.display = '';
    }
    
    // Shuffle and take up to 6 ads
    const shuffled = [...adsData].sort(() => Math.random() - 0.5).slice(0, 6);
    
    container.innerHTML = eachAd(shuffled, ad => `
        <div class="done-spot-card" onclick="openAdDetailsById(${ad.id})" role="button" tabindex="0"
             aria-label="View details for ${adLabel(ad)}" data-spot-id="${ad.id}">
            <img src="${adEsc(adImageSrc(ad))}" alt="${adEsc(ad.title)}" class="done-spot-img" loading="lazy">
            <div class="done-spot-info">
                <div class="done-spot-title">${adEsc(ad.title || ad.seller_name)}</div>
                ${ad.price ? `<div class="done-spot-price">${adEsc(ad.price)}</div>` : ''}
            </div>
        </div>
    `).join('');
    
    // Setup image fallbacks for walled garden restrictions
    container.querySelectorAll('.done-spot-card').forEach(card => {
        const img = card.querySelector('img');
        const adId = parseInt(card.dataset.spotId, 10);
        setupImageFallback(img, adId);
        
        // Add keyboard accessibility
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                card.click();
            }
        });
    });
    
    console.log('🎨 Populated success page with', shuffled.length, 'ads');
}

// Make it available globally for script.js
window.populateSuccessAds = populateSuccessAds;

// ========================================
// POPULATE MINI PRODUCTS (Payment Section Ads)
// ========================================
function populateMiniProducts() {
    const container = document.getElementById('miniProducts');
    const paymentAdSection = document.querySelector('.pay-spot');

    if (!container) return;

    // Hero mode keeps the phone-number form free of ads; the sponsor plays
    // on the processing screen instead.
    if (window._heroAdsActive) {
        if (paymentAdSection) paymentAdSection.style.display = 'none';
        return;
    }

    // No ads available - hide the section
    if (adsData.length === 0 || window._portalShowAds === false) {
        if (paymentAdSection) {
            paymentAdSection.style.display = 'none';
        }
        console.log('📭 No ads - hiding payment section ads');
        return;
    }
    
    // Show section and populate
    if (paymentAdSection) {
        paymentAdSection.style.display = '';
    }
    
    // Shuffle and take up to 4 ads
    const shuffled = [...adsData].sort(() => Math.random() - 0.5).slice(0, 4);
    
    container.innerHTML = eachAd(shuffled, ad => `
        <div class="mini-product" onclick="openAdDetailsById(${ad.id})" role="button" tabindex="0"
             aria-label="View details for ${adLabel(ad)}" style="cursor: pointer;" data-spot-id="${ad.id}">
            <img src="${adEsc(adImageSrc(ad))}" alt="${adEsc(ad.title)}" loading="lazy">
            ${ad.price ? `<span>${adEsc(ad.price)}</span>` : ''}
        </div>
    `).join('');
    
    // Setup image fallbacks and keyboard accessibility
    container.querySelectorAll('.mini-product').forEach(product => {
        const img = product.querySelector('img');
        const adId = parseInt(product.dataset.spotId, 10);
        setupImageFallback(img, adId);
        
        product.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                product.click();
            }
        });
    });
    
    console.log('🎨 Populated mini products with', shuffled.length, 'ads');
}

// Make it available globally
window.populateMiniProducts = populateMiniProducts;

// ========================================
// HERO ADS
// The reseller's photo hero rotates: their welcome slide first, then the
// hero ads (image or muted video).
// The same sponsor plays on the M-Pesa wait screen and on the success page.
//
// Extra ad fields (all optional, older ads keep working as showcase ads):
//   placement     'hero' | 'local' (default 'local' = showcase / success row)
//   media_type    'image' | 'video'
//   video_url, poster_url
//   image_fit     'cover' (photo) | 'contain' (cut-out product shot)
//   bg_color      background behind a contained image or while a video loads
//   slot          'platform' (Bitwave sells) | 'reseller' | 'house' (reseller's own promo)
//
// Before login the phone has no internet, so hero and wait-screen ads offer
// Call (tel:) only — WhatsApp links cannot open behind the walled garden.
// ========================================
const HERO_IMAGE_MS = 6000;
const HERO_VIDEO_MAX_MS = 15000;
const HERO_IMPRESSION_MS = 1000;   // a slide counts as seen after 1 s on screen
// Which way a tap on each half of the hero goes: -1 is previous, 1 is next.
// Same as WhatsApp Status. To swap the sides, swap these two numbers.
const HERO_TAP_SIDES = { left: -1, right: 1 };
const HERO_TAP_MOVE_PX = 10;       // a press that travels further isn't a tap
const HERO_SWIPE_PX = 40;
const HERO_CONTROL_MARGIN_PX = 16; // just missing Call must not flip the slide away
// Never start a tap or swipe from these. The WiFi chip has no action of its own,
// but it reads as a label, so tapping it shouldn't move the hero either.
const HERO_NO_NAV = 'a, button, input, select, textarea, label, video[controls], .hero-spot-brand';
let heroAds = [];
const heroRot = { idx: 0, timer: null, stopWatching: null, seen: new Set(), seenTimer: null, track: null, segs: null };

function adEsc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function adPlacement(ad) {
    return ad.placement || 'local';
}

function heroBrandName() {
    return window._routerBusinessName
        || (window.portalSettings && window.portalSettings.welcome_title)
        || 'This WiFi';
}

function heroAdLabel(ad) {
    return ad.slot === 'house' ? 'Promo' : 'Ad';
}

function heroCallHref(ad) {
    return ad.phone_number ? `tel:${formatPhoneForCall(ad.phone_number)}` : '';
}

const AD_ICONS = {
    phone: '<svg class="spot-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
    chat: '<svg class="spot-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.8-.9L3 21l1.9-5.2A8.4 8.4 0 1 1 21 11.5z"/></svg>',
    muted: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>',
    sound: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>',
    wifi: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.55a11 11 0 0 1 14 0"/><path d="M8.5 16.1a6 6 0 0 1 7 0"/><path d="M2 8.82a15 15 0 0 1 20 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>'
};

// Every ad slide has the same frame: the WiFi's name top-left (mute top-right
// on video), and one bottom bar with who is advertising, the offer and a
// single Call button. Copy in an advertiser's video should stay in the middle
// of the frame, clear of the top 20% and the bottom 30%.
function heroTopHtml(isVideo) {
    return `
        <div class="hero-spot-top">
            <span class="hero-spot-brand">${AD_ICONS.wifi}${adEsc(heroBrandName())}</span>
            ${isVideo ? `<button type="button" class="hero-spot-mute" aria-label="Turn sound on">${AD_ICONS.muted}</button>` : ''}
        </div>`;
}

function heroFootHtml({ tag, name, offer, button }) {
    return `
        <div class="hero-spot-foot">
            <div class="hero-spot-info">
                <div class="hero-spot-who"><span class="hero-spot-tag">${tag}</span><span class="hero-spot-name">${adEsc(name)}</span></div>
                ${offer ? `<div class="hero-spot-offer">${adEsc(offer)}</div>` : ''}
            </div>
            ${button || ''}
        </div>`;
}

function heroCallButton(ad) {
    const href = heroCallHref(ad);
    if (!href) return '';
    return `<a class="hero-spot-btn" href="${href}" data-hero-cta="call" data-spot-id="${ad.id}"
               aria-label="Call ${adEsc(ad.seller_name || ad.title)}">${AD_ICONS.phone}<span>Call</span></a>`;
}

function heroSlideHtml(ad, i, total) {
    const n = `${i + 1} of ${total}`;
    const name = ad.seller_name || ad.title;
    const offer = [ad.title, ad.price].filter(Boolean).join(' · ');

    if (ad.media_type === 'video' && ad.video_url) {
        return `
        <div class="hero-slide hero-slide--spot hero-slide--video" data-spot-id="${ad.id}" role="group"
             aria-roledescription="slide" aria-label="${n}: video ad from ${adEsc(name)}"
             style="background:${adEsc(ad.bg_color || '#0f172a')}">
            <video class="hero-spot-video" muted playsinline preload="none"
                   poster="${adEsc(ad.poster_url || '')}" data-src="${adEsc(ad.video_url)}"></video>
            ${heroTopHtml(true)}
            ${heroFootHtml({ tag: heroAdLabel(ad), name, offer, button: heroCallButton(ad) })}
        </div>`;
    }

    // A cut-out product shot sits on the right with the headline beside it;
    // a full photo carries its own message, so only the bar goes on top.
    const contain = ad.image_fit === 'contain';
    return `
        <div class="hero-slide hero-slide--spot hero-slide--image${contain ? ' hero-slide--contain' : ''}" data-spot-id="${ad.id}" role="group"
             aria-roledescription="slide" aria-label="${n}: ad from ${adEsc(name)}"
             style="background:${adEsc(ad.bg_color || '#0f172a')}">
            ${ad.image_url ? `<img class="hero-spot-img" src="${adEsc(ad.image_url)}" alt="" loading="lazy" decoding="async">` : ''}
            ${heroTopHtml(false)}
            ${contain && (ad.title || ad.price) ? `<div class="hero-spot-headline">${adEsc(ad.title)}${ad.price ? ` <span class="hero-spot-price">${adEsc(ad.price)}</span>` : ''}</div>` : ''}
            ${heroFootHtml({
                tag: heroAdLabel(ad), name,
                offer: contain ? (ad.description || ad.seller_location || '') : offer,
                button: heroCallButton(ad)
            })}
        </div>`;
}

// Wraps whatever the header currently shows (the reseller's welcome) into
// slide 1 and adds the ad slides after it. Safe to call repeatedly: a fresh
// renderHeroHeader() wipes the carousel and this rebuilds it.
function mountHeroAds() {
    if (window._portalShowAds === false || heroAds.length === 0) return;
    const header = document.getElementById('portal-header');
    if (!header || !header.classList.contains('portal-header--hero')) return;
    if (header.querySelector('.hero-track')) return;

    const total = heroAds.length + 1;
    // Built first: the welcome moves out of the header next, and nothing may
    // stop halfway through that and leave the header empty.
    const slidesHtml = heroAds.map((ad, i) => heroSlideHtml(ad, i + 1, total)).join('');
    const track = document.createElement('div');
    track.className = 'hero-track';
    const welcome = document.createElement('div');
    welcome.className = 'hero-slide hero-slide--welcome';
    welcome.setAttribute('role', 'group');
    welcome.setAttribute('aria-roledescription', 'slide');
    welcome.setAttribute('aria-label', `1 of ${total}: welcome`);
    while (header.firstChild) welcome.appendChild(header.firstChild);
    track.appendChild(welcome);
    track.insertAdjacentHTML('beforeend', slidesHtml);
    // A photo that fails leaves the slide's colour and its bar. Errors don't
    // bubble, so this listens on the way down.
    track.addEventListener('error', e => {
        if (e.target.classList && e.target.classList.contains('hero-spot-img')) e.target.remove();
    }, true);

    // Story-style segments: which slide this is, and how long it has left.
    const segs = document.createElement('div');
    segs.className = 'hero-segs';
    for (let i = 0; i < total; i++) {
        segs.insertAdjacentHTML('beforeend',
            `<button type="button" class="hero-seg" data-go="${i}" aria-label="Show slide ${i + 1} of ${total}"><span><i></i></span></button>`);
    }

    header.classList.add('has-hero-spots');
    header.setAttribute('aria-roledescription', 'carousel');
    // The track slides away under the finger, so taps are listened for on this
    // instead: it holds still, and a re-render of the header replaces it.
    const stage = document.createElement('div');
    stage.className = 'hero-stage';
    stage.appendChild(track);
    header.appendChild(stage);
    header.appendChild(segs);
    // Tapping the sides needs a pointer; these are the same two moves for a
    // keyboard or a screen reader. Unseen until focused (styles003.css).
    const steps = document.createElement('div');
    steps.className = 'hero-steps';
    steps.innerHTML =
        '<button type="button" class="hero-step hero-step--prev" data-step="-1" aria-label="Previous slide">&lsaquo;</button>' +
        '<button type="button" class="hero-step hero-step--next" data-step="1" aria-label="Next slide">&rsaquo;</button>';
    header.appendChild(steps);
    heroRot.track = track;
    heroRot.segs = segs;
    heroRot.idx = 0;

    // A video slide's segment follows the clip itself.
    Array.from(track.children).forEach((slide, k) => {
        const v = slide.querySelector('video');
        if (!v) return;
        v.addEventListener('timeupdate', () => {
            if (heroRot.idx !== k || !v.duration) return;
            const fill = segs.children[k].querySelector('i');
            fill.style.width = `${Math.min(100, (100 * v.currentTime) / v.duration)}%`;
        });
    });

    segs.addEventListener('click', e => {
        const b = e.target.closest('.hero-seg');
        if (b) { heroGo(Number(b.dataset.go)); heroSchedule(); }
    });
    // click is what keeps touch and mouse from firing twice, and the browser
    // sends none after a scroll. The pointer events only rule out presses that
    // started on a control or moved too far (a mouse drag still ends in a click).
    let press = null;
    stage.addEventListener('click', e => {
        const wasTap = !!press && !press.moved;
        press = null;
        const mute = e.target.closest('.hero-spot-mute');
        if (mute) {
            const v = mute.closest('.hero-slide').querySelector('video');
            v.muted = !v.muted;
            heroShowMute(mute, v.muted);
            return;
        }
        const cta = e.target.closest('[data-hero-cta]');
        if (cta) { recordClick(Number(cta.dataset.spotId), 'call', 'hero'); return; }
        // Only a slide change: it records nothing. Views are heroGo's job.
        if (wasTap) {
            const box = header.getBoundingClientRect();
            heroStep(e.clientX < box.left + box.width / 2 ? HERO_TAP_SIDES.left : HERO_TAP_SIDES.right);
        }
    });
    steps.addEventListener('click', e => {
        const b = e.target.closest('.hero-step');
        if (b) heroStep(Number(b.dataset.step));
    });
    stage.addEventListener('pointerdown', e => {
        press = e.isPrimary && !heroPressOnControl(e) ? { x: e.clientX, y: e.clientY, moved: false } : null;
    });
    // The browser took the gesture over to scroll the page.
    stage.addEventListener('pointercancel', () => { press = null; });
    stage.addEventListener('pointerup', e => {
        if (!press) return;
        const dx = e.clientX - press.x;
        const dy = e.clientY - press.y;
        press.moved = Math.hypot(dx, dy) > HERO_TAP_MOVE_PX;
        if (Math.abs(dx) > HERO_SWIPE_PX && Math.abs(dx) > Math.abs(dy)) heroStep(dx < 0 ? 1 : -1);
    });
    // Otherwise a mouse drag on a photo becomes the browser's own image drag.
    stage.addEventListener('dragstart', e => e.preventDefault());

    heroGo(0);
    heroSchedule();
}
window.mountHeroAds = mountHeroAds;

function heroReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function heroShowMute(btn, muted) {
    btn.innerHTML = muted ? AD_ICONS.muted : AD_ICONS.sound;
    btn.setAttribute('aria-label', muted ? 'Turn sound on' : 'Turn sound off');
}

function heroPressOnControl(e) {
    if (e.target.closest(HERO_NO_NAV)) return true;
    const m = HERO_CONTROL_MARGIN_PX;
    return Array.from(heroRot.track.children[heroRot.idx].querySelectorAll('a, button')).some(c => {
        const r = c.getBoundingClientRect();
        return r.width > 0 && e.clientX > r.left - m && e.clientX < r.right + m
            && e.clientY > r.top - m && e.clientY < r.bottom + m;
    });
}

// A customer moving the hero by hand. Away from the plans it stays on the
// welcome slide, the same as the auto-rotate.
function heroStep(dir) {
    if (!heroOnPlansPage()) return;
    heroGo(heroRot.idx + dir);
    heroSchedule();
}

function heroGo(n) {
    const track = heroRot.track;
    if (!track || !track.isConnected) return;
    const slides = track.children;
    heroRot.idx = (n + slides.length) % slides.length;
    track.style.transform = `translateX(${-100 * heroRot.idx}%)`;

    const active = slides[heroRot.idx];
    const v = active.querySelector('video');
    Array.from(heroRot.segs.children).forEach((seg, i) => {
        const fill = seg.querySelector('i');
        fill.style.transition = 'none';
        fill.style.width = i < heroRot.idx ? '100%' : '0%';
        if (i === heroRot.idx) seg.setAttribute('aria-current', 'true');
        else seg.removeAttribute('aria-current');
    });
    if (!v) {
        const fill = heroRot.segs.children[heroRot.idx].querySelector('i');
        if (heroReducedMotion() || !heroOnPlansPage()) {
            fill.style.width = '100%';
        } else {
            void fill.offsetWidth; // restart the fill from empty
            fill.style.transition = `width ${HERO_IMAGE_MS}ms linear`;
            fill.style.width = '100%';
        }
    }

    Array.from(slides).forEach((s, i) => {
        const sv = s.querySelector('video');
        if (sv && i !== heroRot.idx) sv.pause();
        // Tab and screen readers stay on the slide that's showing; the ones
        // off to the side would otherwise scroll the hero out of line.
        s.inert = i !== heroRot.idx;
    });
    if (v) {
        playAdVideo(v, false); // starts over, muted
        const mute = active.querySelector('.hero-spot-mute');
        if (mute) heroShowMute(mute, true);
    }
    // Fetch the next slide's video while this one shows, never earlier.
    const next = slides[(heroRot.idx + 1) % slides.length].querySelector('video');
    if (next && !next.src) { next.src = next.dataset.src; next.preload = 'metadata'; }

    clearTimeout(heroRot.seenTimer);
    const adId = Number(active.dataset.spotId);
    if (adId && !heroRot.seen.has(adId)) {
        heroRot.seenTimer = setTimeout(() => {
            heroRot.seen.add(adId);
            recordImpression([adId], 'hero');
        }, HERO_IMPRESSION_MS);
    }
}

// The hero only rotates while the plans are on screen. On the phone-number,
// processing and success screens it rests on the reseller's welcome slide.
function heroOnPlansPage() {
    const plans = document.getElementById('plansSection');
    return !plans || !plans.classList.contains('hidden');
}

function watchPlansSection() {
    const plans = document.getElementById('plansSection');
    if (!plans || !window.MutationObserver || plans.dataset.heroWatched) return;
    plans.dataset.heroWatched = '1';
    new MutationObserver(() => {
        if (!heroRot.track) return;
        if (heroOnPlansPage()) {
            heroSchedule();
        } else {
            clearTimeout(heroRot.timer);
            heroGo(0);
        }
    }).observe(plans, { attributes: true, attributeFilter: ['class'] });
}

function heroSchedule() {
    clearTimeout(heroRot.timer);
    // Leaving a video by hand must not leave its 'ended' behind, or coming back
    // to that video would advance twice when it finishes and skip a slide.
    if (heroRot.stopWatching) { heroRot.stopWatching(); heroRot.stopWatching = null; }
    const track = heroRot.track;
    if (!track || !track.isConnected || !heroOnPlansPage()) return;
    if (heroReducedMotion()) return;
    const v = track.children[heroRot.idx].querySelector('video');
    const advance = () => { heroGo(heroRot.idx + 1); heroSchedule(); };
    if (v) {
        // A video slide stays until the clip ends, capped so a long upload
        // can't hold the hero.
        v.addEventListener('ended', advance);
        heroRot.stopWatching = () => v.removeEventListener('ended', advance);
        heroRot.timer = setTimeout(advance, HERO_VIDEO_MAX_MS);
    } else {
        heroRot.timer = setTimeout(advance, HERO_IMAGE_MS);
    }
}

document.addEventListener('visibilitychange', () => {
    if (!heroRot.track) return;
    if (document.hidden) {
        clearTimeout(heroRot.timer);
        heroRot.track.querySelectorAll('video').forEach(v => v.pause());
        return;
    }
    heroGo(heroRot.idx);
    heroSchedule();
    // Customers flip to the M-Pesa prompt and back; Chrome also pauses
    // muted video in a background tab. Resume the sponsor on return.
    const processing = document.getElementById('processingSection');
    const waitVideo = document.querySelector('.wait-spot video');
    if (waitVideo && processing && !processing.classList.contains('hidden')) {
        const p = waitVideo.play();
        if (p && p.catch) p.catch(() => {});
    }
});

function playAdVideo(v, loop) {
    if (!v.src && v.dataset.src) v.src = v.dataset.src;
    v.muted = true;
    v.loop = !!loop;
    try { v.currentTime = 0; } catch (_) {}
    const bar = v.parentNode.querySelector('.spot-video-bar i');
    if (bar && !v.dataset.barWired) {
        v.dataset.barWired = '1';
        v.addEventListener('timeupdate', () => {
            if (v.duration) bar.style.width = `${(100 * v.currentTime) / v.duration}%`;
        });
    }
    const p = v.play();
    if (p && p.catch) p.catch(() => {});
}

// The sponsor for the wait and success screens: the first platform video ad,
// else the first hero ad that isn't the reseller's own promo.
function sponsorAd() {
    const paid = heroAds.filter(ad => ad.slot !== 'house');
    return paid.find(ad => ad.media_type === 'video' && ad.video_url) || paid[0] || null;
}

function sponsorTagHtml(ad) {
    return `<span class="hero-spot-tag">${heroAdLabel(ad)}</span>`;
}

function sponsorHasMedia(ad) {
    return !!((ad.media_type === 'video' && ad.video_url) || ad.image_url);
}

function sponsorMediaHtml(ad) {
    const tag = sponsorTagHtml(ad);
    if (ad.media_type === 'video' && ad.video_url) {
        return `
            <div class="spot-media spot-video" style="background:${adEsc(ad.bg_color || '#0f172a')}">
                <video muted playsinline preload="none" poster="${adEsc(ad.poster_url || '')}" data-src="${adEsc(ad.video_url)}"></video>
                ${tag}
                <span class="spot-video-bar"><i></i></span>
            </div>`;
    }
    if (!ad.image_url) return '';
    return `
        <div class="spot-media">
            <img class="spot-feature-img${ad.image_fit === 'contain' ? ' is-contain' : ''}" src="${adEsc(ad.image_url)}" alt="" style="background:${adEsc(ad.bg_color || '#0f172a')}">
            ${tag}
        </div>`;
}

// Who is advertising and what, under the sponsor's video. The Ad tag sits
// on the media's corner so a long name and a wide WhatsApp button both fit;
// with no media it moves here, because an ad always says it is one.
function sponsorWhoHtml(ad) {
    const offer = [ad.title, ad.price].filter(Boolean).join(' · ');
    const name = ad.seller_name || ad.title;
    return `
        <div class="wait-spot-who">
            ${sponsorHasMedia(ad) ? '' : sponsorTagHtml(ad)}
            ${name ? `<strong class="wait-spot-name">${adEsc(name)}</strong>` : ''}
            ${offer ? `<span class="wait-spot-offer">${adEsc(offer)}</span>` : ''}
        </div>`;
}

// A sponsor photo that fails takes its frame with it, and the Ad tag moves down
// to the text, the same as an ad that never had a photo.
function setupSponsorImage(root) {
    const img = root.querySelector('.spot-feature-img');
    if (!img) return;
    img.addEventListener('error', () => {
        const media = img.closest('.spot-media');
        const tag = media.querySelector('.hero-spot-tag');
        const who = root.querySelector('.wait-spot-who');
        if (tag && who) who.prepend(tag);
        media.remove();
    }, { once: true });
}

// "While you wait": the sponsor's video on the M-Pesa processing screen.
// Plays while the customer enters their PIN; the payment never waits for it.
function mountWaitAd() {
    const section = document.getElementById('processingSection');
    const ad = sponsorAd();
    if (!section || !ad || window._portalShowAds === false) return;
    if (!section.querySelector('.wait-spot')) {
        const box = document.createElement('div');
        box.className = 'wait-spot';
        box.innerHTML = `
            <div class="wait-spot-head">While you wait</div>
            <div class="wait-spot-card">
                ${sponsorMediaHtml(ad)}
                <div class="wait-spot-foot">
                    ${sponsorWhoHtml(ad)}
                    ${heroCallHref(ad) ? `<a class="wait-spot-cta" href="${heroCallHref(ad)}" data-spot-id="${ad.id}">${AD_ICONS.phone}<span>Call</span></a>` : ''}
                </div>
            </div>`;
        // Straight under "Check your phone" so most of it is on the first
        // screen; the hero still takes the top of the page here. Wide format
        // for the same reason (a 4:5 clip pushes the steps off screen).
        const anchor = section.querySelector('.processing-hero');
        if (anchor && anchor.nextSibling) section.insertBefore(box, anchor.nextSibling);
        else section.appendChild(box);
        setupSponsorImage(box);
        const cta = box.querySelector('.wait-spot-cta');
        if (cta) cta.addEventListener('click', () => recordClick(ad.id, 'call', 'wait_screen'));
    }
    const v = section.querySelector('.wait-spot video');
    if (v) playAdVideo(v, true);
    recordImpression([ad.id], 'wait_screen');
}

function watchProcessingSection() {
    const section = document.getElementById('processingSection');
    if (!section || !window.MutationObserver) return;
    new MutationObserver(() => {
        const visible = !section.classList.contains('hidden');
        if (visible) mountWaitAd();
        else section.querySelectorAll('.wait-spot video').forEach(v => v.pause());
    }).observe(section, { attributes: true, attributeFilter: ['class'] });
}

// Success page: the sponsor card above the local-shops row. The customer is
// online now, so WhatsApp works here.
function renderSuccessSponsor() {
    const section = document.querySelector('.done-spots');
    const ad = sponsorAd();
    if (!section || !ad || window._portalShowAds === false) return;
    let card = document.getElementById('doneFeature');
    if (!card) {
        card = document.createElement('div');
        card.id = 'doneFeature';
        card.className = 'done-feature';
        section.parentNode.insertBefore(card, section);
    }
    const wa = ad.whatsapp_number || ad.phone_number;
    card.innerHTML = `
        <div class="wait-spot-head">Sponsored</div>
        <div class="wait-spot-card">
            ${sponsorMediaHtml(ad)}
            <div class="wait-spot-foot">
                ${sponsorWhoHtml(ad)}
                ${wa ? `<a class="wait-spot-cta" href="https://wa.me/${formatPhoneForWhatsApp(wa)}" target="_blank" rel="noopener" data-spot-id="${ad.id}">${AD_ICONS.chat}<span>WhatsApp</span></a>` : ''}
            </div>
        </div>`;
    setupSponsorImage(card);
    const cta = card.querySelector('.wait-spot-cta');
    if (cta) cta.addEventListener('click', () => recordClick(ad.id, 'whatsapp', 'success_page'));
    const v = card.querySelector('video');
    if (v) playAdVideo(v, true);
    recordImpression([ad.id], 'success_page');
}

// ========================================
// INITIALIZE ADS FROM PORTAL DATA (called when portal endpoint provides ads)
// ========================================
function initAdsFromPortalData(rawAds) {
    const portalAds = cleanAds(rawAds);
    if (portalAds.length > 0) {
        heroAds = portalAds.filter(ad => adPlacement(ad) === 'hero');
        adsData = applyLocalImages(portalAds.filter(ad => adPlacement(ad) !== 'hero'));
        if (heroAds.length > 0) {
            // Hero mode: the login page's only ads are in the hero, so the
            // showcase above the plans and the mini-ads on the phone-number
            // form stay hidden. Local ads still show once the customer is online.
            window._heroAdsActive = true;
            mountHeroAds();
            watchPlansSection();
            watchProcessingSection();
            const showcase = document.querySelector('.spots-showcase');
            if (showcase) showcase.style.display = 'none';
            console.log('✅ [ADS] Hero ads:', heroAds.length, '| local ads:', adsData.length);
            return;
        }
        showAdSections();
        renderAds(adsData);
        recordImpression(adsData.map(ad => ad.id));
        console.log('✅ [ADS] Initialized from portal data:', adsData.length, 'ads');
    } else {
        adsData = [];
        hideAdSections();
        console.log('📭 [ADS] No ads from portal — ad sections hidden');
    }
}

// ========================================
// INITIALIZATION
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('📢 Ads Service Initialized');
    
    setupModalListeners();

    // If script.js provides a portal data promise, wait for it to avoid a duplicate fetch.
    // Otherwise fall back to the standalone ads fetch.
    const adsReady = window.portalDataPromise
        ? window.portalDataPromise
            .then(() => {
                if (window._portalAds !== null && window._portalAds !== undefined) {
                    initAdsFromPortalData(window._portalAds);
                } else {
                    return fetchAds();
                }
            })
            .catch(() => fetchAds())
        : fetchAds();

    adsReady.finally(() => {
        populateMiniProducts();
    });
    
    retryPendingClicks();
    
    // Check for test mode
    const urlParams = new URLSearchParams(window.location.search);
    const testMode = urlParams.get('test');
    if (testMode === 'success') {
        setTimeout(() => window.testSuccessPage(), 800);
    } else if (testMode === 'processing') {
        setTimeout(() => window.testProcessingPage(), 800);
    } else if (testMode === 'error') {
        setTimeout(() => window.testErrorPage(), 800);
    }
});

// ========================================
// DEBUG / DEVELOPMENT HELPERS
// ========================================

// Force refresh ads from API (call from console)
window.refreshAds = async function() {
    console.log('🔄 Force refreshing ads...');
    return await fetchAds();
};

// View current ads data (call from console)
window.getAdsData = function() {
    console.log('📋 Current Ads Data:', adsData);
    return adsData;
};

// View analytics info (call from console)
window.getAdsAnalytics = function() {
    return {
        sessionId,
        deviceId,
        pendingClicks: JSON.parse(localStorage.getItem('bitwave_pending_clicks') || '[]'),
        totalAdsLoaded: adsData.length
    };
};

console.log('📢 Ads Service Ready');
console.log('💡 Debug commands: refreshAds(), getAdsData(), getAdsAnalytics(), testSuccessPage()');

// Test function to preview the success page
window.testSuccessPage = function() {
    hideAllSections();
    
    // Show success section
    const successSection = document.getElementById('successSection');
    if (successSection) {
        successSection.classList.remove('hidden');
    }
    
    // Populate with mock data
    const connectionDetails = document.getElementById('connectionDetails');
    if (connectionDetails) {
        connectionDetails.innerHTML = `
            <div class="detail-row">
                <span class="detail-label">Plan</span>
                <span class="detail-value">24 Hours</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Speed</span>
                <span class="detail-value">5Mbps</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Phone</span>
                <span class="detail-value">254712345678</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Valid Until</span>
                <span class="detail-value">Sun, Jan 18, 10:30 PM</span>
            </div>
        `;
    }
    
    // Populate success ads
    populateSuccessAds();
    
    console.log('✅ Success page shown with test data');
};

// Test function to preview the processing page
window.testProcessingPage = function() {
    hideAllSections();
    
    // Show processing section
    const processingSection = document.getElementById('processingSection');
    if (processingSection) {
        processingSection.classList.remove('hidden');
    }
    
    // Populate with mock data
    const processingPlanInfo = document.getElementById('processingPlanInfo');
    if (processingPlanInfo) {
        processingPlanInfo.innerHTML = `
            <div class="processing-plan-row">
                <span class="processing-plan-label">Plan</span>
                <span class="processing-plan-value">24 Hours</span>
            </div>
            <div class="processing-plan-row">
                <span class="processing-plan-label">Amount</span>
                <span class="processing-plan-value">KSH 100/-</span>
            </div>
            <div class="processing-plan-row">
                <span class="processing-plan-label">Phone</span>
                <span class="processing-plan-value">254712345678</span>
            </div>
        `;
    }
    
    console.log('📱 Processing page shown with test data');
};

// Test function to preview the error page
window.testErrorPage = function() {
    hideAllSections();
    
    // Show error section
    const errorSection = document.getElementById('errorSection');
    if (errorSection) {
        errorSection.classList.remove('hidden');
    }
    
    // Populate with mock error message
    const errorMessage = document.getElementById('errorMessage');
    if (errorMessage) {
        errorMessage.textContent = 'Transaction was cancelled. No amount was deducted from your account.';
    }
    
    console.log('❌ Error page shown with test data');
};

// Helper to hide all sections
function hideAllSections() {
    document.getElementById('plansSection')?.classList.add('hidden');
    document.getElementById('paymentSection')?.classList.add('hidden');
    document.getElementById('processingSection')?.classList.add('hidden');
    document.getElementById('successSection')?.classList.add('hidden');
    document.getElementById('errorSection')?.classList.add('hidden');
}

