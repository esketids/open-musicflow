import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LgPacketFramer,
  bitmaskToDaysList,
  daysListToBitmask,
  encodeLgPacket,
} from '../src/backend/protocol/lgWireCodec';
import { MockSoundbarServer } from '../src/backend/protocol/mockSoundbarServer';
import { LgSoundbarClient } from '../src/backend/protocol/lgSoundbarClient';
import { SpotifyService } from '../src/backend/services/spotifyService';

test('AES-256-CBC 0x10 framing (sj8_v1 and temescal_v2) and 0x00 plain framing encode/decode split and concatenated frames', () => {
  const framer = new LgPacketFramer();
  const pkt1 = encodeLgPacket({ cmd: 'get', msg: 'PRODUCT_INFO' }, 'sj8_v1');
  const pkt2 = encodeLgPacket({ cmd: 'set', msg: 'EQ_SETTING', data: { eq: 14 } }, 'temescal_v2');
  const pkt3 = encodeLgPacket({ cmd: 'get', msg: 'ALARM_LIST_REQ' }, 'plain');

  // Concatenate all three packets and slice in the middle to test partial TCP stream reassembly
  const combined = Buffer.concat([pkt1.buffer, pkt2.buffer, pkt3.buffer]);
  const partA = combined.subarray(0, 14);
  const partB = combined.subarray(14);

  const firstPush = framer.push(partA);
  assert.equal(firstPush.length, 0);

  const secondPush = framer.push(partB);
  assert.equal(secondPush.length, 3);
  assert.equal(secondPush[0].encrypted, true);
  assert.equal(secondPush[0].parsed?.msg, 'PRODUCT_INFO');
  assert.equal(secondPush[1].encrypted, true);
  assert.equal(secondPush[1].parsed?.msg, 'EQ_SETTING');
  assert.equal(secondPush[2].encrypted, false);
  assert.equal(secondPush[2].parsed?.msg, 'ALARM_LIST_REQ');
});

test('Wi-Fi Alarm bitmask matches LG Music Flow specification (Mon+Tue = 0b1100000 = 96)', () => {
  // Monday (0) + Tuesday (1) => (1 << 6) | (1 << 5) = 64 + 32 = 96
  const maskMonTue = daysListToBitmask([0, 1]);
  assert.equal(maskMonTue, 0b1100000);
  assert.deepEqual(bitmaskToDaysList(maskMonTue), [0, 1]);

  // Weekdays Mon..Fri (0..4) => 64 + 32 + 16 + 8 + 4 = 124
  const maskWeekdays = daysListToBitmask([0, 1, 2, 3, 4]);
  assert.equal(maskWeekdays, 124);
  assert.deepEqual(bitmaskToDaysList(maskWeekdays), [0, 1, 2, 3, 4]);
});

test('LgSoundbarClient communicates over TCP 9741 with LG SJ8 MockSoundbarServer', async () => {
  const sim = new MockSoundbarServer(29741);
  const port = await sim.start();
  const client = new LgSoundbarClient();

  try {
    await client.connect('127.0.0.1', port, {
      dialect: 'auto',
      encryption: 'sj8_v1',
      isSimulator: true,
    });

    // Wait briefly for initial LG SJ8 handshake queries
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(client.state.connected, true);
    assert.equal(client.state.modelName, 'SJ8');
    assert.equal(client.state.name, 'LG SJ8');
    assert.equal(client.state.petName, 'Sound Bar SJ8');
    assert.equal(client.state.firmwareVersion, 'NB9.504.00629.C');

    // Verify LG SJ8 woofer offset decoding (raw 15 + offset -15 = 0 dB)
    assert.equal(client.state.wooferOffset, -15);
    assert.equal(client.state.wooferRaw, 15);
    assert.equal(client.state.wooferLevel, 0);

    // Test Woofer trim change (+3 dB => raw 18)
    client.updateSettings({ wooferLevel: 3 });
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(client.state.wooferLevel, 3);
    assert.equal(client.state.wooferRaw, 18);

    // Test Volume change
    client.setVolume(28);
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(client.state.volume, 28);

    // Test Input switch to Spotify Connect (Function 8)
    client.setFunction(8);
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(client.state.currentFunction, 8);

    // Test Equalizer switch to ASC (Adaptive Sound Control, EQ 14 on SJ8)
    client.setEqualizer(14);
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(client.state.currentEq, 14);

    // Test LG SJ8 Wi-Fi Alarm lifecycle: Create (mode 0), Disable (mode 4), Enable (mode 3), Delete (mode 2)
    const alarm = client.upsertWifiAlarm({
      title: 'SJ8 Morning Chime',
      hour: 6,
      minute: 45,
      daysList: [0, 1, 2, 3, 4],
      volume: 15,
      sourceType: 'default_chime',
    });
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(alarm.daysBitmask, 124);
    const created = client.state.alarms.find((a) => a.title === 'SJ8 Morning Chime');
    assert.ok(created);

    // Disable (mode: 4)
    client.toggleWifiAlarm(created.id, false);
    await new Promise((r) => setTimeout(r, 80));
    const disabled = client.state.alarms.find((a) => a.id === created.id);
    assert.equal(disabled?.enable, false);

    // Enable (mode: 3)
    client.toggleWifiAlarm(created.id, true);
    await new Promise((r) => setTimeout(r, 80));
    const enabled = client.state.alarms.find((a) => a.id === created.id);
    assert.equal(enabled?.enable, true);

    // Delete (mode: 2)
    client.deleteWifiAlarm(created.id);
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(client.state.alarms.some((a) => a.id === created.id), false);

    // Test PLAY_CMD pause (playctrl: 1) and resume (playctrl: 0)
    assert.equal(client.state.playInfo.playing, true);
    client.sendPlayCommand(1);
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(client.state.playInfo.playing, false);

    client.sendPlayCommand(0);
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(client.state.playInfo.playing, true);
  } finally {
    client.disconnect();
    await sim.stop();
  }
});

test('SpotifyService PKCE OAuth URL generation and state validation', async () => {
  const client = new LgSoundbarClient();
  const spotify = new SpotifyService(client);
  const { authUrl, state } = spotify.generatePkceAuthUrl(
    'test-client-id',
    'http://127.0.0.1:4743/api/spotify/callback'
  );

  const parsed = new URL(authUrl);
  assert.equal(parsed.origin + parsed.pathname, 'https://accounts.spotify.com/authorize');
  assert.equal(parsed.searchParams.get('client_id'), 'test-client-id');
  assert.equal(parsed.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(parsed.searchParams.get('state'), state);
  assert.equal(
    parsed.searchParams.get('redirect_uri'),
    'http://127.0.0.1:4743/api/spotify/callback'
  );

  await assert.rejects(
    () => spotify.exchangeAuthorizationCode('fake-code', 'wrong-state'),
    /OAuth state mismatch/
  );
});
