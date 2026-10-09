#!/usr/bin/env python3
# Ported from Proof's r2adapt (darkstr-0055r2-xor-20261009-085907/harness/r2adapt, see PROVENANCE.sha256).
# Change vs. Proof: the inline Mini NATIVE_T / APPLIED moved to persona_presence (native tuple from env XOR_NATIVE_TUPLE, else the Mini values).
"""Grade xor51.py raw JSON. usage: grade51x.py <dir-with-json> [baseline-default.json]  -> GRADE.json / GRADE.txt in that dir.
Spec items (PROOF-XOR 3-8) + independent assertions (prefixed X-)."""
import json, sys, re
NORM=lambda x: json.loads(re.sub(r'http://(localhost|127\.0\.0\.1|\[::1\]):\d+/\?t=D-[\w-]+','URL',json.dumps(x)))
from pathlib import Path
D = Path(sys.argv[1]); BASE = json.loads(Path(sys.argv[2]).read_text()) if len(sys.argv) > 2 else None
REAL_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:156.0) Gecko/20100101 Firefox/156.0'

import sys as _sys; _sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parent))
from persona_presence import APPLIED  # noqa: E402
import persona_presence as _pp  # noqa: E402
DEF_AL = 'en-US,en;q=0.9'
SUF = {'s', 'x', 'c', 'xhr', 'img', 'b', 'fr', 'frq', 'frb', 'sf', 'sfq', 'bk', 'sd', 'pp'}
def fmtAL(l):
    o = []
    for i, t in enumerate(l):
        q = max(10 - min(10, i), 1); o.append(t + (f';q=0.{q}' if i > 0 and q < 10 else ''))
    return ','.join(o)
def persona(n): return (n.get('userAgent'), n.get('platform'), n.get('hardwareConcurrency'), tuple(n.get('languages') or []))
def grade(run, base):
    cfg = run['config']; armed = cfg != 'default'; R = []
    def chk(item, name, ok, detail=''): R.append({'item': item, 'check': name, 'pass': bool(ok), 'detail': detail if not ok else ''})
    log = run.get('serverLog', [])
    chk('harness', 'harness completed without error', not run.get('harnessError'), run.get('harnessError', ''))
    bytag = {}
    for r in log: bytag.setdefault(r['t'], []).append(r)
    probes = run.get('probes', [])
    # every request must have a probe/loop owner or be a known doc load
    for p in probes:
        st = p['step']; n = p.get('nav') or {}
        if 'exception' in p or 'harnessTimeout' in p: chk('harness', f'{st} probe ran', False, str(p)[:300]); continue
        eua, eal = n.get('userAgent'), fmtAL(n.get('languages') or [])
        reqs = [(r, t.rsplit('-', 1)[1]) for t, rs in bytag.items() if t.startswith(st + '-') and t.rsplit('-', 1)[1] in SUF and t.rsplit('-', 1)[0] == st for r in rs]
        dl = [r for r in bytag.get(p.get('docLoadTag') or '', []) if r['path'] == '/']
        item = 'N2' if any(k in st for k in ('after', 'popup', 'final', 'again', 't4', 'd3')) else 'consistency'
        chk('consistency', f'{st}: >=6 tagged subrequests logged', len(reqs) >= 6, f'{len(reqs)}')
        for r, sfx in reqs + [(x, 'docload') for x in dl]:
            if sfx in ('bk', 'sd', 'pp'): continue  # graded with their frame below
            chk(item if sfx != 'docload' else item, f'{st}/{sfx}: HTTP UA == navigator UA', r['ua'] == eua, f"http={r['ua']!r} nav={eua!r}")
            if sfx == 'c': chk('N3', f'{st}/c: page-set Accept-Language fr-FR kept', r['al'] == 'fr-FR', f"al={r['al']!r}")
            elif r['method'] != 'OPTIONS': chk('N3', f'{st}/{sfx}: Accept-Language == fmt(navigator.languages)', r['al'] == eal, f"al={r['al']!r} exp={eal!r}")
            if r.get('chua'): chk('8', f'{st}/{sfx}: no Client Hints sent', False, str(r['chua']))
        if not dl: chk('consistency', f'{st}: document load logged', False, p.get('docLoadTag'))
        for fk in ('xframe', 'sframe'):
            if fk in p:
                f = p[fk] or {}; fn = f.get('nav') or {}
                chk('N3', f'{st}/{fk}: frame navigator persona == top document persona', persona(fn) == persona(n), f'frame={persona(fn)} top={persona(n)}')
                for hk in ('http', 'back'):
                    h = f.get(hk)
                    if h: chk('N2', f'{st}/{fk}.{hk}: frame request UA == frame navigator UA', h.get('ua') == fn.get('userAgent'), f"http={h.get('ua')!r} nav={fn.get('userAgent')!r}")
                    if h: chk('N3', f'{st}/{fk}.{hk}: frame request AL == fmt(frame languages)', h.get('al') == fmtAL(fn.get('languages') or []), f"al={h.get('al')!r}")
        for fk in ('blank', 'srcdoc', 'popup'):
            if fk in p:
                f = p[fk] or {}
                if f.get('blocked'): chk('X-N4', f'{st}/{fk}: popup opened', False, 'blocked'); continue
                fn = f.get('nav') or {}; h = f.get('http') or {}
                chk('X-N4', f'{st}/{fk}: same-origin {fk} navigator persona == parent persona', persona(fn) == persona(n), f'{fk}={persona(fn)} parent={persona(n)}')
                chk('X-N4', f'{st}/{fk}: request UA == its navigator UA', h.get('ua') == fn.get('userAgent'), f"http={h.get('ua')!r} nav={fn.get('userAgent')!r}")
                chk('X-N3', f'{st}/{fk}: request AL == fmt(its languages)', h.get('al') == fmtAL(fn.get('languages') or []), f"al={h.get('al')!r} exp={fmtAL(fn.get('languages') or [])!r}")
                chk('X-N4', f'{st}/{fk}: no own props on its navigator', f.get('navOwn') == [], str(f.get('navOwn')))
                if fk == 'blank':
                    chk('X-N4', f'{st}/blank: no deviceMemory/userAgentData', not f.get('inDM') and not f.get('inUAD'), f"{f.get('inDM')}/{f.get('inUAD')}")
                    chk('X-N4', f'{st}/blank: parent getter on frame navigator == frame navigator UA', f.get('topGetterOnFrameNav') == fn.get('userAgent'), f"{f.get('topGetterOnFrameNav')!r}")
                    chk('X-N4', f'{st}/blank: frame getter on parent navigator == parent UA', f.get('frameGetterOnTopNav') == eua, f"{f.get('frameGetterOnTopNav')!r}")
        if not armed:
            chk('3', f'{st}: navigator UA is plain Firefox 156', eua == REAL_UA, eua)
            chk('3', f'{st}: navigator.languages en-US,en', n.get('languages') == ['en-US', 'en'], str(n.get('languages')))
            for r, sfx in reqs + [(x, 'docload') for x in dl]:
                chk('3', f'{st}/{sfx}: HTTP UA plain 156', r['ua'] == REAL_UA, r['ua'])
                if sfx != 'c' and r['method'] != 'OPTIONS': chk('3', f'{st}/{sfx}: Accept-Language {DEF_AL}', r['al'] == DEF_AL, r['al'])
    P = {p['step']: p for p in probes if p.get('nav')}
    if armed:
        for st, p in P.items():
            if p['doc'] != 'd1':
                chk('X-armed', f'{st}: persona actually applied (UA != real 156)', APPLIED(p['nav']), p['nav']['userAgent'])
        # N2: persona of a document is stable after new tabs / popups
        for a, b in (('t1d2', 't1d2-again'), ('t1d2', 't1d2-after-t3'), ('t1d2', 't1d2-popup'), ('t2d2', 't2d2-again'), ('t2d2', 't2d2-after-t3'), ('t2d2', 't2d2-after-popup'), ('t2d2', 't2d2-final'), ('t1d3', 't1d3-final')):
            if a in P and b in P: chk('N2', f'{b}: same persona as {a} (not flipped by new tab)', persona(P[a]['nav']) == persona(P[b]['nav']), f'{persona(P[a]["nav"])} vs {persona(P[b]["nav"])}')
            else: chk('N2', f'{b} vs {a} present', False, 'missing')
        if 't1d3' in P: chk('N2', "t1d3: tab1's next document after t3 still armed", APPLIED(P['t1d3']['nav']), P['t1d3']['nav']['userAgent'])
    # concurrency loops
    for tab, L in (run.get('loops') or {}).items():
        res = L.get('result') or {}; n = res.get('nav') or {}
        pre = tab + L['doc'] + '-conc-L'
        rs = [r for t, x in bytag.items() if t.startswith(pre) for r in x if r['method'] != 'OPTIONS']
        chk('N2', f'conc {tab}: loop ran (>=20 requests)', len(rs) >= 20 and res.get('uaStable'), f"{len(rs)} reqs, uaStable={res.get('uaStable')} {str(res)[:200]}")
        bad = [r for r in rs if r['ua'] != n.get('userAgent')]
        chk('N2', f'conc {tab}: every concurrent request UA == its document navigator UA', not bad and n, f"{len(bad)}/{len(rs)} bad e.g. {bad[:1]}")
        badal = [r for r in rs if r['al'] != ('fr-FR' if r['t'].endswith('c') else fmtAL(n.get('languages') or []))]
        chk('N3', f'conc {tab}: every concurrent request Accept-Language == its page (fr-FR kept)', not badal and n, f"{len(badal)}/{len(rs)} bad e.g. {badal[:1]}")
        same = P.get(tab + L['doc'])
        if same: chk('N2', f'conc {tab}: persona during concurrency == before', persona(same['nav']) == persona(n), '')
    # global prefs (N3)
    dg = (run.get('diag') or {}).get('end') or {}
    if dg and 'err' not in dg:
        for k in ('intl.accept_languages', 'darkstr.persona.languages', 'general.useragent.override'):
            chk('N3', f'end: {k} has no user value', not dg.get(k + '#user'), str(dg.get(k)))
    else: chk('harness', 'end diag read', False, str(dg)[:200])
    # shape (N4) vs default baseline
    for st, sh in (run.get('shapes') or {}).items():
        chk('N4', f'{st}: deviceMemory not in navigator', not sh['inDeviceMemory'] and not sh['inDeviceMemoryProto'], '')
        chk('N4', f'{st}: userAgentData not in navigator', not sh['inUserAgentData'] and not sh['inUserAgentDataProto'], '')
        chk('N4', f'{st}: Object.getOwnPropertyNames(navigator) == []', sh['navOwn'] == [] and sh['navOwnSym'] == [], str(sh['navOwn']))
        chk('N4', f'{st}: document has no own cookie property', not sh['docCookieOwnDesc'] and sh['docOwnCookieish'] == [], str(sh['docOwnCookieish']))
        chk('N4', f'{st}: cookieStore has no own props', sh['cookieStoreOwn'] in ([], 'n/a'), str(sh['cookieStoreOwn']))
        chk('N4', f'{st}: navigator.languages same object + frozen + Array', sh['langsSame'] and sh['langsFrozen'] and sh['langsArrayProto'] and sh['langsIsArray'], '')
        chk('N4', f'{st}: no darkstr/chrome strings in any getter name/source/error', sh['darkstrHits'] == [], str(sh['darkstrHits'][:5]))
        chk('X-N4', f'{st}: getter.call(navigator) == navigator.userAgent, identity stable', sh['getterCallEqualsProp'] and sh['getterIdentityStable'], '')
        ua = (sh['navProto'].get('userAgent') or {}).get('get') or {}
        chk('N4', f'{st}: userAgent getter name/toString native-shaped', ua.get('name') == 'get userAgent' and '[native code]' in (ua.get('src') or '') and 'darkstr' not in json.dumps(ua), json.dumps(ua)[:300])
        bsh = (base or {}).get('shapes', {}).get(st)
        if bsh is None and base: bsh = next(iter(base.get('shapes', {}).values()), None)
        if bsh:
            sh, bsh = NORM(sh), NORM(bsh)
            ao, bo = set(sh.get('winOwn') or []), set(bsh.get('winOwn') or [])
            chk('info', f'{st}: window globals vs default (informational; mode-level prefs, not persona)', ao == bo, f'armed-only={sorted(ao-bo)} default-only={sorted(bo-ao)}')
            for k in ('navProto', 'docProtoCookie', 'docProtoKeys', 'htmlDocProtoKeys', 'cookieStoreProto', 'docOwn', 'eventTargetProtoKeys', 'types', 'reflectGetProxy', 'fpToString'):
                a, b = sh.get(k), bsh.get(k)
                if isinstance(a, dict) and isinstance(b, dict):
                    diffs = sorted(x for x in set(a) | set(b) if a.get(x) != b.get(x) and not (k == 'navProto' and x == 'gpu' and run['userjs'].get('dom.webgpu.enabled')))
                    det = '; '.join(f'{x}: armed={json.dumps(a.get(x))[:400]} default={json.dumps(b.get(x))[:400]}' for x in diffs[:4])
                    chk('N4', f'{st}: {k} identical to default run', not diffs, f'{len(diffs)} differ: {det}')
                else:
                    chk('N4', f'{st}: {k} identical to default run', a == b, f'armed={json.dumps(a)[:400]} default={json.dumps(b)[:400]}')
    # N5
    d = run.get('diag') or {}
    snapuser = {k: v.get('darkstr.persona.snapshot#user') for k, v in d.items() if isinstance(v, dict)}
    sites = lambda doc: [P.get(f'{t}{doc}') for t in ('t1', 't2', 't3')]
    def distinct(doc):
        ps = [persona(p['nav']) for p in sites(doc) if p]; return len(set(ps)), len(ps), ps
    if cfg in ('seed42', 'seed42r', 'armed', 'armedH', 'armedNoFW'):
        chk('N5', 'darkstr.persona.snapshot never gets a user value (all diag points)', not any(snapuser.values()), str(snapuser))
    if cfg == 'seed42':
        k, nn, ps = distinct('d2'); chk('N5', 'seed42 rotate=false: one global persona across sites A/B/C', nn == 3 and k == 1, str(ps))
        k, nn, ps = distinct('n5x0'); chk('N5', 'seed42: rotatePerSite flipped on -> rotation resumes (>=2 personas across 3 sites)', nn == 3 and k >= 2, str(ps))
        rl = d.get('n5-0-after-darkstr.persona.rotatePerSite=True', {}).get('rotationLocked'); chk('N5', 'seed42: after flip rotationLocked false', rl is False, str(rl))
    if cfg in ('seed42r', 'armed', 'armedH', 'armedNoFW'):
        k, nn, ps = distinct('d2'); chk('N5' if cfg == 'seed42r' else 'X-N5', f'{cfg}: rotation per site (>=2 personas across 3 sites)', nn == 3 and k >= 2, str(ps))
    if cfg == 'seed42r':
        k, nn, ps = distinct('n5x0'); chk('N5', 'seed42r: rotate off at runtime -> one persona', nn == 3 and k == 1, str(ps))
        k, nn, ps = distinct('n5x1'); chk('N5', 'seed42r: rotate back on -> rotates again', nn == 3 and k >= 2, str(ps))
    if cfg == 'armed':
        k, nn, ps = distinct('n5x0'); chk('X-N5', 'armed + seed 42 set at runtime -> still rotates per site', nn == 3 and k >= 2, str(ps))
    if cfg == 'locked42':
        pa = run['pasted']; exp = (pa['userAgent'], pa['platform'], pa['hardwareConcurrency'], tuple(pa['languages']))
        for doc in ('d2', 'n5x0'):
            for p in sites(doc):
                if p: chk('N5', f"locked42 {p['step']}: pasted persona used verbatim", persona(p['nav']) == exp, f"{persona(p['nav'])}")
        v = d.get('end', {}).get('darkstr.persona.snapshot'); chk('N5', 'locked42: pasted snapshot pref untouched', v == json.dumps(pa), str(v)[:200])
        dm = [p for p in probes if 'deviceMemory' in json.dumps(p.get('nav'))]; chk('N4', 'locked42: pasted deviceMemory not exposed', not dm, '')
    # 8 defaults
    if cfg == 'default':
        s0 = d.get('start', {})
        chk('8', 'default: darkstr.mode homogeneous / hooks off / firewall off / strictFirstDoc on', s0.get('darkstr.mode') in ('homogeneous', None) and not s0.get('darkstr.nativePersonaHooks') and not s0.get('darkstr.cookieFirewall.enabled') and s0.get('darkstr.strictFirstDoc') is True and not s0.get('darkstr.pollutionActive'), json.dumps({k: s0.get(k) for k in ('darkstr.mode', 'darkstr.nativePersonaHooks', 'darkstr.cookieFirewall.enabled', 'darkstr.strictFirstDoc', 'darkstr.pollutionActive')}))
        chk('3', 'default: app version 156.0.1', s0.get('appVersion') == '156.0.1', str(s0.get('appVersion')))
    lsof = run.get('lsof', {}); sb = 'sandbox' in run
    chk('net', 'outside network: sandbox-exec loopback-only and 0 non-loopback sockets in lsof samples', sb and lsof.get('samplesWithNonLoopback') == 0 and lsof.get('samples', 0) > 0, json.dumps(lsof)[:300])
    return R
allR = {}; lines = []
files = sorted(f for f in D.glob('*.json') if not f.name.startswith('GRADE'))
for f in files:
    run = json.loads(f.read_text()); R = grade(run, BASE if run['config'] != 'default' else None)
    allR[f.stem] = R; np_ = sum(r['pass'] for r in R); nf = sum(not r['pass'] for r in R if r['item'] != 'info')
    lines.append(f'== {f.stem} ({run["config"]}): {np_} pass, {nf} FAIL')
    for r in R:
        if not r['pass']: lines.append(f"  {'INFO' if r['item']=='info' else 'FAIL'} [{r['item']}] {r['check']} :: {r['detail'][:600]}")
summary = {k: {'pass': sum(r['pass'] for r in v), 'fail': sum(not r['pass'] for r in v if r['item'] != 'info'), 'infoDiff': sum(not r['pass'] for r in v if r['item'] == 'info'),
               'byItem': {it: {'pass': sum(r['pass'] for r in v if r['item'] == it), 'fail': sum(not r['pass'] for r in v if r['item'] == it)} for it in sorted({r['item'] for r in v})}} for k, v in allR.items()}
(D / 'GRADE.json').write_text(json.dumps({'summary': summary, 'results': allR}, indent=1))
(D / 'GRADE.txt').write_text('\n'.join(lines) + '\n\n' + json.dumps(summary, indent=1) + '\n')
print('\n'.join(lines[:400])); print(json.dumps({k: (v['pass'], v['fail']) for k, v in summary.items()}))
print('native tuple (%s): %s%s' % (_pp.NATIVE_SOURCE, json.dumps(_pp.NATIVE_T), '' if _pp.NATIVE_SOURCE == 'env' else ' -- set XOR_NATIVE_TUPLE on a host other than the Mini'), file=sys.stderr)
