/**
 * darkstr Phase 1 — eTLD+1 helpers for per-site Native-Compatible.
 * Ported from Duppel (minimal public-suffix set + last-two-label fallback).
 */
"use strict";

const MULTI_PART_SUFFIXES = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "org.au",
  "co.nz", "co.jp", "or.jp", "co.kr", "co.in", "co.za",
  "com.br", "org.br", "com.mx", "com.cn", "com.tw", "com.hk",
  "github.io", "herokuapp.com", "pages.dev", "workers.dev",
  "netlify.app", "vercel.app", "web.app", "firebaseapp.com",
  "cloudfront.net", "azurewebsites.net", "blob.core.windows.net",
  "co.id", "com.sg", "com.my", "co.th", "com.ar", "com.co",
]);

/**
 * Derive eTLD+1 from a hostname.
 * @param {string} hostname
 * @returns {string}
 */
function getETLD1(hostname) {
  if (!hostname || typeof hostname !== "string") return "";
  const host = hostname.replace(/\.+$/, "").toLowerCase();
  if (!host || host === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return host;
  }
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  const lastTwo = parts.slice(-2).join(".");
  if (MULTI_PART_SUFFIXES.has(lastTwo)) {
    return parts.length <= 3 ? host : parts.slice(-3).join(".");
  }
  return lastTwo;
}

/**
 * Extract hostname from a URL or pass through a bare hostname.
 * Avoids depending on URL in constrained sandboxes; URL used when present.
 * @param {string} urlOrHost
 * @returns {string}
 */
function hostnameFrom(urlOrHost) {
  if (!urlOrHost || typeof urlOrHost !== "string") return "";
  if (!/:\/\//.test(urlOrHost)) return urlOrHost;
  try {
    if (typeof URL !== "undefined") {
      return new URL(urlOrHost).hostname || "";
    }
  } catch (_) {
    /* fall through */
  }
  const m = urlOrHost.match(
    /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/(?:[^/@]+@)?(\[[^\]]+\]|[^/:?#]+)/
  );
  return m ? m[1] : "";
}

/**
 * Normalize a raw nativeCompatSites object from storage.
 * @param {unknown} raw
 * @returns {Record<string, true>}
 */
function normalizeNativeCompatSites(raw) {
  const out = Object.assign({}, {});
  if (!raw || typeof raw !== "object") return out;
  for (const key of Object.keys(raw)) {
    if (raw[key] === true && typeof key === "string" && key.length > 0) {
      out[key] = true;
    }
  }
  return out;
}

/**
 * @param {Record<string, true>} sites
 * @param {string} urlOrHost
 * @returns {boolean}
 */
function isNativeCompatSite(sites, urlOrHost) {
  if (!sites) return false;
  const hostname = hostnameFrom(urlOrHost);
  const etld1 = getETLD1(hostname);
  return !!(etld1 && sites[etld1] === true);
}

if (typeof globalThis !== "undefined") {
  globalThis.getETLD1 = getETLD1;
  globalThis.hostnameFrom = hostnameFrom;
  globalThis.normalizeNativeCompatSites = normalizeNativeCompatSites;
  globalThis.isNativeCompatSite = isNativeCompatSite;
  globalThis.DARKSTR_MULTI_PART_SUFFIXES = MULTI_PART_SUFFIXES;
}
