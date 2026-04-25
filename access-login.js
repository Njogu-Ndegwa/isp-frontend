/**
 * Account Sign-In (Captive Portal Access Credential Login)
 * --------------------------------------------------------
 * POST /api/public/access-login
 *
 * For staff / admins / non-paying access accounts that authenticate with a
 * username + password issued by the reseller. The captive portal posts the
 * credentials together with the device's MAC and the router_id; on success
 * the router whitelists the device and the user is online immediately.
 *
 * The trigger is intentionally a small, low-contrast link at the bottom of
 * the page — only a small number of users will ever use it.
 *
 * Reads these globals declared in script.js:
 *   - mikrotikParams (mac, dst, router, gw)
 *   - routerId       (resolved router DB id)
 *   - PRIMARY_API_BASE / FALLBACK_API_BASE via window.__apiFallback
 *   - populateSuccessAds() (optional)
 */
(function () {
    'use strict';

    // ----------------------------------------------------------------------
    // Endpoint resolution — mirrors script.js fallback logic
    // ----------------------------------------------------------------------
    function getApiBase() {
        var fb = window.__apiFallback;
        if (fb && fb.active && fb.fallback) return fb.fallback;
        if (fb && fb.primary) return fb.primary;
        return 'https://isp.bitwavetechnologies.com/api';
    }

    function getEndpoint() {
        return getApiBase() + '/public/access-login';
    }

    // ----------------------------------------------------------------------
    // DOM refs (resolved on init)
    // ----------------------------------------------------------------------
    var trigger, overlay, modal, closeBtn, form;
    var usernameInput, passwordInput, pwToggle;
    var submitBtn, btnText, btnLoader;
    var errorBox;

    function $(id) { return document.getElementById(id); }

    // ----------------------------------------------------------------------
    // Lifecycle
    // ----------------------------------------------------------------------
    function init() {
        trigger = $('staffLoginTrigger');
        overlay = $('staffLoginOverlay');
        modal = $('staffLoginModal');
        closeBtn = $('staffLoginClose');
        form = $('staffLoginForm');
        usernameInput = $('staffLoginUsername');
        passwordInput = $('staffLoginPassword');
        pwToggle = $('staffLoginPwToggle');
        submitBtn = $('staffLoginSubmit');
        btnText = $('staffLoginBtnText');
        btnLoader = $('staffLoginBtnLoader');
        errorBox = $('staffLoginError');

        if (!trigger || !overlay || !form) {
            console.warn('[access-login] Trigger/overlay/form not found — skipping init');
            return;
        }

        trigger.addEventListener('click', function (e) {
            e.preventDefault();
            openModal();
        });

        if (closeBtn) closeBtn.addEventListener('click', closeModal);

        // Click outside to close
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) closeModal();
        });

        // ESC to close
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !overlay.classList.contains('hidden')) {
                closeModal();
            }
        });

        // Show / Hide password toggle
        if (pwToggle && passwordInput) {
            pwToggle.addEventListener('click', function () {
                var nowHidden = passwordInput.type === 'password';
                passwordInput.type = nowHidden ? 'text' : 'password';
                pwToggle.textContent = nowHidden ? 'Hide' : 'Show';
                pwToggle.setAttribute(
                    'aria-label',
                    nowHidden ? 'Hide password' : 'Show password'
                );
            });
        }

        // Clear error as user edits
        if (usernameInput) usernameInput.addEventListener('input', clearError);
        if (passwordInput) passwordInput.addEventListener('input', clearError);

        form.addEventListener('submit', onSubmit);

        console.log('[access-login] Ready. Endpoint:', getEndpoint());
    }

    // ----------------------------------------------------------------------
    // Modal open/close + UI helpers
    // ----------------------------------------------------------------------
    function openModal() {
        clearError();
        if (passwordInput) passwordInput.value = '';
        overlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        // Focus username after the slide-up finishes
        setTimeout(function () {
            if (usernameInput) usernameInput.focus();
        }, 120);
    }

    function closeModal() {
        overlay.classList.add('hidden');
        document.body.style.overflow = '';
        if (passwordInput) passwordInput.value = '';
        clearError();
        setLoading(false);
    }

    function setLoading(isLoading) {
        if (!submitBtn) return;
        submitBtn.disabled = !!isLoading;
        if (isLoading) {
            if (btnText) btnText.classList.add('hidden');
            if (btnLoader) btnLoader.classList.remove('hidden');
        } else {
            if (btnText) btnText.classList.remove('hidden');
            if (btnLoader) btnLoader.classList.add('hidden');
        }
    }

    function showError(msg) {
        if (!errorBox) return;
        errorBox.textContent = msg;
        errorBox.classList.remove('hidden');
    }

    function clearError() {
        if (!errorBox) return;
        errorBox.textContent = '';
        errorBox.classList.add('hidden');
    }

    // ----------------------------------------------------------------------
    // Read MikroTik params + routerId from the page globals (set by script.js)
    // ----------------------------------------------------------------------
    function readRouterId() {
        try {
            if (typeof routerId !== 'undefined' && routerId) return routerId;
        } catch (e) { /* not yet defined */ }
        try {
            if (typeof FALLBACK_ROUTER_ID !== 'undefined' && FALLBACK_ROUTER_ID) {
                return FALLBACK_ROUTER_ID;
            }
        } catch (e) { /* not defined */ }
        return null;
    }

    function readMikrotikField(field) {
        try {
            if (
                typeof mikrotikParams !== 'undefined' &&
                mikrotikParams &&
                mikrotikParams[field]
            ) {
                return mikrotikParams[field];
            }
        } catch (e) { /* not defined */ }
        var p = new URLSearchParams(window.location.search);
        return p.get(field) || '';
    }

    // ----------------------------------------------------------------------
    // Submit handler
    // ----------------------------------------------------------------------
    function onSubmit(e) {
        e.preventDefault();
        clearError();

        var username = (usernameInput.value || '').trim();
        var password = passwordInput.value || '';
        var mac = readMikrotikField('mac');
        var rId = readRouterId();

        if (!username) {
            showError('Please enter your username.');
            usernameInput.focus();
            return;
        }
        if (!password) {
            showError('Please enter your password.');
            passwordInput.focus();
            return;
        }
        if (!mac) {
            showError(
                "We couldn't detect your device. Reconnect to the WiFi and reload this page."
            );
            return;
        }
        if (!rId) {
            showError(
                'Still loading router info — please wait a couple of seconds and try again.'
            );
            return;
        }

        postLogin({
            router_id: rId,
            username: username,
            password: password,
            mac_address: mac
        });
    }

    // ----------------------------------------------------------------------
    // Network call
    // ----------------------------------------------------------------------
    async function postLogin(payload) {
        setLoading(true);
        try {
            var res = await fetch(getEndpoint(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json'
                },
                mode: 'cors',
                body: JSON.stringify(payload)
            });

            var body = null;
            try { body = await res.json(); } catch (parseErr) { body = null; }

            if (res.ok && body && body.success) {
                handleSuccess(body);
                return;
            }

            handleError(res.status, body);
        } catch (err) {
            console.error('[access-login] Network error:', err);
            showError(
                'Network error — check your connection and try again in a moment.'
            );
        } finally {
            setLoading(false);
        }
    }

    // ----------------------------------------------------------------------
    // Error mapping (matches the documented backend error matrix)
    // ----------------------------------------------------------------------
    function handleError(status, body) {
        var detail = body ? body.detail : null;

        // 409 — credential currently bound to another device
        if (status === 409 && detail && detail.error === 'credential_in_use') {
            showError(
                detail.message ||
                'This account is in use on another device. Disconnect that device or contact your provider.'
            );
            return;
        }

        var detailStr = (typeof detail === 'string') ? detail : '';

        if (status === 401) {
            if (detailStr === 'Credential is revoked') {
                showError(
                    'This account has been disabled. Please contact your provider.'
                );
            } else {
                // Deliberately ambiguous to avoid leaking which usernames exist
                showError(
                    'Wrong username or password — try again or ask your provider.'
                );
            }
            return;
        }

        if (status === 400) {
            if (detailStr === 'Invalid MAC address format') {
                showError(
                    "We couldn't read your device's address. Reconnect to the WiFi and reload this page."
                );
            } else if (detailStr === 'Invalid router ID') {
                showError(
                    'Configuration issue — refresh the page and try again.'
                );
            } else if (
                detailStr === 'Username is required' ||
                detailStr === 'Password is required' ||
                detailStr === 'MAC address is required' ||
                detailStr === 'Router ID is required'
            ) {
                showError(detailStr);
            } else {
                showError(detailStr || 'Please check your details and try again.');
            }
            return;
        }

        if (status === 404) {
            showError(
                'Configuration issue — please contact your provider.'
            );
            return;
        }

        if (status === 502) {
            // Backend reached the router but the binding call failed.
            // Safe to retry shortly.
            showError(
                'The router is busy right now. Wait a few seconds and try again.'
            );
            return;
        }

        // 500 / unknown
        showError('Something went wrong. Please try again in a moment.');
    }

    // ----------------------------------------------------------------------
    // Success — close modal, reuse the existing success section
    // ----------------------------------------------------------------------
    function handleSuccess(data) {
        console.log('[access-login] Success:', data);

        // Close modal
        overlay.classList.add('hidden');
        document.body.style.overflow = '';

        // Hide all other sections, show success
        var success = $('successSection');
        var sectionsToHide = [
            'plansSection',
            'paymentSection',
            'processingSection',
            'errorSection'
        ];
        sectionsToHide.forEach(function (id) {
            var el = $(id);
            if (el) el.classList.add('hidden');
        });

        if (success) {
            renderConnectionDetails(data);
            success.classList.remove('hidden');
            window.scrollTo({ top: 0, behavior: 'smooth' });

            // Reuse the existing ad slot
            if (typeof window.populateSuccessAds === 'function') {
                try { window.populateSuccessAds(); } catch (e) { /* non-fatal */ }
            }
        }

        // The router has whitelisted the MAC — the device is already online.
        // We don't auto-redirect: the existing "Start Browsing" button on the
        // success screen handles that, mirroring how the M-Pesa / voucher
        // flows behave.
    }

    function renderConnectionDetails(data) {
        var details = $('connectionDetails');
        if (!details) return;

        var rate = data.rate_limit ? data.rate_limit : 'Unlimited';
        var ip = data.client_ip || '';
        var mac = data.mac_address || '';

        var html = ''
            + row('Account', data.username || '—')
            + row('Method', 'Account Sign-In')
            + row('Speed', rate);

        if (ip) html += row('IP Address', ip, true);
        if (mac) html += row('Device MAC', mac, true);

        details.innerHTML = html;
    }

    function row(label, value, mono) {
        return ''
            + '<div class="detail-row">'
            +   '<span class="detail-label">' + escapeHtml(label) + '</span>'
            +   '<span class="detail-value' + (mono ? ' mono' : '') + '">' + escapeHtml(value) + '</span>'
            + '</div>';
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            })[c];
        });
    }

    // ----------------------------------------------------------------------
    // Boot
    // ----------------------------------------------------------------------
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
