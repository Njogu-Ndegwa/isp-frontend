// ========================================
// DEVICE PAIRING MODULE (TV / Console / IoT)
// Self-contained — reads routerId, allPlans, API_BASE_URL from script.js globals
// ========================================

(function () {
    'use strict';

    // ---- State ----
    let dpSelectedType = 'tv';
    let dpSelectedPlan = null;
    let dpPairingData = null; // stores response from pair-and-pay or pair-voucher

    // ---- Helpers from global scope (script.js) ----
    function apiBase() {
        var fb = window.__apiFallback;
        if (fb && fb.active) return fb.fallback;
        try { return API_BASE_URL; } catch (e) { return 'https://isp.bitwavetechnologies.com/api'; }
    }

    function proxied(url) {
        return typeof getProxiedUrl === 'function' ? getProxiedUrl(url) : url;
    }

    function getRouterIdSafe() {
        try { return routerId || FALLBACK_ROUTER_ID || 2; } catch (e) { return 2; }
    }

    function getGlobalPlans() {
        try { return allPlans || []; } catch (e) { return []; }
    }

    // ---- MAC helpers ----
    function cleanMac(val) {
        return val.replace(/[^0-9A-Fa-f]/g, '').toUpperCase().slice(0, 12);
    }

    function formatMac(val) {
        const hex = cleanMac(val);
        const pairs = hex.match(/.{1,2}/g) || [];
        return pairs.join(':');
    }

    function isValidMac(val) {
        return /^[0-9A-F]{12}$/.test(cleanMac(val));
    }

    // ---- Phone helpers (from script.js globals) ----
    function fmtPhone(p) {
        try { return formatPhoneForMpesa(p); } catch (e) { return p; }
    }

    function validPhone(p) {
        try { return validatePhoneNumber(p); } catch (e) { return p.replace(/\D/g, '').length >= 9; }
    }

    // ---- Price formatter (mirrors script.js) ----
    function fmtPrice(price) {
        const m = String(price).match(/^(KSH)\s*(.+)$/);
        if (m) return `<span class="currency-code">${m[1]}</span> ${m[2]}`;
        return price;
    }

    // ---- DOM refs ----
    const $ = (id) => document.getElementById(id);

    // ---- Init on DOM ready ----
    document.addEventListener('DOMContentLoaded', () => {
        const section = $('deviceSection');
        if (!section) return;

        setupToggle();
        setupTabs();
        setupStep1();
        setupStep2();
        setupStep3();
        setupSuccessActions();
        setupErrorActions();
        setupMyDevices();

        console.log('📺 Device pairing module loaded');
    });

    // ========================================
    // TOGGLE expand/collapse
    // ========================================
    function setupToggle() {
        const toggle = $('deviceEntryToggle');
        const body = $('deviceEntryBody');
        const chevron = $('deviceChevron');
        if (!toggle || !body) return;

        toggle.addEventListener('click', () => {
            const isHidden = body.classList.contains('hidden');
            body.classList.toggle('hidden');
            chevron.classList.toggle('open', isHidden);
        });
    }

    // ========================================
    // TABS: Add Device / My Devices
    // ========================================
    function setupTabs() {
        const tabAdd = $('deviceTabAdd');
        const tabMy = $('deviceTabMy');
        const wizard = $('deviceWizard');
        const myPanel = $('deviceMyPanel');
        if (!tabAdd || !tabMy) return;

        tabAdd.addEventListener('click', () => {
            tabAdd.classList.add('active');
            tabMy.classList.remove('active');
            wizard.classList.remove('hidden');
            myPanel.classList.add('hidden');
        });

        tabMy.addEventListener('click', () => {
            tabMy.classList.add('active');
            tabAdd.classList.remove('active');
            myPanel.classList.remove('hidden');
            wizard.classList.add('hidden');
        });
    }

    // ========================================
    // STEP 1: Device Info
    // ========================================
    function setupStep1() {
        const macInput = $('deviceMacInput');
        const macStatus = $('deviceMacStatus');
        const macCounter = $('deviceMacCounter');
        const nextBtn = $('deviceStep1Next');
        const typeGrid = $('deviceTypeGrid');
        if (!macInput) return;

        macInput.addEventListener('input', () => {
            macInput.value = formatMac(macInput.value);
            const hex = cleanMac(macInput.value);
            const count = hex.length;
            macCounter.textContent = `${count}/12 characters`;

            if (count === 12 && isValidMac(macInput.value)) {
                macStatus.textContent = '✓';
                macInput.classList.add('valid');
                macInput.classList.remove('invalid');
                nextBtn.disabled = false;
            } else if (count > 0) {
                macStatus.textContent = count === 12 ? '✕' : '';
                macInput.classList.remove('valid');
                if (count === 12) macInput.classList.add('invalid');
                else macInput.classList.remove('invalid');
                nextBtn.disabled = true;
            } else {
                macStatus.textContent = '';
                macInput.classList.remove('valid', 'invalid');
                nextBtn.disabled = true;
            }
        });

        // Device type buttons
        if (typeGrid) {
            typeGrid.addEventListener('click', (e) => {
                const btn = e.target.closest('.device-type-btn');
                if (!btn) return;
                typeGrid.querySelectorAll('.device-type-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                dpSelectedType = btn.dataset.type;
            });
        }

        nextBtn.addEventListener('click', () => {
            if (!isValidMac(macInput.value)) return;
            try { localStorage.setItem('bitwave_tv_mac', macInput.value.trim()); } catch (e) { /* ignore */ }
            goToStep(2);
            populateDevicePlans();
        });

        // Pre-fill saved MAC address for returning users
        try {
            const savedMac = localStorage.getItem('bitwave_tv_mac');
            if (savedMac) {
                macInput.value = savedMac;
                macInput.dispatchEvent(new Event('input'));
            }
        } catch (e) { /* ignore */ }
    }

    // ========================================
    // STEP 2: Plan Selection / Voucher
    // ========================================
    function setupStep2() {
        const backBtn = $('deviceStep2Back');
        const voucherInput = $('deviceVoucherInput');
        const voucherBtn = $('deviceVoucherBtn');
        if (!backBtn) return;

        backBtn.addEventListener('click', () => goToStep(1));

        if (voucherBtn) {
            voucherBtn.addEventListener('click', () => handleDeviceVoucher());
        }

        if (voucherInput) {
            voucherInput.addEventListener('input', () => {
                voucherInput.value = voucherInput.value.replace(/[^a-zA-Z0-9\-]/g, '');
                const res = $('deviceVoucherResult');
                if (res) { res.classList.add('hidden'); res.className = 'device-voucher-result hidden'; }
            });
            voucherInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); voucherBtn.click(); }
            });
        }
    }

    function populateDevicePlans() {
        const grid = $('devicePlansGrid');
        const title = $('deviceStep2Title');
        if (!grid) return;

        const deviceName = $('deviceNameInput')?.value.trim() || dpSelectedType.toUpperCase();
        if (title) title.textContent = `Select a Plan for ${deviceName}`;

        const plans = getGlobalPlans();
        if (plans.length === 0) {
            grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--text-light);font-size:0.85rem;">No plans available. Please refresh the page.</p>';
            return;
        }

        grid.innerHTML = plans.map(plan => `
            <div class="device-plan-card" data-plan-id="${plan.id}" role="button" tabindex="0">
                <div class="device-plan-duration">${plan.duration}</div>
                <div class="device-plan-price">${fmtPrice(plan.price)}</div>
                <div class="device-plan-speed">${plan.speed}</div>
            </div>
        `).join('');

        grid.querySelectorAll('.device-plan-card').forEach(card => {
            const handler = () => {
                const planId = parseInt(card.dataset.planId, 10);
                dpSelectedPlan = plans.find(p => p.id === planId) || null;
                grid.querySelectorAll('.device-plan-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                goToStep(3);
                populatePaymentSummary();
            };
            card.addEventListener('click', handler);
            card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); } });
        });
    }

    // ========================================
    // VOUCHER FLOW (device)
    // ========================================
    async function handleDeviceVoucher() {
        const input = $('deviceVoucherInput');
        const btn = $('deviceVoucherBtn');
        const result = $('deviceVoucherResult');
        const code = input.value.trim();
        if (!code) { input.focus(); return; }

        btn.disabled = true;
        btn.textContent = '...';
        result.classList.add('hidden');
        result.className = 'device-voucher-result hidden';

        try {
            const mac = $('deviceMacInput').value.trim();
            const deviceName = $('deviceNameInput')?.value.trim() || '';

            const body = {
                device_mac: mac,
                voucher_code: code,
                router_id: getRouterIdSafe(),
                device_name: deviceName || `Device ${mac.slice(-5)}`,
                device_type: dpSelectedType
            };

            console.log('📺 [DEVICE] Voucher pair request:', body);

            const resp = await fetch(proxied(`${apiBase()}/public/device/pair-voucher`), {
                method: 'POST',
                headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                mode: 'cors',
                body: JSON.stringify(body)
            });

            const data = await resp.json();
            if (!resp.ok) throw new Error(data.detail || 'Voucher pairing failed');

            console.log('✅ [DEVICE] Voucher paired:', data);
            dpPairingData = data;

            showDeviceSuccess(data, true);
        } catch (err) {
            result.classList.remove('hidden');
            result.classList.add('error');
            result.textContent = err.message;
        } finally {
            btn.disabled = false;
            btn.textContent = 'Apply';
        }
    }

    // ========================================
    // STEP 3: Payment
    // ========================================
    function setupStep3() {
        const backBtn = $('deviceStep3Back');
        const payBtn = $('devicePayBtn');
        const phoneInput = $('devicePhoneInput');
        if (!backBtn) return;

        backBtn.addEventListener('click', () => goToStep(2));

        if (phoneInput) {
            phoneInput.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/[^\d]/g, '').slice(0, 10);
            });
        }

        if (payBtn) {
            payBtn.addEventListener('click', () => handleDevicePay());
        }
    }

    function populatePaymentSummary() {
        const card = $('deviceSummaryCard');
        const payText = $('devicePayText');
        if (!card || !dpSelectedPlan) return;

        const deviceName = $('deviceNameInput')?.value.trim() || dpSelectedType.toUpperCase();
        const mac = $('deviceMacInput')?.value || '';

        card.innerHTML = `
            <div class="device-summary-row">
                <span class="device-summary-label">Device</span>
                <span class="device-summary-value">${deviceName}</span>
            </div>
            <div class="device-summary-row">
                <span class="device-summary-label">MAC</span>
                <span class="device-summary-value" style="font-family:monospace;font-size:0.8rem;">${mac}</span>
            </div>
            <div class="device-summary-row">
                <span class="device-summary-label">Plan</span>
                <span class="device-summary-value">${dpSelectedPlan.duration}</span>
            </div>
            <div class="device-summary-row">
                <span class="device-summary-label">Price</span>
                <span class="device-summary-value">${dpSelectedPlan.price}</span>
            </div>
        `;

        if (payText) payText.textContent = `Pay ${dpSelectedPlan.price} with M-Pesa`;

        // Pre-fill phone if saved
        const phoneInput = $('devicePhoneInput');
        if (phoneInput && !phoneInput.value) {
            try {
                const saved = localStorage.getItem('bitwave_phone_number');
                if (saved) phoneInput.value = saved;
            } catch (e) { /* ignore */ }
        }
    }

    async function handleDevicePay() {
        const phoneInput = $('devicePhoneInput');
        const payBtn = $('devicePayBtn');
        const payText = $('devicePayText');
        const payLoader = $('devicePayLoader');
        const phone = phoneInput.value.trim();

        if (!phone || !validPhone(phone)) {
            alert('Please enter a valid phone number');
            phoneInput.focus();
            return;
        }

        if (!dpSelectedPlan) {
            alert('Please select a plan first');
            return;
        }

        payBtn.disabled = true;
        payText.classList.add('hidden');
        payLoader.classList.remove('hidden');

        try {
            const mac = $('deviceMacInput').value.trim();
            const deviceName = $('deviceNameInput')?.value.trim() || '';
            const ownerName = $('deviceOwnerName')?.value.trim() || '';

            const body = {
                device_mac: mac,
                owner_phone: fmtPhone(phone),
                plan_id: dpSelectedPlan.id,
                router_id: getRouterIdSafe(),
                device_name: deviceName || `Device ${mac.slice(-5)}`,
                device_type: dpSelectedType,
                payment_method: 'mobile_money',
                owner_name: ownerName || null
            };

            console.log('📺 [DEVICE] Pair-and-pay request:', body);

            const resp = await fetch(proxied(`${apiBase()}/public/device/pair-and-pay`), {
                method: 'POST',
                headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                mode: 'cors',
                body: JSON.stringify(body)
            });

            const data = await resp.json();
            if (!resp.ok) throw new Error(data.detail || 'Device pairing failed');

            console.log('✅ [DEVICE] Pair-and-pay response:', data);
            dpPairingData = data;

            // Save phone for returning users
            try { localStorage.setItem('bitwave_phone_number', phone); } catch (e) { /* ignore */ }

            if (data.status === 'pending' && data.customer_id) {
                showDeviceProcessing();
                await pollDevicePayment(data.customer_id);
            } else {
                showDeviceSuccess(data, false);
            }

        } catch (err) {
            showDeviceError(err.message);
        } finally {
            payBtn.disabled = false;
            payText.classList.remove('hidden');
            payLoader.classList.add('hidden');
        }
    }

    // ========================================
    // PAYMENT POLLING
    // ========================================
    async function pollDevicePayment(customerId) {
        const MAX_MS = 120000;
        const INTERVAL = 4000;
        const start = Date.now();

        while (Date.now() - start < MAX_MS) {
            try {
                const url = `${apiBase()}/hotspot/payment-status/${customerId}`;
                const resp = await fetch(proxied(url), {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' },
                    mode: 'cors'
                });

                if (resp.ok) {
                    const data = await resp.json();
                    console.log('📺 [DEVICE] Poll status:', data.status);

                    if (data.status === 'active') {
                        showDeviceSuccess(Object.assign({}, dpPairingData, data), false);
                        return;
                    }

                    if (data.status === 'inactive' && Date.now() - start > 60000) {
                        showDeviceError('Payment not received. Please try again.');
                        return;
                    }
                }
            } catch (err) {
                console.warn('📺 [DEVICE] Poll error:', err.message);
            }

            await new Promise(r => setTimeout(r, INTERVAL));
        }

        showDeviceError('Payment verification timed out. Check your M-Pesa messages or look up the device in "My Devices".');
    }

    // ========================================
    // STEP: Processing
    // ========================================
    function showDeviceProcessing() {
        hideAllSteps();
        $('deviceStepProcessing').classList.remove('hidden');
        updateStepDots(3);
    }

    // ========================================
    // STEP: Success
    // ========================================
    function showDeviceSuccess(data, isVoucher) {
        hideAllSteps();
        $('deviceStepSuccess').classList.remove('hidden');
        updateStepDots(4);

        const details = $('deviceSuccessDetails');
        if (!details) return;

        const mac = data.device_mac || $('deviceMacInput')?.value || '';
        const name = data.device_name || $('deviceNameInput')?.value || dpSelectedType.toUpperCase();
        const planName = data.plan_name || (dpSelectedPlan ? dpSelectedPlan.duration : '—');
        const expiry = data.expiry || data.expires_at;
        const expiryText = expiry ? new Date(expiry).toLocaleDateString('en-KE', {
            weekday: 'short', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi'
        }) : '—';

        const typeIcons = { tv: '📺', console: '🎮', laptop: '💻', iot: '📡', other: '📱' };
        const icon = typeIcons[data.device_type || dpSelectedType] || '📱';

        details.innerHTML = `
            <div class="device-summary-row"><span class="device-summary-label">Device</span><span class="device-summary-value">${icon} ${name}</span></div>
            <div class="device-summary-row"><span class="device-summary-label">MAC</span><span class="device-summary-value" style="font-family:monospace;font-size:0.8rem;">${mac}</span></div>
            <div class="device-summary-row"><span class="device-summary-label">Plan</span><span class="device-summary-value">${planName}</span></div>
            <div class="device-summary-row"><span class="device-summary-label">Expires</span><span class="device-summary-value">${expiryText}</span></div>
            <div class="device-summary-row"><span class="device-summary-label">Method</span><span class="device-summary-value">${isVoucher ? 'Voucher' : 'M-Pesa'}</span></div>
        `;
    }

    function setupSuccessActions() {
        const doneBtn = $('deviceSuccessDone');
        const addBtn = $('deviceSuccessAddAnother');
        if (doneBtn) doneBtn.addEventListener('click', resetWizard);
        if (addBtn) addBtn.addEventListener('click', () => {
            resetWizard();
            $('deviceMacInput').value = '';
            $('deviceNameInput').value = '';
            $('deviceMacStatus').textContent = '';
            $('deviceMacCounter').textContent = '0/12 characters';
            $('deviceStep1Next').disabled = true;
        });
    }

    // ========================================
    // STEP: Error
    // ========================================
    function showDeviceError(message) {
        hideAllSteps();
        $('deviceStepError').classList.remove('hidden');

        const msgEl = $('deviceErrorMsg');
        if (msgEl) msgEl.textContent = message || 'Please try again.';
    }

    function setupErrorActions() {
        const retryBtn = $('deviceErrorRetry');
        if (retryBtn) retryBtn.addEventListener('click', () => goToStep(1));
    }

    // ========================================
    // NAVIGATION helpers
    // ========================================
    function hideAllSteps() {
        ['deviceStep1', 'deviceStep2', 'deviceStep3', 'deviceStepProcessing', 'deviceStepSuccess', 'deviceStepError']
            .forEach(id => { const el = $(id); if (el) el.classList.add('hidden'); });
    }

    function goToStep(num) {
        hideAllSteps();
        if (num === 1) $('deviceStep1').classList.remove('hidden');
        else if (num === 2) $('deviceStep2').classList.remove('hidden');
        else if (num === 3) $('deviceStep3').classList.remove('hidden');
        updateStepDots(num);
    }

    function updateStepDots(activeStep) {
        const dots = document.querySelectorAll('.device-step-dot');
        const lines = document.querySelectorAll('.device-step-line');
        dots.forEach((dot, i) => {
            const step = i + 1;
            dot.classList.remove('active', 'done');
            if (step < activeStep) dot.classList.add('done');
            else if (step === activeStep) dot.classList.add('active');
        });
        lines.forEach((line, i) => {
            line.classList.toggle('done', i + 1 < activeStep);
        });
    }

    function resetWizard() {
        dpSelectedPlan = null;
        dpPairingData = null;
        goToStep(1);

        const vResult = $('deviceVoucherResult');
        if (vResult) { vResult.classList.add('hidden'); vResult.className = 'device-voucher-result hidden'; }
        const vInput = $('deviceVoucherInput');
        if (vInput) vInput.value = '';
    }

    // ========================================
    // MY DEVICES
    // ========================================
    function setupMyDevices() {
        const lookupBtn = $('deviceMyLookupBtn');
        const phoneInput = $('deviceMyPhoneInput');
        if (!lookupBtn) return;

        // Pre-fill phone
        try {
            const saved = localStorage.getItem('bitwave_phone_number');
            if (saved && phoneInput) phoneInput.value = saved;
        } catch (e) { /* ignore */ }

        lookupBtn.addEventListener('click', () => loadMyDevices());
        if (phoneInput) {
            phoneInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); lookupBtn.click(); }
            });
        }
    }

    async function loadMyDevices() {
        const phoneInput = $('deviceMyPhoneInput');
        const list = $('deviceMyList');
        const phone = phoneInput.value.trim();
        if (!phone) { phoneInput.focus(); return; }

        list.innerHTML = '<div class="device-my-loading"><span class="loader-spinner" style="display:inline-block;width:20px;height:20px;border:2px solid rgba(0,0,0,0.1);border-top-color:#7c3aed;border-radius:50%;animation:spin 0.8s linear infinite;"></span> Loading...</div>';

        try {
            const rId = getRouterIdSafe();
            const url = `${apiBase()}/public/device/paired/${rId}/${encodeURIComponent(phone)}`;
            const resp = await fetch(proxied(url), {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                mode: 'cors'
            });

            const data = await resp.json();
            if (!resp.ok) throw new Error(data.detail || 'Failed to load devices');

            if (!data.devices || data.devices.length === 0) {
                list.innerHTML = '<div class="device-my-empty">No devices paired yet.<br>Use the "Add Device" tab to get started.</div>';
                return;
            }

            renderMyDevices(data.devices, phone);
        } catch (err) {
            list.innerHTML = `<div class="device-my-empty" style="color:var(--error);">${err.message}</div>`;
        }
    }

    function renderMyDevices(devices, ownerPhone) {
        const list = $('deviceMyList');
        const icons = { tv: '📺', console: '🎮', laptop: '💻', iot: '📡', other: '📱' };

        list.innerHTML = devices.map(d => {
            const icon = icons[d.device_type] || '📱';
            const isExpired = d.expires_at ? new Date(d.expires_at) < new Date() : false;
            const statusClass = isExpired ? 'expired' : 'active';
            const statusText = isExpired ? 'Expired' : 'Active';
            const expiry = d.expires_at ? new Date(d.expires_at).toLocaleDateString('en-KE', {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi'
            }) : '—';

            return `
                <div class="device-my-card" data-pairing-id="${d.id}" data-mac="${d.device_mac}">
                    <div class="device-my-card-header">
                        <span class="device-my-card-icon">${icon}</span>
                        <span class="device-my-card-name">${d.device_name || 'Device'}</span>
                        <span class="device-my-card-status ${statusClass}">${statusText}</span>
                    </div>
                    <div class="device-my-card-detail"><span>MAC</span><span style="font-family:monospace;font-size:0.75rem;">${d.device_mac}</span></div>
                    <div class="device-my-card-detail"><span>Expires</span><span>${expiry}</span></div>
                    <div class="device-my-card-actions">
                        <button class="device-my-action-btn" data-action="reconnect" ${isExpired ? 'disabled title="Plan expired"' : ''}>🔄 Reconnect</button>
                        <button class="device-my-action-btn danger" data-action="remove">🗑 Remove</button>
                    </div>
                </div>
            `;
        }).join('');

        // Wire up action buttons
        list.querySelectorAll('.device-my-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const card = e.target.closest('.device-my-card');
                const pairingId = card.dataset.pairingId;
                const mac = card.dataset.mac;
                const action = btn.dataset.action;

                if (action === 'reconnect') handleReconnect(btn, mac, ownerPhone);
                else if (action === 'remove') handleUnpair(btn, pairingId, card, ownerPhone);
            });
        });
    }

    async function handleReconnect(btn, mac, ownerPhone) {
        btn.disabled = true;
        btn.textContent = '⏳ ...';

        try {
            const body = {
                device_mac: mac,
                router_id: getRouterIdSafe(),
                owner_phone: fmtPhone(ownerPhone)
            };

            const resp = await fetch(proxied(`${apiBase()}/public/device/reconnect`), {
                method: 'POST',
                headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                mode: 'cors',
                body: JSON.stringify(body)
            });

            const data = await resp.json();
            if (!resp.ok) throw new Error(data.detail || 'Reconnect failed');

            btn.textContent = '✓ Done';
            btn.style.color = '#059669';
            setTimeout(() => {
                btn.textContent = '🔄 Reconnect';
                btn.style.color = '';
                btn.disabled = false;
            }, 3000);
        } catch (err) {
            btn.textContent = '✕ ' + err.message.slice(0, 30);
            btn.style.color = 'var(--error)';
            setTimeout(() => {
                btn.textContent = '🔄 Reconnect';
                btn.style.color = '';
                btn.disabled = false;
            }, 4000);
        }
    }

    async function handleUnpair(btn, pairingId, card, ownerPhone) {
        const deviceName = card.querySelector('.device-my-card-name')?.textContent || 'this device';

        // Confirm dialog
        const confirmed = await showConfirmDialog(
            'Remove Device?',
            `Remove ${deviceName}? This will disconnect the device from the internet.`
        );
        if (!confirmed) return;

        btn.disabled = true;
        btn.textContent = '⏳ ...';

        try {
            const resp = await fetch(proxied(`${apiBase()}/public/device/unpair/${pairingId}`), {
                method: 'DELETE',
                headers: { 'Accept': 'application/json' },
                mode: 'cors'
            });

            const data = await resp.json();
            if (!resp.ok) throw new Error(data.detail || 'Failed to remove device');

            card.style.opacity = '0.4';
            card.style.pointerEvents = 'none';
            setTimeout(() => {
                card.remove();
                const list = $('deviceMyList');
                if (list && !list.querySelector('.device-my-card')) {
                    list.innerHTML = '<div class="device-my-empty">No devices paired.<br>Use the "Add Device" tab to add one.</div>';
                }
            }, 500);
        } catch (err) {
            btn.disabled = false;
            btn.textContent = '🗑 Remove';
            alert(err.message);
        }
    }

    // ========================================
    // CONFIRM DIALOG
    // ========================================
    function showConfirmDialog(title, message) {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.className = 'device-confirm-overlay';
            overlay.innerHTML = `
                <div class="device-confirm-box">
                    <div class="device-confirm-title">${title}</div>
                    <p class="device-confirm-msg">${message}</p>
                    <div class="device-confirm-actions">
                        <button class="device-confirm-cancel">Cancel</button>
                        <button class="device-confirm-ok">Remove</button>
                    </div>
                </div>
            `;

            overlay.querySelector('.device-confirm-cancel').addEventListener('click', () => {
                overlay.remove();
                resolve(false);
            });
            overlay.querySelector('.device-confirm-ok').addEventListener('click', () => {
                overlay.remove();
                resolve(true);
            });
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) { overlay.remove(); resolve(false); }
            });

            document.body.appendChild(overlay);
        });
    }

})();
