#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const rootDir = path.resolve(import.meta.dirname, '..');
const releaseDir = path.join(rootDir, 'release');
fs.mkdirSync(releaseDir, { recursive: true });

const APP_SVG_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#c41230" />
      <stop offset="100%" stop-color="#7c0a1e" />
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="56" fill="url(#bg)" />
  <circle cx="128" cy="128" r="78" fill="none" stroke="#ffffff" stroke-width="12" stroke-opacity="0.25" />
  <circle cx="128" cy="128" r="50" fill="none" stroke="#ffffff" stroke-width="12" stroke-opacity="0.55" />
  <circle cx="128" cy="128" r="22" fill="#ffffff" />
</svg>
`;

function copyCoreRuntime(stageDir) {
  fs.cpSync(path.join(rootDir, 'dist'), path.join(stageDir, 'dist'), { recursive: true });
  // Only copy the self-contained bundled JS files so there are zero external module dependencies
  fs.mkdirSync(path.join(stageDir, 'dist-electron', 'backend'), { recursive: true });
  fs.mkdirSync(path.join(stageDir, 'dist-electron', 'electron'), { recursive: true });
  fs.copyFileSync(
    path.join(rootDir, 'dist-electron', 'backend', 'standaloneServer.js'),
    path.join(stageDir, 'dist-electron', 'backend', 'standaloneServer.js')
  );
  if (fs.existsSync(path.join(rootDir, 'dist-electron', 'electron', 'main.js'))) {
    fs.copyFileSync(
      path.join(rootDir, 'dist-electron', 'electron', 'main.js'),
      path.join(stageDir, 'dist-electron', 'electron', 'main.js')
    );
  }
  if (fs.existsSync(path.join(rootDir, 'configs'))) {
    fs.cpSync(path.join(rootDir, 'configs'), path.join(stageDir, 'configs'), { recursive: true });
  }
  if (fs.existsSync(path.join(rootDir, 'scripts', 'sj8-wifi-setup.py'))) {
    fs.mkdirSync(path.join(stageDir, 'scripts'), { recursive: true });
    fs.copyFileSync(
      path.join(rootDir, 'scripts', 'sj8-wifi-setup.py'),
      path.join(stageDir, 'scripts', 'sj8-wifi-setup.py')
    );
  }
  if (fs.existsSync(path.join(rootDir, 'docs-sj8-reference.md'))) {
    fs.copyFileSync(
      path.join(rootDir, 'docs-sj8-reference.md'),
      path.join(stageDir, 'docs-sj8-reference.md')
    );
  }
  fs.copyFileSync(path.join(rootDir, 'package.json'), path.join(stageDir, 'package.json'));
  fs.copyFileSync(path.join(rootDir, 'README.md'), path.join(stageDir, 'README.md'));
  fs.writeFileSync(path.join(stageDir, 'icon.svg'), APP_SVG_ICON);
}

// ============================================================================
// 1. macOS Universal Bundle (.app + 1-Click Installer + .command Launcher)
// ============================================================================
function buildMacosBundle() {
  const folderName = 'open-musicflow-v1.0.0-macos-universal';
  const stageDir = path.join(releaseDir, folderName);
  fs.rmSync(stageDir, { recursive: true, force: true });
  fs.mkdirSync(stageDir, { recursive: true });

  copyCoreRuntime(stageDir);

  // Create a native macOS Application Bundle: "Open MusicFlow Studio.app"
  const appBundleDir = path.join(stageDir, 'Open MusicFlow Studio.app');
  const contentsDir = path.join(appBundleDir, 'Contents');
  const macosDir = path.join(contentsDir, 'MacOS');
  const resourcesDir = path.join(contentsDir, 'Resources', 'app');
  fs.mkdirSync(macosDir, { recursive: true });
  fs.mkdirSync(resourcesDir, { recursive: true });

  // Copy self-contained runtime inside Open MusicFlow Studio.app/Contents/Resources/app
  copyCoreRuntime(resourcesDir);

  const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key>
  <string>Open MusicFlow Studio</string>
  <key>CFBundleExecutable</key>
  <string>OpenMusicFlowStudio</string>
  <key>CFBundleIdentifier</key>
  <string>org.openmusicflow.studio</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>Open MusicFlow Studio</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0.0</string>
  <key>CFBundleVersion</key>
  <string>1.0.0</string>
  <key>LSMinimumSystemVersion</key>
  <string>11.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
`;
  fs.writeFileSync(path.join(contentsDir, 'Info.plist'), infoPlist);

  const macosAppExec = `#!/usr/bin/env bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/miniconda3/bin:$HOME/anaconda3/bin:$HOME/miniforge3/bin:$PATH"
if [ -d "$HOME/.nvm/versions/node" ]; then
  LATEST_NVM="$(ls -1 "$HOME/.nvm/versions/node" 2>/dev/null | tail -n 1)"
  if [ -n "$LATEST_NVM" ]; then
    export PATH="$HOME/.nvm/versions/node/$LATEST_NVM/bin:$PATH"
  fi
fi

APP_RES_DIR="$(cd "$(dirname "$0")/../Resources/app" && pwd)"
cd "$APP_RES_DIR"

if ! command -v node >/dev/null 2>&1; then
  osascript -e 'display alert "Node.js Required" message "Please install Node.js (https://nodejs.org or brew install node) to run Open MusicFlow Studio." as warning'
  exit 1
fi

# Terminate any stale previous Open MusicFlow instance holding port 4741
STALE_PIDS="$(lsof -ti :4741 2>/dev/null || true)"
if [ -n "$STALE_PIDS" ]; then
  kill -9 $STALE_PIDS 2>/dev/null || true
  sleep 0.3
fi

mkdir -p "$HOME/Library/Logs/OpenMusicFlowStudio" 2>/dev/null || true
nohup node "$APP_RES_DIR/dist-electron/backend/standaloneServer.js" >/tmp/open-musicflow-debug.log 2>&1 &

# Wait up to 5 seconds for port 4741 to become ready
for _ in {1..25}; do
  if nc -z 127.0.0.1 4741 >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done

# Open in dedicated frameless app window if Chrome/Brave/Edge exists, else default browser
if [ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --app="http://127.0.0.1:4741" >/dev/null 2>&1 &
elif [ -x "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" ]; then
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" --app="http://127.0.0.1:4741" >/dev/null 2>&1 &
elif [ -x "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" ]; then
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" --app="http://127.0.0.1:4741" >/dev/null 2>&1 &
else
  open "http://127.0.0.1:4741"
fi
`;
  fs.writeFileSync(path.join(macosDir, 'OpenMusicFlowStudio'), macosAppExec, { mode: 0o755 });

  // 1-Click Direct Launcher (.command) with live terminal debug logs
  const startCommand = `#!/usr/bin/env bash
set -e
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/miniconda3/bin:$HOME/anaconda3/bin:$HOME/miniforge3/bin:$PATH"
if [ -d "$HOME/.nvm/versions/node" ]; then
  LATEST_NVM="$(ls -1 "$HOME/.nvm/versions/node" 2>/dev/null | tail -n 1)"
  if [ -n "$LATEST_NVM" ]; then
    export PATH="$HOME/.nvm/versions/node/$LATEST_NVM/bin:$PATH"
  fi
fi

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# Remove macOS Gatekeeper quarantine attributes if present
xattr -cr "$DIR" 2>/dev/null || true

# Stop any stale previous instance holding port 4741 so the new server takes over cleanly
STALE_PIDS="$(lsof -ti :4741 2>/dev/null || true)"
if [ -n "$STALE_PIDS" ]; then
  echo "Stopping previous server instance on port 4741 (PID: $STALE_PIDS)..."
  kill -9 $STALE_PIDS 2>/dev/null || true
  sleep 0.3
fi

echo "=================================================================="
echo "  Open MusicFlow Studio — LG SJ8 Controller & Live Debug Console"
echo "  Web UI & API : http://127.0.0.1:4741"
echo "  Debug Logs   : http://127.0.0.1:4741/api/debug-log"
echo "  Log Files    : /tmp/open-musicflow-debug.log"
echo "                 ~/Library/Logs/OpenMusicFlowStudio/debug.log"
echo "  DLNA / DMS   : http://0.0.0.0:49252/dmr.xml"
echo "=================================================================="

(
  for _ in {1..25}; do
    if nc -z 127.0.0.1 4741 >/dev/null 2>&1; then
      open "http://127.0.0.1:4741" || true
      break
    fi
    sleep 0.2
  done
) &
exec node "$DIR/dist-electron/backend/standaloneServer.js"
`;
  fs.writeFileSync(path.join(stageDir, 'Start-Open-MusicFlow.command'), startCommand, { mode: 0o755 });
  fs.writeFileSync(path.join(stageDir, 'Debug-Open-MusicFlow.command'), startCommand, { mode: 0o755 });

  // 1-Click Installer to /Applications (.command)
  const installCommand = `#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
APP_NAME="Open MusicFlow Studio.app"
TARGET_DIR="/Applications"
if [ ! -w "$TARGET_DIR" ]; then
  TARGET_DIR="$HOME/Applications"
  mkdir -p "$TARGET_DIR"
fi

echo "Installing '$APP_NAME' to $TARGET_DIR ..."
STALE_PIDS="$(lsof -ti :4741 2>/dev/null || true)"
if [ -n "$STALE_PIDS" ]; then
  kill -9 $STALE_PIDS 2>/dev/null || true
fi
xattr -cr "$DIR/$APP_NAME" 2>/dev/null || true
rm -rf "$TARGET_DIR/$APP_NAME"
cp -R "$DIR/$APP_NAME" "$TARGET_DIR/$APP_NAME"
xattr -cr "$TARGET_DIR/$APP_NAME" 2>/dev/null || true

echo "✅ Installed '$TARGET_DIR/$APP_NAME'!"
echo "Launching Open MusicFlow Studio..."
open "$TARGET_DIR/$APP_NAME"
`;
  fs.writeFileSync(path.join(stageDir, 'Install-to-Applications.command'), installCommand, { mode: 0o755 });

  // Export both .tar.gz and .zip (using python3 zipfile for universal compatibility)
  const tarPath = path.join(releaseDir, `${folderName}.tar.gz`);
  const zipPath = path.join(releaseDir, `${folderName}.zip`);
  execSync(`tar -czf "${tarPath}" -C "${releaseDir}" "${folderName}"`);
  execSync(
    `python3 -c 'import shutil; shutil.make_archive("${path.join(releaseDir, folderName)}", "zip", "${releaseDir}", "${folderName}")'`
  );
  console.log(`Created macOS bundles: ${tarPath} and ${zipPath}`);
}

// ============================================================================
// 2. Linux x64 Bundle (1-Click Desktop Menu Installer + Portable Launcher)
// ============================================================================
function buildLinuxBundle() {
  const folderName = 'open-musicflow-v1.0.0-linux-x64';
  const stageDir = path.join(releaseDir, folderName);
  fs.rmSync(stageDir, { recursive: true, force: true });
  fs.mkdirSync(stageDir, { recursive: true });

  copyCoreRuntime(stageDir);

  const startSh = `#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "========================================================"
echo "  Open MusicFlow Studio — LG SJ8 Controller & DMS"
echo "  Web UI & API : http://127.0.0.1:4741"
echo "  DLNA / DMS   : http://0.0.0.0:49252/dmr.xml"
echo "========================================================"

(
  sleep 1
  if command -v google-chrome >/dev/null 2>&1; then
    google-chrome --app="http://127.0.0.1:4741" >/dev/null 2>&1 &
  elif command -v chromium >/dev/null 2>&1; then
    chromium --app="http://127.0.0.1:4741" >/dev/null 2>&1 &
  elif command -v brave >/dev/null 2>&1; then
    brave --app="http://127.0.0.1:4741" >/dev/null 2>&1 &
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://127.0.0.1:4741" >/dev/null 2>&1 &
  fi
) &

exec node "$DIR/dist-electron/backend/standaloneServer.js"
`;
  fs.writeFileSync(path.join(stageDir, 'start-open-musicflow.sh'), startSh, { mode: 0o755 });

  const installLinuxSh = `#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$HOME/.local/share/open-musicflow"
BIN_DIR="$HOME/.local/bin"
APPS_DIR="$HOME/.local/share/applications"

mkdir -p "$INSTALL_DIR" "$BIN_DIR" "$APPS_DIR"
cp -r "$DIR/"* "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/start-open-musicflow.sh"

ln -sf "$INSTALL_DIR/start-open-musicflow.sh" "$BIN_DIR/open-musicflow"

cat > "$APPS_DIR/open-musicflow.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Open MusicFlow Studio
Comment=LG SJ8 Soundbar Controller, Wi-Fi Alarms, Spotify Connect & DMS Server
Exec=$INSTALL_DIR/start-open-musicflow.sh
Icon=$INSTALL_DIR/icon.svg
Terminal=false
Categories=AudioVideo;Audio;Music;
StartupNotify=true
EOF

chmod +x "$APPS_DIR/open-musicflow.desktop"
update-desktop-database "$APPS_DIR" 2>/dev/null || true

echo "✅ Installed Open MusicFlow Studio to $INSTALL_DIR"
echo "✅ Added desktop launcher to Application Menu (open-musicflow.desktop)"
echo "✅ Added CLI command: ~/.local/bin/open-musicflow"
`;
  fs.writeFileSync(path.join(stageDir, 'install-linux-desktop.sh'), installLinuxSh, { mode: 0o755 });

  const tarPath = path.join(releaseDir, `${folderName}.tar.gz`);
  const zipPath = path.join(releaseDir, `${folderName}.zip`);
  execSync(`tar -czf "${tarPath}" -C "${releaseDir}" "${folderName}"`);
  execSync(
    `python3 -c 'import shutil; shutil.make_archive("${path.join(releaseDir, folderName)}", "zip", "${releaseDir}", "${folderName}")'`
  );
  console.log(`Created Linux bundles: ${tarPath} and ${zipPath}`);
}

// ============================================================================
// 3. Windows x64 Bundle (1-Click Desktop/Start Menu Installer + Launcher)
// ============================================================================
function buildWindowsBundle() {
  const folderName = 'open-musicflow-v1.0.0-windows-x64';
  const stageDir = path.join(releaseDir, folderName);
  fs.rmSync(stageDir, { recursive: true, force: true });
  fs.mkdirSync(stageDir, { recursive: true });

  copyCoreRuntime(stageDir);

  const startBat = `@echo off
title Open MusicFlow Studio — LG SJ8 Controller
cd /d "%~dp0"
echo ========================================================
echo   Open MusicFlow Studio — LG SJ8 Controller ^& DMS
echo   Web UI ^& API : http://127.0.0.1:4741
echo   DLNA / DMS   : http://0.0.0.0:49252/dmr.xml
echo ========================================================
start "" cmd /c "timeout /t 1 /nobreak >nul & start msedge --app=http://127.0.0.1:4741 2>nul || start http://127.0.0.1:4741"
node dist-electron\\backend\\standaloneServer.js
`;
  fs.writeFileSync(path.join(stageDir, 'Start-Open-MusicFlow.bat'), startBat, { mode: 0o755 });

  const installWinBat = `@echo off
setlocal
set "SRC_DIR=%~dp0"
set "DEST_DIR=%LOCALAPPDATA%\\OpenMusicFlowStudio"

echo Installing Open MusicFlow Studio to %DEST_DIR% ...
if not exist "%DEST_DIR%" mkdir "%DEST_DIR%"
xcopy /E /I /Y "%SRC_DIR%*" "%DEST_DIR%\\" >nul

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; ^
   $desktop = [Environment]::GetFolderPath('Desktop'); ^
   $s1 = $ws.CreateShortcut((Join-Path $desktop 'Open MusicFlow Studio.lnk')); ^
   $s1.TargetPath = Join-Path '%DEST_DIR%' 'Start-Open-MusicFlow.bat'; ^
   $s1.WorkingDirectory = '%DEST_DIR%'; ^
   $s1.Description = 'Open MusicFlow Studio — LG Soundbar & DMS Controller'; ^
   $s1.Save(); ^
   $startMenu = [Environment]::GetFolderPath('Programs'); ^
   $s2 = $ws.CreateShortcut((Join-Path $startMenu 'Open MusicFlow Studio.lnk')); ^
   $s2.TargetPath = Join-Path '%DEST_DIR%' 'Start-Open-MusicFlow.bat'; ^
   $s2.WorkingDirectory = '%DEST_DIR%'; ^
   $s2.Save();"

echo.
echo [OK] Installed Open MusicFlow Studio and created Desktop + Start Menu shortcuts!
echo Launching Open MusicFlow Studio...
start "" "%DEST_DIR%\\Start-Open-MusicFlow.bat"
`;
  fs.writeFileSync(path.join(stageDir, 'Install-Windows-App.bat'), installWinBat, { mode: 0o755 });

  const tarPath = path.join(releaseDir, `${folderName}.tar.gz`);
  const zipPath = path.join(releaseDir, `${folderName}.zip`);
  execSync(`tar -czf "${tarPath}" -C "${releaseDir}" "${folderName}"`);
  execSync(
    `python3 -c 'import shutil; shutil.make_archive("${path.join(releaseDir, folderName)}", "zip", "${releaseDir}", "${folderName}")'`
  );
  console.log(`Created Windows bundles: ${tarPath} and ${zipPath}`);
}

buildMacosBundle();
buildLinuxBundle();
buildWindowsBundle();
