import express from 'express';
import cors from 'cors';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { MockSoundbarServer } from './protocol/mockSoundbarServer';
import {
  LgSoundbarClient,
  DiscoveredDevice,
  probeSoundbarPort,
  discoverViaSsdpMulticast,
} from './protocol/lgSoundbarClient';
import { SpotifyService } from './services/spotifyService';
import { MediaLibraryService } from './services/mediaLibraryService';
import { LG_DEFAULT_TCP_PORT, LG_DMS_HTTP_PORT } from './protocol/lgWireCodec';
import { EncryptionMode, ProtocolDialect } from '../shared/protocolTypes';
import { initDebugLogger, logDebug, getRecentDebugLogs } from './debugLogger';

export interface BackendServerInstance {
  httpServer: http.Server;
  dmsHttpServer: http.Server | null;
  apiPort: number;
  dmsPort: number;
  mockSoundbarPort: number;
  soundbarClient: LgSoundbarClient;
  stop: () => Promise<void>;
}

export async function createBackendServer(
  preferredPort = 4741,
  staticDistDir?: string
): Promise<BackendServerInstance> {
  initDebugLogger('Node/Electron');

  const mockServer = new MockSoundbarServer(19741);
  const mockPort = await mockServer.start();
  logDebug('SIMULATOR', `Virtual LG SJ8 TCP 9741 Simulator listening on 127.0.0.1:${mockPort}`);

  const soundbarClient = new LgSoundbarClient();
  const spotifyService = new SpotifyService(soundbarClient);
  const mediaService = new MediaLibraryService();

  // Connect immediately to the built-in LG SJ8 simulator so the UI has instant state,
  // and probe the live LG SJ8 at 192.168.0.10:9741 in the background without blocking HTTP startup.
  try {
    await soundbarClient.connect('127.0.0.1', mockPort, {
      dialect: 'auto',
      encryption: 'sj8_v1',
      isSimulator: true,
    });
  } catch (err) {
    logDebug('WARN', `Initial simulator connection warning: ${(err as Error).message}`);
  }

  if (process.env.FORCE_SIMULATOR !== '1') {
    void (async () => {
      try {
        logDebug('PROBE', `Probing live LG SJ8 at 192.168.0.10:${LG_DEFAULT_TCP_PORT}...`);
        const liveSj8Reachable = await probeSoundbarPort('192.168.0.10', LG_DEFAULT_TCP_PORT, 600);
        if (liveSj8Reachable) {
          logDebug('PROBE', 'Live LG SJ8 detected at 192.168.0.10:9741! Switching connection...');
          await soundbarClient.connect('192.168.0.10', LG_DEFAULT_TCP_PORT, {
            dialect: 'auto',
            encryption: 'sj8_v1',
            isSimulator: false,
          });
        } else {
          logDebug(
            'PROBE',
            '192.168.0.10:9741 not reachable on current network; staying on built-in LG SJ8 simulator.'
          );
        }
      } catch (err) {
        logDebug('PROBE', `Live SJ8 probe error: ${(err as Error).message}`);
      }
    })();
  }

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use((req, _res, next) => {
    logDebug('HTTP', `${req.method} ${req.url}`);
    next();
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('error', () => {
    // Handled by http.Server EADDRINUSE retry logic below
  });

  const broadcast = (type: string, data: unknown) => {
    const msg = JSON.stringify({ type, data });
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  };

  soundbarClient.on('state', (st) => {
    broadcast('state', st);
  });

  soundbarClient.on('packet', (pkt) => {
    logDebug(
      'TCP-9741',
      `${String(pkt.direction).toUpperCase()} ${pkt.msgType} (${pkt.rawByteLength}B, ${pkt.cipherProfile}) ${JSON.stringify(pkt.payload)}`
    );
    broadcast('packet', pkt);
  });

  soundbarClient.on('alarmTriggered', (alarm) => {
    logDebug('ALARM', `Triggered Wi-Fi Alarm: ${JSON.stringify(alarm)}`);
    broadcast('alarmTriggered', alarm);
  });

  wss.on('connection', (ws) => {
    logDebug('WEBSOCKET', 'Client connected to /ws');
    ws.send(
      JSON.stringify({
        type: 'init',
        data: {
          soundbar: soundbarClient.state,
          spotify: spotifyService.getState(),
          tracks: mediaService.getTracks(),
          packetLogs: soundbarClient.getPacketLogs(),
          mockPort,
          dmsPort: LG_DMS_HTTP_PORT,
        },
      })
    );
  });

  // === REST Endpoints ===

  app.get('/api/debug-log', (_req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(getRecentDebugLogs());
  });

  app.post('/api/client-log', (req, res) => {
    logDebug('UI-CLIENT-ERROR', JSON.stringify(req.body || {}));
    res.json({ ok: true });
  });

  app.get('/api/state', (_req, res) => {
    res.json({
      soundbar: soundbarClient.state,
      spotify: spotifyService.getState(),
      tracks: mediaService.getTracks(),
      packetLogs: soundbarClient.getPacketLogs(),
      mockPort,
      dmsPort: LG_DMS_HTTP_PORT,
    });
  });

  app.post('/api/connect', async (req, res) => {
    try {
      const host = String(req.body.host || '127.0.0.1').trim();
      const port = Number(req.body.port || LG_DEFAULT_TCP_PORT);
      const dialect = (req.body.dialect as ProtocolDialect) || 'auto';
      const encryption = (req.body.encryption as EncryptionMode) || 'sj8_v1';
      const isSimulator = host === '127.0.0.1' && port === mockPort;

      const state = await soundbarClient.connect(host, port, {
        dialect,
        encryption,
        isSimulator,
      });
      res.json({ ok: true, state });
    } catch (err) {
      res.status(502).json({
        ok: false,
        error: (err as Error).message,
      });
    }
  });

  app.post('/api/disconnect', (_req, res) => {
    soundbarClient.disconnect();
    res.json({ ok: true, state: soundbarClient.state });
  });

  app.post('/api/refresh', (_req, res) => {
    soundbarClient.refreshAllState();
    res.json({ ok: true });
  });

  app.get('/api/discover', async (req, res) => {
    const customHost = req.query.host ? String(req.query.host).trim() : '';
    const devices: DiscoveredDevice[] = [
      {
        name: 'LG SJ8 (Built-In Hardware Simulator)',
        model: 'Sound Bar SJ8 (NB9.504.00629.C)',
        host: '127.0.0.1',
        port: mockPort,
        isSimulator: true,
        protocol: 'TCP 9741 (SJ8 V1 AES-256-CBC)',
      },
    ];

    // 1. Run UDP SSDP M-SEARCH multicast scan (239.255.255.250:1900)
    const ssdpDevices = await discoverViaSsdpMulticast(900);
    for (const d of ssdpDevices) {
      if (!devices.some((existing) => existing.host === d.host && existing.port === d.port)) {
        devices.unshift(d);
      }
    }

    // 2. Probe known LG SJ8 LAN IP (192.168.0.10), MusicFlow_Setup AP IP (192.168.5.100), and customHost
    const candidates = ['192.168.0.10', '192.168.5.100', '127.0.0.1'];
    if (customHost && !candidates.includes(customHost)) {
      candidates.unshift(customHost);
    }

    for (const host of candidates) {
      const reachable = await probeSoundbarPort(host, LG_DEFAULT_TCP_PORT, 350);
      if (reachable && !devices.some((d) => d.host === host && d.port === LG_DEFAULT_TCP_PORT)) {
        devices.unshift({
          name:
            host === '192.168.5.100'
              ? 'LG SJ8 (MusicFlow_Setup AP Mode)'
              : `LG SJ8 Soundbar (${host})`,
          model: 'Sound Bar SJ8',
          host,
          port: LG_DEFAULT_TCP_PORT,
          isSimulator: false,
          protocol: 'TCP 9741 Hardware Endpoint',
        });
      }
    }

    res.json({ devices });
  });

  // === LG SJ8 Wi-Fi Setup & Onboarding (`sj8-wifi-setup.py` + `SPK_ADD_SET`) ===

  app.post('/api/sj8/provision', async (req, res) => {
    try {
      const apHost = String(req.body.apHost || '192.168.5.100').trim();
      const apPort = Number(req.body.apPort || LG_DEFAULT_TCP_PORT);
      const ssid = String(req.body.ssid || 'o').trim();
      const password = String(req.body.password || '');

      const result = await soundbarClient.provisionWifiSetupAp({
        apHost,
        apPort,
        ssid,
        password,
      });
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(502).json({
        ok: false,
        error: (err as Error).message,
      });
    }
  });

  app.post('/api/sj8/register', async (req, res) => {
    try {
      const host = String(req.body.host || soundbarClient.state.host || '192.168.0.10').trim();
      const port = Number(req.body.port || soundbarClient.state.port || LG_DEFAULT_TCP_PORT);
      const speakerName = String(req.body.speakerName || 'LG SJ8').trim();

      const reply = await soundbarClient.registerSpeakerOnLan({
        host,
        port,
        speakerName,
      });
      res.json({ ok: true, reply, state: soundbarClient.state });
    } catch (err) {
      res.status(502).json({
        ok: false,
        error: (err as Error).message,
      });
    }
  });

  app.post('/api/volume', (req, res) => {
    const volume = Number(req.body.volume ?? 15);
    const fadeTime = Number(req.body.fadeTime ?? 0);
    soundbarClient.setVolume(volume, fadeTime);
    res.json({ ok: true, state: soundbarClient.state });
  });

  app.post('/api/mute', (req, res) => {
    const muted = Boolean(req.body.muted);
    soundbarClient.setMute(muted);
    res.json({ ok: true, state: soundbarClient.state });
  });

  app.post('/api/function', (req, res) => {
    const functionId = Number(req.body.functionId ?? 0);
    soundbarClient.setFunction(functionId);
    res.json({ ok: true, state: soundbarClient.state });
  });

  app.post('/api/eq', (req, res) => {
    const eqId = Number(req.body.eqId ?? 0);
    soundbarClient.setEqualizer(eqId);
    res.json({ ok: true, state: soundbarClient.state });
  });

  app.post('/api/tone', (req, res) => {
    soundbarClient.setToneControl({
      bass: typeof req.body.bass === 'number' ? req.body.bass : undefined,
      treble: typeof req.body.treble === 'number' ? req.body.treble : undefined,
      lrBalance: typeof req.body.lrBalance === 'number' ? req.body.lrBalance : undefined,
      save: Boolean(req.body.save),
    });
    res.json({ ok: true, state: soundbarClient.state });
  });

  app.post('/api/settings', (req, res) => {
    soundbarClient.updateSettings(req.body || {});
    res.json({ ok: true, state: soundbarClient.state });
  });

  app.post('/api/test-tone', (_req, res) => {
    soundbarClient.triggerTestTone();
    res.json({ ok: true });
  });

  // === Wi-Fi Alarms ===

  app.post('/api/alarms', (req, res) => {
    const alarm = soundbarClient.upsertWifiAlarm(req.body || {});
    res.json({ ok: true, alarm, alarms: soundbarClient.state.alarms });
  });

  app.post('/api/alarms/:id/toggle', (req, res) => {
    const id = Number(req.params.id);
    const enable = Boolean(req.body.enable);
    soundbarClient.toggleWifiAlarm(id, enable);
    res.json({ ok: true, alarms: soundbarClient.state.alarms });
  });

  app.delete('/api/alarms/:id', (req, res) => {
    const id = Number(req.params.id);
    soundbarClient.deleteWifiAlarm(id);
    res.json({ ok: true, alarms: soundbarClient.state.alarms });
  });

  app.post('/api/alarms/:id/trigger', (req, res) => {
    const id = Number(req.params.id);
    soundbarClient.triggerAlarmNow(id);
    res.json({ ok: true, state: soundbarClient.state });
  });

  // === Spotify Linking & Connect ===

  let boundApiPort = preferredPort;

  app.post('/api/spotify/auth-url', (req, res) => {
    const clientId = String(req.body.clientId || '').trim();
    const hostHeader = req.headers.host || `127.0.0.1:${boundApiPort}`;
    const defaultRedirect = `http://${hostHeader}/api/spotify/callback`;
    const redirectUri = String(req.body.redirectUri || defaultRedirect).trim();
    if (!clientId) {
      res.status(400).json({ error: 'Spotify Client ID is required' });
      return;
    }
    const { authUrl, state } = spotifyService.generatePkceAuthUrl(clientId, redirectUri);
    res.json({ ok: true, authUrl, state, redirectUri });
  });

  app.get('/api/spotify/callback', async (req, res) => {
    const error = req.query.error ? String(req.query.error) : '';
    const code = req.query.code ? String(req.query.code) : '';
    const stateParam = req.query.state ? String(req.query.state) : undefined;

    const renderPage = (title: string, bodyText: string, ok: boolean) => `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${title}</title>
<style>
  body { font-family: system-ui, sans-serif; background: #0c0e12; color: #f3f4f6; display: grid; place-items: center; min-height: 100vh; margin: 0; }
  .card { background: #161a22; border: 1px solid ${ok ? '#1db954' : '#ef4444'}; border-radius: 12px; padding: 24px 28px; max-width: 440px; text-align: center; }
  h1 { margin: 0 0 10px; font-size: 20px; color: ${ok ? '#1db954' : '#f87171'}; }
  p { margin: 0 0 16px; color: #cbd5e1; line-height: 1.5; }
  a { color: #1db954; text-decoration: none; font-weight: 600; }
</style></head>
<body><div class="card"><h1>${title}</h1><p>${bodyText}</p><a href="/">Return to Open MusicFlow Studio</a></div>
${ok ? '<script>setTimeout(() => { window.close(); }, 1500);</script>' : ''}
</body></html>`;

    if (error) {
      res.status(400).send(renderPage('Spotify Authorization Cancelled', `Spotify returned: ${error}`, false));
      return;
    }
    if (!code) {
      res.status(400).send(renderPage('Missing Authorization Code', 'No ?code parameter was returned by Spotify.', false));
      return;
    }

    try {
      const state = await spotifyService.exchangeAuthorizationCode(code, stateParam);
      broadcast('spotify', state);
      res.send(
        renderPage(
          'Spotify Connected!',
          `Signed in as ${state.displayName} (${state.devices.length} device(s) found). You can close this window.`,
          true
        )
      );
    } catch (err) {
      res
        .status(500)
        .send(renderPage('Spotify OAuth Failed', (err as Error).message, false));
    }
  });

  app.post('/api/spotify/refresh', async (_req, res) => {
    const state = await spotifyService.syncLiveAccountData();
    broadcast('spotify', state);
    res.json({ ok: true, spotify: state });
  });

  app.post('/api/spotify/token', async (req, res) => {
    const token = String(req.body.accessToken || '');
    const clientId = req.body.clientId ? String(req.body.clientId) : undefined;
    const state = await spotifyService.setDirectAccessToken(token, clientId);
    broadcast('spotify', state);
    res.json({ ok: true, spotify: state });
  });

  app.post('/api/spotify/transfer', async (req, res) => {
    const deviceId = String(req.body.deviceId || 'lg-musicflow-hs9-connect');
    const state = await spotifyService.transferPlaybackToSoundbar(deviceId);
    broadcast('spotify', state);
    res.json({ ok: true, spotify: state, soundbar: soundbarClient.state });
  });

  app.post('/api/spotify/play', async (req, res) => {
    const uri = String(req.body.uri || 'spotify:playlist:37i9dQZF1DXbITWG1ZJKYt');
    const title = req.body.title ? String(req.body.title) : undefined;
    const state = await spotifyService.playSpotifyUriOnSoundbar(uri, title);
    broadcast('spotify', state);
    res.json({ ok: true, spotify: state, soundbar: soundbarClient.state });
  });

  app.post('/api/spotify/toggle', (_req, res) => {
    const state = spotifyService.togglePlayPause();
    broadcast('spotify', state);
    res.json({ ok: true, spotify: state });
  });

  // === Local Media Library & HTTP/DLNA Audio Streaming (:4741 and :49252) ===

  app.post('/api/media/scan', (req, res) => {
    try {
      const dirPath = String(req.body.dirPath || '').trim();
      const tracks = mediaService.scanDirectory(dirPath);
      res.json({ ok: true, tracks });
    } catch (err) {
      res.status(400).json({ ok: false, error: (err as Error).message });
    }
  });

  app.post('/api/media/play', (req, res) => {
    const trackId = String(req.body.trackId || '');
    const track = mediaService.getTracks().find((t) => t.id === trackId);
    if (!track) {
      res.status(404).json({ ok: false, error: 'Track not found' });
      return;
    }
    const streamUrl = `http://${soundbarClient.getLocalLanIp()}:${LG_DMS_HTTP_PORT}${track.streamPath}`;
    soundbarClient.playLocalStreamOnSoundbar({
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      format: track.format,
      durationSec: track.durationSec,
      streamUrl,
    });
    res.json({ ok: true, track, streamUrl, soundbar: soundbarClient.state });
  });

  const handleStreamRequest = (req: express.Request, res: express.Response) => {
    const trackFile = String(req.params.trackFile || '');
    const trackId = trackFile.replace(/\.[^.]+$/, '');
    const track = mediaService.getTracks().find((t) => t.id === trackId);

    if (track?.filePath && fs.existsSync(track.filePath)) {
      res.sendFile(track.filePath, { dotfiles: 'allow' });
      return;
    }

    const wavBuffer = mediaService.generateSynthesizedWav(trackId);
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', wavBuffer.length);
    res.send(wavBuffer);
  };

  app.get('/stream/:trackFile', handleStreamRequest);

  // UPnP / DLNA DMS Description XML endpoint compatible with MusicFlowDMS (:49252)
  app.get('/dmr.xml', (_req, res) => {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.send(`<?xml version="1.0" encoding="utf-8"?>
<root xmlns="urn:schemas-upnp-org:device-1-0" xmlns:dlna="urn:schemas-dlna-org:device-1-0">
  <specVersion><major>1</major><minor>0</minor></specVersion>
  <device>
    <deviceType>urn:schemas-upnp-org:device:MediaServer:1</deviceType>
    <friendlyName>Open MusicFlow DMS (cachyos-esketids)</friendlyName>
    <manufacturer>Open MusicFlow Contributors</manufacturer>
    <modelName>LG Music Flow Compatible DMS</modelName>
    <UDN>uuid:151B17E8-6B25-4DFE-90BD-6838CC607164</UDN>
  </device>
</root>`);
  });

  // === Multi-Room Mesh Management ===

  app.post('/api/mesh/:nodeId', (req, res) => {
    soundbarClient.updateMeshNode(req.params.nodeId, req.body || {});
    res.json({ ok: true, meshNodes: soundbarClient.state.meshNodes });
  });

  // === Raw Protocol Inspector ===

  app.post('/api/raw-packet', (req, res) => {
    const payload = (req.body.payload as Record<string, unknown>) || {};
    const overrideMode = req.body.encryption as EncryptionMode | undefined;
    soundbarClient.sendRawPacket(payload, overrideMode);
    res.json({ ok: true });
  });

  app.post('/api/logs/clear', (_req, res) => {
    soundbarClient.clearPacketLogs();
    res.json({ ok: true });
  });

  const releaseDir = path.resolve(__dirname, '../../release');
  if (fs.existsSync(releaseDir)) {
    app.use('/releases', express.static(releaseDir));
  }

  if (staticDistDir && fs.existsSync(staticDistDir)) {
    app.use(express.static(staticDistDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(staticDistDir, 'index.html'));
    });
  }

  const actualPort = await new Promise<number>((resolve, reject) => {
    let portToTry = preferredPort;
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        portToTry += 1;
        server.listen(portToTry, '0.0.0.0');
      } else {
        reject(err);
      }
    });
    server.listen(portToTry, '0.0.0.0', () => {
      boundApiPort = portToTry;
      resolve(portToTry);
    });
  });

  // Also bind port 49252/tcp (MusicFlowDMS.exe port) so existing OpenWrt DNAT rules
  // (wan 192.168.0.0/24 -> 192.168.1.176:49252) route audio streams to the LG SJ8 seamlessly!
  let dmsHttpServer: http.Server | null = null;
  try {
    const dmsSrv = http.createServer(app);
    await new Promise<void>((resolve) => {
      dmsSrv.once('error', () => resolve());
      dmsSrv.listen(LG_DMS_HTTP_PORT, '0.0.0.0', () => {
        dmsHttpServer = dmsSrv;
        resolve();
      });
    });
  } catch {
    // Non-fatal if 49252 is already bound
  }

  return {
    httpServer: server,
    dmsHttpServer,
    apiPort: actualPort,
    dmsPort: LG_DMS_HTTP_PORT,
    mockSoundbarPort: mockPort,
    soundbarClient,
    stop: async () => {
      soundbarClient.disconnect();
      await mockServer.stop();
      if (dmsHttpServer) {
        await new Promise<void>((res) => dmsHttpServer!.close(() => res()));
      }
      await new Promise<void>((res) => server.close(() => res()));
    },
  };
}
