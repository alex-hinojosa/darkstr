#!/usr/bin/env python3
"""Upgrade DarkstrModeXor.sys.mjs from 0029 v1 → enriched tip-up (blocklist + gfx status)."""
from __future__ import annotations

import re
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: UPGRADE-MODEXOR.py <ModeXor.sys.mjs> <0029.patch>", file=sys.stderr)
        return 2
    modexor = Path(sys.argv[1])
    patch = Path(sys.argv[2])
    text = modexor.read_text()
    if "_gfxFeatureStatusSnippet" in text and "gfx.blocklist.all" in text:
        print("already enriched")
        return 0
    if "_ensureWebGlContextPrefs" not in text:
        print("0029 not present — apply full patch instead", file=sys.stderr)
        return 1

    new_consts = (
        '/** 0029: LibreWolf hardening often sets webgl.disabled=true (null context). */\n'
        'const WEBGL_DISABLED_PREF = "webgl.disabled";\n'
        'const WEBGL_FORCE_ENABLED_PREF = "webgl.force-enabled";\n'
        'const WEBGL_FORBID_HARDWARE_PREF = "webgl.forbid-hardware";\n'
        'const WEBGL_FORBID_SOFTWARE_PREF = "webgl.forbid-software";\n'
        'const GFX_BLOCKLIST_ALL_PREF = "gfx.blocklist.all";\n'
        'const WEBGL_ENSURE_APPLIED_PREF = "darkstr.webgl.ensureApplied";\n'
        'const WEBGL_LAST_STATUS_PREF = "darkstr.webgl.lastStatus";\n'
    )
    text2, n = re.subn(
        r'/\*\* 0029: LibreWolf hardening often sets webgl\.disabled=true \(null context\)\. \*/\n'
        r'const WEBGL_DISABLED_PREF = "webgl\.disabled";\n'
        r'const WEBGL_FORCE_ENABLED_PREF = "webgl\.force-enabled";\n'
        r'const WEBGL_ENSURE_APPLIED_PREF = "darkstr\.webgl\.ensureApplied";\n'
        r'const WEBGL_LAST_STATUS_PREF = "darkstr\.webgl\.lastStatus";\n',
        new_consts,
        text,
        count=1,
    )
    if n != 1:
        print("const block replace failed", file=sys.stderr)
        return 1

    methods: list[str] = []
    in_methods = False
    for line in patch.read_text().splitlines():
        if line.startswith("+  _ensureWebGlContextPrefs"):
            in_methods = True
        if in_methods:
            if line.startswith("+"):
                methods.append(line[1:])
            elif line.startswith(" "):
                break
    if not methods:
        print("no methods extracted from patch", file=sys.stderr)
        return 1
    body = "\n".join(methods).rstrip() + "\n"

    text3, n = re.subn(
        r"  /\*\*\n   \* 0029: undo LibreWolf webgl\.disabled hardening[\s\S]*?\n  \},\n\};",
        body + "};",
        text2,
        count=1,
    )
    if n != 1:
        text3, n = re.subn(
            r"  _ensureWebGlContextPrefs\(\) \{[\s\S]*?\n  \},\n\};",
            body + "};",
            text2,
            count=1,
        )
    if n != 1:
        print(f"method replace failed n={n}", file=sys.stderr)
        return 1

    # Also refresh file header soft-residual comment if still v1 wording
    text3 = text3.replace(
        "Force-enable WebGL\n"
        " * prefs on every mode apply so Proof can live-check UNMASKED vendor/renderer + apple\n"
        " * cap buckets from 0017/0023 under Pollution+hooks and Homogeneous. Firefox persona\n"
        " * only — does not invent Chrome GPU strings; depth spoof still 0017/0023.",
        "Force-enable WebGL\n"
        " * prefs + gfx.blocklist.all=-1 (ignore feature blocklisting; +1 forces block-all)\n"
        " * on every mode apply so Proof can live-check UNMASKED vendor/renderer + apple\n"
        " * cap buckets from 0017/0023 under Pollution+hooks and Homogeneous. Firefox persona\n"
        " * only — does not invent Chrome GPU strings; depth spoof still 0017/0023.\n"
        " * Prefer unlocking path over inventing software GL (Mini GPU can work).",
    )

    modexor.write_text(text3)
    print("surgical upgrade OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
