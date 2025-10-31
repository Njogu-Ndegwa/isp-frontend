// ========================================
// DEMO DATA - Replace with actual API call
// ========================================
const demoPlans = [
    {
        id: 3,
        duration: "24 Hours",
        price: "KSH 30/-",
        speed: "MAX 10mbps",
        popular: true
    },
    {
        id: 1,
        duration: "1 Hour",
        price: "KSH 10/-",
        speed: "MAX 5mbps",
        popular: false
    },
    {
        id: 2,
        duration: "4 Hours",
        price: "KSH 20/-",
        speed: "MAX 5mbps",
        popular: false
    },
    {
        id: 4,
        duration: "7 Days",
        price: "KSH 100/-",
        speed: "MAX 10mbps",
        popular: false
    },
    {
        id: 5,
        duration: "30 Days",
        price: "KSH 300/-",
        speed: "MAX 20mbps",
        popular: false
    }
];

// ========================================
// STATE MANAGEMENT
// ========================================
let selectedPlan = null;

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
// LOAD PLANS FROM "BACKEND"
// ========================================
async function loadPlans() {
    try {
        // Simulate API call delay
        await simulateDelay(300);
        
        // In production, replace with actual API call:
        // const response = await fetch('YOUR_BACKEND_API/plans');
        // const plans = await response.json();
        
        const plans = demoPlans;
        renderPlans(plans);
    } catch (error) {
        console.error('Error loading plans:', error);
        plansGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: var(--error-color);">
                <p style="font-size: 1.125rem; margin-bottom: 1rem;">Unable to load available plans</p>
                <button onclick="loadPlans()" style="padding: 1rem 2rem; background: var(--primary-color); color: white; border: none; border-radius: 0.5rem; cursor: pointer; font-size: 1rem;">
                    Try Again
                </button>
            </div>
        `;
    }
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
    // Simulate network delay
    await simulateDelay(2000);
    
    // In production, replace with actual API call:
    /*
    const response = await fetch('YOUR_BACKEND_API/process-payment', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            phoneNumber: phoneNumber,
            planId: plan.id,
            duration: plan.duration,
            amount: plan.price,
            speed: plan.speed
        })
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Payment failed');
    }
    
    return await response.json();
    */
    
    // Simulate random success/failure for demo
    const isSuccess = Math.random() > 0.2; // 80% success rate
    
    if (!isSuccess) {
        throw new Error('Unable to process payment at this time. Please verify your information and try again.');
    }
    
    return {
        success: true,
        transactionId: 'TXN' + Date.now(),
        message: 'Payment successful'
    };
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
    successMessage.innerHTML = `
        Your <strong>${plan.duration}</strong> plan is now active!<br>
        Confirmation sent to <strong>${phoneNumber}</strong><br>
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

function simulateDelay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ========================================
// UTILITY: Format Currency (if needed)
// ========================================
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
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
console.log('📦 Available plans:', demoPlans.length);
console.log('💡 Ready to connect! Update API endpoints in script.js for production use');

