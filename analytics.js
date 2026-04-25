// Vercel Web Analytics initialization
// This file injects the Vercel Analytics tracking script

(function() {
  // Initialize the analytics queue
  window.va = window.va || function () {
    (window.vaq = window.vaq || []).push(arguments);
  };

  // Detect environment (production vs development)
  const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  window.vam = isDev ? 'development' : 'production';

  // Only inject script in production or when explicitly testing
  if (window.vam === 'development') {
    console.log('[Vercel Analytics] Running in development mode - analytics disabled');
    return;
  }

  // Create and inject the analytics script
  const script = document.createElement('script');
  script.src = '/_vercel/insights/script.js';
  script.defer = true;
  script.dataset.sdkn = '@vercel/analytics';
  script.dataset.sdkv = '1.6.1';
  
  script.onerror = function() {
    console.log('[Vercel Analytics] Failed to load. Enable Web Analytics in Vercel Dashboard and deploy to see data.');
  };

  document.head.appendChild(script);
})();
