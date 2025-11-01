// ========================================
// API CONFIGURATION
// ========================================
const API_BASE_URL = 'https://isp.bitwavetechnologies.com/api';
const PLANS_ENDPOINT = `${API_BASE_URL}/plans?user_id=1`;
const PAYMENT_ENDPOINT = `${API_BASE_URL}/hotspot/register-and-pay`;

// TEMPORARY: Use CORS proxy for development/testing ONLY if backend CORS is not configured
// Remove this in production once backend adds proper CORS headers!
const USE_CORS_PROXY = false; // Set to true only for local testing
const CORS_PROXY = 'https://corsproxy.io/?';

function getProxiedUrl(url) {
    return USE_CORS_PROXY ? CORS_PROXY + encodeURIComponent(url) : url;
}

// ========================================
// EXTRACT MIKROTIK URL PARAMETERS
// ========================================
function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        mac: params.get('mac') || '',
        ip: params.get('ip') || '',
        dst: params.get('dst') || '',
        gw: params.get('gw') || '',
        router: params.get('router') || ''
    };
}

// Store MikroTik parameters globally
const mikrotikParams = getUrlParams();

// Log extracted parameters for debugging
console.log('🔧 MikroTik Parameters:', mikrotikParams);

// ========================================
// STATE MANAGEMENT
// ========================================
let selectedPlan = null;
let allPlans = [];

// ========================================
// DOM ELEMENTS
// ========================================
const plansSection = document.getElementById('plansSection');
const paymentSection = document.getElementById('paymentSection');
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

const successMessage = document.getElementById('successMessage');
const errorMessage = document.getElementById('errorMessage');

// ========================================
// INITIALIZATION
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    loadPlans();
    setupEventListeners();
});

// ========================================
// LOAD PLANS FROM API
// ========================================
async function loadPlans() {
    try {
        console.log('📡 Fetching plans from API...');
        
        // Add timeout to fetch request (30 seconds)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        
        const response = await fetch(getProxiedUrl(PLANS_ENDPOINT), {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            mode: 'cors', // Enable CORS
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }
        
        const apiPlans = await response.json();
        console.log('✅ Plans loaded:', apiPlans);
        
        // Check if we got valid data
        if (!Array.isArray(apiPlans) || apiPlans.length === 0) {
            throw new Error('No plans available');
        }
        
        // Transform API data to UI format
        const plans = transformPlansData(apiPlans);
        allPlans = plans; // Store for later use
        
        renderPlans(plans);
    } catch (error) {
        console.error('❌ Error loading plans:', error);
        
        // Provide more specific error messages
        let errorMessage = 'Unable to load available plans';
        let detailMessage = '';
        
        if (error.name === 'AbortError') {
            errorMessage = 'Request Timeout';
            detailMessage = 'The server took too long to respond. Please check your connection.';
        } else if (error.message.includes('CORS')) {
            errorMessage = 'Connection Error';
            detailMessage = 'Unable to connect to the API server. Please contact support.';
        } else if (error.message.includes('fetch')) {
            errorMessage = 'Network Error';
            detailMessage = 'Unable to reach the server. Please check your internet connection.';
        } else {
            detailMessage = error.message;
        }
        
        plansGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: var(--error-color);">
                <div style="font-size: 3rem; margin-bottom: 1rem;">⚠️</div>
                <p style="font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem;">${errorMessage}</p>
                <p style="font-size: 0.875rem; opacity: 0.8; margin-bottom: 1.5rem;">${detailMessage}</p>
                <button onclick="loadPlans()" style="padding: 1rem 2rem; background: var(--primary-color); color: white; border: none; border-radius: 0.5rem; cursor: pointer; font-size: 1rem; margin-bottom: 1rem;">
                    🔄 Try Again
                </button>
                <p style="font-size: 0.75rem; opacity: 0.6;">If the problem persists, please contact support: 1-800-HOTSPOT</p>
            </div>
        `;
    }
}

// ========================================
// TRANSFORM API PLANS DATA
// ========================================
function transformPlansData(apiPlans) {
    return apiPlans.map((plan, index) => {
        // Parse duration
        const duration = formatDuration(plan.duration_value, plan.duration_unit);
        
        // Format price
        const price = `KSH ${plan.price}/-`;
        
        // Format speed
        const speed = plan.speed || 'Unlimited';
        
        // Mark popular plan (you can customize this logic)
        const popular = index === 0; // First plan is popular by default
        
        return {
            id: plan.id,
            duration: duration,
            price: price,
            speed: speed,
            popular: popular,
            // Keep original data for API submission
            originalData: plan
        };
    });
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
// RENDER PLANS
// ========================================
function renderPlans(plans) {
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
    card.className = `plan-card${plan.popular ? ' popular' : ''}`;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `Select ${plan.duration} plan for ${plan.price}, ${plan.speed}`);
    
    // Format price with smaller currency code
    const formattedPrice = formatPrice(plan.price);
    
    card.innerHTML = `
        <div class="plan-duration">${plan.duration}</div>
        <div class="plan-price">${formattedPrice}</div>
        <div class="plan-speed">${plan.speed}</div>
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
// SETUP EVENT LISTENERS
// ========================================
function setupEventListeners() {
    // Back button
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
        
        // Limit to 10 digits
        if (value.length > 10) {
            value = value.substring(0, 10);
        }
        
        e.target.value = value;
    });
    
    // New purchase button
    newPurchaseButton.addEventListener('click', () => {
        showSection(plansSection);
        hideSection(successSection);
        resetForm();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    
    // Retry button
    retryButton.addEventListener('click', () => {
        showSection(paymentSection);
        hideSection(errorSection);
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
        alert('Please enter a valid phone number (10 digits starting with 07 or 01)');
        phoneNumberInput.focus();
        return;
    }
    
    if (!selectedPlan) {
        alert('Please select a plan first');
        return;
    }
    
    // Show loading state
    setLoadingState(true);
    
    try {
        // Simulate API call
        await processPayment(phoneNumber, selectedPlan);
        
        // Show success
        showSuccessMessage(phoneNumber, selectedPlan);
        hideSection(paymentSection);
        showSection(successSection);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
    } catch (error) {
        // Show error
        showErrorMessage(error.message);
        hideSection(paymentSection);
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
    console.log('💳 Processing payment...');
    console.log('📞 Phone (original):', phoneNumber);
    
    // Format phone number for M-Pesa (convert 07xxx to 2547xxx)
    const formattedPhone = formatPhoneForMpesa(phoneNumber);
    console.log('📞 Phone (formatted):', formattedPhone);
    
    console.log('📦 Plan:', plan);
    console.log('🔧 MAC:', mikrotikParams.mac);
    console.log('🌐 IP:', mikrotikParams.ip);
    
    try {
        // Add timeout to payment request (60 seconds for M-Pesa processing)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);
        
        const requestBody = {
            phone_number: formattedPhone,  // Use formatted phone number
            plan_id: plan.id,
            mac_address: mikrotikParams.mac,
            ip_address: mikrotikParams.ip,
            gateway: mikrotikParams.gw,
            router: mikrotikParams.router,
            destination: mikrotikParams.dst
        };
        
        console.log('📤 Sending payment request:', requestBody);
        
        const response = await fetch(getProxiedUrl(PAYMENT_ENDPOINT), {
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
        console.log('📨 API Response:', responseData);
        
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

function showSuccessMessage(phoneNumber, plan) {
    // Format phone number for display
    const formattedPhone = formatPhoneForMpesa(phoneNumber);
    
    successMessage.innerHTML = `
        Your <strong>${plan.duration}</strong> plan is now active!<br>
        Confirmation sent to <strong>${formattedPhone}</strong><br>
        Start browsing now and enjoy fast internet!
    `;
}

function showErrorMessage(message) {
    errorMessage.textContent = message;
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
// ========================================
function validatePhoneNumber(phoneNumber) {
    // Kenya/East Africa format: 07XXXXXXXX or 01XXXXXXXX
    // Accepts exactly 10 digits starting with 07 or 01
    const phoneRegex = /^0[17][0-9]{8}$/;
    return phoneRegex.test(phoneNumber);
}

// ========================================
// PHONE NUMBER FORMATTING for M-Pesa
// ========================================
function formatPhoneForMpesa(phoneNumber) {
    // Convert Kenyan format to international format
    // Input: 0795635364 or 0112345678
    // Output: 254795635364 or 254112345678
    
    // Remove any spaces, dashes, or special characters
    let cleaned = phoneNumber.replace(/[\s\-\(\)]/g, '');
    
    // If starts with 0, replace with 254
    if (cleaned.startsWith('0')) {
        cleaned = '254' + cleaned.substring(1);
    }
    
    // If already has 254, keep as is
    // If starts with +254, remove the +
    if (cleaned.startsWith('+254')) {
        cleaned = cleaned.substring(1);
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
console.log('🔗 API Endpoints:');
console.log('  - Plans:', PLANS_ENDPOINT);
console.log('  - Payment:', PAYMENT_ENDPOINT);
console.log('💡 Ready to connect!');

// Validate MikroTik parameters on load
if (!mikrotikParams.mac || !mikrotikParams.ip) {
    console.warn('⚠️ Warning: Missing MikroTik parameters (mac/ip). Payment may fail.');
    console.log('💡 This page should be accessed via MikroTik hotspot redirect.');
}

// Display CORS proxy status
if (USE_CORS_PROXY) {
    console.warn('⚠️ CORS PROXY MODE ENABLED - FOR TESTING ONLY!');
    console.log('🔧 Make sure backend adds proper CORS headers for production.');
}

