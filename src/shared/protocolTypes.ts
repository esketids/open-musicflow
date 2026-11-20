export type ProtocolDialect = 'auto' | 'musicflow' | 'temescal';
export type EncryptionMode = 'sj8_v1' | 'temescal_v2' | 'plain';

export interface InputFunctionDef {
  id: number;
  code: string;
  label: string;
  category: 'wireless' | 'digital' | 'analog' | 'streaming';
  description: string;
}

export const LG_INPUT_FUNCTIONS: InputFunctionDef[] = [
  { id: 0, code: 'WIFI', label: 'Wi-Fi', category: 'wireless', description: 'DLNA / Music Flow Mesh / Cast Audio' },
  { id: 15, code: 'OPTICAL_HDMIARC', label: 'Optical / HDMI ARC', category: 'digital', description: 'Combined Optical & HDMI ARC Input (FUNC_NAME_REQ #15)' },
  { id: 1, code: 'BLUETOOTH', label: 'Bluetooth', category: 'wireless', description: 'A2DP Wireless Audio Receiver (08:EF:3B:9C:2D:4F)' },
  { id: 12, code: 'LG_TV', label: 'LG Sound Sync (Wireless)', category: 'wireless', description: 'LG TV Wireless Sound Sync' },
  { id: 6, code: 'HDMI', label: 'HDMI In', category: 'digital', description: 'HDMI Digital Audio/Video Input' },
  { id: 5, code: 'CP', label: 'Content Provider (CP)', category: 'streaming', description: 'Cloud Streaming Service (Spotify / TuneIn)' },
  { id: 8, code: 'SPOTIFY', label: 'Spotify Connect', category: 'streaming', description: 'Direct Spotify Connect Endpoint (cptype=2)' },
  { id: 2, code: 'PORTABLE', label: 'Portable In', category: 'analog', description: '3.5mm Stereo Mini-Jack Input' },
  { id: 3, code: 'AUX', label: 'AUX Input', category: 'analog', description: 'RCA / Auxiliary Analog Line-In' },
  { id: 4, code: 'OPTICAL', label: 'Optical In', category: 'digital', description: 'TOSLINK Digital Audio Input (S/PDIF)' },
  { id: 7, code: 'ARC', label: 'HDMI ARC', category: 'digital', description: 'TV Audio Return Channel' },
  { id: 9, code: 'OPTICAL_2', label: 'Optical In 2', category: 'digital', description: 'Secondary TOSLINK Digital Input' },
  { id: 10, code: 'HDMI_2', label: 'HDMI In 2', category: 'digital', description: 'HDMI Digital Audio/Video Input 2' },
  { id: 11, code: 'HDMI_3', label: 'HDMI In 3', category: 'digital', description: 'HDMI Digital Audio/Video Input 3' },
  { id: 13, code: 'MIC', label: 'Microphone', category: 'analog', description: 'Calibration / Vocal Microphone Input' },
  { id: 14, code: 'C4A', label: 'Google Cast (C4A)', category: 'streaming', description: 'Chromecast Built-In Audio Session (v1.36.145853)' },
  { id: 16, code: 'LG_OPTICAL', label: 'LG Sound Sync (Optical)', category: 'digital', description: 'LG TV Optical Sound Sync' },
  { id: 17, code: 'USB', label: 'USB / FM Radio', category: 'digital', description: 'Direct USB Mass Storage / Built-In FM Receiver (APK #17)' },
  { id: 18, code: 'USB_1', label: 'USB Storage 1', category: 'digital', description: 'Direct USB Mass Storage Playback' },
  { id: 19, code: 'USB_2', label: 'USB Storage 2', category: 'digital', description: 'Secondary USB Mass Storage Port' },
];

export interface EqualizerPresetDef {
  id: number;
  code: string;
  label: string;
  description: string;
  curve: [number, number, number, number, number]; // 60Hz, 250Hz, 1kHz, 4kHz, 12kHz visual indicator
  isSj8Native?: boolean;
}

export const LG_EQ_PRESETS: EqualizerPresetDef[] = [
  { id: 14, code: 'BASS_BLAST', label: 'Bass Blast', description: 'SJ8 Native (#14): Reinforced low-frequency sub & mid-bass drive', curve: [7, 5, 0, 2, 3], isSj8Native: true },
  { id: 0, code: 'STANDARD', label: 'Standard', description: 'SJ8 Native (#0): Balanced studio reference tuning', curve: [0, 0, 0, 0, 0], isSj8Native: true },
  { id: 7, code: 'CINEMA', label: 'Cinema', description: 'SJ8 Native (#7): Wide 3D surround soundstage for film soundtracks', curve: [5, 3, 2, 4, 5], isSj8Native: true },
  { id: 12, code: 'ASC', label: 'ASC (Adaptive Sound Control)', description: 'SJ8 Native (#12): Real-time vocal & action acoustic analysis', curve: [3, 1, 4, 3, 2], isSj8Native: true },
  { id: 1, code: 'BASS', label: 'Bass', description: 'Low-frequency sub & mid-bass punch', curve: [6, 4, 0, 1, 2] },
  { id: 2, code: 'FLAT', label: 'Flat Reference', description: 'Uncolored flat frequency response', curve: [0, 0, 0, 0, 0] },
  { id: 3, code: 'BOOST', label: 'Sound Boost', description: 'Expanded soundstage with dynamic loudness', curve: [4, 2, 1, 3, 4] },
  { id: 4, code: 'TREBLE_BASS', label: 'Treble & Bass', description: 'Classic V-shaped contour for clarity and warmth', curve: [5, 2, -1, 3, 5] },
  { id: 5, code: 'USER', label: 'User Custom EQ', description: 'Manual Bass, Treble, and L/R Balance tuning', curve: [2, 1, 0, 2, 3] },
  { id: 6, code: 'MUSIC', label: 'Music Studio', description: 'Optimized stereo imaging for hi-res music', curve: [2, 1, 1, 2, 3] },
  { id: 8, code: 'NIGHT', label: 'Night Whisper', description: 'Compressed dynamic peaks for late-night listening', curve: [-3, -1, 3, 2, 0] },
  { id: 9, code: 'NEWS', label: 'Clear Voice / News', description: 'Vocal midrange isolation for broadcast & podcasts', curve: [-2, 1, 5, 3, -1] },
  { id: 10, code: 'VOICE', label: 'Voice Enhance', description: 'Enhanced dialogue intelligibility', curve: [-1, 2, 6, 4, 0] },
  { id: 11, code: 'ISOUND', label: 'iSound Intelligent', description: 'Real-time content-adaptive acoustic shaping', curve: [2, 2, 2, 3, 2] },
  { id: 13, code: 'MOVIE', label: 'Movie Theater', description: 'Deep LFE extension and surround immersion', curve: [6, 3, 1, 3, 4] },
  { id: 15, code: 'DOLBY_ATMOS', label: 'Dolby Atmos', description: 'Object-based 3D spatial height rendering', curve: [5, 3, 3, 5, 6] },
  { id: 16, code: 'DTS_VIRTUAL_X', label: 'DTS Virtual:X', description: 'Psychoacoustic virtual height & surround processing', curve: [4, 3, 2, 5, 5] },
  { id: 17, code: 'BASS_BOOST_PLUS', label: 'Bass Boost Plus', description: 'Extended low-end warmth with crisp highs', curve: [6, 4, 1, 3, 4] },
  { id: 18, code: 'DTS_X', label: 'DTS:X Master', description: 'Multi-dimensional object audio decoding', curve: [5, 3, 3, 4, 6] },
];

export interface WifiAlarmEntry {
  id: number;
  title: string;
  hour: number;
  minute: number;
  daysBitmask: number; // Bit 6 = Mon (64), Bit 5 = Tue (32), Bit 4 = Wed (16), Bit 3 = Thu (8), Bit 2 = Fri (4), Bit 1 = Sat (2), Bit 0 = Sun (1)
  daysList: number[];  // 0=Mon .. 6=Sun
  dayRepeat: boolean;
  volume: number;
  durationMinutes: number;
  enable: boolean;
  shuffle: boolean;
  sourceType: 'default_chime' | 'spotify' | 'local_stream' | 'input_switch';
  spotifyUri?: string;
  localTrackId?: string;
  targetInput?: number;
  fadeInSeconds: number;
  syncedToHardware: boolean;
}

export interface LocalMediaTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  format: string;
  sampleRate: string;
  bitDepth: string;
  durationSec: number;
  moodCategory: 'relaxing' | 'energetic' | 'focus' | 'cinema' | 'night';
  streamPath: string;
  isBuiltInSynth?: boolean;
  filePath?: string;
}

export interface SpotifyLinkState {
  connected: boolean;
  clientId: string;
  displayName?: string;
  email?: string;
  product?: string;
  activeDeviceId?: string;
  activeDeviceName?: string;
  isPlaying: boolean;
  currentTrack?: {
    name: string;
    artist: string;
    album: string;
    albumArt?: string;
    durationMs: number;
    progressMs: number;
    uri: string;
  };
  devices: Array<{
    id: string;
    name: string;
    type: string;
    is_active: boolean;
    volume_percent: number;
    isSoundbarMatch?: boolean;
  }>;
  playlists: Array<{
    id: string;
    name: string;
    uri: string;
    trackCount: number;
    imageUrl?: string;
    description?: string;
  }>;
}

export interface MultiRoomSpeakerNode {
  id: string;
  name: string;
  ip: string;
  model: string;
  role: 'individual' | 'master' | 'slave' | 'surround_master' | 'surround_slave';
  channelAssignment: 'stereo' | 'left' | 'right' | 'rear_left' | 'rear_right' | 'subwoofer';
  groupId: number;
  volume: number;
  muted: boolean;
  online: boolean;
  meshRssi: number;
}

export interface SoundbarState {
  connected: boolean;
  connecting: boolean;
  host: string;
  port: number;
  dialect: ProtocolDialect;
  detectedDialect: 'musicflow' | 'temescal';
  encryption: EncryptionMode;
  isSimulator: boolean;
  lastUpdated: string;

  // Device Identity (Matched to LG SJ8 real hardware logs)
  name: string;
  modelName: string;
  petName: string;
  modelNum: number;
  region: string;
  protoVer: number;
  registered: boolean;
  firmwareVersion: string;
  micomVersion: string;
  hdmiVersion: string;
  c4aVersion: string;
  macAddress: string;
  bluetoothMac: string;
  ipv4Addr: string;
  ipv6Addr: string;
  ssid: string;
  meshChannel: number;
  networkType: 'Wired' | 'Wireless' | 'Meshed';

  // Primary Audio Controls
  volume: number;
  maxVolume: number;
  muted: boolean;
  currentFunction: number;
  customFunctionNames: Record<number, string>;
  availableFunctions: number[];
  currentEq: number;
  availableEqs: number[];

  // Tone & Channel Levels
  bass: number;           // -6 to +6
  treble: number;         // -6 to +6
  lrBalance: number;      // -20 to +20
  wooferLevel: number;    // dB value (-15 to +6 dB)
  wooferRaw: number;      // Wire value (0 to 21, where dB = raw + wooferOffset)
  wooferOffset: number;   // -15 on LG SJ8
  wooferMin: number;      // -15 dB
  wooferMax: number;      // +6 dB (raw 21 + offset -15)
  rearLevel: number;      // -6 to +6 dB
  rearEnabled: boolean;
  centerLevel: number;    // -6 to +6 dB
  topLevel: number;       // -6 to +6 dB
  avSyncMs: number;       // 0 to 300 ms

  // Acoustic & System Toggles (SETTING_INFO_REQ + SETTING_VIEW_INFO)
  nightMode: boolean;
  autoVolume: boolean;
  drc: boolean;
  neuralX: boolean;
  tvRemote: boolean;
  autoPower: boolean;
  autoDisplay: boolean;
  btStandby: boolean;
  btRestrict: boolean;
  ledIndicator: boolean;
  limitGroupGcast: boolean;
  enableBalance: boolean;
  visibleToneCtrl: boolean;
  visibleAlarm: boolean;
  visibleReserveSleep: boolean;
  visibleMlibSync: boolean;
  visibleTvConn: boolean;
  sleepTimerMinutes: number;

  // Playback / Streaming Info (PLAY_INFO + PLAY_TIME)
  playInfo: {
    playing: boolean;
    title: string;
    artist: string;
    album: string;
    albumArt: string;
    durationSec: number;
    positionSec: number;
    sourceApp: string;
    audioFormat: string;
    shuffle: boolean;
    repeat: number;
    cpType: number;
  };

  // Alarms
  alarms: WifiAlarmEntry[];
  alarmActiveNow: boolean;

  // Multi-room Mesh
  meshNodes: MultiRoomSpeakerNode[];
}

export interface PacketLogEntry {
  id: string;
  timestamp: string;
  direction: 'tx' | 'rx';
  encrypted: boolean;
  cipherProfile: EncryptionMode;
  headerHex: string;
  msgType: string;
  cmd?: string;
  payload: Record<string, unknown>;
  rawByteLength: number;
}
