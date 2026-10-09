#!/bin/sh
set -eu

source_profile=/usr/share/Media/security/media-video.apparmor
installed_profile=/etc/apparmor.d/media-video

if [ -e "$installed_profile" ] && cmp -s "$source_profile" "$installed_profile"; then
  if command -v apparmor_parser >/dev/null 2>&1 && [ "$(cat /sys/module/apparmor/parameters/enabled 2>/dev/null || true)" = Y ]; then
    apparmor_parser -R "$installed_profile" || true
  fi
  rm -f "$installed_profile"
fi
