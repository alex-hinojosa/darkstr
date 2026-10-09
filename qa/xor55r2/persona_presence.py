#!/usr/bin/env python3
"""0055r2: the persona UA equals the real engine UA by design, so "UA != real UA" no longer tells whether a
persona was applied. APPLIED(nav) instead compares (platform, hardwareConcurrency, languages, timezone) with the
host's unpersonalized native tuple (Proof r2adapt, ported). No side effects on import except reading the env.

Native tuple = what an UNPERSONALIZED document shows under Pollution on the grading host (RFP/FPP off, so the
host's real platform / cores / languages / TZ), e.g. an armed run's first document (d1):
  1. env XOR_NATIVE_TUPLE: JSON ["MacIntel", 12, ["en-US", "en"], "America/Chicago"]
  2. otherwise the Mac Mini values Proof graded with (NATIVE_SOURCE == 'fallback-mini'; graders print it).
NOT the default-config baseline: that run has LibreWolf's RFP on (spoofed cores / TZ), so a persona-less
Pollution document would differ from it and wrongly count as "applied".
"""
import json, os

FALLBACK = ('MacIntel', 12, ('en-US', 'en'), 'America/Chicago')
NATIVE_T = FALLBACK
NATIVE_SOURCE = 'fallback-mini'
FIELDS = ('platform', 'hardwareConcurrency', 'languages', 'tz')


def _tuple(n):
    n = n or {}
    return (n.get('platform'), n.get('hardwareConcurrency'), tuple(n.get('languages') or []), n.get('tz'))


def set_native(t, source):
    global NATIVE_T, NATIVE_SOURCE
    p, c, l, z = t
    NATIVE_T = (p, c, tuple(l or []), z); NATIVE_SOURCE = source
    return NATIVE_T


def APPLIED(n):
    """True when the navigator record differs from the native tuple in platform, cores, languages or TZ."""
    return _tuple(n) != NATIVE_T


def describe(n):
    """Grade detail: the record's tuple, the native tuple, and which fields differ (never the UA)."""
    t = _tuple(n)
    return {'tuple': [t[0], t[1], list(t[2]), t[3]], 'native': [NATIVE_T[0], NATIVE_T[1], list(NATIVE_T[2]), NATIVE_T[3]],
            'differs': applied_fields(n), 'nativeSource': NATIVE_SOURCE}


def applied_fields(n):
    """Which of the four fields differ from native (for grade details)."""
    t = _tuple(n)
    return [f for f, a, b in zip(FIELDS, t, NATIVE_T) if a != b]


_env = os.environ.get('XOR_NATIVE_TUPLE')
if _env:
    set_native(json.loads(_env), 'env')
