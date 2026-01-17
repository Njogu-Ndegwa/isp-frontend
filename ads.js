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
            adsData = apiAds;
            renderAds(adsData);
            recordImpression(adsData.map(ad => ad.id));
            return adsData;
        }
        
        throw new Error('No ads returned from API');
        
    } catch (error) {
        console.warn('⚠️ Could not fetch ads from API:', error.message);
        console.log('📦 Using hardcoded ads as fallback');
        
        adsData = HARDCODED_ADS;
        renderAds(adsData);
        return adsData;
    }
}

// ========================================
// RENDER ADS IN SHOWCASE
// ========================================
function renderAds(ads) {
    const showcaseScroll = document.getElementById('showcaseScroll');
    if (!showcaseScroll) {
        console.warn('⚠️ Showcase scroll element not found');
        return;
    }
    
    // Remove skeleton loaders and existing product cards (except the CTA card)
    const existingCards = showcaseScroll.querySelectorAll('.product-card:not(.ad-cta-card)');
    existingCards.forEach(card => card.remove());
    
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
    
    card.innerHTML = `
        <div class="product-image">
            <img src="${ad.image_url}" alt="${ad.title}" loading="lazy">
            ${badgeHtml}
        </div>
        <div class="product-info">
            <h4 class="product-name">${ad.title}</h4>
            <p class="product-seller">${ad.seller_name} - ${ad.seller_location.split(',')[0]}</p>
            <p class="product-price">${ad.price}</p>
        </div>
    `;
    
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
    document.getElementById('adModalImg').src = ad.image_url;
    document.getElementById('adModalImg').alt = ad.title;
    document.getElementById('adModalTitle').textContent = ad.title;
    document.getElementById('adModalDescription').textContent = ad.description;
    document.getElementById('adModalSeller').textContent = ad.seller_name;
    document.getElementById('adModalLocation').textContent = ad.seller_location;
    document.getElementById('adModalPrice').textContent = ad.price;
    document.getElementById('adModalPhone').textContent = ad.phone_number;
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
// POST https://isp.bitwavetechnologies.com/api/ads/impression
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
// INITIALIZATION
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('📢 Ads Service Initialized');
    
    // Setup modal listeners
    setupModalListeners();
    
    // Fetch ads (will use hardcoded as fallback)
    fetchAds();
    
    // Retry any pending clicks
    retryPendingClicks();
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
console.log('💡 Debug commands: refreshAds(), getAdsData(), getAdsAnalytics()');

