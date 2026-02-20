#!/bin/bash

# Script to create a macOS application launcher for Keepa Tracker
# This creates a native .app that can be added to Desktop or Dock

echo "🚀 Creating Keepa Tracker Launcher App..."
echo ""

# Get the current directory (project root)
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# App name and location
APP_NAME="Keepa Tracker"
DESKTOP_PATH="$HOME/Desktop"
APP_PATH="$DESKTOP_PATH/$APP_NAME.app"

# Create app directory structure
echo "📁 Creating app structure..."
mkdir -p "$APP_PATH/Contents/MacOS"
mkdir -p "$APP_PATH/Contents/Resources"

# Create Info.plist
echo "📝 Creating app metadata..."
cat > "$APP_PATH/Contents/Info.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>launcher</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>CFBundleIdentifier</key>
    <string>com.keepatracker.app</string>
    <key>CFBundleName</key>
    <string>Keepa Tracker</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.13</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
EOF

# Create the launcher script
echo "⚙️  Creating launcher script..."
cat > "$APP_PATH/Contents/MacOS/launcher" << EOF
#!/bin/bash

# Keepa Tracker Launcher
# This script runs the Keepa Tracker process

# Open a new Terminal window and run the process
osascript <<APPLESCRIPT
tell application "Terminal"
    activate
    do script "cd '$PROJECT_DIR' && echo '🎬 Starting Keepa Tracker...' && echo '' && npm start; echo ''; echo '✅ Process completed. You can close this window.'; read -p 'Press Enter to close...'"
end tell
APPLESCRIPT
EOF

# Make launcher executable
chmod +x "$APP_PATH/Contents/MacOS/launcher"

# Create icon from assets if available
echo "🎨 Installing icon..."

if [ -f "$PROJECT_DIR/assets/AppIcon.icns" ]; then
    echo "   Found custom icon file"
    cp "$PROJECT_DIR/assets/AppIcon.icns" "$APP_PATH/Contents/Resources/AppIcon.icns"
    echo "   ✅ Custom icon installed"
else
    echo "   No custom icon found at $PROJECT_DIR/assets/AppIcon.icns"
    echo "   To add a custom icon later:"
    echo "   1. Place AppIcon.icns in: $PROJECT_DIR/assets/"
    echo "   2. Run this script again"
fi

echo ""
echo "✅ Launcher app created successfully!"
echo ""
echo "📍 Location: $APP_PATH"
echo ""
echo "🎯 How to use:"
echo "   1. Double-click 'Keepa Tracker.app' on your Desktop to run"
echo "   2. Drag it to your Dock for quick access"
echo "   3. Right-click > Get Info to customize the icon"
echo ""
echo "🎨 To add a custom icon:"
echo "   - See instructions in: $APP_PATH/Contents/Resources/README_ICON.txt"
echo "   - Or simply: Right-click app > Get Info > Click icon > Paste your image"
echo ""
echo "🔧 Note: Make sure your .env file is configured before running!"
echo ""
