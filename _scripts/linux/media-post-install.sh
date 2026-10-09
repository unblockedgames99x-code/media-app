#!/bin/sh
set -eu

source_profile=/usr/share/Media/security/media-video.apparmor
installed_profile=/etc/apparmor.d/media-video

if [ ! -r /etc/apparmor.d/abi/4.0 ] || ! command -v apparmor_parser >/dev/null 2>&1; then
  exit 0
fi

if [ -e "$installed_profile" ] && ! cmp -s "$source_profile" "$installed_profile"; then
  printf '%s\n' 'Media preserved the administrator-modified AppArmor profile at /etc/apparmor.d/media-video.'
  exit 0
fi

install -m 644 "$source_profile" "$installed_profile"

if [ "$(cat /sys/module/apparmor/parameters/enabled 2>/dev/null || true)" = Y ]; then
  apparmor_parser -r "$installed_profile"
fi
