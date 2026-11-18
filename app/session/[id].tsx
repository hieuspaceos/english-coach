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
import { getTalkMode } from '../../src/services/gamification';
import { queries } from '../../src/db/database';
import { useCoachStore } from '../../src/state/store';
import { AudioPlayButton } from '../../src/components/AudioPlayButton';
import { Ionicons } from '@expo/vector-icons';
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
  const { id, drill } = useLocalSearchParams<{ id: string; drill?: string }>();
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
  const startedAtRef = useRef(0);
  const sessionIdRef = useRef<number | null>(null);
  const pendingRef = useRef<{ user: string; client: string }>({ user: '', client: '' });
  const linesRef = useRef<Line[]>([]);
  const endingRef = useRef(false);
  const pulse = useRef(new Animated.Value(1)).current;

  // Conversation mode: 'push' = tap Nói/Gửi per turn; 'auto' = server VAD
  // decides turn ends and the mic self-mutes while the model speaks.
  const talkMode = useMemo(() => getTalkMode(), []);
  const pushToTalkRef = useRef(talkMode === 'push');
  const [talking, setTalking] = useState(false);
  const talkingRef = useRef(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const aiSpeakingRef = useRef(false);
  const lastModelAudioAtRef = useRef(0);
  const dropAudioRef = useRef(false);
  const [showChat, setShowChat] = useState(false);
  const [chatLines, setChatLines] = useState<Line[]>([]);
  const chatRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const drillMarkedRef = useRef(false);

  const pushLine = useCallback((who: 'user' | 'client', text: string) => {
    const trimmed = text.trim();
    if (trimmed) {
      linesRef.current.push({ who, text: trimmed });
      setChatLines((ls) => [...ls, { who, text: trimmed }]);
    }
  }, []);

  const flush = useCallback(() => {
    for (const who of ['user', 'client'] as const) {
      if (pendingRef.current[who]) {
        pushLine(who, pendingRef.current[who]);
        pendingRef.current[who] = '';
      }
    }
  }, [pushLine]);

  // Press "Nói" → hold a turn; press "Gửi" → turn ends, model responds.
  const toggleTalk = useCallback(() => {
    const session = sessionRef.current;
    if (!session || statusRef.current !== 'live') return;
    if (talkingRef.current) {
      talkingRef.current = false;
      setTalking(false);
      session.activityEnd();
      flush();
    } else {
      // Deliberate barge-in: cut the model off, then take the floor.
      playerRef.current?.flush();
      aiSpeakingRef.current = false;
      setAiSpeaking(false);
      talkingRef.current = true;
      setTalking(true);
      dropAudioRef.current = true; // stale chunks of the cut turn must not play later
      session.activityStart();
    }
  }, [flush]);

  // Auto mode: drop the model's voice so the learner can take the floor.
  // dropAudioRef keeps muting the tail of the interrupted turn — chunks keep
  // arriving server-side until its turnComplete, and must never be heard.
  const barge = useCallback(() => {
    playerRef.current?.flush();
    dropAudioRef.current = true;
    aiSpeakingRef.current = false;
    setAiSpeaking(false);
  }, []);

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
      // +10 only for a real practice call — the learner must actually have
      // said something (a silent 30s in a deleted session farms nothing).
      const saidSomething = linesRef.current.some((l) => l.who === 'user');
      if (durationSec >= 30 && saidSomething) {
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
        // AI output is untrusted — a missing field must not throw into
        // NOT NULL columns and wedge this screen on "analyzing" forever.
        try {
          queries.saveAnalysis(sid, JSON.stringify(analysis));
          for (const e of analysis.errors ?? []) {
            if (!e?.said || !e?.correct) continue;
            queries.insertError(
              sid, e.key ?? null, e.said, e.correct,
              e.category ?? 'other', e.note_vi ?? null,
            );
          }
          for (const v of analysis.vocab ?? []) {
            if (!v?.term) continue;
            queries.upsertVocab(
              v.term.trim().toLowerCase(), v.meaning_vi ?? '', v.example ?? null, sid,
            );
          }
        } catch (e) {
          console.warn('[session] saving analysis failed:', e);
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
    const player = new PcmPlayer(24000);
    playerRef.current = player;

    const session = new GeminiLiveSession({
      onReady: async () => {
        // A resumed socket fires onReady again — the recorder and the DB
        // row already exist, so just let the call continue. But release the
        // mic gate first: if the old socket died mid-model-turn, no
        // turnComplete is coming to clear it, and the learner would be
        // muted behind a phantom "AI speaking" state.
        if (statusRef.current === 'live') {
          aiSpeakingRef.current = false;
          setAiSpeaking(false);
          dropAudioRef.current = false;
          lastModelAudioAtRef.current = 0;
          return;
        }
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
              if (pushToTalkRef.current) {
                // Push-to-talk: mic streams only while the user holds a turn.
                if (!talkingRef.current) return;
              } else {
                // Free-flow: a real conversation never overlaps — while the
                // model talks (or just did), the mic stays muted. AEC covers
                // whatever echo the mute doesn't reach.
                if (
                  aiSpeakingRef.current ||
                  player.isBusy ||
                  Date.now() - lastModelAudioAtRef.current < 800
                )
                  return;
              }
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
          // Duration is measured from here — connect time must not count
          // toward the +10 coin threshold.
          startedAtRef.current = Date.now();
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
        const now = Date.now();
        // Push-mode barge-in: drop the model's voice while the user talks.
        if (talkingRef.current) return;
        if (dropAudioRef.current) {
          if (now - lastModelAudioAtRef.current < 1500) {
            // Still the interrupted turn's tail — keep dropping.
            lastModelAudioAtRef.current = now;
            return;
          }
          dropAudioRef.current = false; // old turn went silent — this is a new one
        }
        lastModelAudioAtRef.current = now;
        aiSpeakingRef.current = true;
        setAiSpeaking(true);
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
      onTurnEnd: () => {
        flush();
        dropAudioRef.current = false;
        aiSpeakingRef.current = false;
        setAiSpeaking(false);
      },
      onInterrupted: () => {
        flush();
        dropAudioRef.current = false;
        aiSpeakingRef.current = false;
        setAiSpeaking(false);
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
    }, pushToTalkRef.current);
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
      // Drill mode ("luyện lại theo dàn ý"): feed the saved outline back into
      // the partner's brief so it steers the conversation through each step.
      let prompt = scenario.systemPrompt + learnerContext();
      if (drill) {
        let outline: { step_vi: string; en: string }[] = [];
        try {
          outline = JSON.parse(queries.getSession(Number(drill))?.analysis_json ?? 'null')
            ?.outline ?? [];
        } catch {}
        if (outline.length) {
          prompt +=
            '\n\nThe student is re-practicing with this answer outline:\n' +
            outline.map((o, i) => `${i + 1}. ${o.step_vi} — e.g. "${o.en}"`).join('\n') +
            '\nGuide the conversation so they can deliver each step in order — ' +
            'ask the questions a real client or interviewer would ask to hit ' +
            'each step. If they skip a step, gently prompt for it. Stay in ' +
            'character; do not recite the outline.';
        }
      }
      session.connect(apiKey, prompt);
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

  // Drill mode: show the outline as a marked first line in the chat strip.
  // Deliberately NOT pushed to linesRef — it isn't speech, so it must stay
  // out of the saved transcript the analyzer scores.
  useEffect(() => {
    if (!drill || drillMarkedRef.current) return;
    let outline: { step_vi: string; en: string }[] = [];
    try {
      outline = JSON.parse(
        queries.getSession(Number(drill))?.analysis_json ?? 'null',
      )?.outline ?? [];
    } catch {}
    if (outline.length) {
      drillMarkedRef.current = true;
      setChatLines([
        {
          who: 'client',
          text:
            '🎯 Luyện theo dàn ý: ' +
            outline.map((o, i) => `${i + 1}. ${o.step_vi}`).join(' | '),
        },
      ]);
    }
  }, [drill]);

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

  // Clamp at 0 — the auto-end effect fires one frame after the last tick,
  // and -1 would flash as "-1:-1" first.
  const mm = Math.floor(Math.max(0, secondsLeft) / 60);
  const ss = String(Math.max(0, secondsLeft) % 60).padStart(2, '0');

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
            ) : null}
          </Animated.View>
          <Text style={styles.statusText}>
            {status === 'connecting' && 'Đang kết nối...'}
            {status === 'live' &&
              (pushToTalkRef.current
                ? talking
                  ? 'Đang ghi — bấm Gửi khi xong'
                  : aiSpeaking
                    ? 'AI đang nói...'
                    : 'Bấm Nói rồi trả lời'
                : aiSpeaking
                  ? 'AI đang nói...'
                  : 'Đang nghe — cứ nói tự nhiên')}
            {status === 'error' && (errMsg ?? 'Không kết nối được. Kiểm tra API key / mạng.')}
          </Text>
          {status === 'live' && showChat && (
            <ScrollView
              ref={chatRef}
              style={styles.chatBox}
              nestedScrollEnabled
              onContentSizeChange={() => chatRef.current?.scrollToEnd({ animated: false })}
            >
              {chatLines.map((l, i) => (
                <Text key={i} style={styles.chatLine}>
                  <Text style={l.who === 'user' ? styles.chatWhoUser : styles.chatWhoClient}>
                    {l.who === 'user' ? 'Bạn: ' : 'Khách: '}
                  </Text>
                  {l.text}
                </Text>
              ))}
            </ScrollView>
          )}
          {status === 'error' ? (
            <Pressable style={styles.endBtn} onPress={() => router.back()}>
              <Text style={styles.endBtnText}>Quay lại</Text>
            </Pressable>
          ) : (
            <>
              {pushToTalkRef.current ? (
                <Pressable style={[styles.talkBtn, talking && styles.talkBtnOn]} onPress={toggleTalk}>
                  <Ionicons name={talking ? 'send' : 'mic'} size={20} color="#fff" />
                  <Text style={styles.talkBtnText}>{talking ? 'Gửi' : 'Nói'}</Text>
                </Pressable>
              ) : (
                aiSpeaking && (
                  <Pressable style={styles.talkBtn} onPress={barge}>
                    <Ionicons name="hand-left" size={20} color="#fff" />
                    <Text style={styles.talkBtnText}>Ngắt lời</Text>
                  </Pressable>
                )
              )}
              <View style={styles.ctrlRow}>
                <Pressable style={styles.ctrlBtn} onPress={() => setShowChat((v) => !v)}>
                  <Ionicons
                    name={showChat ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'}
                    size={17}
                    color={showChat ? '#111' : '#999'}
                  />
                  <Text style={[styles.ctrlText, showChat && { color: '#111' }]}>Chat</Text>
                </Pressable>
                <Pressable style={styles.ctrlBtn} onPress={endCall}>
                  <Ionicons name="call-outline" size={17} color="#999" />
                  <Text style={styles.ctrlText}>Kết thúc</Text>
                </Pressable>
              </View>
            </>
          )}
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

              {(result.outline ?? []).length > 0 && (
                <>
                  <Text style={styles.section}>Dàn ý để luyện lại</Text>
                  {result.outline!.map((o, i) => (
                    <View key={i} style={styles.errorRow}>
                      <Text style={styles.note}>
                        {i + 1}. {o.step_vi}
                      </Text>
                      <Text style={styles.correct}>{o.en}</Text>
                      {o.up ? <Text style={styles.up}>↳ {o.up}</Text> : null}
                    </View>
                  ))}
                </>
              )}
            </>
          ) : (
            <Text style={styles.comment}>
              {sessionIdRef.current == null
                ? 'Phiên chưa kết nối được — chưa có gì để chấm.'
                : 'Không chấm được bài (phiên quá ngắn hoặc lỗi API). Transcript vẫn đã lưu.'}
            </Text>
          )}

          {audioUri ? (
            <View style={styles.replay}>
              <AudioPlayButton uri={audioUri} label="Nghe lại phiên" />
            </View>
          ) : null}

          {(result?.outline?.length ?? 0) > 0 && sessionIdRef.current != null && (
            <Pressable
              style={styles.drillBtn}
              onPress={() =>
                router.push(`/session/${id}?drill=${sessionIdRef.current}`)
              }
            >
              <Text style={styles.drillBtnText}>🔁 Luyện lại theo dàn ý</Text>
            </Pressable>
          )}

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
  orbError: { backgroundColor: '#ddd' },
  statusText: { marginTop: 48, fontSize: 15, color: '#888', fontFamily: F.regular },
  talkBtn: {
    marginTop: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 40,
    paddingVertical: 17,
    borderRadius: 34,
    backgroundColor: '#111',
  },
  talkBtnOn: { backgroundColor: '#E53935' },
  talkBtnText: { fontSize: 17, color: '#fff', fontFamily: F.semibold },
  ctrlRow: { flexDirection: 'row', gap: 32, marginTop: 22 },
  ctrlBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 },
  ctrlText: { fontSize: 14, color: '#999', fontFamily: F.medium },
  chatBox: {
    marginTop: 24,
    maxHeight: 220,
    width: '100%',
    backgroundColor: '#F6F6F3',
    borderRadius: 14,
    padding: 14,
  },
  chatLine: { fontSize: 14, color: '#333', fontFamily: F.regular, lineHeight: 20, marginBottom: 8 },
  chatWhoUser: { fontFamily: F.semibold, color: '#111' },
  chatWhoClient: { fontFamily: F.semibold, color: '#999' },
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
  up: { fontSize: 13, color: '#0a7', marginTop: 3, fontStyle: 'italic', fontFamily: F.regular },
  replay: { marginTop: 24 },
  drillBtn: {
    marginTop: 28,
    alignSelf: 'center',
    backgroundColor: '#111',
    paddingHorizontal: 28,
    paddingVertical: 13,
    borderRadius: 999,
  },
  drillBtnText: { color: '#fff', fontSize: 15, fontFamily: F.bold },
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
