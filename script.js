// ========================================
// API CONFIGURATION
// ========================================
const API_BASE_URL = 'https://isp.bitwavetechnologies.com/api';
const PLANS_ENDPOINT = `${API_BASE_URL}/plans?user_id=1`;
const PAYMENT_ENDPOINT = `${API_BASE_URL}/hotspot/register-and-pay`;
const PAYMENT_STATUS_ENDPOINT = `${API_BASE_URL}/hotspot/payment-status`; // New endpoint

// Router ID - Replace with your actual router ID from backend
// This is the database ID of the router, not the MikroTik identity string
const ROUTER_ID = 2; // TODO: Update this with your actual router ID from backend

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
// HARDCODED PLANS - For instant loading (zero latency)
// Update these manually when plans change in the backend
// ========================================
const HARDCODED_PLANS = [
    {
        "id": 10,
        "name": "1 Hour Plan",
        "speed": "5M/5M",
        "price": 5,
        "duration_value": 1,
        "duration_unit": "HOURS",
        "connection_type": "hotspot",
        "router_profile": "default",
        "user_id": 1
    },
    {
        "id": 11,
        "name": "7 Minute Plan",
        "speed": "5M/5M",
        "price": 1,
        "duration_value": 7,
        "duration_unit": "MINUTES",
        "connection_type": "hotspot",
        "router_profile": "default",
        "user_id": 1
    },
    {
        "id": 12,
        "name": "24 Hour Plan",
        "speed": "5M/5M",
        "price": 20,
        "duration_value": 24,
        "duration_unit": "HOURS",
        "connection_type": "hotspot",
        "router_profile": "default",
        "user_id": 1
    },
    {
        "id": 13,
        "name": "12 Hour Plan",
        "speed": "5M/5M",
        "price": 15,
        "duration_value": 12,
        "duration_unit": "HOURS",
        "connection_type": "hotspot",
        "router_profile": "default",
        "user_id": 1
    },
    {
        "id": 14,
        "name": "6 Hr Plan",
        "speed": "5M/5M",
        "price": 12,
        "duration_value": 6,
        "duration_unit": "HOURS",
        "connection_type": "hotspot",
        "router_profile": "default",
        "user_id": 1
    },
    {
        "id": 15,
        "name": "7 Day Plan",
        "speed": "5M/5M",
        "price": 99,
        "duration_value": 7,
        "duration_unit": "DAYS",
        "connection_type": "hotspot",
        "router_profile": "default",
        "user_id": 1
    },
    {
        "id": 16,
        "name": "2 Hour Plan",
        "speed": "5M/5M",
        "price": 8,
        "duration_value": 2,
        "duration_unit": "HOURS",
        "connection_type": "hotspot",
        "router_profile": "default",
        "user_id": 1
    },
    {
        "id": 17,
        "name": "15 Minute Boost",
        "speed": "5M/5M",
        "price": 2,
        "duration_value": 15,
        "duration_unit": "MINUTES",
        "connection_type": "hotspot",
        "router_profile": "default",
        "user_id": 1
    },
    {
        "id": 18,
        "name": "Full Day Deal",
        "speed": "5M/5M",
        "price": 18,
        "duration_value": 1,
        "duration_unit": "DAYS",
        "connection_type": "hotspot",
        "router_profile": "default",
        "user_id": 1
    }
];

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
// INITIALIZATION
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    loadPlans();
    setupEventListeners();
    loadSavedPhoneNumber();
});

// ========================================
// LOAD SAVED PHONE NUMBER (for returning users)
// ========================================
function loadSavedPhoneNumber() {
    const savedPhone = localStorage.getItem('bitwave_phone_number');
    if (savedPhone && phoneNumberInput) {
        phoneNumberInput.value = savedPhone;
        console.log('📱 Pre-populated phone number for returning user');
    }
}

// ========================================
// LOAD PLANS - Uses hardcoded plans for instant loading
// ========================================
function loadPlans() {
    console.log('⚡ Loading hardcoded plans (instant)...');
    
    // Use hardcoded plans immediately - no network latency!
    const plans = transformPlansData(HARDCODED_PLANS);
    allPlans = plans; // Store for later use
    
    renderPlans(plans);
    console.log('✅ Plans rendered instantly:', plans.length, 'plans');
}

// ========================================
// FORCE REFRESH PLANS FROM API (Optional - call manually)
// Use this when you need to sync with backend changes
// Call from console: forceRefreshPlans()
// ========================================
async function forceRefreshPlans() {
    try {
        console.log('📡 Force refreshing plans from API...');
        
        // Show loading state
        plansGrid.innerHTML = `
            <div class="skeleton-card"></div>
            <div class="skeleton-card"></div>
            <div class="skeleton-card"></div>
            <div class="skeleton-card"></div>
        `;
        
        // Add timeout to fetch request (30 seconds)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        
        const response = await fetch(getProxiedUrl(PLANS_ENDPOINT), {
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
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }
        
        const apiPlans = await response.json();
        console.log('✅ Plans refreshed from API:', apiPlans);
        
        if (!Array.isArray(apiPlans) || apiPlans.length === 0) {
            throw new Error('No plans available from API');
        }
        
        // Transform and render
        const plans = transformPlansData(apiPlans);
        allPlans = plans;
        renderPlans(plans);
        
        // Log the JSON for updating HARDCODED_PLANS
        console.log('📋 Copy this to update HARDCODED_PLANS:');
        console.log(JSON.stringify(apiPlans, null, 4));
        
        return apiPlans;
    } catch (error) {
        console.error('❌ Error refreshing plans:', error);
        
        // Fall back to hardcoded plans
        console.log('🔄 Falling back to hardcoded plans...');
        loadPlans();
        
        throw error;
    }
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
    
    // Transform plans with popularity marking
    const transformedPlans = plansWithRatio.map((plan) => {
        // Parse duration
        const duration = formatDuration(plan.duration_value, plan.duration_unit);
        
        // Format price
        const price = `KSH ${plan.price}/-`;
        
        // Format speed
        const speed = formatSpeed(plan.speed);
        
        // Mark plan as popular if it has the best time-to-price ratio
        const popular = plan.id === bestPlan.id;
        
        // Calculate value message for popular plan
        let valueMessage = '';
        if (popular) {
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
            valueMessage: valueMessage,
            // Keep original data for API submission
            originalData: plan
        };
    });
    
    // Sort plans: popular plan first, then the rest
    transformedPlans.sort((a, b) => {
        if (a.popular && !b.popular) return -1; // a comes first
        if (!a.popular && b.popular) return 1;  // b comes first
        return 0; // keep original order for non-popular plans
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
        
        // Limit to 10 digits (allows both 9-digit and 10-digit formats)
        if (value.length > 10) {
            value = value.substring(0, 10);
        }
        
        e.target.value = value;
        
        // Save to localStorage for returning users
        if (value.length >= 9) {
            localStorage.setItem('bitwave_phone_number', value);
        }
    });
    
    // New purchase button
    newPurchaseButton.addEventListener('click', () => {
        showSection(plansSection);
        hideSection(successSection);
        hideSection(processingSection);
        resetForm();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    
    // Retry button
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
    
    // Save valid phone number to localStorage
    localStorage.setItem('bitwave_phone_number', phoneNumber);
    
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
    console.log('💳 Processing payment...');
    console.log('📞 Phone (original):', phoneNumber);
    
    // Format phone number for M-Pesa (convert 07xxx to 2547xxx)
    const formattedPhone = formatPhoneForMpesa(phoneNumber);
    console.log('📞 Phone (formatted):', formattedPhone);
    
    console.log('📦 Plan:', plan);
    console.log('🔧 MAC:', mikrotikParams.mac);
    console.log('🆔 Router ID:', ROUTER_ID);
    
    try {
        // Add timeout to payment request (60 seconds for M-Pesa processing)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);
        
        const requestBody = {
            phone: formattedPhone,
            plan_id: plan.id,
            mac_address: mikrotikParams.mac,
            router_id: ROUTER_ID,  // Database ID of router (number)
            payment_method: "mobile_money"
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
// POLL PAYMENT STATUS & WAIT FOR INTERNET ACCESS
// ========================================
async function pollPaymentStatusAndLogin(customerId, phoneNumber, plan) {
    console.log('🔄 Checking payment status and internet access...');
    console.log('📋 Customer ID:', customerId);
    
    let attempts = 0;
    
    return new Promise((resolve, reject) => {
        const pollInterval = setInterval(async () => {
            attempts++;
            console.log(`🔍 Polling attempt ${attempts}/${PAYMENT_POLL_MAX_ATTEMPTS}...`);
            
            try {
                const statusUrl = `${PAYMENT_STATUS_ENDPOINT}/${customerId}`;
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
                    
                    // Show final success message
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
function showAuthenticatedMessage(phoneNumber, plan, data) {
    const formattedPhone = formatPhoneForMpesa(phoneNumber);
    
    // Hide processing, show success
    hideSection(processingSection);
    showSection(successSection);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Populate connection details card
    const connectionDetails = document.getElementById('connectionDetails');
    if (connectionDetails) {
        const expiryDate = data.expiry ? new Date(data.expiry) : null;
        const expiryText = expiryDate ? expiryDate.toLocaleDateString('en-KE', { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }) : 'N/A';
        
        connectionDetails.innerHTML = `
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
console.log('💡 Ready to connect!');
console.log('');
console.log('🔧 To update plans from backend, run in console:');
console.log('   forceRefreshPlans().then(plans => console.log(plans))');

// Validate MikroTik parameters on load
if (!mikrotikParams.mac) {
    console.warn('⚠️ Warning: Missing MAC address from MikroTik. Payment may fail.');
    console.log('💡 This page should be accessed via MikroTik hotspot redirect.');
}

// Display CORS proxy status
if (USE_CORS_PROXY) {
    console.warn('⚠️ CORS PROXY MODE ENABLED - FOR TESTING ONLY!');
    console.log('🔧 Make sure backend adds proper CORS headers for production.');
}

