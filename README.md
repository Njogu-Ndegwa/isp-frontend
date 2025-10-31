# Internet Hotspot Landing Page

A beautiful, mobile-first captive portal landing page for displaying and purchasing internet hotspot plans. Features a dark theme with high contrast design perfect for all users.

## Features

✨ **Ultra-Simple Design** - Minimal, easy to use for all age groups and tech literacy levels  
📱 **Mobile-First** - Optimized for mobile devices with responsive design for tablets and desktop  
🎨 **High Contrast UI** - Dark theme with vibrant colors for maximum visibility  
📋 **Clear Instructions** - Step-by-step guide visible upfront  
📞 **Support Contact** - Customer care information prominently displayed  
♿ **Accessible** - Large touch targets (60px+), high contrast, keyboard navigation support  
🔄 **Responsive Grid** - Handles 1-6+ plans with automatic layout adjustments  
💳 **Simple Payment Flow** - Tap plan → Enter phone → Pay → Done  
✅ **Clear Feedback** - Loading, success, and error states with clear messaging

## File Structure

```
isp-landing-page/
├── index.html      # Main HTML structure
├── styles.css      # Mobile-first CSS styles
├── script.js       # JavaScript functionality
└── README.md       # This file
```

## Quick Start

1. Open `index.html` in a web browser
2. No build process or dependencies required!
3. The page uses demo data by default

## Customization

### Connecting to Your Backend

#### 1. Load Plans from API

In `script.js`, update the `loadPlans()` function:

```javascript
async function loadPlans() {
    try {
        // Replace with your actual API endpoint
        const response = await fetch('https://your-backend.com/api/plans');
        const plans = await response.json();
        renderPlans(plans);
    } catch (error) {
        console.error('Error loading plans:', error);
        // Error handling...
    }
}
```

#### 2. Process Payment API

In `script.js`, update the `processPayment()` function:

```javascript
async function processPayment(phoneNumber, plan) {
    const response = await fetch('https://your-backend.com/api/process-payment', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            phoneNumber: phoneNumber,
            planId: plan.id,
            planName: plan.name,
            amount: plan.price,
            duration: plan.duration
        })
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Payment failed');
    }
    
    return await response.json();
}
```

### Expected Data Format

Your backend API should return plans in this **simplified** format:

```javascript
[
    {
        id: 1,                    // Unique identifier
        duration: "1 Hour",       // Plan duration (displayed in GREEN)
        price: "KSH 10/-",        // Display price (displayed in RED)
        speed: "MAX 5mbps",       // Speed limit (displayed in BLACK)
        popular: false            // Highlight with green border if true
    }
    // ... more plans
]
```

**Design Philosophy**: Keep it minimal - users only need to know duration, price, and speed.

### Styling Customization

Colors and spacing are defined as CSS variables in `styles.css`:

```css
:root {
    --primary-color: #2563eb;      /* Blue accent color */
    --success-color: #22c55e;      /* Green (durations, buttons) */
    --error-color: #ef4444;        /* Red (prices) */
    --background: #0f172a;         /* Dark background */
    --background-light: #1e293b;   /* Lighter dark sections */
    /* ... more variables */
}
```

The design uses a **dark theme** with **high contrast** for better visibility on mobile devices in various lighting conditions.

### Phone Number Validation

The system validates phone numbers in the format **07XXXXXXXX** or **01XXXXXXXX** (10 digits):

```javascript
function validatePhoneNumber(phoneNumber) {
    // Kenya/East Africa format: 07XXXXXXXX or 01XXXXXXXX
    const phoneRegex = /^0[17][0-9]{8}$/;
    return phoneRegex.test(phoneNumber);
}
```

**Features:**
- Auto-filters non-numeric input
- Maximum 10 digits
- Real-time visual feedback (green border for valid, red for invalid)
- Clear placeholder: "07XXXXXXXX or 01XXXXXXXX"
- Helper text: "Enter 10 digits starting with 07 or 01"

## Design Principles

1. **Ultra-Large Touch Targets** - All interactive elements are 60px+ height for easy tapping
2. **Extreme High Contrast** - Dark background with bright colors (green/red/blue) for maximum visibility
3. **Minimal Information** - Only show what users need: duration, price, speed
4. **Upfront Instructions** - Step-by-step guide visible before selection
5. **Prominent Support** - Customer care contact always visible
6. **Clear Typography** - Extra-large, readable font sizes
7. **Simple Navigation** - Clear forward and back flows
8. **Immediate Feedback** - Visual feedback for all user actions
9. **Error Recovery** - Clear error messages with retry options

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Accessibility Features

- Semantic HTML structure
- ARIA labels where appropriate
- Keyboard navigation support (Tab, Enter, Space)
- Focus indicators
- Reduced motion support for users with vestibular disorders
- High contrast mode support

## Performance

- No external dependencies
- Vanilla JavaScript (no frameworks)
- Minimal CSS (< 15KB)
- Optimized for fast loading on slow connections

## Demo Features

The demo includes:
- 5 sample plans with different durations (1 hour to 30 days)
- Kenyan Shilling (KSH) pricing with authentic local format
- Simplified pricing display (only duration, price, speed)
- M-Pesa payment instructions
- Phone number validation for Kenyan format (07/01)
- Instructions card with step-by-step purchase guide
- Customer care contact information
- Simulated API delay (300ms for loading, 2s for payment)
- 80% success rate for payment simulation
- Automatic plan grid responsiveness testing
- Dark theme optimized for mobile viewing

## Production Checklist

Before deploying to production:

- [ ] Update API endpoints in `script.js`
- [ ] Remove or adjust the simulated delay functions
- [ ] Add proper error logging
- [ ] Add analytics tracking (optional)
- [ ] Test on real devices
- [ ] Add proper form validation for your requirements
- [ ] Configure CORS on your backend
- [ ] Add security headers
- [ ] Test payment flow thoroughly
- [ ] Add loading indicator for initial plan load

## Support

For issues or questions, contact support at 1-800-HOTSPOT (as shown in footer)

## License

Free to use and modify for your project.

