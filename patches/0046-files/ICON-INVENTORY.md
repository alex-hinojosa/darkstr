# darkstr branding icon inventory (browser/branding/darkstr) — icon E (stealth-jet outline)

Installed with:

    scripts/darkstr-icon-from-png.sh patches/0046-files/icon-e/icon-e-jet-outline.png <OUT> \
      --small patches/0046-files/icon-e/icon-e-jet-outline-heavy.png --small-upto 48 \
      --iconset patches/0046-files/icon-e/darkstr.iconset --install

Sources (PM, Shock Diamond palette; SHA-256 in `icon-e/SOURCE-SHA256SUMS`):
- `icon-e/icon-e-jet-outline.png` — 1024 master, regular lines (128 px and up, about-logo)
- `icon-e/icon-e-jet-outline-heavy.png` — 1024 heavy-line art for small sizes
- `icon-e/darkstr.iconset/` — PM iconset: 16/32 slots (incl. @2x) from heavy, 128+ from regular

| File | Built from | Used on macOS for |
|---|---|---|
| `firefox.icns` | PM `darkstr.iconset` verbatim (iconutil) | `Contents/Resources/firefox.icns` = `CFBundleIconFile` (Dock, Finder, Cmd-Tab, Force Quit) |
| `document.icns` | script default: master, 16/32 slots heavy | `CFBundleDocumentTypes` icon (.html/.pdf/… in Finder) |
| `disk.icns` | script default: master, 16/32 slots heavy | DMG volume icon `.VolumeIcon.icns` |
| `default16.png`, `default32.png` | PM iconset `icon_16x16` / `icon_32x32` (heavy) | → `chrome://branding/content/icon16/32.png` |
| `default22.png`, `default24.png`, `default48.png` | heavy art (sips) | 48 → `chrome://branding/content/icon48.png` |
| `default64.png`, `default128.png`, `default256.png` | regular master (sips) | 64/128 → `chrome://branding/content/icon64/128.png` |
| `content/about-logo{,-private}{,@2x}.png` | regular master, 192 / 384 | About dialog, about:home / about:newtab logo, about:privatebrowsing |
| `background.png` | not touched (blank 1-bit) | DMG window background |
| `content/about.png`, `about-logo.svg`, `about-wordmark.svg` | not touched | legacy / empty placeholders |
| `*.ico`, `VisualElements_*`, `PrivateBrowsing_*.png`, `msix/Assets/*`, `wiz*.bmp` | not touched (still LibreWolf) | Windows / MSIX only |

Generated-file SHA-256: `icon-e/generated/SHA256SUMS`. Wolf originals backed up on the Mini at
`~/AgentDocs/builds/darkstr-icon-e/out/replaced-originals/`.

`chrome://branding/content` is registered `contentaccessible=yes`; the 0046 DMG smoke re-ran the
web reach probe: `chrome://branding/content/about-logo.png` and `aboutDialog.css` stay **blocked**
from pages (positive controls load).
