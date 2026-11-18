/**
 * Gemini Live API client — realtime speech-to-speech over WebSocket.
 *
 * Protocol (BidiGenerateContent):
 *  1. open ws with ?key=API_KEY
 *  2. send {"setup": {...}} — model, AUDIO modality, systemInstruction,
 *     input/output audio transcription enabled
 *  3. wait for {"setupComplete": {}}
 *  4. stream mic: {"realtimeInput": {"audio": {"data": b64, "mimeType": "audio/pcm;rate=16000"}}}
 *  5. receive serverContent: modelTurn audio chunks (pcm;rate=24000),
 *     inputTranscription/outputTranscription text, turnComplete, interrupted
 */

const WS_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

/** Native-audio dialog model. Update if Google promotes a newer one. */
const MODEL = 'models/gemini-2.5-flash-native-audio-preview-09-2025';

/** UTF-8 bytes → string, for Hermes builds without TextDecoder. */
function utf8BytesToString(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    if (b < 0x80) {
      out += String.fromCharCode(b);
      i += 1;
    } else if (b < 0xe0) {
      out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
      i += 2;
    } else if (b < 0xf0) {
      out += String.fromCharCode(
        ((b & 0xf) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f),
      );
      i += 3;
    } else {
      const cp =
        ((b & 7) << 18) |
        ((bytes[i + 1] & 0x3f) << 12) |
        ((bytes[i + 2] & 0x3f) << 6) |
        (bytes[i + 3] & 0x3f);
      out += String.fromCodePoint(cp);
      i += 4;
    }
  }
  return out;
}

export interface LiveHandlers {
  onReady: () => void;
  /** Base64 PCM16 @ 24kHz chunk from the model's voice. */
  onAudio: (b64Pcm: string) => void;
  /** What the user said (server-side transcription). */
  onUserText: (text: string) => void;
  /** What the model said (transcription of its own audio). */
  onModelText: (text: string) => void;
  /** Model finished a turn. */
  onTurnEnd: () => void;
  /** User barged in — model stopped talking; queued playback should be dropped. */
  onInterrupted: () => void;
  onError: (message: string) => void;
  onClose: () => void;
}

export class GeminiLiveSession {
  private ws: WebSocket | null = null;
  private ready = false;
  private pendingAudio: string[] = [];
  private connectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private handlers: LiveHandlers) {}

  connect(apiKey: string, systemInstruction: string) {
    this.ws = new WebSocket(`${WS_URL}?key=${encodeURIComponent(apiKey)}`);
    // RN delivers ws payloads as Blobs — decode to text before JSON.parse,
    // otherwise setupComplete is silently dropped and the call never starts.
    this.ws.binaryType = 'blob';

    // Never spin on "connecting" forever — fail the call after 20s.
    this.connectTimer = setTimeout(() => {
      if (!this.ready) {
        this.handlers.onError('Connection timed out — check your network or API key.');
        this.end();
      }
    }, 20_000);

    this.ws.onopen = () => {
      this.send({
        setup: {
          model: MODEL,
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
            },
          },
          systemInstruction: { parts: [{ text: systemInstruction }] },
          realtimeInputConfig: {
            // Stray sound (room noise, speaker echo) must never chop the
            // model mid-sentence — the learner gets full turns, always.
            activityHandling: 'NO_INTERRUPTION',
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
      });
    };

    this.ws.onmessage = (event) => {
      void this.dispatchMessage(event.data);
    };

    this.ws.onerror = () => this.handlers.onError('WebSocket error — check API key & network.');
    this.ws.onclose = () => {
      this.ready = false;
      this.handlers.onClose();
    };
  }

  private async dispatchMessage(data: unknown) {
    let text: string | null = null;
    if (typeof data === 'string') {
      text = data;
    } else if (data instanceof Blob) {
      // Hermes has FileReader but not necessarily Blob.text() — use the
      // always-available path.
      text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(data);
      });
    } else if (data instanceof ArrayBuffer) {
      text = await this.dispatchBuffer(data);
    }
    if (text == null) return;
    try {
      this.handleMessage(JSON.parse(text));
    } catch {
      // non-JSON frame — ignore
    }
  }

  private async dispatchBuffer(buf: ArrayBuffer): Promise<string> {
    // Hermes can't build Blobs from ArrayBuffers — decode UTF-8 directly.
    if (typeof TextDecoder === 'function') {
      return new TextDecoder().decode(buf);
    }
    return Promise.resolve(utf8BytesToString(new Uint8Array(buf)));
  }

  private handleMessage(msg: any) {
    if (msg.setupComplete) {
      this.ready = true;
      if (this.connectTimer) {
        clearTimeout(this.connectTimer);
        this.connectTimer = null;
      }
      this.pendingAudio.forEach((c) => this.sendAudioChunk(c));
      this.pendingAudio = [];
      this.handlers.onReady();
      return;
    }

    const sc = msg.serverContent;
    if (!sc) return;

    if (sc.interrupted) {
      this.handlers.onInterrupted();
    }

    for (const part of sc.modelTurn?.parts ?? []) {
      const data = part.inlineData?.data;
      if (data) this.handlers.onAudio(data);
    }

    if (sc.inputTranscription?.text) {
      this.handlers.onUserText(sc.inputTranscription.text);
    }
    if (sc.outputTranscription?.text) {
      this.handlers.onModelText(sc.outputTranscription.text);
    }
    if (sc.turnComplete) {
      this.handlers.onTurnEnd();
    }
  }

  /** Feed 16kHz PCM16 base64 chunks from the mic. Safe to call before ready. */
  sendAudioChunk(b64Pcm: string) {
    if (!this.ready) {
      this.pendingAudio.push(b64Pcm);
      return;
    }
    this.send({
      realtimeInput: {
        audio: { data: b64Pcm, mimeType: 'audio/pcm;rate=16000' },
      },
    });
  }

  private send(payload: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  end() {
    this.ready = false;
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    try {
      this.ws?.close();
    } catch {
      // already closed
    }
    this.ws = null;
  }
}
