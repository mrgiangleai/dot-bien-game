#!/bin/bash
# Tạo "Đột Biến.app": bấm đúp để mở game trong cửa sổ riêng (Chrome chế độ app).
# Chạy lại script này nếu di chuyển thư mục dự án.
set -euo pipefail

PROJECT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$PROJECT/Đột Biến.app"
TMP="$(mktemp -d)"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

# ---- icon ----
python3 "$PROJECT/tools/make_icon.py" "$TMP/icon.png" >/dev/null
ICONSET="$TMP/AppIcon.iconset"
mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z $s $s "$TMP/icon.png" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  sips -z $((s * 2)) $((s * 2)) "$TMP/icon.png" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"

# ---- Info.plist ----
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Đột Biến</string>
  <key>CFBundleDisplayName</key><string>Đột Biến</string>
  <key>CFBundleIdentifier</key><string>local.dotbien.game</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>launcher</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
PLIST

# ---- launcher: bật server nội bộ -> mở cửa sổ game -> đóng cửa sổ thì tắt server ----
cat > "$APP/Contents/MacOS/launcher" <<LAUNCH
#!/bin/bash
PROJECT="$PROJECT"
LAUNCH
cat >> "$APP/Contents/MacOS/launcher" <<'LAUNCH'
PORT=8765
URL="http://127.0.0.1:$PORT/"
PROFILE="$HOME/Library/Application Support/DotBienGame"
export PATH="/usr/local/bin:/opt/homebrew/bin:/Library/Frameworks/Python.framework/Versions/Current/bin:$PATH"

if [ ! -f "$PROJECT/index.html" ]; then
  osascript -e "display alert \"Không tìm thấy game\" message \"Thư mục dự án đã bị di chuyển. Chạy lại tools/build-app.sh.\""
  exit 1
fi

SERVER_PID=""
if ! curl -s -o /dev/null "$URL"; then
  python3 "$PROJECT/tools/serve.py" "$PORT" "$PROJECT" >/dev/null 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 40); do curl -s -o /dev/null "$URL" && break; sleep 0.1; done
fi
cleanup() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null; }
trap cleanup EXIT

BROWSER=""
for b in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
         "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
         "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"; do
  [ -x "$b" ] && BROWSER="$b" && break
done

if [ -n "$BROWSER" ]; then
  # hồ sơ riêng => cửa sổ độc lập, chờ tới khi người chơi đóng cửa sổ
  "$BROWSER" --app="$URL" --user-data-dir="$PROFILE" --no-first-run --no-default-browser-check \
    --window-size=1280,800 --autoplay-policy=no-user-gesture-required >/dev/null 2>&1
else
  open "$URL"
  sleep 600
fi
LAUNCH
chmod +x "$APP/Contents/MacOS/launcher"
rm -rf "$TMP"
touch "$APP"
echo "Đã tạo: $APP"
