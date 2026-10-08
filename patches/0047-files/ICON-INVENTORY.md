# darkstr branding icon inventory (browser/branding/darkstr) — as of pin 0047

0047 changes vs 0046: `firefox.icns` (full-bleed), new `Assets.car` (macOS 26+ icon), start-page
`content/about-logo*` + `content/firefox-wordmark.svg`. Everything else is as in
[`../0046-files/ICON-INVENTORY.md`](../0046-files/ICON-INVENTORY.md).

Installed with (or `scripts/apply-0047-startpage-dockicon-mini.sh`):

    scripts/darkstr-icon-from-png.sh patches/0047-files/icon-fullbleed/icon-e-fullbleed.png <OUT> \
      --small patches/0047-files/icon-fullbleed/icon-e-fullbleed-heavy.png \
      --iconset patches/0047-files/icon-fullbleed/darkstr-fullbleed.iconset      # then copy ONLY <OUT>/firefox.icns
    scripts/darkstr-icon-assets-car.sh patches/0047-files/icon-fullbleed/icon-e-fullbleed.png 27,29,39 <OUT2> --install

| File | 0047 source | Used on macOS for |
|---|---|---|
| `firefox.icns` | PM `darkstr-fullbleed.iconset` verbatim (square, opaque #1B1D27 to the edges; 16/32 + @2x slots = heavy art, 128+ = regular) | `CFBundleIconFile` — fallback (pre-macOS 26, and anything that reads the .icns directly) |
| `Assets.car` **(new)** | `icon-e-fullbleed.png` as a one-layer Icon Composer `AppIcon.icon` (fill #1B1D27), compiled by Xcode 26 `actool` | `CFBundleIconName` = `AppIcon` → macOS 26/27 Dock / Finder / Cmd-Tab icon **without the gray legacy plate**. The .icon has one art layer, so small sizes use the regular-weight art, not the heavy art |
| `document.icns`, `disk.icns` | unchanged (0046: master, heavy 16/32) | document icon / DMG volume icon |
| `default*.png` | unchanged (0046) — full-bleed art is meant for the Dock tile, not for tab/window icons | `chrome://branding/content/iconNN.png` (tab favicon etc.) |
| `content/about-logo{,-private}{,@2x}.png` | PM `darkstr-jet-mark.svg` (outline, #9AAEFF, no tile) on transparent square, 192 / 384 (`startpage/make-logo.py`) | about:home / about:newtab logo, private-window page logo; also moz-page-nav, fxms bookmarks-menu button, QR centre logo |
| `content/firefox-wordmark.svg` | lowercase `darkstr`, IBM Plex Sans Condensed SemiBold outlined to paths (`startpage/make-wordmark.py`); #E8E9F0 on dark pages, #1C1E28 on light | about:home / about:newtab / private-window wordmark (was the "LibreWolf" outline wordmark) |

Measured on macOS 27.0.1 (`NSWorkspace iconForFile`, Dock screenshot): `.icns`-only bundles get the gray
plate whatever the art (0046 inset tile, 0047 full-bleed square, Big Sur 824 px squircle template);
the `Assets.car` + `CFBundleIconName` bundle does not. Note: the system caches icons per bundle **path** —
re-test from a fresh path (a re-used path keeps showing the old plate even after `lsregister -f`).

`chrome://branding/content` is registered `contentaccessible=yes`, but the 0047 DMG probe shows pages
cannot load any of the files above (img + fetch: blocked); activity-stream's own CSS (positive control) loads.
