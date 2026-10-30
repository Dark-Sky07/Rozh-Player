#!/usr/bin/env bash
# Prepare the Android signing material for a release build.
#
# WHY THIS EXISTS
# ---------------
# Android only installs an update whose signing certificate matches the one the
# installed app already has. Every release up to and including v1.1.0 was signed
# with a keystore generated inside the runner and thrown away afterwards, so
# those installations can never be updated in place (INSTALL_FAILED_UPDATE_
# INCOMPATIBLE). See docs/SIGNING-AND-UPDATES.md.
#
# This step refuses to build when the stable key is missing instead of quietly
# producing yet another APK with an unmatched signature.
#
# Inputs (repository Actions secrets, never printed):
#   ANDROID_KEYSTORE_BASE64      base64 of the .jks file
#   ANDROID_KEYSTORE_PASSWORD    store password
#   ANDROID_KEY_PASSWORD         key password (may equal the store password)
#   ANDROID_KEY_ALIAS            key alias inside the keystore

set -euo pipefail

required=(ANDROID_KEYSTORE_BASE64 ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_PASSWORD ANDROID_KEY_ALIAS)
missing=()
for name in "${required[@]}"; do
  [ -n "${!name:-}" ] || missing+=("$name")
done

if [ "${#missing[@]}" -gt 0 ]; then
  echo "::error title=android signing::missing secrets: ${missing[*]}"
  cat >&2 <<'MSG'
The stable Android signing key is not configured. Refusing to build: an APK
signed with a fresh throwaway key cannot update any existing installation.

Add these repository secrets (values, not names, and never in a chat):

  ANDROID_KEYSTORE_BASE64      base64 -w0 release.jks
  ANDROID_KEYSTORE_PASSWORD    store password
  ANDROID_KEY_PASSWORD         key password
  ANDROID_KEY_ALIAS            key alias

Procedure: docs/SIGNING-AND-UPDATES.md
MSG
  exit 1
fi

umask 077
ks="src-tauri/keystore/release.jks"
mkdir -p "$(dirname "$ks")"
printf '%s' "$ANDROID_KEYSTORE_BASE64" | base64 --decode > "$ks"
chmod 600 "$ks"

# Prove the secrets belong together before spending twenty minutes on a build:
# opening the alias with the given passwords fails on a mistyped value or on a
# keystore that is not really a keystore.
if command -v keytool >/dev/null; then
  keytool -list -keystore "$ks" -storepass "$ANDROID_KEYSTORE_PASSWORD" -alias "$ANDROID_KEY_ALIAS" >/dev/null \
    || { echo "::error title=android signing::alias '$ANDROID_KEY_ALIAS' or its password does not open the keystore"; exit 1; }
else
  echo "::warning title=android signing::keytool missing, keystore contents not verified"
fi

mkdir -p src-tauri/gen/android
cat > src-tauri/gen/android/keystore.properties <<EOF
password=$ANDROID_KEYSTORE_PASSWORD
keyAlias=$ANDROID_KEY_ALIAS
storeFile=$PWD/$ks
EOF
chmod 600 src-tauri/gen/android/keystore.properties

if [ -n "${GITHUB_ENV:-}" ]; then
  printf 'ANDROID_SIGNING_KEYSTORE=%s\n' "$PWD/$ks" >>"$GITHUB_ENV"
fi

echo "android signing ready: $ks (alias $ANDROID_KEY_ALIAS)"
