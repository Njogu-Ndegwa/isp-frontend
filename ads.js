// ========================================
// ADS SERVICE - Bitwave Soko WiFi
// Handles ad fetching, display, and click tracking
// ========================================

// ========================================
// BACKEND API CONFIGURATION
// ========================================
const ADS_API_BASE_URL = 'https://isp.bitwavetechnologies.net/api';
const ADS_ENDPOINT = `${ADS_API_BASE_URL}/ads`;
const AD_CLICK_ENDPOINT = `${ADS_API_BASE_URL}/ads/click`;
const AD_IMPRESSION_ENDPOINT = `${ADS_API_BASE_URL}/ads/impression`;

// Note: Backend API format from https://isp.bitwavetechnologies.net/api/ads

// ========================================
// DATA TRANSFER OBJECTS (DTOs)
// These define the structure of data exchanged with the backend
// API Base: https://isp.bitwavetechnologies.net/api
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
        
        const response = await fetch(ADS_ENDPOINT, {
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
            // Apply local images for configured ads (use frontend as primary storage)
            adsData = applyLocalImages(apiAds);
            showAdSections();
            renderAds(adsData);
            recordImpression(adsData.map(ad => ad.id));
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
// Keeps the showcase with CTA card visible for advertisers
// ========================================
function hideAdSections() {
    // Keep marketplace showcase visible but show only CTA card
    const showcaseSection = document.querySelector('.marketplace-showcase');
    const showcaseScroll = document.getElementById('showcaseScroll');
    
    if (showcaseSection && showcaseScroll) {
        // Show the showcase section
        showcaseSection.style.display = '';
        
        // Remove skeleton loaders and product cards, keep only CTA card
        const existingCards = showcaseScroll.querySelectorAll('.product-card:not(.ad-cta-card), .ad-skeleton');
        existingCards.forEach(card => card.remove());
        
        // Hide the scroll hint since there's nothing to scroll
        const scrollHint = showcaseSection.querySelector('.scroll-hint');
        if (scrollHint) {
            scrollHint.style.display = 'none';
        }
        
        // Update the showcase title to encourage advertisers
        const showcaseTitle = showcaseSection.querySelector('.showcase-title');
        if (showcaseTitle) {
            showcaseTitle.textContent = '📢 Advertise Here';
        }
        
        console.log('📢 Showing CTA card for advertisers');
    }
    
    // Hide inline promo
    const inlinePromo = document.querySelector('.inline-promo');
    if (inlinePromo) {
        inlinePromo.style.display = 'none';
    }
    
    // Hide payment ad section
    const paymentAd = document.querySelector('.payment-ad');
    if (paymentAd) {
        paymentAd.style.display = 'none';
    }
    
    // Hide success page ads
    const successAds = document.querySelector('.success-ads');
    if (successAds) {
        successAds.style.display = 'none';
    }
    
    console.log('🙈 Ad content sections hidden (CTA visible)');
}

// ========================================
// SHOW ALL AD SECTIONS (when ads are available)
// ========================================
function showAdSections() {
    // Show marketplace showcase section
    const showcaseSection = document.querySelector('.marketplace-showcase');
    if (showcaseSection) {
        showcaseSection.style.display = '';
        
        // Restore original title
        const showcaseTitle = showcaseSection.querySelector('.showcase-title');
        if (showcaseTitle) {
            showcaseTitle.textContent = '🛒 Soko Deals Today';
        }
        
        // Show scroll hint
        const scrollHint = showcaseSection.querySelector('.scroll-hint');
        if (scrollHint) {
            scrollHint.style.display = '';
        }
    }
    
    // Show inline promo
    const inlinePromo = document.querySelector('.inline-promo');
    if (inlinePromo) {
        inlinePromo.style.display = '';
    }
    
    // Show payment ad section
    const paymentAd = document.querySelector('.payment-ad');
    if (paymentAd) {
        paymentAd.style.display = '';
    }
    
    // Show success page ads
    const successAds = document.querySelector('.success-ads');
    if (successAds) {
        successAds.style.display = '';
    }
    
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
// POST https://isp.bitwavetechnologies.net/api/ads/click
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
        const response = await fetch(AD_CLICK_ENDPOINT, {
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
        // Store locally for retry later
        storeClickLocally(clickData);
    }
}

// ========================================
// RECORD AD IMPRESSION - Analytics
// POST https://isp.bitwavetechnologies.net/api/ads/impression
// ========================================
async function recordImpression(adIds) {
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
        placement: 'showcase_carousel'
    };
    
    try {
        const response = await fetch(AD_IMPRESSION_ENDPOINT, {
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
                const response = await fetch(AD_CLICK_ENDPOINT, {
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
// INITIALIZE ADS FROM PORTAL DATA (called when portal endpoint provides ads)
// ========================================
function initAdsFromPortalData(portalAds) {
    if (Array.isArray(portalAds) && portalAds.length > 0) {
        adsData = applyLocalImages(portalAds);
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

