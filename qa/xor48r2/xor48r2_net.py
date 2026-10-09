#!/usr/bin/env python3
"""Network classification helpers for xor48r2.py (no side effects on import; unit-tested by selftest_xor48r2.py)."""
LOOPBACK_HOSTS = frozenset({'127.0.0.1', '::1', '[::1]', 'localhost', '::ffff:127.0.0.1'})


def is_ipv4(s):
    parts = (s or '').split('.')
    return len(parts) == 4 and all(p.isdigit() and 0 <= int(p) <= 255 for p in parts)


def _host(ep):
    return ep.rsplit(':', 1)[0].strip('[]') if ':' in ep else ep


def lsof_peer_class(line, lan='', self_hosts=LOOPBACK_HOSTS):
    """One `lsof -i -n -P` line -> 'loopback' | 'lan-self' | 'external' | 'listen'.

    Judged on the REMOTE end (after '->'). The r2 harness tested substrings of the whole line, so a socket whose
    LOCAL address was the LAN IP would have been counted as safe whatever its peer was.
    lan: this host's own LAN IPv4 when a real-LAN-IP run is active, else ''."""
    if not line.strip():
        return 'listen'
    name = line.split(None, 8)[-1].split(' (')[0]
    if '->' not in name:
        h = _host(name)
        return 'listen' if h in ('*', '') or h in self_hosts or ('[' + h + ']') in self_hosts else 'external'
    rh = _host(name.split('->', 1)[1])
    if rh in LOOPBACK_HOSTS or ('[' + rh + ']') in LOOPBACK_HOSTS:
        return 'loopback'
    if lan and rh in (lan, '::ffff:' + lan):
        return 'lan-self'
    return 'external'
