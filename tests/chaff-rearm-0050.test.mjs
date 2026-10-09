/**
 * 0050: chaff rearm (Rowan B6) — behavioural tests against the shipped
 * scheduler in patches/0050-files.
 *
 *   B6  `_onIntervalFire` schedules a batch and then re-arms the interval.
 *       The re-arm used `_cancelAll`, which also cancelled the batch it had
 *       just scheduled, so no chaff ever fired. The re-arm now replaces only
 *       the interval timer; pending batches survive and fire.
 *   Pending batches are still cancelled when chaff is disabled, the gate /
 *   level prefs change (refreshPlan) and on uninit — no leaked timers, and
 *   fired one-shot timers leave the pending list.
 *   Nothing else about chaff changes: schedules, endpoints and defaults are
 *   byte-identical to the 0024 scheduler outside the cancel/rearm code.
 * 0052: the scheduler now ships from patches/0052-files (diagnostics in
 * memory unless darkstr.debug.diagPrefs). These tests run with diagPrefs on so
 * they can keep observing the diag prefs; the last test runs with it off.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHIPPED = ["0058-files", "0057c-files", "0057-files", "0056-files", "0055-files", "0053r2-files", "0053-files", "0052-files", "0050-files"]
  .map((d) => join(root, "patches", d, "DarkstrChaffScheduler.sys.mjs"))
  .find((f) => existsSync(f));
const SOURCE = readFileSync(SHIPPED, "utf8");
// The pre-0050 re-arm (B6) recreated in memory, as a negative control that
// proves these tests discriminate.
const REARM_FIXED = "    this._cancelIntervalTimer();\n    const delayMs";
const REARM_B6 = "    this._cancelAll();\n    const delayMs";
assert.equal(SOURCE.split(REARM_FIXED).length, 2, "re-arm marker present once");
const B6_SOURCE = SOURCE.replace(REARM_FIXED, REARM_B6);

const ARMED = {
  "darkstr.mode": "pollution",
  "darkstr.nativeCompatible": false,
  "darkstr.nativePersonaHooks": true,
};
const ENDPOINTS = [
  "https://www.google-analytics.com/collect",
  "https://www.google-analytics.com/g/collect",
  "https://www.facebook.com/tr/",
];

/**
 * Load the scheduler in a fresh VM context.
 * mode "sim": Rowan's SIM-chaff-timers fixture (fake clock, fake nsITimer,
 *   Math.random fixed at 0.5, intercepted fetch).
 * mode "real": nsITimer backed by real Node timers (setTimeout/clearTimeout).
 */
function load({ source = SOURCE, mode = "sim", prefs = {}, random, diag = true } = {}) {
  let now = 0;
  const timers = [];
  const fetches = [];
  const observers = [];
  const store = new Map(Object.entries({ "darkstr.debug.diagPrefs": diag, ...prefs }));
  const api = {
    getStringPref: (k, d) => store.get(k) ?? d,
    getBoolPref: (k, d) => store.get(k) ?? d,
    setStringPref: (k, v) => store.set(k, v),
    setBoolPref: (k, v) => store.set(k, v),
    addObserver: (k, fn) => observers.push([k, fn]),
    removeObserver: (k, fn) => {
      const i = observers.findIndex(([a, b]) => a === k && b === fn);
      if (i !== -1) observers.splice(i, 1);
    },
  };
  const live = new Set(); // real-mode handles not yet fired/cancelled
  function makeTimer() {
    const t = {
      cancelled: false,
      fired: false,
      initWithCallback(cb, delay) {
        this.cb = cb;
        this.delay = delay;
        this.deadline = now + delay;
        if (mode === "real") {
          this.handle = setTimeout(() => {
            live.delete(this);
            this.fired = true;
            cb();
          }, delay);
          live.add(this);
        }
      },
      cancel() {
        this.cancelled = true;
        if (this.handle) {
          clearTimeout(this.handle);
          live.delete(this);
        }
      },
    };
    timers.push(t);
    return t;
  }
  const math = Object.create(Math);
  if (random !== undefined) math.random = () => random;
  const context = vm.createContext({
    Services: { prefs: api },
    Ci: { nsITimer: { TYPE_ONE_SHOT: 0 } },
    Cc: { "@mozilla.org/timer;1": { createInstance: makeTimer } },
    URLSearchParams,
    Date,
    console,
    Math: math,
    fetch: (url) => {
      fetches.push(url);
      return Promise.resolve({});
    },
  });
  vm.runInContext(
    source.replace("export var DarkstrChaffScheduler", "var DarkstrChaffScheduler"),
    context
  );
  const S = context.DarkstrChaffScheduler;
  const fire = (t) => {
    assert.equal(t.cancelled, false, "never fire a cancelled timer");
    now = t.deadline;
    t.fired = true;
    t.cb();
  };
  const setPref = (k, v) => {
    store.set(k, v);
    for (const [name, fn] of observers.slice()) {
      if (name === k) fn(null, "nsPref:changed", k);
    }
  };
  return { S, timers, fetches, store, fire, setPref, live, observers, now: () => now };
}

/** Rowan's SIM scenario, extended to also run the pending batch timers. */
function simScenario(level, source = SOURCE) {
  const env = load({ source, prefs: { ...ARMED, "darkstr.chaosLevel": level }, random: 0.5 });
  const { S, timers, fetches, fire, store } = env;
  S.init();
  const batchesPerInterval = [];
  for (let i = 0; i < 3; i++) {
    const before = fetches.length;
    fire(S._timer);
    // Run every surviving batch timer in deadline order (fake clock).
    const pending = timers
      .filter((t) => !t.cancelled && !t.fired && t !== S._timer)
      .sort((a, b) => a.deadline - b.deadline);
    for (const t of pending) fire(t);
    batchesPerInterval.push(fetches.length - before);
  }
  const cancelledBatch = timers.filter((t) => t.cancelled && !t.fired).length;
  const normalFetches = fetches.length;
  assert.equal(store.get("darkstr.chaff.schedulerArmed"), true);
  // Rowan's positive control: the production batch path with no re-arm.
  S._cancelAll();
  const ctrlStart = fetches.length;
  S._scheduleBatch(S.resolvePlan());
  for (const t of [...S._batchTimers]) fire(t);
  const positiveControlFetches = fetches.length - ctrlStart;
  const leftover = S._batchTimers.length;
  S.uninit();
  return {
    level,
    intervalsFired: 3,
    batchesPerInterval,
    cancelledBatch,
    normalFetches,
    positiveControlFetches,
    leftover,
    endpoints: [...new Set(fetches.map((u) => u.split("?")[0]))],
  };
}

test("B6 SIM (Rowan's fixture): ordinary intervals now fire the planned batch — loud 10 vs 10", () => {
  const expected = { quiet: 1, balanced: 2, loud: 10 };
  for (const level of ["quiet", "balanced", "loud"]) {
    const r = simScenario(level);
    assert.equal(r.positiveControlFetches, expected[level], `${level} control`);
    assert.deepEqual(
      r.batchesPerInterval,
      [expected[level], expected[level], expected[level]],
      `${level}: every interval fires its whole batch (== positive control)`
    );
    assert.equal(r.normalFetches, 3 * r.positiveControlFetches);
    assert.equal(r.cancelledBatch, 0, `${level}: re-arm cancels no batch timer`);
    assert.equal(r.leftover, 0, `${level}: fired timers leave the pending list`);
    for (const e of r.endpoints) assert.ok(ENDPOINTS.includes(e), `endpoint unchanged: ${e}`);
  }
});

test("B6 negative control: the pre-0050 re-arm still yields 0 fires (tests discriminate)", () => {
  for (const [level, n] of [["quiet", 3], ["balanced", 6], ["loud", 30]]) {
    const r = simScenario(level, B6_SOURCE);
    assert.equal(r.normalFetches, 0, `${level}: B6 cancels every batch`);
    assert.equal(r.cancelledBatch, n, `${level}: Rowan's cancelled count`);
    assert.equal(r.positiveControlFetches > 0, true);
  }
});

test("re-arm replaces only the interval timer; batch timers survive _armIntervalTimer", () => {
  const { S, timers } = load({ prefs: { ...ARMED, "darkstr.chaosLevel": "loud" }, random: 0.5 });
  S.init();
  const first = S._timer;
  S._onIntervalFire(); // called directly: `first` is still pending → replaced
  assert.equal(first.cancelled, true, "pending interval timer replaced by re-arm");
  assert.notEqual(S._timer, first, "a new interval timer was armed");
  assert.equal(S._batchTimers.length, 10);
  assert.ok(S._batchTimers.every((t) => !t.cancelled));
  const second = S._timer;
  S._armIntervalTimer(S.resolvePlan());
  assert.equal(second.cancelled, true, "previous interval timer replaced");
  assert.equal(S._batchTimers.length, 10, "pending batch untouched by re-arm");
  assert.ok(S._batchTimers.every((t) => !t.cancelled));
  assert.deepEqual(
    timers.filter((t) => t.cancelled),
    [first, second],
    "only the two replaced interval timers were ever cancelled"
  );
  S.uninit();
});

test("real timers: after the interval fires and re-arms, the batch fires", async () => {
  // Math.random 0 → loud batch of 5, stagger 500·(i+1) ms → last at 2.5 s.
  const env = load({
    mode: "real",
    prefs: { ...ARMED, "darkstr.chaosLevel": "loud" },
    random: 0,
  });
  const { S, fetches, live, store } = env;
  S.init();
  assert.equal(live.size, 1, "only the interval timer is armed after init");
  S._onIntervalFire(); // the real rearm path, real nsITimer-equivalents
  assert.equal(S._batchTimers.length, 5);
  assert.equal(live.size, 6, "5 batch timers + the re-armed interval timer");
  await new Promise((r) => setTimeout(r, 3200));
  assert.equal(fetches.length, 5, "every beacon of the batch fired");
  assert.equal(S._batchTimers.length, 0, "fired timers removed from the pending list");
  assert.equal(live.size, 1, "only the next interval timer remains");
  assert.match(store.get("darkstr.chaff.lastFireAt"), /;loud;5\/5;/);
  S.uninit();
  assert.equal(live.size, 0, "uninit leaves no live timer");
});

test("disabling chaff cancels the interval and every pending batch (real timers)", async () => {
  for (const [pref, value] of [
    ["darkstr.mode", "homogeneous"],
    ["darkstr.nativePersonaHooks", false],
    ["darkstr.nativeCompatible", true],
  ]) {
    const env = load({ mode: "real", prefs: { ...ARMED, "darkstr.chaosLevel": "loud" }, random: 0 });
    const { S, fetches, live, setPref, store } = env;
    S.init();
    S._onIntervalFire();
    assert.equal(live.size, 6);
    setPref(pref, value); // observer → refreshPlan → not armed
    assert.equal(store.get("darkstr.chaff.schedulerArmed"), false, pref);
    assert.equal(S._timer, null, `${pref}: interval timer cleared`);
    assert.equal(S._batchTimers.length, 0, `${pref}: pending list cleared`);
    assert.equal(live.size, 0, `${pref}: no live timer left`);
    await new Promise((r) => setTimeout(r, 700)); // past the first stagger
    assert.equal(fetches.length, 0, `${pref}: nothing fired after disable`);
    S.uninit();
  }
});

test("mode/level change and uninit cancel pending batches; a stray callback never fires", () => {
  const env = load({ prefs: { ...ARMED, "darkstr.chaosLevel": "loud" }, random: 0.5 });
  const { S, fetches, timers, setPref, observers } = env;
  S.init();
  S._onIntervalFire();
  const batch = [...S._batchTimers];
  assert.equal(batch.length, 10);
  // Level change while still armed: previous plan's batch is dropped and a
  // fresh interval armed (refreshPlan semantics unchanged from pre-0050).
  setPref("darkstr.chaosLevel", "quiet");
  assert.ok(batch.every((t) => t.cancelled), "level change cancels pending batch");
  assert.equal(S._batchTimers.length, 0);
  assert.ok(S._timer && !S._timer.cancelled, "still armed with a fresh interval");
  // A callback of a cancelled timer (should Gecko ever run one) is a no-op.
  batch[0].cb();
  assert.equal(fetches.length, 0);
  // Schedule again, then shut down.
  S._onIntervalFire();
  const batch2 = [...S._batchTimers];
  const interval = S._timer;
  assert.ok(batch2.length > 0);
  S.uninit();
  assert.ok(batch2.every((t) => t.cancelled), "uninit cancels pending batch");
  assert.equal(interval.cancelled, true, "uninit cancels interval");
  assert.equal(S._batchTimers.length, 0);
  assert.equal(S._timer, null);
  assert.equal(observers.length, 0, "pref observers removed");
  assert.equal(timers.filter((t) => !t.cancelled && !t.fired).length, 0, "no leaked timers");
});

test("defaults (homogeneous, hooks off) never arm or fire", () => {
  const env = load({ mode: "real", prefs: {} });
  const { S, fetches, live, store } = env;
  S.init();
  assert.equal(store.get("darkstr.chaff.schedulerArmed"), false);
  assert.equal(store.get("darkstr.chaff.lastPlan"), "balanced;idle");
  assert.equal(S._timer, null);
  assert.equal(live.size, 0);
  assert.equal(fetches.length, 0);
  S.uninit();
});

test("0050 diff is limited to the cancel/re-arm code (schedules, endpoints, payloads unchanged)", () => {
  for (const needle of [
    'quiet: { minMin: 8, maxMin: 20, batchMin: 1, batchMax: 1, staggerBase: 4000 }',
    'loud: { minMin: 1, maxMin: 3, batchMin: 5, batchMax: 15, staggerBase: 500 }',
    '"https://www.google-analytics.com/collect"',
    '"https://www.google-analytics.com/g/collect"',
    'const META_ENDPOINTS = ["https://www.facebook.com/tr/"];',
    'credentials: "omit"',
    'Math.floor((plan.intervalMinutes || 3) * 60 * 1000)',
  ]) {
    assert.ok(SOURCE.includes(needle), needle);
  }
  assert.ok(!/_armIntervalTimer\(plan\) \{\n\s*\/\/[^\n]*\n\s*this\._cancelAll\(\)/.test(SOURCE));
});

test("0052: diagPrefs off → chaff diagnostics stay in memory, nothing in prefs", () => {
  const env = load({ mode: "sim", prefs: { ...ARMED }, diag: false });
  const { S, store, fire, fetches } = env;
  S.init();
  fire(S._timer);
  for (const t of env.timers.filter((t) => !t.cancelled && !t.fired && t !== S._timer)) fire(t);
  assert.ok(fetches.length > 0, "chaff still fires");
  for (const k of [
    "darkstr.chaff.schedulerArmed",
    "darkstr.chaff.lastPlan",
    "darkstr.chaff.lastFireAt",
    "darkstr.chaff.lastBeaconKind",
  ]) {
    assert.equal(store.has(k), false, k);
  }
  const d = S.getDiagnostics();
  assert.equal(d["darkstr.chaff.schedulerArmed"], true);
  assert.equal(typeof d["darkstr.chaff.lastPlan"], "string");
  S.uninit();
});
