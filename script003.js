// ========================================
// SCRIPT003.JS - Marketplace Ads & UI Enhancements
// Works alongside script.js
// ========================================

// ========================================
// SAMPLE MARKETPLACE ADS DATA
// In production, this would come from an API
// ========================================
const marketplaceAds = [
    {
        id: 1,
        name: "Fresh Tomatoes",
        seller: "Mama Njeri - Stall 42",
        price: "KSH 80",
        unit: "/kg",
        image: "images/tomatoes.jpg",
        badge: { type: "hot", text: "🔥 Hot" }
    },
    {
        id: 2,
        name: "Phone Cases",
        seller: "Tech Corner - B12",
        price: "KSH 150",
        unit: "+",
        image: "images/phone-cases.jpg",
        badge: { type: "new", text: "✨ New" }
    },
    {
        id: 3,
        name: "Sukuma Wiki",
        seller: "Shamba Fresh - A7",
        price: "KSH 30",
        unit: "/bunch",
        image: "images/sukuma-wiki.jpg",
        badge: null
    },
    {
        id: 4,
        name: "Fashion Watches",
        seller: "Style Hub - C3",
        price: "KSH 500",
        unit: "+",
        image: "images/watches.jpg",
        badge: { type: "sale", text: "💰 Sale" }
    },
    {
        id: 5,
        name: "Ripe Bananas",
        seller: "Fruits Paradise - D5",
        price: "KSH 100",
        unit: "/dozen",
        image: "images/bananas.jpg",
        badge: null
    },
    {
        id: 6,
        name: "Fresh Eggs",
        seller: "Farm Direct - E8",
        price: "KSH 450",
        unit: "/tray",
        image: "images/tomatoes.jpg",
        badge: { type: "hot", text: "🔥 Hot" }
    },
    {
        id: 7,
        name: "Maize Flour",
        seller: "Posho Mill - F2",
        price: "KSH 180",
        unit: "/2kg",
        image: "images/bananas.jpg",
        badge: null
    }
];

// ========================================
// INITIALIZE ON DOM LOAD
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    initializeMarketplace();
    // Mini products now populated by ads.js with proper ad data
    // initializeMiniProducts();
    enhanceScrollHint();
});

// ========================================
// MARKETPLACE SHOWCASE - Auto Scroll
// ========================================
function initializeMarketplace() {
    const showcase = document.getElementById('showcaseScroll');
    if (!showcase) return;
    
    // Optional: Auto-scroll the showcase every 5 seconds
    let scrollInterval;
    let isHovering = false;
    
    function autoScroll() {
        if (isHovering) return;
        
        const scrollAmount = 150; // One card width
        const maxScroll = showcase.scrollWidth - showcase.clientWidth;
        
        if (showcase.scrollLeft >= maxScroll - 10) {
            // Reset to beginning with smooth animation
            showcase.scrollTo({ left: 0, behavior: 'smooth' });
        } else {
            showcase.scrollBy({ left: scrollAmount, behavior: 'smooth' });
        }
    }
    
    // Start auto-scroll on mobile (touch devices)
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
        scrollInterval = setInterval(autoScroll, 4000);
    }
    
    // Pause on hover/touch
    showcase.addEventListener('mouseenter', () => { isHovering = true; });
    showcase.addEventListener('mouseleave', () => { isHovering = false; });
    showcase.addEventListener('touchstart', () => { isHovering = true; }, { passive: true });
    showcase.addEventListener('touchend', () => { 
        isHovering = false;
        // Reset interval after touch
        if (scrollInterval) {
            clearInterval(scrollInterval);
            scrollInterval = setInterval(autoScroll, 4000);
        }
    }, { passive: true });
}

// ========================================
// MINI PRODUCTS - Payment Section Ads
// ========================================
function initializeMiniProducts() {
    const container = document.getElementById('miniProducts');
    if (!container) return;
    
    // Select random products for the mini showcase
    const shuffled = [...marketplaceAds].sort(() => 0.5 - Math.random());
    const selectedProducts = shuffled.slice(0, 4);
    
    container.innerHTML = selectedProducts.map(product => `
        <div class="mini-product" onclick="openAdDetailsById(${product.id})" role="button" tabindex="0"
             aria-label="View details for ${product.name}" style="cursor: pointer;">
            <img src="${product.image}" alt="${product.name}" loading="lazy">
            <span>${product.price}</span>
        </div>
    `).join('');
    
    // Add keyboard accessibility
    container.querySelectorAll('.mini-product').forEach(product => {
        product.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                product.click();
            }
        });
    });
}

// ========================================
// SCROLL HINT ENHANCEMENT
// ========================================
function enhanceScrollHint() {
    const scrollHint = document.querySelector('.scroll-hint');
    const showcase = document.getElementById('showcaseScroll');
    
    if (!scrollHint || !showcase) return;
    
    // Hide hint after user scrolls the showcase
    let hasScrolled = false;
    
    showcase.addEventListener('scroll', () => {
        if (!hasScrolled && showcase.scrollLeft > 50) {
            hasScrolled = true;
            scrollHint.style.opacity = '0';
            setTimeout(() => {
                scrollHint.style.display = 'none';
            }, 300);
        }
    }, { passive: true });
    
    // Also hide after 5 seconds
    setTimeout(() => {
        if (!hasScrolled) {
            scrollHint.style.opacity = '0';
            setTimeout(() => {
                scrollHint.style.display = 'none';
            }, 300);
        }
    }, 5000);
}

// ========================================
// PRODUCT CARD CLICK HANDLER
// In a real app, this would open product details
// ========================================
document.addEventListener('click', (e) => {
    const productCard = e.target.closest('.product-card:not(.cta-card)');
    if (productCard) {
        // Visual feedback
        productCard.style.transform = 'scale(0.95)';
        setTimeout(() => {
            productCard.style.transform = '';
        }, 150);
        
        // In production: Could open a modal or link to seller
        console.log('🛒 Product clicked:', productCard.querySelector('.product-name')?.textContent);
    }
});

// ========================================
// DYNAMIC AD CONTENT LOADING
// This function can be called to update ads from an API
// ========================================
async function loadMarketplaceAds(apiUrl) {
    try {
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error('Failed to load ads');
        
        const ads = await response.json();
        renderMarketplaceAds(ads);
    } catch (error) {
        console.log('📢 Using default marketplace ads');
        // Keep the existing static ads
    }
}

function renderMarketplaceAds(ads) {
    const showcase = document.getElementById('showcaseScroll');
    if (!showcase || !ads.length) return;
    
    const adsHTML = ads.map(ad => `
        <div class="product-card" data-id="${ad.id}">
            <div class="product-image">
                <img src="${ad.image}" alt="${ad.name}" loading="lazy">
                ${ad.badge ? `<span class="product-badge ${ad.badge.type}">${ad.badge.text}</span>` : ''}
            </div>
            <div class="product-info">
                <h4 class="product-name">${ad.name}</h4>
                <p class="product-seller">${ad.seller}</p>
                <p class="product-price">${ad.price}<span>${ad.unit}</span></p>
            </div>
        </div>
    `).join('');
    
    // Keep the CTA card at the end
    const ctaCard = `
        <div class="product-card cta-card">
            <div class="cta-content">
                <span class="cta-icon">📢</span>
                <h4>Advertise Here!</h4>
                <p>Show your products to thousands of customers</p>
                <span class="cta-link">Call 0795635364</span>
            </div>
        </div>
    `;
    
    showcase.innerHTML = adsHTML + ctaCard;
}

// ========================================
// CONSOLE LOG
// ========================================
console.log('🛒 Marketplace Ads Module Loaded');
console.log('📢 To load custom ads, call: loadMarketplaceAds(apiUrl)');

