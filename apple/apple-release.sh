#!/usr/bin/env bash
# Unified Apple release driver for this repository's iOS/iPadOS/Mac (Apple silicon) app.
# Usage: apple/apple-release.sh preflight|build-sim|archive|upload
#   APPLE_TEAM_ID       (default from app.config.json / project)
#   ASC_KEY_ID ASC_ISSUER_ID ASC_KEY_PATH   optional App Store Connect API key for upload;
#   without them, upload uses the Apple ID signed in to Xcode (Settings > Accounts).
# Never submits for App Review: that stays a manual decision in App Store Connect.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"
APP_ID=$(python3 -c 'import json;print(json.load(open("app.config.json"))["appId"])')
PROJ=ios/App/App.xcodeproj
OUT="$HERE/build"
mkdir -p "$OUT"
step=${1:-preflight}

preflight() {
  local fail=0
  check() { if eval "$2"; then echo "  ✓ $1"; else echo "  ✗ $1"; fail=1; fi; }
  echo "Preflight for $APP_ID"
  check "Xcode available"               "xcodebuild -version >/dev/null 2>&1"
  check "Capacitor config present"      "test -f capacitor.config.json"
  check "Xcode project present"         "test -f $PROJ/project.pbxproj"
  check "Bundle ID matches config"      "grep -q \"PRODUCT_BUNDLE_IDENTIFIER = $APP_ID;\" $PROJ/project.pbxproj"
  check "Privacy manifest bundled"      "grep -q 'PrivacyInfo.xcprivacy in Resources' $PROJ/project.pbxproj"
  check "1024 app icon, no alpha"       "sips -g hasAlpha ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png | grep -q 'hasAlpha: no'"
  check "Encryption exemption declared" "/usr/libexec/PlistBuddy -c 'Print :ITSAppUsesNonExemptEncryption' ios/App/App/Info.plist | grep -q false"
  check "Store metadata present"        "test -f ../apple-release/metadata/ar.md -a -f ../apple-release/metadata/en.md"
  check "No ASC private key in repo"    "! git -C .. ls-files | grep -qiE '\\.p8$|\\.p12$|\\.mobileprovision$'"
  check "Live site reachable"           "curl -sfo /dev/null -m 20 \$(python3 -c 'import json;print(json.load(open(\"app.config.json\"))[\"url\"])')"
  return $fail
}

case "$step" in
  preflight) preflight ;;
  build-sim)
    npx cap sync ios
    xcodebuild -project $PROJ -scheme App -configuration Debug -destination 'generic/platform=iOS Simulator' \
      -derivedDataPath "$OUT/dd" CODE_SIGNING_ALLOWED=NO build | tail -3
    echo "App: $OUT/dd/Build/Products/Debug-iphonesimulator/App.app" ;;
  archive)
    preflight
    npx cap sync ios
    xcodebuild -project $PROJ -scheme App -configuration Release -destination 'generic/platform=iOS' \
      -archivePath "$OUT/App.xcarchive" -allowProvisioningUpdates ${APPLE_TEAM_ID:+DEVELOPMENT_TEAM=$APPLE_TEAM_ID} archive | tail -5
    echo "Archive: $OUT/App.xcarchive" ;;
  upload)
    test -d "$OUT/App.xcarchive" || { echo "Run archive first"; exit 1; }
    AUTH=()
    if [ -n "${ASC_KEY_ID:-}" ]; then AUTH=(-authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID" -authenticationKeyPath "$ASC_KEY_PATH"); fi
    xcodebuild -exportArchive -archivePath "$OUT/App.xcarchive" -exportOptionsPlist "$HERE/ExportOptions.plist" \
      -exportPath "$OUT/export" -allowProvisioningUpdates "${AUTH[@]}" | tail -8
    echo "Uploaded. Next: App Store Connect > TestFlight shows the build after Apple finishes processing (10–60 min)." ;;
  *) echo "unknown step $step"; exit 2 ;;
esac
