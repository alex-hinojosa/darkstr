#!/usr/bin/env python3
"""Offline self-test for qa/xor55r2: persona presence by (platform, cores, languages, TZ), not by UA."""
import importlib, json, os, sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

MINI = {'userAgent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Gecko/20100101 Firefox/140.0',
        'platform': 'MacIntel', 'hardwareConcurrency': 12, 'languages': ['en-US', 'en'], 'tz': 'America/Chicago'}


def load(env=None):
    os.environ.pop('XOR_NATIVE_TUPLE', None)
    if env is not None:
        os.environ['XOR_NATIVE_TUPLE'] = json.dumps(env)
    import persona_presence
    return importlib.reload(persona_presence)


class Presence(unittest.TestCase):
    def tearDown(self):
        os.environ.pop('XOR_NATIVE_TUPLE', None)

    def test_fallback_is_mini(self):
        pp = load()
        self.assertEqual(pp.NATIVE_SOURCE, 'fallback-mini')
        self.assertFalse(pp.APPLIED(MINI))

    def test_ua_alone_is_not_presence(self):
        pp = load()
        self.assertFalse(pp.APPLIED(dict(MINI, userAgent='something else')))

    def test_each_single_field_counts(self):
        pp = load()
        for k, v in (('platform', 'Win32'), ('hardwareConcurrency', 8), ('languages', ['en-US']), ('tz', 'Europe/Berlin')):
            n = dict(MINI, **{k: v})
            self.assertTrue(pp.APPLIED(n), k)
            self.assertEqual(pp.applied_fields(n), [k])

    def test_describe_never_reports_ua(self):
        pp = load()
        d = pp.describe(dict(MINI, languages=['de-DE', 'de'], tz='Europe/Berlin'))
        self.assertEqual(d['differs'], ['languages', 'tz'])
        self.assertNotIn('Firefox', json.dumps(d))

    def test_language_order_matters(self):
        self.assertTrue(load().APPLIED(dict(MINI, languages=['en', 'en-US'])))

    def test_missing_record_is_applied_not_crash(self):
        pp = load()
        self.assertTrue(pp.APPLIED(None))
        self.assertTrue(pp.APPLIED({}))

    def test_env_override(self):
        pp = load(['MacIntel', 8, ['de-DE'], 'Europe/Berlin'])
        self.assertEqual(pp.NATIVE_SOURCE, 'env')
        self.assertTrue(pp.APPLIED(MINI))
        self.assertFalse(pp.APPLIED(dict(MINI, hardwareConcurrency=8, languages=['de-DE'], tz='Europe/Berlin')))

    def test_rfp_baseline_is_not_native(self):
        # the default (RFP) config shows 8 cores / Reykjavik on the Mini; a persona-less Pollution doc is not "applied"
        # only because it differs from that, so the module must never take the native tuple from it
        pp = load()
        self.assertFalse(hasattr(pp, 'set_native_from_baseline'))
        self.assertFalse(pp.APPLIED(MINI))


class Graders(unittest.TestCase):
    def test_graders_import_shared_module(self):
        here = Path(__file__).resolve().parent
        for f in ('grade49x.py', 'grade51x.py', 'grade51pop.py'):
            t = (here / f).read_text()
            self.assertIn('from persona_presence import APPLIED', t, f)
            self.assertNotIn("NATIVE_T = ('MacIntel'", t, f)
            compile(t, f, 'exec')


if __name__ == '__main__':
    unittest.main(verbosity=1)
