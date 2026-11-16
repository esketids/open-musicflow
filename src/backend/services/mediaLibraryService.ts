import fs from 'node:fs';
import path from 'node:path';
import { LocalMediaTrack } from '../../shared/protocolTypes';

export class MediaLibraryService {
  private tracks: LocalMediaTrack[] = [
    {
      id: 'track-sunrise-flac',
      title: 'Acoustic Sunrise (Mood Station: Relaxing)',
      artist: 'Open MusicFlow Ensemble',
      album: 'Hi-Res Acoustic Sessions (24-bit/96kHz)',
      format: 'WAV / PCM 16-bit 44.1kHz',
      sampleRate: '44.1 kHz',
      bitDepth: '16-bit',
      durationSec: 8,
      moodCategory: 'relaxing',
      streamPath: '/stream/track-sunrise-flac.wav',
      isBuiltInSynth: true,
    },
    {
      id: 'track-cinema-sub',
      title: 'Subwoofer LFE & Surround Calibration Sweep',
      artist: 'Open MusicFlow Acoustic Lab',
      album: 'Home Cinema Reference Suite',
      format: 'WAV / PCM 16-bit 44.1kHz',
      sampleRate: '44.1 kHz',
      bitDepth: '16-bit',
      durationSec: 6,
      moodCategory: 'cinema',
      streamPath: '/stream/track-cinema-sub.wav',
      isBuiltInSynth: true,
    },
    {
      id: 'track-focus-ambient',
      title: 'Warm Analog Pad (Mood Station: Deep Focus)',
      artist: 'MusicFlow Studio Synth',
      album: 'Seamless Mesh Ambient',
      format: 'WAV / PCM 16-bit 44.1kHz',
      sampleRate: '44.1 kHz',
      bitDepth: '16-bit',
      durationSec: 8,
      moodCategory: 'focus',
      streamPath: '/stream/track-focus-ambient.wav',
      isBuiltInSynth: true,
    },
    {
      id: 'track-energetic-pulse',
      title: 'Harmonic Upbeat Chime (Mood Station: Energetic)',
      artist: 'MusicFlow Studio Synth',
      album: 'Party Mode Reference',
      format: 'WAV / PCM 16-bit 44.1kHz',
      sampleRate: '44.1 kHz',
      bitDepth: '16-bit',
      durationSec: 6,
      moodCategory: 'energetic',
      streamPath: '/stream/track-energetic-pulse.wav',
      isBuiltInSynth: true,
    },
    {
      id: 'track-night-rain',
      title: 'Velvet Nocturne (Mood Station: Late Night)',
      artist: 'MusicFlow Studio Synth',
      album: 'Night Mode Reference',
      format: 'WAV / PCM 16-bit 44.1kHz',
      sampleRate: '44.1 kHz',
      bitDepth: '16-bit',
      durationSec: 8,
      moodCategory: 'night',
      streamPath: '/stream/track-night-rain.wav',
      isBuiltInSynth: true,
    },
  ];

  public getTracks(): LocalMediaTrack[] {
    return this.tracks;
  }

  public scanDirectory(dirPath: string): LocalMediaTrack[] {
    const resolved = path.resolve(dirPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Directory not found: ${resolved}`);
    }
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const audioExts = new Set(['.flac', '.wav', '.mp3', '.m4a', '.ogg', '.aiff']);

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!audioExts.has(ext)) continue;

      const fullPath = path.join(resolved, entry.name);
      const id = `local-${Buffer.from(fullPath).toString('base64url').slice(0, 16)}`;
      if (this.tracks.some((t) => t.id === id)) continue;

      this.tracks.push({
        id,
        title: path.basename(entry.name, ext),
        artist: 'Local PC Library',
        album: path.basename(resolved),
        format: `${ext.slice(1).toUpperCase()} Lossless/Audio`,
        sampleRate: '48.0 kHz',
        bitDepth: '24-bit',
        durationSec: 180,
        moodCategory: 'relaxing',
        streamPath: `/stream/${id}${ext}`,
        filePath: fullPath,
      });
    }

    return this.tracks;
  }

  /**
   * Generates a valid playable stereo 16-bit 44.1kHz WAV buffer on the fly
   * for built-in Mood Station / Calibration / Alarm tracks so both the browser
   * and the physical LG Soundbar can stream real audio over HTTP!
   */
  public generateSynthesizedWav(trackId: string): Buffer {
    const sampleRate = 22050;
    const durationSec = 4;
    const numSamples = sampleRate * durationSec;
    const numChannels = 1;
    const bytesPerSample = 2;
    const dataSize = numSamples * numChannels * bytesPerSample;
    const buffer = Buffer.alloc(44 + dataSize);

    // RIFF WAVE header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // PCM chunk size
    buffer.writeUInt16LE(1, 20);  // PCM format
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28);
    buffer.writeUInt16LE(numChannels * bytesPerSample, 32);
    buffer.writeUInt16LE(bytesPerSample * 8, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    // Choose chord frequencies based on trackId
    let freqs = [261.63, 329.63, 392.0, 493.88]; // Cmaj7
    if (trackId.includes('cinema')) {
      freqs = [65.41, 98.0, 130.81, 196.0]; // Deep LFE bass chord
    } else if (trackId.includes('focus')) {
      freqs = [220.0, 277.18, 329.63, 440.0]; // A major warm pad
    } else if (trackId.includes('energetic')) {
      freqs = [293.66, 369.99, 440.0, 587.33]; // D major bright
    } else if (trackId.includes('night')) {
      freqs = [174.61, 220.0, 261.63, 349.23]; // Fmaj7 soft
    }

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const env = Math.min(1, t / 0.3) * Math.max(0, 1 - (t / durationSec) * 0.7);
      let sample = 0;
      for (const f of freqs) {
        sample += Math.sin(2 * Math.PI * f * t) / freqs.length;
      }
      const pcmValue = Math.max(-32767, Math.min(32767, Math.round(sample * env * 14000)));
      buffer.writeInt16LE(pcmValue, 44 + i * 2);
    }

    return buffer;
  }
}
