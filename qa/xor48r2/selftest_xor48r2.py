#!/usr/bin/env python3
"""Offline self-test for the xor48r2 harness helpers (run by tests/qa-xor48r2-harness.test.mjs). No browser needed."""
import os, sys, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from grade48r2_hooks import hook_state, hook_ok, top_doc, frame_url_has, frame_url_is, census_sandboxed, has_census, no_firewall_sandbox  # noqa: E402
from grade48f1 import grade_f1  # noqa: E402
from xor48r2_net import is_ipv4, lsof_peer_class, LOOPBACK_HOSTS  # noqa: E402

CENSUS_ARMED = [
    {'depth': 0, 'url': 'http://localhost:5/?n1', 'id': 1, 'sandboxed': True},
    {'depth': 1, 'url': 'http://localhost:5/frame?t=so-nav2', 'id': 2, 'sandboxed': True},
    {'depth': 1, 'url': 'about:blank', 'id': 3, 'sandboxed': True},
    {'depth': 1, 'url': 'about:srcdoc', 'id': 4, 'sandboxed': True},
]
CENSUS_STOCK = [dict(c, sandboxed=False) for c in CENSUS_ARMED]


class HookState(unittest.TestCase):
    def test_0048_own_accessor_shape(self):
        self.assertEqual(hook_state('get cookie'), 'own')
        self.assertEqual(hook_state('get cookie', CENSUS_STOCK), 'own')  # own accessor wins (0048 alone)
        self.assertTrue(hook_ok('own', True))

    def test_0051_prototype_shape_is_hooked_via_census(self):
        self.assertEqual(hook_state(None, CENSUS_ARMED, top_doc), 'proto')
        self.assertTrue(hook_ok(hook_state(None, CENSUS_ARMED, top_doc), True))
        self.assertEqual(hook_state(None, CENSUS_ARMED, frame_url_is('about:blank')), 'proto')
        self.assertEqual(hook_state(None, CENSUS_ARMED, frame_url_is('about:srcdoc')), 'proto')
        self.assertEqual(hook_state(None, CENSUS_ARMED, frame_url_has('/frame?t=so-nav')), 'proto')

    def test_native_prototype_is_not_hooked(self):
        st = hook_state(None, CENSUS_STOCK, top_doc)
        self.assertEqual(st, 'native')
        self.assertFalse(hook_ok(st, True))
        self.assertTrue(hook_ok(st, False))

    def test_legacy_raw_without_census_keeps_old_semantics(self):
        self.assertEqual(hook_state(None, None), 'none')
        self.assertTrue(hook_ok('none', False))
        self.assertFalse(hook_ok('none', True))  # old grader: None != 'get cookie'

    def test_unknown_mixed_other(self):
        self.assertEqual(hook_state(None, CENSUS_ARMED, frame_url_is('about:nothing')), 'unknown')
        self.assertFalse(hook_ok('unknown', True)); self.assertFalse(hook_ok('unknown', False))
        mixed = [dict(CENSUS_ARMED[1]), dict(CENSUS_ARMED[1], sandboxed=False)]
        self.assertEqual(hook_state(None, mixed, frame_url_has('/frame')), 'mixed')
        self.assertEqual(hook_state('own-noget'), 'other:own-noget')

    def test_census_helpers(self):
        cases = {'N1': {'n1': {'hook': None, '__census': CENSUS_ARMED}}, 'SO': {'__census': CENSUS_STOCK}}
        self.assertTrue(has_census(cases))
        self.assertEqual(len(census_sandboxed(cases)), 4)
        self.assertEqual(census_sandboxed({'SO': {'__census': CENSUS_STOCK}}), [])
        self.assertFalse(has_census({'N1': {'n1': {'hook': None}}}))


class ProofF2MissingCensus(unittest.TestCase):
    """Proof #83 F2: in a run that recorded a census, a step without one (or with {'err'}) must not pass as 'none'."""
    def test_missing_census_in_census_run_is_unknown_and_fails_both(self):
        for c in (None, {'err': "JavascriptException('boom')"}):
            st = hook_state(None, c, top_doc, census_run=True)
            self.assertEqual(st, 'unknown', c)
            self.assertFalse(hook_ok(st, True)); self.assertFalse(hook_ok(st, False))

    def test_legacy_run_without_census_unchanged(self):
        self.assertEqual(hook_state(None, None, top_doc, census_run=False), 'none')

    def test_default_check_needs_a_census(self):
        self.assertFalse(no_firewall_sandbox({'N1': {'n1': {'hook': None}}}))                       # no census: FAIL (was `else True`)
        self.assertFalse(no_firewall_sandbox({'N1': {'n1': {'__census': {'err': 'x'}}}}))          # only an error: FAIL
        self.assertFalse(no_firewall_sandbox({'N1': {'n1': {'__census': CENSUS_ARMED}}}))          # something sandboxed: FAIL
        self.assertTrue(no_firewall_sandbox({'N1': {'n1': {'__census': CENSUS_STOCK}}}))


def f1_run(config, docs_census, hook=None):
    """Synthetic f1_*.json: 4 docs x 80 clean iterations; docs_census(i) -> the doc's __census value (or KeyError=absent)."""
    docs = []
    for i in range(4):
        doc = {'doc': i, 'o': 'http://127.0.0.1:5', 'hook': hook, 'iters': [{'p': j, 'dur': 12} for j in range(80)], 'conc': []}
        c = docs_census(i)
        if c is not KeyError: doc['__census'] = c
        docs.append(doc)
    return {'config': config, 'f1': docs, 'lsof': {'samplesWithNonLoopback': 0}, 'lan': '', 'lanReal': False, 'serverPort': 5}


class ProofF1HookGate(unittest.TestCase):
    """Proof #83 F1: armed F1 PASS requires hookStates <= {own, proto} with a census on every document."""
    def test_armed_proto_with_census_passes(self):
        r = grade_f1(f1_run('A_iso', lambda i: CENSUS_ARMED))
        self.assertTrue(r['PASS'], r['hookGate']); self.assertEqual(r['hookStates(top, own|proto|native|none)'], ['proto'])

    def test_armed_own_accessor_with_census_passes(self):
        self.assertTrue(grade_f1(f1_run('A_iso', lambda i: CENSUS_STOCK, hook='get cookie'))['PASS'])

    def test_armed_unhooked_fails(self):  # the bug the gate exists for: clean cookie results but nothing was hooked
        r = grade_f1(f1_run('A_iso', lambda i: CENSUS_STOCK))
        self.assertFalse(r['PASS']); self.assertEqual(r['hookStates(top, own|proto|native|none)'], ['native'])

    def test_armed_without_census_fails(self):
        self.assertFalse(grade_f1(f1_run('A_iso', lambda i: KeyError))['PASS'])
        self.assertFalse(grade_f1(f1_run('A_iso', lambda i: KeyError, hook='get cookie'))['PASS'])  # census required even for 'own'

    def test_armed_one_doc_missing_or_err_census_fails(self):
        r = grade_f1(f1_run('A_iso', lambda i: CENSUS_ARMED if i else KeyError))
        self.assertFalse(r['PASS']); self.assertIn('unknown', r['hookStates(top, own|proto|native|none)'])
        self.assertFalse(grade_f1(f1_run('A_iso', lambda i: CENSUS_ARMED if i else {'err': 'x'}))['PASS'])

    def test_armed_mixed_fails(self):
        mixed = [dict(CENSUS_ARMED[0]), dict(CENSUS_ARMED[0], sandboxed=False)]
        self.assertFalse(grade_f1(f1_run('A_iso', lambda i: mixed))['PASS'])

    def test_default_must_be_unhooked(self):
        self.assertTrue(grade_f1(f1_run('default', lambda i: CENSUS_STOCK))['PASS'])
        self.assertFalse(grade_f1(f1_run('default', lambda i: CENSUS_ARMED))['PASS'])


class Net(unittest.TestCase):
    LAN = '10.0.0.18'
    SELF = LOOPBACK_HOSTS | {LAN, '::ffff:' + LAN}

    def line(self, name):
        return f'librewolf 123 alex 40u IPv4 0xabc 0t0 TCP {name}'

    def test_ipv4(self):
        self.assertTrue(is_ipv4('10.0.0.18'))
        for bad in ('xor-insec.test', '10.0.0', '10.0.0.256', '', 'auto'):
            self.assertFalse(is_ipv4(bad), bad)

    def test_loopback(self):
        self.assertEqual(lsof_peer_class(self.line('127.0.0.1:50000->127.0.0.1:6000 (ESTABLISHED)'), self.LAN, self.SELF), 'loopback')
        self.assertEqual(lsof_peer_class(self.line('[::1]:50000->[::1]:6000 (ESTABLISHED)'), self.LAN, self.SELF), 'loopback')

    def test_lan_self_peer(self):
        self.assertEqual(lsof_peer_class(self.line('10.0.0.18:50000->10.0.0.18:6000 (ESTABLISHED)'), self.LAN, self.SELF), 'lan-self')

    def test_local_lan_address_does_not_hide_external_peer(self):
        # The r2 substring filter treated this as safe because "10.0.0.18:" appears on the local side.
        self.assertEqual(lsof_peer_class(self.line('10.0.0.18:50000->93.184.216.34:443 (SYN_SENT)'), self.LAN, self.SELF), 'external')
        self.assertEqual(lsof_peer_class(self.line('10.0.0.18:50000->10.0.0.1:80 (SYN_SENT)'), self.LAN, self.SELF), 'external')

    def test_lan_peer_without_lan_mode_is_external(self):
        self.assertEqual(lsof_peer_class(self.line('10.0.0.18:50000->10.0.0.18:6000 (ESTABLISHED)'), '', LOOPBACK_HOSTS), 'external')

    def test_listen(self):
        self.assertEqual(lsof_peer_class(self.line('*:5353'), self.LAN, self.SELF), 'listen')
        self.assertEqual(lsof_peer_class(self.line('127.0.0.1:6000 (LISTEN)'), self.LAN, self.SELF), 'listen')


if __name__ == '__main__':
    unittest.main(verbosity=1)
