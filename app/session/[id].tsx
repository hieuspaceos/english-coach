import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useAudioRecorder } from '@siteed/audio-studio';
import { setAudioModeAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import Reanimated, { ZoomIn } from 'react-native-reanimated';
import { SCENARIOS } from '../../src/scenarios';
import { GeminiLiveSession } from '../../src/services/geminiLive';
import { PcmPlayer } from '../../src/services/audioPlayback';
import { analyzeTranscript, AnalysisResult } from '../../src/services/analyzeSession';
import { learnerContext } from '../../src/services/profile';
import { queries } from '../../src/db/database';
import { useCoachStore } from '../../src/state/store';
import { AudioPlayButton } from '../../src/components/AudioPlayButton';
import { F } from '../../src/theme';

const MAX_SECONDS = 20 * 60;

type Status = 'connecting' | 'live' | 'analyzing' | 'done' | 'error';

interface Line {
  who: 'user' | 'client';
  text: string;
}

/** PCM16 little-endian → base64. Fallback for platforms that stream raw samples instead of base64 strings. */
function int16ToBase64(samples: Int16Array): string {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 4096) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 4096));
  }
  return btoa(bin);
}

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // Memoized: the 1s countdown re-renders this screen constantly, and the
  // custom-scenario lookup below hits SQLite — it must not run per render.
  const scenario = useMemo(
    () =>
      SCENARIOS.find((s) => s.id === id) ??
      (() => {
        const c = queries.listCustomScenarios().find((r) => r.id === id);
        return c
          ? { id: c.id, title: c.title, titleVi: c.title_vi, skill: c.skill, systemPrompt: c.system_prompt }
          : undefined;
      })(),
    [id],
  );
  const apiKey = useCoachStore((s) => s.apiKey);
  const router = useRouter();
  const recorder = useAudioRecorder();

  useKeepAwake('session'); // keep the screen on for the whole call

  const [status, setStatus] = useState<Status>('connecting');
  const statusRef = useRef<Status>(status);
  statusRef.current = status;
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(MAX_SECONDS);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [earned, setEarned] = useState(false);
  const [audioUri, setAudioUri] = useState<string | null>(null);

  const sessionRef = useRef<GeminiLiveSession | null>(null);
  const playerRef = useRef<PcmPlayer | null>(null);
  const lastModelAudioAtRef = useRef(0);
  const startedAtRef = useRef(0);
  const sessionIdRef = useRef<number | null>(null);
  const pendingRef = useRef<{ user: string; client: string }>({ user: '', client: '' });
  const linesRef = useRef<Line[]>([]);
  const endingRef = useRef(false);
  const pulse = useRef(new Animated.Value(1)).current;

  const pushLine = useCallback((who: 'user' | 'client', text: string) => {
    const trimmed = text.trim();
    if (trimmed) linesRef.current.push({ who, text: trimmed });
  }, []);

  const flush = useCallback(() => {
    for (const who of ['user', 'client'] as const) {
      if (pendingRef.current[who]) {
        pushLine(who, pendingRef.current[who]);
        pendingRef.current[who] = '';
      }
    }
  }, [pushLine]);

  const endCall = useCallback(async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    flush();
    setStatus('analyzing');

    // Persist the session FIRST — the audio teardown below can hang on a
    // misbehaving native stop, and the transcript must never be lost.
    const transcript = linesRef.current
      .map((l) => `${l.who === 'user' ? 'User' : 'Client'}: ${l.text}`)
      .join('\n');
    const durationSec = Math.round((Date.now() - startedAtRef.current) / 1000);
    const sid = sessionIdRef.current;
    if (sid != null) {
      queries.finishSession(sid, durationSec, transcript, null);
      // +10 only for a real practice call — dropped/phantom sessions that
      // die seconds after connecting must not farm coins.
      if (durationSec >= 30) {
        queries.addCoins(10);
        useCoachStore.getState().addCoins(10);
        setEarned(true);
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    }

    // Teardown with hard timeouts — a hung native call must not trap the
    // user here (endingRef is already latched, so a hang would also kill
    // the button for good).
    try {
      const rec = await Promise.race([
        recorder.stopRecording(),
        new Promise<null>((r) => setTimeout(() => r(null), 4000)),
      ]);
      const audioUri = rec?.compression?.compressedFileUri ?? rec?.fileUri ?? null;
      if (audioUri && sid != null) {
        queries.updateSessionAudio(sid, audioUri);
        setAudioUri(audioUri);
      }
    } catch {
      // already stopped
    }
    try {
      sessionRef.current?.end();
    } catch {}
    try {
      await Promise.race([
        playerRef.current?.stop(),
        new Promise<null>((r) => setTimeout(() => r(null), 3000)),
      ]);
    } catch {}

    if (sid != null && apiKey && transcript) {
      const analysis = await analyzeTranscript(apiKey, transcript);
      if (analysis) {
        queries.saveAnalysis(sid, JSON.stringify(analysis));
        for (const e of analysis.errors ?? []) {
          queries.insertError(sid, e.key ?? null, e.said, e.correct, e.category, e.note_vi);
        }
        for (const v of analysis.vocab ?? []) {
          queries.upsertVocab(v.term, v.meaning_vi, v.example, sid);
        }
        setResult(analysis);
      }
    }
    setStatus('done');
  }, [apiKey, flush, recorder]);

  const endRef = useRef(endCall);
  endRef.current = endCall;

  // 20-minute countdown → auto end
  useEffect(() => {
    if (status !== 'live') return;
    const timer = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (status === 'live' && secondsLeft <= 0) endRef.current();
  }, [secondsLeft, status]);

  // Start the call as soon as the screen mounts
  useEffect(() => {
    if (!apiKey || !scenario) {
      setStatus('error');
      return;
    }
    startedAtRef.current = Date.now();
    const player = new PcmPlayer(24000);
    playerRef.current = player;

    const session = new GeminiLiveSession({
      onReady: async () => {
        try {
          // iOS: play AI voice + record mic simultaneously, ignore silent switch
          await setAudioModeAsync({
            allowsRecording: true, // iOS only — harmless on Android
            playsInSilentMode: true,
            interruptionMode: 'doNotMix', // pause music/other apps during the call
          });
          await recorder.startRecording({
            sampleRate: 16000,
            channels: 1,
            encoding: 'pcm_16bit',
            interval: 100,
            streamFormat: 'raw',
            // No need to retain audio-analysis datapoints — serializing them
            // after stop hits Hermes's "no Blob from ArrayBuffer" limit.
            keepFullAnalysis: false,
            // Small compressed copy alongside the stream — the saved file is
            // what the replay button in history/review plays back.
            output: {
              primary: { enabled: false },
              compressed: { enabled: true, format: 'aac' },
            },
            onAudioStream: async (event) => {
              // Half-duplex: while the model is talking, don't stream the
              // mic — speaker echo and room noise otherwise feed its VAD.
              // Gate on recent model audio too, not just the local queue:
              // when streaming keeps pace with playback the queue is near
              // empty while the model is still mid-sentence.
              if (player.isBusy || Date.now() - lastModelAudioAtRef.current < 1500) return;
              const d = event.data;
              if (typeof d === 'string') {
                session.sendAudioChunk(d);
              } else if (d instanceof Int16Array) {
                session.sendAudioChunk(int16ToBase64(d));
              } else if (d instanceof Float32Array) {
                // Some devices stream float samples — convert to PCM16 or
                // the AI hears silence while nothing errors out.
                const i16 = new Int16Array(d.length);
                for (let i = 0; i < d.length; i++) {
                  i16[i] = Math.max(-32768, Math.min(32767, Math.round(d[i] * 32767)));
                }
                session.sendAudioChunk(int16ToBase64(i16));
              }
            },
          });
          // Player starts itself after buffering ~0.35s — no explicit start.
          setStatus('live');
          // Only record the session once the call is actually live —
          // failed connects shouldn't leave empty rows in history.
          sessionIdRef.current = queries.insertSession(scenario.id, startedAtRef.current);
        } catch {
          session.end();
          setStatus('error');
        }
      },
      onAudio: (b64) => {
        lastModelAudioAtRef.current = Date.now();
        player.enqueue(b64);
      },
      onUserText: (t) => {
        if (pendingRef.current.client) flush();
        pendingRef.current.user += t;
      },
      onModelText: (t) => {
        if (pendingRef.current.user) flush();
        pendingRef.current.client += t;
      },
      onTurnEnd: () => flush(),
      onInterrupted: () => {
        flush();
        playerRef.current?.flush();
      },
      onError: () => setStatus('error'),
      onClose: () => {
        // WS died (network drop / server session cap). If we were live,
        // end gracefully so the transcript still gets saved + analyzed
        // instead of losing the whole session to a bare error screen.
        if (endingRef.current) return;
        if (statusRef.current === 'live') {
          endRef.current();
        } else {
          setStatus('error');
        }
      },
    });
    sessionRef.current = session;

    // Mic permission is a runtime dialog on Android — request it BEFORE
    // connecting, otherwise the recorder hangs and the call never starts.
    let cancelled = false;
    (async () => {
      const perm = await requestRecordingPermissionsAsync();
      if (cancelled) return;
      if (!perm.granted) {
        setErrMsg('Cần quyền micro để luyện nói — bật trong Cài đặt thiết bị.');
        setStatus('error');
        return;
      }
      session.connect(apiKey, scenario.systemPrompt + learnerContext());
    })();

    return () => {
      cancelled = true;
      session.end();
      player.stop();
      // isRecording here is a stale mount-time closure — always attempt
      // the stop so the mic can't keep running after leaving the screen.
      recorder.stopRecording().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Gentle pulse while live — ChatGPT-orb style
  useEffect(() => {
    if (status !== 'live') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [status, pulse]);

  const mm = Math.floor(secondsLeft / 60);
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: scenario?.title ?? 'Practice',
          headerBackVisible: status !== 'live',
        }}
      />

      {(status === 'connecting' || status === 'live' || status === 'error') && (
        <View style={styles.callScreen}>
          <Text style={styles.timer}>
            {status === 'error' ? 'Lỗi kết nối' : `${mm}:${ss}`}
          </Text>
          <Animated.View
            style={[
              styles.orb,
              status === 'live' && { transform: [{ scale: pulse }] },
              status === 'error' && styles.orbError,
            ]}
          >
            {status === 'connecting' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View style={styles.orbInner} />
            )}
          </Animated.View>
          <Text style={styles.statusText}>
            {status === 'connecting' && 'Đang kết nối...'}
            {status === 'live' && 'Đang nghe — cứ nói'}
            {status === 'error' && (errMsg ?? 'Không kết nối được. Kiểm tra API key / mạng.')}
          </Text>
          <Pressable style={styles.endBtn} onPress={status === 'error' ? () => router.back() : endCall}>
            <Text style={styles.endBtnText}>{status === 'error' ? 'Quay lại' : 'Kết thúc'}</Text>
          </Pressable>
        </View>
      )}

      {status === 'analyzing' && (
        <View style={styles.callScreen}>
          <ActivityIndicator size="large" color="#111" />
          <Text style={styles.statusText}>Đang chấm bài...</Text>
        </View>
      )}

      {status === 'done' && (
        <ScrollView contentContainerStyle={styles.review}>
          <View style={styles.reviewHead}>
            <Text style={styles.reviewTitle}>Đánh giá</Text>
            {earned && (
              <Reanimated.Text entering={ZoomIn.delay(300).springify().damping(10)} style={styles.coinEarn}>
                +10 xu
              </Reanimated.Text>
            )}
          </View>

          {result ? (
            <>
              {result.overall_comment_vi ? (
                <Text style={styles.comment}>{result.overall_comment_vi}</Text>
              ) : null}

              {(result.errors ?? []).length > 0 && (
                <>
                  <Text style={styles.section}>Lỗi cần sửa</Text>
                  {result.errors.map((e, i) => (
                    <View key={i} style={styles.errorRow}>
                      <Text style={styles.said}>{e.said}</Text>
                      <Text style={styles.correct}>{e.correct}</Text>
                      {e.note_vi ? <Text style={styles.note}>{e.note_vi}</Text> : null}
                    </View>
                  ))}
                </>
              )}

              {(result.vocab ?? []).length > 0 && (
                <>
                  <Text style={styles.section}>Từ mới đã lưu</Text>
                  {result.vocab.map((v, i) => (
                    <View key={i} style={styles.errorRow}>
                      <Text style={styles.correct}>{v.term}</Text>
                      <Text style={styles.note}>
                        {v.meaning_vi}
                        {v.example ? ` — ${v.example}` : ''}
                      </Text>
                    </View>
                  ))}
                </>
              )}
            </>
          ) : (
            <Text style={styles.comment}>
              Không chấm được bài (phiên quá ngắn hoặc lỗi API). Transcript vẫn đã lưu.
            </Text>
          )}

          {audioUri ? (
            <View style={styles.replay}>
              <AudioPlayButton uri={audioUri} label="Nghe lại phiên" />
            </View>
          ) : null}

          <Pressable style={styles.doneBtn} onPress={() => router.back()}>
            <Text style={styles.doneBtnText}>Xong</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  callScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
  },
  timer: {
    fontSize: 15,
    color: '#999',
    fontVariant: ['tabular-nums'],
    fontFamily: F.medium,
    marginBottom: 48,
  },
  orb: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbInner: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#111',
  },
  orbError: { backgroundColor: '#ddd' },
  statusText: { marginTop: 48, fontSize: 15, color: '#888', fontFamily: F.regular },
  endBtn: {
    position: 'absolute',
    bottom: 48,
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d4d4d4',
  },
  endBtnText: { fontSize: 16, color: '#111', fontFamily: F.medium },
  review: { padding: 24, paddingBottom: 48 },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  reviewTitle: { fontSize: 24, fontFamily: F.bold, color: '#111' },
  coinEarn: { fontSize: 14, fontFamily: F.bold, color: '#92400e' },
  comment: { fontSize: 15, color: '#333', lineHeight: 22, fontFamily: F.regular },
  section: {
    fontSize: 12,
    fontFamily: F.bold,
    color: '#a1a1aa',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    marginTop: 28,
    marginBottom: 8,
  },
  errorRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
    gap: 3,
  },
  said: { fontSize: 15, color: '#999', textDecorationLine: 'line-through', fontFamily: F.regular },
  correct: { fontSize: 15, color: '#111', fontFamily: F.regular },
  note: { fontSize: 13, color: '#888', marginTop: 2, fontFamily: F.regular },
  replay: { marginTop: 24 },
  doneBtn: {
    marginTop: 36,
    alignSelf: 'center',
    backgroundColor: '#111',
    paddingVertical: 14,
    paddingHorizontal: 56,
    borderRadius: 999,
  },
  doneBtnText: { color: '#fff', fontSize: 16, fontFamily: F.semibold },
});
