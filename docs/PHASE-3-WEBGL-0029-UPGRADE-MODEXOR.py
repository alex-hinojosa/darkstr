#!/usr/bin/env python3
"""Upgrade DarkstrModeXor.sys.mjs 0029 → enriched → prompt tip-up.

Tip-up2 (after soft FAIL 0f8b3b3): unlock librewolf.webgl.prompt=false
(LW IsWebGLAllowed doorhanger; Err "WebGL is currently disabled.").
"""
from __future__ import annotations

import re
import sys
from pathlib import Path


def _extract_added_methods(patch_text: str) -> str:
    """Extract +_ensureWebGlContextPrefs through +_gfxFeatureStatusSnippet from patch."""
    lines = patch_text.splitlines()
    start = None
    for i, line in enumerate(lines):
        if line.startswith("+  /**") and "0029:" in line and (
            "unlock LibreWolf" in line or "undo LibreWolf" in line
        ):
            start = i
            break
        if line.startswith("+  _ensureWebGlContextPrefs"):
            start = i
            break
    if start is None:
        return ""
    out: list[str] = []
    for line in lines[start:]:
        if line.startswith("+"):
            out.append(line[1:])
            continue
        if out:
            break
    return "\n".join(out).rstrip() + "\n"


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: UPGRADE-MODEXOR.py <ModeXor.sys.mjs> <0029.patch>", file=sys.stderr)
        return 2
    modexor = Path(sys.argv[1])
    patch = Path(sys.argv[2])
    text = modexor.read_text()
    if (
        "_gfxFeatureStatusSnippet" in text
        and "gfx.blocklist.all" in text
        and "librewolf.webgl.prompt" in text
    ):
        print("already enriched+prompt")
        return 0
    if "_ensureWebGlContextPrefs" not in text:
        print("0029 not present — apply full patch instead", file=sys.stderr)
        return 1

    new_consts = (
        '/** 0029: LibreWolf null-context gates — webgl.disabled + librewolf.webgl.prompt. */\n'
        'const WEBGL_DISABLED_PREF = "webgl.disabled";\n'
        'const WEBGL_FORCE_ENABLED_PREF = "webgl.force-enabled";\n'
        'const WEBGL_FORBID_HARDWARE_PREF = "webgl.forbid-hardware";\n'
        'const WEBGL_FORBID_SOFTWARE_PREF = "webgl.forbid-software";\n'
        'const GFX_BLOCKLIST_ALL_PREF = "gfx.blocklist.all";\n'
        '/** StaticPref name is dotted; C++ StaticPrefs::librewolf_webgl_prompt(). */\n'
        'const LIBREWOLF_WEBGL_PROMPT_PREF = "librewolf.webgl.prompt";\n'
        'const LIBREWOLF_WEBGL_PROMPT_HIDE_PREF = "librewolf.webgl.prompt.hide";\n'
        'const WEBGL_ENSURE_APPLIED_PREF = "darkstr.webgl.ensureApplied";\n'
        'const WEBGL_LAST_STATUS_PREF = "darkstr.webgl.lastStatus";\n'
    )

    text2, n = re.subn(
        r"/\*\* 0029:.*?\*/\n"
        r"(?:const (?:WEBGL_|GFX_|LIBREWOLF_)[A-Z0-9_]+_PREF = \"[^\"]+\";\n"
        r"|/\*\* StaticPref name is dotted.*?\*/\n)+",
        new_consts,
        text,
        count=1,
        flags=re.S,
    )
    if n != 1:
        print(f"const block replace failed n={n}", file=sys.stderr)
        return 1

    body = _extract_added_methods(patch.read_text())
    if "_ensureWebGlContextPrefs" not in body or "_gfxFeatureStatusSnippet" not in body:
        print("no methods extracted from patch", file=sys.stderr)
        return 1

    text3, n = re.subn(
        r"  /\*\*\n   \* 0029:[\s\S]*?\n  \},\n"
        r"(?:  /\*\*\n   \* Enrich lastStatus[\s\S]*?\n  \},\n)?"
        r"\};",
        body + "};",
        text2,
        count=1,
    )
    if n != 1:
        text3, n = re.subn(
            r"  _ensureWebGlContextPrefs\(\) \{[\s\S]*?\n  \},\n"
            r"(?:  /\*\*[\s\S]*?_gfxFeatureStatusSnippet\(\) \{[\s\S]*?\n  \},\n)?"
            r"\};",
            body + "};",
            text2,
            count=1,
        )
    if n != 1:
        print(f"method replace failed n={n}", file=sys.stderr)
        return 1

    text3 = re.sub(
        r"Soft residual \(0029\):.*?Prefer unlocking path over inventing software GL \(Mini GPU can work\)\.",
        (
            "Soft residual (0029): LibreWolf nulls getContext('webgl') even when Canvas 2D "
            "works. Unlock webgl.disabled + force-enabled + gfx.blocklist.all=-1 AND "
            "librewolf.webgl.prompt=false (LW IsWebGLAllowed doorhanger gate — Err string "
            '"WebGL is currently disabled." is from that path, not webgl.disabled alone). '
            "Product-level on every mode apply so Proof can live-check UNMASKED + apple "
            "caps from 0017/0023 under Pollution+hooks and Homogeneous. Firefox persona "
            "only — does not invent Chrome GPU strings; depth spoof still 0017/0023. "
            "Prefer unlocking path over inventing software GL (Mini GPU can work)."
        ),
        text3,
        count=1,
        flags=re.S,
    )

    modexor.write_text(text3)
    print("surgical upgrade OK (prompt tip-up)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
