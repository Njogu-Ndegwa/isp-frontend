// ========================================
// ADS SERVICE - Bitwave Soko WiFi
// Handles ad fetching, display, and click tracking
// ========================================

// ========================================
// BACKEND API CONFIGURATION
// ========================================
const ADS_API_BASE_URL = 'https://isp.bitwavetechnologies.com/api';
const ADS_ENDPOINT = `${ADS_API_BASE_URL}/ads`;
const AD_CLICK_ENDPOINT = `${ADS_API_BASE_URL}/ads/click`;
const AD_IMPRESSION_ENDPOINT = `${ADS_API_BASE_URL}/ads/impression`;

// Resolves a URL through the global fallback state set by script.js
function resolveAdsUrl(url) {
    const fb = window.__apiFallback;
    if (fb && fb.active) {
        return url.replace(fb.primary, fb.fallback);
    }
    return url;
}

// Note: Backend API format from https://isp.bitwavetechnologies.com/api/ads

// ========================================
// DATA TRANSFER OBJECTS (DTOs)
// These define the structure of data exchanged with the backend
// API Base: https://isp.bitwavetechnologies.com/api
// ========================================

/**
 * Ad DTO - Structure of an ad from the backend
 * 
 * GET /api/ads Response:
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
 * POST /api/ads/click
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
 * POST /api/ads/impression
 * {
 *   "ad_ids": [1],                      // Array of ad IDs shown
 *   "device_id": "dev_abc123",
 *   "session_id": "sess_xyz789",
 *   "placement": "showcase_carousel"    // Where the ads were shown
 * }
 */

// ========================================
// HARDCODED ADS - Fallback when API unavailable
// These serve as defaults and instant loading
// ========================================
const HARDCODED_ADS = [
    {
        id: 1,
        title: "Fresh Tomatoes",
        description: "Farm-fresh tomatoes picked daily from our Kiambu farm. Perfect for cooking, salads, and making fresh juice. We guarantee the best quality at the lowest prices!",
        image_url: "images/tomatoes.jpg",
        seller_name: "Mama Njeri",
        seller_location: "Stall 42, Section A",
        phone_number: "0712345678",
        whatsapp_number: "254712345678",
        price: "KSH 80/kg",
        price_value: 80,
        badge_type: "hot",
        badge_text: "🔥 Hot",
        category: "produce",
        views_count: 245,
        clicks_count: 89
    },
    {
        id: 2,
        title: "Phone Cases",
        description: "Premium phone cases for all models - iPhone, Samsung, Tecno, Infinix, and more. Shock-proof, stylish designs. Wholesale prices available!",
        image_url: "images/phone-cases.jpg",
        seller_name: "Tech Corner",
        seller_location: "Building B, Shop 12",
        phone_number: "0798765432",
        whatsapp_number: "254798765432",
        price: "KSH 150+",
        price_value: 150,
        badge_type: "new",
        badge_text: "✨ New",
        category: "electronics",
        views_count: 189,
        clicks_count: 67
    },
    {
        id: 3,
        title: "Sukuma Wiki",
        description: "Fresh sukuma wiki (collard greens) harvested this morning. Organic, no pesticides. Great for ugali! Bulk orders welcome.",
        image_url: "images/sukuma-wiki.jpg",
        seller_name: "Shamba Fresh",
        seller_location: "Section A, Stall 7",
        phone_number: "0723456789",
        whatsapp_number: "254723456789",
        price: "KSH 30/bunch",
        price_value: 30,
        badge_type: null,
        badge_text: null,
        category: "produce",
        views_count: 156,
        clicks_count: 45
    },
    {
        id: 4,
        title: "Fashion Watches",
        description: "Trendy watches for men and women. Digital, analog, and smart watches available. Perfect gifts! Quality guaranteed with warranty.",
        image_url: "images/watches.jpg",
        seller_name: "Style Hub",
        seller_location: "Section C, Shop 3",
        phone_number: "0734567890",
        whatsapp_number: "254734567890",
        price: "KSH 500+",
        price_value: 500,
        badge_type: "sale",
        badge_text: "💰 Sale",
        category: "fashion",
        views_count: 312,
        clicks_count: 98
    },
    {
        id: 5,
        title: "Ripe Bananas",
        description: "Sweet, ripe bananas from Kisii. Perfect for eating, smoothies, or baking. Fresh stock every day!",
        image_url: "images/bananas.jpg",
        seller_name: "Fruits Paradise",
        seller_location: "Section D, Stall 5",
        phone_number: "0745678901",
        whatsapp_number: "254745678901",
        price: "KSH 100/dozen",
        price_value: 100,
        badge_type: null,
        badge_text: null,
        category: "produce",
        views_count: 178,
        clicks_count: 52
    }
];

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
    8: 'images/Advertise-Here.webp',      // Buy Ad Space — Get Seen
    9: 'images/Internet-Technician.webp', // Fast Home Wi-Fi Installation
    10: 'images/Onions.webp'              // Fresh Onions
};

// Fallback to PNG if WebP not created yet
const AD_LOCAL_IMAGES_FALLBACK = {
    8: 'images/Advertise-Here.png',
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
// LOCAL FALLBACK IMAGES
// Used when CDN images fail to load (walled garden restrictions)
// ========================================

// Specific fallback images for known ads (by ID) - same as primary for consistency
const AD_SPECIFIC_FALLBACKS = AD_LOCAL_IMAGES;

// Category-based fallbacks for other ads
const LOCAL_FALLBACK_IMAGES = {
    // Category-based fallbacks
    produce: ['images/tomatoes.jpg', 'images/sukuma-wiki.jpg', 'images/bananas.jpg'],
    electronics: ['images/phone-cases.jpg', 'images/watches.jpg'],
    fashion: ['images/watches.jpg', 'images/phone-cases.jpg'],
    food: ['images/tomatoes.jpg', 'images/bananas.jpg', 'images/sukuma-wiki.jpg'],
    services: ['images/Internet-Technician.png', 'images/Advertise-Here.png'],
    // Default fallback (cycles through all available images)
    default: [
        'images/tomatoes.jpg',
        'images/phone-cases.jpg', 
        'images/sukuma-wiki.jpg',
        'images/watches.jpg',
        'images/bananas.jpg'
    ]
};

// Track which fallback index to use (to vary images)
let fallbackImageIndex = 0;

/**
 * Get a local fallback image based on ad ID or category
 * @param {number} adId - The ad ID (for specific fallbacks)
 * @param {string} category - The ad category (produce, electronics, fashion, etc.)
 * @returns {string} - Local image path
 */
function getLocalFallbackImage(adId, category) {
    // First check if there's a specific fallback for this ad ID
    if (adId && AD_SPECIFIC_FALLBACKS[adId]) {
        console.log(`🖼️ Using specific fallback for ad #${adId}`);
        return AD_SPECIFIC_FALLBACKS[adId];
    }
    
    // Fall back to category-based images
    const categoryLower = (category || '').toLowerCase();
    const images = LOCAL_FALLBACK_IMAGES[categoryLower] || LOCAL_FALLBACK_IMAGES.default;
    
    // Cycle through available images to add variety
    const image = images[fallbackImageIndex % images.length];
    fallbackImageIndex++;
    
    return image;
}

/**
 * Setup image error handling with local fallback
 * @param {HTMLImageElement} imgElement - The image element
 * @param {string} category - Ad category for fallback selection
 * @param {number} adId - Ad ID for specific fallback images
 */
function setupImageFallback(imgElement, category, adId) {
    if (!imgElement) return;
    
    // Store original src for logging
    const originalSrc = imgElement.src;
    
    imgElement.onerror = function() {
        // First try: WebP failed, try PNG fallback for this specific ad
        if (!this.dataset.pngAttempted && AD_LOCAL_IMAGES_FALLBACK[adId]) {
            this.dataset.pngAttempted = 'true';
            console.log(`🖼️ WebP failed, trying PNG for ad #${adId}`);
            this.src = AD_LOCAL_IMAGES_FALLBACK[adId];
            return;
        }
        
        // Second try: Use category-based fallback
        if (!this.dataset.fallbackAttempted) {
            this.dataset.fallbackAttempted = 'true';
            const fallbackSrc = getLocalFallbackImage(adId, category);
            console.log(`🖼️ Image failed to load, using local fallback: ${fallbackSrc}`);
            this.src = fallbackSrc;
            return;
        }
        
        console.warn('⚠️ All image fallbacks failed:', originalSrc);
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
        const apiAds = apiResponse.ads || apiResponse;
        console.log('✅ Ads fetched from API:', apiAds.length, 'ads');
        console.log('📊 Pagination:', apiResponse.pagination);
        
        if (Array.isArray(apiAds) && apiAds.length > 0) {
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
// HIDE AD SECTIONS (when no ads available)
// When show_ads is off, hides everything including CTA card.
// When show_ads is on but no actual ads exist, shows CTA card for advertisers.
// ========================================
function hideAdSections() {
    const showcaseSection = document.querySelector('.marketplace-showcase');
    const showcaseScroll = document.getElementById('showcaseScroll');

    // When the portal explicitly disables ads, hide the entire showcase — no CTA card shown.
    if (window._portalShowAds === false) {
        if (showcaseSection) showcaseSection.style.display = 'none';
        const paymentAd = document.querySelector('.payment-ad');
        if (paymentAd) paymentAd.style.display = 'none';
        const successAds = document.querySelector('.success-ads');
        if (successAds) successAds.style.display = 'none';
        console.log('🙈 Ads disabled by portal settings — all ad sections hidden');
        return;
    }

    // Ads are allowed but none are available — keep showcase with CTA card for advertisers
    if (showcaseSection && showcaseScroll) {
        showcaseSection.style.display = '';
        
        const existingCards = showcaseScroll.querySelectorAll('.product-card:not(.ad-cta-card), .ad-skeleton');
        existingCards.forEach(card => card.remove());
        
        const scrollHint = showcaseSection.querySelector('.scroll-hint');
        if (scrollHint) scrollHint.style.display = 'none';
        
        const showcaseTitle = showcaseSection.querySelector('.showcase-title');
        if (showcaseTitle) showcaseTitle.textContent = '📢 Advertise Here';
        
        console.log('📢 Showing CTA card for advertisers');
        // The "Your Ad Here" card is a tel: link to the reseller — re-apply the
        // number (and hide the card if the reseller has none on file).
        if (window.refreshSupportLinks) window.refreshSupportLinks();
    }

    const paymentAd = document.querySelector('.payment-ad');
    if (paymentAd) paymentAd.style.display = 'none';

    const successAds = document.querySelector('.success-ads');
    if (successAds) successAds.style.display = 'none';
    
    console.log('🙈 Ad content sections hidden (CTA visible)');
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

    const showcaseSection = document.querySelector('.marketplace-showcase');
    if (showcaseSection) {
        showcaseSection.style.display = '';
        
        const showcaseTitle = showcaseSection.querySelector('.showcase-title');
        if (showcaseTitle) showcaseTitle.textContent = '🛒 Soko Deals Today';
        
        const scrollHint = showcaseSection.querySelector('.scroll-hint');
        if (scrollHint) scrollHint.style.display = '';
    }
    
    const paymentAd = document.querySelector('.payment-ad');
    if (paymentAd) paymentAd.style.display = '';

    const successAds = document.querySelector('.success-ads');
    if (successAds) successAds.style.display = '';

    // Ad sections just became visible — re-apply the reseller's support number
    // so the home-install promo / "Your Ad Here" card never show without one.
    if (window.refreshSupportLinks) window.refreshSupportLinks();

    console.log('👁️ All ad sections visible');
}

// ========================================
// RENDER ADS IN SHOWCASE
// ========================================
function renderAds(ads) {
    const showcaseScroll = document.getElementById('showcaseScroll');
    const showcaseSection = document.querySelector('.marketplace-showcase');
    
    if (!showcaseScroll) {
        console.warn('⚠️ Showcase scroll element not found');
        return;
    }
    
    // Remove skeleton loaders and existing product cards (except the CTA card)
    const existingCards = showcaseScroll.querySelectorAll('.product-card:not(.ad-cta-card), .ad-skeleton');
    existingCards.forEach(card => card.remove());
    
    // No ads - keep CTA card visible (handled by hideAdSections)
    if (!ads || ads.length === 0) {
        console.log('📭 No ads to render - CTA card remains visible');
        return;
    }
    
    // Show showcase section with full features
    if (showcaseSection) {
        showcaseSection.style.display = '';
        
        // Show scroll hint when we have ads
        const scrollHint = showcaseSection.querySelector('.scroll-hint');
        if (scrollHint) {
            scrollHint.style.display = '';
        }
    }
    
    // Get the CTA card to insert ads before it
    const ctaCard = showcaseScroll.querySelector('.ad-cta-card');
    
    // Create and insert ad cards
    ads.forEach((ad, index) => {
        const card = createAdCard(ad, index);
        if (ctaCard) {
            showcaseScroll.insertBefore(card, ctaCard);
        } else {
            showcaseScroll.appendChild(card);
        }
    });
    
    console.log('🎨 Rendered', ads.length, 'ads in showcase');
}

// ========================================
// CREATE AD CARD ELEMENT
// ========================================
function createAdCard(ad, index) {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.setAttribute('data-ad-id', ad.id);
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `View details for ${ad.title}`);
    
    // Badge HTML
    let badgeHtml = '';
    if (ad.badge_type && ad.badge_text) {
        badgeHtml = `<span class="product-badge ${ad.badge_type}">${ad.badge_text}</span>`;
    }
    
    // First 2 images are above the fold - don't lazy load, prioritize first one
    const loadingAttr = index < 2 ? '' : 'loading="lazy"';
    const priorityAttr = index === 0 ? 'fetchpriority="high"' : '';
    
    card.innerHTML = `
        <div class="product-image">
            <img src="${ad.image_url}" alt="${ad.title}" ${loadingAttr} ${priorityAttr}>
            ${badgeHtml}
        </div>
        <div class="product-info">
            <h4 class="product-name">${ad.title}</h4>
            <p class="product-seller">${ad.seller_name} - ${ad.seller_location.split(',')[0]}</p>
            <p class="product-price">${ad.price}</p>
        </div>
    `;
    
    // Setup image fallback for walled garden restrictions
    const imgElement = card.querySelector('img');
    setupImageFallback(imgElement, ad.category, ad.id);
    
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
    const overlay = document.getElementById('adModalOverlay');
    const modal = document.getElementById('adModal');
    
    if (!overlay || !modal) {
        console.error('❌ Ad modal elements not found');
        return;
    }
    
    // Populate modal content
    const modalImg = document.getElementById('adModalImg');
    modalImg.src = ad.image_url;
    modalImg.alt = ad.title;
    // Reset fallback flag and setup fallback for modal image
    modalImg.dataset.fallbackAttempted = '';
    setupImageFallback(modalImg, ad.category, ad.id);
    
    document.getElementById('adModalTitle').textContent = ad.title;
    document.getElementById('adModalDescription').textContent = ad.description;
    document.getElementById('adModalSeller').textContent = ad.seller_name;
    document.getElementById('adModalLocation').textContent = ad.seller_location;
    document.getElementById('adModalPrice').textContent = ad.price;
    document.getElementById('adModalViews').innerHTML = `👁️ <span>${ad.views_count || 0}</span> views`;
    document.getElementById('adModalId').textContent = `Ad #${ad.id}`;
    
    // Badge
    const badgeEl = document.getElementById('adModalBadge');
    if (ad.badge_type && ad.badge_text) {
        badgeEl.textContent = ad.badge_text;
        badgeEl.className = `ad-modal-badge ${ad.badge_type}`;
        badgeEl.style.display = 'block';
    } else {
        badgeEl.style.display = 'none';
    }
    
    // Phone call link
    const callBtn = document.getElementById('adModalCallBtn');
    callBtn.href = `tel:${formatPhoneForCall(ad.phone_number)}`;
    callBtn.onclick = () => recordClick(ad.id, 'call');
    
    // Show modal
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    
    // Focus management
    setTimeout(() => {
        document.getElementById('adModalClose').focus();
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
    const overlay = document.getElementById('adModalOverlay');
    
    if (overlay) {
        overlay.classList.add('hidden');
        document.body.style.overflow = '';
    }
}

// ========================================
// RECORD AD CLICK - Analytics
// POST https://isp.bitwavetechnologies.com/api/ads/click
// ========================================
async function recordClick(adId, clickType) {
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
        mac_address: mikrotikParams?.mac || null
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
// POST https://isp.bitwavetechnologies.com/api/ads/impression
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
        placement
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
    const overlay = document.getElementById('adModalOverlay');
    const closeBtn = document.getElementById('adModalClose');
    
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
    const container = document.getElementById('successAdsScroll');
    const successAdsSection = document.querySelector('.success-ads');

    if (!container) return;

    if (window._heroAdsActive) renderSuccessSponsor();

    // No ads available - hide the section
    if (adsData.length === 0) {
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
    
    container.innerHTML = shuffled.map(ad => `
        <div class="success-ad-card" onclick="openAdDetailsById(${ad.id})" role="button" tabindex="0" 
             aria-label="View details for ${ad.title}" data-category="${ad.category || ''}" data-ad-id="${ad.id}">
            <img src="${ad.image_url}" alt="${ad.title}" class="success-ad-img" loading="lazy">
            <div class="success-ad-info">
                <div class="success-ad-title">${ad.title}</div>
                <div class="success-ad-price">${ad.price}</div>
            </div>
        </div>
    `).join('');
    
    // Setup image fallbacks for walled garden restrictions
    container.querySelectorAll('.success-ad-card').forEach(card => {
        const img = card.querySelector('img');
        const category = card.dataset.category;
        const adId = parseInt(card.dataset.adId, 10);
        setupImageFallback(img, category, adId);
        
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
    const paymentAdSection = document.querySelector('.payment-ad');

    if (!container) return;

    // Hero mode keeps the phone-number form free of ads; the sponsor plays
    // on the processing screen instead.
    if (window._heroAdsActive) {
        if (paymentAdSection) paymentAdSection.style.display = 'none';
        return;
    }

    // No ads available - hide the section
    if (adsData.length === 0) {
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
    
    container.innerHTML = shuffled.map(ad => `
        <div class="mini-product" onclick="openAdDetailsById(${ad.id})" role="button" tabindex="0"
             aria-label="View details for ${ad.title}" style="cursor: pointer;" data-category="${ad.category || ''}" data-ad-id="${ad.id}">
            <img src="${ad.image_url}" alt="${ad.title}" loading="lazy">
            <span>${ad.price}</span>
        </div>
    `).join('');
    
    // Setup image fallbacks and keyboard accessibility
    container.querySelectorAll('.mini-product').forEach(product => {
        const img = product.querySelector('img');
        const category = product.dataset.category;
        const adId = parseInt(product.dataset.adId, 10);
        setupImageFallback(img, category, adId);
        
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
// hero ads (image or muted video), then an open "advertise here" slot.
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
let heroAds = [];
const heroRot = { idx: 0, timer: null, seen: new Set(), seenTimer: null, track: null, segs: null };

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
    phone: '<svg class="ad-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
    chat: '<svg class="ad-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.8-.9L3 21l1.9-5.2A8.4 8.4 0 1 1 21 11.5z"/></svg>',
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
        <div class="hero-ad-top">
            <span class="hero-ad-brand">${AD_ICONS.wifi}${adEsc(heroBrandName())}</span>
            ${isVideo ? `<button type="button" class="hero-ad-mute" aria-label="Turn sound on">${AD_ICONS.muted}</button>` : ''}
        </div>`;
}

function heroFootHtml({ tag, name, offer, button, light }) {
    return `
        <div class="hero-ad-foot${light ? ' hero-ad-foot--light' : ''}">
            <div class="hero-ad-info">
                <div class="hero-ad-who"><span class="hero-ad-tag">${tag}</span><span class="hero-ad-name">${adEsc(name)}</span></div>
                ${offer ? `<div class="hero-ad-offer">${adEsc(offer)}</div>` : ''}
            </div>
            ${button || ''}
        </div>`;
}

function heroCallButton(ad) {
    const href = heroCallHref(ad);
    if (!href) return '';
    return `<a class="hero-ad-btn" href="${href}" data-hero-cta="call" data-ad-id="${ad.id}"
               aria-label="Call ${adEsc(ad.seller_name || ad.title)}">${AD_ICONS.phone}<span>Call</span></a>`;
}

function heroSlideHtml(ad, i, total) {
    const n = `${i + 1} of ${total}`;
    const name = ad.seller_name || ad.title;
    const offer = [ad.title, ad.price].filter(Boolean).join(' · ');

    if (ad.media_type === 'video' && ad.video_url) {
        return `
        <div class="hero-slide hero-slide--ad hero-slide--video" data-ad-id="${ad.id}" role="group"
             aria-roledescription="slide" aria-label="${n}: video ad from ${adEsc(name)}"
             style="background:${adEsc(ad.bg_color || '#0f172a')}">
            <video class="hero-ad-video" muted playsinline preload="none"
                   poster="${adEsc(ad.poster_url || '')}" data-src="${adEsc(ad.video_url)}"></video>
            ${heroTopHtml(true)}
            ${heroFootHtml({ tag: heroAdLabel(ad), name, offer, button: heroCallButton(ad) })}
        </div>`;
    }

    // A cut-out product shot sits on the right with the headline beside it;
    // a full photo carries its own message, so only the bar goes on top.
    const contain = ad.image_fit === 'contain';
    return `
        <div class="hero-slide hero-slide--ad hero-slide--image${contain ? ' hero-slide--contain' : ''}" data-ad-id="${ad.id}" role="group"
             aria-roledescription="slide" aria-label="${n}: ad from ${adEsc(name)}"
             style="background:${adEsc(ad.bg_color || '#0f172a')}">
            ${ad.image_url ? `<img class="hero-ad-img" src="${adEsc(ad.image_url)}" alt="" loading="lazy" decoding="async">` : ''}
            ${heroTopHtml(false)}
            ${contain ? `<div class="hero-ad-headline">${adEsc(ad.title)}${ad.price ? ` <span class="hero-ad-price">${adEsc(ad.price)}</span>` : ''}</div>` : ''}
            ${heroFootHtml({
                tag: heroAdLabel(ad), name,
                offer: contain ? (ad.description || ad.seller_location || '') : offer,
                button: heroCallButton(ad)
            })}
        </div>`;
}

function heroOpenSlotHtml(i, total) {
    // The button is a tel: link to the reseller; refreshSupportLinks() fills
    // the number in and keeps it hidden when the reseller has none on file.
    const brand = heroBrandName();
    const button = `<a href="#" class="hero-ad-btn hero-ad-btn--dark" data-support-link style="display:none"
                       aria-label="Call ${adEsc(brand)} to advertise">${AD_ICONS.phone}<span>Call</span></a>`;
    return `
        <div class="hero-slide hero-slide--ad hero-slide--open" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${total}: advertise here">
            ${heroTopHtml(false)}
            <div class="hero-ad-headline">Your business here<span class="hero-ad-sub">Seen by everyone who connects to this WiFi</span></div>
            ${heroFootHtml({ tag: 'Ad space', name: 'Book this space', offer: `Call ${brand}`, button, light: true })}
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

    const total = heroAds.length + 2;
    const track = document.createElement('div');
    track.className = 'hero-track';
    const welcome = document.createElement('div');
    welcome.className = 'hero-slide hero-slide--welcome';
    welcome.setAttribute('role', 'group');
    welcome.setAttribute('aria-roledescription', 'slide');
    welcome.setAttribute('aria-label', `1 of ${total}: welcome`);
    while (header.firstChild) welcome.appendChild(header.firstChild);
    track.appendChild(welcome);
    track.insertAdjacentHTML('beforeend',
        heroAds.map((ad, i) => heroSlideHtml(ad, i + 1, total)).join('') + heroOpenSlotHtml(total - 1, total));

    // Story-style segments: which slide this is, and how long it has left.
    const segs = document.createElement('div');
    segs.className = 'hero-segs';
    for (let i = 0; i < total; i++) {
        segs.insertAdjacentHTML('beforeend',
            `<button type="button" class="hero-seg" data-go="${i}" aria-label="Show slide ${i + 1} of ${total}"><span><i></i></span></button>`);
    }

    header.classList.add('has-hero-ads');
    header.setAttribute('aria-roledescription', 'carousel');
    header.appendChild(track);
    header.appendChild(segs);
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
    track.addEventListener('click', e => {
        const mute = e.target.closest('.hero-ad-mute');
        if (mute) {
            const v = mute.closest('.hero-slide').querySelector('video');
            v.muted = !v.muted;
            mute.innerHTML = v.muted ? AD_ICONS.muted : AD_ICONS.sound;
            mute.setAttribute('aria-label', v.muted ? 'Turn sound on' : 'Turn sound off');
            return;
        }
        const cta = e.target.closest('[data-hero-cta]');
        if (cta) recordClick(Number(cta.dataset.adId), 'call');
    });
    let x0 = null;
    track.addEventListener('pointerdown', e => { x0 = e.clientX; });
    track.addEventListener('pointerup', e => {
        if (x0 === null) return;
        const dx = e.clientX - x0;
        x0 = null;
        if (Math.abs(dx) > 40) { heroGo(heroRot.idx + (dx < 0 ? 1 : -1)); heroSchedule(); }
    });

    if (window.refreshSupportLinks) window.refreshSupportLinks();
    heroGo(0);
    heroSchedule();
}
window.mountHeroAds = mountHeroAds;

function heroReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
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
    });
    if (v) playAdVideo(v, false);
    // Fetch the next slide's video while this one shows, never earlier.
    const next = slides[(heroRot.idx + 1) % slides.length].querySelector('video');
    if (next && !next.src) { next.src = next.dataset.src; next.preload = 'metadata'; }

    clearTimeout(heroRot.seenTimer);
    const adId = Number(active.dataset.adId);
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
    const track = heroRot.track;
    if (!track || !track.isConnected || !heroOnPlansPage()) return;
    if (heroReducedMotion()) return;
    const v = track.children[heroRot.idx].querySelector('video');
    const advance = () => { heroGo(heroRot.idx + 1); heroSchedule(); };
    if (v) {
        // A video slide stays until the clip ends, capped so a long upload
        // can't hold the hero.
        const onEnd = () => { v.removeEventListener('ended', onEnd); clearTimeout(heroRot.timer); advance(); };
        v.addEventListener('ended', onEnd);
        heroRot.timer = setTimeout(() => { v.removeEventListener('ended', onEnd); advance(); }, HERO_VIDEO_MAX_MS);
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
    const waitVideo = document.querySelector('.wait-ad video');
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
    const bar = v.parentNode.querySelector('.ad-video-bar i');
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

function sponsorMediaHtml(ad) {
    const tag = `<span class="hero-ad-tag">${heroAdLabel(ad)}</span>`;
    if (ad.media_type === 'video' && ad.video_url) {
        return `
            <div class="ad-media ad-video" style="background:${adEsc(ad.bg_color || '#0f172a')}">
                <video muted playsinline preload="none" poster="${adEsc(ad.poster_url || '')}" data-src="${adEsc(ad.video_url)}"></video>
                ${tag}
                <span class="ad-video-bar"><i></i></span>
            </div>`;
    }
    if (!ad.image_url) return '';
    return `
        <div class="ad-media">
            <img class="ad-sponsor-img${ad.image_fit === 'contain' ? ' is-contain' : ''}" src="${adEsc(ad.image_url)}" alt="" style="background:${adEsc(ad.bg_color || '#0f172a')}">
            ${tag}
        </div>`;
}

// Who is advertising and what, under the sponsor's video. The Ad tag sits
// on the media's corner so a long name and a wide WhatsApp button both fit.
function sponsorWhoHtml(ad) {
    const offer = [ad.title, ad.price].filter(Boolean).join(' · ');
    return `
        <div class="wait-ad-who">
            <strong class="wait-ad-name">${adEsc(ad.seller_name || ad.title)}</strong>
            ${offer ? `<span class="wait-ad-offer">${adEsc(offer)}</span>` : ''}
        </div>`;
}

// "While you wait": the sponsor's video on the M-Pesa processing screen.
// Plays while the customer enters their PIN; the payment never waits for it.
function mountWaitAd() {
    const section = document.getElementById('processingSection');
    const ad = sponsorAd();
    if (!section || !ad || window._portalShowAds === false) return;
    if (!section.querySelector('.wait-ad')) {
        const box = document.createElement('div');
        box.className = 'wait-ad';
        box.innerHTML = `
            <div class="wait-ad-head">While you wait</div>
            <div class="wait-ad-card">
                ${sponsorMediaHtml(ad)}
                <div class="wait-ad-foot">
                    ${sponsorWhoHtml(ad)}
                    ${heroCallHref(ad) ? `<a class="wait-ad-cta" href="${heroCallHref(ad)}" data-ad-id="${ad.id}">${AD_ICONS.phone}<span>Call</span></a>` : ''}
                </div>
            </div>`;
        // Straight under "Check your phone" so most of it is on the first
        // screen; the hero still takes the top of the page here. Wide format
        // for the same reason (a 4:5 clip pushes the steps off screen).
        const anchor = section.querySelector('.processing-hero');
        if (anchor && anchor.nextSibling) section.insertBefore(box, anchor.nextSibling);
        else section.appendChild(box);
        const cta = box.querySelector('.wait-ad-cta');
        if (cta) cta.addEventListener('click', () => recordClick(ad.id, 'call'));
    }
    const v = section.querySelector('.wait-ad video');
    if (v) playAdVideo(v, true);
    recordImpression([ad.id], 'wait_screen');
}

function watchProcessingSection() {
    const section = document.getElementById('processingSection');
    if (!section || !window.MutationObserver) return;
    new MutationObserver(() => {
        const visible = !section.classList.contains('hidden');
        if (visible) mountWaitAd();
        else section.querySelectorAll('.wait-ad video').forEach(v => v.pause());
    }).observe(section, { attributes: true, attributeFilter: ['class'] });
}

// Success page: the sponsor card above the local-shops row. The customer is
// online now, so WhatsApp works here.
function renderSuccessSponsor() {
    const section = document.querySelector('.success-ads');
    const ad = sponsorAd();
    if (!section || !ad || window._portalShowAds === false) return;
    let card = document.getElementById('successSponsor');
    if (!card) {
        card = document.createElement('div');
        card.id = 'successSponsor';
        card.className = 'success-sponsor';
        section.parentNode.insertBefore(card, section);
    }
    const wa = ad.whatsapp_number || ad.phone_number;
    card.innerHTML = `
        <div class="wait-ad-head">Sponsored</div>
        <div class="wait-ad-card">
            ${sponsorMediaHtml(ad)}
            <div class="wait-ad-foot">
                ${sponsorWhoHtml(ad)}
                ${wa ? `<a class="wait-ad-cta" href="https://wa.me/${formatPhoneForWhatsApp(wa)}" target="_blank" rel="noopener" data-ad-id="${ad.id}">${AD_ICONS.chat}<span>WhatsApp</span></a>` : ''}
            </div>
        </div>`;
    const cta = card.querySelector('.wait-ad-cta');
    if (cta) cta.addEventListener('click', () => recordClick(ad.id, 'whatsapp'));
    const v = card.querySelector('video');
    if (v) playAdVideo(v, true);
    recordImpression([ad.id], 'success_page');
}

// ========================================
// INITIALIZE ADS FROM PORTAL DATA (called when portal endpoint provides ads)
// ========================================
function initAdsFromPortalData(portalAds) {
    if (Array.isArray(portalAds) && portalAds.length > 0) {
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
            const showcase = document.querySelector('.marketplace-showcase');
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

