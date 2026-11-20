import React, { useEffect, useState, useRef } from 'react';
import {
  Speaker,
  Volume2,
  VolumeX,
  Sliders,
  Bell,
  Disc,
  Radio,
  Network,
  Terminal,
  RefreshCw,
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Plus,
  Trash2,
  CheckCircle2,
  Zap,
  FolderSearch,
  ExternalLink,
  PackageCheck,
  Wifi,
  ShieldCheck,
  Minus,
  Music,
  LayoutGrid,
  Smartphone,
} from 'lucide-react';
import {
  EncryptionMode,
  LG_EQ_PRESETS,
  LG_INPUT_FUNCTIONS,
  LocalMediaTrack,
  PacketLogEntry,
  ProtocolDialect,
  SoundbarState,
  SpotifyLinkState,
} from './shared/protocolTypes';

type NavTab = 'audio' | 'alarms' | 'spotify' | 'media' | 'sj8setup' | 'mesh' | 'inspector';
type UiMode = 'simple' | 'studio';
type SimpleTab = 'now_playing' | 'speakers' | 'sound' | 'alarms';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function App() {
  const [uiMode, setUiMode] = useState<UiMode>(() => {
    try {
      const saved = window.localStorage.getItem('open_musicflow_ui_mode');
      return saved === 'simple' ? 'simple' : 'studio';
    } catch {
      return 'studio';
    }
  });
  const [simpleTab, setSimpleTab] = useState<SimpleTab>('now_playing');
  const [activeTab, setActiveTab] = useState<NavTab>('audio');
  const [soundbar, setSoundbar] = useState<SoundbarState | null>(null);
  const [spotify, setSpotify] = useState<SpotifyLinkState | null>(null);
  const [tracks, setTracks] = useState<LocalMediaTrack[]>([]);
  const [packetLogs, setPacketLogs] = useState<PacketLogEntry[]>([]);
  const [statusBanner, setStatusBanner] = useState<string>('');

  const switchUiMode = (mode: UiMode) => {
    setUiMode(mode);
    try {
      window.localStorage.setItem('open_musicflow_ui_mode', mode);
    } catch {
      // Ignore storage errors in restricted contexts
    }
  };

  // Connection Bar Form State
  const [hostInput, setHostInput] = useState<string>('127.0.0.1');
  const [portInput, setPortInput] = useState<number>(19741);
  const [dialectInput, setDialectInput] = useState<ProtocolDialect>('auto');
  const [encryptionInput, setEncryptionInput] = useState<EncryptionMode>('sj8_v1');
  const [showAllInputs, setShowAllInputs] = useState<boolean>(false);
  const [showAllEqs, setShowAllEqs] = useState<boolean>(false);
  const [fadeSeconds, setFadeSeconds] = useState<number>(0);

  // Alarm Creator Form State
  const [alarmTitle, setAlarmTitle] = useState<string>('SJ8 Morning Wakeup');
  const [alarmHour, setAlarmHour] = useState<number>(7);
  const [alarmMinute, setAlarmMinute] = useState<number>(30);
  const [alarmDays, setAlarmDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [alarmVolume, setAlarmVolume] = useState<number>(17);
  const [alarmDuration, setAlarmDuration] = useState<number>(45);
  const [alarmFadeSec, setAlarmFadeSec] = useState<number>(15);
  const [alarmSource, setAlarmSource] = useState<
    'default_chime' | 'spotify' | 'local_stream' | 'input_switch'
  >('default_chime');
  const [alarmSpotifyUri, setAlarmSpotifyUri] = useState<string>(
    'spotify:playlist:37i9dQZF1DXbITWG1ZJKYt'
  );
  const [alarmLocalTrackId, setAlarmLocalTrackId] = useState<string>('track-sunrise-flac');
  const [alarmShuffle, setAlarmShuffle] = useState<boolean>(true);

  // SJ8 Wi-Fi Setup & Onboarding Form State (`sj8-wifi-setup.py`)
  const [setupApIp, setSetupApIp] = useState<string>('192.168.5.100');
  const [setupSsid, setSetupSsid] = useState<string>('o');
  const [setupPassword, setSetupPassword] = useState<string>('');
  const [registerHostIp, setRegisterHostIp] = useState<string>('192.168.0.10');
  const [registerName, setRegisterName] = useState<string>('LG SJ8');
  const [provisionOutput, setProvisionOutput] = useState<string>('');

  // Spotify Linking State
  const [spotifyClientId, setSpotifyClientId] = useState<string>('');
  const [spotifyAccessToken, setSpotifyAccessToken] = useState<string>('');
  const [customSpotifyUri, setCustomSpotifyUri] = useState<string>(
    'spotify:playlist:37i9dQZF1DXbITWG1ZJKYt'
  );

  // Local Media Folder Scan & Browser Preview
  const [scanFolderInput, setScanFolderInput] = useState<string>('/home/antigravity');
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string>('');
  const [previewTrackTitle, setPreviewTrackTitle] = useState<string>('');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Raw Packet Dispatcher
  const [rawJsonInput, setRawJsonInput] = useState<string>(
    JSON.stringify({ msg: 'SETTING_INFO_REQ' }, null, 2)
  );

  useEffect(() => {
    fetchInitialState();

    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProto}//${window.location.host}/ws`;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const connectWs = () => {
      if (disposed) return;
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'init') {
            setSoundbar(msg.data.soundbar);
            setSpotify(msg.data.spotify);
            setTracks(msg.data.tracks || []);
            setPacketLogs(msg.data.packetLogs || []);
            if (msg.data.soundbar?.host) setHostInput(msg.data.soundbar.host);
            if (msg.data.soundbar?.port) setPortInput(msg.data.soundbar.port);
            if (msg.data.soundbar?.encryption) setEncryptionInput(msg.data.soundbar.encryption);
          } else if (msg.type === 'state') {
            setSoundbar(msg.data);
          } else if (msg.type === 'spotify') {
            setSpotify(msg.data);
          } else if (msg.type === 'packet') {
            setPacketLogs((prev) => [msg.data, ...prev.slice(0, 149)]);
          } else if (msg.type === 'alarmTriggered') {
            showToast(`Wi-Fi Alarm Triggered: "${msg.data.title}" (Vol ${msg.data.volume})`);
          }
        } catch {
          // Ignore malformed frame
        }
      };
      ws.onclose = () => {
        if (!disposed) {
          reconnectTimer = setTimeout(connectWs, 2000);
        }
      };
      ws.onerror = () => {
        ws?.close();
      };
    };

    connectWs();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  const showToast = (msg: string) => {
    setStatusBanner(msg);
    setTimeout(() => {
      setStatusBanner((curr) => (curr === msg ? '' : curr));
    }, 4500);
  };

  const fetchInitialState = async () => {
    try {
      const res = await fetch('/api/state');
      const data = await res.json();
      setSoundbar(data.soundbar);
      setSpotify(data.spotify);
      setTracks(data.tracks || []);
      setPacketLogs(data.packetLogs || []);
      if (data.soundbar?.host) setHostInput(data.soundbar.host);
      if (data.soundbar?.port) setPortInput(data.soundbar.port);
      if (data.soundbar?.encryption) setEncryptionInput(data.soundbar.encryption);
    } catch (err) {
      console.error('Failed to fetch initial state:', err);
    }
  };

  const connectToEndpoint = async (
    targetHost: string,
    targetPort: number,
    targetDialect: ProtocolDialect = dialectInput,
    targetEnc: EncryptionMode = encryptionInput
  ) => {
    setHostInput(targetHost);
    setPortInput(targetPort);
    setDialectInput(targetDialect);
    setEncryptionInput(targetEnc);
    try {
      const res = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: targetHost,
          port: Number(targetPort),
          dialect: targetDialect,
          encryption: targetEnc,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setSoundbar(data.state);
        showToast(`Connected to ${targetHost}:${targetPort} (${targetEnc.toUpperCase()})`);
      } else {
        showToast(`Connection failed: ${data.error}`);
      }
    } catch (err) {
      showToast(`Connection error: ${(err as Error).message}`);
    }
  };

  const setVolume = async (vol: number) => {
    if (!soundbar) return;
    setSoundbar({ ...soundbar, volume: vol });
    await fetch('/api/volume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ volume: vol, fadeTime: fadeSeconds }),
    });
  };

  const toggleMute = async () => {
    if (!soundbar) return;
    const nextMute = !soundbar.muted;
    setSoundbar({ ...soundbar, muted: nextMute });
    await fetch('/api/mute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ muted: nextMute }),
    });
  };

  const stepVolume = async (direction: 'up' | 'down') => {
    if (!soundbar) return;
    const delta = direction === 'up' ? 1 : -1;
    const nextVol = Math.max(0, Math.min(soundbar.maxVolume || 100, soundbar.volume + delta));
    setSoundbar({ ...soundbar, volume: nextVol });
    const res = await fetch(`/api/volume/${direction}`, { method: 'POST' });
    const data = await res.json().catch(() => null);
    if (data?.ok && data.soundbar) setSoundbar(data.soundbar);
  };

  const handlePlaybackAction = async (
    action: 'toggle' | 'play' | 'pause' | 'stop' | 'previous' | 'next' | 'shuffle' | 'repeat'
  ) => {
    const endpoint =
      action === 'toggle'
        ? '/api/spotify/toggle'
        : action === 'pause'
          ? '/api/spotify/pause'
          : action === 'stop'
            ? '/api/spotify/stop'
            : '/api/spotify/control';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const data = await res.json().catch(() => null);
    if (data?.ok) {
      if (data.spotify) setSpotify(data.spotify);
      if (data.soundbar) setSoundbar(data.soundbar);
    }
  };

  const selectFunction = async (funcId: number) => {
    if (!soundbar) return;
    setSoundbar({ ...soundbar, currentFunction: funcId });
    await fetch('/api/function', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ functionId: funcId }),
    });
  };

  const selectEq = async (eqId: number) => {
    if (!soundbar) return;
    setSoundbar({ ...soundbar, currentEq: eqId });
    await fetch('/api/eq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eqId }),
    });
  };

  const updateTone = async (partial: {
    bass?: number;
    treble?: number;
    lrBalance?: number;
    save?: boolean;
  }) => {
    if (!soundbar) return;
    setSoundbar({ ...soundbar, ...partial });
    await fetch('/api/tone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial),
    });
    if (partial.save) {
      showToast('Equalizer & Tone registers saved to Soundbar NVRAM');
    }
  };

  const updateSetting = async (partial: Record<string, unknown>) => {
    if (!soundbar) return;
    setSoundbar({ ...soundbar, ...partial });
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial),
    });
  };

  const handleCreateAlarm = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/alarms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: alarmTitle,
        hour: alarmHour,
        minute: alarmMinute,
        daysList: alarmDays,
        volume: alarmVolume,
        durationMinutes: alarmDuration,
        fadeInSeconds: alarmFadeSec,
        sourceType: alarmSource,
        spotifyUri: alarmSpotifyUri,
        localTrackId: alarmLocalTrackId,
        shuffle: alarmShuffle,
        enable: true,
      }),
    });
    const data = await res.json();
    if (data.ok && soundbar) {
      setSoundbar({ ...soundbar, alarms: data.alarms });
      showToast(
        `Wi-Fi Alarm "${alarmTitle}" synced via ALARM_SET${
          alarmSource === 'local_stream' ? ' + SET_ALARM_PLAYLIST (:49252)' : ''
        }`
      );
    }
  };

  const handleToggleAlarm = async (id: number, enable: boolean) => {
    const res = await fetch(`/api/alarms/${id}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enable }),
    });
    const data = await res.json();
    if (data.ok && soundbar) {
      setSoundbar({ ...soundbar, alarms: data.alarms });
    }
  };

  const handleDeleteAlarm = async (id: number) => {
    const res = await fetch(`/api/alarms/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.ok && soundbar) {
      setSoundbar({ ...soundbar, alarms: data.alarms });
      showToast('Wi-Fi Alarm deleted (ALARM_SET mode=2)');
    }
  };

  const handleTriggerAlarmNow = async (id: number) => {
    await fetch(`/api/alarms/${id}/trigger`, { method: 'POST' });
    showToast('Triggered Wi-Fi Alarm wakeup sequence on Soundbar');
  };

  const handleSpotifyTransfer = async (deviceId: string) => {
    const res = await fetch('/api/spotify/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId }),
    });
    const data = await res.json();
    if (data.ok) {
      setSpotify(data.spotify);
      setSoundbar(data.soundbar);
      showToast('Transferred Spotify Connect stream to LG SJ8 (Function #8)');
    }
  };

  const handleSpotifyPlayUri = async (uri: string, title?: string) => {
    const res = await fetch('/api/spotify/play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uri, title }),
    });
    const data = await res.json();
    if (data.ok) {
      setSpotify(data.spotify);
      setSoundbar(data.soundbar);
      showToast(`Streaming "${title || uri}" on LG SJ8 via Spotify Connect`);
    }
  };

  const handleSaveSpotifyToken = async () => {
    const res = await fetch('/api/spotify/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: spotifyClientId,
        accessToken: spotifyAccessToken,
      }),
    });
    const data = await res.json();
    if (data.ok) {
      setSpotify(data.spotify);
      showToast('Spotify account credentials linked');
    }
  };

  const handleGenerateSpotifyPkce = async () => {
    if (!spotifyClientId.trim()) {
      showToast('Enter your Spotify Developer Client ID first');
      return;
    }
    const redirectUri = `${window.location.origin}/api/spotify/callback`;
    const res = await fetch('/api/spotify/auth-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: spotifyClientId, redirectUri }),
    });
    const data = await res.json();
    if (data.ok && data.authUrl) {
      window.open(data.authUrl, '_blank', 'noopener,noreferrer');
      showToast('Opened Spotify OAuth 2.0 PKCE authorization window');
    }
  };

  const handlePlayLocalTrack = async (track: LocalMediaTrack) => {
    const res = await fetch('/api/media/play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackId: track.id }),
    });
    const data = await res.json();
    if (data.ok) {
      setSoundbar(data.soundbar);
      setPreviewAudioUrl(track.streamPath);
      setPreviewTrackTitle(track.title);
      showToast(`Streaming "${track.title}" via DMS (:49252) LOCAL_PLAY_URL`);
      setTimeout(() => {
        audioRef.current?.play().catch(() => {});
      }, 100);
    }
  };

  const handleScanFolder = async () => {
    const res = await fetch('/api/media/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dirPath: scanFolderInput }),
    });
    const data = await res.json();
    if (data.ok) {
      setTracks(data.tracks);
      showToast(`Scanned folder "${scanFolderInput}" (${data.tracks.length} total tracks)`);
    } else {
      showToast(`Scan error: ${data.error}`);
    }
  };

  const handleProvisionSj8 = async (e: React.FormEvent) => {
    e.preventDefault();
    setProvisionOutput('Connecting to MusicFlow_Setup AP and sending SHARE_HOME_INFO...');
    try {
      const res = await fetch('/api/sj8/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apHost: setupApIp,
          apPort: 9741,
          ssid: setupSsid,
          password: setupPassword,
        }),
      });
      const data = await res.json();
      setProvisionOutput(JSON.stringify(data, null, 2));
      if (data.ok) {
        showToast(`Pushed SHARE_HOME_INFO for SSID "${setupSsid}" to ${setupApIp}:9741`);
      } else {
        showToast(`Provisioning failed: ${data.error}`);
      }
    } catch (err) {
      setProvisionOutput(`Error: ${(err as Error).message}`);
    }
  };

  const handleRegisterSj8 = async () => {
    setProvisionOutput(`Sending SPK_ADD_SET ("${registerName}") to ${registerHostIp}:9741...`);
    try {
      const res = await fetch('/api/sj8/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: registerHostIp,
          port: 9741,
          speakerName: registerName,
        }),
      });
      const data = await res.json();
      setProvisionOutput(JSON.stringify(data, null, 2));
      if (data.ok) {
        showToast(`Registered speaker "${registerName}" via SPK_ADD_SET`);
      } else {
        showToast(`Registration error: ${data.error}`);
      }
    } catch (err) {
      setProvisionOutput(`Error: ${(err as Error).message}`);
    }
  };

  const handleSendRawPacket = async () => {
    try {
      const parsed = JSON.parse(rawJsonInput);
      await fetch('/api/raw-packet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: parsed }),
      });
      showToast(`Dispatched raw TCP 9741 packet: ${parsed.msg || 'CUSTOM'}`);
    } catch (err) {
      showToast(`Invalid JSON payload: ${(err as Error).message}`);
    }
  };

  if (!soundbar) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>
        Initializing Open MusicFlow Studio & LG SJ8 TCP 9741 Engine...
      </div>
    );
  }

  const activeEqPreset =
    LG_EQ_PRESETS.find((e) => e.id === soundbar.currentEq) || LG_EQ_PRESETS[0];
  const activeInputDef =
    LG_INPUT_FUNCTIONS.find((f) => f.id === soundbar.currentFunction) || LG_INPUT_FUNCTIONS[0];

  const availFuncs = soundbar.availableFunctions || [0, 15, 1, 12, 6, 5, 8, 14];
  const availEqs = soundbar.availableEqs || [14, 0, 7, 12];

  const displayedFunctions = showAllInputs
    ? LG_INPUT_FUNCTIONS
    : LG_INPUT_FUNCTIONS.filter((f) => availFuncs.includes(f.id));

  const displayedEqs = showAllEqs
    ? LG_EQ_PRESETS
    : LG_EQ_PRESETS.filter((e) => availEqs.includes(e.id));

  const previewBitmask = alarmDays.reduce((acc, d) => acc | (1 << (6 - d)), 0);

  const modeSwitcher = (
    <div className="mode-switcher" role="group" aria-label="Interface Mode">
      <button
        id="btn-mode-simple"
        className={`mode-switcher-btn ${uiMode === 'simple' ? 'active' : ''}`}
        onClick={() => switchUiMode('simple')}
        title="Simple LG Music Flow-style remote interface"
      >
        <Smartphone size={13} />
        Simple
      </button>
      <button
        id="btn-mode-studio"
        className={`mode-switcher-btn ${uiMode === 'studio' ? 'active' : ''}`}
        onClick={() => switchUiMode('studio')}
        title="Full Open MusicFlow Studio console"
      >
        <LayoutGrid size={13} />
        Studio
      </button>
    </div>
  );

  if (uiMode === 'simple') {
    const simpleFunctions = LG_INPUT_FUNCTIONS.filter((f) => availFuncs.includes(f.id));
    const simpleEqs = LG_EQ_PRESETS.filter((e) => availEqs.includes(e.id));
    const isPlaying = soundbar.playInfo.playing;

    return (
      <div className="mf-shell">
        {/* LG Music Flow Inspired Crimson Top App Bar */}
        <header className="mf-appbar">
          <div className="mf-appbar-left">
            <div className="mf-appbar-logo">
              <Speaker size={20} />
            </div>
            <div>
              <div className="mf-appbar-title">Music Flow</div>
              <div className="mf-appbar-sub">
                <span
                  className={`status-dot ${soundbar.connected ? 'online' : 'offline'}`}
                  style={{ width: 7, height: 7 }}
                />
                <span>{soundbar.petName || 'LG SJ8'}</span>
                <span>•</span>
                <span>
                  {soundbar.connected
                    ? soundbar.isSimulator
                      ? 'Demo Speaker'
                      : 'Connected'
                    : 'Offline'}
                </span>
              </div>
            </div>
          </div>

          <div className="mf-appbar-right">
            {modeSwitcher}
            <button
              id="btn-simple-refresh"
              className="btn"
              style={{
                background: 'rgba(255,255,255,0.14)',
                borderColor: 'rgba(255,255,255,0.28)',
                color: '#ffffff',
              }}
              onClick={() => fetch('/api/refresh', { method: 'POST' })}
              title="Refresh speaker status"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </header>

        {/* Classic LG Music Flow Tab Strip */}
        <nav className="mf-tabbar" aria-label="Music Flow Navigation">
          <button
            id="mf-tab-now-playing"
            className={`mf-tab ${simpleTab === 'now_playing' ? 'active' : ''}`}
            onClick={() => setSimpleTab('now_playing')}
          >
            <Music size={15} />
            Now Playing
          </button>
          <button
            id="mf-tab-speakers"
            className={`mf-tab ${simpleTab === 'speakers' ? 'active' : ''}`}
            onClick={() => setSimpleTab('speakers')}
          >
            <Speaker size={15} />
            Speakers &amp; Inputs
          </button>
          <button
            id="mf-tab-sound"
            className={`mf-tab ${simpleTab === 'sound' ? 'active' : ''}`}
            onClick={() => setSimpleTab('sound')}
          >
            <Sliders size={15} />
            Sound &amp; EQ
          </button>
          <button
            id="mf-tab-alarms"
            className={`mf-tab ${simpleTab === 'alarms' ? 'active' : ''}`}
            onClick={() => setSimpleTab('alarms')}
          >
            <Bell size={15} />
            Alarms
          </button>
        </nav>

        {/* Main Centered Content */}
        <main className="mf-content">
          {statusBanner && (
            <div
              className="mf-card"
              style={{
                padding: '10px 16px',
                borderColor: 'rgba(227, 24, 55, 0.45)',
                background: 'rgba(227, 24, 55, 0.14)',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <CheckCircle2 size={15} color="#ff4d6a" />
              <span>{statusBanner}</span>
            </div>
          )}

          {simpleTab === 'now_playing' && (
            <>
              <section className="mf-card mf-now-playing">
                <div className={`mf-artwork ${isPlaying ? 'playing' : ''}`}>
                  <Disc size={54} />
                  <span className="mf-source-tag">
                    {soundbar.playInfo.sourceApp || activeInputDef.label}
                  </span>
                </div>

                <div>
                  <div className="mf-track-title">
                    {soundbar.playInfo.title || activeInputDef.label}
                  </div>
                  <div className="mf-track-sub">
                    {soundbar.playInfo.artist ||
                      (isPlaying ? 'Playing on LG SJ8' : 'Paused • Ready to play')}
                  </div>
                </div>

                <div className="mf-transport">
                  <button
                    id="mf-btn-shuffle"
                    className={`mf-icon-btn ${soundbar.playInfo.shuffle ? 'active' : ''}`}
                    onClick={() => handlePlaybackAction('shuffle')}
                    title="Shuffle"
                  >
                    <Shuffle size={17} />
                  </button>
                  <button
                    id="mf-btn-prev"
                    className="mf-icon-btn"
                    onClick={() => handlePlaybackAction('previous')}
                    title="Previous Track"
                  >
                    <SkipBack size={18} />
                  </button>
                  <button
                    id="mf-btn-play-toggle"
                    className="mf-play-fab"
                    onClick={() => handlePlaybackAction('toggle')}
                    title={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? <Pause size={28} /> : <Play size={28} style={{ marginLeft: 3 }} />}
                  </button>
                  <button
                    id="mf-btn-next"
                    className="mf-icon-btn"
                    onClick={() => handlePlaybackAction('next')}
                    title="Next Track"
                  >
                    <SkipForward size={18} />
                  </button>
                  <button
                    id="mf-btn-repeat"
                    className={`mf-icon-btn ${soundbar.playInfo.repeat > 0 ? 'active' : ''}`}
                    onClick={() => handlePlaybackAction('repeat')}
                    title="Repeat"
                  >
                    <Repeat size={17} />
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button
                    id="mf-btn-pause"
                    className="btn"
                    onClick={() => handlePlaybackAction('pause')}
                  >
                    <Pause size={13} />
                    Pause
                  </button>
                  <button
                    id="mf-btn-stop"
                    className="btn"
                    onClick={() => handlePlaybackAction('stop')}
                  >
                    <Square size={13} />
                    Stop
                  </button>
                  <button
                    id="mf-btn-spotify-quick"
                    className="btn btn-spotify"
                    onClick={() =>
                      handleSpotifyPlayUri(
                        customSpotifyUri,
                        spotify?.currentTrack?.title || 'Spotify Connect'
                      )
                    }
                  >
                    <Disc size={14} />
                    Play on Spotify
                  </button>
                </div>
              </section>

              {tracks.length > 0 && (
                <section className="mf-card">
                  <div className="mf-card-title">
                    <span>My Music</span>
                    <span style={{ fontSize: 12, color: '#9ba3b2', fontWeight: 500 }}>
                      Tap to stream to {soundbar.petName}
                    </span>
                  </div>
                  <div className="mf-list">
                    {tracks.slice(0, 5).map((t) => (
                      <div key={t.id} className="mf-list-row">
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{t.title}</div>
                          <div style={{ fontSize: 12, color: '#9ba3b2' }}>
                            {t.artist} • {t.format.toUpperCase()}
                          </div>
                        </div>
                        <button
                          className="btn"
                          onClick={() => handlePlayLocalTrack(t)}
                          title={`Play ${t.title}`}
                        >
                          <Play size={13} />
                          Play
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {simpleTab === 'speakers' && (
            <>
              <section className="mf-card">
                <div className="mf-card-title">
                  <span>Active Speaker</span>
                  <span style={{ fontSize: 12, color: '#9ba3b2', fontWeight: 500 }}>
                    {activeInputDef.label} • {activeEqPreset.label}
                  </span>
                </div>
                <div className="mf-list-row active" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 10,
                          background: 'rgba(227, 24, 55, 0.2)',
                          color: '#ff4d6a',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Speaker size={22} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{soundbar.petName || 'LG SJ8'}</div>
                        <div style={{ fontSize: 12, color: '#9ba3b2' }}>
                          {soundbar.connected
                            ? soundbar.isSimulator
                              ? 'Demo Mode (Built-in Simulator)'
                              : `Connected on Wi-Fi (${soundbar.host})`
                            : 'Not connected'}
                        </div>
                      </div>
                    </div>
                    <button
                      className={`btn ${soundbar.muted ? 'btn-danger' : ''}`}
                      onClick={toggleMute}
                    >
                      {soundbar.muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                      {soundbar.muted ? 'Muted' : `${soundbar.volume}%`}
                    </button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button className="mf-icon-btn" style={{ width: 34, height: 34 }} onClick={() => stepVolume('down')} title="Volume Down">
                      <Minus size={15} />
                    </button>
                    <input
                      type="range"
                      className="mf-slider"
                      min={0}
                      max={soundbar.maxVolume || 100}
                      value={soundbar.volume}
                      onChange={(e) => setVolume(Number(e.target.value))}
                    />
                    <button className="mf-icon-btn" style={{ width: 34, height: 34 }} onClick={() => stepVolume('up')} title="Volume Up">
                      <Plus size={15} />
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                  <button
                    className="btn"
                    onClick={() => connectToEndpoint('192.168.0.10', 9741, 'musicflow', 'sj8_v1')}
                  >
                    <Wifi size={14} />
                    Connect LG SJ8
                  </button>
                  <button
                    className="btn"
                    onClick={() => connectToEndpoint('127.0.0.1', 19741, 'auto', 'sj8_v1')}
                  >
                    <Zap size={14} />
                    Demo Speaker
                  </button>
                </div>
              </section>

              <section className="mf-card">
                <div className="mf-card-title">
                  <span>Input Source</span>
                  <span style={{ fontSize: 12, color: '#9ba3b2', fontWeight: 500 }}>
                    Current: {activeInputDef.label}
                  </span>
                </div>
                <div className="mf-chip-grid">
                  {simpleFunctions.map((fn) => (
                    <button
                      key={fn.id}
                      className={`mf-chip ${soundbar.currentFunction === fn.id ? 'active' : ''}`}
                      onClick={() => selectFunction(fn.id)}
                    >
                      {fn.label}
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}

          {simpleTab === 'sound' && (
            <>
              <section className="mf-card">
                <div className="mf-card-title">
                  <span>Sound Effect</span>
                  <span style={{ fontSize: 12, color: '#9ba3b2', fontWeight: 500 }}>
                    {activeEqPreset.label}
                  </span>
                </div>
                <div className="mf-chip-grid">
                  {simpleEqs.map((eq) => (
                    <button
                      key={eq.id}
                      className={`mf-chip ${soundbar.currentEq === eq.id ? 'active' : ''}`}
                      onClick={() => selectEq(eq.id)}
                    >
                      {eq.label}
                    </button>
                  ))}
                </div>
              </section>

              <section className="mf-card">
                <div className="mf-card-title">
                  <span>Subwoofer &amp; Tone</span>
                </div>
                <div className="mf-list">
                  <div className="mf-list-row" style={{ gap: 16 }}>
                    <span style={{ minWidth: 92, fontWeight: 600, fontSize: 13.5 }}>Subwoofer</span>
                    <input
                      type="range"
                      className="mf-slider"
                      min={soundbar.wooferMin}
                      max={soundbar.wooferMax}
                      value={soundbar.wooferLevel}
                      onChange={(e) => updateSetting({ wooferLevel: Number(e.target.value) })}
                    />
                    <span style={{ minWidth: 52, textAlign: 'right', fontWeight: 600 }}>
                      {soundbar.wooferLevel > 0 ? `+${soundbar.wooferLevel}` : soundbar.wooferLevel} dB
                    </span>
                  </div>
                  <div className="mf-list-row" style={{ gap: 16 }}>
                    <span style={{ minWidth: 92, fontWeight: 600, fontSize: 13.5 }}>Bass</span>
                    <input
                      type="range"
                      className="mf-slider"
                      min={-6}
                      max={6}
                      value={soundbar.bass}
                      onChange={(e) => updateTone({ bass: Number(e.target.value) })}
                    />
                    <span style={{ minWidth: 52, textAlign: 'right', fontWeight: 600 }}>
                      {soundbar.bass > 0 ? `+${soundbar.bass}` : soundbar.bass}
                    </span>
                  </div>
                  <div className="mf-list-row" style={{ gap: 16 }}>
                    <span style={{ minWidth: 92, fontWeight: 600, fontSize: 13.5 }}>Treble</span>
                    <input
                      type="range"
                      className="mf-slider"
                      min={-6}
                      max={6}
                      value={soundbar.treble}
                      onChange={(e) => updateTone({ treble: Number(e.target.value) })}
                    />
                    <span style={{ minWidth: 52, textAlign: 'right', fontWeight: 600 }}>
                      {soundbar.treble > 0 ? `+${soundbar.treble}` : soundbar.treble}
                    </span>
                  </div>
                </div>
              </section>

              <section className="mf-card">
                <div className="mf-card-title">
                  <span>Soundbar Options</span>
                </div>
                <div className="mf-list">
                  {[
                    { key: 'nightMode', label: 'Night Mode', sub: 'Softer loud peaks for late listening', val: soundbar.nightMode },
                    { key: 'autoVolume', label: 'Auto Volume', sub: 'Keep volume consistent across sources', val: soundbar.autoVolume },
                    { key: 'ledIndicator', label: 'Front LED Display', sub: 'Show status lights on the soundbar', val: soundbar.ledIndicator },
                    { key: 'btStandby', label: 'Bluetooth Standby', sub: 'Wake speaker when Bluetooth connects', val: soundbar.btStandby },
                    { key: 'rearEnabled', label: 'Rear Surround Speakers', sub: 'Enable wireless rear surround output', val: soundbar.rearEnabled },
                  ].map((opt) => (
                    <div key={opt.key} className="mf-list-row">
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{opt.label}</div>
                        <div style={{ fontSize: 12, color: '#9ba3b2' }}>{opt.sub}</div>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={opt.val}
                        className={`mf-switch ${opt.val ? 'on' : ''}`}
                        onClick={() => updateSetting({ [opt.key]: !opt.val })}
                      />
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {simpleTab === 'alarms' && (
            <section className="mf-card">
              <div className="mf-card-title">
                <span>Alarms</span>
                <button
                  className="btn"
                  style={{ fontSize: 12, padding: '5px 10px' }}
                  onClick={() => {
                    setActiveTab('alarms');
                    switchUiMode('studio');
                  }}
                >
                  <Plus size={13} />
                  Add / Edit in Studio
                </button>
              </div>
              {soundbar.alarms.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ba3b2' }}>
                  No alarms set yet. Switch to Studio to create a wake-up alarm.
                </div>
              ) : (
                <div className="mf-list">
                  {soundbar.alarms.map((alarm) => (
                    <div key={alarm.id} className="mf-list-row">
                      <div>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700 }}>
                          {String(alarm.hour).padStart(2, '0')}:{String(alarm.minute).padStart(2, '0')}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{alarm.title}</div>
                        <div style={{ fontSize: 12, color: '#9ba3b2' }}>
                          Vol {alarm.volume} •{' '}
                          {alarm.daysList.length === 7
                            ? 'Every day'
                            : alarm.daysList.map((d) => DAY_NAMES[d]).join(', ') || 'Once'}
                        </div>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={alarm.enable}
                        className={`mf-switch ${alarm.enable ? 'on' : ''}`}
                        onClick={() => handleToggleAlarm(alarm.id, !alarm.enable)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </main>

        {/* Persistent Bottom Mini-Player & Volume Dock (LG Music Flow Style) */}
        <footer className="mf-bottom-dock">
          <div className="mf-bottom-dock-inner">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: '1 1 200px' }}>
              <button
                className="mf-icon-btn"
                style={{
                  width: 38,
                  height: 38,
                  background: '#e31837',
                  borderColor: '#e31837',
                  color: '#ffffff',
                }}
                onClick={() => handlePlaybackAction('toggle')}
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause size={16} /> : <Play size={16} style={{ marginLeft: 2 }} />}
              </button>
              <div style={{ minWidth: 0, overflow: 'hidden' }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 13,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {soundbar.playInfo.title || activeInputDef.label}
                </div>
                <div style={{ fontSize: 11.5, color: '#9ba3b2' }}>
                  {soundbar.petName || 'LG SJ8'} • {isPlaying ? 'Playing' : 'Paused'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '1 1 240px' }}>
              <button
                className="mf-icon-btn"
                style={{ width: 34, height: 34 }}
                onClick={toggleMute}
                title={soundbar.muted ? 'Unmute' : 'Mute'}
              >
                {soundbar.muted ? <VolumeX size={15} color="#ff4d6a" /> : <Volume2 size={15} />}
              </button>
              <input
                type="range"
                className="mf-slider"
                min={0}
                max={soundbar.maxVolume || 100}
                value={soundbar.volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                aria-label="Master Volume"
              />
              <span style={{ minWidth: 32, textAlign: 'right', fontWeight: 700, fontSize: 13 }}>
                {soundbar.volume}
              </span>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="studio-shell">
      {/* Top Hardware Console Bar */}
      <header className="top-console-bar">
        <div className="brand-cluster">
          <div className="brand-badge">
            <Speaker size={20} />
          </div>
          <div>
            <h1 className="brand-title">Open MusicFlow Studio</h1>
            <div className="brand-subtitle">
              <span>LG SJ8 & Multiroom Controller</span>
              <span>•</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-amber)' }}>
                {soundbar.petName} ({soundbar.firmwareVersion})
              </span>
            </div>
          </div>
        </div>

        <div className="connection-strip">
          {modeSwitcher}
          <div className="status-indicator" id="connection-status-pill">
            <span className={`status-dot ${soundbar.connected ? 'online' : 'offline'}`} />
            <span>
              {soundbar.connected
                ? soundbar.isSimulator
                  ? `SJ8 SIMULATOR (${soundbar.host}:${soundbar.port})`
                  : `LIVE SJ8 (${soundbar.host}:${soundbar.port})`
                : 'DISCONNECTED'}
            </span>
          </div>

          <input
            id="soundbar-host-input"
            className="input-field mono"
            style={{ width: 132 }}
            value={hostInput}
            onChange={(e) => setHostInput(e.target.value)}
            placeholder="192.168.0.10"
            title="LG SJ8 IP Address (e.g. 192.168.0.10)"
          />
          <input
            id="soundbar-port-input"
            className="input-field mono"
            style={{ width: 74 }}
            type="number"
            value={portInput}
            onChange={(e) => setPortInput(Number(e.target.value))}
            title="TCP Port (9741 for hardware, 19741 for simulator)"
          />
          <select
            id="protocol-encryption-select"
            className="select-field"
            value={encryptionInput}
            onChange={(e) => setEncryptionInput(e.target.value as EncryptionMode)}
            title="Wire Encryption Profile"
          >
            <option value="sj8_v1">0x10 SJ8 V1 AES-256</option>
            <option value="plain">0x00 Plaintext (암호화:False)</option>
            <option value="temescal_v2">0x10 Temescal V2 AES-256</option>
          </select>

          <button
            id="btn-connect-soundbar"
            className="btn btn-primary"
            onClick={() => connectToEndpoint(hostInput, portInput, dialectInput, encryptionInput)}
          >
            <Zap size={14} />
            Connect
          </button>
          <button
            id="btn-connect-live-sj8"
            className="btn"
            onClick={() => connectToEndpoint('192.168.0.10', 9741, 'musicflow', 'sj8_v1')}
            title="Connect to Live LG SJ8 on 192.168.0.10:9741"
          >
            SJ8 (192.168.0.10)
          </button>
          <button
            id="btn-connect-simulator"
            className="btn"
            onClick={() => connectToEndpoint('127.0.0.1', 19741, 'auto', 'sj8_v1')}
            title="Connect to built-in TCP 19741 LG SJ8 simulator"
          >
            SJ8 Simulator
          </button>
          <button
            id="btn-refresh-state"
            className="btn"
            onClick={() => fetch('/api/refresh', { method: 'POST' })}
            title="Run full LG SJ8 startup handshake"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </header>

      {/* Main 3-Column Studio Body */}
      <div className="workspace-body">
        {/* Left Navigation Sidebar */}
        <aside className="nav-sidebar">
          <div>
            <div className="nav-group-label">Console Modules</div>
            <nav className="nav-list">
              <button
                id="nav-tab-audio"
                className={`nav-item ${activeTab === 'audio' ? 'active' : ''}`}
                onClick={() => setActiveTab('audio')}
              >
                <span className="nav-item-left">
                  <Sliders size={16} />
                  Audio & EQ Control
                </span>
                <span className="nav-badge">{activeEqPreset.code}</span>
              </button>

              <button
                id="nav-tab-alarms"
                className={`nav-item ${activeTab === 'alarms' ? 'active' : ''}`}
                onClick={() => setActiveTab('alarms')}
              >
                <span className="nav-item-left">
                  <Bell size={16} />
                  Wi-Fi Alarms
                </span>
                <span className="nav-badge">
                  {soundbar.alarms.filter((a) => a.enable).length}/{soundbar.alarms.length}
                </span>
              </button>

              <button
                id="nav-tab-spotify"
                className={`nav-item ${activeTab === 'spotify' ? 'active' : ''}`}
                onClick={() => setActiveTab('spotify')}
              >
                <span className="nav-item-left">
                  <Disc size={16} />
                  Spotify Linking
                </span>
                <span className="nav-badge" style={{ color: 'var(--accent-spotify)' }}>
                  LINKED
                </span>
              </button>

              <button
                id="nav-tab-media"
                className={`nav-item ${activeTab === 'media' ? 'active' : ''}`}
                onClick={() => setActiveTab('media')}
              >
                <span className="nav-item-left">
                  <Radio size={16} />
                  DMS Media (:49252)
                </span>
                <span className="nav-badge">{tracks.length}</span>
              </button>

              <button
                id="nav-tab-sj8setup"
                className={`nav-item ${activeTab === 'sj8setup' ? 'active' : ''}`}
                onClick={() => setActiveTab('sj8setup')}
              >
                <span className="nav-item-left">
                  <Wifi size={16} />
                  SJ8 Setup & OpenWrt
                </span>
                <span className="nav-badge">SSID: {soundbar.ssid}</span>
              </button>

              <button
                id="nav-tab-mesh"
                className={`nav-item ${activeTab === 'mesh' ? 'active' : ''}`}
                onClick={() => setActiveTab('mesh')}
              >
                <span className="nav-item-left">
                  <Network size={16} />
                  Multi-Room Mesh
                </span>
                <span className="nav-badge">{soundbar.meshNodes.length}</span>
              </button>

              <button
                id="nav-tab-inspector"
                className={`nav-item ${activeTab === 'inspector' ? 'active' : ''}`}
                onClick={() => setActiveTab('inspector')}
              >
                <span className="nav-item-left">
                  <Terminal size={16} />
                  Protocol & Builds
                </span>
                <span className="nav-badge">{packetLogs.length}</span>
              </button>
            </nav>
          </div>

          <div className="device-telemetry-box">
            <div className="nav-group-label" style={{ padding: 0, marginBottom: 4 }}>
              LG SJ8 Hardware Telemetry
            </div>
            <div className="telemetry-row">
              <span className="telemetry-label">PetName</span>
              <span className="telemetry-val">{soundbar.petName}</span>
            </div>
            <div className="telemetry-row">
              <span className="telemetry-label">BE / Micom</span>
              <span className="telemetry-val">
                {soundbar.firmwareVersion} / {soundbar.micomVersion}
              </span>
            </div>
            <div className="telemetry-row">
              <span className="telemetry-label">HDMI / Cast</span>
              <span className="telemetry-val">
                {soundbar.hdmiVersion} / {soundbar.c4aVersion}
              </span>
            </div>
            <div className="telemetry-row">
              <span className="telemetry-label">Wi-Fi MAC</span>
              <span className="telemetry-val">{soundbar.macAddress}</span>
            </div>
            <div className="telemetry-row">
              <span className="telemetry-label">BT MAC</span>
              <span className="telemetry-val">{soundbar.bluetoothMac}</span>
            </div>
            <div className="telemetry-row">
              <span className="telemetry-label">SJ8 IPv4</span>
              <span className="telemetry-val">{soundbar.ipv4Addr}</span>
            </div>
          </div>
        </aside>

        {/* Center Interactive Stage */}
        <main className="center-stage">
          {statusBanner && (
            <div
              style={{
                padding: '10px 16px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--accent-amber-soft)',
                border: '1px solid var(--accent-amber)',
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 13,
              }}
            >
              <span>{statusBanner}</span>
              <button
                className="btn"
                style={{ padding: '2px 8px', fontSize: 11 }}
                onClick={() => setStatusBanner('')}
              >
                Dismiss
              </button>
            </div>
          )}

          {/* TAB 1: AUDIO, INPUT, EQ & CHANNEL LEVELS */}
          {activeTab === 'audio' && (
            <>
              <div className="stage-header">
                <div>
                  <h2 className="stage-title">LG SJ8 Device & Acoustic Control</h2>
                  <p className="stage-desc">
                    Matched to your LG SJ8 (`functionlist: [0, 15, 1, 12, 6, 5]`, `eqlist: [14, 0, 7, 12]`, `wooferoffset: -15`, `FUNC_NAME_REQ #15: Optical/HDMI ARC`).
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    id="btn-trigger-test-tone"
                    className="btn"
                    onClick={() => {
                      fetch('/api/test-tone', { method: 'POST' });
                      showToast('Dispatched TEST_TONE calibration signal to LG SJ8');
                    }}
                  >
                    <Volume2 size={14} />
                    Calibration Test Tone
                  </button>
                </div>
              </div>

              {/* Input / Function Selector */}
              <section className="studio-panel">
                <div className="panel-header">
                  <div className="panel-title">
                    <span>Input Source Routing (FUNCTION_SET / FUNC_INFO_REQ)</span>
                  </div>
                  <button
                    id="btn-toggle-all-inputs"
                    className="btn"
                    style={{ padding: '4px 10px', fontSize: 12 }}
                    onClick={() => setShowAllInputs(!showAllInputs)}
                  >
                    {showAllInputs
                      ? `Show LG SJ8 Native Inputs (${soundbar.availableFunctions.length})`
                      : `Show All 20 LG Protocol Inputs`}
                  </button>
                </div>

                <div className="input-grid">
                  {displayedFunctions.map((fn) => {
                    const isActive = soundbar.currentFunction === fn.id;
                    const customLabel = soundbar.customFunctionNames?.[fn.id] || fn.label;
                    return (
                      <button
                        key={fn.id}
                        id={`input-source-${fn.code.toLowerCase()}`}
                        className={`input-tile ${isActive ? 'active' : ''}`}
                        onClick={() => selectFunction(fn.id)}
                      >
                        <div className="input-tile-top">
                          <span>FUNC #{fn.id}</span>
                          <span>{fn.category.toUpperCase()}</span>
                        </div>
                        <div className="input-tile-name">{customLabel}</div>
                        <div className="input-tile-desc">{fn.description}</div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Equalizer & Hardware Tone Matrix */}
              <section className="studio-panel">
                <div className="panel-header">
                  <div className="panel-title">
                    <span>DSP Sound Mode & Equalizer (EQ_SETTING / EQ_INFO_REQ)</span>
                  </div>
                  <button
                    id="btn-toggle-all-eqs"
                    className="btn"
                    style={{ padding: '4px 10px', fontSize: 12 }}
                    onClick={() => setShowAllEqs(!showAllEqs)}
                  >
                    {showAllEqs
                      ? `Show SJ8 Native EQs ([14, 0, 7, 12])`
                      : `Show All 19 LG EQ Modes`}
                  </button>
                </div>

                <div className="eq-layout">
                  <div className="eq-preset-grid">
                    {displayedEqs.map((eq) => {
                      const isActive = soundbar.currentEq === eq.id;
                      return (
                        <button
                          key={eq.id}
                          id={`eq-preset-${eq.code.toLowerCase()}`}
                          className={`eq-chip ${isActive ? 'active' : ''}`}
                          onClick={() => selectEq(eq.id)}
                          title={eq.description}
                        >
                          <span className="eq-chip-label">{eq.label}</span>
                          <span className="eq-chip-code">
                            #{eq.id} • {eq.code}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="eq-visualizer-box">
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{activeEqPreset.label}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                        {activeEqPreset.description}
                      </div>
                    </div>

                    <div className="eq-bars">
                      {['60Hz', '250Hz', '1kHz', '4kHz', '12kHz'].map((freqLabel, idx) => {
                        const db = activeEqPreset.curve[idx] || 0;
                        const pct = Math.min(100, Math.max(15, Math.round(((db + 7) / 14) * 100)));
                        return (
                          <div className="eq-bar-col" key={freqLabel}>
                            <div className="eq-bar-track">
                              <div className="eq-bar-fill" style={{ height: `${pct}%` }} />
                            </div>
                            <span className="eq-bar-freq">{freqLabel}</span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Bass / Treble / Balance Registers */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div className="fader-top">
                        <span>Bass Register (type=1)</span>
                        <span className="fader-value">
                          {soundbar.bass > 0 ? `+${soundbar.bass}` : soundbar.bass} dB
                        </span>
                      </div>
                      <input
                        id="slider-tone-bass"
                        type="range"
                        className="range-slider"
                        min={-6}
                        max={6}
                        value={soundbar.bass}
                        onChange={(e) => updateTone({ bass: Number(e.target.value) })}
                      />

                      <div className="fader-top">
                        <span>Treble Register (type=2)</span>
                        <span className="fader-value">
                          {soundbar.treble > 0 ? `+${soundbar.treble}` : soundbar.treble} dB
                        </span>
                      </div>
                      <input
                        id="slider-tone-treble"
                        type="range"
                        className="range-slider"
                        min={-6}
                        max={6}
                        value={soundbar.treble}
                        onChange={(e) => updateTone({ treble: Number(e.target.value) })}
                      />

                      <button
                        id="btn-save-eq-nvram"
                        className="btn"
                        style={{ marginTop: 4 }}
                        onClick={() => updateTone({ save: true })}
                      >
                        Save Tone to SJ8 NVRAM (type=4, val=1)
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              {/* Channel Levels & AV Sync */}
              <section className="studio-panel">
                <div className="panel-header">
                  <div className="panel-title">
                    <span>Subwoofer Offset Trim & Lip-Sync Delay (SETTING_INFO_REQ)</span>
                  </div>
                  <span className="panel-meta">
                    SJ8 Woofer Math: Raw {soundbar.wooferRaw} + Offset ({soundbar.wooferOffset}) ={' '}
                    {soundbar.wooferLevel} dB
                  </span>
                </div>

                <div className="fader-grid">
                  <div className="fader-card">
                    <div className="fader-top">
                      <span>Subwoofer Level (WOOFER_LEVEL_SET)</span>
                      <span className="fader-value">
                        {soundbar.wooferLevel > 0 ? `+${soundbar.wooferLevel}` : soundbar.wooferLevel} dB
                        (Raw {soundbar.wooferRaw}/21)
                      </span>
                    </div>
                    <input
                      id="slider-woofer-level"
                      type="range"
                      className="range-slider"
                      min={soundbar.wooferMin}
                      max={soundbar.wooferMax}
                      value={soundbar.wooferLevel}
                      onChange={(e) => updateSetting({ wooferLevel: Number(e.target.value) })}
                    />
                  </div>

                  <div className="fader-card">
                    <div className="fader-top">
                      <span>AV Lip-Sync Delay (AV_SYNC_SET)</span>
                      <span className="fader-value">{soundbar.avSyncMs} ms</span>
                    </div>
                    <input
                      id="slider-av-sync"
                      type="range"
                      className="range-slider"
                      min={0}
                      max={300}
                      step={10}
                      value={soundbar.avSyncMs}
                      onChange={(e) => updateSetting({ avSyncMs: Number(e.target.value) })}
                    />
                  </div>

                  <div className="fader-card">
                    <div className="fader-top">
                      <span>Rear Surround Trim (REARBOX_LEVEL_SET)</span>
                      <span className="fader-value">
                        {soundbar.rearLevel > 0 ? `+${soundbar.rearLevel}` : soundbar.rearLevel} dB
                      </span>
                    </div>
                    <input
                      id="slider-rear-level"
                      type="range"
                      className="range-slider"
                      min={-6}
                      max={6}
                      value={soundbar.rearLevel}
                      onChange={(e) => updateSetting({ rearLevel: Number(e.target.value) })}
                    />
                  </div>

                  <div className="fader-card">
                    <div className="fader-top">
                      <span>Sleep Timer (SLEEP_SET)</span>
                      <span className="fader-value">
                        {soundbar.sleepTimerMinutes > 0
                          ? `${soundbar.sleepTimerMinutes} min`
                          : 'Disabled'}
                      </span>
                    </div>
                    <select
                      id="select-sleep-timer"
                      className="select-field"
                      value={soundbar.sleepTimerMinutes}
                      onChange={(e) =>
                        updateSetting({ sleepTimerMinutes: Number(e.target.value) })
                      }
                    >
                      <option value={0}>Off (0 min)</option>
                      <option value={15}>15 Minutes</option>
                      <option value={30}>30 Minutes</option>
                      <option value={60}>60 Minutes</option>
                      <option value={90}>90 Minutes</option>
                      <option value={120}>120 Minutes</option>
                    </select>
                  </div>
                </div>
              </section>

              {/* Hardware DSP & System Switches */}
              <section className="studio-panel">
                <div className="panel-header">
                  <div className="panel-title">
                    <span>LG SJ8 Hardware DSP & System Flags</span>
                  </div>
                </div>

                <div className="toggle-grid">
                  {[
                    { key: 'nightMode', label: 'Night Mode (NIGHT_MODE_SET)', sub: 'Compress loud LFE transients' },
                    { key: 'autoPower', label: 'Auto Power (AUTO_POWER_SET)', sub: 'Wake on Optical/ARC signal' },
                    { key: 'autoVolume', label: 'Auto Volume (AUTO_VOL_SET)', sub: 'Level loudness across inputs' },
                    { key: 'drc', label: 'Dolby DRC (DRC_SET)', sub: 'Dynamic Range Control' },
                    { key: 'ledIndicator', label: 'Status LED (LED_SET)', sub: 'Front LED display active' },
                    { key: 'tvRemote', label: 'TV Remote Sync (TV_REMOTE_SET)', sub: 'Allow TV IR volume control' },
                    { key: 'btStandby', label: 'BT Standby (BT_STANDBY_SET)', sub: 'Wake soundbar via BT pair' },
                    { key: 'btRestrict', label: 'BT Lock (BT_LIMIT_SET)', sub: 'Restrict Bluetooth pairing' },
                  ].map((item) => {
                    const isOn = Boolean(soundbar[item.key as keyof SoundbarState]);
                    return (
                      <div
                        key={item.key}
                        id={`toggle-dsp-${item.key}`}
                        className={`toggle-card ${isOn ? 'active' : ''}`}
                        onClick={() => updateSetting({ [item.key]: !isOn })}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{item.label}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{item.sub}</div>
                        </div>
                        <div className="toggle-switch">
                          <div className="toggle-knob" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          )}

          {/* TAB 2: WI-FI BASED ALARMS */}
          {activeTab === 'alarms' && (
            <>
              <div className="stage-header">
                <div>
                  <h2 className="stage-title">LG SJ8 Wi-Fi Alarm Scheduler</h2>
                  <p className="stage-desc">
                    Verified against `192.168.0.10:9741` (`visible_alarm: true`): supports `ALARM_LIST_REQ`, `ALARM_STATE_REQ`, `ALARM_SET` (`mode: 0` Add/Modify, `mode: 2` Delete, `mode: 3` Enable, `mode: 4` Disable), and `SET_ALARM_PLAYLIST` (`:49252`).
                  </p>
                </div>
              </div>

              {/* Create / Update Wi-Fi Alarm Form */}
              <section className="studio-panel">
                <div className="panel-header">
                  <div className="panel-title">
                    <Plus size={16} />
                    <span>Schedule New LG SJ8 Wi-Fi Alarm</span>
                  </div>
                  <span className="panel-meta">
                    Protocol Bitmask: 0b{previewBitmask.toString(2).padStart(7, '0')} ({previewBitmask})
                  </span>
                </div>

                <form
                  onSubmit={handleCreateAlarm}
                  style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
                >
                  <div className="fader-grid">
                    <div className="fader-card">
                      <label className="fader-top">Alarm Title</label>
                      <input
                        id="alarm-title-input"
                        className="input-field"
                        value={alarmTitle}
                        onChange={(e) => setAlarmTitle(e.target.value)}
                        required
                      />
                    </div>

                    <div className="fader-card">
                      <label className="fader-top">Wake Time (24h HH:MM)</label>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          id="alarm-hour-input"
                          type="number"
                          className="input-field mono"
                          style={{ width: 80 }}
                          min={0}
                          max={23}
                          value={alarmHour}
                          onChange={(e) => setAlarmHour(Number(e.target.value))}
                        />
                        <span>:</span>
                        <input
                          id="alarm-minute-input"
                          type="number"
                          className="input-field mono"
                          style={{ width: 80 }}
                          min={0}
                          max={59}
                          value={alarmMinute}
                          onChange={(e) => setAlarmMinute(Number(e.target.value))}
                        />
                      </div>
                    </div>

                    <div className="fader-card">
                      <div className="fader-top">
                        <span>Target Wake Volume</span>
                        <span className="fader-value">
                          {alarmVolume} / {soundbar.maxVolume}
                        </span>
                      </div>
                      <input
                        id="alarm-volume-slider"
                        type="range"
                        className="range-slider"
                        min={1}
                        max={soundbar.maxVolume}
                        value={alarmVolume}
                        onChange={(e) => setAlarmVolume(Number(e.target.value))}
                      />
                    </div>

                    <div className="fader-card">
                      <div className="fader-top">
                        <span>Duration (Minutes)</span>
                        <span className="fader-value">{alarmDuration} min</span>
                      </div>
                      <select
                        id="alarm-duration-select"
                        className="select-field"
                        value={alarmDuration}
                        onChange={(e) => setAlarmDuration(Number(e.target.value))}
                      >
                        <option value={15}>15 Minutes</option>
                        <option value={30}>30 Minutes</option>
                        <option value={45}>45 Minutes</option>
                        <option value={60}>60 Minutes</option>
                      </select>
                    </div>
                  </div>

                  <div className="fader-grid">
                    <div className="fader-card">
                      <label className="fader-top">Active Days of Week (Bitmask)</label>
                      <div className="day-chips-row">
                        {DAY_NAMES.map((dayName, idx) => {
                          const selected = alarmDays.includes(idx);
                          return (
                            <button
                              type="button"
                              key={dayName}
                              id={`alarm-day-${dayName.toLowerCase()}`}
                              className={`day-chip ${selected ? 'selected' : ''}`}
                              onClick={() => {
                                if (selected) {
                                  setAlarmDays(alarmDays.filter((d) => d !== idx));
                                } else {
                                  setAlarmDays([...alarmDays, idx].sort());
                                }
                              }}
                            >
                              {dayName}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="fader-card">
                      <label className="fader-top">Alarm Sound Source</label>
                      <select
                        id="alarm-source-select"
                        className="select-field"
                        value={alarmSource}
                        onChange={(e) =>
                          setAlarmSource(
                            e.target.value as
                              | 'default_chime'
                              | 'spotify'
                              | 'local_stream'
                              | 'input_switch'
                          )
                        }
                      >
                        <option value="default_chime">
                          Built-In SJ8 Hardware Chime (type=0, songpath=&quot;&quot;)
                        </option>
                        <option value="spotify">Spotify Connect Playlist / Track</option>
                        <option value="local_stream">
                          Local PC DMS Playlist (SET_ALARM_PLAYLIST :49252)
                        </option>
                        <option value="input_switch">Switch Hardware Input (Optical/ARC)</option>
                      </select>
                    </div>

                    {alarmSource === 'spotify' && (
                      <div className="fader-card">
                        <label className="fader-top">Linked Spotify Playlist / URI</label>
                        <select
                          id="alarm-spotify-playlist-select"
                          className="select-field"
                          value={alarmSpotifyUri}
                          onChange={(e) => setAlarmSpotifyUri(e.target.value)}
                        >
                          {spotify?.playlists.map((pl) => (
                            <option key={pl.id} value={pl.uri}>
                              {pl.name} ({pl.uri})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {alarmSource === 'local_stream' && (
                      <div className="fader-card">
                        <label className="fader-top">Local DMS Audio Track (:49252)</label>
                        <select
                          id="alarm-local-track-select"
                          className="select-field"
                          value={alarmLocalTrackId}
                          onChange={(e) => setAlarmLocalTrackId(e.target.value)}
                        >
                          {tracks.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.title}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    <button id="btn-save-wifi-alarm" type="submit" className="btn btn-primary">
                      <Bell size={15} />
                      Save & Sync Alarm to LG SJ8 (ALARM_SET mode=0)
                    </button>
                  </div>
                </form>
              </section>

              {/* Configured Alarms List */}
              <section className="studio-panel">
                <div className="panel-header">
                  <div className="panel-title">
                    <span>Configured LG SJ8 Alarms ({soundbar.alarms.length})</span>
                  </div>
                </div>

                <div className="alarm-list">
                  {soundbar.alarms.map((alarm) => (
                    <div key={alarm.id} className="alarm-card">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                        <div className="alarm-time-display">
                          {String(alarm.hour).padStart(2, '0')}:
                          {String(alarm.minute).padStart(2, '0')}
                        </div>
                        <div>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: 15,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                            }}
                          >
                            <span>{alarm.title}</span>
                            <span
                              className="nav-badge"
                              style={{
                                color: alarm.enable ? 'var(--accent-spotify)' : 'var(--text-muted)',
                              }}
                            >
                              {alarm.enable ? 'ENABLED (mode=3)' : 'DISABLED (mode=4)'}
                            </span>
                          </div>
                          <div
                            style={{
                              fontSize: 12.5,
                              color: 'var(--text-secondary)',
                              marginTop: 3,
                            }}
                          >
                            Days: {alarm.daysList.map((d) => DAY_NAMES[d]).join(', ') || 'Once'}{' '}
                            (Mask {alarm.daysBitmask}) • Vol {alarm.volume} • Duration{' '}
                            {alarm.durationMinutes}m •{' '}
                            <span style={{ fontFamily: 'var(--font-mono)' }}>
                              {alarm.sourceType === 'default_chime'
                                ? 'Built-in SJ8 Chime'
                                : alarm.sourceType === 'spotify'
                                  ? alarm.spotifyUri
                                  : alarm.localTrackId}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                          id={`btn-test-alarm-${alarm.id}`}
                          className="btn"
                          onClick={() => handleTriggerAlarmNow(alarm.id)}
                          title="Test-fire this Wi-Fi alarm right now"
                        >
                          <Play size={14} />
                          Test Now
                        </button>
                        <button
                          id={`btn-toggle-alarm-${alarm.id}`}
                          className="btn"
                          onClick={() => handleToggleAlarm(alarm.id, !alarm.enable)}
                        >
                          {alarm.enable ? 'Disable (mode=4)' : 'Enable (mode=3)'}
                        </button>
                        <button
                          id={`btn-delete-alarm-${alarm.id}`}
                          className="btn btn-danger"
                          onClick={() => handleDeleteAlarm(alarm.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {/* TAB 3: SPOTIFY LINKING & CONNECT BRIDGE */}
          {activeTab === 'spotify' && spotify && (
            <>
              <div className="stage-header">
                <div>
                  <h2 className="stage-title">Spotify Linking & SJ8 Connect Bridge</h2>
                  <p className="stage-desc">
                    Switches your LG SJ8 to `FUNC_INFO` `type: 8` (`Spotify`, `cptype: 2`) and receives live 1-second `PLAY_TIME` progress notifications (`PLAY_TIME_SET: true`).
                  </p>
                </div>
                <div className="status-indicator" style={{ borderColor: 'var(--accent-spotify)' }}>
                  <span className="status-dot online" />
                  <span>SPOTIFY CONNECT LINKED</span>
                </div>
              </div>

              {/* Discovered Spotify Connect Endpoints */}
              <section className="studio-panel">
                <div className="panel-header">
                  <div className="panel-title">
                    <span>Available Spotify Connect Audio Endpoints</span>
                  </div>
                  <span className="panel-meta">Switches LG SJ8 to Function #8 (Spotify)</span>
                </div>

                <div className="fader-grid">
                  {spotify.devices.map((dev) => (
                    <div
                      key={dev.id}
                      className="fader-card"
                      style={{
                        borderColor: dev.is_active ? 'var(--accent-spotify)' : undefined,
                      }}
                    >
                      <div className="fader-top">
                        <span style={{ fontWeight: 600 }}>{dev.name}</span>
                        {dev.is_active && (
                          <span className="nav-badge" style={{ color: 'var(--accent-spotify)' }}>
                            ACTIVE OUTPUT
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        Type: {dev.type} • Output Level: {dev.volume_percent}%
                      </div>
                      <button
                        id={`btn-spotify-transfer-${dev.id}`}
                        className={`btn ${dev.is_active ? 'btn-spotify' : ''}`}
                        style={{ marginTop: 6 }}
                        onClick={() => handleSpotifyTransfer(dev.id)}
                      >
                        <CheckCircle2 size={14} />
                        {dev.is_active ? 'Active on LG SJ8' : 'Transfer Playback Here'}
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              {/* Curated & Linked Playlists */}
              <section className="studio-panel">
                <div className="panel-header">
                  <div className="panel-title">
                    <span>Spotify Playlists & Direct URI Launcher</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                  <input
                    id="input-custom-spotify-uri"
                    className="input-field mono"
                    style={{ flex: 1, minWidth: 260 }}
                    value={customSpotifyUri}
                    onChange={(e) => setCustomSpotifyUri(e.target.value)}
                    placeholder="spotify:playlist:... or spotify:track:..."
                  />
                  <button
                    id="btn-launch-spotify-uri"
                    className="btn btn-spotify"
                    onClick={() => handleSpotifyPlayUri(customSpotifyUri)}
                  >
                    <Play size={14} />
                    Cast URI to LG SJ8
                  </button>
                </div>

                <div className="fader-grid">
                  {spotify.playlists.map((pl) => (
                    <div key={pl.id} className="fader-card">
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{pl.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {pl.description}
                      </div>
                      <div
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11,
                          color: 'var(--text-muted)',
                        }}
                      >
                        {pl.uri} ({pl.trackCount} tracks)
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                        <button
                          id={`btn-play-playlist-${pl.id}`}
                          className="btn btn-spotify"
                          style={{ flex: 1 }}
                          onClick={() => handleSpotifyPlayUri(pl.uri, pl.name)}
                        >
                          <Play size={14} />
                          Play on SJ8
                        </button>
                        <button
                          id={`btn-use-playlist-alarm-${pl.id}`}
                          className="btn"
                          onClick={() => {
                            setAlarmSource('spotify');
                            setAlarmSpotifyUri(pl.uri);
                            setAlarmTitle(`Wakeup: ${pl.name}`);
                            setActiveTab('alarms');
                            showToast(`Linked "${pl.name}" to Wi-Fi Alarm form`);
                          }}
                        >
                          <Bell size={14} />
                          Use as Alarm
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* OAuth 2.0 PKCE & Web API Token Configuration */}
              <section className="studio-panel">
                <div className="panel-header">
                  <div className="panel-title">
                    <span>Spotify Web API OAuth 2.0 PKCE & Token Credentials (Optional)</span>
                  </div>
                </div>
                <div className="fader-grid">
                  <div className="fader-card">
                    <label className="fader-top">Spotify Developer Client ID</label>
                    <input
                      id="input-spotify-client-id"
                      className="input-field mono"
                      value={spotifyClientId}
                      onChange={(e) => setSpotifyClientId(e.target.value)}
                      placeholder="e.g. 4f8b9c1a2d3e4f5a6b7c8d9e0f1a2b3c"
                    />
                    <button
                      id="btn-spotify-pkce-auth"
                      className="btn"
                      style={{ marginTop: 6 }}
                      onClick={handleGenerateSpotifyPkce}
                    >
                      <ExternalLink size={14} />
                      Start OAuth 2.0 PKCE Login
                    </button>
                    <div className="panel-meta" style={{ marginTop: 6 }}>
                      Redirect URI: <code>{`${window.location.origin}/api/spotify/callback`}</code>
                    </div>
                  </div>

                  <div className="fader-card">
                    <label className="fader-top">Direct OAuth Bearer Access Token</label>
                    <input
                      id="input-spotify-access-token"
                      type="password"
                      className="input-field mono"
                      value={spotifyAccessToken}
                      onChange={(e) => setSpotifyAccessToken(e.target.value)}
                      placeholder="BQD..."
                    />
                    <button
                      id="btn-spotify-save-token"
                      className="btn btn-primary"
                      style={{ marginTop: 6 }}
                      onClick={handleSaveSpotifyToken}
                    >
                      Link Web API Token
                    </button>
                  </div>
                </div>
              </section>
            </>
          )}

          {/* TAB 4: LOCAL HI-RES MEDIA & DMS (:49252) */}
          {activeTab === 'media' && (
            <>
              <div className="stage-header">
                <div>
                  <h2 className="stage-title">MusicFlow DMS Media Server (Port 49252)</h2>
                  <p className="stage-desc">
                    Listens on both `:4741` and `:49252` (`MusicFlowDMS.exe` port forwarded by OpenWrt `MusicFlow-DMS`) to serve FLAC, WAV, AIFF, OGG, M4A, and MP3 streams to your LG SJ8 (`192.168.0.10`).
                  </p>
                </div>
              </div>

              <section className="studio-panel">
                <div className="panel-header">
                  <div className="panel-title">
                    <FolderSearch size={16} />
                    <span>Index Local PC Music Folder</span>
                  </div>
                  <span className="panel-meta">DMS Endpoint: http://192.168.1.176:49252/dmr.xml</span>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <input
                    id="input-scan-folder"
                    className="input-field mono"
                    style={{ flex: 1 }}
                    value={scanFolderInput}
                    onChange={(e) => setScanFolderInput(e.target.value)}
                    placeholder="/home/esketids/Music"
                  />
                  <button
                    id="btn-scan-folder"
                    className="btn btn-primary"
                    onClick={handleScanFolder}
                  >
                    Scan Audio Files (.flac, .wav, .mp3, .m4a, .ogg)
                  </button>
                </div>
              </section>

              {previewAudioUrl && (
                <section className="studio-panel" style={{ borderColor: 'var(--accent-amber)' }}>
                  <div className="panel-header">
                    <div className="panel-title">
                      <span>Live DMS HTTP Audio Stream Monitor: {previewTrackTitle}</span>
                    </div>
                    <span className="panel-meta">Endpoint: {previewAudioUrl}</span>
                  </div>
                  <audio
                    ref={audioRef}
                    controls
                    src={previewAudioUrl}
                    style={{ width: '100%', height: 38 }}
                  />
                </section>
              )}

              <section className="studio-panel">
                <div className="panel-header">
                  <div className="panel-title">
                    <span>DMS Audio Catalog ({tracks.length} Tracks)</span>
                  </div>
                </div>

                <div className="alarm-list">
                  {tracks.map((track) => (
                    <div key={track.id} className="alarm-card">
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14.5 }}>{track.title}</div>
                        <div
                          style={{
                            fontSize: 12.5,
                            color: 'var(--text-secondary)',
                            marginTop: 2,
                          }}
                        >
                          {track.artist} • {track.album} •{' '}
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              color: 'var(--accent-amber)',
                            }}
                          >
                            {track.format}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          id={`btn-stream-track-${track.id}`}
                          className="btn btn-primary"
                          onClick={() => handlePlayLocalTrack(track)}
                        >
                          <Play size={14} />
                          Stream to SJ8 (:49252) & Preview
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {/* TAB 5: SJ8 WI-FI SETUP & OPENWRT CROSS-SUBNET TOOLKIT */}
          {activeTab === 'sj8setup' && (
            <>
              <div className="stage-header">
                <div>
                  <h2 className="stage-title">LG SJ8 Wi-Fi Setup & OpenWrt Cross-Subnet Toolkit</h2>
                  <p className="stage-desc">
                    Built-in replacement for `sj8-wifi-setup.py` (`SHARE_HOME_INFO` + `SPK_ADD_SET` using the SJ8 V1 AES-256-CBC key `4efgvbn m546Uy7kolKrftgbn =-0u&~`) plus your verified CachyOS (`192.168.1.176`) &lt;-&gt; OpenWrt (`192.168.1.1`/`192.168.0.4`) &lt;-&gt; HB710 (`192.168.0.10`) routing configs.
                  </p>
                </div>
              </div>

              <div className="fader-grid">
                {/* Step 1: Wi-Fi AP Provisioning (`MusicFlow_Setup` 192.168.5.100:9741) */}
                <section className="studio-panel">
                  <div className="panel-header">
                    <div className="panel-title">
                      <Wifi size={16} />
                      <span>1. Push Home Wi-Fi to MusicFlow_Setup AP</span>
                    </div>
                    <span className="panel-meta">SHARE_HOME_INFO</span>
                  </div>
                  <form
                    onSubmit={handleProvisionSj8}
                    style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
                  >
                    <div>
                      <label className="fader-top">Setup AP IP (Port 9741)</label>
                      <input
                        id="input-setup-ap-ip"
                        className="input-field mono"
                        style={{ width: '100%', marginTop: 4 }}
                        value={setupApIp}
                        onChange={(e) => setSetupApIp(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="fader-top">Target Home Wi-Fi SSID (HB710)</label>
                      <input
                        id="input-setup-ssid"
                        className="input-field mono"
                        style={{ width: '100%', marginTop: 4 }}
                        value={setupSsid}
                        onChange={(e) => setSetupSsid(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="fader-top">Wi-Fi Password</label>
                      <input
                        id="input-setup-password"
                        type="password"
                        className="input-field mono"
                        style={{ width: '100%', marginTop: 4 }}
                        value={setupPassword}
                        onChange={(e) => setSetupPassword(e.target.value)}
                        placeholder="Enter password for SSID 'o'"
                      />
                    </div>
                    <button id="btn-run-sj8-provision" type="submit" className="btn btn-primary">
                      Push SHARE_HOME_INFO to SJ8
                    </button>
                  </form>
                </section>

                {/* Step 2: Speaker Registration (`SPK_ADD_SET` on 192.168.0.10:9741) */}
                <section className="studio-panel">
                  <div className="panel-header">
                    <div className="panel-title">
                      <ShieldCheck size={16} />
                      <span>2. Register & Name SJ8 on LAN (SPK_ADD_SET)</span>
                    </div>
                    <span className="panel-meta">Sets reg: true</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <label className="fader-top">SJ8 LAN IP Address</label>
                      <input
                        id="input-register-host"
                        className="input-field mono"
                        style={{ width: '100%', marginTop: 4 }}
                        value={registerHostIp}
                        onChange={(e) => setRegisterHostIp(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="fader-top">Assigned Speaker Name</label>
                      <input
                        id="input-register-name"
                        className="input-field"
                        style={{ width: '100%', marginTop: 4 }}
                        value={registerName}
                        onChange={(e) => setRegisterName(e.target.value)}
                      />
                    </div>
                    <button
                      id="btn-run-spk-add-set"
                      type="button"
                      className="btn btn-primary"
                      style={{ marginTop: 12 }}
                      onClick={handleRegisterSj8}
                    >
                      Send SPK_ADD_SET (&quot;{registerName}&quot;)
                    </button>
                  </div>
                </section>
              </div>

              {provisionOutput && (
                <section className="studio-panel">
                  <div className="panel-header">
                    <div className="panel-title">Provisioning Response Output</div>
                  </div>
                  <pre
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                      background: 'var(--bg-base)',
                      padding: 12,
                      borderRadius: 6,
                      overflowX: 'auto',
                    }}
                  >
                    {provisionOutput}
                  </pre>
                </section>
              )}

              {/* Verified Cross-Subnet OpenWrt + HB710 Architecture */}
              <section className="studio-panel">
                <div className="panel-header">
                  <div className="panel-title">
                    <span>Verified Cross-Subnet Architecture (CachyOS &lt;-&gt; OpenWrt &lt;-&gt; HB710 &lt;-&gt; LG SJ8)</span>
                  </div>
                  <span className="panel-meta">Bundled in ./configs/openwrt/ & ./scripts/sj8-wifi-setup.py</span>
                </div>

                <div className="fader-grid">
                  <div className="fader-card">
                    <div style={{ fontWeight: 600, color: 'var(--accent-amber)' }}>
                      OpenWrt `/etc/smcroute.conf` + TTL Mangle
                    </div>
                    <pre
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        background: 'var(--bg-base)',
                        padding: 8,
                        borderRadius: 4,
                        overflowX: 'auto',
                      }}
                    >{`phyint br-lan enable ttl-threshold 1
phyint wan enable ttl-threshold 1
mgroup from br-lan group 239.255.255.250
mgroup from wan group 239.255.255.250
mroute from br-lan group 239.255.255.250 to wan
mroute from wan group 239.255.255.250 to br-lan`}</pre>
                  </div>

                  <div className="fader-card">
                    <div style={{ fontWeight: 600, color: 'var(--accent-amber)' }}>
                      OpenWrt `/etc/nftables.d/20-ssdp-reply.nft`
                    </div>
                    <pre
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        background: 'var(--bg-base)',
                        padding: 8,
                        borderRadius: 4,
                        overflowX: 'auto',
                      }}
                    >{`chain dstnat_wan {
  ip saddr 192.168.0.0/24 ip daddr 192.168.0.4 \\
  udp sport { 1900, 2870 } udp dport 1024-65535 \\
  dnat ip to 192.168.1.176
}`}</pre>
                  </div>

                  <div className="fader-card">
                    <div style={{ fontWeight: 600, color: 'var(--accent-amber)' }}>
                      TP-Link HB710 Static Route (For DMS :49252 & Playlist Alarms)
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      Required when the SJ8 (`192.168.0.10`) pulls audio streams or `SET_ALARM_PLAYLIST` tracks from `cachyos-esketids` (`192.168.1.176:49252`):
                    </div>
                    <code
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11.5,
                        background: 'var(--bg-base)',
                        padding: 6,
                        borderRadius: 4,
                      }}
                    >
                      Dest: 192.168.1.0 | Mask: 255.255.255.0 | GW: 192.168.0.4
                    </code>
                  </div>
                </div>
              </section>
            </>
          )}

          {/* TAB 6: MULTI-ROOM MESH & HOME CINEMA */}
          {activeTab === 'mesh' && (
            <>
              <div className="stage-header">
                <div>
                  <h2 className="stage-title">Multi-Room Mesh & Home Cinema Topology</h2>
                  <p className="stage-desc">
                    Synchronize LG Music Flow speakers with your LG SJ8 Soundbar (`GROUP_SET`, `GROUP_DESTROY`, `SPK_CH_SET`).
                  </p>
                </div>
              </div>

              <section className="studio-panel">
                <div className="panel-header">
                  <div className="panel-title">
                    <span>Discovered Music Flow Nodes ({soundbar.meshNodes.length})</span>
                  </div>
                </div>

                <div className="fader-grid">
                  {soundbar.meshNodes.map((node) => (
                    <div key={node.id} className="fader-card">
                      <div className="fader-top">
                        <span style={{ fontWeight: 600 }}>{node.name}</span>
                        <span className="nav-badge">{node.ip}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        Model: {node.model} • Signal: {node.meshRssi} dBm
                      </div>

                      <div style={{ marginTop: 6 }}>
                        <label
                          style={{
                            fontSize: 11.5,
                            color: 'var(--text-muted)',
                            display: 'block',
                            marginBottom: 4,
                          }}
                        >
                          Channel Assignment (SPK_CH_SET)
                        </label>
                        <select
                          id={`mesh-channel-${node.id}`}
                          className="select-field"
                          style={{ width: '100%' }}
                          value={node.channelAssignment}
                          onChange={async (e) => {
                            const res = await fetch(`/api/mesh/${node.id}`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ channelAssignment: e.target.value }),
                            });
                            const data = await res.json();
                            if (data.ok) {
                              setSoundbar({ ...soundbar, meshNodes: data.meshNodes });
                              showToast(`Updated ${node.name} channel to ${e.target.value}`);
                            }
                          }}
                        >
                          <option value="stereo">Stereo Master / Full Range</option>
                          <option value="left">Left Stereo Pair (L)</option>
                          <option value="right">Right Stereo Pair (R)</option>
                          <option value="rear_left">Home Cinema Surround Rear Left (RL)</option>
                          <option value="rear_right">Home Cinema Surround Rear Right (RR)</option>
                          <option value="subwoofer">Dedicated LFE Subwoofer</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {/* TAB 7: PROTOCOL INSPECTOR & CROSS-PLATFORM BUILDS */}
          {activeTab === 'inspector' && (
            <>
              <div className="stage-header">
                <div>
                  <h2 className="stage-title">TCP 9741 Protocol Inspector & Build Center</h2>
                  <p className="stage-desc">
                    Supports both LG SJ8 V1 AES-256-CBC (`4efgvbn m546Uy7kolKrftgbn =-0u&~` / IV `54eRty@hkL,;/y9U`), `0x00` Plaintext (`암호화 : False`), and Temescal V2 AES-256-CBC.
                  </p>
                </div>
              </div>

              {/* Cross-Platform Packaging Instructions */}
              <section className="studio-panel">
                <div className="panel-header">
                  <div className="panel-title">
                    <PackageCheck size={16} />
                    <span>1-Click Self-Contained Desktop Installers (Linux, Windows, macOS .app)</span>
                  </div>
                  <span className="panel-meta">Zero External Dependencies (ws, express &amp; cors Bundled Inside)</span>
                </div>

                <div className="fader-grid">
                  <div className="fader-card">
                    <div style={{ fontWeight: 600, color: 'var(--accent-amber)' }}>
                      macOS Universal (.app Bundle + 1-Click Installer)
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      Includes native <code>Open MusicFlow Studio.app</code>,{' '}
                      <code>Install-to-Applications.command</code>, and{' '}
                      <code>Start-Open-MusicFlow.command</code>.
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      <a
                        className="btn btn-primary"
                        style={{ textDecoration: 'none', flex: 1 }}
                        href="/releases/open-musicflow-v1.1.0-macos-universal.zip"
                        download
                      >
                        Download macOS (.zip)
                      </a>
                      <a
                        className="btn"
                        style={{ textDecoration: 'none' }}
                        href="/releases/open-musicflow-v1.1.0-macos-universal.tar.gz"
                        download
                      >
                        .tar.gz
                      </a>
                    </div>
                  </div>

                  <div className="fader-card">
                    <div style={{ fontWeight: 600, color: 'var(--accent-amber)' }}>
                      Linux x64 (CachyOS / Arch / Debian Desktop Installer)
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      Includes <code>install-linux-desktop.sh</code> (registers KDE/GNOME menu icon &amp;{' '}
                      <code>~/.local/bin/open-musicflow</code>) and{' '}
                      <code>start-open-musicflow.sh</code>.
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      <a
                        className="btn btn-primary"
                        style={{ textDecoration: 'none', flex: 1 }}
                        href="/releases/open-musicflow-v1.1.0-linux-x64.tar.gz"
                        download
                      >
                        Download Linux (.tar.gz)
                      </a>
                      <a
                        className="btn"
                        style={{ textDecoration: 'none' }}
                        href="/releases/open-musicflow-v1.1.0-linux-x64.zip"
                        download
                      >
                        .zip
                      </a>
                    </div>
                  </div>

                  <div className="fader-card">
                    <div style={{ fontWeight: 600, color: 'var(--accent-amber)' }}>
                      Windows x64 (Desktop &amp; Start Menu Shortcut Installer)
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      Includes <code>Install-Windows-App.bat</code> (creates Desktop &amp; Start Menu
                      shortcuts) and <code>Start-Open-MusicFlow.bat</code>.
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      <a
                        className="btn btn-primary"
                        style={{ textDecoration: 'none', flex: 1 }}
                        href="/releases/open-musicflow-v1.1.0-windows-x64.zip"
                        download
                      >
                        Download Windows (.zip)
                      </a>
                      <a
                        className="btn"
                        style={{ textDecoration: 'none' }}
                        href="/releases/open-musicflow-v1.1.0-windows-x64.tar.gz"
                        download
                      >
                        .tar.gz
                      </a>
                    </div>
                  </div>
                </div>
              </section>

              {/* Raw Command Sender */}
              <section className="studio-panel">
                <div className="panel-header">
                  <div className="panel-title">
                    <span>Custom TCP 9741 JSON Packet Dispatcher</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {[
                      {
                        label: 'PRODUCT_INFO (SJ8)',
                        payload: {
                          data: { day: 1, hour: 6, id: 'win7085C23CCA2A', min: 43, option: 0 },
                          msg: 'PRODUCT_INFO',
                        },
                      },
                      { label: 'SETTING_INFO_REQ', payload: { msg: 'SETTING_INFO_REQ' } },
                      { label: 'SYSTEM_VER_REQ', payload: { msg: 'SYSTEM_VER_REQ' } },
                      { label: 'ALARM_LIST_REQ', payload: { msg: 'ALARM_LIST_REQ' } },
                      {
                        label: 'FUNC_NAME_REQ (#15)',
                        payload: { data: { func: 15 }, msg: 'FUNC_NAME_REQ' },
                      },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        className="btn"
                        style={{ padding: '3px 8px', fontSize: 11.5 }}
                        onClick={() => setRawJsonInput(JSON.stringify(preset.payload, null, 2))}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div
                  style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}
                >
                  <textarea
                    id="textarea-raw-packet"
                    className="input-field mono"
                    style={{ flex: 1, minHeight: 88, resize: 'vertical' }}
                    value={rawJsonInput}
                    onChange={(e) => setRawJsonInput(e.target.value)}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button
                      id="btn-send-raw-packet"
                      className="btn btn-primary"
                      onClick={handleSendRawPacket}
                    >
                      Encode & Send Packet
                    </button>
                    <button
                      id="btn-clear-packet-logs"
                      className="btn"
                      onClick={async () => {
                        await fetch('/api/logs/clear', { method: 'POST' });
                        setPacketLogs([]);
                      }}
                    >
                      Clear Log ({packetLogs.length})
                    </button>
                  </div>
                </div>
              </section>

              {/* Live Encrypted/Decrypted Packet Stream */}
              <section className="studio-panel">
                <div className="panel-header">
                  <div className="panel-title">
                    <span>Live Wire Frame Capture (SJ8 V1 AES-256 / 0x00 Plain / Temescal V2)</span>
                  </div>
                  <span className="panel-meta">
                    SJ8 V1 Key: 4efgvbn m546Uy7kolKrftgbn =-0u&amp;~ | IV: 54eRty@hkL,;/y9U
                  </span>
                </div>

                <div className="packet-table-wrap">
                  {packetLogs.map((pkt) => (
                    <div key={pkt.id} className="packet-row">
                      <span style={{ color: 'var(--text-muted)' }}>
                        {pkt.timestamp.slice(11, 19)}
                      </span>
                      <span className={`packet-dir-badge ${pkt.direction}`}>
                        {pkt.direction.toUpperCase()}
                      </span>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {pkt.cipherProfile} ({pkt.rawByteLength}B)
                      </span>
                      <span style={{ color: 'var(--accent-amber)', fontWeight: 600 }}>
                        {pkt.msgType}
                      </span>
                      <span style={{ color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                        {JSON.stringify(pkt.payload)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </main>

        {/* Right Master Output & Now Playing Rack */}
        <aside className="right-rack-panel">
          <div className="master-volume-box">
            <div className="panel-header" style={{ marginBottom: 4 }}>
              <span className="panel-title">Master Output Gain</span>
              <span className="panel-meta">VOLUME_SETTING</span>
            </div>

            <div className="volume-readout-row">
              <div>
                <span className="volume-big-number" id="master-volume-readout">
                  {soundbar.muted ? 'MUTE' : soundbar.volume}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 13,
                    color: 'var(--text-muted)',
                    marginLeft: 6,
                  }}
                >
                  / {soundbar.maxVolume}
                </span>
              </div>
              <button
                id="btn-master-mute"
                className={`btn ${soundbar.muted ? 'btn-danger' : ''}`}
                onClick={toggleMute}
              >
                {soundbar.muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                {soundbar.muted ? 'Unmute' : 'Mute'}
              </button>
            </div>

            <input
              id="slider-master-volume"
              type="range"
              className="range-slider"
              min={0}
              max={soundbar.maxVolume}
              value={soundbar.volume}
              onChange={(e) => setVolume(Number(e.target.value))}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
              {[10, 17, 24, 32].map((presetVol) => (
                <button
                  key={presetVol}
                  className="btn"
                  style={{
                    flex: 1,
                    padding: '5px 0',
                    fontSize: 12,
                    fontFamily: 'var(--font-mono)',
                  }}
                  onClick={() => setVolume(presetVol)}
                >
                  Vol {presetVol}
                </button>
              ))}
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 12,
                color: 'var(--text-secondary)',
                marginTop: 4,
              }}
            >
              <span>Volume Fade Time:</span>
              <select
                id="select-volume-fade"
                className="select-field"
                style={{ padding: '3px 8px', fontSize: 12 }}
                value={fadeSeconds}
                onChange={(e) => setFadeSeconds(Number(e.target.value))}
              >
                <option value={0}>0s (Instant)</option>
                <option value={3}>3s Smooth</option>
                <option value={10}>10s Cinema Fade</option>
              </select>
            </div>
          </div>

          {/* Active Input & Now Playing Card (Matched to SJ8 PLAY_INFO Bandit / EsDeeKid) */}
          <div className="now-playing-box">
            <div className="np-badge">
              <Disc size={13} />
              <span>{soundbar.playInfo.sourceApp.toUpperCase()}</span>
            </div>
            <div className="np-title">{soundbar.playInfo.title}</div>
            <div className="np-artist">
              {soundbar.playInfo.artist} — {soundbar.playInfo.album}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11.5,
                color: 'var(--text-secondary)',
              }}
            >
              PLAY_TIME: {soundbar.playInfo.positionSec}s / {soundbar.playInfo.durationSec}s
              {soundbar.playInfo.shuffle ? ' • Shuffle ON' : ''}
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: 'var(--font-mono)',
                fontSize: 11.5,
                color: 'var(--text-muted)',
                paddingTop: 6,
                borderTop: '1px solid var(--border-subtle)',
              }}
            >
              <span>
                Input: {soundbar.customFunctionNames?.[activeInputDef.id] || activeInputDef.label}
              </span>
              <span>EQ: {activeEqPreset.label}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <button
                id="btn-rack-prev"
                className="btn"
                title="Previous Track (PLAY_CMD playctrl=3)"
                onClick={async () => {
                  const res = await fetch('/api/spotify/control', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'previous' }),
                  });
                  const data = await res.json();
                  if (data.ok) {
                    if (data.spotify) setSpotify(data.spotify);
                    if (data.soundbar) setSoundbar(data.soundbar);
                  }
                }}
              >
                <SkipBack size={14} />
              </button>
              <button
                id="btn-rack-play-pause"
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={async () => {
                  const res = await fetch('/api/spotify/toggle', { method: 'POST' });
                  const data = await res.json();
                  if (data.ok) {
                    if (data.spotify) setSpotify(data.spotify);
                    if (data.soundbar) setSoundbar(data.soundbar);
                  }
                }}
              >
                {(soundbar.connected ? soundbar.playInfo.playing : spotify?.isPlaying) ? (
                  <Pause size={14} />
                ) : (
                  <Play size={14} />
                )}
                {(soundbar.connected ? soundbar.playInfo.playing : spotify?.isPlaying)
                  ? 'Pause Stream'
                  : 'Resume Stream'}
              </button>
              <button
                id="btn-rack-next"
                className="btn"
                title="Next Track (PLAY_CMD playctrl=5)"
                onClick={async () => {
                  const res = await fetch('/api/spotify/control', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'next' }),
                  });
                  const data = await res.json();
                  if (data.ok) {
                    if (data.spotify) setSpotify(data.spotify);
                    if (data.soundbar) setSoundbar(data.soundbar);
                  }
                }}
              >
                <SkipForward size={14} />
              </button>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <button
                id="btn-rack-pause-explicit"
                className="btn"
                style={{ flex: 1, fontSize: 11.5, padding: '4px 6px' }}
                title="Send explicit PAUSE (PLAY_CMD playctrl=1)"
                onClick={async () => {
                  const res = await fetch('/api/spotify/pause', { method: 'POST' });
                  const data = await res.json();
                  if (data.ok) {
                    if (data.spotify) setSpotify(data.spotify);
                    if (data.soundbar) setSoundbar(data.soundbar);
                  }
                }}
              >
                <Pause size={12} />
                Pause
              </button>
              <button
                id="btn-rack-stop"
                className="btn"
                style={{ flex: 1, fontSize: 11.5, padding: '4px 6px' }}
                title="Stop Playback (PLAY_CMD playctrl=2)"
                onClick={async () => {
                  const res = await fetch('/api/spotify/stop', { method: 'POST' });
                  const data = await res.json();
                  if (data.ok) {
                    if (data.spotify) setSpotify(data.spotify);
                    if (data.soundbar) setSoundbar(data.soundbar);
                  }
                }}
              >
                <Square size={12} />
                Stop
              </button>
              <button
                id="btn-rack-shuffle"
                className={`btn ${soundbar.playInfo.shuffle ? 'btn-spotify' : ''}`}
                style={{ fontSize: 11.5, padding: '4px 8px' }}
                title="Toggle Shuffle (PLAY_CMD playctrl=8)"
                onClick={async () => {
                  const res = await fetch('/api/spotify/control', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'shuffle' }),
                  });
                  const data = await res.json();
                  if (data.ok) {
                    if (data.spotify) setSpotify(data.spotify);
                    if (data.soundbar) setSoundbar(data.soundbar);
                  }
                }}
              >
                <Shuffle size={12} />
              </button>
              <button
                id="btn-rack-repeat"
                className={`btn ${soundbar.playInfo.repeat > 0 ? 'btn-spotify' : ''}`}
                style={{ fontSize: 11.5, padding: '4px 8px' }}
                title={`Cycle Repeat (PLAY_CMD playctrl=7, mode=${soundbar.playInfo.repeat})`}
                onClick={async () => {
                  const res = await fetch('/api/spotify/control', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'repeat' }),
                  });
                  const data = await res.json();
                  if (data.ok) {
                    if (data.spotify) setSpotify(data.spotify);
                    if (data.soundbar) setSoundbar(data.soundbar);
                  }
                }}
              >
                <Repeat size={12} />
              </button>
            </div>
          </div>

          {/* Quick Acoustic Status Box */}
          <div className="now-playing-box">
            <div className="nav-group-label" style={{ padding: 0, marginBottom: 4 }}>
              LG SJ8 Active Signal Chain
            </div>
            <div className="telemetry-row">
              <span className="telemetry-label">Subwoofer Trim</span>
              <span className="telemetry-val">
                {soundbar.wooferLevel > 0 ? `+${soundbar.wooferLevel}` : soundbar.wooferLevel} dB
                (Raw {soundbar.wooferRaw})
              </span>
            </div>
            <div className="telemetry-row">
              <span className="telemetry-label">Auto Power</span>
              <span className="telemetry-val">{soundbar.autoPower ? 'ON' : 'OFF'}</span>
            </div>
            <div className="telemetry-row">
              <span className="telemetry-label">Night Mode</span>
              <span className="telemetry-val">{soundbar.nightMode ? 'Active' : 'Bypassed'}</span>
            </div>
            <div className="telemetry-row">
              <span className="telemetry-label">DMS HTTP Port</span>
              <span className="telemetry-val">:49252 &amp; :4741</span>
            </div>
            <div className="telemetry-row">
              <span className="telemetry-label">Next Wi-Fi Alarm</span>
              <span className="telemetry-val" style={{ color: 'var(--accent-amber)' }}>
                {soundbar.alarms.find((a) => a.enable)
                  ? `${String(soundbar.alarms.find((a) => a.enable)!.hour).padStart(
                      2,
                      '0'
                    )}:${String(soundbar.alarms.find((a) => a.enable)!.minute).padStart(2, '0')}`
                  : 'None Armed'}
              </span>
            </div>
          </div>
        </aside>
      </div>

      {/* Studio Footer */}
      <footer className="studio-footer">
        <div>
          Open MusicFlow Studio v1.1.0 (MIT) • Tuned for LG SJ8 (`NB9.504.00629.C`, TCP 9741 SJ8 V1 AES-256 + Plaintext + DMS :49252)
        </div>
        <div style={{ fontFamily: 'var(--font-mono)' }}>
          Targets: Linux (CachyOS AppImage/deb/tar.gz) • Windows (NSIS/Portable exe) • macOS (DMG/zip)
        </div>
      </footer>
    </div>
  );
}
