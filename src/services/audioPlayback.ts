import { AudioContext, AudioBufferQueueSourceNode } from 'react-native-audio-api';
import { decode as b64decode } from 'base-64';

/**
 * Streaming PCM player for Gemini Live's audio output (PCM16, 24kHz, mono).
 * Chunks arrive over the WebSocket; each is decoded to float samples and
 * enqueued on a queue source so playback is gapless.
 *
 * Playback starts lazily once ~0.35s of audio has been buffered (jitter
 * buffer): the first chunks of a response often arrive unevenly, and
 * starting immediately would make the opening words stutter.
 */
const PREBUFFER_SEC = 0.35;
const PREBUFFER_MAX_WAIT_MS = 1200;

export class PcmPlayer {
  private ctx: AudioContext;
  private queue: AudioBufferQueueSourceNode;
  private started = false;
  private stopped = false;
  private bufferedSec = 0;
  private firstEnqueuedAt = 0;
  private pendingBuffers = 0;
  private queuedSec = 0;
  private playbackStartedAt = 0;

  constructor(private sampleRate = 24000) {
    // Run the whole graph at the stream's native rate — buffers tagged
    // 24kHz played through a 48kHz context come out ~2x fast/chipmunk
    // on Android where the queue source doesn't resample correctly.
    this.ctx = new AudioContext({ sampleRate });
    this.queue = this.ctx.createBufferQueueSource();
    this.queue.onbufferended = () => {
      if (this.pendingBuffers > 0) this.pendingBuffers--;
      if (this.pendingBuffers === 0) {
        // Queue drained — rebase the failsafe clock for the next turn.
        this.queuedSec = 0;
        this.playbackStartedAt = Date.now();
      }
    };
  }

  /** True while enqueued AI audio is still playing or waiting to play. */
  get isBusy() {
    if (this.pendingBuffers <= 0) return false;
    if (this.started && Date.now() > this.playbackStartedAt + this.queuedSec * 1000 + 1500) {
      // Failsafe: if buffer-ended callbacks get dropped, release once all
      // enqueued audio has had time to play out — never gate the mic forever.
      this.pendingBuffers = 0;
      return false;
    }
    return true;
  }

  start() {
    if (this.started || this.stopped) return;
    this.queue.connect(this.ctx.destination);
    this.queue.start();
    this.started = true;
    this.playbackStartedAt = Date.now();
  }

  /** Enqueue one base64 PCM16 chunk for playback. */
  enqueue(b64Pcm: string) {
    if (this.stopped) return;
    const bytes = this.b64ToBytes(b64Pcm);
    const samples = new Float32Array(bytes.length / 2);
    for (let i = 0; i < samples.length; i++) {
      // little-endian int16 → float in [-1, 1]
      const lo = bytes[i * 2];
      const hi = bytes[i * 2 + 1];
      let v = (hi << 8) | lo;
      if (v >= 0x8000) v -= 0x10000;
      samples[i] = v / 0x8000;
    }
    const buffer = this.ctx.createBuffer(1, samples.length, this.sampleRate);
    buffer.copyToChannel(samples, 0);
    this.queue.enqueueBuffer(buffer);
    this.pendingBuffers++;
    this.queuedSec += samples.length / this.sampleRate;

    if (!this.started) {
      if (!this.firstEnqueuedAt) this.firstEnqueuedAt = Date.now();
      this.bufferedSec += samples.length / this.sampleRate;
      if (
        this.bufferedSec >= PREBUFFER_SEC ||
        Date.now() - this.firstEnqueuedAt > PREBUFFER_MAX_WAIT_MS
      ) {
        this.start();
      }
    }
  }

  /** Drop queued audio (e.g. user interrupted the model mid-sentence). */
  flush() {
    this.queue.clearBuffers();
    // Re-buffer the next response from scratch.
    this.bufferedSec = 0;
    this.firstEnqueuedAt = 0;
    this.pendingBuffers = 0;
    this.queuedSec = 0;
    this.playbackStartedAt = Date.now();
  }

  async stop() {
    if (this.stopped) return;
    this.stopped = true;
    try {
      this.queue.stop();
      await this.ctx.close();
    } catch {
      // already stopped
    }
  }

  private b64ToBytes(b64: string): Uint8Array {
    const str = b64decode(b64);
    const out = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i);
    return out;
  }
}
