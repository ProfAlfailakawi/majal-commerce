#!/usr/bin/env bash
# Google Play release driver for this repository's Android app (Capacitor shell).
# Usage: google/google-release.sh preflight|sync|build-debug|bundle
#   The web pages come from ../apple/www (single source for both shells).
#   bundle signs with the upload key kept outside Git:
#     UPLOAD_KEYSTORE UPLOAD_STORE_PASS UPLOAD_KEY_ALIAS UPLOAD_KEY_PASS   if already exported, used as is;
#     otherwise ~/.play-upload-keys/<package>-upload.p12 with its password from the macOS keychain.
# Never uploads to Google Play: that stays a manual decision in Play Console.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"
PKG=$(python3 -c 'import json;print(json.load(open("capacitor.config.json"))["appId"])')
URL=$(python3 -c 'import json;print(json.load(open("capacitor.config.json"))["server"]["url"])')
[ -d /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ] && export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home}"
[ -d /opt/homebrew/share/android-commandlinetools ] && export ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
[ -n "${JAVA_HOME:-}" ] && export PATH="$JAVA_HOME/bin:$PATH"
step=${1:-preflight}

preflight() {
  local fail=0
  check() { if eval "$2"; then echo "  ✓ $1"; else echo "  ✗ $1"; fail=1; fi; }
  echo "Preflight for $PKG"
  check "Java available"                "java -version >/dev/null 2>&1"
  check "Android SDK located"           "test -n \"\${ANDROID_HOME:-}\" -o -f android/local.properties"
  check "Capacitor config present"      "test -f capacitor.config.json"
  check "Gradle project present"        "test -f android/app/build.gradle"
  check "Package matches config"        "grep -q \"applicationId \\\"$PKG\\\"\" android/app/build.gradle"
  check "Same site as the Apple app"    "grep -q \"\\\"$URL\\\"\" ../apple/capacitor.config.json"
  check "Shared pages present"          "test -f ../apple/www/index.html -a -f ../apple/www/offline.html"
  check "No signing key in repo"        "! git -C .. ls-files | grep -qiE '\\.jks$|\\.keystore$|\\.p12$|\\.pem$|keystore\\.properties$'"
  check "Live site reachable"           "curl -sfo /dev/null -m 20 $URL"
  return $fail
}

sync() {
  rm -rf www && cp -R ../apple/www www
  [ -d node_modules ] || npm ci --no-audit --no-fund >/dev/null
  npx cap sync android
}

case "$step" in
  preflight) preflight ;;
  sync) sync ;;
  build-debug)
    sync
    (cd android && ./gradlew assembleDebug --no-daemon -q)
    ls -la android/app/build/outputs/apk/debug/*.apk ;;
  bundle)
    preflight
    sync
    if [ -z "${UPLOAD_KEYSTORE:-}" ]; then
      KS="$HOME/.play-upload-keys/$PKG-upload.p12"
      test -f "$KS" || { echo "Upload key not found: export UPLOAD_KEYSTORE and its passwords first"; exit 1; }
      P=$(security find-generic-password -s "play-upload-v2-$PKG" -a upload -w)
      ALIAS=$(keytool -list -keystore "$KS" -storetype PKCS12 -storepass "$P" 2>/dev/null | grep -E 'PrivateKeyEntry' | head -1 | cut -d, -f1)
      export UPLOAD_KEYSTORE="$KS" UPLOAD_STORE_PASS="$P" UPLOAD_KEY_PASS="$P" UPLOAD_KEY_ALIAS="$ALIAS"
    fi
    (cd android && ./gradlew bundleRelease --no-daemon -q)
    ls -la android/app/build/outputs/bundle/release/*.aab
    keytool -printcert -jarfile android/app/build/outputs/bundle/release/app-release.aab 2>/dev/null | grep -E 'SHA256' | head -1
    echo "Signed bundle ready. Upload it in Play Console yourself (internal testing first)." ;;
  *) echo "unknown step $step"; exit 2 ;;
esac
