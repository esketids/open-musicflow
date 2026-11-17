import net from 'node:net';
import dgram from 'node:dgram';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import {
  EncryptionMode,
  PacketLogEntry,
  ProtocolDialect,
  SoundbarState,
  WifiAlarmEntry,
} from '../../shared/protocolTypes';
import {
  LgPacketFramer,
  bitmaskToDaysList,
  daysListToBitmask,
  encodeLgPacket,
  LG_DEFAULT_TCP_PORT,
  LG_SSDP_MULTICAST_ADDR,
  LG_SSDP_PORT,
  LG_DMS_HTTP_PORT,
} from './lgWireCodec';

export class LgSoundbarClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private framer = new LgPacketFramer();
  private packetLogs: PacketLogEntry[] = [];
  private alarmTimer: NodeJS.Timeout | null = null;
  private lastTriggeredMinuteKey = '';

  public state: SoundbarState = {
    connected: false,
    connecting: false,
    host: '127.0.0.1',
    port: 19741,
    dialect: 'auto',
    detectedDialect: 'musicflow',
    encryption: 'sj8_v1',
    isSimulator: true,
    lastUpdated: new Date().toISOString(),

    name: 'LG SJ8',
    modelName: 'SJ8',
    petName: 'Sound Bar SJ8',
    modelNum: 14,
    region: 'SG',
    protoVer: 1,
    registered: true,
    firmwareVersion: 'NB9.504.00629.C',
    micomVersion: '1904080',
    hdmiVersion: '1807100',
    c4aVersion: '1.36.145853',
    macAddress: '7c:1c:4e:3b:b0:22',
    bluetoothMac: '08:EF:3B:9C:2D:4F',
    ipv4Addr: '192.168.0.10',
    ipv6Addr: '2406:3003:2006:c7f9:7e1c:4eff:fe3b:b022',
    ssid: 'o',
    meshChannel: 11,
    networkType: 'Wireless',

    volume: 17,
    maxVolume: 40,
    muted: false,
    currentFunction: 8,
    customFunctionNames: { 15: 'Optical/HDMI ARC' },
    availableFunctions: [0, 15, 1, 12, 6, 5, 8],
    currentEq: 14,
    availableEqs: [14, 0, 7, 12],

    bass: 0,
    treble: 0,
    lrBalance: 0,
    wooferLevel: 0,
    wooferRaw: 15,
    wooferOffset: -15,
    wooferMin: -15,
    wooferMax: 6,
    rearLevel: 0,
    rearEnabled: false,
    centerLevel: 0,
    topLevel: 0,
    avSyncMs: 0,

    nightMode: false,
    autoVolume: false,
    drc: false,
    neuralX: false,
    tvRemote: true,
    autoPower: true,
    autoDisplay: true,
    btStandby: false,
    btRestrict: false,
    ledIndicator: true,
    limitGroupGcast: false,
    enableBalance: false,
    visibleToneCtrl: true,
    visibleAlarm: true,
    visibleReserveSleep: true,
    visibleMlibSync: true,
    visibleTvConn: true,
    sleepTimerMinutes: 0,

    playInfo: {
      playing: true,
      title: 'Bandit',
      artist: 'EsDeeKid',
      album: 'Bandit',
      albumArt: 'http://o.scdn.co/320/ab67616d00001e02bf78fac0a3916813bbacfba8',
      durationSec: 110,
      positionSec: 10,
      sourceApp: 'Spotify Connect (SJ8)',
      audioFormat: 'Spotify Connect (cptype=2)',
      shuffle: true,
      repeat: 0,
      cpType: 2,
    },

    alarms: [],
    alarmActiveNow: false,

    meshNodes: [
      {
        id: 'node-sj8-main',
        name: 'LG SJ8 (Sound Bar SJ8)',
        ip: '192.168.0.10',
        model: 'SJ8 (NB9.504.00629.C)',
        role: 'surround_master',
        channelAssignment: 'stereo',
        groupId: 1,
        volume: 17,
        muted: false,
        online: true,
        meshRssi: -44,
      },
      {
        id: 'node-cachyos-dms',
        name: 'cachyos-esketids (DLNA DMS :49252)',
        ip: '192.168.1.176',
        model: 'Open MusicFlow DMS Server',
        role: 'individual',
        channelAssignment: 'stereo',
        groupId: 1,
        volume: 100,
        muted: false,
        online: true,
        meshRssi: -30,
      },
    ],
  };

  constructor() {
    super();
    this.startHostAlarmScheduler();
  }

  public getPacketLogs(): PacketLogEntry[] {
    return this.packetLogs;
  }

  public clearPacketLogs(): void {
    this.packetLogs = [];
    this.emit('logs', this.packetLogs);
  }

  public async connect(
    host: string,
    port = LG_DEFAULT_TCP_PORT,
    options?: {
      dialect?: ProtocolDialect;
      encryption?: EncryptionMode;
      isSimulator?: boolean;
    }
  ): Promise<SoundbarState> {
    this.disconnect();

    this.state.host = host;
    this.state.port = port;
    if (options?.dialect) this.state.dialect = options.dialect;
    if (options?.encryption) this.state.encryption = options.encryption;
    this.state.isSimulator =
      options?.isSimulator ?? (host === '127.0.0.1' && port !== LG_DEFAULT_TCP_PORT);
    this.state.connecting = true;
    this.emitState();

    return new Promise((resolve, reject) => {
      const sock = new net.Socket();
      let settled = false;

      const connectTimeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          sock.destroy();
          this.state.connecting = false;
          this.state.connected = false;
          this.emitState();
          reject(new Error(`Connection timeout reaching ${host}:${port}`));
        }
      }, 4500);

      sock.connect(port, host, () => {
        clearTimeout(connectTimeout);
        this.socket = sock;
        this.framer.reset();
        this.state.connecting = false;
        this.state.connected = true;
        this.state.lastUpdated = new Date().toISOString();
        this.emitState();

        // Execute full LG SJ8 / MusicFlow.exe + Temescal startup handshake
        this.refreshAllState();

        if (!settled) {
          settled = true;
          resolve(this.state);
        }
      });

      sock.on('data', (chunk: Buffer) => {
        const frames = this.framer.push(chunk);
        for (const f of frames) {
          if (f.parsed) {
            this.recordPacket(
              'rx',
              f.encrypted,
              f.cipherProfile,
              f.headerHex,
              f.parsed,
              f.rawByteLength
            );
            this.applyIncomingPacket(f.parsed);
          }
        }
      });

      sock.on('close', () => {
        if (this.socket === sock) {
          this.state.connected = false;
          this.state.connecting = false;
          this.socket = null;
          this.emitState();
        }
      });

      sock.on('error', (err) => {
        clearTimeout(connectTimeout);
        if (!settled) {
          settled = true;
          this.state.connecting = false;
          this.state.connected = false;
          this.emitState();
          reject(err);
        }
      });
    });
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = null;
    }
    this.state.connected = false;
    this.state.connecting = false;
    this.emitState();
  }

  public sendRawPacket(payload: Record<string, unknown>, overrideMode?: EncryptionMode): void {
    if (!this.socket || this.socket.destroyed) {
      return;
    }
    const mode = overrideMode || this.state.encryption;
    const { buffer, headerHex } = encodeLgPacket(payload, mode);
    this.socket.write(buffer);
    this.recordPacket('tx', mode !== 'plain', mode, headerHex, payload, buffer.length);
  }

  /**
   * Executes the exact startup handshake sequence captured from `MusicFlow.exe`
   * talking to the user's LG SJ8 (`192.168.0.10:9741`) in `logs/261117_064325.txt`,
   * plus V2 compatibility queries.
   */
  public refreshAllState(): void {
    const now = new Date();
    const jsDay = now.getDay();
    const lgDay = jsDay === 0 ? 6 : jsDay - 1;

    // 1. Exact LG SJ8 V1 handshake from `logs/261117_064325.txt`
    this.sendRawPacket({
      data: {
        day: lgDay,
        hour: now.getHours(),
        id: 'win7085C23CCA2A',
        min: now.getMinutes(),
        option: 0,
      },
      msg: 'PRODUCT_INFO',
    });
    this.sendRawPacket({ msg: 'SYSTEM_VER_REQ' });
    this.sendRawPacket({ msg: 'PLAY_INFO_REQ' });
    this.sendRawPacket({ data: { set: true }, msg: 'PLAY_TIME_SET' });
    this.sendRawPacket({ msg: 'FUNC_INFO_REQ' });
    this.sendRawPacket({ msg: 'ALARM_STATE_REQ' });
    this.sendRawPacket({ msg: 'SETTING_INFO_REQ' });
    this.sendRawPacket({ data: { func: 15 }, msg: 'FUNC_NAME_REQ' });
    this.sendRawPacket({ msg: 'EQ_INFO_REQ' });
    this.sendRawPacket({ msg: 'ALARM_LIST_REQ' });

    // 2. If in auto or temescal mode, also query V2 views
    if (this.state.dialect !== 'musicflow') {
      this.sendRawPacket({ cmd: 'get', msg: 'SPK_LIST_VIEW_INFO' });
      this.sendRawPacket({ cmd: 'get', msg: 'FUNC_VIEW_INFO' });
      this.sendRawPacket({ cmd: 'get', msg: 'EQ_VIEW_INFO' });
      this.sendRawPacket({ cmd: 'get', msg: 'SETTING_VIEW_INFO' });
    }
  }

  // === LG SJ8 Wi-Fi Setup & Onboarding (`sj8-wifi-setup.py` + `SPK_ADD_SET`) ===

  /**
   * Connects to an LG soundbar in `MusicFlow_Setup` AP mode (default `192.168.5.100:9741`)
   * using the SJ8 V1 AES-256-CBC key (`4efgvbn m546Uy7kolKrftgbn =-0u&~`), queries `PRODUCT_INFO`,
   * and pushes Wi-Fi credentials via `SHARE_HOME_INFO`.
   */
  public async provisionWifiSetupAp(params: {
    apHost?: string;
    apPort?: number;
    ssid: string;
    password: string;
  }): Promise<{
    productInfo: Record<string, unknown> | null;
    shareHomeResult: Record<string, unknown> | null;
  }> {
    const host = params.apHost || '192.168.5.100';
    const port = params.apPort || LG_DEFAULT_TCP_PORT;

    const productInfo = await this.sendOneShotCommand(
      host,
      port,
      {
        data: { day: 1, hour: 6, min: 20, option: 0 },
        msg: 'PRODUCT_INFO',
      },
      'sj8_v1'
    );

    const shareHomeResult = await this.sendOneShotCommand(
      host,
      port,
      {
        data: { pwd: params.password, ssid: params.ssid },
        msg: 'SHARE_HOME_INFO',
      },
      'sj8_v1'
    );

    return { productInfo, shareHomeResult };
  }

  /**
   * Sends `SPK_ADD_SET` to register and name the LG SJ8 after it joins the home Wi-Fi (`192.168.0.10`).
   */
  public async registerSpeakerOnLan(params: {
    host: string;
    port?: number;
    speakerName: string;
  }): Promise<Record<string, unknown> | null> {
    const host = params.host || this.state.host;
    const port = params.port || this.state.port || LG_DEFAULT_TCP_PORT;

    if (this.state.connected && this.state.host === host && this.state.port === port) {
      this.state.name = params.speakerName;
      this.state.registered = true;
      this.sendRawPacket({
        msg: 'SPK_ADD_SET',
        data: { name: params.speakerName },
      });
      this.emitState();
      return { msg: 'SPK_ADD_SET', result: 'OK', data: { name: params.speakerName, reg: true } };
    }

    return this.sendOneShotCommand(
      host,
      port,
      {
        msg: 'SPK_ADD_SET',
        data: { name: params.speakerName },
      },
      'sj8_v1'
    );
  }

  private sendOneShotCommand(
    host: string,
    port: number,
    payload: Record<string, unknown>,
    mode: EncryptionMode = 'sj8_v1'
  ): Promise<Record<string, unknown> | null> {
    return new Promise((resolve, reject) => {
      const sock = new net.Socket();
      const framer = new LgPacketFramer();
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          sock.destroy();
          reject(new Error(`Timeout talking to ${host}:${port}`));
        }
      }, 4500);

      sock.connect(port, host, () => {
        const { buffer, headerHex } = encodeLgPacket(payload, mode);
        this.recordPacket('tx', mode !== 'plain', mode, headerHex, payload, buffer.length);
        sock.write(buffer);
      });

      sock.on('data', (chunk: Buffer) => {
        const frames = framer.push(chunk);
        for (const f of frames) {
          if (f.parsed && !settled) {
            settled = true;
            clearTimeout(timer);
            this.recordPacket(
              'rx',
              f.encrypted,
              f.cipherProfile,
              f.headerHex,
              f.parsed,
              f.rawByteLength
            );
            sock.destroy();
            resolve(f.parsed);
            return;
          }
        }
      });

      sock.on('error', (err) => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          reject(err);
        }
      });
    });
  }

  // === High-Level Audio & Device Controls ===

  public setVolume(volume: number, fadeTime = 0): void {
    const clamped = Math.max(0, Math.min(this.state.maxVolume || 100, Math.round(volume)));
    this.state.volume = clamped;
    this.emitState();

    // Send V1 VOLUME_SETTING (native to LG SJ8 & MusicFlow) + V2 SPK_LIST_VIEW_INFO if needed
    this.sendRawPacket({ msg: 'VOLUME_SETTING', data: { vol: clamped, fadetime: fadeTime } });
    if (this.state.dialect === 'temescal') {
      this.sendRawPacket({ cmd: 'set', msg: 'SPK_LIST_VIEW_INFO', data: { i_vol: clamped } });
    }
  }

  public setMute(muted: boolean): void {
    this.state.muted = muted;
    this.emitState();

    this.sendRawPacket({ msg: 'MUTE_SET', data: { mute: muted } });
    if (this.state.dialect === 'temescal') {
      this.sendRawPacket({ cmd: 'set', msg: 'SPK_LIST_VIEW_INFO', data: { b_mute: muted } });
    }
  }

  public setFunction(funcId: number): void {
    this.state.currentFunction = funcId;
    this.emitState();

    this.sendRawPacket({ msg: 'FUNCTION_SET', data: { type: funcId } });
    if (this.state.dialect === 'temescal') {
      this.sendRawPacket({ cmd: 'set', msg: 'FUNC_VIEW_INFO', data: { i_curr_func: funcId } });
    }
  }

  /** Sends LG Music Flow PLAY_CMD (`playctrl`: 0=PLAY, 1=PAUSE, 2=STOP, 3=PREV, 5=NEXT). */
  public sendPlayCommand(playctrl: 0 | 1 | 2 | 3 | 5): void {
    if (playctrl === 0) this.state.playInfo.playing = true;
    else if (playctrl === 1 || playctrl === 2) this.state.playInfo.playing = false;

    const shuffle = Boolean(this.state.playInfo.shuffle);
    this.sendRawPacket({
      msg: 'PLAY_CMD',
      data: {
        playctrl,
        repeat: this.state.playInfo.repeat ?? 0,
        shuffle,
        suffle: shuffle,
      },
    });
    this.emitState();
  }

  public setEqualizer(eqId: number): void {
    this.state.currentEq = eqId;
    this.emitState();

    this.sendRawPacket({ msg: 'EQ_SETTING', data: { type: 0, value: eqId } });
    if (this.state.dialect === 'temescal') {
      this.sendRawPacket({ cmd: 'set', msg: 'EQ_VIEW_INFO', data: { i_curr_eq: eqId } });
    }
  }

  public setToneControl(params: {
    bass?: number;
    treble?: number;
    lrBalance?: number;
    save?: boolean;
  }): void {
    if (typeof params.bass === 'number') {
      this.state.bass = params.bass;
      this.sendRawPacket({ msg: 'EQ_SETTING', data: { type: 1, value: params.bass } });
    }
    if (typeof params.treble === 'number') {
      this.state.treble = params.treble;
      this.sendRawPacket({ msg: 'EQ_SETTING', data: { type: 2, value: params.treble } });
    }
    if (typeof params.lrBalance === 'number') {
      this.state.lrBalance = params.lrBalance;
      this.sendRawPacket({ msg: 'EQ_SETTING', data: { type: 3, value: params.lrBalance } });
    }
    if (params.save) {
      this.sendRawPacket({ msg: 'EQ_SETTING', data: { type: 4, value: 1 } });
    }
    this.emitState();
  }

  public updateSettings(
    partial: Partial<{
      nightMode: boolean;
      autoVolume: boolean;
      drc: boolean;
      neuralX: boolean;
      avSyncMs: number;
      wooferLevel: number;
      rearEnabled: boolean;
      rearLevel: number;
      centerLevel: number;
      topLevel: number;
      tvRemote: boolean;
      autoPower: boolean;
      autoDisplay: boolean;
      btStandby: boolean;
      btRestrict: boolean;
      ledIndicator: boolean;
      sleepTimerMinutes: number;
      name: string;
    }>
  ): void {
    const v2Data: Record<string, unknown> = {};

    if (typeof partial.nightMode === 'boolean') {
      this.state.nightMode = partial.nightMode;
      v2Data.b_night_mode = partial.nightMode;
      this.sendRawPacket({ msg: 'NIGHT_MODE_SET', data: { nightmode: partial.nightMode } });
    }
    if (typeof partial.autoVolume === 'boolean') {
      this.state.autoVolume = partial.autoVolume;
      v2Data.b_auto_vol = partial.autoVolume;
      this.sendRawPacket({ msg: 'AUTO_VOL_SET', data: { autovol: partial.autoVolume } });
    }
    if (typeof partial.drc === 'boolean') {
      this.state.drc = partial.drc;
      v2Data.b_drc = partial.drc;
      this.sendRawPacket({ msg: 'DRC_SET', data: { drc: partial.drc } });
    }
    if (typeof partial.neuralX === 'boolean') {
      this.state.neuralX = partial.neuralX;
      v2Data.b_neuralx = partial.neuralX;
    }
    if (typeof partial.avSyncMs === 'number') {
      this.state.avSyncMs = partial.avSyncMs;
      v2Data.i_av_sync = partial.avSyncMs;
      this.sendRawPacket({ msg: 'AV_SYNC_SET', data: { avsync: partial.avSyncMs } });
    }
    if (typeof partial.wooferLevel === 'number') {
      // partial.wooferLevel is in dB (-15 .. +6).
      // Convert to raw wire value using wooferOffset (-15 on LG SJ8 -> raw 0..21)
      this.state.wooferLevel = partial.wooferLevel;
      this.state.wooferRaw = partial.wooferLevel - this.state.wooferOffset;
      v2Data.i_woofer_level = partial.wooferLevel;
      this.sendRawPacket({
        msg: 'WOOFER_LEVEL_SET',
        data: { wooferlevel: this.state.wooferRaw },
      });
    }
    if (typeof partial.rearEnabled === 'boolean') {
      this.state.rearEnabled = partial.rearEnabled;
      v2Data.b_rear = partial.rearEnabled;
    }
    if (typeof partial.rearLevel === 'number') {
      this.state.rearLevel = partial.rearLevel;
      v2Data.i_rear_level = partial.rearLevel;
      this.sendRawPacket({ msg: 'REARBOX_LEVEL_SET', data: { rearboxlevel: partial.rearLevel } });
    }
    if (typeof partial.centerLevel === 'number') {
      this.state.centerLevel = partial.centerLevel;
      v2Data.i_center_level = partial.centerLevel;
    }
    if (typeof partial.topLevel === 'number') {
      this.state.topLevel = partial.topLevel;
      v2Data.i_top_level = partial.topLevel;
    }
    if (typeof partial.tvRemote === 'boolean') {
      this.state.tvRemote = partial.tvRemote;
      v2Data.b_tv_remote = partial.tvRemote;
      this.sendRawPacket({ msg: 'TV_REMOTE_SET', data: { tvremote: partial.tvRemote } });
    }
    if (typeof partial.autoPower === 'boolean') {
      this.state.autoPower = partial.autoPower;
      v2Data.b_auto_power = partial.autoPower;
      this.sendRawPacket({ msg: 'AUTO_POWER_SET', data: { autopower: partial.autoPower } });
    }
    if (typeof partial.autoDisplay === 'boolean') {
      this.state.autoDisplay = partial.autoDisplay;
      v2Data.b_auto_display = partial.autoDisplay;
      this.sendRawPacket({ msg: 'AUTO_DISPLAY_SET', data: { autodisplay: partial.autoDisplay } });
    }
    if (typeof partial.btStandby === 'boolean') {
      this.state.btStandby = partial.btStandby;
      v2Data.b_bt_standby = partial.btStandby;
      this.sendRawPacket({ msg: 'BT_STANDBY_SET', data: { btstandby: partial.btStandby } });
    }
    if (typeof partial.btRestrict === 'boolean') {
      this.state.btRestrict = partial.btRestrict;
      v2Data.b_conn_bt_limit = partial.btRestrict;
      this.sendRawPacket({ msg: 'BT_LIMIT_SET', data: { limit_bt_conn: partial.btRestrict } });
    }
    if (typeof partial.ledIndicator === 'boolean') {
      this.state.ledIndicator = partial.ledIndicator;
      this.sendRawPacket({ msg: 'LED_SET', data: { ledset: partial.ledIndicator } });
    }
    if (typeof partial.sleepTimerMinutes === 'number') {
      this.state.sleepTimerMinutes = partial.sleepTimerMinutes;
      v2Data.i_sleep_time = partial.sleepTimerMinutes;
      this.sendRawPacket({ msg: 'SLEEP_SET', data: { time: partial.sleepTimerMinutes } });
    }
    if (typeof partial.name === 'string') {
      this.state.name = partial.name;
      v2Data.s_user_name = partial.name;
      this.sendRawPacket({
        msg: 'SPK_INFO_MODIFY',
        data: { icon: 0, name: partial.name },
      });
    }

    if (this.state.dialect === 'temescal' && Object.keys(v2Data).length > 0) {
      this.sendRawPacket({ cmd: 'set', msg: 'SETTING_VIEW_INFO', data: v2Data });
    }
    this.emitState();
  }

  public triggerTestTone(): void {
    this.sendRawPacket({ msg: 'TEST_TONE', data: { stat: true } });
    if (this.state.dialect !== 'musicflow') {
      this.sendRawPacket({ cmd: 'set', msg: 'TEST_TONE_REQ' });
    }
  }

  // === Wi-Fi Based Alarm Controls (Hardware ALARM_SET + Host Scheduler) ===

  public upsertWifiAlarm(alarmInput: Partial<WifiAlarmEntry>): WifiAlarmEntry {
    const daysList = alarmInput.daysList ?? [0, 1, 2, 3, 4];
    const bitmask = daysListToBitmask(daysList);
    const existingId = typeof alarmInput.id === 'number' && alarmInput.id >= 0 ? alarmInput.id : -1;
    const assignedId =
      existingId >= 0
        ? existingId
        : this.state.alarms.reduce((max, a) => Math.max(max, a.id), -1) + 1;

    const entry: WifiAlarmEntry = {
      id: assignedId,
      title: alarmInput.title || 'SJ8 Morning Music Flow Wakeup',
      hour: Math.max(0, Math.min(23, Number(alarmInput.hour ?? 7))),
      minute: Math.max(0, Math.min(59, Number(alarmInput.minute ?? 30))),
      daysBitmask: bitmask,
      daysList,
      dayRepeat: alarmInput.dayRepeat ?? true,
      volume: Math.max(1, Math.min(this.state.maxVolume, Number(alarmInput.volume ?? 15))),
      durationMinutes: Math.max(5, Math.min(180, Number(alarmInput.durationMinutes ?? 45))),
      enable: alarmInput.enable ?? true,
      shuffle: alarmInput.shuffle ?? false,
      sourceType: alarmInput.sourceType ?? 'spotify',
      spotifyUri: alarmInput.spotifyUri || 'spotify:playlist:37i9dQZF1DXbITWG1ZJKYt',
      localTrackId: alarmInput.localTrackId || 'track-sunrise-flac',
      targetInput: alarmInput.targetInput ?? 8,
      fadeInSeconds: Number(alarmInput.fadeInSeconds ?? 15),
      syncedToHardware: this.state.connected,
    };

    const idx = this.state.alarms.findIndex((a) => a.id === assignedId);
    if (idx >= 0) {
      this.state.alarms[idx] = entry;
    } else {
      this.state.alarms.push(entry);
    }

    const lanIp = this.getLocalLanIp();
    const computedSongPath =
      entry.sourceType === 'default_chime'
        ? ''
        : entry.sourceType === 'spotify'
          ? entry.spotifyUri || ''
          : `http://${lanIp}:${LG_DMS_HTTP_PORT}/stream/${entry.localTrackId}.wav`;

    this.sendRawPacket({
      msg: 'ALARM_SET',
      data: {
        id: existingId,
        modifiedid: assignedId,
        mode: 0,
        day: bitmask,
        dayrepeat: entry.dayRepeat,
        hour: entry.hour,
        minute: entry.minute,
        type: entry.sourceType === 'default_chime' ? 0 : 1,
        duration: entry.durationMinutes,
        volume: entry.volume,
        enable: entry.enable,
        shuffle: entry.shuffle,
        title: entry.title,
        ipaddress: entry.sourceType === 'default_chime' ? '' : lanIp,
        songpath: computedSongPath,
      },
    });

    if (entry.sourceType === 'local_stream') {
      this.sendRawPacket({
        msg: 'SET_ALARM_PLAYLIST',
        data: {
          id: assignedId,
          ipaddress: lanIp,
          songpath: computedSongPath,
          title: entry.title,
        },
      });
    }

    this.emitState();
    return entry;
  }

  public toggleWifiAlarm(id: number, enable: boolean): void {
    const alarm = this.state.alarms.find((a) => a.id === id);
    if (!alarm) return;
    alarm.enable = enable;

    this.sendRawPacket({
      msg: 'ALARM_SET',
      data: {
        id,
        mode: enable ? 3 : 4,
        enable,
      },
    });
    this.emitState();
  }

  public deleteWifiAlarm(id: number): void {
    this.state.alarms = this.state.alarms.filter((a) => a.id !== id);
    this.sendRawPacket({
      msg: 'ALARM_SET',
      data: {
        id,
        mode: 2,
      },
    });
    this.emitState();
  }

  public triggerAlarmNow(id: number): void {
    const alarm = this.state.alarms.find((a) => a.id === id);
    if (!alarm) return;
    this.executeAlarmSequence(alarm);
  }

  private executeAlarmSequence(alarm: WifiAlarmEntry): void {
    this.state.alarmActiveNow = true;
    this.setMute(false);

    if (alarm.sourceType === 'spotify') {
      this.setFunction(8);
      this.state.playInfo = {
        ...this.state.playInfo,
        playing: true,
        title: `${alarm.title}`,
        artist: 'Wi-Fi Alarm • Spotify Connect',
        album: alarm.spotifyUri || 'Spotify Alarm Playlist',
        sourceApp: 'Wi-Fi Alarm + Spotify Connect',
      };
    } else if (alarm.sourceType === 'local_stream') {
      this.setFunction(0);
      this.sendLocalPlayUrl({
        id: alarm.localTrackId || 'track-sunrise-flac',
        title: alarm.title,
        artist: 'Wi-Fi Alarm Stream',
        album: 'Open MusicFlow DMS (:49252)',
        durationSec: 180,
        streamUrl: `http://${this.getLocalLanIp()}:${LG_DMS_HTTP_PORT}/stream/${alarm.localTrackId || 'track-sunrise-flac'}.wav`,
      });
    } else if (alarm.sourceType === 'input_switch' && typeof alarm.targetInput === 'number') {
      this.setFunction(alarm.targetInput);
    }

    this.setVolume(alarm.volume, alarm.fadeInSeconds);
    this.emit('alarmTriggered', alarm);
    this.emitState();
  }

  private startHostAlarmScheduler(): void {
    if (this.alarmTimer) clearInterval(this.alarmTimer);
    this.alarmTimer = setInterval(() => {
      const now = new Date();
      const jsDay = now.getDay();
      const lgDay = jsDay === 0 ? 6 : jsDay - 1;
      const hr = now.getHours();
      const min = now.getMinutes();
      const minuteKey = `${now.toDateString()}-${hr}:${min}`;

      if (this.lastTriggeredMinuteKey === minuteKey) return;

      for (const alarm of this.state.alarms) {
        if (
          alarm.enable &&
          alarm.hour === hr &&
          alarm.minute === min &&
          alarm.daysList.includes(lgDay)
        ) {
          this.lastTriggeredMinuteKey = minuteKey;
          this.executeAlarmSequence(alarm);
          break;
        }
      }
    }, 5000);
    this.alarmTimer.unref();
  }

  // === Multi-Room & Mesh Grouping Controls ===

  public updateMeshNode(
    nodeId: string,
    updates: Partial<{ groupId: number; channelAssignment: string; volume: number; muted: boolean }>
  ): void {
    const node = this.state.meshNodes.find((n) => n.id === nodeId);
    if (!node) return;
    if (typeof updates.groupId === 'number') {
      node.groupId = updates.groupId;
      node.role = updates.groupId > 0 ? 'slave' : 'individual';
      this.sendRawPacket({
        msg: updates.groupId > 0 ? 'GROUP_SET' : 'GROUP_DESTROY',
        data: { spkid: node.id, groupid: updates.groupId, ip: node.ip },
      });
    }
    if (updates.channelAssignment) {
      node.channelAssignment = updates.channelAssignment as typeof node.channelAssignment;
      this.sendRawPacket({
        msg: 'SPK_CH_SET',
        data: { spkid: node.id, channel: updates.channelAssignment },
      });
    }
    if (typeof updates.volume === 'number') {
      node.volume = updates.volume;
    }
    if (typeof updates.muted === 'boolean') {
      node.muted = updates.muted;
    }
    this.emitState();
  }

  public playLocalStreamOnSoundbar(track: {
    id: string;
    title: string;
    artist: string;
    album: string;
    format: string;
    durationSec: number;
    streamUrl: string;
  }): void {
    if (this.state.currentFunction !== 0) {
      this.setFunction(0);
    }
    this.state.playInfo = {
      playing: true,
      title: track.title,
      artist: track.artist,
      album: track.album,
      albumArt: '',
      durationSec: track.durationSec,
      positionSec: 0,
      sourceApp: 'Open MusicFlow DMS Server (:49252)',
      audioFormat: track.format,
      shuffle: false,
      repeat: 0,
      cpType: 0,
    };
    this.sendLocalPlayUrl(track);
    this.emitState();
  }

  private sendLocalPlayUrl(track: {
    id: string;
    title: string;
    artist: string;
    album: string;
    durationSec: number;
    streamUrl: string;
  }): void {
    this.sendRawPacket({
      msg: 'LOCAL_PLAY_URL',
      data: {
        item: {
          title: track.title,
          artist: track.artist,
          uri: track.streamUrl,
          albumart: '',
          source: 1,
          cptype: 0,
          objID: track.id,
          genre: '',
          albumtitle: track.album,
          duration: track.durationSec,
        },
        sync: false,
        time: 0,
        add: false,
        position: 0,
      },
    });
  }

  private applyIncomingPacket(pkt: Record<string, unknown>): void {
    const msg = String(pkt.msg || '');
    const data = (pkt.data as Record<string, unknown>) || {};

    if (pkt.cmd === 'notibyget' || pkt.cmd === 'notibyset') {
      this.state.detectedDialect = 'temescal';
    } else if (pkt.result === 'OK') {
      this.state.detectedDialect = 'musicflow';
    }

    switch (msg) {
      case 'PRODUCT_INFO': {
        if (typeof data.modelname === 'string') this.state.modelName = data.modelname;
        if (typeof data.petname === 'string') this.state.petName = data.petname;
        if (typeof data.modelnum === 'number') this.state.modelNum = data.modelnum;
        if (typeof data.region === 'string') this.state.region = data.region;
        if (typeof data.protover === 'number') this.state.protoVer = data.protover;
        if (typeof data.reg === 'boolean') this.state.registered = data.reg;
        const info = (data.info as Record<string, unknown>) || {};
        if (typeof info.name === 'string') this.state.name = info.name;
        if (typeof info.vol === 'number' && info.vol <= 40) this.state.volume = info.vol;
        if (typeof info.mute === 'boolean') this.state.muted = info.mute;
        if (typeof info.function === 'number') this.state.currentFunction = info.function;
        if (Array.isArray(info.eqlist)) {
          this.state.availableEqs = info.eqlist.map(Number);
        }
        if (Array.isArray(info.functionlist)) {
          const list = info.functionlist.map(Number);
          if (!list.includes(8)) list.push(8); // Always include Spotify Connect
          this.state.availableFunctions = list;
        }
        if (typeof info.bever === 'string') this.state.firmwareVersion = info.bever;
        if (typeof info.wirelessmac === 'string') this.state.macAddress = info.wirelessmac;
        if (typeof info.btmac === 'string') this.state.bluetoothMac = info.btmac;
        if (typeof info.ledset === 'boolean') this.state.ledIndicator = info.ledset;
        break;
      }

      case 'SYSTEM_VER_REQ': {
        if (typeof data.be === 'string') this.state.firmwareVersion = data.be;
        if (typeof data.micom === 'string') this.state.micomVersion = data.micom;
        if (typeof data.hdmi === 'string') this.state.hdmiVersion = data.hdmi;
        if (typeof data.c4a === 'string') this.state.c4aVersion = data.c4a;
        break;
      }

      case 'FUNC_NAME_REQ': {
        if (typeof data.func === 'number' && typeof data.name === 'string') {
          this.state.customFunctionNames = {
            ...this.state.customFunctionNames,
            [data.func]: data.name,
          };
        }
        break;
      }

      case 'SPK_LIST_VIEW_INFO': {
        if (typeof data.i_vol === 'number') this.state.volume = data.i_vol;
        if (typeof data.i_vol_max === 'number') this.state.maxVolume = data.i_vol_max;
        if (typeof data.b_mute === 'boolean') this.state.muted = data.b_mute;
        if (typeof data.s_user_name === 'string') this.state.name = data.s_user_name;
        break;
      }

      case 'VOLUME_CHANGE': {
        if (typeof data.vol === 'number') this.state.volume = data.vol;
        break;
      }

      case 'MUTE_CHANGE': {
        if (typeof data.mute === 'boolean') this.state.muted = data.mute;
        break;
      }

      case 'FUNC_VIEW_INFO': {
        if (typeof data.i_curr_func === 'number') this.state.currentFunction = data.i_curr_func;
        if (Array.isArray(data.ai_func_list)) {
          this.state.availableFunctions = data.ai_func_list.map(Number);
        }
        break;
      }

      case 'FUNC_INFO':
      case 'FUNC_INFO_REQ': {
        if (typeof data.type === 'number') this.state.currentFunction = data.type;
        if (typeof data.mute === 'boolean') this.state.muted = data.mute;
        break;
      }

      case 'EQ_VIEW_INFO': {
        if (typeof data.i_curr_eq === 'number') this.state.currentEq = data.i_curr_eq;
        if (Array.isArray(data.ai_eq_list)) {
          this.state.availableEqs = data.ai_eq_list.map(Number);
        }
        if (typeof data.i_bass === 'number') this.state.bass = data.i_bass;
        if (typeof data.i_treble === 'number') this.state.treble = data.i_treble;
        if (typeof data.i_lrbal === 'number') this.state.lrBalance = data.i_lrbal;
        break;
      }

      case 'EQ_INFO_REQ':
      case 'EQ_NOTI_CHG': {
        if (typeof data.currenteq === 'number') this.state.currentEq = data.currenteq;
        if (typeof data.bass === 'number') this.state.bass = data.bass;
        if (typeof data.treble === 'number') this.state.treble = data.treble;
        if (typeof data.lrbal === 'number') this.state.lrBalance = data.lrbal;
        break;
      }

      case 'SETTING_VIEW_INFO': {
        if (typeof data.b_night_mode === 'boolean') this.state.nightMode = data.b_night_mode;
        if (typeof data.b_auto_vol === 'boolean') this.state.autoVolume = data.b_auto_vol;
        if (typeof data.b_drc === 'boolean') this.state.drc = data.b_drc;
        if (typeof data.b_neuralx === 'boolean') this.state.neuralX = data.b_neuralx;
        if (typeof data.i_av_sync === 'number') this.state.avSyncMs = data.i_av_sync;
        if (typeof data.i_woofer_level === 'number') {
          this.state.wooferLevel = data.i_woofer_level;
          this.state.wooferRaw = data.i_woofer_level - this.state.wooferOffset;
        }
        if (typeof data.i_woofer_min === 'number') this.state.wooferMin = data.i_woofer_min;
        if (typeof data.i_woofer_max === 'number') this.state.wooferMax = data.i_woofer_max;
        if (typeof data.b_rear === 'boolean') this.state.rearEnabled = data.b_rear;
        if (typeof data.i_rear_level === 'number') this.state.rearLevel = data.i_rear_level;
        if (typeof data.i_center_level === 'number') this.state.centerLevel = data.i_center_level;
        if (typeof data.i_top_level === 'number') this.state.topLevel = data.i_top_level;
        if (typeof data.b_tv_remote === 'boolean') this.state.tvRemote = data.b_tv_remote;
        if (typeof data.b_auto_power === 'boolean') this.state.autoPower = data.b_auto_power;
        if (typeof data.b_auto_display === 'boolean') this.state.autoDisplay = data.b_auto_display;
        if (typeof data.b_bt_standby === 'boolean') this.state.btStandby = data.b_bt_standby;
        if (typeof data.b_conn_bt_limit === 'boolean') this.state.btRestrict = data.b_conn_bt_limit;
        if (typeof data.i_sleep_time === 'number') this.state.sleepTimerMinutes = data.i_sleep_time;
        if (typeof data.s_user_name === 'string') this.state.name = data.s_user_name;
        break;
      }

      case 'SETTING_INFO_REQ':
      case 'SETTING_INFO_NOTI': {
        if (typeof data.nightmode === 'boolean') this.state.nightMode = data.nightmode;
        if (typeof data.autovol === 'boolean') this.state.autoVolume = data.autovol;
        if (typeof data.autopower === 'boolean') this.state.autoPower = data.autopower;
        if (typeof data.drc === 'boolean') this.state.drc = data.drc;
        if (typeof data.ledset === 'boolean') this.state.ledIndicator = data.ledset;
        if (typeof data.btstandby === 'boolean') this.state.btStandby = data.btstandby;
        if (typeof data.limit_bt_conn === 'boolean') this.state.btRestrict = data.limit_bt_conn;
        if (typeof data.avsync === 'number') this.state.avSyncMs = data.avsync;
        if (typeof data.ipv4addr === 'string') this.state.ipv4Addr = data.ipv4addr;
        if (typeof data.ipv6addr === 'string') this.state.ipv6Addr = data.ipv6addr;
        if (typeof data.wooferoffset === 'number') this.state.wooferOffset = data.wooferoffset;
        if (typeof data.woofermax === 'number') {
          this.state.wooferMax = data.woofermax + this.state.wooferOffset;
          this.state.wooferMin = this.state.wooferOffset;
        }
        if (typeof data.wooferlevel === 'number') {
          this.state.wooferRaw = data.wooferlevel;
          this.state.wooferLevel = data.wooferlevel + this.state.wooferOffset;
        }
        if (typeof data.rearboxlevel === 'number') this.state.rearLevel = data.rearboxlevel;
        if (typeof data.rearboxon === 'boolean') this.state.rearEnabled = data.rearboxon;
        break;
      }

      case 'PLAY_INFO':
      case 'PLAY_INFO_REQ': {
        if (typeof data.title === 'string' && data.title) this.state.playInfo.title = data.title;
        if (typeof data.artist === 'string' && data.artist) this.state.playInfo.artist = data.artist;
        if (typeof data.albumtitle === 'string' && data.albumtitle) {
          this.state.playInfo.album = data.albumtitle;
        }
        if (typeof data.albumart === 'string') this.state.playInfo.albumArt = data.albumart;
        if (typeof data.duration === 'number') this.state.playInfo.durationSec = data.duration;
        if (typeof data.position === 'number') this.state.playInfo.positionSec = data.position;
        if (typeof data.playing === 'number') {
          this.state.playInfo.playing = data.playing === 0;
        }
        if (typeof data.shuffle === 'boolean') this.state.playInfo.shuffle = data.shuffle;
        if (typeof data.repeat === 'number') this.state.playInfo.repeat = data.repeat;
        if (typeof data.cptype === 'number') this.state.playInfo.cpType = data.cptype;
        if (typeof data.c4aappname === 'string' && data.c4aappname) {
          this.state.playInfo.sourceApp = data.c4aappname;
        }
        break;
      }

      case 'PLAY_CMD': {
        if (typeof data.playctrl === 'number') {
          if (data.playctrl === 0) this.state.playInfo.playing = true;
          else if (data.playctrl === 1 || data.playctrl === 2) this.state.playInfo.playing = false;
        }
        break;
      }

      case 'PLAY_TIME': {
        if (typeof data.position === 'number') this.state.playInfo.positionSec = data.position;
        if (typeof data.duration === 'number') this.state.playInfo.durationSec = data.duration;
        if (typeof data.playing === 'number') {
          this.state.playInfo.playing = data.playing === 0;
        }
        break;
      }

      case 'SHARE_AP_INFO':
      case 'NETWORK_INFO_REQ': {
        if (typeof data.s_ssid === 'string') this.state.ssid = data.s_ssid;
        else if (typeof data.ssid === 'string') this.state.ssid = data.ssid;
        if (typeof data.meshch === 'number') this.state.meshChannel = data.meshch;
        break;
      }

      case 'ALARM_LIST_REQ':
      case 'ALARM_SET': {
        if (Array.isArray(data.info)) {
          this.state.alarms = data.info.map((raw: Record<string, unknown>, idx: number) => {
            const bitmask = Number(raw.day ?? 64);
            const songpath = String(raw.songpath ?? '');
            const isSpotify = songpath.startsWith('spotify:');
            return {
              id: Number(raw.id ?? idx),
              title: String(raw.title ?? `Alarm ${idx + 1}`),
              hour: Number(raw.hour ?? 7),
              minute: Number(raw.minute ?? 30),
              daysBitmask: bitmask,
              daysList: bitmaskToDaysList(bitmask),
              dayRepeat: Boolean(raw.dayrepeat ?? true),
              volume: Number(raw.volume ?? 14),
              durationMinutes: Number(raw.duration ?? 45),
              enable: Boolean(raw.enable ?? true),
              shuffle: Boolean(raw.shuffle ?? false),
              sourceType: isSpotify ? 'spotify' : 'local_stream',
              spotifyUri: isSpotify ? songpath : undefined,
              localTrackId: !isSpotify ? 'track-sunrise-flac' : undefined,
              fadeInSeconds: 15,
              syncedToHardware: true,
            };
          });
        }
        break;
      }
    }

    this.state.lastUpdated = new Date().toISOString();
    this.emitState();
  }

  private recordPacket(
    direction: 'tx' | 'rx',
    encrypted: boolean,
    cipherProfile: EncryptionMode,
    headerHex: string,
    payload: Record<string, unknown>,
    rawByteLength: number
  ): void {
    const entry: PacketLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      direction,
      encrypted,
      cipherProfile,
      headerHex,
      msgType: String(payload.msg || 'UNKNOWN'),
      cmd: payload.cmd ? String(payload.cmd) : undefined,
      payload,
      rawByteLength,
    };
    this.packetLogs.unshift(entry);
    if (this.packetLogs.length > 150) {
      this.packetLogs.length = 150;
    }
    this.emit('packet', entry);
  }

  private emitState(): void {
    this.emit('state', this.state);
  }

  public getLocalLanIp(): string {
    const nets = os.networkInterfaces();
    const candidates: string[] = [];
    for (const name of Object.keys(nets)) {
      for (const netInfo of nets[name] || []) {
        if (netInfo.family === 'IPv4' && !netInfo.internal) {
          candidates.push(netInfo.address);
        }
      }
    }
    const hostParts = this.state.host.split('.');
    if (hostParts.length === 4) {
      const prefix = `${hostParts[0]}.${hostParts[1]}.${hostParts[2]}.`;
      const sameSubnet = candidates.find((ip) => ip.startsWith(prefix));
      if (sameSubnet) return sameSubnet;
    }
    const privateLan = candidates.find(
      (ip) => ip.startsWith('192.168.') || ip.startsWith('10.')
    );
    return privateLan || candidates[0] || '127.0.0.1';
  }
}

export interface DiscoveredDevice {
  name: string;
  model: string;
  host: string;
  port: number;
  isSimulator: boolean;
  protocol: string;
  locationXml?: string;
}

export async function probeSoundbarPort(
  host: string,
  port: number,
  timeoutMs = 350
): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    const finish = (ok: boolean) => {
      if (!done) {
        done = true;
        sock.destroy();
        resolve(ok);
      }
    };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => finish(true));
    sock.once('timeout', () => finish(false));
    sock.once('error', () => finish(false));
    sock.connect(port, host);
  });
}

/**
 * Performs native UDP SSDP M-SEARCH multicast discovery to `239.255.255.250:1900`
 * for `urn:lge-com:device:MultiroomSpk:1`, `urn:schemas-upnp-org:device:MediaRenderer:1`,
 * and `ssdp:all`. Avoids the Wine `IP_MULTICAST_IF` interface-index bug by using
 * OS routing and parsing unicast `HTTP/1.1 200 OK` replies (e.g. from `192.168.0.10:2870`).
 */
export async function discoverViaSsdpMulticast(timeoutMs = 1200): Promise<DiscoveredDevice[]> {
  return new Promise((resolve) => {
    const found = new Map<string, DiscoveredDevice>();
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    const finish = () => {
      try {
        sock.close();
      } catch {
        // ignore
      }
      resolve(Array.from(found.values()));
    };

    const timer = setTimeout(finish, timeoutMs);

    sock.on('error', () => {
      clearTimeout(timer);
      finish();
    });

    sock.on('message', (msg, rinfo) => {
      const text = msg.toString('utf8');
      if (!/HTTP\/1\.1\s+200\s+OK|NOTIFY/i.test(text)) return;
      const locMatch = text.match(/LOCATION:\s*(http:\/\/[^\r\n]+)/i);
      const stMatch = text.match(/(?:ST|NT):\s*([^\r\n]+)/i);
      const hostIp = rinfo.address;
      if (!found.has(hostIp)) {
        found.set(hostIp, {
          name: `LG Music Flow Speaker (${hostIp})`,
          model: stMatch?.[1]?.includes('MultiroomSpk') ? 'LG MultiroomSpk (SJ8)' : 'UPnP MediaRenderer',
          host: hostIp,
          port: LG_DEFAULT_TCP_PORT,
          isSimulator: false,
          protocol: `SSDP 200 OK (${rinfo.address}:${rinfo.port})`,
          locationXml: locMatch?.[1],
        });
      }
    });

    sock.bind(0, () => {
      try {
        sock.setMulticastTTL(4);
      } catch {
        // ignore if unsupported in container
      }
      const searchTargets = [
        'urn:lge-com:device:MultiroomSpk:1',
        'urn:schemas-upnp-org:device:MediaRenderer:1',
        'ssdp:all',
      ];
      for (const st of searchTargets) {
        const packet = Buffer.from(
          `M-SEARCH * HTTP/1.1\r\n` +
            `HOST: ${LG_SSDP_MULTICAST_ADDR}:${LG_SSDP_PORT}\r\n` +
            `MAN: "ssdp:discover"\r\n` +
            `MX: 2\r\n` +
            `ST: ${st}\r\n\r\n`,
          'utf8'
        );
        sock.send(packet, 0, packet.length, LG_SSDP_PORT, LG_SSDP_MULTICAST_ADDR);
      }
    });
  });
}
