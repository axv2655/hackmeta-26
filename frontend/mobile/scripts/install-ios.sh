#!/usr/bin/env bash
# Build the Release iOS app once and install it on every connected iPhone.
#
#   npm run ios:install                     # all phones that are plugged in and covered by the signing profile
#   npm run ios:install -- --device Arnav   # only phones whose name or UDID contains "Arnav"
#   npm run ios:install -- --prebuild       # force `expo prebuild` + `pod install` first
#   npm run ios:install -- --skip-build     # reinstall the last build without rebuilding
#   npm run ios:install -- --dry-run        # show what would happen, change nothing
#
# The app is signed with the team profile named in app.json (the
# ./plugins/withManualSigning entry). A phone can only run that build if its
# UDID is inside the profile; phones that are not are skipped with a message
# saying so. Override the profile with APPLE_PROVISIONING_PROFILE, and the
# backend baked into the bundle with --backend URL (or EXPO_PUBLIC_BACKEND_URL;
# otherwise frontend/mobile/.env applies).
set -euo pipefail

cd "$(dirname "$0")/.."

export LANG="${LANG:-en_US.UTF-8}" LC_ALL="${LC_ALL:-en_US.UTF-8}" # CocoaPods needs UTF-8

SCHEME=hackmeta26
DERIVED=ios/build/device
APP="$DERIVED/Build/Products/Release-iphoneos/$SCHEME.app"
STAMP=ios/.install-stamp

filters=()
force_prebuild=0
skip_build=0
dry_run=0

usage() { sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    --device) [ $# -ge 2 ] || { echo "--device needs a name or UDID" >&2; exit 2; }; filters+=("$2"); shift 2 ;;
    --backend) [ $# -ge 2 ] || { echo "--backend needs a URL" >&2; exit 2; }; export EXPO_PUBLIC_BACKEND_URL="$2"; shift 2 ;;
    --prebuild) force_prebuild=1; shift ;;
    --skip-build) skip_build=1; shift ;;
    --dry-run) dry_run=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

for tool in xcodebuild xcrun python3 security; do
  command -v "$tool" >/dev/null || { echo "Missing required tool: $tool" >&2; exit 1; }
done

log() { printf '\033[1m==> %s\033[0m\n' "$*"; }

# --- signing config from app.json -------------------------------------------

read -r BUNDLE_ID APP_JSON_PROFILE < <(python3 -I - <<'PY'
import json
c = json.load(open("app.json"))["expo"]
profile = ""
for p in c.get("plugins", []):
    if isinstance(p, list) and p[0].endswith("withManualSigning"):
        profile = p[1].get("profile", "").replace(" ", " ")
print(c["ios"]["bundleIdentifier"], profile)
PY
)
PROFILE="${APPLE_PROVISIONING_PROFILE:-${APP_JSON_PROFILE//$' '/ }}"
[ -n "$PROFILE" ] || { echo "No provisioning profile: set one in app.json (withManualSigning) or APPLE_PROVISIONING_PROFILE." >&2; exit 1; }

# --- connected phones --------------------------------------------------------

connected_devices() { # prints "<udid>\t<name>" for each reachable physical device
  local json
  json=$(mktemp)
  xcrun devicectl list devices --json-output "$json" >/dev/null 2>&1 || true
  python3 -I - "$json" <<'PY'
import json, sys
try:
    devices = json.load(open(sys.argv[1]))["result"]["devices"]
except Exception:
    devices = []
for d in devices:
    hw, conn, props = d["hardwareProperties"], d["connectionProperties"], d["deviceProperties"]
    if hw.get("reality") == "simulated" or conn.get("tunnelState") != "connected":
        continue
    print(hw["udid"] + "\t" + props["name"])
PY
  rm -f "$json"
}

profile_udids() { # prints the UDIDs inside the newest unexpired profile with this name; exit 2 if none
  python3 -I - "$PROFILE" <<'PY'
import datetime, glob, os, plistlib, subprocess, sys
name = sys.argv[1]
now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
best = None
for folder in ("~/Library/Developer/Xcode/UserData/Provisioning Profiles", "~/Library/MobileDevice/Provisioning Profiles"):
    for path in glob.glob(os.path.expanduser(folder) + "/*.mobileprovision"):
        try:
            out = subprocess.run(["security", "cms", "-D", "-i", path], capture_output=True, check=True).stdout
            profile = plistlib.loads(out)
        except Exception:
            continue
        if profile.get("Name") != name or profile["ExpirationDate"] <= now:
            continue
        if best is None or profile["CreationDate"] > best["CreationDate"]:
            best = profile
if best is None:
    sys.exit(2)
print("\n".join(best.get("ProvisionedDevices", [])))
PY
}

matches_filter() { # $1 = udid, $2 = name
  [ ${#filters[@]} -eq 0 ] && return 0
  local f
  for f in "${filters[@]}"; do
    case "$1 $2" in *"$f"*) return 0 ;; esac
  done
  return 1
}

log "Looking for connected phones"
connected=$(connected_devices)
if [ -z "$connected" ]; then
  echo "No phone is connected. Plug one in over USB, unlock it and tap Trust, then try again." >&2
  exit 1
fi

set +e
allowed=$(profile_udids)
profile_status=$?
set -e
if [ "$profile_status" -ne 0 ]; then
  echo "Provisioning profile \"$PROFILE\" is not installed (or has expired)." >&2
  echo "Open Xcode > Settings > Accounts and download the manual profiles, or double-click the .mobileprovision file." >&2
  exit 1
fi

targets=()   # "<udid>\t<name>"
skipped=()
while IFS=$'\t' read -r udid name; do
  [ -n "$udid" ] || continue
  matches_filter "$udid" "$name" || continue
  if printf '%s\n' "$allowed" | grep -qx "$udid"; then
    targets+=("$udid"$'\t'"$name")
  else
    skipped+=("$name ($udid)")
  fi
done <<EOF
$connected
EOF

for s in ${skipped[@]+"${skipped[@]}"}; do :; done
if [ ${#skipped[@]} -gt 0 ]; then
  echo "Skipping phones that are not in the \"$PROFILE\" profile (add their UDID to the team's devices and regenerate the profile):"
  printf '  - %s\n' "${skipped[@]}"
fi
if [ ${#targets[@]} -eq 0 ]; then
  echo "No connected phone can run this build." >&2
  exit 1
fi

log "Installing $BUNDLE_ID on:"
printf '  - %s\n' "${targets[@]//$'\t'/  }"
[ "$dry_run" -eq 1 ] && { echo "Dry run: nothing built or installed."; exit 0; }

# --- native project and build ------------------------------------------------

native_stamp() { shasum app.json package-lock.json plugins/* 2>/dev/null | shasum | cut -d' ' -f1; }

if [ "$skip_build" -eq 0 ]; then
  if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
    log "Installing JavaScript dependencies"
    npm ci
  fi

  if [ "$force_prebuild" -eq 1 ] || [ ! -d ios/Pods ] || [ "$(cat "$STAMP" 2>/dev/null)" != "$(native_stamp)" ]; then
    log "Regenerating the native iOS project (config or native dependencies changed)"
    npx expo prebuild --platform ios --no-install
    (cd ios && pod install)
    native_stamp > "$STAMP"
  fi

  log "Building $SCHEME (Release)"
  build_log=$(mktemp)
  if ! xcodebuild -workspace "ios/$SCHEME.xcworkspace" -scheme "$SCHEME" -configuration Release \
      -destination 'generic/platform=iOS' -derivedDataPath "$DERIVED" build >"$build_log" 2>&1; then
    grep -E 'error:' "$build_log" | sort -u | head -20 >&2 || true
    echo "Build failed. Full log: $build_log" >&2
    exit 1
  fi
  rm -f "$build_log"
fi

[ -d "$APP" ] || { echo "No build found at $APP. Run without --skip-build." >&2; exit 1; }

# --- install and launch ------------------------------------------------------

failed=0
for entry in "${targets[@]}"; do
  udid=${entry%%$'\t'*}
  name=${entry#*$'\t'}
  log "$name"
  if out=$(xcrun devicectl device install app --device "$udid" "$APP" 2>&1) &&
     out=$(xcrun devicectl device process launch --terminate-existing --device "$udid" "$BUNDLE_ID" 2>&1); then
    echo "  installed and launched"
    continue
  fi
  failed=1
  echo "  failed:" >&2
  case "$out" in
    *"Developer mode is not enabled"*) echo "  Turn on Settings > Privacy & Security > Developer Mode, restart the phone, then retry." >&2 ;;
    *"could not be, unlocked"*|*Locked*) echo "  The phone is locked. Unlock it and tap the app (it is installed)." >&2 ;;
    *) printf '%s\n' "$out" | grep -E 'ERROR|NSLocalizedFailureReason|Error' | head -4 | sed 's/^/  /' >&2 ;;
  esac
done

exit "$failed"
