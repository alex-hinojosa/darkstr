#!/usr/bin/env bash
# Run on Alexander's Mac mini (SSD). Atlas: never mv under /Volumes/Mesh.
# Pin 0045 — darkstr branding (LibreWolf -> darkstr) + default darkstr dark theme
#   + About dialog copy. Chrome/branding only — no persona/engine/fingerprinting change.
# Web persona stays Firefox: MOZ_APP_UA_NAME=Firefox (UA source), MOZ_APP_NAME kept
#   librewolf (internal binary), navigator.* hardcoded in Gecko. 'darkstr' is chrome-only.
# Profile root unchanged (MOZ_APP_PROFILE=librewolf); bundle id unchanged (org.mozilla.librewolf).
# Requires reconfigure (mozconfig --with-branding) + incremental build with the 25.6.0 objdir.
set -euo pipefail
source "${HOME}/src/darkstr-gecko/DARKSTR_GECKO_ROOT.env"
REPO="${1:-${HOME}/src/darkstr-gecko/darkstr}"
OVERLAY="${REPO}/patches/0045-files"
ROOT="${DARKSTR_GECKO_ROOT}"
BR_SRC="${ROOT}/browser/branding/librewolf"
BR="${ROOT}/browser/branding/darkstr"
THEMES="${ROOT}/browser/themes"
echo "DARKSTR_GECKO_ROOT=${ROOT}"
df -h "${ROOT}" | tail -1 || true
for f in branding/configure.sh branding/dsstore branding/locales/en-US/brand.ftl \
         branding/locales/en-US/brand.properties branding/locales/en-US/brand.dtd \
         theme/manifest.json theme/manifest.violet.json \
         theme/icon.svg theme/preview.svg \
         ui-fonts/darkstr-cockpit-fonts.css ui-fonts/IBMPlexSansCondensed-Regular.woff2 \
         ui-fonts/IBMPlexMono-Regular.woff2 ui-fonts/LICENSE-IBM-Plex-OFL.txt \
         about-darkstr.ftl.snippet librewolf-cfg-0045.snippet; do
  test -f "${OVERLAY}/${f}"
done

# 1) browser/branding/darkstr = copy of librewolf branding (icons/content kept byte-identical:
#    chrome://branding/content is contentaccessible=yes, so it must not drift from LibreWolf).
if [[ ! -d "${BR}" ]]; then
  cp -Rp "${BR_SRC}" "${BR}"
  echo "Copied branding/librewolf -> branding/darkstr"
fi
cp -f "${OVERLAY}/branding/configure.sh" "${BR}/configure.sh"
cp -f "${OVERLAY}/branding/locales/en-US/brand.ftl" "${BR}/locales/en-US/brand.ftl"
cp -f "${OVERLAY}/branding/locales/en-US/brand.properties" "${BR}/locales/en-US/brand.properties"
cp -f "${OVERLAY}/branding/locales/en-US/brand.dtd" "${BR}/locales/en-US/brand.dtd"
# DMG Finder layout (.DS_Store): LibreWolf shipped Mozilla's generic dsstore (icon positions keyed
# to "Firefox Nightly.app"/"Nightly.app"). darkstr's positions darkstr.app at the same spot,
# Applications alias (" ") unchanged. Background alias/blank background.png unchanged.
cp -f "${OVERLAY}/branding/dsstore" "${BR}/dsstore"
# Windows NSIS names only (macOS build ignores branding.nsi).
sed -i '' -E 's/^(!define (BrandFullNameInternal|BrandFullName|CompanyName)[[:space:]]+)"LibreWolf"/\1"darkstr"/' "${BR}/branding.nsi"

# 2) Theme files
mkdir -p "${THEMES}/addons/darkstr"
# Palette: ALL theme colors live in ONE file (the static theme manifest). Flat colors only —
# no images/textures, no tab/toolbar shape/size changes (outer-vs-inner window size stays stock).
# Default palette = Shock Diamond (theme/manifest.json). Non-default alternative:
#   DARKSTR_THEME_PALETTE=violet -> theme/manifest.violet.json
PALETTE="${DARKSTR_THEME_PALETTE:-default}"
case "${PALETTE}" in
  default) THEME_MANIFEST="${OVERLAY}/theme/manifest.json" ;;
  violet) THEME_MANIFEST="${OVERLAY}/theme/manifest.violet.json" ;;
  *) echo "unknown DARKSTR_THEME_PALETTE=${PALETTE}" >&2; exit 1 ;;
esac
echo "Theme palette: ${PALETTE} ($(basename "${THEME_MANIFEST}"))"
cp -f "${THEME_MANIFEST}" "${THEMES}/addons/darkstr/manifest.json"
cp -f "${OVERLAY}/theme/icon.svg" "${THEMES}/addons/darkstr/icon.svg"
cp -f "${OVERLAY}/theme/preview.svg" "${THEMES}/addons/darkstr/preview.svg"

# 3) Cockpit UI fonts — chrome-only package chrome://darkstr-ui (NOT contentaccessible).
#    Never under chrome://browser or chrome://branding (both contentaccessible=yes),
#    never in Contents/Resources/fonts (bundled fonts are visible to web content).
UIF="${THEMES}/addons/darkstr-ui"
mkdir -p "${UIF}/fonts"
cp -f "${OVERLAY}/ui-fonts/darkstr-cockpit-fonts.css" "${UIF}/darkstr-cockpit-fonts.css"
for f in IBMPlexSansCondensed-Regular.woff2 IBMPlexMono-Regular.woff2 LICENSE-IBM-Plex-OFL.txt; do
  cp -f "${OVERLAY}/ui-fonts/${f}" "${UIF}/fonts/${f}"
done

python3 - "${ROOT}" "${OVERLAY}" <<'PY'
import json, pathlib, re, sys
root = pathlib.Path(sys.argv[1])
overlay = pathlib.Path(sys.argv[2])

def edit(path, fn):
    p = root / path
    old = p.read_text()
    new = fn(old)
    if new != old:
        p.write_text(new)
        print(f"edited {path}")

# mozconfig (+ lw/mozconfig.new template): switch branding, darkstr package file name.
def mozconfig(t):
    t = t.replace("ac_add_options --with-branding=browser/branding/librewolf\n",
                  "ac_add_options --with-branding=browser/branding/darkstr\n")
    if "--with-branding=browser/branding/darkstr" not in t:
        raise SystemExit("mozconfig: --with-branding anchor missing")
    if "MOZ_PKG_APPNAME=darkstr" not in t:
        t = t.replace("ac_add_options --with-branding=browser/branding/darkstr\n",
                      "ac_add_options --with-branding=browser/branding/darkstr\n"
                      "# darkstr 0045: package file names darkstr-<ver>.<locale>.<platform>.dmg\n"
                      "export MOZ_PKG_APPNAME=darkstr\n", 1)
    return t
for mc in ("mozconfig", "lw/mozconfig.new"):
    if (root / mc).exists():
        edit(mc, mozconfig)

# About dialog: darkstr wordmark + darkstr copy under name/version.
def about_xhtml(t):
    t = t.replace('<label id="wordmark">LibreWolf</label>', '<label id="wordmark">darkstr</label>')
    t = t.replace('<label id="aboutText" data-l10n-id="about-librewolf" />',
                  '<label id="aboutText" data-l10n-id="about-darkstr" />')
    if '<label id="wordmark">darkstr</label>' not in t or 'about-darkstr' not in t:
        raise SystemExit("aboutDialog.xhtml anchors missing")
    return t
edit("browser/base/content/aboutDialog.xhtml", about_xhtml)

def about_ftl(t):
    if "about-darkstr =" in t:
        return t
    snip = (overlay / "about-darkstr.ftl.snippet").read_text().rstrip() + "\n"
    if not t.endswith("\n"):
        t += "\n"
    return t + "\n" + snip
edit("browser/locales/en-US/browser/aboutDialog.ftl", about_ftl)

# Builtin theme registration (jar.mn + BuiltInThemeConfig).
def jar(t):
    if "content/builtin-themes/darkstr/manifest.json" in t:
        return t
    anchor = "  content/builtin-themes/dark/manifest.json        (dark/manifest.json)\n"
    if anchor not in t:
        raise SystemExit("themes/addons/jar.mn dark anchor missing")
    block = ("\n"
             "  content/builtin-themes/darkstr/preview.svg       (darkstr/preview.svg)\n"
             "  content/builtin-themes/darkstr/icon.svg          (darkstr/icon.svg)\n"
             "  content/builtin-themes/darkstr/manifest.json     (darkstr/manifest.json)\n")
    return t.replace(anchor, anchor + block, 1)
edit("browser/themes/addons/jar.mn", jar)

def jar_fonts(t):
    if "content darkstr-ui " in t:
        return t
    if not t.endswith("\n"):
        t += "\n"
    return t + (
        "\n"
        "# darkstr pin 0045: chrome-only UI fonts. NO contentaccessible flag (web must not reach these).\n"
        "%  content darkstr-ui %content/darkstr-ui/\n"
        "  content/darkstr-ui/darkstr-cockpit-fonts.css                (darkstr-ui/darkstr-cockpit-fonts.css)\n"
        "  content/darkstr-ui/fonts/IBMPlexSansCondensed-Regular.woff2 (darkstr-ui/fonts/IBMPlexSansCondensed-Regular.woff2)\n"
        "  content/darkstr-ui/fonts/IBMPlexMono-Regular.woff2          (darkstr-ui/fonts/IBMPlexMono-Regular.woff2)\n"
        "  content/darkstr-ui/fonts/LICENSE-IBM-Plex-OFL.txt           (darkstr-ui/fonts/LICENSE-IBM-Plex-OFL.txt)\n")
edit("browser/themes/addons/jar.mn", jar_fonts)

def shared_css(t):
    imp = '@import url("chrome://darkstr-ui/content/darkstr-cockpit-fonts.css");\n'
    if imp in t:
        return t
    anchor = '@import url("chrome://browser/skin/formautofill-notification.css");\n'
    if anchor not in t:
        raise SystemExit("browser-shared.css @import anchor missing")
    return t.replace(anchor, anchor + imp, 1)
edit("browser/themes/shared/browser-shared.css", shared_css)

def btc(t):
    if '"darkstr-theme@darkstr"' in t:
        return t
    anchor = '      path: "resource://builtin-themes/dark/",\n      inApp: true,\n    },\n  ],\n'
    if anchor not in t:
        raise SystemExit("BuiltInThemeConfig dark anchor missing")
    entry = ('  [\n'
             '    // darkstr pin 0045 — default dark theme (chrome only; content follows system).\n'
             '    "darkstr-theme@darkstr",\n'
             '    {\n'
             '      version: "1.0.0",\n'
             '      path: "resource://builtin-themes/darkstr/",\n'
             '    },\n'
             '  ],\n')
    return t.replace(anchor, anchor + entry, 1)
edit("browser/themes/BuiltInThemeConfig.sys.mjs", btc)

# First-run race: the default theme's fallback guard only trusts builtin theme IDs ending
# in "@mozilla.org"; with activeThemeID=darkstr-theme@darkstr the default theme could win
# the install race on a fresh profile and pin activeThemeID=default-theme. Treat the
# darkstr builtin theme like a Mozilla builtin (no behaviour change for other themes).
def xpi(t):
    if "darkstr-theme@darkstr" in t:
        return t
    old = '        (!lastSelectedTheme.endsWith("@mozilla.org") &&\n'
    new = ('        // darkstr pin 0045: darkstr-theme@darkstr is a builtin theme too.\n'
           '        (!lastSelectedTheme.endsWith("@mozilla.org") &&\n'
           '          lastSelectedTheme !== "darkstr-theme@darkstr" &&\n')
    if old not in t:
        raise SystemExit("XPIInstall.sys.mjs lastSelectedTheme guard anchor missing")
    return t.replace(old, new, 1)
edit("toolkit/mozapps/extensions/internal/XPIInstall.sys.mjs", xpi)

# policies.json user-visible message (chrome only).
def policies(t):
    return t.replace('"LibreWolf does not allow installing Language Packs."',
                     '"darkstr does not allow installing Language Packs."')
edit("lw/policies.json", policies)
json.loads((root / "lw/policies.json").read_text())

# librewolf.cfg defaults block (idempotent).
def cfg(t):
    snip = (overlay / "librewolf-cfg-0045.snippet").read_text().rstrip() + "\n"
    if "// BEGIN darkstr-0045-branding" in t:
        # refresh the block in place (idempotent)
        return re.sub(r"// BEGIN darkstr-0045-branding\n.*?// END darkstr-0045-branding\n",
                      lambda m: snip, t, count=1, flags=re.S)
    if not t.endswith("\n"):
        t += "\n"
    return t + "\n" + snip
edit("lw/librewolf.cfg", cfg)
PY

# Assertions
grep -Fq 'MOZ_APP_DISPLAYNAME=darkstr' "${BR}/configure.sh"
cmp -s "${OVERLAY}/branding/dsstore" "${BR}/dsstore"
python3 -c 'import sys; b=open(sys.argv[1],"rb").read(); assert "darkstr.app".encode("utf-16-be") in b and "Nightly.app".encode("utf-16-be") not in b' "${BR}/dsstore"
grep -Fq 'MOZ_APP_NAME=librewolf' "${BR}/configure.sh"
grep -Fq 'MOZ_MACBUNDLE_ID=librewolf' "${BR}/configure.sh"
grep -Fq -- '-brand-short-name = darkstr' "${BR}/locales/en-US/brand.ftl"
grep -Fq 'brandShortName=darkstr' "${BR}/locales/en-US/brand.properties"
grep -Fq -- '--with-branding=browser/branding/darkstr' "${ROOT}/mozconfig"
grep -Fq 'MOZ_PKG_APPNAME=darkstr' "${ROOT}/mozconfig"
grep -Fq 'about-darkstr' "${ROOT}/browser/base/content/aboutDialog.xhtml"
grep -Fq 'Not an anti-detect browser.' "${ROOT}/browser/locales/en-US/browser/aboutDialog.ftl"
grep -Fq 'builtin-themes/darkstr/manifest.json' "${THEMES}/addons/jar.mn"
grep -Fq 'darkstr-theme@darkstr' "${THEMES}/BuiltInThemeConfig.sys.mjs"
grep -Fq 'lastSelectedTheme !== "darkstr-theme@darkstr"' "${ROOT}/toolkit/mozapps/extensions/internal/XPIInstall.sys.mjs"
grep -Fq '"content_color_scheme": "system"' "${THEMES}/addons/darkstr/manifest.json"
# Flat-colors-only guard (no images/textures; only color_scheme + content_color_scheme props).
python3 - "${THEMES}/addons/darkstr/manifest.json" <<'PY2'
import json, sys
d = json.load(open(sys.argv[1])); t = d['theme']
assert set(t) == {'properties', 'colors'}, t.keys()
assert set(t['properties']) == {'color_scheme', 'content_color_scheme'}
assert t['properties']['content_color_scheme'] == 'system'
# Stock geometry: any lwtheme draws a 1px tabs/nav-bar separator unless toolbar_top_separator is
# fully transparent (ThemeVariableMap -> --tabs-navbar-separator-style: none). Stock = none.
assert d['theme']['colors'].get('toolbar_top_separator') == 'transparent', 'toolbar_top_separator must be transparent (stock height)'
assert d['browser_specific_settings']['gecko']['id'] == 'darkstr-theme@darkstr'
PY2
grep -Fq 'BEGIN darkstr-0045-branding' "${ROOT}/lw/librewolf.cfg"
grep -Fq 'darkstr.ui.cockpitFonts", true' "${ROOT}/lw/librewolf.cfg"
grep -Fq 'content darkstr-ui %content/darkstr-ui/' "${THEMES}/addons/jar.mn"
! grep -E 'content darkstr-ui .*contentaccessible' "${THEMES}/addons/jar.mn"
grep -Fq 'chrome://darkstr-ui/content/darkstr-cockpit-fonts.css' "${THEMES}/shared/browser-shared.css"
test -f "${THEMES}/addons/darkstr-ui/fonts/LICENSE-IBM-Plex-OFL.txt"
grep -Fq 'extensions.activeThemeID", "darkstr-theme@darkstr"' "${ROOT}/lw/librewolf.cfg"
# Web persona guard: UA name must stay Firefox; no brand in UA sources.
grep -A3 'env="MOZ_APP_UA_NAME"' "${ROOT}/toolkit/moz.configure" | grep -Fq 'default="Firefox"'
# contentaccessible branding content must stay identical to LibreWolf's.
diff -r "${BR_SRC}/content" "${BR}/content" >/dev/null

echo "0045 sources wired."
echo "Build (25.6.0 objdir ONLY; reconfigure picks up --with-branding):"
echo "  cd \"${ROOT}\" && MOZ_OBJDIR=\"${ROOT}/obj-aarch64-apple-darwin25.6.0\" ./mach build"
echo "Dev bundle becomes dist/darkstr.app (dist/LibreWolf.app is stale, leave it)."
echo "Staged app/omni.ja only refreshes via: make -C <objdir>/browser/installer stage-package"
echo "Package (later, with color-theme follow-ups): darkstr-156.0.1.en-US.mac.dmg."
echo "Proof gates: UA/navigator unchanged vs latch; About shows darkstr + copy;"
echo "  theme darkstr active on fresh profile; prefers-color-scheme follows system (RFP off),"
echo "  light under RFP (stock); 0044 darkstr pane intact; hooks default-off."
