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
        // Step 1: Initiate payment
        const paymentResponse = await processPayment(phoneNumber, selectedPlan);
        console.log('✅ Payment initiated:', paymentResponse);
        
        // Update UI to show waiting for payment confirmation
        showPaymentPendingMessage(phoneNumber, selectedPlan);
        hideSection(paymentSection);
        showSection(successSection);
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
// SHOW PROCESSING PAYMENT MESSAGE
// ========================================
function showProcessingPaymentMessage(phoneNumber, plan) {
    const formattedPhone = formatPhoneForMpesa(phoneNumber);
    
    successMessage.innerHTML = `
        <div style="text-align: center;">
            <div style="font-size: 3rem; margin-bottom: 1rem;">⚡</div>
            <h2 style="font-size: 1.5rem; margin-bottom: 1rem; color: #2563eb;">Processing Your Payment...</h2>
            
            <div style="background: #e0f2fe; padding: 20px; border-radius: 12px; margin: 20px 0; border: 2px solid #2563eb;">
                <div style="font-size: 1.1rem; margin-bottom: 15px;">
                    <strong>Setting up your ${plan.duration} plan</strong>
                </div>
                <div class="spinner" style="display: inline-block; width: 28px; height: 28px; border: 3px solid #ddd; border-top-color: #2563eb; border-radius: 50%; animation: spin 1s linear infinite; margin: 10px 0;"></div>
                <div style="font-size: 0.95rem; color: #0369a1; margin-top: 15px; line-height: 1.8;">
                    📱 Payment received<br>
                    ⚙️ Adding you to the system<br>
                    🔌 Establishing connection...
                </div>
            </div>
            
            <div style="background: #fff3e0; padding: 15px; border-radius: 8px; margin-top: 15px; text-align: left;">
                <div style="font-size: 0.9rem; color: #d97706;">
                    <strong>💡 Speed up your connection:</strong><br>
                    Open a new tab and go to <strong>google.com</strong><br>
                    This helps trigger the final connection step
                </div>
            </div>
            
            <div style="margin-top: 15px; padding: 10px; font-size: 0.85rem; color: #666;">
                Please wait, this usually takes 5-15 seconds...
            </div>
        </div>
    `;
}

// ========================================
// SHOW SUCCESS MESSAGE (PAYMENT CONFIRMED & INTERNET ACCESS GRANTED)
// ========================================
function showAuthenticatedMessage(phoneNumber, plan, data) {
    const formattedPhone = formatPhoneForMpesa(phoneNumber);
    
    successMessage.innerHTML = `
        <div style="text-align: center;">
            <div style="font-size: 4rem; margin-bottom: 1rem;">🎉</div>
            <h2 style="font-size: 1.8rem; margin-bottom: 1rem; color: #22c55e;">Payment Confirmed!</h2>
            <h3 style="font-size: 1.3rem; margin-bottom: 1.5rem; color: #22c55e;">Your Plan is Active!</h3>
            
            <div style="background: #dcfce7; padding: 20px; border-radius: 12px; margin: 20px 0; border: 2px solid #22c55e;">
                <div style="font-size: 1.2rem; margin-bottom: 10px;">
                    <strong>✅ ${data.plan_name || plan.duration}</strong>
                </div>
                <div style="font-size: 0.95rem; color: #166534; margin-top: 10px; line-height: 1.8;">
                    Status: <strong>Active</strong><br>
                    Phone: <strong>${formattedPhone}</strong><br>
                    ${data.expiry ? `Valid Until: <strong>${new Date(data.expiry).toLocaleString()}</strong>` : ''}
                </div>
            </div>
            
            <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin-top: 15px; border: 2px solid #f59e0b;">
                <div style="font-size: 1.1rem; color: #92400e; margin-bottom: 10px;">
                    <strong>📶 Next Step: Refresh Your WiFi</strong>
                </div>
                <div style="font-size: 0.95rem; color: #78350f; line-height: 1.8; text-align: left; margin-left: 20px;">
                    1. Turn OFF your WiFi<br>
                    2. Wait 2-3 seconds<br>
                    3. Turn WiFi back ON<br>
                    4. Start browsing!
                </div>
            </div>
            
            <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin-top: 15px;">
                <div style="font-size: 0.9rem; color: #0369a1; line-height: 1.6;">
                    💡 <strong>Tip:</strong> After refreshing WiFi, try visiting any website.<br>
                    Your internet should work immediately!
                </div>
            </div>
            
            <button onclick="window.location.href='http://google.com'" style="margin-top: 20px; padding: 14px 28px; background: var(--primary-color); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 1.1rem; font-weight: 600; box-shadow: 0 4px 6px rgba(0,0,0,0.1); transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                Start Browsing 🚀
            </button>
            
            <div style="margin-top: 20px; padding: 10px; font-size: 0.85rem; color: #666; opacity: 0.8;">
                Thank you for your purchase! Enjoy your internet.
            </div>
        </div>
    `;
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
    
    successMessage.innerHTML = `
        <div style="text-align: center;">
            <div style="font-size: 3rem; margin-bottom: 1rem;">📱</div>
            <h2 style="font-size: 1.5rem; margin-bottom: 1rem; color: #333;">M-Pesa Payment Request Sent!</h2>
            
            <div style="background: #e3f2fd; padding: 20px; border-radius: 12px; margin: 20px 0; text-align: left;">
                <div style="font-size: 1.1rem; margin-bottom: 15px;"><strong>📋 Payment Details:</strong></div>
                <div style="margin-left: 10px; line-height: 1.8;">
                    • Plan: <strong>${plan.duration}</strong><br>
                    • Amount: <strong>${plan.price}</strong><br>
                    • Phone: <strong>${formattedPhone}</strong>
                </div>
            </div>
            
            <div style="background: #fff3e0; padding: 20px; border-radius: 12px; margin-top: 15px; text-align: left;">
                <div style="font-size: 1.1rem; margin-bottom: 15px;"><strong>⚡ Complete Your Payment:</strong></div>
                <div style="margin-left: 10px; line-height: 2;">
                    <div style="margin-bottom: 10px;">
                        <strong>1.</strong> Check your phone for M-Pesa prompt
                    </div>
                    <div style="margin-bottom: 10px;">
                        <strong>2.</strong> Enter your M-Pesa PIN to confirm
                    </div>
                    <div style="margin-bottom: 10px;">
                        <strong>3.</strong> We'll connect you automatically
                    </div>
                    <div style="margin-top: 15px; padding-top: 15px; border-top: 2px solid #ffc107;">
                        <div class="spinner" style="display: inline-block; width: 20px; height: 20px; border: 3px solid #ddd; border-top-color: #667eea; border-radius: 50%; animation: spin 1s linear infinite; vertical-align: middle;"></div>
                        <span style="margin-left: 10px; color: #666; font-size: 0.95rem;">
                            <strong>Waiting for payment...</strong><br>
                            <span style="font-size: 0.85rem; opacity: 0.8;">Please don't close this page</span>
                        </span>
                    </div>
                </div>
            </div>
            
            <div style="margin-top: 20px; padding: 12px; background: #f0f0f0; border-radius: 8px; font-size: 0.85rem; color: #666;">
                💡 <strong>Tip:</strong> If you don't see the prompt, dial *334# on Safaricom
            </div>
        </div>
    `;
}

// showSuccessMessage removed - now using showWaitingForConnectionMessage and showAuthenticatedMessage instead

function showErrorMessage(message) {
    errorMessage.innerHTML = `
        <div style="text-align: center;">
            <div style="font-size: 1.2rem; color: #ef4444; margin-bottom: 15px;">
                ${message}
            </div>
            
            <div style="background: #fee2e2; padding: 15px; border-radius: 8px; margin-top: 15px; text-align: left;">
                <strong style="color: #991b1b;">Common Issues:</strong>
                <ul style="margin: 10px 0 0 20px; color: #7f1d1d; line-height: 1.8;">
                    <li>Insufficient M-Pesa balance</li>
                    <li>Wrong PIN entered</li>
                    <li>Transaction cancelled</li>
                    <li>Network timeout</li>
                </ul>
            </div>
            
            <div style="margin-top: 15px; padding: 12px; background: #f0f0f0; border-radius: 8px; font-size: 0.9rem; color: #666;">
                💡 Need help? Call support: <strong>1-800-HOTSPOT</strong>
            </div>
        </div>
    `;
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
if (!mikrotikParams.mac) {
    console.warn('⚠️ Warning: Missing MAC address from MikroTik. Payment may fail.');
    console.log('💡 This page should be accessed via MikroTik hotspot redirect.');
}

// Display CORS proxy status
if (USE_CORS_PROXY) {
    console.warn('⚠️ CORS PROXY MODE ENABLED - FOR TESTING ONLY!');
    console.log('🔧 Make sure backend adds proper CORS headers for production.');
}

