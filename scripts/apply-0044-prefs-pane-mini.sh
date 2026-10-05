#!/usr/bin/env bash
# Run on Alexander's Mac mini (SSD). Atlas: never mv under /Volumes/Mesh.
# Pin 0044 — native darkstr about:preferences pane (modes + Native-Compatible + hooks).
# Chrome preferences UI only — no XUL relink required for JS/xhtml/ftl/jar.mn.
# Leaving Pollution clears darkstr.nativePersonaHooks (pref false), not just greys out.
set -euo pipefail
source "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"
REPO="${1:-${HOME}/src/darkstr-gecko/darkstr}"
OVERLAY="${REPO}/patches/0044-files"
PREF="${DARKSTR_GECKO_ROOT}/browser/components/preferences"
FTL="${DARKSTR_GECKO_ROOT}/browser/locales/en-US/browser/preferences/preferences.ftl"
echo "DARKSTR_GECKO_ROOT=${DARKSTR_GECKO_ROOT}"
df -h "${DARKSTR_GECKO_ROOT}" | tail -1 || true
test -f "${OVERLAY}/darkstr.js"
test -f "${OVERLAY}/darkstr.inc.xhtml"
test -f "${OVERLAY}/darkstr.mjs"
test -f "${OVERLAY}/darkstr-preferences.ftl.snippet"
test -f "${OVERLAY}/darkstrPersona-group.js.snippet"

cp -f "${OVERLAY}/darkstr.js" "${PREF}/darkstr.js"
cp -f "${OVERLAY}/darkstr.inc.xhtml" "${PREF}/darkstr.inc.xhtml"
mkdir -p "${PREF}/config"
cp -f "${OVERLAY}/darkstr.mjs" "${PREF}/config/darkstr.mjs"

python3 - "${PREF}" "${FTL}" "${OVERLAY}" <<'PY'
import pathlib, sys
pref = pathlib.Path(sys.argv[1])
ftl = pathlib.Path(sys.argv[2])
overlay = pathlib.Path(sys.argv[3])

# jar.mn
jar = (pref / "jar.mn").read_text()
if "content/browser/preferences/darkstr.js" not in jar:
    jar = jar.replace(
        "   content/browser/preferences/librewolf.js\n",
        "   content/browser/preferences/librewolf.js\n"
        "   content/browser/preferences/darkstr.js\n",
        1,
    )
if "config/darkstr.mjs" not in jar:
    jar = jar.replace(
        "   content/browser/preferences/config/about-firefox.mjs",
        "   content/browser/preferences/config/darkstr.mjs                    (config/darkstr.mjs)\n"
        "   content/browser/preferences/config/about-firefox.mjs",
        1,
    )
(pref / "jar.mn").write_text(jar)

# preferences.xhtml nav + include
xhtml = (pref / "preferences.xhtml").read_text()
nav = '''      <html:moz-page-nav-button id="category-darkstr"
        view="paneDarkstr"
        iconsrc="chrome://browser/skin/preferences/category-privacy-security.svg"
        data-l10n-id="pane-darkstr-title">
      </html:moz-page-nav-button>
'''
if "category-darkstr" not in xhtml:
    xhtml = xhtml.replace(
        '      <html:moz-page-nav-button id="category-librewolf"\n',
        nav + '      <html:moz-page-nav-button id="category-librewolf"\n',
        1,
    )
if "darkstr.inc.xhtml" not in xhtml:
    xhtml = xhtml.replace(
        "#include librewolf.inc.xhtml\n",
        "#include librewolf.inc.xhtml\n#include darkstr.inc.xhtml\n",
        1,
    )
(pref / "preferences.xhtml").write_text(xhtml)

# preferences.js CONFIG_PANES + register_module
pjs = (pref / "preferences.js").read_text()
block = '''  darkstr: {
    l10nId: "darkstr-header",
    iconSrc: "chrome://browser/skin/preferences/category-privacy-security.svg",
    groupIds: ["darkstrPersona"],
    module: "chrome://browser/content/preferences/config/darkstr.mjs",
    visible: () => true,
  },
'''
if 'darkstr: {' not in pjs:
    # insert before privacy: in CONFIG_PANES
    needle = "  privacy: {\n    l10nId: \"pane-privacy-section\""
    if needle not in pjs:
        raise SystemExit("preferences.js: privacy CONFIG_PANES anchor missing")
    pjs = pjs.replace(needle, block + needle, 1)
if 'register_module("paneDarkstr"' not in pjs:
    pjs = pjs.replace(
        'register_module("panePrivacy", gPrivacyPane);',
        'register_module("panePrivacy", gPrivacyPane);\n  register_module("paneDarkstr", gDarkstrPane);',
        1,
    )
(pref / "preferences.js").write_text(pjs)

# main.js SettingGroupManager
main = (pref / "main.js").read_text()
if "darkstrPersona:" not in main:
    group = (overlay / "darkstrPersona-group.js.snippet").read_text().rstrip() + "\n"
    anchor = "  librewolfBehavior: {"
    if anchor not in main:
        raise SystemExit("main.js: librewolfBehavior anchor missing")
    main = main.replace(anchor, group + anchor, 1)
    (pref / "main.js").write_text(main)

# ftl
ftl_text = ftl.read_text()
if "pane-darkstr-title" not in ftl_text:
    snippet = (overlay / "darkstr-preferences.ftl.snippet").read_text().rstrip() + "\n"
    if not ftl_text.endswith("\n"):
        ftl_text += "\n"
    ftl.write_text(ftl_text + "\n" + snippet)
PY

grep -Fq 'category-darkstr' "${PREF}/preferences.xhtml"
grep -Fq 'darkstr.inc.xhtml' "${PREF}/preferences.xhtml"
grep -Fq 'paneDarkstr' "${PREF}/preferences.js"
grep -Fq 'darkstrPersona' "${PREF}/main.js"
grep -Fq 'darkstr.js' "${PREF}/jar.mn"
grep -Fq 'config/darkstr.mjs' "${PREF}/jar.mn"
grep -Fq 'pane-darkstr-title' "${FTL}"
grep -Fq 'Leaving Pollution clears hooks' "${PREF}/config/darkstr.mjs"
grep -Fq 'onUserChange' "${PREF}/config/darkstr.mjs"
grep -Fq 'hooks.value = false' "${PREF}/config/darkstr.mjs"

echo "0044 sources wired. Restage chrome into app bundle + package separately when shipping a DMG."
echo "Proof gates: about:preferences darkstr pane shows Homogeneous/Pollution, Native-Compatible,"
echo "  hooks disabled unless Pollution; leaving Pollution clears checkbox + pref false."
