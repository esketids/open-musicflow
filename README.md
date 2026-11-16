# Open MusicFlow Studio

An open-source, cleanroom desktop controller, Wi-Fi provisioning utility, and local DMS media server (`:49252` & `:4741`) for the **LG SJ8 Soundbar** (`Sound Bar SJ8`, firmware `NB9.504.00629.C`) and the entire **LG Music Flow Soundbar & Wi-Fi Speaker family** (`SJ8`, `SJ9`, `HS6`, `HS7`, `HS8`, `HS9`, `LAS650M`, `LAS750M`, `LAS855M`, `LAS950M`, `H3/NP8340`, `H4/NP8350`, `H5/NP8540`, `H7/NP8740`, `SK`, `SL`, `SN`, and `SP` series) on **Linux**, **Windows**, and **macOS**.

---

## Cleanroom Architecture & Verified LG SJ8 Hardware Protocol

This project is a **100% cleanroom implementation** built from documented protocol specifications and verified against live **LG SJ8** hardware packet captures (`192.168.0.10:9741`):

- **Wire Framing & Ciphers (`src/backend/protocol/lgWireCodec.ts`)**:
  - 5-byte big-endian header: `[magicByte (0x10 = AES-256-CBC, 0x00 = Plaintext), uint32BE payloadLength]`
  - **LG SJ8 / Music Flow V1 Cipher (`sj8_v1`)**: AES-256-CBC Key `4efgvbn m546Uy7kolKrftgbn =-0u&~` (32B), IV `54eRty@hkL,;/y9U` (16B)
  - **LG Temescal V2 Cipher (`temescal_v2`)**: AES-256-CBC Key `T^&*J%^7tr~4^%^&I(o%^!jIJ__+a0 k` (32B), IV `'%^Ur7gy$~t+f)%@` (16B)
  - **Plaintext (`plain`)**: `0x00` header + 4-byte BE length + UTF-8 JSON (`암호화 : False`)
  - Auto-decrypts both `sj8_v1` and `temescal_v2` packets transparently on incoming TCP chunks (`LgPacketFramer`).
- **Exact LG SJ8 Startup & Command Sequence (`src/backend/protocol/lgSoundbarClient.ts`)**:
  - Startup handshake: `PRODUCT_INFO` -> `RADIO_PART_CONN_GET` -> `MAC_INFO_REQ` -> `NET_INFO_REQ` -> `EQ_INFO_REQ` -> `SETTING_INFO_REQ` -> `PLAY_INFO` -> `FUNC_INFO_REQ` -> `FUNC_NAME_REQ` -> `ALARM_STATE_REQ` -> `ALARM_LIST_REQ` -> `SLEEP_INFO_REQ` -> `SPK_LIST_VIEW_INFO` -> `PLAY_TIME_SET: true`.
  - **LG SJ8 Woofer Level Math**: `SETTING_INFO_REQ` returns `"wooferlevel": 15, "wooferoffset": -15, "woofermax": 21`. Raw wire values `0..21` map to `-15 dB .. +6 dB` (`dB = raw + wooferoffset`).
  - **LG SJ8 Alarm Protocol (`ALARM_SET` + `SET_ALARM_PLAYLIST`)**:
    - `mode: 0` = Create / Modify (`modifiedid` included when editing)
    - `mode: 2` = Delete (`id`, `mode: 2`)
    - `mode: 3` = Enable (`id`, `mode: 3`, `enable: true`)
    - `mode: 4` = Disable (`id`, `mode: 4`, `enable: false`)
    - Supports both **Built-In SJ8 Chime** (`type: 0, songpath: ""`, which works without the PC on) and **Local PC DMS Playlist (`SET_ALARM_PLAYLIST`)** served on port `49252`.

---

## Core Features

1. **Device & Acoustic Control (`TCP 9741`)**:
   - **LG SJ8 Native Inputs (`[0, 15, 1, 12, 6, 5]` + Spotify `#8` & Cast `#14`)**: Wi-Fi, Optical/HDMI ARC (`TV ARC`), Bluetooth,LG TV (`LG Sound Sync`), HDMI In, Portable In, plus all 20 extended LG functions.
   - **LG SJ8 Native EQs (`[14, 0, 7, 12]`) & 19 Extended Modes**: ASC (Adaptive Sound Control), Standard, Music, Movie, Bass Blast, Cinema, Clear Voice, Dolby Atmos, DTS Virtual:X, plus Bass, Treble, and Balance registers.
   - **Subwoofer Trim & System Settings**: Subwoofer (-15 to +6 dB with automatic `wooferoffset: -15` conversion), Rear Surround Level & Toggle, Center/Overhead trims, AV Sync (0–300 ms), Night Mode (`NIGHT_MODE_SET`), Auto Volume (`AUTO_VOL_SET`), Auto Power (`AUTO_POWER_SET`), DRC (`DRC_SET`), LED Indicator (`LED_SET`), Sleep Timer (`SLEEP_SET`), and Test Tone (`TEST_TONE`).
2. **Wi-Fi Based Alarms (`ALARM_SET` + `SET_ALARM_PLAYLIST` + Host Scheduler)**:
   - Full CRUD support for hardware alarms (`mode: 0/2/3/4`), weekday bitmask `1 << (6 - day)`, built-in SJ8 chime, local PC DMS playlists (`SET_ALARM_PLAYLIST` on port `49252`), and Spotify Connect wakeup playlists with smooth volume ramp.
3. **Spotify Linking & Spotify Connect Bridge**:
   - Real-time 1-second `PLAY_TIME` progress tracking (`PLAY_TIME_SET: true`), direct switch to Spotify Connect (`Function #8`, `cptype: 2`), device playback transfer, playlist launcher (`CP_PLAY_URL`), and optional Spotify OAuth 2.0 PKCE / Bearer token linking.
4. **Local DMS Media Server (`:49252` & `:4741`) & Mood Station**:
   - Automatically binds both port `4741` (Web UI & API) and port `49252` (the `MusicFlowDMS.exe` UPnP/DLNA port already forwarded in OpenWrt), serving `/stream/:id` and `/dmr.xml`.
5. **LG SJ8 Wi-Fi Setup (`MusicFlow_Setup`) & OpenWrt Cross-Subnet Toolkit**:
   - Built-in GUI & API for `SHARE_HOME_INFO` (`192.168.5.100:9741`) and `SPK_ADD_SET` (`192.168.0.10:9741`), plus bundled [`scripts/sj8-wifi-setup.py`](scripts/sj8-wifi-setup.py), [`configs/openwrt/`](configs/openwrt/), [`configs/cachyos/`](configs/cachyos/), and [`docs-sj8-reference.md`](docs-sj8-reference.md).

---

## Running & Building Cross-Platform Releases (Linux, Windows, macOS)

### Development & Local Web/Desktop Mode
```bash
npm install
npm test
npm run build
npm run dev:server
```

### Exporting Native Desktop Builds (`electron-builder`)
- **Linux (`.AppImage`, `.deb`, `.tar.gz`)**:
  ```bash
  npm run dist:linux
  ```
- **Windows (NSIS `.exe` installer, Portable `.exe`, `.zip`)**:
  ```bash
  npm run dist:win
  ```
- **macOS (`.dmg`, `.zip` for Intel x64 & Apple Silicon arm64)**:
  ```bash
  npm run dist:mac
  ```
- **Portable Cross-Platform Bundles (`release/`)**:
  ```bash
  node scripts/export-bundles.mjs
  ```
