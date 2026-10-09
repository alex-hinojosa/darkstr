#!/usr/bin/env python3
"""Cookie-hook detector shared by grade48r2.py and grade48f1.py (no side effects on import)."""
import json

# ---- cookie-hook detector (accepts both hook shapes) ----
# 0048 alone: the firewall defines an OWN `cookie` accessor on each document -> page-side hk() == 'get cookie'.
# 0051+ (N4): the hook replaces the Document.prototype accessor with a native-shaped one (same name/length/toString/
# errors as stock), so hk() == None for hooked AND native documents. The harness therefore attaches a chrome census
# (`__census`: frames of the tab with `sandboxed` = actor in DarkstrCookieFirewall._liveActors) to every page step.
HOOKED = ('own', 'proto')
UNHOOKED = ('native', 'none')
def hook_state(own, census=None, pick=None, census_run=False):
    """own: hk() result for the document; census: the step's __census list; pick(entry) selects the document's frame(s);
    census_run: the run recorded a census (has_census(cases)).
    -> 'own' | 'proto' | 'native' | 'none' (no own accessor, no census, run without census: legacy raw, treated as
       unhooked) | 'unknown' | 'mixed' | 'other:<x>'
    Proof #83 F2: in a run that recorded a census, a step whose census is missing or an {'err': ...} is 'unknown'
    (fails hooked AND unhooked checks), never 'none'."""
    if own == 'get cookie': return 'own'
    if own is not None: return 'other:' + str(own)
    if not isinstance(census, list): return 'unknown' if census_run else 'none'
    hits = [c for c in census if (pick or top_doc)(c)]
    if not hits: return 'unknown'
    sb = [bool(c.get('sandboxed')) for c in hits]
    return 'proto' if all(sb) else ('native' if not any(sb) else 'mixed')
def hook_ok(state, want_hooked): return state in (HOOKED if want_hooked else UNHOOKED)
def top_doc(c): return c.get('depth') == 0
def frame_url_has(sub): return lambda c: c.get('depth', 0) >= 1 and sub in (c.get('url') or '')
def frame_url_is(u): return lambda c: c.get('depth', 0) >= 1 and (c.get('url') or '') == u
def census_sandboxed(cases):
    """All census entries (any step) that the firewall sandboxed; [] when no census was recorded."""
    out = []
    def walk(x):
        if isinstance(x, dict):
            for k, v in x.items():
                if k == '__census' and isinstance(v, list): out.extend(e for e in v if e.get('sandboxed'))
                else: walk(v)
        elif isinstance(x, list):
            for v in x: walk(v)
    walk(cases); return out
def has_census(cases): return '"__census": [' in json.dumps(cases)
def no_firewall_sandbox(cases):
    """Default-config check (Proof #83 F2): needs a recorded census AND no sandboxed document. No census -> False
    (was `else True`)."""
    return has_census(cases) and census_sandboxed(cases) == []
