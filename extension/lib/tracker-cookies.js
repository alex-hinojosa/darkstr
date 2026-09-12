/**
 * Static known-tracker cookie domains (Duppel-aligned).
 * Used only for cookies.remove matching — not "cookie containers".
 *
 * Keep in sync with docs/PROOF-PIN.md residuals and the DNR blocklist
 * comments in rules/tracking.json (chaff sendBeacon destinations are
 * separate: network block rules must omit resource type "ping").
 */
"use strict";

/** @type {readonly string[]} */
const DARKSTR_TRACKER_COOKIE_DOMAINS = Object.freeze([
  "doubleclick.net",
  "facebook.com",
  "google-analytics.com",
  "googlesyndication.com",
  "criteo.com",
  "criteo.net",
  "adnxs.com",
  "taboola.com",
  "outbrain.com",
  "pubmatic.com",
  "rubiconproject.com",
  "openx.net",
  "casalemedia.com",
  "demdex.net",
  "bluekai.com",
  "sharethis.com",
  "addthis.com",
  "adsrvr.org",
  "mathtag.com",
  "exelator.com",
  "krxd.net",
  "hotjar.com",
  "fullstory.com",
  "mouseflow.com",
  "clarity.ms",
  "segment.com",
  "mixpanel.com",
  "amplitude.com",
  "scorecardresearch.com",
  "quantserve.com",
  "moatads.com",
  "bounceexchange.com",
]);

/**
 * Domains used by poisoner/bridge chaff sendBeacon.
 * DNR block rules must never include resourceTypes: ["ping"] for these
 * (and must not block facebook.com at all — Meta pixel path is facebook.com/tr/).
 */
const DARKSTR_CHAFF_BEACON_DOMAINS = Object.freeze([
  "google-analytics.com",
  "facebook.com",
]);

function normalizeCookieDomain(domain) {
  if (!domain || typeof domain !== "string") return "";
  return domain.replace(/^\./, "").toLowerCase();
}

function domainMatchesTrackerList(domain, list) {
  const d = normalizeCookieDomain(domain);
  if (!d) return false;
  const domains = list || DARKSTR_TRACKER_COOKIE_DOMAINS;
  return domains.some((td) => d === td || d.endsWith("." + td));
}

function isTrackerCookieDomain(domain) {
  return domainMatchesTrackerList(domain, DARKSTR_TRACKER_COOKIE_DOMAINS);
}

function isChaffBeaconDomain(domain) {
  return domainMatchesTrackerList(domain, DARKSTR_CHAFF_BEACON_DOMAINS);
}

/**
 * Build cookies.remove URL for a Cookie object-like record.
 * @param {{ domain: string, path?: string, secure?: boolean }} cookie
 */
function cookieRemoveUrl(cookie) {
  const domain = normalizeCookieDomain(cookie && cookie.domain);
  if (!domain) return "";
  const path = (cookie && cookie.path) || "/";
  const scheme = cookie && cookie.secure ? "https" : "http";
  return `${scheme}://${domain}${path}`;
}

/**
 * Pure filter: which cookies from a jar should be purged.
 * @param {Array<{ name: string, domain: string, path?: string, secure?: boolean }>} cookies
 */
function selectTrackerCookies(cookies) {
  if (!Array.isArray(cookies)) return [];
  return cookies.filter((c) => c && isTrackerCookieDomain(c.domain));
}

if (typeof globalThis !== "undefined") {
  globalThis.DARKSTR_TRACKER_COOKIE_DOMAINS = DARKSTR_TRACKER_COOKIE_DOMAINS;
  globalThis.DARKSTR_CHAFF_BEACON_DOMAINS = DARKSTR_CHAFF_BEACON_DOMAINS;
  globalThis.normalizeCookieDomain = normalizeCookieDomain;
  globalThis.domainMatchesTrackerList = domainMatchesTrackerList;
  globalThis.isTrackerCookieDomain = isTrackerCookieDomain;
  globalThis.isChaffBeaconDomain = isChaffBeaconDomain;
  globalThis.cookieRemoveUrl = cookieRemoveUrl;
  globalThis.selectTrackerCookies = selectTrackerCookies;
}
