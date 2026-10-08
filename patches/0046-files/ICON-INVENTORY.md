# darkstr branding icon inventory (browser/branding/darkstr, pin 0045 copy of LibreWolf)

All art below is still the LibreWolf wolf (byte-identical to browser/branding/librewolf) until
`scripts/darkstr-icon-from-png.sh <pm-1024.png> --install` runs.

| File | Size | Used on macOS for | Script |
|---|---|---|---|
| `firefox.icns` | 16–512 @1x/@2x (10 slots) | `Contents/Resources/firefox.icns` = `CFBundleIconFile` (Dock, Finder, Cmd-Tab, Force Quit) | generated |
| `document.icns` | 16–512 @1x/@2x | `Contents/Resources/document.icns`, `CFBundleDocumentTypes` (.html/.pdf/… in Finder) | generated (`--doc` for separate art) |
| `disk.icns` | 16–512 (+512@2x) | DMG volume icon `.VolumeIcon.icns` (`toolkit/moz.configure` `--icon`) | generated (`--disk` for separate art) |
| `default16/22/24/32/48/64/128/256.png` | as named | 16–128 → `chrome://branding/content/iconNN.png` (content/jar.mn); gtk window icons on Linux | generated |
| `content/about-logo.png` / `@2x` | 192 / 384 | About dialog, about:home / about:newtab logo | generated |
| `content/about-logo-private.png` / `@2x` | 192 / 384 | about:privatebrowsing | generated (same art) |
| `background.png` | 512×320, blank 1-bit | DMG window background | not touched |
| `content/about.png` | 300×236 | legacy, non-square | not touched |
| `content/about-logo.svg`, `about-wordmark.svg` | empty placeholders | — | not touched |
| `*.ico`, `VisualElements_*`, `PrivateBrowsing_*.png`, `msix/Assets/*`, `wiz*.bmp` | — | Windows / MSIX only | not touched |

Note: `chrome://branding/content` is registered `contentaccessible=yes`. After installing new
art, re-run the 0045 web reach probe (pages must not be able to load `chrome://branding/content/*`;
0045 measured "blocked").
