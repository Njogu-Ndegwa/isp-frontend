// Browser APIs the portal uses that core-js does not cover. Written in plain
// ES5 because it runs as-is on the old browsers it is for. Bundled into
// legacy/polyfills.js by scripts/build-legacy.js, so modern browsers never load it.
(function () {
    'use strict';

    // Element.closest / matches (Chrome < 41, old WebKit)
    var EP = window.Element && Element.prototype;
    if (EP && !EP.matches) {
        EP.matches = EP.webkitMatchesSelector || EP.msMatchesSelector || function (sel) {
            var all = (this.ownerDocument || document).querySelectorAll(sel);
            for (var i = 0; i < all.length; i++) if (all[i] === this) return true;
            return false;
        };
    }
    if (EP && !EP.closest) {
        EP.closest = function (sel) {
            var el = this;
            while (el && el.nodeType === 1) {
                if (el.matches(sel)) return el;
                el = el.parentNode;
            }
            return null;
        };
    }

    // ParentNode.append / prepend, ChildNode.remove (Chrome < 54 / < 23)
    function toNode(args) {
        var frag = document.createDocumentFragment();
        for (var i = 0; i < args.length; i++) {
            var a = args[i];
            frag.appendChild(a && a.nodeType ? a : document.createTextNode(String(a)));
        }
        return frag;
    }
    [window.Element, window.Document, window.DocumentFragment].forEach(function (C) {
        if (!C) return;
        var P = C.prototype;
        if (!P.append) P.append = function () { this.appendChild(toNode(arguments)); };
        if (!P.prepend) P.prepend = function () { this.insertBefore(toNode(arguments), this.firstChild); };
    });
    if (EP && !EP.remove) {
        EP.remove = function () { if (this.parentNode) this.parentNode.removeChild(this); };
    }

    // NodeList.forEach (Chrome < 51)
    if (window.NodeList && !NodeList.prototype.forEach) {
        NodeList.prototype.forEach = Array.prototype.forEach;
    }

    // scrollTo({ top, behavior }) THROWS before Chrome 61, and the portal calls
    // it on most screen changes, so an old browser would die mid-flow.
    if (!('scrollBehavior' in document.documentElement.style)) {
        var winScrollTo = window.scrollTo;
        window.scrollTo = function (a, b) {
            if (a && typeof a === 'object') {
                return winScrollTo.call(window,
                    a.left !== undefined ? a.left : window.pageXOffset,
                    a.top !== undefined ? a.top : window.pageYOffset);
            }
            return winScrollTo.call(window, a, b);
        };
        if (EP) {
            EP.scrollTo = function (a, b) {
                if (a && typeof a === 'object') {
                    if (a.left !== undefined) this.scrollLeft = a.left;
                    if (a.top !== undefined) this.scrollTop = a.top;
                } else {
                    this.scrollLeft = a;
                    this.scrollTop = b;
                }
            };
        }
    }

    // addEventListener(type, fn, { once: true }): before Chrome 55 the option is
    // ignored and the object just counts as "capture = true".
    var onceWorks = false;
    try {
        var probe = Object.defineProperty({}, 'once', { get: function () { onceWorks = true; return false; } });
        window.addEventListener('__probe', null, probe);
    } catch (e) {}
    if (!onceWorks && window.EventTarget) {
        var add = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function (type, fn, opts) {
            if (!opts || typeof opts !== 'object') return add.call(this, type, fn, opts);
            var capture = !!opts.capture;
            if (!opts.once || !fn) return add.call(this, type, fn, capture);
            var self = this;
            var wrapped = function (e) {
                self.removeEventListener(type, wrapped, capture);
                return typeof fn === 'function' ? fn.call(self, e) : fn.handleEvent(e);
            };
            return add.call(this, type, wrapped, capture);
        };
    }

    // AbortController (Chrome < 66). The portal aborts its fetches on a timer
    // and then falls back to the proxy, so abort has to really reject the fetch.
    if (!window.AbortController) {
        var AbortSignalShim = function () {
            this.aborted = false;
            this._listeners = [];
        };
        AbortSignalShim.prototype.addEventListener = function (type, fn) {
            if (type === 'abort') this._listeners.push(fn);
        };
        AbortSignalShim.prototype.removeEventListener = function (type, fn) {
            var i = this._listeners.indexOf(fn);
            if (i !== -1) this._listeners.splice(i, 1);
        };
        var AbortControllerShim = function () { this.signal = new AbortSignalShim(); };
        AbortControllerShim.prototype.abort = function () {
            var s = this.signal;
            if (s.aborted) return;
            s.aborted = true;
            s._listeners.slice().forEach(function (fn) { fn({ type: 'abort', target: s }); });
        };
        window.AbortController = AbortControllerShim;
        window.AbortSignal = AbortSignalShim;

        // Native fetch of this era ignores `signal`, so race it against the abort.
        var nativeFetch = window.fetch;
        if (nativeFetch) {
            window.fetch = function (input, init) {
                var signal = init && init.signal;
                if (!signal) return nativeFetch.apply(window, arguments);
                var plain = {};
                for (var k in init) if (k !== 'signal') plain[k] = init[k];
                return new Promise(function (resolve, reject) {
                    function abortError() {
                        var err = new Error('Aborted');
                        err.name = 'AbortError';
                        return err;
                    }
                    if (signal.aborted) { reject(abortError()); return; }
                    function onAbort() { reject(abortError()); }
                    signal.addEventListener('abort', onAbort);
                    nativeFetch.call(window, input, plain).then(function (r) {
                        signal.removeEventListener('abort', onAbort);
                        resolve(r);
                    }, function (e) {
                        signal.removeEventListener('abort', onAbort);
                        reject(e);
                    });
                });
            };
        }
    }
})();
