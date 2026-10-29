// "Your internet has expired" page for walled PPPoE customers.
//
// The router sends every plain-HTTP request of an expired PPPoE customer here
// with ?r=<router id>&u=<PPPoE username> (u is missing when the router could
// not add it; the page then asks for the account). Flow:
//   1. GET  /public/pppoe/expired/<r>?u=<u>   account, plans, paybill
//   2. POST /public/pppoe/expired/pay         M-Pesa prompt to their phone
//   3. GET  /public/pppoe/expired/<r>/status  poll until online
// Paying runs the normal PPPoE provisioning on the backend: the router moves
// the login back to its plan and kicks the session, the customer's router
// redials, and the next poll answers online=true -> "You're back online".
//
// API calls go to the primary API host and fall back to this origin's /api/bw
// proxy, exactly like script.js: while walled, the customer may reach this
// origin even when the API host's IP is outside the router's allow-list.
(function () {
    'use strict';

    var PRIMARY = 'https://isp.bitwavetechnologies.com/api';
    var FALLBACK = '/api/bw';
    var POLL_MS = window.__EXPIRED_POLL_MS || 4000;        // after a prompt
    var IDLE_POLL_MS = window.__EXPIRED_IDLE_POLL_MS || 15000; // paybill payers
    var PROMPT_WAIT_MS = 3 * 60 * 1000;

    // Keep in sync with THEMES in script.js (primary colours only).
    var THEMES = {
        sunset_orange: ['#E85D04', '#DC2F02', '#FFFCF2'],
        ocean_blue: ['#3B82F6', '#2563EB', '#F0F7FF'],
        emerald_green: ['#10B981', '#059669', '#F0FDF4'],
        bright_violet: ['#8B5CF6', '#7C3AED', '#FAF5FF'],
        rose_gold: ['#E11D48', '#BE123C', '#FFF1F2'],
        slate_gray: ['#475569', '#334155', '#F8FAFC']
    };

    var params = new URLSearchParams(location.search);
    var routerId = (params.get('r') || '').replace(/\D/g, '');
    var username = params.get('u') || '';
    var useFallback = false;
    var state = { data: null, planId: null, pollTimer: null, promptAt: 0 };

    function $(id) { return document.getElementById(id); }
    function show(id, on) { var el = $(id); if (el) el.hidden = !on; }
    function text(id, value) { var el = $(id); if (el) el.textContent = value == null || value === '' ? '-' : String(value); }

    function request(method, path, body) {
        function go(base) {
            var ctl = window.AbortController ? new AbortController() : null;
            var timer = ctl ? setTimeout(function () { ctl.abort(); }, base === PRIMARY ? 6000 : 15000) : null;
            return fetch(base + path, {
                method: method,
                headers: body ? { 'Content-Type': 'application/json', 'Accept': 'application/json' } : { 'Accept': 'application/json' },
                body: body ? JSON.stringify(body) : undefined,
                mode: 'cors',
                cache: 'no-store',
                signal: ctl ? ctl.signal : undefined
            }).then(function (res) {
                clearTimeout(timer);
                return res.json().catch(function () { return {}; }).then(function (json) {
                    return { ok: res.ok, status: res.status, body: json };
                });
            }, function (err) {
                clearTimeout(timer);
                err.network = true;
                throw err;
            });
        }
        if (useFallback) return go(FALLBACK);
        return go(PRIMARY).catch(function (err) {
            if (!err.network) throw err;
            useFallback = true; // walled garden ate the API host: use this origin
            return go(FALLBACK);
        });
    }

    function money(amount) {
        var n = Number(amount || 0);
        return 'KES ' + n.toLocaleString('en-KE', { maximumFractionDigits: 0 });
    }

    function duration(plan) {
        var v = plan.duration_value, u = String(plan.duration_unit || '').toLowerCase();
        if (!v) return '';
        var unit = u.indexOf('min') === 0 ? 'minute' : u.indexOf('hour') === 0 ? 'hour' : 'day';
        if (unit === 'day' && v % 30 === 0) return (v / 30) + (v === 30 ? ' month' : ' months');
        if (unit === 'day' && v % 7 === 0) return (v / 7) + (v === 7 ? ' week' : ' weeks');
        return v + ' ' + unit + (v === 1 ? '' : 's');
    }

    // Backend datetimes are naive UTC.
    function formatExpiry(iso) {
        if (!iso) return '-';
        var d = new Date(/Z$|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z');
        if (isNaN(d.getTime())) return '-';
        try {
            return d.toLocaleString('en-KE', {
                timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', year: 'numeric',
                hour: 'numeric', minute: '2-digit', hour12: true
            });
        } catch (e) {
            return d.toUTCString();
        }
    }

    function normalizePhone(raw) {
        var digits = String(raw || '').replace(/\D/g, '');
        if (digits.length === 10 && digits[0] === '0' && (digits[1] === '7' || digits[1] === '1')) return '254' + digits.slice(1);
        if (digits.length === 9 && (digits[0] === '7' || digits[0] === '1')) return '254' + digits;
        if (digits.length === 12 && digits.indexOf('254') === 0) return digits;
        return null;
    }
    window.__expiredPage = { normalizePhone: normalizePhone, formatExpiry: formatExpiry, duration: duration };

    function applyTheme(name) {
        var t = THEMES[name] || THEMES.sunset_orange;
        var root = document.documentElement;
        root.style.setProperty('--primary', t[0]);
        root.style.setProperty('--primary-dark', t[1]);
        root.style.setProperty('--bg', t[2]);
        var h = t[0].replace('#', '');
        root.style.setProperty('--primary-rgb', parseInt(h.slice(0, 2), 16) + ', ' + parseInt(h.slice(2, 4), 16) + ', ' + parseInt(h.slice(4, 6), 16));
        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', t[0]);
    }

    function unavailable(message) {
        stopPolling();
        show('loading', false);
        show('expiredView', false);
        show('online', false);
        if (message) text('unavailableText', message);
        show('unavailable', true);
    }

    function showOnline(customer) {
        stopPolling();
        show('loading', false);
        show('expiredView', false);
        show('unavailable', false);
        text('onlineText', customer && customer.expiry
            ? (customer.plan_name ? customer.plan_name + ' is active until ' : 'Active until ') + formatExpiry(customer.expiry) + '.'
            : 'Your internet is active.');
        show('online', true);
    }

    function selectedPlan() {
        var plans = (state.data && state.data.plans) || [];
        for (var i = 0; i < plans.length; i++) if (plans[i].id === state.planId) return plans[i];
        return null;
    }

    function renderPlans() {
        var box = $('plans');
        var plans = state.data.plans || [];
        box.innerHTML = '';
        plans.forEach(function (plan) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'x-plan';
            btn.setAttribute('role', 'radio');
            btn.setAttribute('aria-checked', plan.id === state.planId ? 'true' : 'false');
            btn.dataset.planId = plan.id;
            var left = document.createElement('div');
            var name = document.createElement('div');
            name.className = 'x-plan-name';
            name.textContent = plan.name;
            var current = state.data.customer && state.data.customer.plan_id === plan.id;
            if (current) {
                var badge = document.createElement('span');
                badge.className = 'x-badge';
                badge.textContent = 'Your plan';
                name.appendChild(badge);
            }
            var meta = document.createElement('div');
            meta.className = 'x-plan-meta';
            meta.textContent = [duration(plan), plan.speed].filter(Boolean).join(' · ');
            left.appendChild(name);
            left.appendChild(meta);
            var price = document.createElement('div');
            price.className = 'x-plan-price';
            price.textContent = money(plan.price);
            btn.appendChild(left);
            btn.appendChild(price);
            btn.addEventListener('click', function () {
                state.planId = plan.id;
                renderPlans();
                refreshAmounts();
            });
            box.appendChild(btn);
        });
    }

    function refreshAmounts() {
        var plan = selectedPlan();
        $('payBtn').textContent = plan ? 'Pay ' + money(plan.price) + ' with M-Pesa' : 'Pay with M-Pesa';
        text('pbAmount', plan ? money(plan.price) : '');
    }

    function render(data) {
        state.data = data;
        show('loading', false);
        show('unavailable', false);
        var router = data.router || {};
        var settings = data.portal_settings || {};
        applyTheme(settings.color_theme);
        text('brand', router.business_name || settings.welcome_title || 'Internet');
        var support = settings.portal_support_phone || router.support_phone;
        if (support) {
            $('helpLink').href = 'tel:' + support.replace(/[^\d+]/g, '');
            $('helpLink').textContent = 'Call ' + support;
            show('helpLink', true);
            $('footer').textContent = 'Need help? Call ' + (router.business_name || 'your provider') + ' on ' + support;
        }

        var c = data.customer;
        if (c && c.online) { showOnline(c); return; }

        show('expiredView', true);
        if (!c) {
            show('accountCard', false);
            show('payCard', false);
            show('paybillCard', false);
            text('headline', 'Your internet has expired');
            if (data.lookup === 'not_found') {
                text('lookupHint', "We couldn't find that account on this network. Check the account number on your SMS and try again.");
            }
            show('lookupCard', true);
            return;
        }

        show('lookupCard', false);
        show('accountCard', true);
        text('accName', c.first_name);
        text('accUser', c.username);
        text('accNumber', c.account_number);
        show('accNumberRow', !!c.account_number);
        text('accPlan', c.plan_name ? c.plan_name + (c.plan_price ? ' (' + money(c.plan_price) + ')' : '') : '-');
        text('accExpiry', formatExpiry(c.expiry));

        if (c.paused) {
            text('headline', 'Your account is paused');
            text('subline', 'Your provider paused this account. Contact them to resume it.');
            show('payCard', false);
            show('paybillCard', false);
            return;
        }
        text('headline', 'Your internet has expired');
        text('subline', "Renew below and you'll be reconnected automatically.");

        var plans = data.plans || [];
        if (state.planId == null || !selectedPlan()) {
            state.planId = plans.some(function (p) { return p.id === c.plan_id; }) ? c.plan_id : (plans[0] && plans[0].id);
        }
        var canPrompt = router.mpesa !== false && plans.length > 0;
        show('payCard', canPrompt);
        if (canPrompt) {
            renderPlans();
            if (c.phone_hint) {
                $('phoneHint').textContent = 'Leave blank to send the prompt to your number ending ' + c.phone_hint.slice(-3) + '.';
                show('phoneHint', true);
            }
        }
        if (data.paybill && c.account_number) {
            text('pbNumber', data.paybill);
            text('pbAccount', c.account_number);
            show('paybillCard', true);
        }
        refreshAmounts();
        startPolling(IDLE_POLL_MS); // paybill / reseller renewals land here too
    }

    function load() {
        if (!routerId) { unavailable(); return; }
        var path = '/public/pppoe/expired/' + routerId + (username ? '?u=' + encodeURIComponent(username) : '');
        request('GET', path).then(function (res) {
            if (res.status === 404) { unavailable(); return; }
            if (!res.ok) throw new Error('load failed');
            render(res.body);
        }).catch(function () {
            unavailable("We couldn't load your account. Check that your router is on and try again in a minute.");
        });
    }

    function stopPolling() {
        if (state.pollTimer) clearTimeout(state.pollTimer);
        state.pollTimer = null;
    }

    function startPolling(every) {
        stopPolling();
        if (!username) return;
        state.pollTimer = setTimeout(function tick() {
            request('GET', '/public/pppoe/expired/' + routerId + '/status?u=' + encodeURIComponent(username))
                .then(function (res) {
                    if (!res.ok) return;
                    var s = res.body;
                    if (s.online) { showOnline(s); return; }
                    var p = s.payment;
                    if (state.promptAt && p && p.status === 'failed') {
                        state.promptAt = 0;
                        promptDone(p.result_desc ? 'Payment not completed: ' + p.result_desc : 'Payment not completed. Try again.');
                    } else if (state.promptAt && Date.now() - state.promptAt > PROMPT_WAIT_MS) {
                        state.promptAt = 0;
                        promptDone("We haven't received the payment yet. If you paid, this page updates when it arrives.");
                    }
                })
                // The router kicks the session when payment lands, so a poll
                // can fail while it redials: keep going.
                .catch(function () {})
                .then(function () {
                    if (state.pollTimer) state.pollTimer = setTimeout(tick, state.promptAt ? POLL_MS : every);
                });
        }, state.promptAt ? POLL_MS : every);
    }

    function promptDone(errorMessage) {
        show('waiting', false);
        $('payBtn').disabled = false;
        if (errorMessage) {
            $('payError').textContent = errorMessage;
            show('payError', true);
        }
    }

    $('lookupForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var value = $('lookupInput').value.trim();
        if (!value) return;
        username = value;
        try {
            params.set('u', value);
            history.replaceState(null, '', location.pathname + '?' + params.toString());
        } catch (err) { /* old browsers: fine */ }
        show('expiredView', false);
        show('loading', true);
        load();
    });

    $('payForm').addEventListener('submit', function (e) {
        e.preventDefault();
        show('payError', false);
        var plan = selectedPlan();
        if (!plan) return;
        var raw = $('phone').value.trim();
        var phone = null;
        if (raw) {
            phone = normalizePhone(raw);
            if (!phone) {
                $('payError').textContent = 'Enter a valid M-Pesa number, e.g. 0712 345 678.';
                show('payError', true);
                return;
            }
        } else if (!(state.data.customer && state.data.customer.phone_hint)) {
            $('payError').textContent = 'Enter the M-Pesa number to send the prompt to.';
            show('payError', true);
            return;
        }
        $('payBtn').disabled = true;
        request('POST', '/public/pppoe/expired/pay', {
            router_id: Number(routerId), username: username, plan_id: plan.id, phone: phone
        }).then(function (res) {
            if (res.ok || res.status === 409) {
                state.promptAt = Date.now();
                var hint = res.body && res.body.phone_hint;
                text('waitingText', (hint ? 'We sent a prompt to the number ending ' + hint.slice(-3) + '. ' : '')
                    + 'Enter your M-Pesa PIN to pay ' + money(plan.price) + '. Keep this page open.');
                show('waiting', true);
                startPolling(POLL_MS);
                return;
            }
            var detail = res.body && res.body.detail;
            promptDone(typeof detail === 'string' ? detail : (detail && detail.message) || 'Could not send the prompt. Try again.');
        }).catch(function () {
            promptDone('Could not reach the payment service. Try again.');
        });
    });

    load();
})();
