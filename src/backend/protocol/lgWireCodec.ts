import crypto from 'node:crypto';
import { EncryptionMode } from '../../shared/protocolTypes';

/**
 * LG Music Flow / SJ8 / Temescal TCP port 9741 protocol constants.
 *
 * Profile 1 (`sj8_v1` — LG Music Flow PC v1.1.1611.701 / LG SJ8 / `sj8-wifi-setup.py`):
 *   AES-256-CBC Key: "4efgvbn m546Uy7kolKrftgbn =-0u&~" (32 bytes)
 *   AES-256-CBC IV : "54eRty@hkL,;/y9U" (16 bytes)
 *
 * Profile 2 (`temescal_v2` — Newer LG Soundbars / python-temescal):
 *   AES-256-CBC Key: "T^&*J%^7tr~4^%^&I(o%^!jIJ__+a0 k" (32 bytes)
 *   AES-256-CBC IV : "'%^Ur7gy$~t+f)%@" (16 bytes)
 *
 * Profile 3 (`plain` — Unencrypted 0x00 length-prefixed JSON):
 *   Header byte 0x00 + 4-byte BE length + UTF-8 JSON (used when 암호화 : False)
 */
export const LG_DEFAULT_TCP_PORT = 9741;
export const LG_DISCOVERY_UDP_PORT = 9742;
export const LG_DMS_HTTP_PORT = 49252;
export const LG_SSDP_MULTICAST_ADDR = '239.255.255.250';
export const LG_SSDP_PORT = 1900;

export const LG_HEADER_LENGTH = 5;
export const LG_MAGIC_PLAIN = 0x00;
export const LG_MAGIC_ENCRYPTED = 0x10;
export const LG_AES_CIPHER = 'aes-256-cbc';

// V1 Key/IV (LG Music Flow PC Software & LG SJ8 Soundbar)
export const LG_SJ8_V1_KEY = '4efgvbn m546Uy7kolKrftgbn =-0u&~';
export const LG_SJ8_V1_IV = '54eRty@hkL,;/y9U';

// V2 Key/IV (Temescal / Newer LG Soundbars)
export const LG_TEMESCAL_V2_KEY = 'T^&*J%^7tr~4^%^&I(o%^!jIJ__+a0 k';
export const LG_TEMESCAL_V2_IV = "'%^Ur7gy$~t+f)%@";

export function getCipherCredentials(mode: EncryptionMode): { key: string; iv: string } {
  if (mode === 'temescal_v2') {
    return { key: LG_TEMESCAL_V2_KEY, iv: LG_TEMESCAL_V2_IV };
  }
  return { key: LG_SJ8_V1_KEY, iv: LG_SJ8_V1_IV };
}

export function encryptLgPayload(
  jsonText: string,
  mode: Exclude<EncryptionMode, 'plain'> = 'sj8_v1'
): Buffer {
  const { key, iv } = getCipherCredentials(mode);
  const cipher = crypto.createCipheriv(
    LG_AES_CIPHER,
    Buffer.from(key, 'utf8'),
    Buffer.from(iv, 'utf8')
  );
  return Buffer.concat([cipher.update(jsonText, 'utf8'), cipher.final()]);
}

export function decryptLgPayloadWithKey(
  encryptedBuffer: Buffer,
  key: string,
  iv: string
): string {
  const decipher = crypto.createDecipheriv(
    LG_AES_CIPHER,
    Buffer.from(key, 'utf8'),
    Buffer.from(iv, 'utf8')
  );
  return Buffer.concat([decipher.update(encryptedBuffer), decipher.final()])
    .toString('utf8')
    .replace(/[\x00-\x1f]+$/g, '')
    .trim();
}

/**
 * Automatically attempts decryption with the LG SJ8 / Music Flow V1 key first,
 * falling back to the Temescal V2 key if needed.
 */
export function decryptLgPayloadAuto(encryptedBuffer: Buffer): {
  jsonText: string;
  parsed: Record<string, unknown>;
  cipherProfile: EncryptionMode;
} {
  const candidates: Array<{ profile: EncryptionMode; key: string; iv: string }> = [
    { profile: 'sj8_v1', key: LG_SJ8_V1_KEY, iv: LG_SJ8_V1_IV },
    { profile: 'temescal_v2', key: LG_TEMESCAL_V2_KEY, iv: LG_TEMESCAL_V2_IV },
  ];

  let lastError: Error | null = null;
  for (const cand of candidates) {
    try {
      const text = decryptLgPayloadWithKey(encryptedBuffer, cand.key, cand.iv);
      const parsed = JSON.parse(text) as Record<string, unknown>;
      return { jsonText: text, parsed, cipherProfile: cand.profile };
    } catch (err) {
      lastError = err as Error;
    }
  }
  throw lastError || new Error('Failed to decrypt 0x10 frame with SJ8 V1 or Temescal V2 keys');
}

export function encodeLgPacket(
  payload: Record<string, unknown> | string,
  mode: EncryptionMode = 'sj8_v1'
): { buffer: Buffer; headerHex: string; jsonText: string } {
  const jsonText = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const isEncrypted = mode !== 'plain';
  const body = isEncrypted
    ? encryptLgPayload(jsonText, mode)
    : Buffer.from(jsonText, 'utf8');
  const header = Buffer.alloc(LG_HEADER_LENGTH);
  header[0] = isEncrypted ? LG_MAGIC_ENCRYPTED : LG_MAGIC_PLAIN;
  header.writeUInt32BE(body.length, 1);

  return {
    buffer: Buffer.concat([header, body]),
    headerHex: header.toString('hex'),
    jsonText,
  };
}

export interface DecodedFrame {
  encrypted: boolean;
  cipherProfile: EncryptionMode;
  headerHex: string;
  jsonText: string;
  parsed?: Record<string, unknown>;
  rawByteLength: number;
  error?: string;
}

/**
 * Incremental TCP stream framer for LG Music Flow / SJ8 port 9741 packets.
 * Supports:
 * - 0x10 AES-256-CBC frames (auto-detecting SJ8 V1 vs Temescal V2 keys)
 * - 0x00 length-prefixed plain JSON frames (used when 암호화 : False)
 * - Unframed raw JSON fallback
 */
export class LgPacketFramer {
  private buffer: Buffer = Buffer.alloc(0);

  public push(chunk: Buffer): DecodedFrame[] {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    const frames: DecodedFrame[] = [];

    while (this.buffer.length > 0) {
      const firstByte = this.buffer[0];

      // Handle unframed raw JSON strings starting with '{' (0x7b)
      if (firstByte === 0x7b) {
        const nextMagic10 = this.buffer.indexOf(LG_MAGIC_ENCRYPTED);
        const end = nextMagic10 === -1 ? this.buffer.length : nextMagic10;
        const textChunk = this.buffer.subarray(0, end).toString('utf8').trim();
        this.buffer = this.buffer.subarray(end);
        if (textChunk) {
          try {
            const parsed = JSON.parse(textChunk) as Record<string, unknown>;
            frames.push({
              encrypted: false,
              cipherProfile: 'plain',
              headerHex: 'raw-json',
              jsonText: textChunk,
              parsed,
              rawByteLength: Buffer.byteLength(textChunk),
            });
          } catch (err) {
            frames.push({
              encrypted: false,
              cipherProfile: 'plain',
              headerHex: 'raw-json',
              jsonText: textChunk,
              rawByteLength: Buffer.byteLength(textChunk),
              error: (err as Error).message,
            });
          }
        }
        continue;
      }

      if (firstByte !== LG_MAGIC_ENCRYPTED && firstByte !== LG_MAGIC_PLAIN) {
        const next10 = this.buffer.indexOf(LG_MAGIC_ENCRYPTED, 1);
        const next00 = this.buffer.indexOf(LG_MAGIC_PLAIN, 1);
        let nextIdx = -1;
        if (next10 !== -1 && next00 !== -1) nextIdx = Math.min(next10, next00);
        else if (next10 !== -1) nextIdx = next10;
        else if (next00 !== -1) nextIdx = next00;

        if (nextIdx === -1) {
          this.buffer = Buffer.alloc(0);
          break;
        }
        this.buffer = this.buffer.subarray(nextIdx);
        continue;
      }

      if (this.buffer.length < LG_HEADER_LENGTH) {
        break;
      }

      const payloadLength = this.buffer.readUInt32BE(1);
      if (payloadLength > 1024 * 512) {
        this.buffer = this.buffer.subarray(1);
        continue;
      }

      if (this.buffer.length < LG_HEADER_LENGTH + payloadLength) {
        break;
      }

      const headerBuf = this.buffer.subarray(0, LG_HEADER_LENGTH);
      const bodyBuf = this.buffer.subarray(LG_HEADER_LENGTH, LG_HEADER_LENGTH + payloadLength);
      this.buffer = this.buffer.subarray(LG_HEADER_LENGTH + payloadLength);

      const isEncrypted = (firstByte & 0xf0) === LG_MAGIC_ENCRYPTED;
      try {
        if (isEncrypted) {
          const { jsonText, parsed, cipherProfile } = decryptLgPayloadAuto(bodyBuf);
          frames.push({
            encrypted: true,
            cipherProfile,
            headerHex: headerBuf.toString('hex'),
            jsonText,
            parsed,
            rawByteLength: LG_HEADER_LENGTH + payloadLength,
          });
        } else {
          const jsonText = bodyBuf.toString('utf8').replace(/[\x00-\x1f]+$/g, '').trim();
          const parsed = JSON.parse(jsonText) as Record<string, unknown>;
          frames.push({
            encrypted: false,
            cipherProfile: 'plain',
            headerHex: headerBuf.toString('hex'),
            jsonText,
            parsed,
            rawByteLength: LG_HEADER_LENGTH + payloadLength,
          });
        }
      } catch (err) {
        frames.push({
          encrypted: isEncrypted,
          cipherProfile: isEncrypted ? 'sj8_v1' : 'plain',
          headerHex: headerBuf.toString('hex'),
          jsonText: '',
          rawByteLength: LG_HEADER_LENGTH + payloadLength,
          error: (err as Error).message,
        });
      }
    }

    return frames;
  }

  public reset(): void {
    this.buffer = Buffer.alloc(0);
  }
}

/**
 * Converts an array of weekday indices (0=Mon .. 6=Sun) to the LG Music Flow ALARM_SET bitmask.
 */
export function daysListToBitmask(days: number[]): number {
  let mask = 0;
  for (const d of days) {
    if (d >= 0 && d <= 6) {
      mask |= 1 << (6 - d);
    }
  }
  return mask;
}

export function bitmaskToDaysList(mask: number): number[] {
  const days: number[] = [];
  for (let d = 0; d <= 6; d++) {
    if ((mask & (1 << (6 - d))) !== 0) {
      days.push(d);
    }
  }
  return days;
}
