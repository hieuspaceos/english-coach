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

/** Native-audio dialog models, tried in order — Google retires preview
 *  model IDs, so a dead one falls through instead of breaking the app. */
const MODELS = [
  'models/gemini-2.5-flash-native-audio-preview-12-2025',
  'models/gemini-2.5-flash-preview-native-audio-dialog',
];

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
  private apiKey = '';
  private systemInstruction = '';
  private modelIdx = 0;
  private resumeHandle: string | null = null;
  private reconnects = 0;
  private ended = true;

  constructor(
    private handlers: LiveHandlers,
    private pushToTalk = false,
  ) {}

  connect(apiKey: string, systemInstruction: string) {
    this.apiKey = apiKey;
    this.systemInstruction = systemInstruction;
    this.ended = false;
    this.modelIdx = 0;
    this.resumeHandle = null;
    this.reconnects = 0;
    this.openSocket();
  }

  private openSocket() {
    this.ws = new WebSocket(`${WS_URL}?key=${encodeURIComponent(this.apiKey)}`);
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
          model: MODELS[this.modelIdx],
          // Lets the session survive a dropped socket: the server issues a
          // handle we can hand back on reconnect instead of losing the call.
          sessionResumption: this.resumeHandle ? { handle: this.resumeHandle } : {},
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
            },
          },
          systemInstruction: {
            parts: [
              {
                text:
                  this.systemInstruction +
                  '\n\nTake exactly ONE turn at a time: one question or one short ' +
                  'point, then STOP and wait in silence for the student to ' +
                  'reply. Never stack questions, never fill silence by yourself, ' +
                  'never start a new turn before they have spoken.',
              },
            ],
          },
          // The 12-2025 model preview can answer proactively on silence —
          // that would bury a learner mid-thought, so it must stay off.
          proactivity: { proactiveAudio: false },
          realtimeInputConfig: this.pushToTalk
            ? {
                // Push-to-talk: the app sends explicit activityStart/End,
                // so server VAD must never guess — and never chop the model.
                automaticActivityDetection: { disabled: true },
                activityHandling: 'NO_INTERRUPTION',
              }
            : {
                // Free-flow: server VAD detects turn ends. Low end-of-speech
                // sensitivity waits out the pauses of a learner mid-sentence.
                // Hardware AEC (VOICE_COMMUNICATION mic source) keeps speaker
                // echo out, so only a real voice can trigger an interruption.
                automaticActivityDetection: {
                  disabled: false,
                  endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
                },
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

    // Surface errors through the close path — mid-call failures get a
    // resume attempt there instead of an instant error screen.
    this.ws.onerror = () => {
      try {
        this.ws?.close();
      } catch {}
    };
    this.ws.onclose = () => this.handleClose();
  }

  private handleClose() {
    this.ready = false;
    if (this.ended) {
      this.handlers.onClose();
      return;
    }
    if (!this.resumeHandle) {
      // Never got a session: a rejected setup (e.g. retired model id) —
      // walk the model list before declaring the call dead.
      if (this.modelIdx + 1 < MODELS.length) {
        this.modelIdx++;
        this.openSocket();
        return;
      }
      this.handlers.onClose();
      return;
    }
    // Mid-call drop: retry with the resumption handle a couple of times —
    // the server keeps the session alive for a short window.
    if (this.reconnects < 3) {
      this.reconnects++;
      setTimeout(() => {
        if (!this.ended) this.openSocket();
      }, 700 * this.reconnects);
      return;
    }
    this.handlers.onClose();
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
      this.reconnects = 0;
      if (this.connectTimer) {
        clearTimeout(this.connectTimer);
        this.connectTimer = null;
      }
      this.pendingAudio.forEach((c) => this.sendAudioChunk(c));
      this.pendingAudio = [];
      this.handlers.onReady();
      return;
    }

    // Server-issued handle that lets a dropped socket resume the same
    // session — refresh it whenever a new one arrives.
    const update = msg.sessionResumptionUpdate;
    if (update?.newHandle) {
      if (update.resumable === false) this.resumeHandle = null;
      else this.resumeHandle = update.newHandle;
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

  /** User pressed "Nói" — begin an explicit activity turn. */
  activityStart() {
    if (this.ready) this.send({ realtimeInput: { activityStart: {} } });
  }

  /** User pressed "Gửi" — turn complete, model should respond now. */
  activityEnd() {
    if (this.ready) this.send({ realtimeInput: { activityEnd: {} } });
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
    this.ended = true;
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
