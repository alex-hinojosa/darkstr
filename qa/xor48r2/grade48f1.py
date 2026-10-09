#!/usr/bin/env python3
"""grade F1 stress: usage grade48f1.py <raw dir>  (reads f1_*.json)"""
import json, sys, glob, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from grade48r2_hooks import HOOKED, UNHOOKED, hook_state, top_doc


def grade_f1(d):
    """One f1_*.json -> result dict with 'PASS'. Proof #83 F1: an armed run passes only with a census on every F1
    document and every top-document hook state in {own, proto}; the default run only with {native, none}."""
    armed = d.get('config') != 'default'
    lan = d.get('lan') or ''; lanReal = bool(d.get('lanReal')); lanOrigin = f"http://{lan}:{d.get('serverPort')}" if lanReal else None
    docs = d.get('f1') or []; it = [x for r in docs for x in r.get('iters', [])]; cc = [x for r in docs for x in r.get('conc', [])]
    bad = [r for r in docs if not r.get('iters')]
    miss = lambda k: [(x['p'], x[k]) for x in it if x.get(k)]
    durs = [x['dur'] for x in it] + [x['dur'] for x in cc]
    census_run = any(isinstance(r.get('__census'), list) for r in docs)
    states = sorted({hook_state(r.get('hook'), r.get('__census'), top_doc, census_run) for r in docs})
    census_all = bool(docs) and all(isinstance(r.get('__census'), list) for r in docs)
    r = {'config': d['config'], 'docs': len(docs), 'docsWithoutResult': [ (r.get('doc'), {k: r.get(k) for k in ('exception', 'harnessTimeout')}) for r in bad],
              'fetchIterations': len(it), 'cookiesPerResponse': 6, 'concurrentBatches': len(cc),
              'missTop': miss('missTop'), 'missSameOriginIframe1': miss('missSo1'), 'missSameOriginIframe2': miss('missSo2'),
              'popupChecked': sum(1 for x in it if x.get('missPop') is not None), 'missPopup': miss('missPop'),
              'missConcurrentTop': [(x['p'], x['missTop']) for x in cc if x['missTop']], 'missConcurrentIframe': [(x['p'], x['missSo1']) for x in cc if x['missSo1']],
              'hiddenLeak(HttpOnly or Path=/sub visible)': miss('leak'), 'deletionStale': miss('staleDel'),
              'durMs': {'max': max(durs) if durs else None, 'p50': sorted(durs)[len(durs)//2] if durs else None, 'ge1900(2s safety timeout suspect)': sum(1 for x in durs if x >= 1900)},
              'hooks': sorted({r.get('hook') for r in docs if r.get('hook') is not None}, key=str),
              'hookStates(top, own|proto|native|none)': states, 'censusOnEveryDoc': census_all,
              'origins': {o: sum(len(r.get('iters', [])) for r in docs if r.get('o') == o) for o in sorted({r.get('o') for r in docs if r.get('o')})},
              'lan': {'ip': lan, 'real': lanReal, 'lanOnly': d.get('f1LanOnly'), 'preflight': d.get('f1LanPreflight'),
                      'iterationsOnRealLanOrigin': sum(len(r.get('iters', [])) for r in docs if lanOrigin and r.get('o') == lanOrigin)},
              'harnessError': d.get('harnessError'), 'lsof': d.get('lsof'), 'secs': d.get('f1Secs')}
    hooks_ok = (census_all and set(states) <= set(HOOKED)) if armed else set(states) <= set(UNHOOKED)
    r['hookGate'] = {'armed': armed, 'ok': hooks_ok,
                     'rule': 'armed: census on every doc and hookStates <= {own, proto}' if armed else 'default: hookStates <= {native, none}'}
    r['PASS'] = (hooks_ok and not r['harnessError'] and not bad and r['fetchIterations'] >= 300 and not any(r[k] for k in ('missTop', 'missSameOriginIframe1', 'missSameOriginIframe2', 'missPopup', 'missConcurrentTop', 'missConcurrentIframe', 'hiddenLeak(HttpOnly or Path=/sub visible)', 'deletionStale'))
                 and r['durMs']['ge1900(2s safety timeout suspect)'] == 0 and (r['lsof'] or {}).get('samplesWithNonLoopback', 1) == 0
                 and (not lanReal or r['lan']['iterationsOnRealLanOrigin'] > 0))
    return r


if __name__ == '__main__':
    R = {}
    for f in sorted(glob.glob(os.path.join(sys.argv[1], 'f1_*.json'))):
        R[os.path.basename(f)[:-5]] = grade_f1(json.load(open(f)))
    print(json.dumps(R, indent=1))
