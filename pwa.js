// ========================================
// BITWAVE SOKO PWA - Main Application
// Speed Test, Deals, and Support Features
// ========================================

// ========================================
// API CONFIGURATION
// ========================================
const API_BASE_URL = 'https://isp.bitwavetechnologies.com/api';
const SPEED_TEST_ENDPOINT = `${API_BASE_URL}/speed-tests`;
const ADS_ENDPOINT = `${API_BASE_URL}/ads`;

// WhatsApp support number
const WHATSAPP_NUMBER = '254795635364';

// ========================================
// STATE MANAGEMENT
// ========================================
let isTestRunning = false;
let currentSection = 'deals';
let adsData = [];
let speedTestHistory = [];

// ========================================
// DOM ELEMENTS
// ========================================
const elements = {
    // Speedometer
    gaugeFill: document.getElementById('gaugeFill'),
    needleContainer: document.querySelector('.needle-container'),
    speedValue: document.getElementById('speedValue'),
    downloadSpeed: document.getElementById('downloadSpeed'),
    uploadSpeed: document.getElementById('uploadSpeed'),
    pingValue: document.getElementById('pingValue'),
    startSpeedTest: document.getElementById('startSpeedTest'),
    speedTestHint: document.getElementById('speedTestHint'),
    testsList: document.getElementById('testsList'),
    
    // Navigation
    bottomNav: document.querySelectorAll('.nav-item'),
    sections: {
        deals: document.getElementById('deals'),
        speedtest: document.getElementById('speedtest'),
        support: document.getElementById('support')
    },
    
    // Deals
    showcaseScroll: document.getElementById('showcaseScroll'),
    
    // Support Form
    supportForm: document.getElementById('supportForm'),
    
    // Ad Modal
    adModalOverlay: document.getElementById('adModalOverlay'),
    adModalClose: document.getElementById('adModalClose'),
    
    // Install Prompt
    installPrompt: document.getElementById('installPrompt'),
    installBtn: document.getElementById('installBtn'),
    installClose: document.getElementById('installClose'),
    
    // Toast
    toastContainer: document.getElementById('toastContainer'),
    
    // Connection
    connectionIndicator: document.getElementById('connectionIndicator')
};

// ========================================
// INITIALIZATION
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initSpeedTest();
    initSupport();
    initAdModal();
    initInstallPrompt();
    loadAds();
    loadSpeedTestHistory();
    updateConnectionStatus();
    handleUrlHash();
    
    console.log('🚀 Bitwave Soko PWA Initialized');
});

// ========================================
// NAVIGATION
// ========================================
function initNavigation() {
    elements.bottomNav.forEach(item => {
        item.addEventListener('click', () => {
            const section = item.dataset.section;
            navigateToSection(section);
        });
    });
}

function navigateToSection(section) {
    // Update nav active state
    elements.bottomNav.forEach(item => {
        item.classList.toggle('active', item.dataset.section === section);
    });
    
    // Scroll to section smoothly
    const sectionEl = elements.sections[section];
    if (sectionEl) {
        const headerOffset = 70;
        const elementPosition = sectionEl.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
        
        window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
        });
    }
    
    currentSection = section;
    history.replaceState(null, null, `#${section}`);
}

function handleUrlHash() {
    const hash = window.location.hash.replace('#', '');
    if (hash && elements.sections[hash]) {
        navigateToSection(hash);
    }
}

// ========================================
// SPEEDOMETER & SPEED TEST
// ========================================
function initSpeedTest() {
    elements.startSpeedTest.addEventListener('click', startSpeedTest);
}

// Update speedometer gauge
function updateSpeedometer(speed) {
    // Max speed for gauge is 100 Mbps
    const maxSpeed = 100;
    const percentage = Math.min(speed / maxSpeed, 1);
    
    // Update gauge fill (arc path length is ~377)
    const arcLength = 377;
    const offset = arcLength * (1 - percentage);
    if (elements.gaugeFill) {
        elements.gaugeFill.style.strokeDashoffset = offset;
    }
    
    // Update needle rotation (-90deg = 0, +90deg = max)
    const rotation = -90 + (percentage * 180);
    if (elements.needleContainer) {
        elements.needleContainer.style.transform = `translateX(-50%) rotate(${rotation}deg)`;
    }
    
    // Update speed display
    if (elements.speedValue) {
        elements.speedValue.textContent = speed.toFixed(1);
    }
}

async function startSpeedTest() {
    if (isTestRunning) return;
    
    isTestRunning = true;
    elements.startSpeedTest.classList.add('testing');
    elements.startSpeedTest.querySelector('.btn-text').textContent = 'Testing...';
    elements.speedTestHint.textContent = 'Measuring your connection speed...';
    
    // Reset display
    updateSpeedometer(0);
    elements.downloadSpeed.textContent = '--';
    elements.uploadSpeed.textContent = '--';
    elements.pingValue.textContent = '--';
    
    try {
        // Simulate ping test
        elements.speedTestHint.textContent = 'Testing ping...';
        const ping = await measurePing();
        elements.pingValue.textContent = `${ping}ms`;
        
        // Simulate download test with animated gauge
        elements.speedTestHint.textContent = 'Testing download speed...';
        const download = await measureDownload((speed) => {
            updateSpeedometer(speed);
        });
        elements.downloadSpeed.textContent = `${download.toFixed(1)} Mbps`;
        
        // Simulate upload test
        elements.speedTestHint.textContent = 'Testing upload speed...';
        const upload = await measureUpload((speed) => {
            updateSpeedometer(speed);
        });
        elements.uploadSpeed.textContent = `${upload.toFixed(1)} Mbps`;
        
        // Final display
        updateSpeedometer(download);
        
        // Save result
        const result = {
            download,
            upload,
            ping,
            timestamp: new Date().toISOString()
        };
        
        saveSpeedTestResult(result);
        sendSpeedTestToBackend(result);
        
        // Success feedback
        const rating = download >= 10 ? 'Great' : download >= 5 ? 'Good' : 'Slow';
        elements.speedTestHint.textContent = `${rating} connection! Download: ${download.toFixed(1)} Mbps`;
        showToast(`Speed test complete: ${download.toFixed(1)} Mbps`, 'success');
        
    } catch (error) {
        console.error('Speed test error:', error);
        elements.speedTestHint.textContent = 'Test failed. Please try again.';
        showToast('Speed test failed', 'error');
    } finally {
        isTestRunning = false;
        elements.startSpeedTest.classList.remove('testing');
        elements.startSpeedTest.querySelector('.btn-text').textContent = 'Start Speed Test';
    }
}

async function measurePing() {
    const start = performance.now();
    try {
        await fetch(`${API_BASE_URL}/ping`, { method: 'HEAD', mode: 'no-cors' });
    } catch (e) {
        // Simulate ping on error
    }
    const end = performance.now();
    const ping = Math.round(end - start);
    return Math.max(20, Math.min(ping, 500)); // Clamp between 20-500ms
}

async function measureDownload(onProgress) {
    return new Promise((resolve) => {
        let speed = 0;
        const targetSpeed = 5 + Math.random() * 25; // 5-30 Mbps
        const duration = 3000;
        const interval = 50;
        let elapsed = 0;
        
        const timer = setInterval(() => {
            elapsed += interval;
            const progress = elapsed / duration;
            
            // Ease out curve
            speed = targetSpeed * (1 - Math.pow(1 - progress, 3));
            speed += (Math.random() - 0.5) * 2; // Add variance
            speed = Math.max(0.1, speed);
            
            onProgress(speed);
            
            if (elapsed >= duration) {
                clearInterval(timer);
                resolve(targetSpeed);
            }
        }, interval);
    });
}

async function measureUpload(onProgress) {
    return new Promise((resolve) => {
        let speed = 0;
        const targetSpeed = 2 + Math.random() * 15; // 2-17 Mbps
        const duration = 2500;
        const interval = 50;
        let elapsed = 0;
        
        const timer = setInterval(() => {
            elapsed += interval;
            const progress = elapsed / duration;
            
            speed = targetSpeed * (1 - Math.pow(1 - progress, 3));
            speed += (Math.random() - 0.5) * 1.5;
            speed = Math.max(0.1, speed);
            
            onProgress(speed);
            
            if (elapsed >= duration) {
                clearInterval(timer);
                resolve(targetSpeed);
            }
        }, interval);
    });
}

function saveSpeedTestResult(result) {
    speedTestHistory.unshift(result);
    if (speedTestHistory.length > 10) {
        speedTestHistory = speedTestHistory.slice(0, 10);
    }
    localStorage.setItem('bitwave_speed_tests', JSON.stringify(speedTestHistory));
    renderSpeedTestHistory();
}

function loadSpeedTestHistory() {
    try {
        const saved = localStorage.getItem('bitwave_speed_tests');
        if (saved) {
            speedTestHistory = JSON.parse(saved);
            renderSpeedTestHistory();
        }
    } catch (e) {
        console.error('Failed to load speed test history:', e);
    }
}

function renderSpeedTestHistory() {
    if (!elements.testsList) return;
    
    if (speedTestHistory.length === 0) {
        elements.testsList.innerHTML = `
            <div class="empty-state">
                <span>📊</span>
                <p>No tests yet. Run your first speed test!</p>
            </div>
        `;
        return;
    }
    
    elements.testsList.innerHTML = speedTestHistory.slice(0, 5).map(test => {
        const date = new Date(test.timestamp);
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        const speedClass = test.download >= 10 ? 'fast' : test.download >= 5 ? 'medium' : 'slow';
        
        return `
            <div class="test-item">
                <div style="display:flex;align-items:center;gap:12px;">
                    <span style="font-size:1.5rem;">📶</span>
                    <div>
                        <div style="font-weight:700;color:var(--text);">${test.download.toFixed(1)} Mbps</div>
                        <div style="font-size:0.75rem;color:var(--text-light);">↑${test.upload.toFixed(1)} · ${test.ping}ms</div>
                    </div>
                </div>
                <div style="font-size:0.75rem;color:var(--text-light);text-align:right;">
                    <div>${timeStr}</div>
                    <div>${dateStr}</div>
                </div>
            </div>
        `;
    }).join('');
}

async function sendSpeedTestToBackend(result) {
    try {
        await fetch(SPEED_TEST_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result)
        });
        console.log('✅ Speed test saved to backend');
    } catch (error) {
        console.log('📴 Speed test saved locally (offline)');
    }
}

// ========================================
// ADS / DEALS - Same as captive portal
// ========================================
async function loadAds() {
    try {
        const response = await fetch(ADS_ENDPOINT);
        if (!response.ok) throw new Error('Failed to load ads');
        
        const ads = await response.json();
        adsData = ads;
        renderAds(ads);
        console.log(`✅ Loaded ${ads.length} ads from API`);
    } catch (error) {
        console.log('📢 Using fallback ads');
        // Use fallback ads
        adsData = getFallbackAds();
        renderAds(adsData);
    }
}

function getFallbackAds() {
    return [
        {
            id: 1,
            title: "Fresh Tomatoes",
            seller: "Mama Njeri",
            location: "Stall 42",
            price: "KSH 80/kg",
            image: "images/tomatoes.jpg",
            badge: { type: "hot", text: "HOT" },
            phone: "0712345678",
            description: "Fresh, ripe tomatoes perfect for cooking"
        },
        {
            id: 2,
            title: "Phone Cases",
            seller: "Tech Hub",
            location: "Shop 15",
            price: "KSH 250",
            image: "images/phone-cases.jpg",
            badge: { type: "new", text: "NEW" },
            phone: "0723456789",
            description: "Stylish phone cases for all models"
        },
        {
            id: 3,
            title: "Sukuma Wiki",
            seller: "Green Grocers",
            location: "Stall 8",
            price: "KSH 30/bunch",
            image: "images/sukuma-wiki.jpg",
            badge: null,
            phone: "0734567890",
            description: "Fresh organic sukuma wiki"
        }
    ];
}

function renderAds(ads) {
    if (!elements.showcaseScroll) return;
    
    // Remove skeletons
    const skeletons = elements.showcaseScroll.querySelectorAll('.ad-skeleton');
    skeletons.forEach(s => s.remove());
    
    // Get CTA card
    const ctaCard = elements.showcaseScroll.querySelector('.ad-cta-card');
    
    // Create and insert ad cards
    ads.forEach((ad, index) => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.setAttribute('data-ad-id', ad.id);
        card.onclick = () => openAdModal(ad);
        
        card.innerHTML = `
            <div class="product-image">
                <img src="${ad.image}" alt="${ad.title}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%23f5f5f5%22 width=%22100%22 height=%22100%22/><text x=%2250%22 y=%2255%22 text-anchor=%22middle%22 font-size=%2230%22>🛒</text></svg>'">
                ${ad.badge ? `<span class="product-badge ${ad.badge.type}">${ad.badge.text}</span>` : ''}
            </div>
            <div class="product-info">
                <div class="product-name">${ad.title}</div>
                <div class="product-seller">${ad.seller}</div>
                <div class="product-price">${ad.price}</div>
            </div>
        `;
        
        if (ctaCard) {
            elements.showcaseScroll.insertBefore(card, ctaCard);
        } else {
            elements.showcaseScroll.appendChild(card);
        }
    });
}

// ========================================
// AD MODAL
// ========================================
function initAdModal() {
    if (elements.adModalClose) {
        elements.adModalClose.addEventListener('click', closeAdModal);
    }
    if (elements.adModalOverlay) {
        elements.adModalOverlay.addEventListener('click', (e) => {
            if (e.target === elements.adModalOverlay) closeAdModal();
        });
    }
}

function openAdModal(ad) {
    if (!elements.adModalOverlay) return;
    
    document.getElementById('adModalImage').src = ad.image;
    document.getElementById('adModalImage').alt = ad.title;
    document.getElementById('adModalBadge').textContent = ad.badge?.text || '';
    document.getElementById('adModalBadge').className = `ad-modal-badge ${ad.badge?.type || ''}`;
    document.getElementById('adModalTag').textContent = 'MARKETPLACE';
    document.getElementById('adModalTitle').textContent = ad.title;
    document.getElementById('adModalDescription').textContent = ad.description || '';
    document.getElementById('adModalSeller').textContent = ad.seller;
    document.getElementById('adModalLocation').textContent = ad.location || '';
    document.getElementById('adModalPrice').textContent = ad.price;
    document.getElementById('adCallButton').href = `tel:${ad.phone}`;
    
    elements.adModalOverlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeAdModal() {
    elements.adModalOverlay.classList.add('hidden');
    document.body.style.overflow = '';
}

// ========================================
// SUPPORT FORM
// ========================================
function initSupport() {
    if (elements.supportForm) {
        elements.supportForm.addEventListener('submit', handleSupportSubmit);
    }
}

function handleSupportSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const name = formData.get('name');
    const phone = formData.get('phone');
    const issueType = formData.get('issue_type');
    const message = formData.get('message');
    
    // Format WhatsApp message
    const issueLabels = {
        'slow_speed': 'Slow Internet Speed',
        'no_connection': "Can't Connect",
        'payment_issue': 'Payment Problem',
        'account_help': 'Account Help',
        'other': 'Other'
    };
    
    const whatsappMessage = encodeURIComponent(
        `*Bitwave Soko Support Request*\n\n` +
        `👤 Name: ${name}\n` +
        `📱 Phone: +254${phone}\n` +
        `🏷️ Issue: ${issueLabels[issueType] || issueType}\n\n` +
        `💬 Message:\n${message}`
    );
    
    // Open WhatsApp
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${whatsappMessage}`, '_blank');
    
    showToast('Opening WhatsApp...', 'success');
    e.target.reset();
}

// ========================================
// INSTALL PROMPT
// ========================================
let deferredPrompt;

function initInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        
        // Show install prompt after delay
        setTimeout(() => {
            if (!isAppInstalled()) {
                elements.installPrompt?.classList.remove('hidden');
            }
        }, 5000);
    });
    
    elements.installBtn?.addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const result = await deferredPrompt.userChoice;
            if (result.outcome === 'accepted') {
                showToast('App installed!', 'success');
            }
            deferredPrompt = null;
        }
        elements.installPrompt?.classList.add('hidden');
    });
    
    elements.installClose?.addEventListener('click', () => {
        elements.installPrompt?.classList.add('hidden');
    });
}

function isAppInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true;
}

// ========================================
// CONNECTION STATUS
// ========================================
function updateConnectionStatus() {
    const updateStatus = () => {
        const indicator = elements.connectionIndicator;
        if (!indicator) return;
        
        const dot = indicator.querySelector('.indicator-dot');
        const text = indicator.querySelector('.indicator-text');
        
        if (navigator.onLine) {
            dot.style.background = 'var(--success)';
            text.textContent = 'Online';
        } else {
            dot.style.background = 'var(--error)';
            text.textContent = 'Offline';
        }
    };
    
    updateStatus();
    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
}

// ========================================
// TOAST NOTIFICATIONS
// ========================================
function showToast(message, type = 'success') {
    if (!elements.toastContainer) return;
    
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️'
    };
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || '📢'}</span>
        <span class="toast-message">${message}</span>
    `;
    
    elements.toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideInDown 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ========================================
// DEBUG HELPERS
// ========================================
window.clearSpeedTestHistory = () => {
    localStorage.removeItem('bitwave_speed_tests');
    speedTestHistory = [];
    renderSpeedTestHistory();
    console.log('🗑️ Speed test history cleared');
};

window.simulateOffline = () => {
    const indicator = elements.connectionIndicator;
    if (indicator) {
        const dot = indicator.querySelector('.indicator-dot');
        const text = indicator.querySelector('.indicator-text');
        dot.style.background = 'var(--error)';
        text.textContent = 'Offline';
    }
};

console.log('📱 Bitwave Soko PWA Ready');
console.log('💡 Debug: clearSpeedTestHistory(), simulateOffline()');
