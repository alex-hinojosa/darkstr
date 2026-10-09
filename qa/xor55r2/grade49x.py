#!/usr/bin/env python3
# Ported from Proof's r2adapt (darkstr-0055r2-xor-20261009-085907/harness/r2adapt, see PROVENANCE.sha256).
# Change vs. Proof: the inline Mini NATIVE_T / APPLIED moved to persona_presence (native tuple from env XOR_NATIVE_TUPLE, else the Mini values).
"""Grade xor49.py raw JSON. usage: grade49x.py <dir> <default.json>  -> GRADE.json / GRADE.txt.  'info'/'note' items do not gate."""
import json, sys, re
from pathlib import Path
D = Path(sys.argv[1]); BASE = json.loads(Path(sys.argv[2]).read_text()) if len(sys.argv) > 2 else None
REAL_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:156.0) Gecko/20100101 Firefox/156.0'

import sys as _sys; _sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parent))
from persona_presence import APPLIED  # noqa: E402
import persona_presence as _ppd  # noqa: E402
import persona_presence as _pp  # noqa: E402
NORM = lambda x: json.loads(re.sub(r'http://(localhost|127\.0\.0\.1|\[::1\]):\d+', 'ORIGIN', re.sub(r'[?&]t=[^"&]*', '', json.dumps(x))))
PASTED = {'locked42': ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Gecko/20100101 Firefox/140.0', 'MacIntel', 12, ['en-GB', 'en']),
          'lockedWin': ('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Win32', 6, ['de-DE', 'de', 'en'])}
FIELDS = ('userAgent', 'platform', 'hardwareConcurrency', 'language', 'languages', 'tz')
PREFIX = {'ded': '-ded', 'rel': '-rel', 'mod': '-mod', 'nest': '-nest', 'blob': '-blob', 'sh1': '-sh', 'sh2': '-sh', 'shm1': '-shm', 'shm2': '-shm', 'sw': '-sw-'}
def fmtAL(l):
    return ','.join(t + (f';q=0.{max(10-min(10,i),1)}' if i > 0 and max(10-min(10,i),1) < 10 else '') for i, t in enumerate(l))
def per(n): return tuple(json.dumps(n.get(k)) for k in ('userAgent', 'platform', 'hardwareConcurrency', 'languages'))
def grade(run, base):
    cfg = run['config']; armed = cfg != 'default'; R = []
    def chk(item, name, ok, detail=''): R.append({'item': item, 'check': name, 'pass': bool(ok), 'detail': '' if ok else str(detail)[:700]})
    chk('harness', 'harness completed', not run.get('harnessError'), run.get('harnessError'))
    log = [r for r in run.get('serverLog', []) if r['method'] != 'OPTIONS']
    bsteps = {s['step']: s for s in (base or {}).get('steps', [])}
    S = {s['step']: s for s in run.get('steps', [])}
    for st, s in S.items():
        if 'exception' in s or 'harnessTimeout' in s or 'nav' not in s: chk('harness', f'{st}: probe ran', False, str(s)[:300]); continue
        pn = s['nav']; W = s.get('w') or {}
        pe = (s.get('page') or {}).get('s') or {}
        chk('page', f'{st}: page fetch UA == page navigator', pe.get('ua') == pn['userAgent'], pe.get('ua'))
        if not armed: chk('3', f'{st}: page plain Firefox 156', pn['userAgent'] == REAL_UA, pn['userAgent'])
        if armed and s['doc'] != 'd1': chk('5', f'{st}: page persona applied (persona tuple != native: languages/cores/TZ)', APPLIED(pn), _ppd.describe(pn))
        for k, w in W.items():
            if k == 'swfetch': continue
            if not isinstance(w, dict) or w.get('ctorErr') or w.get('timeout') or w.get('error') or 'nav' not in w:
                chk('4' if k not in ('sh1', 'sh2', 'shm1', 'shm2') else '6', f'{st}/{k}: worker ran', False, w); continue
            wn = w['nav']
            fl = FIELDS if k != 'blob' else ('userAgent', 'platform', 'hardwareConcurrency', 'languages')
            for f in fl:
                chk('4' if k not in ('sw',) else '10', f'{st}/{k}: worker {f} == page', wn.get(f) == pn.get(f), f'worker={wn.get(f)!r} page={pn.get(f)!r}')
            if k != 'blob':
                chk('X-B3', f'{st}/{k}: worker appVersion == page appVersion', wn.get('appVersion') == pn.get('appVersion'), f"worker={wn.get('appVersion')!r} page={pn.get('appVersion')!r}")
                chk('9', f'{st}/{k}: no deviceMemory / userAgentData in worker; navigator own props []', not wn.get('dm') and not wn.get('dmProto') and not wn.get('uad') and wn.get('own') == [] and not wn.get('ownSym'), f"dm={wn.get('dm')} dmProto={wn.get('dmProto')} uad={wn.get('uad')} own={wn.get('own')}")
                chk('X-B3', f'{st}/{k}: worker languages same object + frozen', wn.get('langsSame') and wn.get('langsFrozen'), '')
                chk('7', f'{st}/{k}: self.location is the real script URL', str(wn.get('loc', '')).startswith('http'), wn.get('loc'))
                bw = ((bsteps.get(st) or {}).get('w') or {}).get(k) or {}
                if bw.get('nav'): chk('X-B3', f'{st}/{k}: worker oscpu/appName/product/vendor presence == default', all(wn.get(x) == bw['nav'].get(x) or (x == 'oscpu' and (wn.get(x) == '__absent') == (bw['nav'].get(x) == '__absent')) for x in ('oscpu', 'appName', 'appCodeName', 'product', 'vendor')), f"oscpu={wn.get('oscpu')!r}/{bw['nav'].get('oscpu')!r}")
                if not armed: chk('3', f'{st}/{k}: worker UA plain 156', wn['userAgent'] == REAL_UA, wn['userAgent'])
            else:
                chk('9', f'{st}/blob: no deviceMemory', not wn.get('dm'), '')
            if w.get('shape'):
                sh = w['shape']; chk('9', f'{st}/{k}: no darkstr strings in WorkerNavigator getters/globals', sh.get('darkstrHits') == [], sh.get('darkstrHits'))
                bsh = (((bsteps.get(st) or {}).get('w') or {}).get(k) or {}).get('shape')
                if bsh:
                    a, b = NORM(sh['navProto']), NORM(bsh['navProto']); diffs = sorted(x for x in set(a) | set(b) if a.get(x) != b.get(x))
                    chk('9', f'{st}/{k}: WorkerNavigator.prototype shape == default', not diffs, '; '.join(f'{x}: {json.dumps(a.get(x))[:200]} vs {json.dumps(b.get(x))[:200]}' for x in diffs[:3]))
                    chk('9', f'{st}/{k}: Function.prototype.toString untouched', sh.get('fpToString') == bsh.get('fpToString'), '')
                    ga, gb = set(sh.get('globals') or []), set(bsh.get('globals') or [])
                    chk('info', f'{st}/{k}: worker globals vs default', ga == gb, f'extra={sorted(ga-gb)} missing={sorted(gb-ga)}')
            if k in ('ded', 'rel'): chk('7', f'{st}/{k}: (relative) importScripts works', w.get('libOK') is True, w.get('impErr'))
            if k == 'mod': chk('7', f'{st}/mod: static + dynamic module import work, import.meta.url real', w.get('staticOK') and w.get('dynOK') and str(w.get('meta', '')).startswith('http'), str(w)[:200] if not (w.get('staticOK') and w.get('dynOK')) else w.get('meta'))
            if k == 'nest':
                inn = w.get('inner') or {}; inav = inn.get('nav') or {}
                for f in FIELDS: chk('4', f'{st}/nest.inner: {f} == page', inav.get(f) == pn.get(f), f'inner={inav.get(f)!r} page={pn.get(f)!r}')
            if k == 'blob': chk('7', f'{st}/blob: page-created blob worker runs (location blob:)', str(w.get('loc', '')).startswith('blob:'), w.get('loc'))
            if k in ('sh1', 'shm1'): chk('6', f'{st}/{k}: count 1', w.get('count') == 1, w.get('count'))
            if k in ('sh2', 'shm2'): chk('6', f'{st}/{k}: count 2 (instance shared)', w.get('count') == 2, w.get('count'))
            if k in ('sh1', 'sh2'): chk('7', f'{st}/{k}: relative importScripts in SharedWorker', w.get('libOK') is True, w.get('libOK'))
            if k in ('shm1', 'shm2'): chk('6', f'{st}/{k}: module SharedWorker static import + import.meta.url', w.get('staticOK') and str(w.get('meta', '')).startswith('http'), str(w)[:200])
            # server-side headers for every request this worker caused (script load, imports, fetch, xhr)
            pre = st + PREFIX[k]
            reqs = [r for r in log if r['t'].startswith(pre) and not (k == 'sh1' or k == 'sh2') or (k in ('sh1', 'sh2') and r['t'].startswith(st + '-sh') and not r['t'].startswith(st + '-shm'))]
            if k in ('sh2', 'shm2'): reqs = [r for r in reqs if r['t'].endswith('2') or r['t'].endswith('2s') or r['t'].endswith('2c') or r['t'].endswith('2x') or r['t'].endswith('2xhr')]
            if k == 'mod' or k == 'ded': reqs = [r for r in reqs if not r['t'].startswith(st + '-' + k + 'x')]
            chk('X-B3', f'{st}/{k}: worker-caused requests logged', len(reqs) >= (1 if k == 'blob' else 3), len(reqs))
            for r in reqs:
                cust = r['t'].endswith('c') and r['path'].endswith('/echo')
                item = '10' if k in ('sh1', 'sh2', 'shm1', 'shm2', 'sw') else '4'
                chk(item, f"{st}/{k} {r['t']} {r['path']}: HTTP UA == worker navigator", r['ua'] == wn['userAgent'], f"http={r['ua']!r} worker={wn['userAgent']!r}")
                if cust: chk('X-B3', f"{st}/{k} {r['t']}: page-set fr-FR kept", r['al'] == 'fr-FR', r['al'])
                elif k != 'blob' or True: chk(item, f"{st}/{k} {r['t']} {r['path']}: Accept-Language == fmt(worker languages)", r['al'] == fmtAL(wn['languages']), f"al={r['al']!r} exp={fmtAL(wn['languages'])!r}")
                if r.get('chua'): chk('13', f"{st}/{k} {r['t']}: no Client Hints", False, r['chua'])
        sf = W.get('swfetch')
        if sf is not None:
            ok = isinstance(sf, dict) and sf.get('controlled')
            chk('X-B3', f'{st}/swfetch: SW-controlled frame', ok, sf)
            for r in [x for x in log if x['t'].startswith(st + '-swnav') or x['t'].startswith(st + '-swpt')]:
                chk('X-B3', f"{st}/swfetch {r['t']} {r['path']}: SW pass-through request UA/AL == page persona", r['ua'] == pn['userAgent'] and r['al'] == fmtAL(pn['languages']), f"ua={r['ua']!r} al={r['al']!r} page={pn['userAgent']!r} {fmtAL(pn['languages'])!r}")
        c = s.get('ctor') or {}
        chk('7', f'{st}: no blob: resources created by the browser', c.get('blobLeak') == 0 or (c.get('blobLeak') == 1 and 'blob' in W), c.get('blobLeak'))
        chk('8', f'{st}: no darkstr strings in constructor shape', c.get('darkstrHits') == [], c.get('darkstrHits'))
        bc = (bsteps.get(st) or {}).get('ctor')
        if bc:
            for key in ('Worker', 'SharedWorker', 'WorkerProto', 'SharedWorkerProto', 'winWorker', 'winShared', 'workerProtoCtor', 'sharedProtoCtor', 'workerProtoDesc', 'sharedProtoDesc', 'register', 'urlCreate', 'workerCallNoNew', 'workerNoArgs'):
                a, b = NORM(c.get(key)), NORM(bc.get(key))
                chk('8', f'{st}: {key} shape == default', a == b, f'{json.dumps(a)[:300]} vs default {json.dumps(b)[:300]}')
        xf = s.get('xframe')
        if xf is not None:
            for k2 in ('ded', 'sh'):
                w = (xf or {}).get(k2) or {}; wn = w.get('nav') or {}
                chk('10', f'{st}/xframe.{k2}: cross-site iframe worker reports TOP page persona', all(wn.get(f) == pn.get(f) for f in FIELDS), f'worker={[wn.get(f) for f in FIELDS]} top={[pn.get(f) for f in FIELDS]} frameNav={(xf or {}).get("nav",{}).get("userAgent")}')
            for r in [x for x in log if x['t'].startswith(st + '-fx')]:
                cust = r['t'].endswith('c') and r['path'].endswith('/echo')
                chk('10', f"{st}/xframe {r['t']}: request UA == top persona", r['ua'] == pn['userAgent'], r['ua'])
                if not cust: chk('10', f"{st}/xframe {r['t']}: AL == top persona", r['al'] == fmtAL(pn['languages']), r['al'])
        if 'crossTabShared' in s:
            x = s['crossTabShared'] or {}; t1 = ((S.get('t1d2') or {}).get('w') or {}).get('sh1') or {}
            chk('6', f'{st}: SharedWorker shared across tabs (3rd connection -> count 3)', x.get('count') == 3, x.get('count') if x else x)
            chk('X-B3', f'{st}: cross-tab SharedWorker persona == its original instance == this page', per(x.get('nav') or {}) == per(t1.get('nav') or {}) == per(pn), f"{per(x.get('nav') or {})} vs {per(t1.get('nav') or {})} vs page {per(pn)}")
    for tab, L in (run.get('loops') or {}).items():
        L = L or {}; pg = L.get('page') or {}; exp = f"{pg.get('userAgent')}|{pg.get('hardwareConcurrency')}|{','.join(pg.get('languages') or [])}"
        bad = [x for x in L.get('res', []) if x != exp]
        chk('X-B3', f'concurrency {tab}: {L.get("n")} dedicated workers spawned during tab4 arming all == page persona', L.get('n', 0) >= 5 and not bad, f'{len(bad)} bad e.g. {bad[:2]} exp {exp}')
        if L.get('n'):
            rs = [r for r in log if r['t'].startswith(tab + '-conc-L')]
            badh = [r for r in rs if r['ua'] != pg.get('userAgent')]
            chk('X-B3', f'concurrency {tab}: worker script/fetch HTTP UA == page', not badh, f'{len(badh)}/{len(rs)} {badh[:1]}')
    # persona coherence across configs
    P2 = {st: s['nav'] for st, s in S.items() if 'nav' in s}
    if cfg == 'seed42':
        ps = {per(P2[x]) for x in ('t1d2', 't2d2', 't4d2') if x in P2}; chk('12', 'seed42 rotate off: one persona across tabs/sites', len(ps) == 1, ps)
    if cfg in PASTED:
        ua, plat, hc, langs = PASTED[cfg]
        for st, n in P2.items():
            if S[st]['doc'] != 'd1':
                chk('12', f'{cfg} {st}: page uses pasted snapshot verbatim', (n['userAgent'], n['platform'], n['hardwareConcurrency'], n['languages']) == (ua, plat, hc, langs), (n['userAgent'], n['platform'], n['hardwareConcurrency'], n['languages']))
        if cfg == 'lockedWin':
            n = P2.get('t1d2', {}); chk('note', 'lockedWin: pasted timezone Europe/Berlin applied on page', n.get('tz') == 'Europe/Berlin', n.get('tz'))
    if cfg in ('armed', 'seed42r', 'armedH'):
        ps = {per(P2[x]) for x in ('t1d2', 't2d2', 't4d2') if x in P2}; chk('X-B3', f'{cfg}: rotation per site (>=2 personas across 3 sites)', len(ps) >= 2, ps)
    # 135 list gone
    bad135 = [r['ua'] for r in run.get('serverLog', []) if re.search(r'rv:135|Firefox/135|Mac OS X 14\.0', r['ua'])]
    navs = json.dumps(run.get('steps'))
    chk('13', 'no Firefox 135 / "Mac OS X 14.0" UA in any request or any worker navigator', not bad135 and not re.search(r'rv:135|Firefox/135|Mac OS X 14\.0', navs), bad135[:3])
    chk('13', 'no Client Hints header on any request', not any(r.get('chua') for r in run.get('serverLog', [])), '')
    dg = run.get('diag') or {}; d0 = dg.get('start') or {}; de = dg.get('end') or {}
    if not armed:
        CONF = ('darkstr.mode', 'darkstr.nativePersonaHooks', 'darkstr.persona.seed', 'darkstr.persona.snapshot', 'darkstr.cookieFirewall.enabled', 'darkstr.persona.rotatePerSite', 'darkstr.strictFirstDoc')
        chk('3', 'default: no darkstr config prefs user-set, worker hooks not armed, mode homogeneous', not any(d0.get(k + '#user') for k in CONF) and d0.get('darkstr.worker.hooksArmed') is False and d0.get('darkstr.mode') == 'homogeneous', json.dumps({k: d0.get(k) for k in CONF + ('darkstr.worker.hooksArmed',)}))
        chk('3', 'default: C++ never asked chrome (worker lastPayload/lastInstall empty at end)', not de.get('darkstr.worker.lastPayload') and not de.get('darkstr.worker.lastInstall'), f"lastPayload={de.get('darkstr.worker.lastPayload')!r} lastInstall={de.get('darkstr.worker.lastInstall')!r}")
        chk('info', 'default: darkstr status prefs user-set by the browser itself', True, de.get('darkstrUserPrefs'))
    else:
        chk('5', f'{cfg}: darkstr.worker.hooksArmed true', de.get('darkstr.worker.hooksArmed') is True, de.get('darkstr.worker.hooksArmed'))
        if cfg == 'armed': chk('5', 'armed: no seed pref', not de.get('darkstr.persona.seed#user'), de.get('darkstr.persona.seed'))
        for k in ('intl.accept_languages', 'general.useragent.override'): chk('X-B3', f'end: {k} not user-set', not de.get(k + '#user'), de.get(k))
    pop = run.get('popup')
    if pop:
        pn_ = pop.get('popupNav') or {}; pw = (pop.get('popupWorker') or {}).get('nav') or {}; ps_ = (pop.get('popupShared') or {}).get('nav') or {}
        chk('note', 'popup dedicated worker == popup navigator', pw.get('userAgent') == pn_.get('userAgent') and pw.get('hardwareConcurrency') == pn_.get('hardwareConcurrency'), f"popup={pn_.get('userAgent')} hc={pn_.get('hardwareConcurrency')} worker={pw.get('userAgent')} hc={pw.get('hardwareConcurrency')}")
        t1 = P2.get('t1d2-again') or {}
        chk('note', 'popup dedicated worker == opener persona (inherits)', pw.get('userAgent') == t1.get('userAgent') and pw.get('hardwareConcurrency') == t1.get('hardwareConcurrency'), f"worker={pw.get('userAgent')} hc={pw.get('hardwareConcurrency')} opener={t1.get('userAgent')} hc={t1.get('hardwareConcurrency')}")
        chk('note', 'popup SharedWorker == opener persona', ps_.get('userAgent') == t1.get('userAgent') and ps_.get('hardwareConcurrency') == t1.get('hardwareConcurrency'), f"shared={ps_.get('userAgent')} hc={ps_.get('hardwareConcurrency')}")
    l = run.get('lsof', {})
    chk('net', 'sandbox-exec loopback-only + 0 non-loopback sockets', 'sandbox' in run and l.get('samples', 0) > 0 and l.get('samplesWithNonLoopback') == 0, l)
    return R
allR = {}; lines = []
for f in sorted(f for f in D.glob('*.json') if not f.name.startswith(('GRADE', 'popw_', 'pop_', 'xtab_'))):
    run = json.loads(f.read_text()); R = grade(run, BASE if run['config'] != 'default' or f.resolve() != Path(sys.argv[2]).resolve() else BASE)
    allR[f.stem] = R; nf = sum(not r['pass'] for r in R if r['item'] not in ('info', 'note'))
    lines.append(f"== {f.stem} ({run['config']}): {sum(r['pass'] for r in R)} pass, {nf} FAIL")
    for r in R:
        if not r['pass']: lines.append(f"  {'INFO' if r['item'] in ('info','note') else 'FAIL'} [{r['item']}] {r['check']} :: {r['detail']}")
summary = {k: {'pass': sum(r['pass'] for r in v), 'fail': sum(not r['pass'] for r in v if r['item'] not in ('info', 'note')),
               'byItem': {it: {'pass': sum(r['pass'] for r in v if r['item'] == it), 'fail': sum(not r['pass'] for r in v if r['item'] == it)} for it in sorted({r['item'] for r in v})}} for k, v in allR.items()}
(D / 'GRADE.json').write_text(json.dumps({'summary': summary, 'results': allR}, indent=1))
(D / 'GRADE.txt').write_text('\n'.join(lines) + '\n\n' + json.dumps(summary, indent=1) + '\n')
print('\n'.join(lines)); print(json.dumps({k: (v['pass'], v['fail']) for k, v in summary.items()}))
print('native tuple (%s): %s%s' % (_pp.NATIVE_SOURCE, json.dumps(_pp.NATIVE_T), '' if _pp.NATIVE_SOURCE == 'env' else ' -- set XOR_NATIVE_TUPLE on a host other than the Mini'), file=sys.stderr)
