// ========================================
// UPSELL MODULE v3 - Dynamic Offers Only
// ========================================
// BASE PLANS: Always show all 6 (constant)
// OFFER PLANS: 1-2 dynamic offers based on time of day
//
// Strategy: Show the 6 base plans + insert targeted offers
// to convert lower-paying buyers to higher value
// ========================================

// ========================================
// OFFER PLANS (These are the dynamic upsells)
// Create these on your backend with these IDs
// ========================================
const OFFER_PLANS = [
    {
        id: 101,
        name: "15 Minute Boost",
        speed: "5M/5M",
        price: 2,
        duration_value: 15,
        duration_unit: "MINUTES",
        connection_type: "hotspot",
        router_profile: "default",
        user_id: 1,
        isOffer: true,
        badge: "⏰ LIMITED",
        value_message: "+1 KSH = 2x time!",
        targets: "7-min buyers (ID 11)"
    },
    {
        id: 102,
        name: "2 Hour Session",
        speed: "5M/5M",
        price: 8,
        duration_value: 2,
        duration_unit: "HOURS",
        connection_type: "hotspot",
        router_profile: "default",
        user_id: 1,
        isOffer: true,
        badge: "⏰ LIMITED",
        value_message: "+3 KSH = 2x time!",
        targets: "1-hr buyers (ID 10)"
    },
    {
        id: 103,
        name: "Half Day Deal",
        speed: "5M/5M",
        price: 13,
        duration_value: 12,
        duration_unit: "HOURS",
        connection_type: "hotspot",
        router_profile: "default",
        user_id: 1,
        isOffer: true,
        badge: "⏰ LIMITED",
        value_message: "+1 KSH = 2x time!",
        targets: "6-hr buyers (ID 14)"
    },
    {
        id: 104,
        name: "Full Day Deal",
        speed: "5M/5M",
        price: 18,
        duration_value: 24,
        duration_unit: "HOURS",
        connection_type: "hotspot",
        router_profile: "default",
        user_id: 1,
        isOffer: true,
        badge: "⏰ LIMITED",
        value_message: "+3 KSH = all day!",
        targets: "12-hr buyers (ID 13)"
    },
    {
        id: 105,
        name: "3 Day Pass",
        speed: "5M/5M",
        price: 50,
        duration_value: 3,
        duration_unit: "DAYS",
        connection_type: "hotspot",
        router_profile: "default",
        user_id: 1,
        isOffer: true,
        badge: "⏰ LIMITED",
        value_message: "KSH 17/day!",
        targets: "24-hr buyers (ID 12)"
    }
];

// ========================================
// TIME-BASED OFFER STRATEGY
// Which OFFERS to show at each time of day
// Base plans are ALWAYS shown (all 6)
// ========================================
const TIME_OFFER_STRATEGY = {
    // Night (9pm-4am): 68% buy cheap plans (7-min, 1-hr)
    // Show: 2-Hr offer to convert 1-hr buyers
    night: {
        hours: [21, 22, 23, 0, 1, 2, 3, 4],
        offers: [102], // Just the 2-Hour Session
        reason: "Convert 1-hr (KSH 5) → 2-hr (KSH 8)"
    },
    
    // Early Morning (5-7am): Workers arriving, quick sessions
    // Show: 15-min and 2-hr offers
    early_morning: {
        hours: [5, 6, 7],
        offers: [101, 102], // 15-min Boost + 2-Hour Session
        reason: "Convert quick testers to longer sessions"
    },
    
    // Morning Peak (8-11am): Best spending time
    // Show: 2-hr and Full Day offers
    morning_peak: {
        hours: [8, 9, 10, 11],
        offers: [102, 104], // 2-Hour + Full Day Deal
        reason: "Push towards full day plans"
    },
    
    // Midday (12-2pm): Lunch break users
    // Show: 2-hr offer (lunch session)
    midday: {
        hours: [12, 13, 14],
        offers: [102], // 2-Hour Session
        reason: "Convert 1-hr lunch break to 2-hr"
    },
    
    // Afternoon (3-5pm): Lots of 1-hr buyers
    // Show: 2-hr offer only (focused)
    afternoon: {
        hours: [15, 16, 17],
        offers: [102], // 2-Hour Session ONLY
        reason: "Heavy 1-hr buying - focus on 2-hr conversion"
    },
    
    // Evening (6-8pm): WORST time - 79% buy cheap!
    // Show: 15-min and 2-hr offers
    evening: {
        hours: [18, 19, 20],
        offers: [101, 102], // 15-min Boost + 2-Hour Session
        reason: "Critical: Convert cheap evening buyers"
    }
};

// ========================================
// GET CURRENT TIME ZONE
// ========================================
function getCurrentTimeZone() {
    const hour = new Date().getHours();
    
    for (const [zoneName, config] of Object.entries(TIME_OFFER_STRATEGY)) {
        if (config.hours.includes(hour)) {
            return { name: zoneName, config };
        }
    }
    
    // Default to night if not found
    return { name: 'night', config: TIME_OFFER_STRATEGY.night };
}

// ========================================
// GET OFFERS FOR CURRENT TIME
// ========================================
function getCurrentOffers() {
    const timeZone = getCurrentTimeZone();
    const offerIds = timeZone.config.offers;
    
    const offers = OFFER_PLANS.filter(plan => offerIds.includes(plan.id));
    
    console.log(`⏰ Time Zone: ${timeZone.name}`);
    console.log(`🎯 Strategy: ${timeZone.config.reason}`);
    console.log(`💰 Offers: ${offers.map(o => `${o.name} (KSH ${o.price})`).join(', ')}`);
    
    return {
        offers,
        zoneName: timeZone.name,
        reason: timeZone.config.reason
    };
}

// ========================================
// HELPER FUNCTIONS
// ========================================
function formatDuration(value, unit) {
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

function formatSpeed(speed) {
    if (!speed || speed === 'Unlimited' || speed.toLowerCase() === 'unlimited') {
        return 'Unlimited';
    }
    const downloadSpeed = speed.split('/')[0].trim();
    if (downloadSpeed.match(/^\d+(\.\d+)?[mM]$/)) {
        return downloadSpeed.replace(/[mM]$/, 'Mbps');
    }
    return downloadSpeed;
}

function formatPriceHTML(price) {
    const priceStr = `KSH ${price}/-`;
    const match = priceStr.match(/^(KSH)\s*(.+)$/);
    if (match) {
        return `<span class="currency-code">${match[1]}</span> ${match[2]}`;
    }
    return priceStr;
}

// ========================================
// CALCULATE TIME REMAINING IN CURRENT ZONE
// ========================================
function getTimeRemainingInZone() {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentSecond = now.getSeconds();
    
    const timeZone = getCurrentTimeZone();
    const hours = timeZone.config.hours;
    
    // Find the end hour of this zone
    // Hours might wrap around midnight (e.g., [21,22,23,0,1,2,3,4])
    let endHour;
    
    // Check if hours wrap around midnight
    const hasWrap = hours.includes(23) && hours.includes(0);
    
    if (hasWrap) {
        // Find the last hour after midnight
        const afterMidnight = hours.filter(h => h < 12);
        const beforeMidnight = hours.filter(h => h >= 12);
        
        if (currentHour >= 12) {
            // We're before midnight, end is after the last after-midnight hour
            endHour = Math.max(...afterMidnight) + 1;
        } else {
            // We're after midnight
            endHour = Math.max(...afterMidnight) + 1;
        }
    } else {
        endHour = Math.max(...hours) + 1;
    }
    
    // Calculate end time
    let endTime = new Date(now);
    endTime.setHours(endHour, 0, 0, 0);
    
    // If end time is in the past (wrapped to next day), add a day
    if (endTime <= now) {
        endTime.setDate(endTime.getDate() + 1);
    }
    
    // Calculate difference
    const diffMs = endTime - now;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const diffSeconds = Math.floor((diffMs % (1000 * 60)) / 1000);
    
    return {
        hours: diffHours,
        minutes: diffMinutes,
        seconds: diffSeconds,
        totalSeconds: Math.floor(diffMs / 1000)
    };
}

// ========================================
// FORMAT COUNTDOWN STRING
// ========================================
function formatCountdown(remaining) {
    if (remaining.hours > 0) {
        return `${remaining.hours}h ${remaining.minutes}m`;
    } else if (remaining.minutes > 0) {
        return `${remaining.minutes}m ${remaining.seconds}s`;
    } else {
        return `${remaining.seconds}s`;
    }
}

// ========================================
// COUNTDOWN TIMER - Updates every second
// ========================================
const countdownTimers = {};

function startCountdownTimer(card, offerId) {
    // Clear existing timer if any
    if (countdownTimers[offerId]) {
        clearInterval(countdownTimers[offerId]);
    }
    
    const countdownEl = card.querySelector('.countdown-text');
    if (!countdownEl) return;
    
    // Update every second
    countdownTimers[offerId] = setInterval(() => {
        const remaining = getTimeRemainingInZone();
        
        if (remaining.totalSeconds <= 0) {
            // Time's up - refresh offers
            clearInterval(countdownTimers[offerId]);
            countdownEl.textContent = 'Refreshing...';
            setTimeout(() => {
                injectOffers();
            }, 1000);
            return;
        }
        
        countdownEl.textContent = `Ends in ${formatCountdown(remaining)}`;
        
        // Add urgency class when less than 5 minutes
        if (remaining.totalSeconds < 300) {
            card.classList.add('offer-urgent');
        }
    }, 1000);
}

// Clean up timers when page unloads
window.addEventListener('beforeunload', () => {
    Object.values(countdownTimers).forEach(timer => clearInterval(timer));
});

// ========================================
// CREATE OFFER CARD (Styled differently from base plans)
// ========================================
function createOfferCard(offer) {
    const card = document.createElement('div');
    card.className = 'plan-card offer-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    
    const duration = formatDuration(offer.duration_value, offer.duration_unit);
    const speed = formatSpeed(offer.speed);
    const formattedPrice = formatPriceHTML(offer.price);
    
    // Get countdown
    const remaining = getTimeRemainingInZone();
    const countdownText = formatCountdown(remaining);
    
    card.setAttribute('aria-label', `Special Offer: ${duration} for KSH ${offer.price}, ${speed}`);
    
    card.innerHTML = `
        <div class="plan-duration">${duration}</div>
        <div class="plan-price">${formattedPrice}</div>
        <div class="plan-speed">${speed}</div>
        <div class="offer-countdown" data-offer-id="${offer.id}">
            <span class="countdown-icon">⏰</span>
            <span class="countdown-text">Ends in ${countdownText}</span>
        </div>
    `;
    
    // Start countdown timer for this card
    startCountdownTimer(card, offer.id);
    
    // Click handler - same as regular plans
    card.addEventListener('click', () => {
        const planData = {
            id: offer.id,
            duration: duration,
            price: `KSH ${offer.price}/-`,
            speed: speed,
            originalData: offer
        };
        
        if (typeof selectPlan === 'function') {
            selectPlan(planData);
        } else {
            console.log('Selected offer:', offer);
        }
    });
    
    card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            card.click();
        }
    });
    
    return card;
}

// ========================================
// INJECT OFFERS INTO PLANS GRID
// Called after base plans are rendered
// ========================================
function injectOffers() {
    const plansGrid = document.getElementById('plansGrid');
    if (!plansGrid) {
        console.error('❌ Plans grid not found');
        return;
    }
    
    // Remove any existing offers first
    const existingOffers = plansGrid.querySelectorAll('.offer-card');
    existingOffers.forEach(offer => offer.remove());
    
    // Remove existing offer banner
    const existingBanner = plansGrid.querySelector('.offer-banner');
    if (existingBanner) existingBanner.remove();
    
    // Get current offers
    const { offers, zoneName, reason } = getCurrentOffers();
    
    if (offers.length === 0) {
        console.log('📭 No offers for current time zone');
        return;
    }
    
    // Create offer banner
    const banner = document.createElement('div');
    banner.className = 'offer-banner';
    banner.innerHTML = `<span>🎁 Special Offers</span>`;
    
    // Insert banner at top of grid
    plansGrid.insertBefore(banner, plansGrid.firstChild);
    
    // Insert offer cards after banner
    offers.forEach((offer, index) => {
        const card = createOfferCard(offer);
        // Insert after banner (position 1, 2, etc.)
        const insertPosition = plansGrid.children[index + 1];
        if (insertPosition) {
            plansGrid.insertBefore(card, insertPosition);
        } else {
            plansGrid.appendChild(card);
        }
    });
    
    console.log(`✅ Injected ${offers.length} offer(s) for ${zoneName}`);
    console.log(`📌 Reason: ${reason}`);
}

// ========================================
// INITIALIZE
// ========================================
function initializeOffers() {
    console.log('🎁 Offer System v3 Initializing...');
    
    const timeZone = getCurrentTimeZone();
    console.log(`⏰ Current time zone: ${timeZone.name}`);
    console.log(`📌 Strategy: ${timeZone.config.reason}`);
    console.log(`💰 Active offers: ${timeZone.config.offers.join(', ')}`);
    
    // Wait a bit for base plans to render, then inject offers
    setTimeout(() => {
        injectOffers();
    }, 200);
}

// ========================================
// AUTO-INITIALIZE AFTER DOM LOADS
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    // Wait for script.js to render base plans first
    setTimeout(() => {
        initializeOffers();
    }, 300);
});

// ========================================
// EXPORTS FOR DEBUGGING
// ========================================
window.OfferSystem = {
    OFFER_PLANS,
    TIME_OFFER_STRATEGY,
    getCurrentTimeZone,
    getCurrentOffers,
    injectOffers,
    initializeOffers
};

console.log('📦 Offer System v3 Loaded');
console.log('💡 Debug: OfferSystem.injectOffers() to refresh offers');
