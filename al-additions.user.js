// ==UserScript==
// @name         AL Additions
// @namespace    daiya.al-additions-v3
// @version      0.8.0
// @author       Daiya
// @description  AniList additions: sync, list tools, airing indicators, songs, links, and utilities.
// @license      GPL-3.0-or-later
// @icon         https://anilist.co/img/icons/favicon-32x32.png
// @homepage     https://github.com/Daiya404/AL-Additions#readme
// @homepageURL  https://github.com/Daiya404/AL-Additions
// @source       https://github.com/Daiya404/AL-Additions.git
// @supportURL   https://github.com/Daiya404/AL-Additions/issues
// @downloadURL  https://raw.githubusercontent.com/Daiya404/AL-Additions/main/al-additions.user.js
// @updateURL    https://raw.githubusercontent.com/Daiya404/AL-Additions/main/al-additions.user.js
// @match        https://anilist.co/*
// @match        https://myanimelist.net/*
// @connect      graphql.anilist.co
// @connect      myanimelist.net
// @connect      api.myanimelist.net
// @connect      api.animethemes.moe
// @connect      api.mangaupdates.com
// @connect      www.mangaupdates.com
// @connect      www.novelupdates.com
// @connect      s4.anilist.co
// @grant        GM_deleteValue
// @grant        GM_download
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @grant        window.close
// @run-at       document-start
// @noframes
// ==/UserScript==

(function() {
	"use strict";
	var _GM_deleteValue = (() => typeof GM_deleteValue != "undefined" ? GM_deleteValue : void 0)();
	var _GM_download = (() => typeof GM_download != "undefined" ? GM_download : void 0)();
	var _GM_getValue = (() => typeof GM_getValue != "undefined" ? GM_getValue : void 0)();
	var _GM_registerMenuCommand = (() => typeof GM_registerMenuCommand != "undefined" ? GM_registerMenuCommand : void 0)();
	var _GM_setValue = (() => typeof GM_setValue != "undefined" ? GM_setValue : void 0)();
	var _GM_xmlhttpRequest = (() => typeof GM_xmlhttpRequest != "undefined" ? GM_xmlhttpRequest : void 0)();
	var _unsafeWindow = (() => typeof unsafeWindow != "undefined" ? unsafeWindow : void 0)();
	var HOST = location.hostname;
	var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	var clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
	var esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		"\"": "&quot;",
		"'": "&#39;"
	})[c]);
	var safe = (fn, label) => {
		try {
			return fn();
		} catch (e) {
			console.error("[AL-Additions]", label || "", e);
		}
	};
	var tryOr = async (fn, fallback = null) => {
		try {
			return await fn();
		} catch (_) {
			return fallback;
		}
	};
	function authError(service, message) {
		const e = new Error(message);
		e.auth = service;
		return e;
	}
	function debounce(fn, ms = 0) {
		let t = 0;
		return (...a) => {
			clearTimeout(t);
			t = setTimeout(() => fn(...a), ms);
		};
	}
	function memo(fn, { keepNull = true, ttl = 0 } = {}) {
		const m = new Map();
		return (key, ...args) => {
			const k = String(key);
			const hit = m.get(k);
			if (hit && (!ttl || Date.now() - hit.at < ttl)) return hit.p;
			const entry = {
				at: Date.now(),
				p: Promise.resolve()
			};
			entry.p = Promise.resolve().then(() => fn(...args)).then((v) => {
				if (v == null && !keepNull && m.get(k) === entry) m.delete(k);
				return v;
			}, (e) => {
				if (m.get(k) === entry) m.delete(k);
				throw e;
			});
			m.set(k, entry);
			return entry.p;
		};
	}
	function openTab(url) {
		const a = document.createElement("a");
		a.href = url;
		a.target = "_blank";
		a.rel = "noopener noreferrer";
		document.body.appendChild(a);
		a.click();
		a.remove();
	}
	var store = {
		get: (k, d) => _GM_getValue(k, d),
		set: (k, v) => _GM_setValue(k, v),
		del: (k) => _GM_deleteValue(k)
	};
	function jsonGet(key, fallback) {
		try {
			const v = store.get(key, null);
			if (v == null) return fallback;
			return typeof v === "string" ? JSON.parse(v) : v;
		} catch (_) {
			return fallback;
		}
	}
	var jsonSet = (key, value) => store.set(key, JSON.stringify(value));
	function persistent(key, prune) {
		let data = jsonGet(key, {});
		if (!data || typeof data !== "object" || Array.isArray(data)) data = {};
		if (prune) safe(() => prune(data), "cache prune");
		const save = debounce(() => safe(() => jsonSet(key, data)), 500);
		return {
			data,
			save
		};
	}
	var gm = {
		request(url, o = {}) {
			return new Promise((resolve, reject) => _GM_xmlhttpRequest({
				method: "GET",
				timeout: 15e3,
				...o,
				url,
				onload: resolve,
				onerror: () => reject(new Error("Network error")),
				ontimeout: () => reject(new Error("Timeout")),
				onabort: () => reject(new Error("Request aborted"))
			}));
		},
		async text(url, o = {}) {
			const r = await gm.request(url, o);
			if (r.status < 200 || r.status >= 300) throw new Error(`HTTP ${r.status}`);
			return r.responseText || "";
		},
		async json(url, o = {}) {
			return JSON.parse(await gm.text(url, o));
		}
	};
	function randomString$1(len) {
		const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
		const arr = new Uint8Array(len);
		crypto.getRandomValues(arr);
		let out = "";
		for (let i = 0; i < len; i++) out += chars[arr[i] % 62];
		return out;
	}
	var Core = (() => {
		const navCbs = [];
		const bodyCbs = [];
		let observer = null;
		let lastHref = location.href;
		let muted = false;
		const fire = (list, arg) => {
			for (const cb of list.slice()) safe(() => cb(arg), "core");
		};
		function notifyNav() {
			if (muted || location.href === lastHref) return;
			lastHref = location.href;
			fire(navCbs);
		}
		for (const name of ["pushState", "replaceState"]) {
			const orig = history[name];
			history[name] = function(...args) {
				const r = orig.apply(this, args);
				notifyNav();
				return r;
			};
		}
		window.addEventListener("popstate", notifyNav);
		window.addEventListener("hashchange", notifyNav);
		setInterval(notifyNav, 400);
		function ready(cb) {
			if (document.body) safe(cb, "ready");
			else document.addEventListener("DOMContentLoaded", () => safe(cb, "ready"), { once: true });
		}
		function ensureObserver() {
			if (observer || !document.body) return;
			observer = new MutationObserver((m) => fire(bodyCbs, m));
			observer.observe(document.body, {
				childList: true,
				subtree: true,
				characterData: true
			});
		}
		ready(ensureObserver);
		function onBodyMutation(cb) {
			bodyCbs.push(cb);
			ready(ensureObserver);
			return () => {
				const i = bodyCbs.indexOf(cb);
				if (i !== -1) bodyCbs.splice(i, 1);
			};
		}
		function waitForSelector(selector, timeoutMs = 8e3) {
			return new Promise((resolve) => {
				const existing = document.querySelector(selector);
				if (existing) return resolve(existing);
				let done = false;
				let unsub = null;
				const finish = (v) => {
					if (done) return;
					done = true;
					clearTimeout(timer);
					if (unsub) unsub();
					resolve(v);
				};
				const timer = setTimeout(() => finish(null), timeoutMs);
				unsub = onBodyMutation(() => {
					const el = document.querySelector(selector);
					if (el) finish(el);
				});
			});
		}
		function silently(fn) {
			muted = true;
			try {
				fn();
			} finally {
				muted = false;
				lastHref = location.href;
			}
		}
		return {
			onNavigate: (cb) => navCbs.push(cb),
			onBodyMutation,
			waitForSelector,
			ready,
			silently
		};
	})();
	var PREFIX = "ala_setting_";
	var features = [];
	var ROWS = {};
	var textIO = {
		read: (el) => el.value,
		write: (el, v) => {
			el.value = v;
		}
	};
	var TYPES$1 = {
		toggle: {
			normalize: (v) => v === "false" ? false : !!v,
			html: (r, v) => `<span class="ala-switch"><input type="checkbox" data-key="${r.key}" ${v ? "checked" : ""}><span class="ala-slider"></span></span>`,
			read: (el) => el.checked,
			write: (el, v) => {
				el.checked = !!v;
			}
		},
		number: {
			normalize: (v, r) => {
				const n = Math.round(Number(v));
				return Number.isFinite(n) && n > 0 ? Math.max(r?.min ?? 1, Math.min(r?.max ?? 100, n)) : r?.def;
			},
			html: (r, v) => `<input type="number" data-key="${r.key}" min="${r.min ?? 1}" max="${r.max ?? 100}" step="1" inputmode="numeric" value="${esc(v)}">`,
			...textIO
		},
		select: {
			normalize: (v, r) => r?.options?.some((o) => o[0] === v) ? v : r?.def,
			html: (r, v) => `<select data-key="${r.key}">${(r.options || []).map(([val, label]) => `<option value="${val}" ${v === val ? "selected" : ""}>${label}</option>`).join("")}</select>`,
			...textIO
		},
		list: {
			normalize: (v, r) => {
				const arr = (Array.isArray(v) ? v : String(v == null ? "" : v).split(",")).map((x) => String(x).trim()).filter(Boolean);
				return arr.length ? arr : (r?.def || []).slice();
			},
			html: (r, v) => `<input type="text" data-key="${r.key}" value="${esc((v || []).join(", "))}" autocomplete="off" autocapitalize="off" spellcheck="false">`,
			read: (el) => el.value,
			write: (el, v) => {
				el.value = v.join(", ");
			}
		}
	};
	function register(f) {
		const toggle = {
			key: f.key,
			type: "toggle",
			def: f.def !== false,
			legacy: f.legacy || [],
			title: f.title,
			help: f.help
		};
		const options = (f.options || []).map((o) => ({
			...o,
			legacy: o.legacy || []
		}));
		for (const row of [toggle, ...options]) {
			if (ROWS[row.key]) throw new Error(`Duplicate setting: ${row.key}`);
			row.legacy = [...new Set([row.key, ...row.legacy])];
			ROWS[row.key] = row;
		}
		features.push({
			id: f.id,
			section: f.section || "Other",
			title: f.title,
			help: f.help,
			toggle,
			options
		});
	}
	function get(key) {
		const r = ROWS[key];
		if (!r) throw new Error(`Unknown setting: ${key}`);
		return TYPES$1[r.type].normalize(store.get(PREFIX + key, r.def), r);
	}
	function set(key, raw) {
		store.set(PREFIX + key, raw);
		store.set(PREFIX + key, get(key));
	}
	function migrate() {
		safe(() => {
			for (const r of Object.values(ROWS)) {
				if (store.get(PREFIX + r.key, void 0) !== void 0) continue;
				for (const name of r.legacy) {
					const raw = localStorage.getItem("ALAdditions:" + name);
					if (raw == null) continue;
					let v = raw;
					try {
						v = JSON.parse(raw);
					} catch (_) {}
					store.set(PREFIX + r.key, v);
					break;
				}
			}
		}, "settings migration");
	}
	var Settings = {
		get,
		set,
		register,
		migrate
	};
	var CREDITS = [
		{
			name: "Daiya",
			url: "https://github.com/Daiya404",
			note: "Combining, fixing and maintaining this script. Everything not credited below, such as the Keyframe Staff List button and the List Score & Progress Editor, is original work.",
			works: [["AL-Additions on GitHub", "https://github.com/Daiya404/AL-Additions"]]
		},
		{
			name: "Plennhar",
			url: "https://greasyfork.org/en/users/1323916-plennhar",
			note: "Browse Tag Rank Filter and Airing Progress Indicator.",
			works: [["AniList Browse: set default minimum tag percentage to 50", "https://greasyfork.org/en/scripts/559539-anilist-browse-set-default-minimum-tag-percentage-to-50"], ["AniList: color airing dots on anime lists orange if the user is behind on episodes", "https://greasyfork.org/en/scripts/563899-anilist-color-airing-dots-on-anime-lists-orange-if-the-user-is-behind-on-episodes"]]
		},
		{
			name: "Morimasa",
			url: "https://greasyfork.org/en/users/61126-morimasa",
			note: "Anime OP/ED songs.",
			works: [["Anisongs", "https://greasyfork.org/en/scripts/374785-anisongs"]]
		},
		{
			name: "Samu",
			url: "https://greasyfork.org/en/users/17840-samu",
			note: "Nyaa search link.",
			works: [["Find on Nyaa", "https://greasyfork.org/en/scripts/379776-find-on-nyaa"]]
		},
		{
			name: "trevor229",
			url: "https://greasyfork.org/en/users/158806-trevor229",
			note: "Banner Downloader.",
			works: [["AniList Banner Downloader", "https://greasyfork.org/en/scripts/370470-anilist-banner-downloader"]]
		},
		{
			name: "meatloaf1",
			url: "https://greasyfork.org/en/users/1630083-meatloaf1",
			note: "Short AniList URLs.",
			works: [["Remove AniList titles from URL", "https://greasyfork.org/en/scripts/589540-remove-anilist-titles-from-url"]]
		},
		{
			name: "MALSync",
			url: "https://github.com/MALSync",
			note: "Inspiration for the MyAnimeList sync, and for the episode/chapter and score embedding.",
			works: [["MALSync on GitHub", "https://github.com/MALSync/MALSync"]]
		},
		{
			name: "MatiX221",
			url: "https://github.com/MatiX221",
			note: "The API limit fix idea, and a refactor that modularises the code.",
			works: [["MatiX221/AL-Additions", "https://github.com/MatiX221/AL-Additions"]]
		},
		{
			name: "Claude & ChatGPT",
			note: "AI assistance throughout the consolidation and fixes."
		}
	];
	var creditLink = (url, text, cls = "") => `<a${cls ? ` class="${cls}"` : ""} href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;
	var creditsHtml = () => CREDITS.map((c) => `<div class="ala-credit"><b>${c.url ? creditLink(c.url, c.name) : esc(c.name)}</b> — ${esc(c.note)}${c.works ? `<ul>${c.works.map(([label, url]) => `<li>${creditLink(url, label)}</li>`).join("")}</ul>` : ""}</div>`).join("");
	var FAST_LOAD_URL = "https://greasyfork.org/en/scripts/598442-anilist-fast-load";
	function fastLoadInstalled() {
		try {
			const w = typeof _unsafeWindow !== "undefined" ? _unsafeWindow : window;
			return !!(w.__ANILIST_FAST_LOAD__ || w.__ANILIST_FAST_LOAD_V4__);
		} catch (_) {
			return false;
		}
	}
	var ICONS = {
		download: "<path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/><polyline points=\"7 10 12 15 17 10\"/><line x1=\"12\" y1=\"15\" x2=\"12\" y2=\"3\"/>",
		check: "<polyline points=\"20 6 9 17 4 12\"/>",
		resync: "<polyline points=\"1 4 1 10 7 10\"/><path d=\"M3.51 15a9 9 0 1 0 2.13-9.36L1 10\"/>",
		stop: "<rect x=\"6\" y=\"6\" width=\"12\" height=\"12\" rx=\"2\" fill=\"currentColor\"/>",
		list: "<line x1=\"8\" y1=\"6\" x2=\"21\" y2=\"6\"/><line x1=\"8\" y1=\"12\" x2=\"21\" y2=\"12\"/><line x1=\"8\" y1=\"18\" x2=\"21\" y2=\"18\"/><line x1=\"3\" y1=\"6\" x2=\"3.01\" y2=\"6\"/><line x1=\"3\" y1=\"12\" x2=\"3.01\" y2=\"12\"/><line x1=\"3\" y1=\"18\" x2=\"3.01\" y2=\"18\"/>",
		sliders: "<line x1=\"4\" y1=\"21\" x2=\"4\" y2=\"14\"/><line x1=\"4\" y1=\"10\" x2=\"4\" y2=\"3\"/><line x1=\"12\" y1=\"21\" x2=\"12\" y2=\"12\"/><line x1=\"12\" y1=\"8\" x2=\"12\" y2=\"3\"/><line x1=\"20\" y1=\"21\" x2=\"20\" y2=\"16\"/><line x1=\"20\" y1=\"12\" x2=\"20\" y2=\"3\"/><line x1=\"1\" y1=\"14\" x2=\"7\" y2=\"14\"/><line x1=\"9\" y1=\"8\" x2=\"15\" y2=\"8\"/><line x1=\"17\" y1=\"16\" x2=\"23\" y2=\"16\"/>",
		close: "<line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"/><line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"/>",
		external: "<path d=\"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6\"/><polyline points=\"15 3 21 3 21 9\"/><line x1=\"10\" y1=\"14\" x2=\"21\" y2=\"3\"/>"
	};
	var icon = (name, size = 18) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
	function addStyle(id, css) {
		Core.ready(() => {
			if (document.getElementById(id)) return;
			const s = document.createElement("style");
			s.id = id;
			s.textContent = css;
			(document.head || document.documentElement).appendChild(s);
		});
	}
	var mediaRoute = () => {
		const m = location.pathname.match(/^\/(anime|manga)\/(\d+)(?:\/|$)/);
		return m ? {
			kind: m[1],
			type: m[1].toUpperCase(),
			id: Number(m[2])
		} : null;
	};
	function findExactText(text) {
		const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
		for (let t; t = walker.nextNode();) {
			if (t.nodeValue?.trim() !== text || !t.parentElement) continue;
			let el = t.parentElement;
			while (el.parentElement && el.parentElement !== document.body && el.parentElement.textContent?.trim() === text) el = el.parentElement;
			return el;
		}
		return null;
	}
	var SECTIONS = [
		"Sync",
		"AniList Enhancements",
		"External Links & Downloads"
	];
	var CSS = `
  .ala-settings-nav-section{margin-top:26px}
  .ala-settings-nav-heading{color:rgb(var(--color-text-lighter));margin-bottom:12px}
  .ala-settings-nav-link{display:block;padding:9px 12px;border-radius:3px;color:rgb(var(--color-text));text-decoration:none;cursor:pointer}
  .ala-settings-nav-link:hover,.ala-settings-nav-link.is-active{background:rgb(var(--color-foreground))}
  #ala-settings-mobile-launcher{display:none}

  #ala-settings-backdrop{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:24px 16px;background:rgba(5,12,20,.72);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}
  #ala-settings-panel{box-sizing:border-box;display:flex;flex-direction:column;width:min(680px,100%);max-height:100%;border-radius:8px;background:rgb(var(--color-foreground));color:rgb(var(--color-text));font-size:14px;line-height:1.4;box-shadow:0 18px 60px rgba(0,0,0,.45);overflow:hidden;outline:none}
  #ala-settings-panel *{box-sizing:border-box}
  #ala-settings-panel :focus-visible{outline:2px solid rgb(var(--color-blue));outline-offset:2px}
  #ala-settings-panel h2,#ala-settings-panel h3{margin:0;font-family:inherit}

  .ala-sheet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 20px 10px}
  .ala-sheet-head h2{font-size:19px;font-weight:600;line-height:1.3}
  .ala-sheet-body{flex:1 1 auto;min-height:0;padding:0 20px 8px;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
  .ala-sheet-foot{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:12px 20px;border-top:1px solid rgba(var(--color-text-lighter),.14)}
  .ala-status{flex:1 1 160px;color:rgb(var(--color-text-lighter));font-size:12px}

  #ala-settings-panel .ala-section-title{margin:18px 2px 8px;color:rgb(var(--color-blue));font-size:13px;font-weight:600}
  .ala-section{border-radius:6px;background:rgb(var(--color-background));overflow:hidden}
  .ala-feature+.ala-feature{border-top:1px solid rgba(var(--color-text-lighter),.12)}
  .ala-row{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:56px;padding:12px 14px;cursor:pointer}
  .ala-text{display:flex;flex-direction:column;gap:3px;min-width:0}
  .ala-title{font-size:14px;color:rgb(var(--color-text))}
  .ala-help{color:rgb(var(--color-text-lighter));font-size:12px;line-height:1.4}
  .ala-options{margin:0 14px 12px 20px;padding-left:12px;border-left:2px solid rgba(var(--color-blue),.4);transition:opacity .15s}
  .ala-options .ala-row{min-height:48px;padding:8px 0;cursor:default}
  .ala-feature.is-off .ala-options{opacity:.45}

  #ala-settings-panel input[type=number],#ala-settings-panel input[type=text],#ala-settings-panel select{width:170px;height:36px;padding:0 10px;border:1px solid rgba(var(--color-text-lighter),.22);border-radius:4px;background:rgb(var(--color-foreground));color:rgb(var(--color-text));font:inherit;font-size:13px}
  #ala-settings-panel input:disabled,#ala-settings-panel select:disabled{cursor:not-allowed}

  .ala-switch{position:relative;flex:0 0 auto;width:44px;height:26px}
  .ala-switch input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}
  .ala-slider{position:absolute;inset:0;border-radius:999px;background:rgba(var(--color-text-lighter),.3);transition:background .15s;pointer-events:none}
  .ala-slider:before{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:transform .15s}
  .ala-switch input:checked+.ala-slider{background:rgb(var(--color-blue))}
  .ala-switch input:checked+.ala-slider:before{transform:translateX(18px)}
  .ala-switch input:focus-visible+.ala-slider{outline:2px solid rgb(var(--color-blue));outline-offset:2px}

  .ala-btn{display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:0 18px;border:1px solid rgba(var(--color-text-lighter),.25);border-radius:4px;background:transparent;color:rgb(var(--color-text));font:inherit;font-size:13px;cursor:pointer}
  .ala-btn--primary{border-color:transparent;background:rgb(var(--color-blue));color:#fff;font-weight:600}
  .ala-btn:hover{filter:brightness(1.1)}
  .ala-icon-btn{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:36px;height:36px;border:0;border-radius:50%;background:transparent;color:rgb(var(--color-text-lighter));cursor:pointer}
  .ala-icon-btn:hover{background:rgba(var(--color-text-lighter),.14);color:rgb(var(--color-text))}
  .ala-promo{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:18px 0 0;padding:12px 14px;border-radius:6px;background:rgb(var(--color-background))}
  .ala-promo .ala-btn{flex:0 0 auto;gap:6px;text-decoration:none}
  .ala-credits{margin:18px 2px 10px;color:rgb(var(--color-text-lighter));font-size:12px}
  .ala-credits summary{cursor:pointer;padding:4px 0}
  .ala-credit{margin-top:10px}
  .ala-credit ul{margin:3px 0 0;padding-left:18px;list-style:disc}
  .ala-credit a{color:rgb(var(--color-blue));text-decoration:none}
  .ala-credit a:hover{text-decoration:underline}

  @media (max-width:700px){
    .ala-settings-nav-section{display:none!important}
    #ala-settings-backdrop{align-items:flex-end;padding:0}
    #ala-settings-panel{width:100%;max-height:92vh;max-height:92dvh;border-radius:14px 14px 0 0}
    .ala-sheet-head{padding:16px 16px 8px}
    .ala-sheet-body{padding:0 16px 8px}
    .ala-sheet-foot{padding:12px 16px calc(12px + env(safe-area-inset-bottom))}
    .ala-sheet-foot .ala-btn{flex:1 1 40%;min-height:44px}
    .ala-status{flex-basis:100%;order:3}
    .ala-row{min-height:60px}
    .ala-options .ala-row{flex-direction:column;align-items:stretch;gap:8px}
    .ala-promo{flex-direction:column;align-items:stretch;gap:10px}
    .ala-promo .ala-btn{min-height:44px}
    #ala-settings-panel input[type=number],#ala-settings-panel input[type=text],#ala-settings-panel select{width:100%;height:44px;font-size:16px}
    #ala-settings-mobile-launcher{display:inline-flex;align-items:center;gap:8px;position:fixed;left:16px;bottom:calc(18px + env(safe-area-inset-bottom));z-index:99998;min-height:46px;padding:0 18px;border:1px solid rgba(255,255,255,.16);border-radius:999px;background:rgb(var(--color-blue));color:#fff;font:inherit;font-size:14px;font-weight:600;box-shadow:0 6px 20px rgba(0,0,0,.35);cursor:pointer}
    #ala-settings-mobile-launcher:active{transform:translateY(1px)}
  }
  @media (prefers-reduced-motion:reduce){.ala-slider,.ala-slider:before,.ala-options{transition:none}}`;
	var onSettingsPage = () => /^\/settings(\/|$)/.test(location.pathname);
	var rowText = (title, help) => `<span class="ala-text"><span class="ala-title">${title}</span><span class="ala-help">${help}</span></span>`;
	var optionHtml = (r) => `<label class="ala-row">${rowText(r.title, r.help)}${TYPES$1[r.type].html(r, Settings.get(r.key))}</label>`;
	var featureHtml = (f) => `<div class="ala-feature" data-feature="${f.id}">
    <label class="ala-row ala-row--main">${rowText(f.title, f.help)}${TYPES$1.toggle.html(f.toggle, Settings.get(f.toggle.key))}</label>
    ${f.options.length ? `<div class="ala-options">${f.options.map(optionHtml).join("")}</div>` : ""}
  </div>`;
	function sectionsHtml() {
		return [...new Set([...SECTIONS, ...features.map((f) => f.section)])].map((name) => {
			const items = features.filter((f) => f.section === name);
			return items.length ? `<h3 class="ala-section-title">${name}</h3><div class="ala-section">${items.map(featureHtml).join("")}</div>` : "";
		}).join("");
	}
	var prevOverflow = null;
	function closePanel() {
		const b = document.getElementById("ala-settings-backdrop");
		if (!b) return;
		if (b._onKey) document.removeEventListener("keydown", b._onKey);
		b.remove();
		document.documentElement.style.overflow = prevOverflow || "";
		prevOverflow = null;
	}
	function showPanel() {
		if (document.getElementById("ala-settings-backdrop")) return;
		const backdrop = document.createElement("div");
		backdrop.id = "ala-settings-backdrop";
		backdrop.innerHTML = `<div id="ala-settings-panel" role="dialog" aria-modal="true" aria-labelledby="ala-settings-title" tabindex="-1">
    <header class="ala-sheet-head">
      <div><h2 id="ala-settings-title">AL Additions</h2><div class="ala-help">Changes apply after the page reloads.</div></div>
      <button class="ala-icon-btn ala-close" type="button" aria-label="Close settings">${icon("close", 20)}</button>
    </header>
    <div class="ala-sheet-body">
      ${sectionsHtml()}
      ${fastLoadInstalled() ? "" : `<div class="ala-promo">${rowText("AniList Fast Load", "My other userscript: faster loading, lazy images, request caching and smoother scrolling on AniList. Opens its Greasy Fork page.")}<a class="ala-btn" href="${FAST_LOAD_URL}" target="_blank" rel="noopener noreferrer" aria-label="Get AniList Fast Load on Greasy Fork (opens in a new tab)">Get it ${icon("external", 16)}</a></div>`}
      <details class="ala-credits"><summary>Credits</summary>${creditsHtml()}</details>
    </div>
    <footer class="ala-sheet-foot">
      <button class="ala-btn ala-btn--primary ala-save" type="button">Save and reload</button>
      <button class="ala-btn ala-reset" type="button">Reset to defaults</button>
      <span class="ala-status" role="status"></span>
    </footer>
  </div>`;
		const panel = backdrop.firstElementChild;
		const status = panel.querySelector(".ala-status");
		const controls = () => panel.querySelectorAll("[data-key]");
		const syncFeature = (card) => {
			const toggle = card.querySelector(".ala-row--main [data-key]");
			const on = toggle ? toggle.checked : false;
			card.classList.toggle("is-off", !on);
			card.querySelectorAll(".ala-options [data-key]").forEach((el) => {
				el.disabled = !on;
			});
		};
		panel.querySelectorAll(".ala-feature").forEach(syncFeature);
		panel.addEventListener("change", (e) => {
			const target = e.target;
			const card = target?.closest(".ala-feature");
			if (card && target?.closest(".ala-row--main")) syncFeature(card);
		});
		panel.querySelector(".ala-save")?.addEventListener("click", () => {
			controls().forEach((el) => {
				const r = ROWS[el.dataset.key];
				if (r) Settings.set(r.key, TYPES$1[r.type].read(el));
			});
			status.textContent = "Saved. Reloading…";
			setTimeout(() => location.reload(), 350);
		});
		panel.querySelector(".ala-reset")?.addEventListener("click", () => {
			controls().forEach((el) => {
				const r = ROWS[el.dataset.key];
				if (r) TYPES$1[r.type].write(el, r.def);
			});
			panel.querySelectorAll(".ala-feature").forEach(syncFeature);
			status.textContent = "Defaults restored. Press Save to apply them.";
		});
		panel.querySelector(".ala-close")?.addEventListener("click", closePanel);
		backdrop.addEventListener("click", (e) => {
			if (e.target === backdrop) closePanel();
		});
		backdrop._onKey = (e) => {
			if (e.key === "Escape") closePanel();
		};
		document.addEventListener("keydown", backdrop._onKey);
		prevOverflow = document.documentElement.style.overflow;
		document.documentElement.style.overflow = "hidden";
		document.body.appendChild(backdrop);
		panel.focus();
	}
	function ensureLauncher() {
		if (document.getElementById("ala-settings-mobile-launcher")) return;
		const b = document.createElement("button");
		b.id = "ala-settings-mobile-launcher";
		b.type = "button";
		b.innerHTML = `${icon("sliders", 18)}<span>AL Additions</span>`;
		b.setAttribute("aria-label", "Open AL Additions settings");
		b.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			showPanel();
		});
		document.body.appendChild(b);
	}
	function installSidebar() {
		if (document.getElementById("ala-settings-nav-section")) return;
		if (!findExactText("Profile")) return;
		const dev = findExactText("Developer");
		if (!dev) return;
		let nav = dev.parentElement;
		while (nav && nav !== document.body && nav.children.length <= 1) nav = nav.parentElement;
		if (!nav || nav === document.body || !nav.parentElement) return;
		const section = document.createElement("div");
		section.id = "ala-settings-nav-section";
		section.className = "ala-settings-nav-section";
		section.innerHTML = "<div class=\"ala-settings-nav-heading\">AL Additions</div><a href=\"#\" class=\"ala-settings-nav-link\">Settings</a>";
		section.querySelector("a")?.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			e.currentTarget.classList.add("is-active");
			showPanel();
		});
		nav.parentElement.insertBefore(section, nav.nextSibling);
	}
	function initSettingsPage() {
		addStyle("ala-settings-style", CSS);
		const attempt = debounce(() => {
			if (!onSettingsPage()) return;
			installSidebar();
			ensureLauncher();
		}, 100);
		Core.ready(attempt);
		Core.onBodyMutation(() => {
			if (onSettingsPage() && !(document.getElementById("ala-settings-nav-section") && document.getElementById("ala-settings-mobile-launcher"))) attempt();
		});
		Core.onNavigate(() => {
			if (onSettingsPage()) return attempt();
			closePanel();
			document.getElementById("ala-settings-mobile-launcher")?.remove();
		});
	}
	var modules = [];
	var defineModule = (name, setting, init, hosts = ["anilist.co"], early = false) => {
		modules.push({
			name,
			setting,
			init,
			hosts,
			early
		});
	};
	var defineFeature = (meta, init) => {
		Settings.register(meta);
		defineModule(meta.id, meta.alwaysRun ? null : meta.key, init, meta.hosts, meta.early);
	};
	function startModules(early) {
		for (const m of modules) {
			if (m.early !== early || !m.hosts.includes(HOST)) continue;
			if (m.setting && !Settings.get(m.setting)) continue;
			try {
				Promise.resolve(m.init()).catch((e) => console.error("[AL-Additions]", m.name, e));
			} catch (e) {
				console.error("[AL-Additions]", m.name, e);
			}
		}
	}
	var RateLimiter = class {
		rate;
		min;
		max;
		burst;
		adaptive;
		jitter;
		persistKey;
		tokens;
		last;
		until;
		okStreak;
		queue;
		constructor({ rate, min = 1, max = rate, burst = 1, adaptive = false, jitter = false, persistKey = null }) {
			this.min = min;
			this.max = max;
			this.burst = burst;
			this.adaptive = adaptive;
			this.jitter = jitter;
			this.persistKey = persistKey;
			this.rate = Math.min(max, Math.max(min, rate));
			this.tokens = burst;
			this.last = Date.now();
			this.until = 0;
			this.okStreak = 0;
			this.queue = Promise.resolve();
		}
		get resumeAt() {
			const stored = this.persistKey ? Number(store.get(this.persistKey, 0)) || 0 : 0;
			const at = Math.max(this.until, stored);
			return at > Date.now() ? at : 0;
		}
		setRate(n) {
			this.rate = Math.min(this.max, Math.max(this.min, n));
		}
		acquire(check) {
			const run = this.queue.then(() => this._take(check));
			this.queue = run.catch(() => {});
			return run;
		}
		async _take(check) {
			for (;;) {
				check?.();
				const now = Date.now();
				const resume = this.resumeAt;
				if (resume) {
					this.tokens = 0;
					this.last = resume;
					await sleep(Math.min(1e3, resume - now));
					continue;
				}
				this.tokens = Math.min(this.burst, this.tokens + (now - this.last) / 6e4 * this.rate);
				this.last = now;
				if (this.tokens >= 1) {
					this.tokens -= 1;
					return;
				}
				await sleep(Math.max(15, (1 - this.tokens) / this.rate * 6e4));
			}
		}
		success() {
			if (this.adaptive && ++this.okStreak >= 25 && this.rate < this.max) {
				this.setRate(this.rate + Math.max(1, Math.round(this.rate * .1)));
				this.okStreak = 0;
			}
		}
		limit(ms) {
			this.okStreak = 0;
			this.tokens = 0;
			if (this.adaptive) this.setRate(Math.floor(this.rate / 2));
			if (!(ms > 0)) return;
			this.until = Math.max(this.until, Date.now() + ms * (this.jitter ? .9 + Math.random() * .3 : 1));
			if (this.persistKey) safe(() => store.set(this.persistKey, this.until), "persist cooldown");
		}
	};
	var normTitle = (s) => String(s || "").toLowerCase().replace(/[[\](){},.:!?_"'’“”]/g, " ").replace(/\b(the|a|an)\b/g, " ").replace(/\s+/g, " ").trim();
	var strictTitle = (s) => String(s || "").toLowerCase().normalize("NFKC").replace(/[’‘'`]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
	function titleScore(a, b) {
		const x = normTitle(a);
		const y = normTitle(b);
		if (!x || !y) return 0;
		if (x === y) return 100;
		if (x.includes(y) || y.includes(x)) return 85;
		const setA = new Set(x.split(" "));
		const setB = new Set(y.split(" "));
		let common = 0;
		for (const w of setA) if (setB.has(w)) common++;
		return Math.round(common / Math.max(setA.size, setB.size) * 70);
	}
	function bestMatch(list, title, getTitle, min = 45) {
		let best = null;
		let bestScore = -1;
		for (const item of list) {
			const s = titleScore(title, getTitle(item));
			if (s > bestScore) {
				best = item;
				bestScore = s;
			}
		}
		return best && bestScore >= min ? best : null;
	}
	var AniList = (() => {
		const API = "https://graphql.anilist.co";
		const limiter = new RateLimiter({
			rate: 25,
			max: 90,
			burst: 1,
			persistKey: "ala_anilist_api_resume_at"
		});
		const header = (res, name) => {
			try {
				return res?.headers?.get?.(name) ?? null;
			} catch (_) {
				return null;
			}
		};
		function resetDelay(res) {
			const retry = Number(header(res, "Retry-After"));
			if (retry > 0) return Math.min(retry * 1e3, 12e4);
			const reset = Number(header(res, "X-RateLimit-Reset"));
			if (reset > 0) return Math.min((reset > 0xe8d4a51000 ? reset : reset * 1e3) - Date.now(), 12e4);
			return 0;
		}
		function handle(res) {
			const advertised = Number(header(res, "X-RateLimit-Limit"));
			if (advertised > 0) limiter.setRate(Math.floor(advertised * .85));
			if (res?.status === 429) return limiter.limit(resetDelay(res) || 6e4);
			const remaining = header(res, "X-RateLimit-Remaining");
			if (remaining != null && Number(remaining) <= 1) limiter.limit(resetDelay(res));
		}
		async function query(q, variables = {}, retries = 3) {
			const token = store.get("al_token", null);
			const backoff = () => sleep(1500 * (4 - retries));
			let res;
			try {
				await limiter.acquire();
				res = await fetch(API, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Accept: "application/json",
						...token ? { Authorization: `Bearer ${token}` } : {}
					},
					body: JSON.stringify({
						query: q,
						variables
					})
				});
			} catch (e) {
				if (retries > 0) {
					await backoff();
					return query(q, variables, retries - 1);
				}
				throw new Error(`AniList network error: ${e?.message || e}`);
			}
			handle(res);
			if ((res.status === 429 || res.status >= 500) && retries > 0) {
				if (res.status >= 500) await backoff();
				return query(q, variables, retries - 1);
			}
			let json = null;
			try {
				json = await res.json();
			} catch (_) {}
			const message = json?.errors?.length ? json.errors.map((e) => e.message).join("; ") : "";
			if (res.status === 401 || token && /invalid token|unauthenticated|unauthorized/i.test(message)) throw authError("AniList", "AniList rejected the access token — reconnect AniList.");
			if (message) throw new Error(message);
			if (!res.ok || !json) throw new Error(`AniList API HTTP ${res.status}`);
			return json.data;
		}
		async function viewer() {
			const name = store.get("al_username", null);
			const fmt = store.get("al_score_format", null);
			const id = Number(store.get("al_user_id", 0));
			if (name && fmt && id) return {
				id,
				name,
				scoreFormat: fmt
			};
			if (!store.get("al_token", null)) return null;
			const d = await query("query { Viewer { id name mediaListOptions { scoreFormat } } }", {});
			store.set("al_user_id", d.Viewer.id);
			store.set("al_username", d.Viewer.name);
			store.set("al_score_format", d.Viewer.mediaListOptions.scoreFormat);
			return {
				id: d.Viewer.id,
				name: d.Viewer.name,
				scoreFormat: d.Viewer.mediaListOptions.scoreFormat
			};
		}
		const clearViewer = () => {
			store.del("al_username");
			store.del("al_user_id");
			store.del("al_score_format");
		};
		const resumeAt = () => limiter.resumeAt;
		return {
			query,
			viewer,
			clearViewer,
			resumeAt
		};
	})();
	var MediaData = (() => {
		const fetchMedia = memo(async (id, type) => {
			return (await tryOr(() => AniList.query(`query($id:Int,$type:MediaType){ Media(id:$id,type:$type){
            id idMal format title { userPreferred english romaji }
            episodes chapters status nextAiringEpisode { episode }
            mediaListEntry { score progress status completedAt { year month day } }
          } }`, {
				id,
				type
			})))?.Media || null;
		}, {
			keepNull: false,
			ttl: 6e4
		});
		const get = (id, type) => fetchMedia(`${type}:${id}`, Number(id), type);
		async function save(id, type, c) {
			const entry = (await AniList.query(`mutation($mediaId:Int!,$score:Float,$progress:Int,$status:MediaListStatus,$completedAt:FuzzyDateInput){
        SaveMediaListEntry(mediaId:$mediaId,score:$score,progress:$progress,status:$status,completedAt:$completedAt){
          score progress status completedAt { year month day }
        } }`, {
				mediaId: Number(id),
				score: c.score,
				progress: c.progress,
				status: c.status,
				completedAt: c.completedAt
			}))?.SaveMediaListEntry || null;
			const media = await get(id, type);
			if (media && entry) media.mediaListEntry = entry;
			return entry;
		}
		return {
			get,
			save
		};
	})();
	var AL_AUTH_URL = "https://anilist.co/api/v2/oauth/authorize";
	var AL_CLIENT_ID = "50247";
	var MAL_AUTH_URL = "https://myanimelist.net/v1/oauth2/authorize";
	var MAL_TOKEN_URL = "https://myanimelist.net/v1/oauth2/token";
	var MAL_API = "https://api.myanimelist.net/v2";
	var MAL_REDIRECT = "https://myanimelist.net/";
	var MAL_CLIENT_ID = "f8197fe8cb24188073de4c0227307edf";
	var hooks = {};
	function randomString(len) {
		const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
		const arr = new Uint8Array(len);
		crypto.getRandomValues(arr);
		let out = "";
		for (let i = 0; i < len; i++) out += chars[arr[i] % 62];
		return out;
	}
	var logLines = [];
	var lastNotice = "";
	function log(msg, level = "info") {
		const time = new Date().toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit"
		});
		const marker = level === "error" ? "ERROR" : level === "warn" ? "WARN " : level === "success" ? "OK   " : "INFO ";
		logLines.unshift(`${time}  ${marker} ${String(msg)}`);
		logLines = logLines.slice(0, 60);
		console[level === "error" ? "error" : level === "warn" ? "warn" : "log"]("[AL→MAL Sync]", msg);
		lastNotice = String(msg);
		const box = document.getElementById("almal-log");
		const hint = document.getElementById("almal-hint");
		if (box) box.textContent = logLines.join("\n");
		if (hint) hint.textContent = lastNotice;
	}
	function toast(msg, isError, closeTab) {
		log(msg);
		Core.ready(() => {
			let t = document.getElementById("almal-toast");
			if (!t) {
				t = document.createElement("div");
				t.id = "almal-toast";
				t.style.cssText = "position:fixed;top:16px;left:50%;transform:translateX(-50%);padding:10px 18px;border-radius:3px;color:#fff;font-size:1.2rem;z-index:999999;box-shadow:0 4px 16px rgba(0,0,0,.45)";
				document.body.appendChild(t);
			}
			t.textContent = msg;
			t.style.background = isError ? "#b23b3b" : "#2f8f5b";
			t.style.display = "block";
			clearTimeout(t._hide);
			t._hide = setTimeout(() => {
				if (t) t.style.display = "none";
			}, 6e3);
			if (closeTab) setTimeout(() => safe(() => window.close()), 1800);
		});
	}
	var clearMalAuth = () => {
		[
			"mal_token",
			"mal_refresh_token",
			"mal_expires_at"
		].forEach((k) => store.del(k));
	};
	var clearAniListAuth = () => {
		store.del("al_token");
		AniList.clearViewer();
	};
	async function malTokenRequest(params) {
		const body = new URLSearchParams({
			client_id: MAL_CLIENT_ID,
			...params
		});
		const res = await gm.request(MAL_TOKEN_URL, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			data: body.toString()
		});
		let json = {};
		try {
			json = JSON.parse(res.responseText);
		} catch (_) {}
		if (!json.access_token) {
			if (params.grant_type === "refresh_token" && [
				400,
				401,
				403
			].includes(res.status)) {
				clearMalAuth();
				throw authError("MAL", "MAL session expired — reconnect MAL.");
			}
			throw new Error(json.hint || json.message || json.error || res.responseText || `HTTP ${res.status}`);
		}
		store.set("mal_token", json.access_token);
		if (json.refresh_token) store.set("mal_refresh_token", json.refresh_token);
		store.set("mal_expires_at", Date.now() + (Number(json.expires_in) || 3600) * 1e3);
		return json.access_token;
	}
	async function exchangeMalCode(code) {
		const token = await malTokenRequest({
			code,
			code_verifier: store.get("mal_code_verifier", ""),
			grant_type: "authorization_code",
			redirect_uri: MAL_REDIRECT
		});
		store.del("mal_code_verifier");
		return token;
	}
	var malRefresh = null;
	async function malEnsureToken() {
		if (Date.now() < store.get("mal_expires_at", 0) - 6e4) return store.get("mal_token");
		if (!malRefresh) malRefresh = (async () => {
			const refresh = store.get("mal_refresh_token", null);
			if (!refresh) throw authError("MAL", "No MAL refresh token stored — reconnect MAL.");
			return malTokenRequest({
				grant_type: "refresh_token",
				refresh_token: refresh
			});
		})().finally(() => {
			malRefresh = null;
		});
		return malRefresh;
	}
	function alConnect() {
		openTab(`${AL_AUTH_URL}?client_id=${encodeURIComponent(AL_CLIENT_ID)}&response_type=token`);
		log("Opened AniList authorization in a new tab. Finish connecting there, then return to your list.");
	}
	function malConnect() {
		const verifier = randomString(96);
		store.set("mal_code_verifier", verifier);
		openTab(`${MAL_AUTH_URL}?response_type=code&client_id=${encodeURIComponent(MAL_CLIENT_ID)}&code_challenge=${encodeURIComponent(verifier)}&code_challenge_method=plain&redirect_uri=${encodeURIComponent(MAL_REDIRECT)}`);
		log("Opened MAL authorization in a new tab. Finish connecting there, then return to your list.");
	}
	function saveAniListToken(token) {
		store.set("al_token", token);
		AniList.clearViewer();
	}
	function captureCredentials() {
		const HOST = location.hostname;
		if (HOST === "anilist.co" && location.hash) {
			const params = new URLSearchParams(location.hash.substring(1));
			const token = params.get("access_token");
			const err = params.get("error");
			if (token || err) {
				history.replaceState(null, "", location.pathname + location.search);
				if (token) {
					saveAniListToken(token);
					toast("AniList connected! You can close this tab.", false, true);
				} else toast(`AniList auth failed: ${err}. Check the app's redirect URL matches https://anilist.co/ exactly.`, true);
			}
		}
		if (HOST === "myanimelist.net") {
			const code = new URLSearchParams(location.search).get("code");
			if (!code || !store.get("mal_code_verifier")) return;
			exchangeMalCode(code).then(() => {
				const url = new URL(location.href);
				url.searchParams.delete("code");
				url.searchParams.delete("state");
				history.replaceState(null, "", url.pathname + url.search);
				toast("MAL connected! You can close this tab.", false, true);
			}).catch((e) => toast("MAL connection failed: " + e.message, true));
		}
	}
	var malLimiter = new RateLimiter({
		rate: 60,
		min: 12,
		max: 180,
		burst: 4,
		adaptive: true,
		jitter: true,
		persistKey: "ala_mal_api_resume_at"
	});
	var BREAKER_THRESHOLD = 8;
	var BREAKER_COOLDOWN_MS = 9e4;
	var breaker = (() => {
		let fails = 0;
		let until = 0;
		let trips = 0;
		return {
			ok() {
				fails = 0;
			},
			fail() {
				if (++fails >= BREAKER_THRESHOLD && Date.now() >= until) {
					fails = 0;
					trips++;
					until = Date.now() + BREAKER_COOLDOWN_MS;
					log(`⚠ ${BREAKER_THRESHOLD} consecutive MAL failures — pausing writes for ${BREAKER_COOLDOWN_MS / 1e3}s.`);
				}
			},
			async wait(checkCancel) {
				while (Date.now() < until) {
					checkCancel?.();
					await sleep(Math.min(1e3, until - Date.now()));
				}
			},
			get trips() {
				return trips;
			},
			reset() {
				fails = 0;
				until = 0;
				trips = 0;
			}
		};
	})();
	var MalError = class extends Error {
		status;
		html;
		constructor(what, res) {
			super(`${what} ${res.status}: ${String(res.responseText || "request failed").slice(0, 200)}`);
			this.status = res.status;
			this.html = /^\s*</.test(res.responseText || "");
		}
	};
	function parseRetryAfterMs(headers, fallback) {
		const m = String(headers || "").match(/retry-after:\s*(\S+)/i);
		if (!m) return fallback;
		const secs = Number(m[1]);
		if (Number.isFinite(secs)) return Math.max(1e3, Math.min(secs * 1e3, 12e4));
		const date = Date.parse(m[1]);
		return Number.isFinite(date) ? Math.max(1e3, Math.min(date - Date.now(), 12e4)) : fallback;
	}
	var looksLimited = (res) => res.status === 429 || res.status === 403 && /^\s*</.test(res.responseText || "");
	var backoff = (attempt) => Math.min(3e4, 1e3 * 2 ** attempt) * (.8 + Math.random() * .4);
	async function malRequest({ method = "GET", url, data, headers = {}, timeout = 3e4 }, checkCancel) {
		await malLimiter.acquire(checkCancel ?? hooks.checkCancel);
		const token = await malEnsureToken();
		const res = await gm.request(url, {
			method,
			data,
			timeout,
			headers: {
				Authorization: `Bearer ${token}`,
				...headers
			}
		});
		if (looksLimited(res)) malLimiter.limit(parseRetryAfterMs(res.responseHeaders, res.status === 429 ? 5e3 : 6e4));
		else if (res.status >= 500) malLimiter.limit(2e3);
		else if (res.status >= 200 && res.status < 300) malLimiter.success();
		return res;
	}
	async function malCall(opts, retries = 4, checkCancel) {
		const check = checkCancel ?? hooks.checkCancel;
		let refreshed = false;
		for (let attempt = 0;; attempt++) {
			check?.();
			let res;
			try {
				res = await malRequest(opts, check);
			} catch (e) {
				if (e.auth || e.cancelled || attempt >= retries) throw e;
				await sleep(backoff(attempt));
				continue;
			}
			if (res.status === 401) {
				if (refreshed) {
					clearMalAuth();
					throw authError("MAL", "MAL rejected the access token — reconnect MAL.");
				}
				refreshed = true;
				store.set("mal_expires_at", 0);
				continue;
			}
			if (!looksLimited(res) && res.status < 500) return res;
			if (attempt >= retries) return res;
		}
	}
	var parseJson = (res, what) => {
		try {
			return JSON.parse(res.responseText || "{}");
		} catch (_) {
			throw new Error(`MAL returned invalid JSON for ${what}.`);
		}
	};
	async function malUpdateEntry(type, malId, patch) {
		const res = await malCall({
			method: "PUT",
			url: `${MAL_API}/${type === "ANIME" ? "anime" : "manga"}/${malId}/my_list_status`,
			data: new URLSearchParams(patch).toString(),
			headers: { "Content-Type": "application/x-www-form-urlencoded" }
		});
		if (res.status < 200 || res.status >= 300) throw new MalError("MAL", res);
		return res;
	}
	async function malWhoAmI() {
		const res = await malCall({ url: `${MAL_API}/users/@me` });
		if (res.status < 200 || res.status >= 300) throw new MalError("MAL profile", res);
		return parseJson(res, "the profile");
	}
	async function malFetchList(type) {
		const MAL_LIST_PAGE_SIZE = 1e3;
		const MAL_LIST_MAX = 1e5;
		const anime = type === "ANIME";
		const fields = anime ? "num_episodes,list_status{status,score,num_episodes_watched,is_rewatching,num_times_rewatched,start_date,finish_date,comments}" : "num_chapters,num_volumes,list_status{status,score,num_chapters_read,num_volumes_read,is_rereading,num_times_reread,start_date,finish_date,comments}";
		const entries = {};
		let total = 0;
		for (let offset = 0; offset <= MAL_LIST_MAX;) {
			const res = await malCall({
				url: `${MAL_API}/users/@me/${anime ? "animelist" : "mangalist"}?fields=${encodeURIComponent(fields)}&limit=${MAL_LIST_PAGE_SIZE}&offset=${offset}&nsfw=true`,
				timeout: 6e4
			}, 6);
			if (res.status < 200 || res.status >= 300) throw new MalError("MAL list", res);
			const json = parseJson(res, "the list");
			const nodes = Array.isArray(json.data) ? json.data : [];
			for (const row of nodes) {
				const id = Number(row?.node?.id);
				if (!(id > 0) || !row.list_status) continue;
				const node = row.node;
				if (!entries[id]) total++;
				entries[id] = {
					...row.list_status,
					__malTitle: node.title || "",
					__total: Number(anime ? node.num_episodes : node.num_chapters) || 0,
					__totalVolumes: anime ? 0 : Number(node.num_volumes) || 0
				};
			}
			if (total > MAL_LIST_MAX) throw new Error(`MAL list exceeded the ${MAL_LIST_MAX.toLocaleString()}-entry safety limit.`);
			if (!nodes.length || !json.paging?.next) break;
			offset += nodes.length;
		}
		return entries;
	}
	var searchCandidates = memo(async (type, q) => {
		const params = new URLSearchParams({
			q: q.slice(0, 64),
			limit: "10",
			nsfw: "true",
			fields: "alternative_titles,start_date"
		});
		const res = await malCall({ url: `${MAL_API}/${type === "ANIME" ? "anime" : "manga"}?${params}` }, 2);
		if (res.status === 400) return [];
		if (res.status < 200 || res.status >= 300) throw new MalError("MAL search", res);
		const json = parseJson(res, "a search");
		return (Array.isArray(json.data) ? json.data : []).map((r) => {
			const n = r?.node || {};
			const alt = n.alternative_titles || {};
			return {
				id: Number(n.id) || 0,
				titles: [
					n.title,
					alt.en,
					alt.ja,
					...alt.synonyms || []
				].map(strictTitle).filter(Boolean),
				year: Number(String(n.start_date || "").slice(0, 4)) || 0
			};
		});
	});
	async function searchMalId(type, entry) {
		for (const q of entry.queryTitles.filter((s) => s.length >= 3).slice(0, 2)) {
			const ok = (await searchCandidates(`${type}:${q}`, type, q)).filter((c) => c.id && c.titles.some((t) => entry.titles.includes(t)) && (!c.year || !entry.startYear || Math.abs(c.year - entry.startYear) <= 1));
			if (ok.length === 1) return ok[0].id;
			if (ok.length > 1) {
				const exact = ok.filter((c) => c.year && c.year === entry.startYear);
				return exact.length === 1 ? exact[0].id : 0;
			}
		}
		return 0;
	}
	defineFeature({
		id: "tagPercent",
		key: "tagFilterEnabled",
		section: "AniList Enhancements",
		early: true,
		legacy: ["tagFilterEnabled", "browseTagRankFilterEnabled"],
		title: "Browse Tag Rank Filter",
		help: "Automatically apply a minimum tag-rank percentage when you search with a tag or genre.",
		options: [{
			key: "tagPercentage",
			type: "number",
			def: 50,
			min: 1,
			max: 100,
			legacy: ["tagPercentage", "minimumTagRankPercentage"],
			title: "Minimum Tag Rank",
			help: "The minimum percentage a selected tag must meet. For example, 50 means the tag must be present on at least half of the relevant titles."
		}]
	}, () => {
		const PARAM = "minimumTagRank";
		const VALUE = String(Settings.get("tagPercentage"));
		const isTarget = () => /^\/search\/(anime|manga)\/?$/.test(location.pathname);
		const hasSelection = (url) => [...url.searchParams].some(([k, v]) => k !== PARAM && /genre|tag/i.test(k) && v.trim() !== "");
		let fixing = false;
		function apply(initial) {
			if (fixing || !isTarget()) return;
			const u = new URL(location.href);
			if (!hasSelection(u) || u.searchParams.get(PARAM) === VALUE) return;
			u.searchParams.set(PARAM, VALUE);
			fixing = true;
			try {
				if (initial) location.replace(u.toString());
				else {
					history.replaceState(history.state, document.title, u.toString());
					window.dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
				}
			} finally {
				fixing = false;
			}
		}
		apply(true);
		Core.onNavigate(() => apply(false));
	});
	defineFeature({
		id: "removeTitle",
		key: "linkShortenerEnabled",
		section: "AniList Enhancements",
		legacy: [
			"linkShortenerEnabled",
			"shortAniListUrlsEnabled",
			"shortAniListUrls"
		],
		title: "Short AniList URLs",
		help: "Remove the title slug from AniList anime, manga, staff, and character URLs."
	}, () => {
		const SLUG_HREF = /^(?:https:\/\/anilist\.co)?\/(?:manga|anime|staff|character)\/\d{1,10}\/./;
		const strip = (s) => s.replace(/(\/\d{1,10}\/)[^?#]*/, "$1");
		function fixLocation() {
			if (!/anilist\.co\/(manga|anime|staff|character)\//.test(location.href) || !/\/\d{1,10}\/./.test(location.href)) return;
			const cur = location.pathname + location.search + location.hash;
			const next = strip(cur.replace(/^https:\/\/anilist\.co/, ""));
			if (cur !== next) Core.silently(() => history.replaceState(history.state, "", next));
		}
		function fixLinks(nodes) {
			for (const node of Array.from(nodes)) {
				if (node.nodeType !== 1) continue;
				const el = node;
				const links = el.matches("a[href]") ? [el] : el.querySelectorAll("a[href]");
				for (const a of links) {
					const href = a.getAttribute("href");
					if (href && SLUG_HREF.test(href)) a.setAttribute("href", strip(href));
				}
			}
		}
		fixLocation();
		Core.onNavigate(fixLocation);
		Core.onBodyMutation((muts) => {
			for (const m of muts) if (m.addedNodes.length) fixLinks(m.addedNodes);
		});
		Core.ready(() => fixLinks([document.body]));
	});
	defineFeature({
		id: "banner",
		key: "bannerEnabled",
		section: "External Links & Downloads",
		legacy: [
			"bannerEnabled",
			"bannerDownloadEnabled",
			"bannerDownloaderEnabled"
		],
		title: "Anime/Manga Banner Downloader",
		help: "Add a button for downloading the AniList banner image.",
		options: [{
			key: "bannerProfiles",
			type: "toggle",
			def: false,
			title: "User Profile Banners",
			help: "Also show the download button on user profile banners (it is always shown on anime and manga pages)."
		}]
	}, () => {
		addStyle("ala-banner-style", `
      .banner{position:relative}
      .ala-banner-dl{position:absolute;right:12px;bottom:12px;z-index:5;display:inline-flex;align-items:center;justify-content:center;height:34px;min-width:34px;padding:0 8px;border:0;border-radius:17px;background:transparent;color:rgba(255,255,255,.8);font-family:inherit;font-size:12px;font-weight:600;line-height:1;cursor:pointer;overflow:hidden;-webkit-tap-highlight-color:transparent;transition:background .15s,color .15s}
      .ala-banner-dl[hidden]{display:none}
      .ala-banner-ico{display:inline-flex;filter:drop-shadow(0 1px 3px rgba(0,0,0,.7))}
      .ala-banner-lbl{max-width:0;overflow:hidden;white-space:nowrap;transition:max-width .2s ease,margin-left .2s ease}
      .ala-banner-dl:hover,.ala-banner-dl:focus-visible{background:rgb(var(--color-blue));color:#fff}
      .ala-banner-dl:hover .ala-banner-ico,.ala-banner-dl:focus-visible .ala-banner-ico,.ala-banner-dl.is-done .ala-banner-ico{filter:none}
      .ala-banner-dl:focus-visible{outline:2px solid #fff;outline-offset:2px}
      .ala-banner-dl.is-done,.ala-banner-dl.is-done:hover{background:rgb(var(--color-green));color:#fff}
      .ala-banner-dl.is-done .ala-banner-lbl{max-width:130px;margin-left:7px}
      @media (hover:hover){.ala-banner-dl:hover .ala-banner-lbl,.ala-banner-dl:focus-visible .ala-banner-lbl{max-width:130px;margin-left:7px}}
      @media (pointer:coarse){.ala-banner-dl{right:8px;bottom:8px;height:40px;min-width:40px;border-radius:20px}}
      @media (prefers-reduced-motion:reduce){.ala-banner-lbl{transition:none}}`);
		const bannerUrl = (banner) => (banner.style.backgroundImage || getComputedStyle(banner).backgroundImage).match(/url\((['"]?)(.*?)\1\)/)?.[2] || null;
		const bannerAllowed = () => !!mediaRoute() || /^\/user\//.test(location.pathname) && Settings.get("bannerProfiles");
		function download(onSaved) {
			const banner = document.querySelector(".banner");
			const url = banner && bannerAllowed() && bannerUrl(banner);
			if (!url) return;
			const ext = (url.match(/\.(jpg|jpeg|png|webp)(?:\?|$)/i)?.[1] || "jpg").toLowerCase();
			const name = `anilist-banner-${mediaRoute()?.id || location.pathname.split("/")[2] || "anilist"}.${ext}`;
			const fallback = () => {
				openTab(url);
				onSaved?.();
			};
			if (typeof _GM_download === "function") try {
				_GM_download({
					url,
					name,
					saveAs: false,
					onload: () => onSaved?.(),
					onerror: fallback
				});
				return;
			} catch (_) {}
			fallback();
		}
		function createButton() {
			const btn = document.createElement("button");
			btn.type = "button";
			btn.className = "ala-banner-dl";
			btn.title = "Download banner image";
			btn.setAttribute("aria-label", "Download banner image");
			btn.innerHTML = `<span class="ala-banner-ico">${icon("download", 18)}</span><span class="ala-banner-lbl">Download banner</span>`;
			const ico = btn.firstElementChild;
			const lbl = btn.lastElementChild;
			btn.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				download(() => {
					btn.classList.add("is-done");
					ico.innerHTML = icon("check", 18);
					lbl.textContent = "Saved";
					setTimeout(() => {
						btn.classList.remove("is-done");
						ico.innerHTML = icon("download", 18);
						lbl.textContent = "Download banner";
					}, 1600);
				});
			});
			return btn;
		}
		function scan() {
			const banner = document.querySelector(".banner");
			if (!banner) return;
			let btn = banner.querySelector(".ala-banner-dl");
			const show = bannerAllowed() && !!bannerUrl(banner);
			if (!btn && !show) return;
			if (!btn) {
				btn = createButton();
				banner.appendChild(btn);
			}
			btn.hidden = !show;
		}
		const scanSoon = debounce(scan, 150);
		Core.ready(scan);
		Core.onNavigate(() => setTimeout(scan, 300));
		Core.onBodyMutation(scanSoon);
	});
	defineFeature({
		id: "nyaa",
		key: "nyaaEnabled",
		section: "External Links & Downloads",
		legacy: [
			"nyaaEnabled",
			"malNyaaLinksEnabled",
			"malNyaaEnabled"
		],
		title: "MyAnimeList & Nyaa Links",
		help: "Show a MyAnimeList link, with Nyaa search available by Ctrl/Cmd-click on desktop or long-press on mobile.",
		options: [{
			key: "nyaaProviders",
			type: "list",
			def: ["SubsPlease", "ToonsHub"],
			legacy: ["nyaaProviders", "nyaaSearchGroups"],
			title: "Nyaa Search Providers",
			help: "Comma-separated provider names to include in Nyaa searches. Defaults to SubsPlease and ToonsHub."
		}]
	}, () => {
		const ID = "ala-find-on-nyaa";
		const TITLE_SEL = ".page-content .header .content > h1";
		const ICON = icon("external", 17);
		addStyle("ala-nyaa-style", `#${ID}{margin-left:10px;display:inline-flex;align-items:center;vertical-align:middle;color:rgb(var(--color-text-lighter));opacity:.8;transition:opacity .15s,transform .15s}#${ID}:hover{opacity:1;color:rgb(var(--color-blue));transform:scale(1.1)}`);
		const nyaaUrl = (title) => {
			const q = title.trim().replace(/[^a-zA-Z0-9]+/g, "+").replace(/^\++|\++$/g, "");
			const frag = Settings.get("nyaaProviders").map(encodeURIComponent).join("&text=");
			return `https://nyaa.si/?f=0&c=1_2&s=seeders&o=desc&q=${encodeURI(q)}#:~:text=${frag}`;
		};
		async function openMal(route) {
			const media = await MediaData.get(route.id, route.type);
			if (!media?.idMal) return false;
			openTab(`https://myanimelist.net/${route.kind}/${media.idMal}`);
			return true;
		}
		function attach(h1, route) {
			const a = document.createElement("a");
			a.id = ID;
			a.href = "#";
			a.title = "Open on MAL (Ctrl/Cmd+click or long-press: search Nyaa)";
			a.setAttribute("aria-label", "Open on MAL; long-press to search Nyaa");
			a.innerHTML = ICON;
			const titleText = () => [...h1.childNodes].filter((n) => n !== a).map((n) => n.textContent).join("");
			const searchNyaa = () => openTab(nyaaUrl(titleText()));
			MediaData.get(route.id, route.type);
			let timer = null;
			let longPressed = false;
			let sx = 0;
			let sy = 0;
			const cancel = () => {
				if (timer) clearTimeout(timer);
				timer = null;
			};
			a.addEventListener("touchstart", (e) => {
				if (e.touches.length !== 1) return;
				sx = e.touches[0].clientX;
				sy = e.touches[0].clientY;
				longPressed = false;
				cancel();
				timer = setTimeout(() => {
					timer = null;
					longPressed = true;
					searchNyaa();
					setTimeout(() => {
						longPressed = false;
					}, 800);
				}, 550);
			}, { passive: true });
			a.addEventListener("touchmove", (e) => {
				if (timer === null || !e.touches.length) return;
				if (Math.abs(e.touches[0].clientX - sx) > 12 || Math.abs(e.touches[0].clientY - sy) > 12) cancel();
			}, { passive: true });
			a.addEventListener("touchend", cancel, { passive: true });
			a.addEventListener("touchcancel", cancel, { passive: true });
			a.addEventListener("contextmenu", (e) => {
				if (longPressed) e.preventDefault();
			});
			a.addEventListener("click", async (e) => {
				e.preventDefault();
				if (longPressed) {
					longPressed = false;
					e.stopPropagation();
					return;
				}
				if (e.ctrlKey || e.metaKey || !await openMal(route)) searchNyaa();
			});
			h1.appendChild(a);
		}
		let token = 0;
		let placedKey = null;
		let placing = false;
		async function place() {
			const route = mediaRoute();
			const key = route && `${route.type}:${route.id}`;
			if (key && key === placedKey && document.getElementById(ID)) return;
			document.getElementById(ID)?.remove();
			placedKey = null;
			if (!route) return;
			const mine = ++token;
			placing = true;
			try {
				const h1 = await Core.waitForSelector(TITLE_SEL, 8e3);
				if (h1 && mine === token && mediaRoute()?.id === route.id && !document.getElementById(ID)) {
					attach(h1, route);
					placedKey = key;
				}
			} finally {
				if (mine === token) placing = false;
			}
		}
		const repair = debounce(() => {
			if (placedKey && !placing && !document.getElementById(ID)) place();
		}, 400);
		place();
		Core.onNavigate(place);
		Core.onBodyMutation(repair);
	});
	defineFeature({
		id: "keyframe",
		key: "keyframeEnabled",
		section: "External Links & Downloads",
		legacy: ["keyframeEnabled"],
		title: "Keyframe Staff List Links",
		help: "Add a button on staff and studio pages that opens the same person or studio on Keyframe Staff List."
	}, () => {
		const ID = "ala-keyframe-link";
		const BASE = "https://keyframe-staff-list.com";
		const LABEL = "Keyframe Staff List";
		const SLOT = ".filters";
		const PATHS = {
			staff: "person",
			studio: "studio"
		};
		const route = () => {
			const m = location.pathname.match(/^\/(staff|studio)\/(\d+)(?:\/|$)/);
			return m ? {
				kind: m[1],
				id: m[2]
			} : null;
		};
		addStyle("ala-keyframe-style", `
      #${ID}{flex:0 0 auto;margin-right:12px;text-decoration:none;color:inherit;cursor:pointer;white-space:nowrap}
      #${ID}.ala-kf-plain{display:inline-flex;align-items:center;gap:7px;min-height:30px;padding:0 12px;border-radius:4px;background:rgb(var(--color-foreground));font-size:1.2rem;font-weight:500;line-height:1;transition:background .15s,color .15s}
      #${ID}.ala-kf-plain:hover{background:rgb(var(--color-blue));color:#fff}
      #${ID} .icon{flex:0 0 auto}`);
		const copyScope = (from, to) => {
			for (const at of Array.from(from.attributes)) if (at.name.startsWith("data-v-")) to.setAttribute(at.name, at.value);
		};
		function skin(a) {
			if (!a || a.dataset.kfSkin) return;
			const ref = a.parentElement?.querySelector(".mini-select");
			if (!ref) return;
			a.classList.remove("ala-kf-plain");
			a.classList.add("mini-select");
			copyScope(ref, a);
			const refIcon = ref.querySelector("svg");
			const refLabel = ref.querySelector(".label");
			const iconEl = a.querySelector("svg");
			const labelEl = a.querySelector("span");
			if (iconEl) {
				iconEl.classList.add("icon");
				if (refIcon) copyScope(refIcon, iconEl);
			}
			if (labelEl) {
				labelEl.classList.add("label");
				if (refLabel) copyScope(refLabel, labelEl);
			}
			a.dataset.kfSkin = "1";
		}
		function build(r) {
			const a = document.createElement("a");
			a.id = ID;
			a.className = "ala-kf-plain";
			a.href = `${BASE}/${PATHS[r.kind]}/${r.id}`;
			a.target = "_blank";
			a.rel = "noopener noreferrer";
			a.title = `Open on ${LABEL}`;
			a.setAttribute("aria-label", `Open on ${LABEL}`);
			a.innerHTML = `${icon("external", 14)}<span>${LABEL}</span>`;
			a.addEventListener("click", (e) => e.stopPropagation());
			return a;
		}
		let token = 0;
		let placedKey = null;
		let placing = false;
		async function place() {
			const r = route();
			const key = r && `${r.kind}:${r.id}`;
			if (key && key === placedKey && document.getElementById(ID)) return;
			document.getElementById(ID)?.remove();
			placedKey = null;
			if (!r) return;
			const mine = ++token;
			placing = true;
			try {
				const row = await Core.waitForSelector(SLOT, 8e3);
				const now = route();
				if (row && mine === token && now && now.kind === r.kind && now.id === r.id && !document.getElementById(ID)) {
					const a = build(r);
					row.insertBefore(a, row.firstChild);
					skin(a);
					placedKey = key;
				}
			} finally {
				if (mine === token) placing = false;
			}
		}
		const repair = debounce(() => {
			if (!route() || placing) return;
			const a = document.getElementById(ID);
			if (!a) {
				placedKey = null;
				place();
			} else skin(a);
		}, 400);
		place();
		Core.onNavigate(place);
		Core.onBodyMutation(repair);
	});
	function parseLatest(value) {
		if (value == null) return null;
		const s = String(value).trim();
		if (!s || /^(n\/a|unknown|none)$/i.test(s)) return null;
		const nums = [...s.matchAll(/(?:^|[^\d])(?:v\d+[ ._-]*)?c?\s*(\d+(?:\.\d+)?)/gi)].map((m) => Number(m[1])).filter(Number.isFinite);
		if (nums.length) return Math.max(...nums);
		return Number(s.replace(/,/g, "").match(/\d+(?:\.\d+)?/)?.[0]) || null;
	}
	async function mangaUpdates(title) {
		const search = await gm.json("https://api.mangaupdates.com/v1/series/search", {
			method: "POST",
			anonymous: true,
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json"
			},
			data: JSON.stringify({
				search: title,
				stype: "title",
				perpage: 8
			})
		});
		const best = bestMatch(Array.isArray(search?.results) ? search.results : [], title, (r) => r?.hit_title || r?.record?.title);
		if (!best) return null;
		const rec = best.record || {};
		let latest = parseLatest(rec.latest_chapter);
		const id = rec.series_id || rec.id || rec.seriesId || String(rec.url || "").match(/\/series\/(\d+)/)?.[1];
		if (latest == null && id) latest = await tryOr(async () => {
			const d = await gm.json(`https://api.mangaupdates.com/v1/series/${encodeURIComponent(id)}`, {
				anonymous: true,
				headers: { Accept: "application/json" }
			});
			return parseLatest(d?.latest_chapter ?? d?.record?.latest_chapter);
		});
		if (latest == null && rec.url) latest = await tryOr(async () => {
			const m = (await gm.text(rec.url, { anonymous: true })).match(/Latest\s+Chapter[\s\S]{0,500}?\b(?:c\s*)?(\d+(?:\.\d+)?)/i);
			return m ? Number(m[1]) : null;
		});
		return latest == null ? null : Math.floor(latest);
	}
	async function novelUpdates(title) {
		const html = await gm.text(`https://www.novelupdates.com/?s=${encodeURIComponent(title)}&post_type=series`, { anonymous: true });
		const doc = new DOMParser().parseFromString(html, "text/html");
		const seen = new Set();
		const cands = [];
		for (const a of doc.querySelectorAll("a[href*=\"/series/\"]")) {
			const href = new URL(a.getAttribute("href") || "", "https://www.novelupdates.com/").href;
			const text = clean(a.textContent);
			if (text && !seen.has(href)) {
				seen.add(href);
				cands.push({
					href,
					text
				});
			}
		}
		const best = bestMatch(cands, title, (c) => c.text);
		if (!best) return null;
		const body = new DOMParser().parseFromString(await gm.text(best.href, { anonymous: true }), "text/html").body?.textContent || "";
		let latest = null;
		const at = body.search(/Latest\s+Release/i);
		if (at >= 0) {
			const hits = [...body.slice(at, at + 5e3).matchAll(/(?:^|\s)(?:v\d+[ ._-]*)?c\s*(\d+(?:\.\d+)?)/gi)].slice(0, 30).map((m) => Number(m[1])).filter(Number.isFinite);
			if (hits.length) latest = Math.max(...hits);
		}
		if (latest == null) {
			const m = body.slice(0, 12e3).match(/(?:Status in COO|Chapters)[\s\S]{0,500}?\b(\d+(?:\.\d+)?)\s+Chapters?/i);
			if (m) latest = Number(m[1]);
		}
		return latest != null && Number.isFinite(latest) ? Math.floor(latest) : null;
	}
	var lookup = memo((kind, title) => kind === "NU" ? novelUpdates(title) : mangaUpdates(title), { ttl: 18e5 });
	async function externalReleased(info) {
		const kind = info?.format === "NOVEL" ? "NU" : "MU";
		const titles = [...new Set([
			info?.title?.userPreferred,
			info?.title?.romaji,
			info?.title?.english
		].filter(Boolean))];
		for (const t of titles) {
			const n = await tryOr(() => lookup(`${kind}:${normTitle(t)}`, kind, t));
			if (n != null) return n;
		}
		return null;
	}
	defineFeature({
		id: "mediaInfo",
		key: "mediaInfoEnabled",
		section: "AniList Enhancements",
		legacy: ["mediaInfoEnabled", "mediaListEditorEnabled"],
		title: "List Score & Progress Editor",
		help: "Show your score and episode/chapter progress controls on anime and manga pages."
	}, () => {
		const ID = "ala-media-info";
		addStyle("ala-media-info-style", `
      #${ID}{box-sizing:border-box;width:100%;max-width:100%;margin:0 0 12px;padding:14px 15px 15px;border-radius:3px;background:rgb(var(--color-foreground));color:rgb(var(--color-text));font-size:1.3rem;line-height:1.4;overflow:hidden}
      #${ID} *{box-sizing:border-box}
      #${ID} :focus-visible{outline:2px solid rgb(var(--color-blue));outline-offset:2px}
      #${ID} .ala-mi-fields{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:12px}
      #${ID} .ala-mi-field{display:flex;flex-direction:column;gap:6px;min-width:0}
      #${ID} .ala-mi-label{color:rgb(var(--color-text-lighter));font-size:1.2rem}
      #${ID} .ala-mi-box{display:flex;align-items:stretch;height:38px;border-radius:3px;background:rgb(var(--color-background));box-shadow:inset 0 0 0 1px transparent;overflow:hidden;transition:box-shadow .15s}
      #${ID} .ala-mi-box:hover{box-shadow:inset 0 0 0 1px rgba(var(--color-blue),.4)}
      #${ID} .ala-mi-box:focus-within{box-shadow:inset 0 0 0 1px rgb(var(--color-blue))}
      #${ID} input{flex:1 1 auto;width:100%;min-width:0;height:100%;margin:0;padding:0 4px;border:0;outline:none;background:transparent;color:rgb(var(--color-text));font:inherit;font-size:1.5rem;text-align:center;-moz-appearance:textfield}
      #${ID} input::placeholder{color:rgb(var(--color-text-lighter))}
      #${ID} input::-webkit-outer-spin-button,#${ID} input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
      #${ID} .ala-mi-step{flex:0 0 34px;display:flex;align-items:center;justify-content:center;padding:0;border:0;background:transparent;color:rgb(var(--color-text-lighter));font:inherit;font-size:1.8rem;line-height:1;cursor:pointer;transition:color .15s}
      #${ID} .ala-mi-step:hover{color:rgb(var(--color-blue))}
      #${ID} .ala-mi-step:active{color:rgb(var(--color-text))}
      #${ID} .ala-mi-sub{min-height:16px;overflow:hidden;color:rgb(var(--color-text-lighter));font-size:1.15rem;white-space:nowrap;text-overflow:ellipsis}
      #${ID} .ala-mi-sub b{color:rgb(var(--color-text));font-weight:inherit}
      #${ID} .ala-mi-bar{position:relative;height:3px;margin:13px 0 14px;border-radius:2px;background:rgb(var(--color-background));overflow:hidden}
      #${ID} .ala-mi-bar[hidden]{display:none}
      #${ID} .ala-mi-aired,#${ID} .ala-mi-done{position:absolute;top:0;bottom:0;left:0;width:0;border-radius:2px;transition:width .2s ease}
      #${ID} .ala-mi-aired{background:rgba(var(--color-blue),.3)}
      #${ID} .ala-mi-done{background:rgb(var(--color-blue))}
      #${ID} .ala-mi-save{display:block;width:100%;height:36px;padding:0;border:0;border-radius:4px;background:rgb(var(--color-blue));color:rgb(var(--color-white,255,255,255));font:inherit;font-size:1.4rem;cursor:pointer;transition:filter .15s,opacity .15s}
      #${ID} .ala-mi-save:hover:not(:disabled){filter:brightness(1.1)}
      #${ID} .ala-mi-save:disabled{opacity:.45;cursor:default}
      @media (pointer:coarse){#${ID} .ala-mi-box{height:42px}#${ID} .ala-mi-step{flex-basis:40px}#${ID} input{font-size:16px}#${ID} .ala-mi-save{height:40px}}
      @media (prefers-reduced-motion:reduce){#${ID} .ala-mi-aired,#${ID} .ala-mi-done{transition:none}}`);
		const maxOf = (info, type) => {
			const n = Math.floor(Number(type === "ANIME" ? info?.episodes : info?.chapters));
			return n > 0 ? n : null;
		};
		function airedEpisodes(info) {
			const next = Number(info?.nextAiringEpisode?.episode);
			if (Number.isFinite(next) && next > 0) return Math.max(0, Math.floor(next) - 1);
			if (info?.status === "NOT_YET_RELEASED") return 0;
			return info?.status === "FINISHED" ? maxOf(info, "ANIME") : null;
		}
		function findSpot() {
			const el = document.querySelector(".sidebar > .data");
			return el?.parentElement && el.parentElement !== document.body ? {
				parent: el.parentElement,
				before: el
			} : null;
		}
		const scoreStep = (f) => f === "POINT_10_DECIMAL" ? "0.1" : "1";
		const scoreMax = (f) => ({
			POINT_100: 100,
			POINT_5: 5,
			POINT_3: 3
		})[f || ""] || 10;
		const formatScore = (raw, f) => {
			const n = Number(raw);
			return !Number.isFinite(n) || n <= 0 ? "" : f === "POINT_10_DECIMAL" ? n.toFixed(1) : String(n);
		};
		const today = () => {
			const d = new Date();
			return {
				year: d.getFullYear(),
				month: d.getMonth() + 1,
				day: d.getDate()
			};
		};
		const scoreFormat = async () => (await tryOr(() => AniList.viewer()))?.scoreFormat || null;
		let shown = null;
		let gen = 0;
		let rendering = false;
		let rerender = false;
		let saving = false;
		let routeAt = Date.now();
		let timer = 0;
		let retry = {
			key: null,
			at: 0,
			count: 0
		};
		const MAX_FAILURES = 3;
		const panel = () => document.getElementById(ID);
		const schedule = (ms = 300) => {
			clearTimeout(timer);
			timer = setTimeout(() => render(), ms);
		};
		function changeProgress(delta, input, limit) {
			const next = Number(input.value) + delta;
			if (!Number.isInteger(next) || next < 0 || limit !== null && next > limit) return;
			input.value = String(next);
		}
		async function save(media, info, scoreInput, progressInput) {
			if (saving) return null;
			const fmt = await scoreFormat();
			const max = maxOf(info, media.type);
			const scoreText = scoreInput.value.trim();
			const score = scoreText === "" ? 0 : Number(scoreText);
			let progress = Number(progressInput.value);
			if (!Number.isFinite(score) || score < 0 || score > scoreMax(fmt)) {
				scoreInput.focus();
				return null;
			}
			if (!Number.isInteger(progress) || progress < 0) {
				progressInput.focus();
				return null;
			}
			if (max !== null) progress = Math.min(progress, max);
			progressInput.value = String(progress);
			const prev = info.mediaListEntry || {};
			const finishNow = max !== null && progress >= max && (prev.status !== "COMPLETED" || !prev.completedAt?.year);
			saving = true;
			try {
				if (!await MediaData.save(media.id, media.type, {
					score,
					progress,
					status: finishNow ? "COMPLETED" : void 0,
					completedAt: finishNow ? today() : void 0
				})) throw new Error("AniList did not return the updated entry");
				await render(true);
				return true;
			} catch (e) {
				console.warn("[AL-Additions] Media list save failed:", e);
				return false;
			} finally {
				saving = false;
			}
		}
		async function render(force = false) {
			const route = mediaRoute();
			if (!route) {
				shown = null;
				panel()?.remove();
				return;
			}
			const key = `${route.type}:${route.id}`;
			if (rendering) {
				if (force) rerender = true;
				return;
			}
			if (saving && !force) return;
			if (!force && shown === key && panel()) return;
			if (!force && retry.key === key && (retry.count >= MAX_FAILURES || Date.now() < retry.at)) return;
			if (!findSpot()) {
				if (Date.now() - routeAt < 15e3) schedule(800);
				return;
			}
			const g = gen;
			const stale = () => g !== gen || mediaRoute()?.id !== route.id;
			rendering = true;
			try {
				const info = await MediaData.get(route.id, route.type);
				if (stale()) return;
				if (!info) {
					retry = {
						key,
						at: Date.now() + 15e3,
						count: retry.key === key ? retry.count + 1 : 1
					};
					if (retry.count < MAX_FAILURES) schedule(15500);
					return;
				}
				const fmt = await scoreFormat();
				if (stale()) return;
				const spot = findSpot();
				if (!spot) {
					schedule(800);
					return;
				}
				const entry = info.mediaListEntry || {
					score: 0,
					progress: 0
				};
				const max = maxOf(info, route.type);
				const anime = route.type === "ANIME";
				const progress = Number.isFinite(Number(entry.progress)) ? Number(entry.progress) : 0;
				const label = anime ? "Episode" : "Chapter";
				const word = anime ? "aired" : "released";
				const scoreTop = scoreMax(fmt);
				let released = anime ? airedEpisodes(info) : null;
				let lookupPending = !anime;
				const box = document.createElement("div");
				box.id = ID;
				box.innerHTML = `
          <div class="ala-mi-fields">
            <div class="ala-mi-field">
              <span class="ala-mi-label">Score</span>
              <div class="ala-mi-box"><input class="ala-mi-score-input" type="number" min="0" max="${scoreTop}" step="${scoreStep(fmt)}" value="${formatScore(entry.score, fmt)}" placeholder="—" inputmode="decimal" aria-label="Score"></div>
              <span class="ala-mi-sub">out of ${scoreTop}</span>
            </div>
            <div class="ala-mi-field">
              <span class="ala-mi-label">${label}</span>
              <div class="ala-mi-box">
                <button class="ala-mi-step ala-mi-minus" type="button" aria-label="Decrease">−</button>
                <input class="ala-mi-progress-input" type="number" min="0"${max !== null ? ` max="${max}"` : ""} step="1" value="${progress}" inputmode="numeric" aria-label="${label} progress">
                <button class="ala-mi-step ala-mi-plus" type="button" aria-label="Increase">+</button>
              </div>
              <span class="ala-mi-sub ala-mi-prog-sub"></span>
            </div>
          </div>
          <div class="ala-mi-bar"><div class="ala-mi-aired"></div><div class="ala-mi-done"></div></div>
          <button class="ala-mi-save" type="button" disabled>Save</button>`;
				const scoreInput = box.querySelector(".ala-mi-score-input");
				const progressInput = box.querySelector(".ala-mi-progress-input");
				const saveBtn = box.querySelector(".ala-mi-save");
				const sub = box.querySelector(".ala-mi-prog-sub");
				const bar = box.querySelector(".ala-mi-bar");
				const doneFill = box.querySelector(".ala-mi-done");
				const airedFill = box.querySelector(".ala-mi-aired");
				const limit = () => max !== null ? max : released;
				const startScore = scoreInput.value.trim();
				const startProgress = progressInput.value;
				function paint() {
					const typed = Number(progressInput.value);
					const watched = Number.isFinite(typed) && typed > 0 ? typed : 0;
					sub.innerHTML = `of <b>${max !== null ? max : "—"}</b>` + (released != null ? ` · <b>${released}</b> ${word}` : lookupPending ? " · …" : "");
					const total = limit();
					bar.hidden = !(total && total > 0);
					if (total && total > 0) {
						doneFill.style.width = Math.min(100, watched / total * 100) + "%";
						airedFill.style.width = released != null ? Math.min(100, released / total * 100) + "%" : "0%";
					}
					saveBtn.disabled = saving || scoreInput.value.trim() === startScore && progressInput.value === startProgress;
				}
				saveBtn.addEventListener("click", async () => {
					if (saving || saveBtn.disabled) return;
					saveBtn.disabled = true;
					let ok = null;
					try {
						ok = await save(route, info, scoreInput, progressInput);
					} finally {
						paint();
					}
					if (ok === false) {
						saveBtn.textContent = "Failed";
						setTimeout(() => {
							if (saveBtn.isConnected) saveBtn.textContent = "Save";
						}, 2e3);
					}
				});
				for (const input of [scoreInput, progressInput]) {
					input.addEventListener("keydown", (e) => {
						if (e.key === "Enter") saveBtn.click();
					});
					input.addEventListener("input", paint);
				}
				box.querySelector(".ala-mi-minus")?.addEventListener("click", () => {
					changeProgress(-1, progressInput, limit());
					paint();
				});
				box.querySelector(".ala-mi-plus")?.addEventListener("click", () => {
					changeProgress(1, progressInput, limit());
					paint();
				});
				panel()?.remove();
				spot.parent.insertBefore(box, spot.before);
				shown = key;
				paint();
				if (!anime) externalReleased(info).then((n) => {
					if (stale() || !box.isConnected) return;
					released = n;
					lookupPending = false;
					paint();
				});
			} finally {
				rendering = false;
				if (rerender) {
					rerender = false;
					safe(() => render(true), "media info refresh");
				}
			}
		}
		window.addEventListener("load", () => schedule(500), { once: true });
		Core.ready(() => schedule(document.readyState === "complete" ? 500 : 1200));
		Core.onNavigate(() => {
			const r = mediaRoute();
			if (r && shown === `${r.type}:${r.id}` && panel()) return;
			gen++;
			shown = null;
			routeAt = Date.now();
			retry = {
				key: null,
				at: 0,
				count: 0
			};
			panel()?.remove();
			schedule(1200);
		});
		Core.onBodyMutation(() => {
			if (mediaRoute() && !panel() && !rendering && !saving) schedule(500);
		});
	});
	defineFeature({
		id: "behindDots",
		key: "behindDotsEnabled",
		section: "AniList Enhancements",
		legacy: ["behindDotsEnabled", "airingProgressIndicatorEnabled"],
		title: "Airing Progress Indicator",
		help: "Show an orange indicator when your watched episode count is behind the number of aired episodes."
	}, () => {
		const CLASS = "daiya-behind-dot";
		const ORANGE = "rgb(255, 152, 0)";
		const NO_AIRING_TTL = 216e5;
		const AIRING_GRACE = 3e4;
		const ERROR_RETRY = 3e5;
		const PRUNE_AGE = 2592e6;
		const BATCH = 25;
		const CONCURRENCY = 4;
		const OPTIMISTIC_TTL = 2500;
		const QUERY = "query ($ids: [Int]) { Page(page: 1, perPage: 25) { media(id_in: $ids, type: ANIME) { id status nextAiringEpisode { episode airingAt timeUntilAiring } } } }";
		addStyle("daiya-behind-dot-css", `
      .${CLASS}{background:${ORANGE}!important;background-color:${ORANGE}!important;box-shadow:0 0 5px rgba(255,152,0,.85)!important;opacity:1!important}
      .${CLASS}::before,.${CLASS}::after{background:${ORANGE}!important;background-color:${ORANGE}!important}`);
		const cacheStore = persistent("daiya-anilist-airing-cache-v5", (d) => {
			for (const id of Object.keys(d)) if (!(Date.now() - Number(d[id]?.updated) < PRUNE_AGE)) delete d[id];
		});
		const cache = cacheStore.data;
		const pending = new Set();
		const active = new Set();
		const timers = new Map();
		const optimistic = new Map();
		let running = 0;
		const onListPage = () => location.pathname.includes("/animelist");
		const idOf = (entry) => entry.querySelector("a[href*=\"/anime/\"]")?.getAttribute("href")?.match(/\/anime\/(\d+)(?:[/?#]|$)/i)?.[1] || null;
		const needsFetch = (id) => {
			const d = cache[id];
			return !d || !Number.isFinite(d.nextCheck) || Date.now() >= d.nextCheck;
		};
		const sectionIsWatching = (wrap) => clean(wrap?.querySelector(".section-name")?.textContent) === "Watching";
		function watchingEntries() {
			const out = [];
			for (const wrap of document.querySelectorAll(".list-wrap")) if (sectionIsWatching(wrap)) out.push(...Array.from(wrap.querySelectorAll(".list-entries .entry")));
			return out;
		}
		function progressOf(entry) {
			const m = entry.querySelector(".progress")?.textContent?.match(/^\s*(\d+)/) || entry.textContent?.match(/(?:^|\s)(\d+)\s*\/\s*(?:\d+|\?)(?:\s|$)/);
			return m ? Number(m[1]) : null;
		}
		function releasingDot(entry) {
			const fast = entry.querySelector(".release-status.RELEASING");
			if (fast) return fast;
			for (const el of entry.querySelectorAll(".release-status, [class*='release-status']")) {
				if (/\bRELEASING\b/i.test(typeof el.className === "string" ? el.className : "")) return el;
				if (/^releasing$/i.test((el.getAttribute("aria-label") || el.getAttribute("title") || "").trim())) return el;
			}
			return null;
		}
		function updateEntry(entry) {
			if (!entry || !entry.isConnected) return null;
			const dot = releasingDot(entry);
			if (!dot || !sectionIsWatching(entry.closest(".list-wrap"))) return null;
			const id = idOf(entry);
			if (!id) return null;
			const watched = progressOf(entry);
			if (!Number.isFinite(watched)) {
				dot.classList.remove(CLASS);
				return id;
			}
			const opt = optimistic.get(id);
			if (opt) {
				if (Date.now() >= opt.expiresAt || watched !== null && watched >= opt.target) optimistic.delete(id);
				else {
					dot.classList.remove(CLASS);
					return id;
				}
			}
			const data = cache[id];
			const behind = !!data && Number.isFinite(data.aired) && watched !== null && watched < data.aired;
			if (dot.classList.contains(CLASS) !== behind) dot.classList.toggle(CLASS, behind);
			return id;
		}
		function scanAll() {
			if (!onListPage()) return;
			const stale = new Set();
			for (const entry of watchingEntries()) {
				const id = updateEntry(entry);
				if (id && needsFetch(id)) stale.add(id);
			}
			queueIDs(stale);
		}
		function repaint(ids) {
			for (const entry of watchingEntries()) {
				const id = idOf(entry);
				if (id && ids.has(id)) updateEntry(entry);
			}
		}
		function makeEntry(media) {
			const next = media.nextAiringEpisode;
			const now = Date.now();
			const base = {
				status: media.status || null,
				updated: now
			};
			if (!next || !Number.isFinite(Number(next.episode))) return {
				...base,
				aired: null,
				nextEpisode: null,
				nextCheck: now + NO_AIRING_TTL
			};
			const timeUntil = Number(next.timeUntilAiring);
			const airingAt = Number(next.airingAt);
			const nextCheck = Number.isFinite(timeUntil) ? now + Math.max(0, timeUntil) * 1e3 + AIRING_GRACE : Number.isFinite(airingAt) ? airingAt * 1e3 + AIRING_GRACE : now + NO_AIRING_TTL;
			return {
				...base,
				aired: Math.max(0, Math.floor(Number(next.episode)) - 1),
				nextEpisode: Number(next.episode),
				nextCheck
			};
		}
		function scheduleRefresh(id, at) {
			const existing = timers.get(id);
			if (existing) clearTimeout(existing);
			timers.delete(id);
			if (!Number.isFinite(at)) return;
			const t = setTimeout(() => {
				timers.delete(id);
				queueIDs([id]);
				repaint(new Set([id]));
			}, Math.min(Math.max(0, at - Date.now()), 2147483647));
			timers.set(id, t);
		}
		async function updateBatch(ids) {
			const returned = new Set();
			try {
				const data = await AniList.query(QUERY, { ids: ids.map(Number) });
				for (const m of data?.Page?.media || []) {
					const id = String(m.id);
					returned.add(id);
					cache[id] = makeEntry(m);
					scheduleRefresh(id, cache[id].nextCheck);
				}
			} catch (_) {}
			const retryAt = Date.now() + ERROR_RETRY;
			for (const id of ids) {
				if (returned.has(id)) continue;
				const ex = cache[id];
				if (ex && Number.isFinite(ex.aired)) ex.nextCheck = retryAt;
				else cache[id] = {
					aired: null,
					nextEpisode: null,
					status: null,
					nextCheck: retryAt,
					updated: Date.now()
				};
				scheduleRefresh(id, retryAt);
			}
			cacheStore.save();
			if (returned.size) repaint(returned);
		}
		function queueIDs(ids) {
			for (const raw of ids) {
				const id = String(raw);
				if (!active.has(id)) pending.add(id);
			}
			while (running < CONCURRENCY && pending.size) {
				const batch = [];
				for (const id of pending) {
					pending.delete(id);
					active.add(id);
					batch.push(id);
					if (batch.length >= BATCH) break;
				}
				running++;
				updateBatch(batch).finally(() => {
					batch.forEach((id) => active.delete(id));
					running--;
					queueIDs([]);
				});
			}
		}
		const dirty = new Set();
		let fullScan = false;
		let raf = 0;
		function flush() {
			raf = 0;
			if (!onListPage()) {
				dirty.clear();
				fullScan = false;
				return;
			}
			if (fullScan) {
				fullScan = false;
				dirty.clear();
				scanAll();
				return;
			}
			const stale = new Set();
			for (const entry of dirty) {
				const id = updateEntry(entry);
				if (id && needsFetch(id)) stale.add(id);
			}
			dirty.clear();
			queueIDs(stale);
		}
		const mark = () => {
			if (!raf) raf = requestAnimationFrame(flush);
		};
		const refresh = debounce(scanAll, 100);
		Core.onBodyMutation((muts) => {
			if (!onListPage()) return;
			for (const m of muts) {
				const own = (m.target.nodeType === 1 ? m.target : m.target.parentElement)?.closest?.(".entry");
				if (own) {
					dirty.add(own);
					mark();
				}
				for (const n of Array.from(m.addedNodes)) {
					if (n.nodeType !== 1) continue;
					const el = n;
					if (el.matches(".entry")) dirty.add(el);
					else {
						el.querySelectorAll(".entry").forEach((e) => dirty.add(e));
						if (el.matches(".list-wrap, .section-name") || el.querySelector(".section-name")) fullScan = true;
					}
					mark();
				}
			}
		});
		Core.onNavigate(() => {
			if (onListPage()) {
				fullScan = true;
				mark();
				refresh();
			}
		});
		const isIncrease = (el) => {
			for (let n = el, i = 0; i < 4 && n; i++, n = n.parentElement) {
				const label = `${n.getAttribute?.("aria-label") || ""} ${n.getAttribute?.("title") || ""}`.trim().toLowerCase();
				if (/increase|increment|add episode|add chapter|next episode|next chapter/.test(label)) return true;
				const text = (n.textContent || "").trim();
				if (text === "+" || text === "+1") return true;
			}
			return false;
		};
		document.addEventListener("pointerdown", (e) => {
			if (!(e.target instanceof Element) || !isIncrease(e.target)) return;
			const entry = e.target.closest(".entry");
			const dot = entry && releasingDot(entry);
			if (!dot || !dot.classList.contains(CLASS)) return;
			const id = idOf(entry);
			const data = id && cache[id];
			const watched = progressOf(entry);
			if (data && Number.isFinite(data.aired) && Number.isFinite(watched) && watched !== null && watched + 1 >= data.aired) {
				optimistic.set(id, {
					target: watched + 1,
					expiresAt: Date.now() + OPTIMISTIC_TTL
				});
				dot.classList.remove(CLASS);
			}
		}, true);
		for (const type of [
			"click",
			"input",
			"change"
		]) document.addEventListener(type, (e) => {
			if (e.target instanceof Element && e.target.closest(".entry")) refresh();
		}, true);
		window.addEventListener("focus", refresh);
		document.addEventListener("visibilitychange", () => {
			if (!document.hidden) refresh();
		});
		setInterval(scanAll, 6e4);
		Core.ready(() => {
			if (onListPage()) {
				scanAll();
				setTimeout(scanAll, 500);
				setTimeout(scanAll, 1500);
			}
		});
	});
	defineFeature({
		id: "aniSongs",
		key: "aniSongsEnabled",
		section: "AniList Enhancements",
		legacy: [
			"aniSongsEnabled",
			"animeThemeSongsEnabled",
			"anisongsEnabled"
		],
		title: "Anime Opening & Ending Songs",
		help: "Show OP/ED theme songs on anime pages."
	}, () => {
		const API = "https://api.animethemes.moe/anime";
		const ROOT = "daiya-anisongs";
		const TTL = 6048e5;
		addStyle("daiya-anisongs-style", `
      #${ROOT}{width:100%;margin-top:30px}
      #${ROOT} .daiya-anisongs-columns{display:flex;gap:30px;width:100%}
      #${ROOT} .daiya-anisongs-group{flex:1 1 0;min-width:0}
      #${ROOT} h2{margin-top:0}
      #${ROOT} .daiya-anisong-entry{background:rgb(var(--color-foreground));border-radius:3px;padding:8px 10px;font-size:1.3rem;margin-bottom:10px;color:rgb(var(--color-text))}
      #${ROOT} .daiya-anisong-entry.has-video{cursor:pointer}
      #${ROOT} .daiya-anisong-entry.has-video:hover{color:rgb(var(--color-blue));transition:color .15s}
      #${ROOT} video{display:block;width:100%;max-width:39em;margin-top:10px;cursor:auto}
      #${ROOT} .daiya-anisongs-empty{text-align:center;opacity:.7;padding:10px}
      @media (max-width:700px){#${ROOT} .daiya-anisongs-columns{flex-direction:column;gap:10px}}`);
		const cacheStore = persistent("daiya_anisongs_cache_v5", (d) => {
			for (const id of Object.keys(d)) if (!(Number(d[id]?.expires) > Date.now())) delete d[id];
		});
		const cache = cacheStore.data;
		const str = (v) => typeof v === "string" ? v.trim() : "";
		function pickVideo(entries) {
			let fallback = null;
			for (const entry of Array.isArray(entries) ? entries : []) for (const video of Array.isArray(entry?.videos) ? entry.videos : []) {
				const link = str(video?.link);
				if (!/^https?:\/\//i.test(link)) continue;
				if (str(video?.source).toUpperCase() === "WEB") return link;
				fallback = fallback || link;
			}
			return fallback;
		}
		function parseTheme(theme) {
			const title = str(theme?.song?.title);
			if (!title) return null;
			const seq = Number(theme?.sequence);
			const sequence = Number.isFinite(seq) && seq >= 1 ? Math.floor(seq) : 1;
			const artists = (Array.isArray(theme?.song?.artists) ? theme.song.artists : []).map((a) => str(a?.name)).filter(Boolean);
			const eps = (Array.isArray(theme?.animethemeentries) ? theme.animethemeentries : []).map((e) => str(e?.episodes)).filter(Boolean).join(", ");
			const group = str(theme?.group);
			return {
				sequence,
				name: `${sequence}. "${title}"` + (artists.length ? ` by ${artists.join(", ")}` : "") + (eps ? ` (${eps.includes("-") ? "eps" : "ep"} ${eps})` : "") + (group && group.toLowerCase().includes("dubbed") ? ` (${group})` : ""),
				url: pickVideo(theme?.animethemeentries)
			};
		}
		function groupThemes(anime) {
			const out = {
				OP: [],
				ED: []
			};
			for (const theme of Array.isArray(anime?.animethemes) ? anime.animethemes : []) {
				const parsed = parseTheme(theme);
				const type = str(theme?.type).toUpperCase();
				if (parsed && out[type]) out[type].push(parsed);
			}
			const sort = (a, b) => a.sequence - b.sequence || a.name.localeCompare(b.name);
			out.OP.sort(sort);
			out.ED.sort(sort);
			return out;
		}
		const loadThemes = memo(async (id) => {
			const hit = cache[String(id)];
			if (hit && hit.expires > Date.now()) return hit.data;
			const params = new URLSearchParams({
				"filter[has]": "resources",
				"filter[site]": "AniList",
				"filter[external_id]": String(id),
				include: "animethemes.animethemeentries.videos,animethemes.song,animethemes.song.artists"
			});
			const result = await gm.json(`${API}?${params}`, { headers: { Accept: "application/json" } });
			const data = groupThemes(Array.isArray(result?.anime) ? result.anime[0] : null);
			cache[String(id)] = {
				expires: Date.now() + TTL,
				data
			};
			cacheStore.save();
			return data;
		});
		function songEl(song) {
			const el = document.createElement("div");
			el.className = "daiya-anisong-entry";
			el.textContent = song.name;
			const url = song.url;
			if (!url) return el;
			el.classList.add("has-video");
			let video = null;
			el.addEventListener("click", (e) => {
				if (e.target instanceof HTMLVideoElement) return;
				if (video) {
					video.pause();
					video.remove();
					video = null;
					return;
				}
				video = document.createElement("video");
				video.controls = true;
				video.preload = "none";
				video.volume = .4;
				video.src = url;
				video.addEventListener("click", (ev) => ev.stopPropagation());
				el.appendChild(video);
				video.play().catch(() => {});
			});
			return el;
		}
		function groupEl(title, songs) {
			const g = document.createElement("div");
			g.className = "daiya-anisongs-group";
			const h = document.createElement("h2");
			h.textContent = title;
			g.appendChild(h);
			if (!songs.length) {
				const empty = document.createElement("div");
				empty.className = "daiya-anisongs-empty";
				empty.textContent = "No songs to show (つ﹏<)･ﾟ｡";
				g.appendChild(empty);
			} else songs.forEach((s) => g.appendChild(songEl(s)));
			return g;
		}
		function mount(state, overview) {
			document.getElementById(ROOT)?.remove();
			const root = document.createElement("section");
			root.id = ROOT;
			root.dataset.animeId = state.id;
			const cols = document.createElement("div");
			cols.className = "daiya-anisongs-columns";
			cols.append(groupEl("Openings", state.themes.OP), groupEl("Endings", state.themes.ED));
			root.appendChild(cols);
			overview.appendChild(root);
		}
		let cur = null;
		let backoff = {
			id: null,
			until: 0
		};
		const animeId = () => {
			const r = mediaRoute();
			return r && r.kind === "anime" ? String(r.id) : null;
		};
		async function sync() {
			const id = animeId();
			if (!id) {
				document.getElementById(ROOT)?.remove();
				cur = null;
				return;
			}
			if (cur?.id === id) return;
			if (backoff.id === id && Date.now() < backoff.until) return;
			document.getElementById(ROOT)?.remove();
			const mine = {
				id,
				themes: null,
				busy: true
			};
			cur = mine;
			try {
				const themes = await loadThemes(id, id);
				if (cur !== mine) return;
				if (!themes.OP.length && !themes.ED.length) return;
				mine.themes = themes;
				const overview = await Core.waitForSelector(".overview", 1e4);
				if (cur === mine && overview && animeId() === id) mount(mine, overview);
			} catch (_) {
				if (cur === mine) {
					cur = null;
					backoff = {
						id,
						until: Date.now() + 3e4
					};
				}
			} finally {
				mine.busy = false;
			}
		}
		function repair() {
			const id = animeId();
			if (!id) return;
			if (cur?.id !== id) return void sync();
			if (cur.themes && !cur.busy && !document.getElementById(ROOT)) {
				const overview = document.querySelector(".overview");
				if (overview) mount(cur, overview);
			}
		}
		Core.ready(sync);
		Core.onNavigate(sync);
		Core.onBodyMutation(repair);
	});
	var TYPES = ["ANIME", "MANGA"];
	var ID_MISS_TTL_MS$1 = 6048e5;
	var SETTLED_TTL_MS = 3888e6;
	var LOCK_STALE_MS = 45e3;
	var LOCK_HEARTBEAT_MS = 1e4;
	var TAB_ID = randomString$1(10);
	var LOCK_KEY = "sync_lock_heartbeat";
	var progress = {
		phase: "idle",
		done: 0,
		total: 0,
		changed: 0
	};
	var syncStatus = {
		syncing: false,
		cancelled: false,
		autoSyncRetryAfter: 0
	};
	var progressListeners = [];
	var stateListeners = [];
	var onProgressChange = (cb) => {
		progressListeners.push(cb);
	};
	var onStateChange = (cb) => {
		stateListeners.push(cb);
	};
	var notifyProgress = (force = false) => {
		for (const cb of progressListeners) cb(force);
	};
	var notifyState = () => {
		for (const cb of stateListeners) cb();
	};
	var markDone = (n = 1) => {
		progress.done += n;
		notifyProgress();
	};
	var checkCancel = () => {
		if (syncStatus.cancelled) {
			const e = new Error("Sync stopped.");
			e.cancelled = true;
			throw e;
		}
	};
	var stores = {
		ANIME: {
			ids: persistent("sync_idmap_ANIME", (d) => {
				for (const k of Object.keys(d)) {
					const r = d[k];
					if (!r || typeof r !== "object" || !(r.m > 0) && !(Date.now() - r.t < ID_MISS_TTL_MS$1)) delete d[k];
				}
			}),
			settled: persistent("sync_settled_ANIME", (d) => {
				for (const k of Object.keys(d)) {
					const r = d[k];
					if (!Array.isArray(r) || !(Date.now() - r[2] < SETTLED_TTL_MS)) delete d[k];
				}
			})
		},
		MANGA: {
			ids: persistent("sync_idmap_MANGA", (d) => {
				for (const k of Object.keys(d)) {
					const r = d[k];
					if (!r || typeof r !== "object" || !(r.m > 0) && !(Date.now() - r.t < ID_MISS_TTL_MS$1)) delete d[k];
				}
			}),
			settled: persistent("sync_settled_MANGA", (d) => {
				for (const k of Object.keys(d)) {
					const r = d[k];
					if (!Array.isArray(r) || !(Date.now() - r[2] < SETTLED_TTL_MS)) delete d[k];
				}
			})
		}
	};
	var clearCache = (c) => {
		for (const k of Object.keys(c.data)) delete c.data[k];
		c.save();
	};
	function resetAccountState() {
		for (const t of TYPES) {
			for (const k of [
				"last_sync",
				"last_run",
				"last_compare"
			]) store.del(`${k}_${t}`);
			clearCache(stores[t].settled);
		}
		store.del("sync_retry_at");
	}
	var heartbeat = null;
	async function acquireLock() {
		const lock = jsonGet(LOCK_KEY, null);
		if (lock && lock.tab !== TAB_ID && Number.isFinite(lock.at) && Date.now() - lock.at < LOCK_STALE_MS) return false;
		const beat = () => jsonSet(LOCK_KEY, {
			at: Date.now(),
			tab: TAB_ID
		});
		beat();
		await sleep(250);
		if (jsonGet(LOCK_KEY, null)?.tab !== TAB_ID) return false;
		heartbeat = setInterval(beat, LOCK_HEARTBEAT_MS);
		return true;
	}
	function releaseLock() {
		if (heartbeat) clearInterval(heartbeat);
		heartbeat = null;
		if (jsonGet(LOCK_KEY, null)?.tab === TAB_ID) store.del(LOCK_KEY);
	}
	var STATUS_MAP = {
		ANIME: {
			CURRENT: "watching",
			COMPLETED: "completed",
			PAUSED: "on_hold",
			DROPPED: "dropped",
			PLANNING: "plan_to_watch",
			REPEATING: "watching"
		},
		MANGA: {
			CURRENT: "reading",
			COMPLETED: "completed",
			PAUSED: "on_hold",
			DROPPED: "dropped",
			PLANNING: "plan_to_read",
			REPEATING: "reading"
		}
	};
	var PROGRESS_KEYS = [
		"num_watched_episodes",
		"num_chapters_read",
		"num_volumes_read"
	];
	function convertScore(score100) {
		if (!score100 || score100 <= 0) return 0;
		const mode = Settings.get("syncScoreRounding");
		return Math.max(1, Math.min(10, (mode === "ceil" ? Math.ceil : mode === "floor" ? Math.floor : Math.round)(Number(score100) / 10)));
	}
	var fuzzyToMalDate = (f) => f && f.year && f.month && f.day ? `${f.year}-${String(f.month).padStart(2, "0")}-${String(f.day).padStart(2, "0")}` : null;
	var count = (v) => Math.max(0, Math.floor(Number(v) || 0));
	var normText = (s) => String(s || "").replace(/\r\n?/g, "\n").trim();
	function buildPayload(type, e) {
		const status = STATUS_MAP[type][e.status];
		if (!status) return null;
		const anime = type === "ANIME";
		const p = { status };
		const score = convertScore(e.score);
		if (score > 0) p.score = score;
		p[anime ? "is_rewatching" : "is_rereading"] = e.status === "REPEATING" ? "true" : "false";
		if (anime) p.num_watched_episodes = count(e.progress);
		else {
			p.num_chapters_read = count(e.progress);
			if (count(e.progressVolumes) > 0) p.num_volumes_read = count(e.progressVolumes);
		}
		const start = fuzzyToMalDate(e.startedAt);
		const finish = fuzzyToMalDate(e.completedAt);
		if (start) p.start_date = start;
		if (finish) p.finish_date = finish;
		if (count(e.repeat) > 0) p[anime ? "num_times_rewatched" : "num_times_reread"] = count(e.repeat);
		const notes = normText(e.notes);
		if (notes) p.comments = notes.slice(0, 2e3);
		return p;
	}
	var malKey = (k) => k === "num_watched_episodes" ? "num_episodes_watched" : k;
	var normDate = (v) => v ? String(v).slice(0, 10) : null;
	var truthy = (v) => v === true || v === 1 || String(v).toLowerCase() === "true";
	var NUMERIC = [
		"score",
		"num_watched_episodes",
		"num_chapters_read",
		"num_volumes_read",
		"num_times_rewatched",
		"num_times_reread"
	];
	function fieldEquals(key, desired, actual) {
		if (key === "is_rewatching" || key === "is_rereading") return truthy(actual) === truthy(desired);
		if (key === "start_date" || key === "finish_date") return normDate(actual) === normDate(desired);
		if (key === "comments") return normText(actual) === normText(desired);
		if (NUMERIC.includes(key)) return Number(actual || 0) === Number(desired || 0);
		return String(actual ?? "") === String(desired ?? "");
	}
	function reconcile(type, entry, mal) {
		const desired = buildPayload(type, entry);
		if (!desired) return null;
		const anime = type === "ANIME";
		const pKey = anime ? "num_watched_episodes" : "num_chapters_read";
		const rKey = anime ? "num_times_rewatched" : "num_times_reread";
		const m = mal || {};
		const rewatches = Math.max(Number(desired[rKey]) || 0, Number(m[rKey]) || 0);
		if (rewatches > 0) desired[rKey] = rewatches;
		if (entry.status === "COMPLETED") {
			const completedCount = (key, total) => Number(total) > 0 ? Number(total) : Math.max(Number(desired[key]) || 0, Number(m[malKey(key)]) || 0);
			desired[pKey] = completedCount(pKey, m.__total);
			if (!anime) {
				const vols = completedCount("num_volumes_read", m.__totalVolumes);
				if (vols > 0) desired.num_volumes_read = vols;
				else delete desired.num_volumes_read;
			}
			if (!(desired[pKey] > 0)) delete desired[pKey];
		}
		if (!mal) return desired;
		const statusEq = fieldEquals("status", desired.status, m.status) || entry.status === "REPEATING" && truthy(m[anime ? "is_rewatching" : "is_rereading"]);
		const patch = {};
		for (const [k, v] of Object.entries(desired)) {
			if (k === "status") {
				if (!statusEq) patch.status = v;
				continue;
			}
			if (!statusEq && PROGRESS_KEYS.includes(k) || !fieldEquals(k, v, m[malKey(k)])) patch[k] = v;
		}
		return patch;
	}
	function fallbackPatch(type, patch, mal, tried) {
		if (!tried.has("dates")) {
			tried.add("dates");
			if ("start_date" in patch || "finish_date" in patch) {
				const out = { ...patch };
				delete out.start_date;
				delete out.finish_date;
				if (Object.keys(out).length) return out;
			}
		}
		if (!tried.has("cap")) {
			tried.add("cap");
			const caps = type === "ANIME" ? { num_watched_episodes: mal?.__total } : {
				num_chapters_read: mal?.__total,
				num_volumes_read: mal?.__totalVolumes
			};
			const out = { ...patch };
			let changed = false;
			for (const [k, cap] of Object.entries(caps)) if (cap > 0 && Number(out[k]) > cap) {
				out[k] = cap;
				changed = true;
			}
			if (changed) return out;
		}
		return null;
	}
	var STATUS_LABEL = {
		watching: "Watching",
		reading: "Reading",
		completed: "Completed",
		on_hold: "On hold",
		dropped: "Dropped",
		plan_to_watch: "Plan to watch",
		plan_to_read: "Plan to read"
	};
	function describePatch(type, patch) {
		const parts = [];
		if ("status" in patch) parts.push(`status: ${STATUS_LABEL[patch.status] || patch.status}`);
		if ("score" in patch) parts.push(`score: ${patch.score}/10`);
		const progressKey = type === "ANIME" ? "num_watched_episodes" : "num_chapters_read";
		if (progressKey in patch) parts.push(`${type === "ANIME" ? "episodes" : "chapters"}: ${patch[progressKey]}`);
		if (type === "MANGA" && "num_volumes_read" in patch) parts.push(`volumes: ${patch.num_volumes_read}`);
		if ("num_times_rewatched" in patch) parts.push(`rewatches: ${patch.num_times_rewatched}`);
		if ("num_times_reread" in patch) parts.push(`rereads: ${patch.num_times_reread}`);
		if ("start_date" in patch) parts.push(`start date: ${patch.start_date}`);
		if ("finish_date" in patch) parts.push(`finish date: ${patch.finish_date}`);
		if ("comments" in patch) parts.push("notes");
		return parts.join("; ") || "MAL-normalised fields";
	}
	var ID_MISS_TTL_MS = 6048e5;
	var typeLabel$1 = (t) => t === "ANIME" ? "Anime" : "Manga";
	function buildTitleIndex(mal) {
		const idx = new Map();
		for (const [id, st] of Object.entries(mal)) {
			const t = strictTitle(st?.__malTitle);
			if (!t) continue;
			idx.set(t, idx.has(t) && idx.get(t) !== Number(id) ? -1 : Number(id));
		}
		return idx;
	}
	function localMatch(entry, idx) {
		let match = null;
		for (const t of entry.titles) {
			const id = idx.get(t);
			if (id == null) continue;
			if (id === -1 || match && match !== id) return null;
			match = id;
		}
		return match;
	}
	function cachedId(type, entry) {
		const c = stores[type].ids.data[entry.mediaId];
		const fresh = !!c && Date.now() - c.t < ID_MISS_TTL_MS;
		if (entry.idMal) return fresh && c.bad === entry.idMal ? 0 : entry.idMal;
		if (c && c.m > 0) return c.m;
		return fresh ? 0 : void 0;
	}
	function rememberId(type, mediaId, malId, bad) {
		if (!mediaId) return;
		const rec = {
			m: malId || 0,
			t: Date.now()
		};
		if (bad) rec.bad = bad;
		stores[type].ids.data[mediaId] = rec;
		stores[type].ids.save();
	}
	async function runPool(items, worker, concurrency) {
		let i = 0;
		let failure = null;
		const lane = async () => {
			while (!failure && i < items.length) {
				const n = i++;
				try {
					await worker(items[n], n);
				} catch (e) {
					failure = failure || e;
				}
			}
		};
		await Promise.all(Array.from({ length: Math.min(concurrency, items.length) || 1 }, lane));
		if (failure) throw failure;
	}
	async function resolveTargets(type, entries, mal, c) {
		const idx = buildTitleIndex(mal);
		const targets = [];
		const pending = [];
		const unmatched = [];
		for (const entry of entries) {
			if (!entry.mediaId || !STATUS_MAP[type][entry.status]) {
				c.skipped++;
				markDone();
				continue;
			}
			const id = cachedId(type, entry);
			if (id !== void 0 && id > 0) {
				targets.push({
					entry,
					malId: id,
					explicit: id === entry.idMal
				});
				continue;
			}
			if (id === 0) {
				c.unmatched++;
				markDone();
				continue;
			}
			const local = localMatch(entry, idx);
			if (local && local > 0) {
				rememberId(type, entry.mediaId, local);
				targets.push({
					entry,
					malId: local,
					explicit: false
				});
				continue;
			}
			pending.push(entry);
		}
		await runPool(pending, async (entry) => {
			let id = 0;
			try {
				id = await searchMalId(type, entry);
			} catch (e) {
				if (e.auth || e.cancelled) throw e;
				c.transient++;
				markDone();
				log(`${typeLabel$1(type)}: could not look up "${entry.title.slice(0, 45)}" on MAL: ${e.message}. Will retry on a later sync.`, "warn");
				return;
			}
			rememberId(type, entry.mediaId, id);
			if (id > 0) targets.push({
				entry,
				malId: id,
				explicit: false
			});
			else {
				c.unmatched++;
				unmatched.push(entry.title);
				markDone();
			}
		}, 3);
		if (unmatched.length) log(`${typeLabel$1(type)}: no confident MAL match for ${unmatched.length} title(s). Skipped: ${unmatched.slice(0, 5).map((t) => `"${t.slice(0, 30)}"`).join(", ")}${unmatched.length > 5 ? `, plus ${unmatched.length - 5} more` : ""}. Use Full Resync after adding/fixing MAL entries.`, "warn");
		return targets;
	}
	function dedupeTargets(type, targets, c) {
		const best = new Map();
		for (const t of targets) {
			const cur = best.get(t.malId);
			if (!cur) {
				best.set(t.malId, t);
				continue;
			}
			const better = Number(t.explicit) - Number(cur.explicit) || t.entry.updatedAt - cur.entry.updatedAt;
			const loser = better > 0 ? cur : t;
			if (better > 0) best.set(t.malId, t);
			c.conflicts++;
			markDone();
			log(`${typeLabel$1(type)}: "${loser.entry.title.slice(0, 40)}" and another AniList entry resolve to MAL ID ${loser.malId}; only one can be synced, so the preferred entry wins.`, "warn");
		}
		return [...best.values()].sort((a, b) => b.entry.updatedAt - a.entry.updatedAt);
	}
	hooks.checkCancel = checkCancel;
	var FULL_COMPARE_MS = 6048e5;
	var BREAKER_MAX_TRIPS = 3;
	var RETRY_AFTER_FAILURE_MS = 6e5;
	var LIST_PATH_RE$1 = /^\/user\/[^/]+\/(anime|manga)list/;
	var typeLabel = (t) => t === "ANIME" ? "Anime" : "Manga";
	var ENTRY_FIELDS = "status score(format: POINT_100) progress progressVolumes repeat notes updatedAt startedAt { year month day } completedAt { year month day }";
	var MEDIA_FIELDS = "id idMal startDate { year } synonyms title { userPreferred english romaji native }";
	var toEntry = (row, media) => {
		const t = media?.title || {};
		return {
			...row,
			mediaId: Number(media?.id) || 0,
			idMal: Number(media?.idMal) || 0,
			title: t.userPreferred || t.romaji || t.english || String(media?.id || ""),
			queryTitles: [...new Set([
				t.userPreferred,
				t.romaji,
				t.english
			].map((s) => String(s || "").trim()).filter(Boolean))],
			titles: [...new Set([
				t.userPreferred,
				t.english,
				t.romaji,
				t.native,
				...media?.synonyms || []
			].map(strictTitle).filter(Boolean))],
			startYear: Number(media?.startDate?.year) || 0,
			updatedAt: Number(row.updatedAt) || 0
		};
	};
	async function alFetchIncremental(userId, type, since) {
		const q = `query ($userId: Int, $type: MediaType, $page: Int) { Page(page: $page, perPage: 50) {
    pageInfo { hasNextPage } mediaList(userId: $userId, type: $type, sort: UPDATED_TIME_DESC) { ${ENTRY_FIELDS} media { ${MEDIA_FIELDS} } } } }`;
		const out = [];
		for (let page = 1; page <= 400; page++) {
			checkCancel();
			const p = (await AniList.query(q, {
				userId,
				type,
				page
			}))?.Page;
			let stop = false;
			for (const row of p?.mediaList || []) {
				if ((Number(row.updatedAt) || 0) < since) {
					stop = true;
					break;
				}
				out.push(toEntry(row, row.media));
			}
			if (stop || !p?.pageInfo?.hasNextPage) break;
		}
		return out;
	}
	async function alFetchAll(userId, type) {
		const q = `query ($userId: Int, $type: MediaType, $chunk: Int, $perChunk: Int) {
    MediaListCollection(userId: $userId, type: $type, chunk: $chunk, perChunk: $perChunk) { hasNextChunk lists { entries { ${ENTRY_FIELDS} media { ${MEDIA_FIELDS} } } } } }`;
		const out = [];
		const seen = new Set();
		for (let chunk = 1; chunk <= 100; chunk++) {
			checkCancel();
			const c = (await AniList.query(q, {
				userId,
				type,
				chunk,
				perChunk: 500
			}))?.MediaListCollection;
			for (const list of c?.lists || []) for (const row of list.entries || []) {
				const e = toEntry(row, row.media);
				if (!e.mediaId || seen.has(e.mediaId)) continue;
				seen.add(e.mediaId);
				out.push(e);
			}
			if (!c?.hasNextChunk) return out;
		}
		throw new Error("AniList collection exceeded the 100-chunk safety limit.");
	}
	var isTransient = (e) => !(e && (e.status === 400 || e.status === 404 || e.status === 403 && !e.html));
	async function pushJob(type, { entry, malId, patch }, mal, c) {
		const settled = stores[type].settled;
		try {
			await breaker.wait(checkCancel);
			checkCancel();
			if (breaker.trips >= BREAKER_MAX_TRIPS) {
				const e = new Error("MAL keeps failing — stopping this run; it will retry automatically.");
				e.abort = true;
				throw e;
			}
			let sent = patch;
			let res;
			const tried = new Set();
			for (;;) try {
				res = await malUpdateEntry(type, malId, sent);
				break;
			} catch (e) {
				const alt = e.status === 400 ? fallbackPatch(type, sent, mal[malId], tried) : null;
				if (!alt) throw e;
				const removedDates = ["start_date", "finish_date"].some((k) => k in sent && !(k in alt));
				const cappedKeys = Object.keys(alt).filter((k) => PROGRESS_KEYS.includes(k) && Number(alt[k]) < Number(sent[k]));
				const recovery = cappedKeys.length ? `retrying with ${cappedKeys.map((k) => `${k.replace("num_watched_episodes", "episode count").replace("num_chapters_read", "chapter count").replace("num_volumes_read", "volume count")} capped to ${alt[k]} (MAL's listed total)`).join(", ")}` : removedDates ? "retrying without the optional start/finish dates" : "retrying with a reduced update";
				log(`${typeLabel(type)}: MAL rejected the update for "${entry.title.slice(0, 45)}" (HTTP 400); ${recovery}.`, "warn");
				sent = alt;
			}
			let stored = null;
			try {
				stored = JSON.parse(res.responseText);
			} catch (_) {}
			const base = mal[malId] || {
				__total: 0,
				__totalVolumes: 0,
				__malTitle: ""
			};
			const applied = Object.fromEntries(Object.entries(sent).map(([k, v]) => [malKey(k), v]));
			const echoed = stored && typeof stored === "object" ? stored : {};
			mal[malId] = {
				...base,
				...applied,
				...echoed
			};
			const residual = stored ? reconcile(type, entry, mal[malId]) : {};
			if (residual && Object.keys(residual).length) {
				settled.data[malId] = [
					entry.updatedAt,
					JSON.stringify(residual),
					Date.now()
				];
				log(`${typeLabel(type)}: MAL saved "${entry.title.slice(0, 55)}" but did not retain ${describePatch(type, residual)}. It may be normalising or rejecting that value; unchanged values are suppressed to avoid a write loop. Full Resync clears this suppression.`, "warn");
			} else delete settled.data[malId];
			settled.save();
			c.pushed++;
			log(`${typeLabel(type)}: updated "${entry.title.slice(0, 55)}" — ${describePatch(type, sent)}.`, "success");
			breaker.ok();
		} catch (e) {
			if (e.cancelled || e.auth || e.abort) throw e;
			if (isTransient(e)) {
				c.transient++;
				breaker.fail();
				log(`${typeLabel(type)}: "${entry.title.slice(0, 45)}" — temporary MAL error: ${e.message}. Will retry on the next sync.`, "warn");
			} else {
				c.permanent++;
				log(`${typeLabel(type)}: "${entry.title.slice(0, 45)}" — MAL rejected this update (${e.message}). It will be skipped until the AniList entry changes or Full Resync is run.`, "warn");
				settled.data[malId] = [
					entry.updatedAt,
					"dead",
					Date.now()
				];
				settled.save();
				if (e.status === 404) rememberId(type, entry.mediaId, 0, malId);
			}
		} finally {
			markDone();
		}
	}
	function planJobs(type, targets, mal, c) {
		const settled = stores[type].settled.data;
		const jobs = [];
		for (const t of targets) {
			checkCancel();
			const patch = reconcile(type, t.entry, mal[t.malId]);
			if (!patch) {
				c.skipped++;
				markDone();
				continue;
			}
			if (!Object.keys(patch).length) {
				c.unchanged++;
				markDone();
				continue;
			}
			const s = settled[t.malId];
			if (s && s[0] === t.entry.updatedAt && (s[1] === "dead" || s[1] === JSON.stringify(patch))) {
				c.settled++;
				markDone();
				continue;
			}
			progress.changed++;
			jobs.push({
				...t,
				patch
			});
		}
		return jobs;
	}
	async function syncType(type, userId, full) {
		const label = typeLabel(type);
		const c = {
			pushed: 0,
			unchanged: 0,
			settled: 0,
			skipped: 0,
			unmatched: 0,
			conflicts: 0,
			transient: 0,
			permanent: 0
		};
		const lastSync = Number(store.get(`last_sync_${type}`, 0)) || 0;
		const fullPass = full || !lastSync || Date.now() - Number(store.get(`last_compare_${type}`, 0)) > FULL_COMPARE_MS;
		log(`${label}: starting ${fullPass ? "full library comparison" : "incremental sync"} — fetching AniList entries and your current MAL list.`);
		const [entries, mal] = await Promise.all([fullPass ? alFetchAll(userId, type) : alFetchIncremental(userId, type, lastSync), malFetchList(type)]);
		const newest = entries.reduce((m, e) => Math.max(m, e.updatedAt), 0);
		log(`${label}: found ${entries.length} AniList entr${entries.length === 1 ? "y" : "ies"} to check and ${Object.keys(mal).length} entr${Object.keys(mal).length === 1 ? "y" : "ies"} on MAL.`);
		progress.total += entries.length;
		progress.phase = "pushing";
		notifyProgress(true);
		await runPool(planJobs(type, dedupeTargets(type, await resolveTargets(type, entries, mal, c), c), mal, c), (job) => pushJob(type, job, mal, c), Math.max(2, Math.min(8, Math.round(malLimiter.rate / 20))));
		const ok = c.transient === 0;
		if (ok) {
			if (fullPass) {
				store.set(`last_compare_${type}`, Date.now());
				store.set(`last_sync_${type}`, Math.max(1, newest));
			} else if (newest) store.set(`last_sync_${type}`, Math.max(newest, lastSync));
			store.set(`last_run_${type}`, Math.floor(Date.now() / 1e3));
		}
		log(`${label}: finished — ${[
			`${c.pushed} updated`,
			`${c.unchanged + c.settled} already in sync`,
			c.unmatched && `${c.unmatched} unmatched`,
			c.skipped && `${c.skipped} skipped`,
			c.conflicts && `${c.conflicts} conflicts`,
			c.permanent && `${c.permanent} rejected`,
			c.transient && `${c.transient} failed (will retry)`
		].filter(Boolean).join(", ")}${c.transient ? "; this type will be retried" : ""}.`, c.transient || c.permanent || c.unmatched || c.conflicts ? "warn" : "success");
		return { ok };
	}
	var currentListType = () => {
		const m = location.pathname.match(LIST_PATH_RE$1);
		return m ? m[1].toUpperCase() : null;
	};
	async function confirmDecimalScores() {
		if ((await tryOr(() => AniList.viewer()))?.scoreFormat !== "POINT_10_DECIMAL") return true;
		const mode = Settings.get("syncScoreRounding");
		return confirm(`Decimal scores detected on AniList.\n\nMAL uses whole-number scores, so your decimal scores will be converted using: ${{
			ceil: "Ceil (always up)",
			round: "Round (.1–.4 down, .5–.9 up)",
			floor: "Floor (always down)"
		}[mode]}.\n${{
			ceil: "7.4 → 8 and 7.5 → 8",
			round: "7.4 → 7 and 7.5 → 8",
			floor: "7.4 → 7 and 7.5 → 7"
		}[mode]}.\n\nThis will affect the scores written to MAL during this first sync.\n\nContinue with the first sync?`);
	}
	function handleAuthFailure(e) {
		if (e.auth === "AniList") clearAniListAuth();
		else clearMalAuth();
		log(`⚠ ${e.message}`);
	}
	async function runSync(types = [...TYPES], opts = {}) {
		if (syncStatus.syncing) return log("Sync already running.");
		if (!store.get("al_token") || !store.get("mal_token")) return log("Connect both AniList and MAL first.");
		if (navigator.onLine === false) return log("You appear to be offline; sync skipped.");
		syncStatus.syncing = true;
		syncStatus.cancelled = false;
		if (!await acquireLock()) {
			syncStatus.syncing = false;
			return log("Another tab is already syncing, skipped.");
		}
		breaker.reset();
		store.set("sync_onboarded", true);
		Object.assign(progress, {
			phase: "fetching",
			done: 0,
			total: 0,
			changed: 0
		});
		notifyState();
		const startedAt = Date.now();
		let allOk = false;
		try {
			const viewer = await AniList.viewer();
			if (!viewer) throw {
				auth: "AniList",
				message: "AniList is not connected."
			};
			const me = await malWhoAmI();
			const account = `${viewer.id}:${me.id}`;
			const prev = store.get("sync_account", null);
			if (prev && prev !== account) {
				log("Connected account changed. Resetting sync watermarks and per-account suppression state.", "warn");
				resetAccountState();
			}
			store.set("sync_account", account);
			if (opts.full) for (const t of types) clearCache(stores[t].settled);
			const results = await Promise.allSettled(types.map((t) => syncType(t, viewer.id, !!opts.full)));
			const fatal = results.find((r) => r.status === "rejected" && (r.reason?.auth || r.reason?.abort));
			for (const r of results) {
				if (r.status !== "rejected") continue;
				const e = r.reason || {};
				if (e.cancelled) log("Sync stopped after the current request finished.", "warn");
				else if (!e.auth) log(`Sync could not finish: ${e.message || e}`, "error");
			}
			if (fatal) {
				if (fatal.reason.auth) handleAuthFailure(fatal.reason);
				else log(`Sync stopped: ${fatal.reason.message}`, "error");
			}
			allOk = results.every((r) => r.status === "fulfilled" && r.value.ok);
			if (allOk) {
				store.del("sync_retry_at");
				log(`Synced in ${((Date.now() - startedAt) / 1e3).toFixed(1)}s`);
			} else if (!syncStatus.cancelled) store.set("sync_retry_at", Date.now() + RETRY_AFTER_FAILURE_MS);
		} catch (e) {
			if (e.auth) handleAuthFailure(e);
			else log("Sync could not finish: " + (e.message || e), "error");
			if (!e.auth && !syncStatus.cancelled) store.set("sync_retry_at", Date.now() + RETRY_AFTER_FAILURE_MS);
		} finally {
			for (const t of types) {
				stores[t].ids.save();
				stores[t].settled.save();
			}
			releaseLock();
			syncStatus.syncing = false;
			syncStatus.cancelled = false;
			progress.phase = "idle";
			notifyState();
		}
	}
	async function startManualSync() {
		if (syncStatus.syncing) return;
		const pageType = currentListType();
		const types = pageType ? [pageType] : [...TYPES];
		if (types.some((t) => !store.get(`last_sync_${t}`, 0)) && !await confirmDecimalScores()) return log("First sync cancelled.");
		runSync(types);
	}
	async function fullResync() {
		if (syncStatus.syncing) return;
		if (!store.get("sync_onboarded", false) && !await confirmDecimalScores()) return log("Full resync cancelled.");
		for (const t of TYPES) clearCache(stores[t].ids);
		log("Full Resync started: checking the entire AniList library and clearing cached match/suppression decisions.");
		runSync([...TYPES], { full: true });
	}
	function maybeAutoSync() {
		if (!Settings.get("syncEnabled") || syncStatus.syncing || Date.now() < syncStatus.autoSyncRetryAfter || navigator.onLine === false) return;
		if (!store.get("al_token") || !store.get("mal_token") || !store.get("sync_onboarded", false)) return;
		const runs = TYPES.map((t) => Number(store.get(`last_run_${t}`, 0)) || 0);
		const last = Math.min(...runs);
		if (!(last > 0)) return;
		const hours = Settings.get("syncIntervalHours");
		const retryAt = Number(store.get("sync_retry_at", 0)) || 0;
		if (retryAt ? Date.now() >= retryAt : Date.now() - last * 1e3 >= hours * 36e5) {
			log(retryAt ? "Auto-sync: retrying after an earlier failure…" : `Auto-sync: ${hours}h interval reached…`);
			syncStatus.autoSyncRetryAfter = Date.now() + 3e5;
			runSync([...TYPES]);
		}
	}
	addStyle("almal-style", `
  #almal-panel{box-sizing:border-box;width:100%;margin-top:12px;padding:12px;border-radius:4px;background:rgb(var(--color-foreground));color:rgb(var(--color-text));font-size:13px;line-height:1.45}
  #almal-panel *{box-sizing:border-box}
  #almal-panel :focus-visible{outline:2px solid rgb(var(--color-blue));outline-offset:2px}
  .almal-head{display:flex;justify-content:center;margin-bottom:12px}
  .almal-flow{display:flex;align-items:center;gap:8px;min-width:0}
  .almal-arrow{flex:0 0 auto;color:rgb(var(--color-text-lighter));transition:color .2s,opacity .2s}
  .almal-flow--idle .almal-arrow{opacity:.4}
  .almal-flow--busy .almal-arrow{color:rgb(var(--color-blue))}
  .almal-flow--busy .almal-arrow-line{stroke-dasharray:4 5;animation:almal-flow .6s linear infinite}
  @keyframes almal-flow{to{stroke-dashoffset:-9}}
  .almal-chip{display:inline-flex;align-items:center;justify-content:center;min-width:34px;height:24px;padding:0 7px;border-radius:5px;color:#fff;font-size:11px;font-weight:800;letter-spacing:.02em;transition:opacity .2s}
  .almal-chip--lg{min-width:40px;height:28px;font-size:12px}
  .almal-chip.is-off{opacity:.4}
  .almal-chip--al{background:#3db4f2}
  .almal-chip--mal{background:#2e51a2}
  .almal-chip--logo{min-width:0;padding:0;background:none}
  .almal-logo{display:block;width:24px;height:24px;border-radius:6px;object-fit:contain}
  .almal-chip--lg .almal-logo{width:30px;height:30px}

  .almal-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:38px;padding:0 14px;border:0;border-radius:4px;background:rgba(var(--color-text),.07);color:rgb(var(--color-text));font:inherit;font-size:13px;font-weight:600;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:filter .15s,background .15s}
  .almal-btn:hover:not(:disabled){filter:brightness(1.12)}
  .almal-btn:disabled{opacity:.55;cursor:default}
  .almal-btn--primary{background:rgb(var(--color-blue));color:#fff}
  .almal-btn--primary:disabled{opacity:.75}
  .almal-btn--grow{flex:1 1 0;min-width:0;gap:5px;padding:0 8px;white-space:nowrap;overflow:hidden}
  .almal-btn--grow span{min-width:0;overflow:hidden;text-overflow:ellipsis}
  .almal-btn--icon{flex:0 0 34px;width:34px;min-width:34px;padding:0;color:rgb(var(--color-text-lighter))}
  .almal-btn--icon.is-on{background:rgba(var(--color-blue),.18);color:rgb(var(--color-blue))}
  .almal-btn--danger{color:rgb(var(--color-red,224,85,85))}
  .almal-btn--sm{min-height:32px;padding:0 12px;font-size:12px}
  .almal-btn--block{width:100%}
  .almal-actions{display:flex;gap:6px;width:100%;min-width:0}

  .almal-intro{margin:0 0 10px;color:rgb(var(--color-text-lighter));font-size:12px}
  .almal-conn{display:grid;gap:8px}
  .almal-conn-item{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;padding:10px;border-radius:4px;background:rgb(var(--color-background))}
  .almal-conn-row{display:flex;align-items:center;gap:10px}
  .almal-conn-name{display:flex;flex-direction:column;flex:1;min-width:0;font-weight:600}
  .almal-ok{display:inline-flex;align-items:center;gap:4px;color:rgb(var(--color-green));font-size:11px;font-weight:600}
  .almal-manual{display:flex;gap:6px}
  .almal-manual input{flex:1;min-width:0;height:34px;padding:0 10px;border:1px solid rgba(var(--color-text-lighter),.22);border-radius:4px;background:rgb(var(--color-foreground));color:rgb(var(--color-text));font:inherit;font-size:12px}
  .almal-manual input:focus{outline:none;border-color:rgb(var(--color-blue))}
  .almal-hint{margin-top:10px;color:rgb(var(--color-text-lighter));font-size:12px}
  .almal-hint:empty{display:none}
  .almal-foot{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 12px;margin-top:8px}
  .almal-link{padding:4px 0;border:0;background:none;color:rgb(var(--color-text-lighter));font:inherit;font-size:12px;cursor:pointer}
  .almal-link:hover{color:rgb(var(--color-blue))}

  .almal-progress{height:4px;margin:12px 0 6px;border-radius:2px;background:rgba(var(--color-text),.09);overflow:hidden}
  #almal-progress-fill{height:100%;width:0%;border-radius:2px;background:rgb(var(--color-blue));transition:width .25s ease}
  #almal-progress-fill.indeterminate{width:40%!important;animation:almal-indeterminate 1.1s ease-in-out infinite}
  @keyframes almal-indeterminate{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}
  #almal-progress-text{color:rgb(var(--color-text-lighter));font-size:12px}
  .almal-meta{display:grid;gap:3px;margin-top:10px;color:rgb(var(--color-text-lighter));font-size:12px;text-align:center}
  .almal-meta-row{white-space:nowrap}
  .almal-meta-row time{color:rgb(var(--color-text))}

  #almal-api-limit-warning{margin-top:10px;padding:8px 10px;border-radius:4px;border-left:3px solid rgb(var(--color-red,224,85,85));background:rgba(var(--color-red,224,85,85),.1);font-size:12px;line-height:1.45}
  #almal-log{max-height:220px;margin-top:10px;padding:8px 10px;border-radius:4px;background:rgb(var(--color-background));color:rgb(var(--color-text-lighter));font:11px/1.55 SFMono-Regular,Consolas,Menlo,monospace;white-space:pre-wrap;overflow-wrap:anywhere;overflow-y:auto}

  @media (pointer:coarse){
    .almal-btn{min-height:44px}
    .almal-btn--icon{flex-basis:44px;width:44px;min-width:44px}
    .almal-btn--sm{min-height:40px}
    .almal-manual input{height:40px;font-size:16px}
    .almal-link{padding:8px 0}
  }
  @media (prefers-reduced-motion:reduce){.almal-arrow-line,#almal-progress-fill.indeterminate{animation:none}}`);
	var ui = {
		manual: false,
		showLogs: false
	};
	var progressTimer = 0;
	function updateProgressUI(force = false) {
		if (!force) {
			if (!progressTimer) progressTimer = setTimeout(() => {
				progressTimer = 0;
				updateProgressUI(true);
			}, 120);
			return;
		}
		const fill = document.getElementById("almal-progress-fill");
		const text = document.getElementById("almal-progress-text");
		renderRateLimitWarning(document.getElementById("almal-panel"));
		if (!fill || !text) return;
		if (progress.phase === "fetching") {
			fill.style.width = "100%";
			fill.classList.add("indeterminate");
			text.textContent = "Checking AniList and MAL for changes…";
		} else if (progress.phase === "pushing") {
			fill.classList.remove("indeterminate");
			fill.style.width = (progress.total ? Math.round(progress.done / progress.total * 100) : 100) + "%";
			text.textContent = `Updating MAL: ${progress.done} / ${progress.total} checked (${progress.changed} changes)`;
		}
	}
	function renderRateLimitWarning(panelEl) {
		if (!panelEl) return;
		const now = Date.now();
		const limited = [["AniList", AniList.resumeAt()], ["MAL", malLimiter.resumeAt]].filter(([, at]) => Number(at) > now);
		let warn = panelEl.querySelector("#almal-api-limit-warning");
		if (!limited.length) {
			warn?.remove();
			return;
		}
		if (!warn) {
			warn = document.createElement("div");
			warn.id = "almal-api-limit-warning";
			const logBox = panelEl.querySelector("#almal-log");
			if (logBox) logBox.before(warn);
			else panelEl.appendChild(warn);
		}
		warn.innerHTML = limited.map(([name, at]) => `<b>${name} API limit reached.</b> Requests resume in <b>${Math.ceil((Number(at) - now) / 1e3)}s</b>.`).join("<br>");
		clearTimeout(panelEl._limitTimer);
		panelEl._limitTimer = setTimeout(() => renderRateLimitWarning(panelEl), 1e3);
	}
	var LOGOS = {
		al: {
			src: "https://anilist.co/img/icons/android-chrome-512x512.png",
			alt: "https://anilist.co/img/icons/favicon-32x32.png"
		},
		mal: {
			src: "https://cdn.myanimelist.net/img/sp/icon/apple-touch-icon-256.png",
			alt: "https://myanimelist.net/images/favicon.ico"
		}
	};
	var chip = (svc, large, off) => `<span class="almal-chip almal-chip--${svc} almal-chip--logo${large ? " almal-chip--lg" : ""}${off ? " is-off" : ""}" aria-hidden="true"><img class="almal-logo" src="${LOGOS[svc].src}" alt="" decoding="async" data-alt="${LOGOS[svc].alt}" data-fallback="${svc === "al" ? "AL" : "MAL"}"></span>`;
	var ARROW = "<svg class=\"almal-arrow\" viewBox=\"0 0 40 16\" width=\"40\" height=\"16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><line class=\"almal-arrow-line\" x1=\"2\" y1=\"8\" x2=\"34\" y2=\"8\"/><polyline points=\"30 3 36 8 30 13\"/></svg>";
	function ago(sec) {
		if (!sec) return "never";
		const s = Math.max(0, Math.floor(Date.now() / 1e3 - sec));
		if (s < 45) return "just now";
		if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
		if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
		return `${Math.floor(s / 86400)} d ago`;
	}
	var timeEl = (sec) => `<time data-ts="${sec || 0}" title="${sec ? esc(new Date(sec * 1e3).toLocaleString()) : ""}">${ago(sec)}</time>`;
	var refreshTimes = () => document.querySelectorAll("#almal-panel time[data-ts]").forEach((el) => {
		el.textContent = ago(Number(el.dataset.ts));
	});
	function connItem(svc, connected) {
		const name = svc === "al" ? "AniList" : "MyAnimeList";
		const what = svc === "al" ? "access token" : "authorization code";
		const manual = ui.manual && !connected ? `<div class="almal-manual"><input id="almal-${svc}-manual" type="text" placeholder="Paste ${svc === "al" ? "token" : "code"}" aria-label="${name} ${what}" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="almal-btn almal-btn--sm" data-act="${svc}-manual-save">Save</button></div>` : "";
		const status = connected ? `<span class="almal-ok">${icon("check", 12)}Connected</span>` : "";
		const connect = connected ? "" : `<button class="almal-btn almal-btn--primary almal-btn--sm almal-btn--block" data-act="${svc}-connect">Connect ${name}</button>`;
		return `<div class="almal-conn-item"><div class="almal-conn-row">${chip(svc, true)}<span class="almal-conn-name"><span>${name}</span>${status}</span></div>${connect}${manual}</div>`;
	}
	function renderPanel() {
		const panelEl = document.getElementById("almal-panel");
		if (!panelEl) return;
		const alOk = !!store.get("al_token", null);
		const malOk = !!store.get("mal_token", null);
		const ready = alOk && malOk;
		const tone = syncStatus.syncing ? "busy" : ready ? "ok" : "idle";
		let html = `<div class="almal-head"><div class="almal-flow almal-flow--${tone}" role="img" aria-label="${{
			busy: "Syncing from AniList to MyAnimeList",
			ok: "AniList to MyAnimeList sync",
			idle: "Connect both accounts to sync"
		}[tone]}">${chip("al", false, !alOk)}${ARROW}${chip("mal", false, !malOk)}</div></div>`;
		if (ready) {
			const t = currentListType();
			const rows = (t ? [[t, "Last sync"]] : [["ANIME", "Anime sync"], ["MANGA", "Manga sync"]]).map(([type, label]) => `<div class="almal-meta-row">${label}: ${timeEl(store.get("last_run_" + type, 0))}</div>`).join("");
			html += `<div class="almal-actions">
        ${syncStatus.syncing ? `<button class="almal-btn almal-btn--icon almal-btn--danger" data-act="stop" ${syncStatus.cancelled ? "disabled" : ""} aria-label="${syncStatus.cancelled ? "Stopping" : "Stop sync"}" title="${syncStatus.cancelled ? "Stopping…" : "Stop sync"}">${icon("stop", 16)}</button>` : `<button class="almal-btn almal-btn--icon" data-act="resync" aria-label="Full resync" title="Full resync">${icon("resync", 16)}</button>`}
        <button class="almal-btn almal-btn--primary almal-btn--grow" data-act="sync" ${syncStatus.syncing ? "disabled" : ""}><span>${syncStatus.syncing ? "Syncing…" : "Sync"}</span></button>
        <button class="almal-btn almal-btn--icon${ui.showLogs ? " is-on" : ""}" data-act="logs" aria-label="Show logs" aria-pressed="${ui.showLogs}" title="Logs">${icon("list", 16)}</button>
      </div>`;
			if (syncStatus.syncing) html += "<div class=\"almal-progress\" role=\"progressbar\" aria-label=\"Sync progress\"><div id=\"almal-progress-fill\"></div></div><div id=\"almal-progress-text\">Starting…</div>";
			html += `<div class="almal-meta">${rows}</div>`;
		} else html += `<p class="almal-intro">Connect both accounts to copy your AniList list to MyAnimeList.</p>
      <div class="almal-conn">${connItem("al", alOk)}${connItem("mal", malOk)}</div>
      <div id="almal-hint" class="almal-hint" role="status">${esc(lastNotice)}</div>
      <div class="almal-foot">
        <button class="almal-link" data-act="manual-toggle" aria-expanded="${ui.manual}">${ui.manual ? "Hide manual entry" : "Trouble connecting?"}</button>
        <button class="almal-link" data-act="logs" aria-expanded="${ui.showLogs}">${ui.showLogs ? "Hide logs" : "Logs"}</button>
      </div>`;
		if (ui.showLogs) html += "<div id=\"almal-log\"></div>";
		panelEl.innerHTML = html;
		panelEl.querySelectorAll("img.almal-logo").forEach((img) => img.addEventListener("error", () => {
			if (img.dataset.alt) {
				const next = img.dataset.alt;
				img.dataset.alt = "";
				img.src = next;
				return;
			}
			const c = img.parentElement;
			if (!c) return;
			c.classList.remove("almal-chip--logo");
			c.textContent = img.dataset.fallback || "";
		}));
		const logBox = document.getElementById("almal-log");
		if (logBox) logBox.textContent = logLines.join("\n") || "No activity yet.";
		if (syncStatus.syncing) updateProgressUI(true);
		renderRateLimitWarning(panelEl);
	}
	var ACTIONS = {
		"al-connect": alConnect,
		"mal-connect": malConnect,
		"manual-toggle": () => {
			ui.manual = !ui.manual;
			renderPanel();
		},
		"al-manual-save": () => {
			const token = document.getElementById("almal-al-manual")?.value.trim();
			if (!token) return;
			saveAniListToken(token);
			log("AniList connected (manual).");
			renderPanel();
		},
		"mal-manual-save": async () => {
			const code = document.getElementById("almal-mal-manual")?.value.trim();
			if (!code) return;
			try {
				await exchangeMalCode(code);
				log("MAL connected (manual).");
				renderPanel();
			} catch (e) {
				log("MAL token exchange failed: " + e.message);
			}
		},
		sync: startManualSync,
		stop: () => {
			if (syncStatus.syncing && !syncStatus.cancelled) {
				syncStatus.cancelled = true;
				log("Stop requested. Waiting for the current API requests to finish…", "warn");
				renderPanel();
			}
		},
		resync: () => {
			if (confirm("This will re-check your entire AniList library against MAL. Continue?")) fullResync();
		},
		logs: () => {
			ui.showLogs = !ui.showLogs;
			renderPanel();
		}
	};
	function findPanelAnchor() {
		const shuffle = document.querySelector("[title*=\"Random List Entry\" i], [aria-label*=\"Random List Entry\" i]");
		if (shuffle) return shuffle.parentElement || shuffle;
		const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
		for (let t; t = walker.nextNode();) {
			const el = t.parentElement;
			if (t.nodeValue?.trim() === "Sort" && el?.matches("div, section, aside") && el.parentElement) return el.parentElement;
		}
		return null;
	}
	var lastMountTry = 0;
	var retryTimer = 0;
	var selfLookup = false;
	var LIST_PATH_RE = /^\/user\/[^/]+\/(anime|manga)list/;
	var OWNER_RE = /^\/user\/([^/]+)\/(?:anime|manga)list/;
	var decodeName = (s) => {
		try {
			return decodeURIComponent(s);
		} catch (_) {
			return s;
		}
	};
	function navUser() {
		const href = document.querySelector("nav a[href^=\"/user/\"], .nav-wrap a[href^=\"/user/\"], .nav a[href^=\"/user/\"]")?.getAttribute("href");
		const m = href && href.match(/^\/user\/([^/?#]+)/);
		return m ? decodeName(m[1]) : "";
	}
	function isOwnList() {
		const owner = decodeName(location.pathname.match(OWNER_RE)?.[1] || "");
		if (!owner) return false;
		const me = store.get("al_username", null) || navUser();
		if (!me && store.get("al_token", null) && !selfLookup) {
			selfLookup = true;
			tryOr(() => AniList.viewer()).then(() => mountSoon());
		}
		return !!me && me.toLowerCase() === owner.toLowerCase();
	}
	var onListRoute = () => Settings.get("syncEnabled") && LIST_PATH_RE.test(location.pathname) && isOwnList();
	function mountPanel() {
		clearTimeout(retryTimer);
		if (!onListRoute() || document.getElementById("almal-panel")) return;
		lastMountTry = Date.now();
		const anchor = findPanelAnchor();
		if (!anchor) {
			retryTimer = setTimeout(mountSoon, 700);
			return;
		}
		const panelEl = document.createElement("div");
		panelEl.id = "almal-panel";
		panelEl.addEventListener("click", (e) => {
			const a = e.target?.closest("[data-act]");
			if (a && a.dataset.act && ACTIONS[a.dataset.act]) ACTIONS[a.dataset.act]();
		});
		panelEl.addEventListener("keydown", (e) => {
			const svc = {
				"almal-al-manual": "al",
				"almal-mal-manual": "mal"
			}[e.target?.id || ""];
			if (e.key === "Enter" && svc) ACTIONS[`${svc}-manual-save`]();
		});
		anchor.insertAdjacentElement("afterend", panelEl);
		renderPanel();
	}
	var mountSoon = debounce(mountPanel, 250);
	function initSyncPanel() {
		onProgressChange((force) => updateProgressUI(force));
		onStateChange(renderPanel);
		Core.onBodyMutation(() => {
			if (!document.getElementById("almal-panel") && Date.now() - lastMountTry > 1e3 && onListRoute()) mountSoon();
		});
		Core.onNavigate(() => {
			clearTimeout(retryTimer);
			document.getElementById("almal-panel")?.remove();
			mountSoon();
		});
		mountSoon();
		let lastAl = null;
		let lastMal = null;
		setInterval(() => {
			const al = !!store.get("al_token", null);
			const mal = !!store.get("mal_token", null);
			if (al !== lastAl || mal !== lastMal) {
				lastAl = al;
				lastMal = mal;
				renderPanel();
			}
			refreshTimes();
			if (onListRoute() && !document.getElementById("almal-panel")) mountSoon();
			maybeAutoSync();
		}, 2e3);
	}
	var ALL_KEYS = [
		"al_token",
		"al_username",
		"al_user_id",
		"al_score_format",
		"mal_code_verifier",
		"mal_token",
		"mal_refresh_token",
		"mal_expires_at",
		"sync_lock_heartbeat",
		"sync_onboarded",
		"sync_retry_at",
		"sync_account",
		...TYPES.flatMap((t) => [
			`last_sync_${t}`,
			`last_run_${t}`,
			`last_compare_${t}`
		])
	];
	defineFeature({
		id: "sync",
		key: "syncEnabled",
		section: "Sync",
		hosts: ["anilist.co", "myanimelist.net"],
		alwaysRun: true,
		legacy: ["syncEnabled", "syncOn"],
		title: "AniList → MyAnimeList Sync",
		help: "Enable syncing your AniList list to MyAnimeList, including automatic syncs.",
		options: [{
			key: "syncIntervalHours",
			type: "number",
			def: 6,
			min: 1,
			max: 720,
			legacy: [
				"syncIntervalHours",
				"autoSyncIntervalHours",
				"autoSyncInterval"
			],
			title: "Automatic Sync Interval",
			help: "How often automatic syncing checks and updates MyAnimeList. The minimum is 1 hour."
		}, {
			key: "syncScoreRounding",
			type: "select",
			def: "round",
			options: [
				["ceil", "Ceil"],
				["round", "Round"],
				["floor", "Floor"]
			],
			legacy: ["syncScoreRounding", "scoreConversionMethod"],
			title: "Decimal Score Conversion",
			help: "MyAnimeList only accepts whole-number scores. <b>Ceil</b> always rounds up (7.4 → 8), <b>Round</b> rounds normally (7.4 → 7, 7.5 → 8), and <b>Floor</b> always rounds down (7.9 → 7)."
		}]
	}, () => {
		if (store.get("sync_schema", 0) < 2) safe(() => {
			for (const k of [
				"mal_mirror_ANIME",
				"mal_mirror_MANGA",
				"retry_queue_ANIME",
				"retry_queue_MANGA",
				"force_mirror_refresh",
				"mal_idmap_ANIME",
				"mal_idmap_MANGA",
				"last_full_sync"
			]) store.del(k);
			for (const t of TYPES) if (!store.get(`last_run_${t}`, 0) && store.get(`last_sync_${t}`, 0)) store.set(`last_run_${t}`, store.get(`last_sync_${t}`, 0));
			store.set("sync_schema", 2);
		}, "sync schema upgrade");
		_GM_registerMenuCommand("🗑️ AL→MAL Sync: Reset all data", () => {
			ALL_KEYS.forEach((k) => store.del(k));
			for (const t of TYPES) {
				clearCache(stores[t].ids);
				clearCache(stores[t].settled);
			}
			log("All stored data cleared.");
			renderPanel();
		});
		_GM_registerMenuCommand("🔵 AL→MAL Sync: Disconnect AniList", () => {
			clearAniListAuth();
			log("AniList disconnected.");
			renderPanel();
		});
		_GM_registerMenuCommand("🟦 AL→MAL Sync: Disconnect MAL", () => {
			clearMalAuth();
			log("MAL disconnected.");
			renderPanel();
		});
		initSyncPanel();
	});
	defineModule("settings", null, initSettingsPage);
	Settings.migrate();
	safe(captureCredentials, "credential capture");
	startModules(true);
	Core.ready(() => startModules(false));
})();
