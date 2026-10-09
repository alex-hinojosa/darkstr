#!/usr/bin/env python3
# Ported from Proof's r2adapt (darkstr-0055r2-xor-20261009-085907/harness/r2adapt, see PROVENANCE.sha256).
# Change vs. Proof: the inline Mini NATIVE_T / APPLIED moved to persona_presence (native tuple from env XOR_NATIVE_TUPLE, else the Mini values).
# 0058r2 (Proof #92): the armed checks are named for what they test -- persona tuple (languages, cores, TZ, platform) != native --
# and never compare the UA; since 0055r2 / 0058 a persona keeps the real engine UA, so "UA != real" is not a presence signal.
"""grade xor51r2.py XOR_MODE=popup2 runs. usage: grade51pop.py <dir>  (pop_*.json) -> GRADEPOP.txt/json"""
import json, sys
from pathlib import Path
D = Path(sys.argv[1])
REAL_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:156.0) Gecko/20100101 Firefox/156.0'; DEF_AL = 'en-US,en;q=0.9'

import sys as _sys; _sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parent))
from persona_presence import APPLIED, applied_fields  # noqa: E402
import persona_presence as _pp  # noqa: E402
def fmtAL(l): return ','.join(t + (f';q=0.{max(10-min(10,i),1)}' if i > 0 and max(10-min(10,i),1) < 10 else '') for i, t in enumerate(l or []))
def per(n): n = n or {}; return (n.get('userAgent'), n.get('platform'), n.get('hardwareConcurrency'), tuple(n.get('languages') or []))
allR = {}; lines = []
for f in sorted(D.glob('pop_*.json')):
    run = json.loads(f.read_text()); cfg = run['config']; armed = cfg != 'default'; R = []
    def chk(item, name, ok, det=''): R.append({'item': item, 'check': name, 'pass': bool(ok), 'detail': '' if ok else str(det)[:500]})
    log = run.get('serverLog', []); by = {}
    for r in log: by.setdefault(r['t'], []).append(r)
    def reqs(t, path=None): return [r for r in by.get(t, []) if r['method'] != 'OPTIONS' and (path is None or r['path'] == path)]
    chk('harness', 'no harness error', not run.get('harnessError'), run.get('harnessError'))
    P = {p['step']: p for p in run.get('probes', [])}
    pp = run.get('popup2') or {}; op = pp.get('opener') or {}
    chk('harness', 'popup2 probe ran', pp and 'exception' not in pp and 'harnessTimeout' not in pp, str(pp)[:300])
    ouA, oal = op.get('userAgent'), fmtAL(op.get('languages'))
    if armed: chk('pop', 'opener t1d2 armed (persona tuple != native: languages/cores/TZ)', ouA and APPLIED(op), _pp.describe(op))
    else: chk('pop', 'default: opener plain 156', ouA == REAL_UA, ouA)
    def http_ok(name, h, ua, al):
        h = h or {}; chk('pop', f'{name}: HTTP UA == expected', h.get('ua') == ua, f"http={h.get('ua')!r} exp={ua!r}")
        chk('pop', f'{name}: HTTP Accept-Language == expected', h.get('al') == al, f"al={h.get('al')!r} exp={al!r}")
    for k in ('pb0', 'pb800', 'pb3000'):
        chk('pop', f'about:blank popup navigator at {k[2:]}ms == opener persona', per(pp.get(k)) == per(op), f'{per(pp.get(k))} vs {per(op)}')
    chk('pop', 'about:blank popup navigator has no own props', pp.get('pbOwn') == [], pp.get('pbOwn'))
    http_ok('about:blank popup fetch', pp.get('pbHttp'), ouA, oal)
    chk('pop', 'about:blank -> same-origin nav: navigator == opener', per(pp.get('pbnav')) == per(op), f"{per(pp.get('pbnav'))}")
    http_ok('about:blank -> same-origin nav: fetch', pp.get('pbnavHttp'), ouA, oal)
    for r in reqs('D-pbnav', '/') or [{}]: http_ok('about:blank -> same-origin nav: document load', r, ouA, oal)
    chk('pop', 'same-origin URL popup navigator (3.5s) == opener', per(pp.get('pu')) == per(op), f"{per(pp.get('pu'))}")
    chk('info', 'same-origin URL popup navigator at 300ms == opener (may still be initial about:blank)', per(pp.get('pu300')) == per(op), f"{per(pp.get('pu300'))}")
    http_ok('same-origin URL popup fetch', pp.get('puHttp'), ouA, oal)
    for r in reqs('D-pu', '/') or [{}]: http_ok('same-origin URL popup document load', r, ouA, oal)
    chk('pop', 'opener persona unchanged after popups', per(pp.get('openerAfter')) == per(op), '')
    ref = P.get('t1d2-ref', {}).get('nav'); aft = P.get('t1d2-afterpop', {}).get('nav')
    chk('pop', 't1 persona after all popups == before', per(ref) == per(aft) and ref, '')
    loaded = run.get('popLoaded') or {}
    for k in ('D-noop', 'D-lnk', 'D-xp'): chk('harness', f'{k} loaded (chrome-context wait)', loaded.get(k), loaded)
    for tab in ('noop', 'lnk', 'xp'):
        p = P.get(tab + 'd1')
        if not p: chk('pop', f'{tab} popup probed', False, 'missing'); continue
        n = p.get('nav') or {}; ua, al = n.get('userAgent'), fmtAL(n.get('languages'))
        label = {'noop': 'noopener window.open', 'lnk': 'target=_blank link (implicit noopener)', 'xp': 'cross-site popup (with opener)'}[tab]
        if tab != 'xp': chk('pop', f'{label}: opener is null', p.get('openerIsNull') is True, p.get('openerIsNull'))
        if armed:
            if tab in ('noop', 'lnk'): chk('pop', f'{label}: navigator == live armed decision for site A (t1d2 persona)', per(n) == per(ref), f'{per(n)} vs {per(ref)}')
            else:
                chk('pop', f'{label}: keeps opener armed bit (persona tuple != native: languages/cores/TZ)', APPLIED(n), _pp.describe(n))
                chk('info', f'{label}: persona == armed user-tab persona of its own site (t2d2)', per(n) == per((P.get('t2d2') or {}).get('nav')), f"{per(n)} vs {per((P.get('t2d2') or {}).get('nav'))}")
        else: chk('pop', f'default {label}: plain 156', ua == REAL_UA, ua)
        sub = [(t, r) for t, rs in by.items() if t.startswith(tab + 'd1-') for r in rs if r['method'] != 'OPTIONS']
        chk('pop', f'{label}: >=6 subrequests', len(sub) >= 6, len(sub))
        for t, r in sub + [('docload', r) for r in reqs('D-' + {'noop': 'noop', 'lnk': 'lnk', 'xp': 'xp'}[tab], '/')]:
            chk('pop', f'{label} {t}: HTTP UA == navigator', r['ua'] == ua, f"{r['ua']!r} vs {ua!r}")
            if not t.endswith('-c'): chk('pop', f'{label} {t}: AL == navigator languages', r['al'] == al, f"{r['al']!r} vs {al!r}")
        for fk in ('xframe', 'sframe'):
            if fk in p:
                fn = (p[fk] or {}).get('nav') or {}
                for hk in ('http', 'back'):
                    if hk not in (p[fk] or {}): continue
                    h = (p[fk] or {}).get(hk) or {}
                    chk('pop', f'{label} {fk}.{hk}: request UA == frame navigator', h.get('ua') == fn.get('userAgent'), f"{h.get('ua')} vs {fn.get('userAgent')}")
        W = p.get('workers') or {}
        for wk in ('dw', 'sw'):
            w = W.get(wk) or {}
            nm = f"{label} {'dedicated' if wk == 'dw' else 'shared'} worker"
            if 'ua' not in w: chk('pop', f'{nm} ran', False, w); continue
            chk('pop', f'{nm}: navigator UA == page navigator', w['ua'] == ua, f"{w['ua']} vs {ua}")
            chk('pop', f'{nm}: languages == page', w.get('langs') == n.get('languages'), f"{w.get('langs')}")
            chk('pop', f'{nm}: hardwareConcurrency/platform == page', (w.get('hc'), w.get('platform')) == (n.get('hardwareConcurrency'), n.get('platform')), f"{(w.get('hc'), w.get('platform'))} vs {(n.get('hardwareConcurrency'), n.get('platform'))}")
            chk('pop', f'{nm}: timezone == page', w.get('tz') == n.get('tz'), f"{w.get('tz')} vs {n.get('tz')}")
            chk('pop', f'{nm}: fetch UA == page navigator', (w.get('http') or {}).get('ua') == ua, (w.get('http') or {}).get('ua'))
            chk('pop', f'{nm}: fetch AL == page languages', (w.get('http') or {}).get('al') == al, (w.get('http') or {}).get('al'))
            for t, lab in ((f'{tab}w-{wk}', 'script load'), (f'{tab}w-{wk}-wi', 'importScripts')):
                rs = reqs(t)
                chk('pop', f'{nm}: {lab} request UA == page navigator', rs and all(r['ua'] == ua for r in rs), [r['ua'] for r in rs] or 'no request')
    lsof = run.get('lsof', {})
    chk('net', 'sandbox-exec loopback-only and 0 non-loopback sockets', 'sandbox' in run and lsof.get('samplesWithNonLoopback') == 0 and lsof.get('samples', 0) > 0, lsof)
    allR[f.stem] = R; nf = sum(not r['pass'] for r in R if r['item'] != 'info')
    lines.append(f'== {f.stem} ({cfg}): {sum(r["pass"] for r in R)} pass, {nf} FAIL')
    lines += [f"  {'INFO' if r['item']=='info' else 'FAIL'} [{r['item']}] {r['check']} :: {r['detail']}" for r in R if not r['pass']]
(D / 'GRADEPOP.json').write_text(json.dumps(allR, indent=1)); (D / 'GRADEPOP.txt').write_text('\n'.join(lines) + '\n'); print('\n'.join(lines))
print('native tuple (%s): %s%s' % (_pp.NATIVE_SOURCE, json.dumps(_pp.NATIVE_T), '' if _pp.NATIVE_SOURCE == 'env' else ' -- set XOR_NATIVE_TUPLE on a host other than the Mini'), file=sys.stderr)
