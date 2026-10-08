# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# darkstr pin 0045 — branding (copied from browser/branding/librewolf).
# Brand: darkstr — built on LibreWolf, not official LibreWolf, not Mozilla.
#
# User-visible names -> darkstr (bundle darkstr.app, appinfo.name, brand strings).
# Kept on purpose:
#   MOZ_APP_NAME=librewolf      internal binary/package-dir name; never in UA
#                               (MOZ_APP_UA_NAME=Firefox is the UA source).
#   MOZ_APP_REMOTINGNAME        unchanged (mozconfig exports LibreWolf).
#   MOZ_MACBUNDLE_ID=librewolf  -> org.mozilla.librewolf (unchanged). It is a
#                               set_define in mozilla-config.h, so changing it
#                               forces a full C++ rebuild and resets macOS TCC.
#   MOZ_APP_PROFILE=librewolf   (toolkit default) profile root unchanged:
#                               ~/Library/Application Support/librewolf
MOZ_APP_NAME=librewolf
MOZ_APP_BASENAME=darkstr
MOZ_APP_DISPLAYNAME=darkstr
MOZ_APP_REMOTINGNAME=librewolf
MOZ_MACBUNDLE_ID=librewolf
