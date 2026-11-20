import net from 'node:net';
import { EncryptionMode } from '../../shared/protocolTypes';
import {
  LgPacketFramer,
  encodeLgPacket,
  daysListToBitmask,
} from './lgWireCodec';

/**
 * Built-In Virtual LG SJ8 Soundbar Simulator.
 * Replicates the exact responses captured from the user's physical LG SJ8
 * (`192.168.0.10:9741`, firmware `NB9.504.00629.C`, MAC `7c:1c:4e:3b:b0:22`)
 * in `logs/261117_064325.txt` and `scripts/sj8-wifi-setup.py`.
 */
export class MockSoundbarServer {
  private server: net.Server | null = null;
  private clients: Set<net.Socket> = new Set();
  public port: number;

  private state = {
    name: 'LG SJ8',
    modelName: 'SJ8',
    petName: 'Sound Bar SJ8',
    modelNum: 14,
    region: 'SG',
    protoVer: 1,
    reg: true,
    firmwareBe: 'NB9.504.00629.C',
    micom: '1904080',
    hdmi: '1807100',
    c4a: '1.36.145853',
    mac: '7c:1c:4e:3b:b0:22',
    btMac: '08:EF:3B:9C:2D:4F',
    ipv4Addr: '192.168.0.10',
    ipv6Addr: '2406:3003:2006:c7f9:7e1c:4eff:fe3b:b022',
    ssid: 'o',
    meshCh: 11,
    network: 1, // Wireless
    volume: 17,
    maxVolume: 40,
    muted: false,
    currentFunc: 8, // Spotify (type 8)
    availableFuncs: [0, 15, 1, 12, 6, 5, 8],
    customFuncNames: { 15: 'Optical/HDMI ARC' } as Record<number, string>,
    currentEq: 14, // Bass Blast (14) - native SJ8 eqlist: [14, 0, 7, 12]
    availableEqs: [14, 0, 7, 12],
    bass: 0,
    treble: 0,
    lrBalance: 0,
    wooferRaw: 15, // Raw wire value (0..21), where dB = raw + wooferOffset (-15) = 0 dB
    wooferOffset: -15,
    wooferMaxRaw: 21,
    rearLevel: 0,
    rearOn: false,
    centerLevel: 0,
    topLevel: 0,
    avSync: 0,
    nightMode: false,
    autoVol: false,
    drc: false,
    neuralX: false,
    tvRemote: true,
    autoPower: true,
    autoDisplay: true,
    btStandby: false,
    btLimit: false,
    ledSet: true,
    limitGroupGcast: false,
    enableBalance: false,
    visibleToneCtrl: true,
    visibleAlarm: true,
    visibleReserveSleep: true,
    visibleMlibSync: true,
    visibleTvConn: true,
    sleepTime: 0,
    playTimeNotify: true,
    playing: 0,
    title: 'Bandit',
    artist: 'EsDeeKid',
    album: 'Bandit',
    albumArt: 'http://o.scdn.co/320/ab67616d00001e02bf78fac0a3916813bbacfba8',
    duration: 110,
    position: 10,
    cpType: 2,
    source: 1,
    shuffle: true,
    repeat: 0,
    sourceApp: 'Spotify Connect (SJ8)',
    alarms: [
      {
        id: 0,
        day: daysListToBitmask([0, 1, 2, 3, 4]), // Mon-Fri
        dayrepeat: true,
        hour: 7,
        minute: 30,
        type: 0,
        duration: 45,
        volume: 17,
        enable: true,
        shuffle: true,
        title: 'SJ8 Morning Spotify Wakeup (Bandit / EsDeeKid)',
        ipaddress: '192.168.1.176',
        songpath: 'spotify:playlist:37i9dQZF1DXbITWG1ZJKYt',
      },
      {
        id: 1,
        day: daysListToBitmask([5, 6]), // Sat-Sun
        dayrepeat: true,
        hour: 9,
        minute: 0,
        type: 0,
        duration: 60,
        volume: 15,
        enable: false,
        shuffle: false,
        title: 'Weekend DLNA Stream (CachyOS :49252)',
        ipaddress: '192.168.1.176',
        songpath: '/stream/track-sunrise-flac.wav',
      },
    ],
  };

  constructor(port = 19741) {
    this.port = port;
  }

  public async start(): Promise<number> {
    if (this.server) return this.port;

    return new Promise((resolve, reject) => {
      const srv = net.createServer((socket) => {
        this.clients.add(socket);
        const framer = new LgPacketFramer();

        socket.on('data', (chunk) => {
          const frames = framer.push(chunk);
          for (const frame of frames) {
            if (frame.parsed) {
              this.handlePacket(socket, frame.parsed, frame.cipherProfile);
            }
          }
        });

        socket.on('close', () => {
          this.clients.delete(socket);
        });

        socket.on('error', () => {
          this.clients.delete(socket);
        });
      });

      srv.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          this.port += 1;
          srv.listen(this.port, '127.0.0.1');
        } else {
          reject(err);
        }
      });

      srv.listen(this.port, '127.0.0.1', () => {
        this.server = srv;
        resolve(this.port);
      });
    });
  }

  public async stop(): Promise<void> {
    for (const c of this.clients) {
      c.destroy();
    }
    this.clients.clear();
    if (this.server) {
      await new Promise<void>((res) => this.server!.close(() => res()));
      this.server = null;
    }
  }

  private sendResponse(
    socket: net.Socket,
    payload: Record<string, unknown>,
    cipherProfile: EncryptionMode = 'sj8_v1'
  ): void {
    if (socket.destroyed) return;
    const { buffer } = encodeLgPacket(payload, cipherProfile);
    socket.write(buffer);
  }

  private handlePacket(
    socket: net.Socket,
    pkt: Record<string, unknown>,
    cipherProfile: EncryptionMode
  ): void {
    const msg = String(pkt.msg || '');
    const cmd = pkt.cmd ? String(pkt.cmd) : undefined;
    const data = (pkt.data as Record<string, unknown>) || {};

    switch (msg) {
      // === Real LG SJ8 V1 + V2 PRODUCT_INFO ===
      case 'PRODUCT_INFO': {
        this.sendResponse(
          socket,
          {
            cmd: cmd ? 'notibyget' : undefined,
            msg: 'PRODUCT_INFO',
            result: 'OK',
            data: {
              reg: this.state.reg,
              network: this.state.network,
              protover: this.state.protoVer,
              region: this.state.region,
              modeltype: 2,
              petname: this.state.petName,
              modelname: this.state.modelName,
              modelnum: this.state.modelNum,
              info: {
                name: this.state.name,
                icon: 0,
                groupid: 0,
                ledset: this.state.ledSet,
                channel: 0,
                groupcolor: 0,
                function: this.state.currentFunc,
                spktype: 0,
                playing: this.state.playing === 0 || this.state.playing === 4,
                vol: this.state.volume,
                wirelessmac: this.state.mac,
                mute: this.state.muted,
                update: false,
                eqlist: this.state.availableEqs,
                functionlist: this.state.availableFuncs,
                demo: false,
                bever: this.state.firmwareBe,
                btmac: this.state.btMac,
              },
            },
          },
          cipherProfile
        );
        break;
      }

      // === Real LG SJ8 SYSTEM_VER_REQ ===
      case 'SYSTEM_VER_REQ':
      case 'BUILD_INFO_DEV': {
        this.sendResponse(
          socket,
          {
            msg: 'SYSTEM_VER_REQ',
            result: 'OK',
            data: {
              be: this.state.firmwareBe,
              micom: this.state.micom,
              meq: '',
              dsp: '',
              hdmi: this.state.hdmi,
              demomusic: '',
              c4a: this.state.c4a,
            },
          },
          cipherProfile
        );
        break;
      }

      // === Real LG SJ8 Wi-Fi Setup & Onboarding (`sj8-wifi-setup.py`) ===
      case 'SHARE_HOME_INFO': {
        if (typeof data.ssid === 'string') {
          this.state.ssid = data.ssid;
        }
        this.sendResponse(
          socket,
          {
            msg: 'SHARE_HOME_INFO',
            result: 'OK',
            data: { ssid: this.state.ssid },
          },
          cipherProfile
        );
        break;
      }

      case 'SPK_ADD_SET':
      case 'SPK_INFO_MODIFY': {
        if (typeof data.name === 'string' && data.name.trim()) {
          this.state.name = data.name.trim();
        }
        this.state.reg = true;
        this.sendResponse(
          socket,
          {
            msg,
            result: 'OK',
            data: { name: this.state.name, reg: true },
          },
          cipherProfile
        );
        break;
      }

      // === Real LG SJ8 FUNC_NAME_REQ (`{"func": 15, "name": "Optical/HDMI ARC"}`) ===
      case 'FUNC_NAME_REQ': {
        const fnId = Number(data.func ?? 15);
        this.sendResponse(
          socket,
          {
            msg: 'FUNC_NAME_REQ',
            result: 'OK',
            data: {
              func: fnId,
              name: this.state.customFuncNames[fnId] || 'Optical/HDMI ARC',
            },
          },
          cipherProfile
        );
        break;
      }

      case 'PLAY_TIME_SET': {
        this.state.playTimeNotify = Boolean(data.set ?? true);
        this.sendResponse(
          socket,
          {
            msg: 'PLAY_TIME_SET',
            result: 'OK',
          },
          cipherProfile
        );
        break;
      }

      case 'ALARM_STATE_REQ': {
        this.sendResponse(
          socket,
          {
            msg: 'ALARM_STATE_NOTI',
            data: { on: false },
          },
          cipherProfile
        );
        break;
      }

      case 'AUTO_POWER_SET': {
        if (typeof data.autopower === 'boolean') {
          this.state.autoPower = data.autopower;
        }
        this.sendResponse(
          socket,
          {
            msg: 'AUTO_POWER_SET',
            result: 'OK',
            data: { autopower: this.state.autoPower },
          },
          cipherProfile
        );
        break;
      }

      case 'SPK_LIST_VIEW_INFO': {
        if (cmd === 'set') {
          if (typeof data.i_vol === 'number') this.state.volume = data.i_vol;
          if (typeof data.b_mute === 'boolean') this.state.muted = data.b_mute;
        }
        this.sendResponse(
          socket,
          {
            cmd: cmd === 'set' ? 'notibyset' : 'notibyget',
            msg: 'SPK_LIST_VIEW_INFO',
            result: 'ok',
            data: {
              i_vol: this.state.volume,
              i_vol_min: 0,
              i_vol_max: this.state.maxVolume,
              b_mute: this.state.muted,
              s_user_name: this.state.name,
            },
          },
          cipherProfile
        );
        break;
      }

      case 'VOLUME_SETTING': {
        if (typeof data.vol === 'number') {
          this.state.volume = Math.max(0, Math.min(this.state.maxVolume, Math.round(data.vol)));
        }
        this.sendResponse(
          socket,
          {
            msg: 'VOLUME_CHANGE',
            result: 'OK',
            data: { vol: this.state.volume },
          },
          cipherProfile
        );
        break;
      }

      case 'VOLUME_UP':
      case 'VOLUME_DOWN': {
        const delta = msg === 'VOLUME_UP' ? 1 : -1;
        this.state.volume = Math.max(0, Math.min(this.state.maxVolume, this.state.volume + delta));
        this.sendResponse(
          socket,
          {
            msg: 'VOLUME_CHANGE',
            result: 'OK',
            data: { vol: this.state.volume },
          },
          cipherProfile
        );
        break;
      }

      case 'MUTE_SET': {
        if (typeof data.mute === 'boolean') this.state.muted = data.mute;
        this.sendResponse(
          socket,
          {
            msg: 'MUTE_CHANGE',
            result: 'OK',
            data: { mute: this.state.muted },
          },
          cipherProfile
        );
        break;
      }

      case 'FUNC_VIEW_INFO': {
        if (cmd === 'set' && typeof data.i_curr_func === 'number') {
          this.state.currentFunc = data.i_curr_func;
        }
        this.sendResponse(
          socket,
          {
            cmd: cmd === 'set' ? 'notibyset' : 'notibyget',
            msg: 'FUNC_VIEW_INFO',
            result: 'ok',
            data: {
              i_curr_func: this.state.currentFunc,
              ai_func_list: this.state.availableFuncs,
              b_mute: this.state.muted,
            },
          },
          cipherProfile
        );
        break;
      }

      case 'FUNCTION_SET':
      case 'FUNC_INFO_REQ': {
        if (typeof data.type === 'number') {
          this.state.currentFunc = data.type;
        }
        this.sendResponse(
          socket,
          {
            msg: msg === 'FUNC_INFO_REQ' ? 'FUNC_INFO_REQ' : 'FUNC_INFO',
            result: 'OK',
            data: {
              type: this.state.currentFunc,
              mute: this.state.muted,
              btname: '',
              connect: this.state.currentFunc === 8 ? 1 : 0,
            },
          },
          cipherProfile
        );
        break;
      }

      case 'EQ_VIEW_INFO': {
        if (cmd === 'set' && typeof data.i_curr_eq === 'number') {
          this.state.currentEq = data.i_curr_eq;
        }
        this.sendResponse(
          socket,
          {
            cmd: cmd === 'set' ? 'notibyset' : 'notibyget',
            msg: 'EQ_VIEW_INFO',
            result: 'ok',
            data: {
              i_curr_eq: this.state.currentEq,
              ai_eq_list: this.state.availableEqs,
              i_bass: this.state.bass,
              i_treble: this.state.treble,
              i_lrbal: this.state.lrBalance,
            },
          },
          cipherProfile
        );
        break;
      }

      case 'EQ_SETTING':
      case 'EQ_INFO_REQ': {
        if (msg === 'EQ_SETTING') {
          const eqType = Number(data.type ?? 0);
          const val = Number(data.value ?? 0);
          if (eqType === 0) this.state.currentEq = val;
          else if (eqType === 1) this.state.bass = val;
          else if (eqType === 2) this.state.treble = val;
          else if (eqType === 3) this.state.lrBalance = val;
        }
        this.sendResponse(
          socket,
          {
            msg: 'EQ_INFO_REQ',
            result: 'OK',
            data: {
              currenteq: this.state.currentEq,
              bass: this.state.bass,
              treble: this.state.treble,
              lrbal: this.state.lrBalance,
            },
          },
          cipherProfile
        );
        break;
      }

      case 'SETTING_VIEW_INFO': {
        if (cmd === 'set') {
          if (typeof data.b_night_mode === 'boolean') this.state.nightMode = data.b_night_mode;
          if (typeof data.b_auto_vol === 'boolean') this.state.autoVol = data.b_auto_vol;
          if (typeof data.b_drc === 'boolean') this.state.drc = data.b_drc;
          if (typeof data.b_neuralx === 'boolean') this.state.neuralX = data.b_neuralx;
          if (typeof data.i_av_sync === 'number') this.state.avSync = data.i_av_sync;
          if (typeof data.i_woofer_level === 'number') {
            // Convert dB (-15..+6) to raw (0..21)
            this.state.wooferRaw = Math.max(
              0,
              Math.min(this.state.wooferMaxRaw, data.i_woofer_level - this.state.wooferOffset)
            );
          }
          if (typeof data.b_rear === 'boolean') this.state.rearOn = data.b_rear;
          if (typeof data.i_rear_level === 'number') this.state.rearLevel = data.i_rear_level;
          if (typeof data.i_center_level === 'number') this.state.centerLevel = data.i_center_level;
          if (typeof data.i_top_level === 'number') this.state.topLevel = data.i_top_level;
          if (typeof data.b_tv_remote === 'boolean') this.state.tvRemote = data.b_tv_remote;
          if (typeof data.b_auto_power === 'boolean') this.state.autoPower = data.b_auto_power;
          if (typeof data.b_auto_display === 'boolean') this.state.autoDisplay = data.b_auto_display;
          if (typeof data.b_bt_standby === 'boolean') this.state.btStandby = data.b_bt_standby;
          if (typeof data.b_conn_bt_limit === 'boolean') this.state.btLimit = data.b_conn_bt_limit;
          if (typeof data.i_sleep_time === 'number') this.state.sleepTime = data.i_sleep_time;
          if (typeof data.s_user_name === 'string') this.state.name = data.s_user_name;
        }
        const wooferDb = this.state.wooferRaw + this.state.wooferOffset;
        this.sendResponse(
          socket,
          {
            cmd: cmd === 'set' ? 'notibyset' : 'notibyget',
            msg: 'SETTING_VIEW_INFO',
            result: 'ok',
            data: {
              b_night_mode: this.state.nightMode,
              b_auto_vol: this.state.autoVol,
              b_drc: this.state.drc,
              b_neuralx: this.state.neuralX,
              i_av_sync: this.state.avSync,
              i_woofer_level: wooferDb,
              i_woofer_min: -15,
              i_woofer_max: 6,
              b_rear: this.state.rearOn,
              i_rear_level: this.state.rearLevel,
              i_center_level: this.state.centerLevel,
              i_top_level: this.state.topLevel,
              b_tv_remote: this.state.tvRemote,
              b_auto_power: this.state.autoPower,
              b_auto_display: this.state.autoDisplay,
              b_bt_standby: this.state.btStandby,
              b_conn_bt_limit: this.state.btLimit,
              i_sleep_time: this.state.sleepTime,
              s_user_name: this.state.name,
              s_ipv4_addr: this.state.ipv4Addr,
            },
          },
          cipherProfile
        );
        break;
      }

      case 'SLEEP_INFO_REQ': {
        this.sendResponse(
          socket,
          {
            msg: 'SLEEP_INFO_REQ',
            result: 'OK',
            data: { time: this.state.sleepTime },
          },
          cipherProfile
        );
        break;
      }

      case 'SETTING_INFO_REQ':
      case 'NIGHT_MODE_SET':
      case 'WOOFER_LEVEL_SET':
      case 'AUTO_VOL_SET':
      case 'AUTO_DISPLAY_SET':
      case 'TV_REMOTE_SET':
      case 'DRC_SET':
      case 'AV_SYNC_SET':
      case 'LED_SET':
      case 'BT_STANDBY_SET':
      case 'BT_LIMIT_SET':
      case 'ON_SURROUND_SET':
      case 'REARBOX_LEVEL_SET':
      case 'SLEEP_SET': {
        if (msg === 'NIGHT_MODE_SET' && typeof data.nightmode === 'boolean') {
          this.state.nightMode = data.nightmode;
        }
        if (msg === 'WOOFER_LEVEL_SET' && typeof data.wooferlevel === 'number') {
          // If caller passed raw 0..21 or dB -15..6
          this.state.wooferRaw =
            data.wooferlevel < 0
              ? data.wooferlevel - this.state.wooferOffset
              : data.wooferlevel;
        }
        if (msg === 'AUTO_VOL_SET' && typeof data.autovol === 'boolean') {
          this.state.autoVol = data.autovol;
        }
        if (msg === 'AUTO_DISPLAY_SET' && typeof data.autodisplay === 'boolean') {
          this.state.autoDisplay = data.autodisplay;
        }
        if (msg === 'TV_REMOTE_SET' && typeof data.tvremote === 'boolean') {
          this.state.tvRemote = data.tvremote;
        }
        if (msg === 'DRC_SET' && typeof data.drc === 'boolean') {
          this.state.drc = data.drc;
        }
        if (msg === 'AV_SYNC_SET' && typeof data.avsync === 'number') {
          this.state.avSync = data.avsync;
        }
        if (msg === 'LED_SET') {
          if (typeof data.stat === 'boolean') this.state.ledSet = data.stat;
          else if (typeof data.ledset === 'boolean') this.state.ledSet = data.ledset;
        }
        if (msg === 'BT_STANDBY_SET') {
          if (typeof data.on === 'boolean') this.state.btStandby = data.on;
          else if (typeof data.btstandby === 'boolean') this.state.btStandby = data.btstandby;
        }
        if (msg === 'BT_LIMIT_SET' && typeof data.limit_bt_conn === 'boolean') {
          this.state.btLimit = data.limit_bt_conn;
        }
        if (msg === 'ON_SURROUND_SET' && typeof data.rearboxon === 'boolean') {
          this.state.rearOn = data.rearboxon;
        }
        if (msg === 'REARBOX_LEVEL_SET' && typeof data.rearboxlevel === 'number') {
          this.state.rearLevel = data.rearboxlevel;
        }
        if (msg === 'SLEEP_SET' && typeof data.time === 'number') {
          this.state.sleepTime = Math.max(0, data.time);
        }
        this.sendResponse(
          socket,
          {
            msg: msg === 'SETTING_INFO_REQ' ? 'SETTING_INFO_REQ' : 'SETTING_INFO_NOTI',
            result: 'OK',
            data: {
              woofermax: this.state.wooferMaxRaw,
              drc: this.state.drc,
              ledset: this.state.ledSet,
              avsync: this.state.avSync,
              autopower: this.state.autoPower,
              autodisplay: this.state.autoDisplay,
              tvremote: this.state.tvRemote,
              autovol: this.state.autoVol,
              limit_bt_conn: this.state.btLimit,
              btstandby: this.state.btStandby,
              visible_init: true,
              nightmode: this.state.nightMode,
              visible_tonectrl: this.state.visibleToneCtrl,
              wooferlevel: this.state.wooferRaw,
              wooferoffset: this.state.wooferOffset,
              rearboxon: this.state.rearOn,
              rearboxlevel: this.state.rearLevel,
              rearboxoffset: 0,
              settinginfover: 1,
              groupcompress: 0,
              ipv4addr: this.state.ipv4Addr,
              ipv6addr: this.state.ipv6Addr,
              limit_group_gcast: this.state.limitGroupGcast,
              visible_alarm: this.state.visibleAlarm,
              visible_reserve_sleep: this.state.visibleReserveSleep,
              visible_mlib_sync: this.state.visibleMlibSync,
              enable_balance: this.state.enableBalance,
              visible_tvconn: this.state.visibleTvConn,
            },
          },
          cipherProfile
        );
        break;
      }

      case 'PLAY_INFO':
      case 'PLAY_INFO_REQ':
      case 'CP_INFO_REQ':
      case 'LOCAL_PLAY_URL':
      case 'CP_PLAY_URL': {
        const item = (data.item as Record<string, unknown>) || data;
        if (typeof item.title === 'string') this.state.title = item.title;
        if (typeof item.artist === 'string') this.state.artist = item.artist;
        if (typeof item.albumtitle === 'string') this.state.album = item.albumtitle;
        else if (typeof item.album === 'string') this.state.album = item.album;
        if (typeof data.playing === 'number') this.state.playing = data.playing;
        else if (msg === 'LOCAL_PLAY_URL' || msg === 'CP_PLAY_URL') this.state.playing = 0;
        this.sendResponse(
          socket,
          {
            cmd: cmd ? 'notibyget' : undefined,
            msg:
              msg === 'PLAY_INFO_REQ'
                ? 'PLAY_INFO_REQ'
                : msg === 'CP_INFO_REQ'
                  ? 'CP_INFO_REQ'
                  : 'PLAY_INFO',
            result: 'OK',
            data: {
              actionId: '',
              idx: 0,
              duration: this.state.duration,
              albumtitle: this.state.album,
              uri: '',
              artist: this.state.artist,
              title: this.state.title,
              objID: '',
              position: this.state.position,
              inactive: false,
              source: this.state.source,
              repeat: this.state.repeat,
              shuffle: this.state.shuffle,
              playing: this.state.playing,
              c4aappid: '',
              albumart: this.state.albumArt,
              cptype: this.state.cpType,
              canPlay: 0,
              c4aappname: this.state.sourceApp,
            },
          },
          cipherProfile
        );
        break;
      }

      case 'PLAY_CMD': {
        const ctrl = typeof data.playctrl === 'number' ? data.playctrl : 0;
        if (ctrl === 0 || ctrl === 1 || ctrl === 2) {
          this.state.playing = ctrl;
        } else if (ctrl === 3 || ctrl === 5) {
          this.state.position = 0;
        }
        if (typeof data.repeat === 'number') this.state.repeat = data.repeat;
        if (typeof data.shuffle === 'boolean') this.state.shuffle = data.shuffle;
        this.sendResponse(
          socket,
          {
            msg: 'PLAY_CMD',
            result: 'OK',
            data: { playctrl: ctrl, repeat: this.state.repeat, shuffle: this.state.shuffle },
          },
          cipherProfile
        );
        this.sendResponse(
          socket,
          {
            msg: 'PLAY_INFO',
            data: {
              duration: this.state.duration,
              albumtitle: this.state.album,
              artist: this.state.artist,
              title: this.state.title,
              position: this.state.position,
              repeat: this.state.repeat,
              shuffle: this.state.shuffle,
              playing: this.state.playing,
              cptype: this.state.cpType,
              c4aappname: this.state.sourceApp,
            },
          },
          cipherProfile
        );
        break;
      }

      case 'LOCAL_TIME_SEARCH': {
        if (typeof data.time === 'number') {
          this.state.position = Math.max(0, Math.min(this.state.duration, Math.round(data.time)));
        }
        this.sendResponse(
          socket,
          {
            msg: 'LOCAL_TIME_SEARCH',
            result: 'OK',
            data: { time: this.state.position },
          },
          cipherProfile
        );
        break;
      }

      case 'SHARE_AP_INFO':
      case 'NETWORK_INFO_REQ': {
        this.sendResponse(
          socket,
          {
            cmd: cmd ? 'notibyget' : undefined,
            msg: msg === 'NETWORK_INFO_REQ' ? 'NETWORK_INFO_REQ' : 'SHARE_AP_INFO',
            result: 'OK',
            data: {
              s_ssid: this.state.ssid,
              ssid: this.state.ssid,
              meshch: this.state.meshCh,
              network: this.state.network,
              s_mac_addr: this.state.mac,
            },
          },
          cipherProfile
        );
        break;
      }

      case 'ALARM_LIST_REQ': {
        this.sendResponse(
          socket,
          {
            msg: 'ALARM_LIST_REQ',
            result: 'OK',
            data: {
              info: this.state.alarms,
            },
          },
          cipherProfile
        );
        break;
      }

      case 'ALARM_SET': {
        const mode = Number(data.mode ?? 0);
        const incomingId = Number(data.id ?? -1);

        if (mode === 2) {
          this.state.alarms = this.state.alarms.filter((a) => a.id !== incomingId);
        } else if (mode === 3 || mode === 4) {
          const target = this.state.alarms.find((a) => a.id === incomingId);
          if (target) target.enable = mode === 3;
        } else {
          const nextId =
            incomingId >= 0
              ? incomingId
              : this.state.alarms.reduce((max, a) => Math.max(max, a.id), -1) + 1;
          const newAlarm = {
            id: nextId,
            day: Number(data.day ?? 64),
            dayrepeat: Boolean(data.dayrepeat ?? true),
            hour: Number(data.hour ?? 7),
            minute: Number(data.minute ?? 0),
            type: Number(data.type ?? 0),
            duration: Number(data.duration ?? 30),
            volume: Number(data.volume ?? 15),
            enable: Boolean(data.enable ?? true),
            shuffle: Boolean(data.shuffle ?? false),
            title: String(data.title ?? 'LG SJ8 Wi-Fi Alarm'),
            ipaddress: String(data.ipaddress ?? '192.168.1.176'),
            songpath: String(data.songpath ?? ''),
            modifiedid: Number(data.modifiedid ?? nextId),
          };
          const existingIdx = this.state.alarms.findIndex((a) => a.id === nextId);
          if (existingIdx >= 0) {
            this.state.alarms[existingIdx] = newAlarm;
          } else {
            this.state.alarms.push(newAlarm);
          }
        }

        this.sendResponse(
          socket,
          {
            msg: 'ALARM_SET',
            result: 'OK',
            data: {
              id: incomingId >= 0 ? incomingId : this.state.alarms.length - 1,
              info: this.state.alarms,
            },
          },
          cipherProfile
        );
        break;
      }

      case 'SET_ALARM_PLAYLIST': {
        this.sendResponse(
          socket,
          {
            msg: 'SET_ALARM_PLAYLIST',
            result: 'OK',
            data: {
              id: Number(data.id ?? 0),
              songpath: String(data.songpath ?? ''),
              ipaddress: String(data.ipaddress ?? '192.168.1.176'),
            },
          },
          cipherProfile
        );
        break;
      }

      default: {
        this.sendResponse(
          socket,
          {
            cmd: cmd === 'set' ? 'notibyset' : cmd === 'get' ? 'notibyget' : undefined,
            msg,
            result: 'OK',
            data: { echoed: data, timestamp: new Date().toISOString() },
          },
          cipherProfile
        );
        break;
      }
    }
  }
}
