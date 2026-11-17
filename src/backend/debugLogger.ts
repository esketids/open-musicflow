import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MAX_RING_LINES = 500;
const ringBuffer: string[] = [];

function getLogFilePaths(): string[] {
  const paths = ['/tmp/open-musicflow-debug.log'];
  if (process.platform === 'darwin') {
    const home = os.homedir();
    if (home) {
      const macLogDir = path.join(home, 'Library', 'Logs', 'OpenMusicFlowStudio');
      try {
        fs.mkdirSync(macLogDir, { recursive: true });
        paths.push(path.join(macLogDir, 'debug.log'));
      } catch {
        // Ignore directory creation errors
      }
    }
  }
  return paths;
}

export function initDebugLogger(engineName = 'Node/Electron'): void {
  const banner = [
    '================================================================================',
    `Open MusicFlow Studio (${engineName}) v1.0.1 — Debug Logger Initialized`,
    `Timestamp: ${new Date().toISOString()} | PID: ${process.pid} | Platform: ${process.platform} (${process.arch})`,
    'Log files: /tmp/open-musicflow-debug.log, ~/Library/Logs/OpenMusicFlowStudio/debug.log',
    'HTTP endpoint: http://127.0.0.1:4741/api/debug-log',
    '================================================================================',
  ].join('\n');

  console.log(banner);
  ringBuffer.push(banner);

  for (const logPath of getLogFilePaths()) {
    try {
      fs.writeFileSync(logPath, banner + '\n', 'utf8');
    } catch {
      // Ignore write errors
    }
  }
}

export function logDebug(category: string, message: string): void {
  const line = `[${new Date().toISOString()}] [${category}] ${message}`;
  console.log(line);

  ringBuffer.push(line);
  if (ringBuffer.length > MAX_RING_LINES) {
    ringBuffer.shift();
  }

  for (const logPath of getLogFilePaths()) {
    try {
      fs.appendFileSync(logPath, line + '\n', 'utf8');
    } catch {
      // Ignore append errors
    }
  }
}

export function getRecentDebugLogs(): string {
  return ringBuffer.join('\n') + '\n';
}
