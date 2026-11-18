import { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SCENARIOS } from '../../src/scenarios';
import { queries, SessionRow, PitchRow } from '../../src/db/database';
import { AnalysisResult } from '../../src/services/analyzeSession';
import { AudioPlayButton } from '../../src/components/AudioPlayButton';
import { F } from '../../src/theme';

function scenarioTitle(id: string, customTitles: Record<string, string>): string {
  const builtin = SCENARIOS.find((s) => s.id === id)?.title;
  if (builtin) return builtin;
  if (id.startsWith('custom-')) return customTitles[id] ?? 'Bài luyện tự tạo';
  return id;
}

function parseAnalysis(json: string | null): AnalysisResult | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as AnalysisResult;
  } catch {
    return null;
  }
}

function SessionItem({
  item,
  customTitles,
}: {
  item: SessionRow;
  customTitles: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const analysis = parseAnalysis(item.analysis_json);

  return (
    <View>
      <Pressable style={styles.row} onPress={() => setOpen(!open)}>
        <View style={styles.rowText}>
          <Text style={styles.title}>{scenarioTitle(item.scenario_id, customTitles)}</Text>
          <Text style={styles.sub}>
            {new Date(item.started_at).toLocaleDateString('vi-VN')} ·{' '}
            {Math.round(item.duration_sec / 60)} phút
          </Text>
        </View>
        <Text style={styles.chevron}>{open ? '⌄' : '›'}</Text>
      </Pressable>
      {open && (
        <View style={styles.detail}>
          {analysis?.overall_comment_vi ? (
            <Text style={styles.comment}>{analysis.overall_comment_vi}</Text>
          ) : (
            <Text style={styles.comment}>Chưa có bài chấm cho phiên này.</Text>
          )}
          {(analysis?.errors ?? []).map((e, i) => (
            <View key={i} style={styles.errorRow}>
              <Text style={styles.said}>{e.said}</Text>
              <Text style={styles.correct}>{e.correct}</Text>
            </View>
          ))}
          {(analysis?.outline ?? []).length > 0 && (
            <>
              <Text style={styles.detailSection}>Dàn ý để luyện lại</Text>
              {analysis!.outline!.map((o, i) => (
                <View key={i} style={styles.errorRow}>
                  <Text style={styles.comment}>
                    {i + 1}. {o.step_vi}
                  </Text>
                  <Text style={styles.correct}>{o.en}</Text>
                  {o.up ? <Text style={styles.up}>↳ {o.up}</Text> : null}
                </View>
              ))}
            </>
          )}
          {item.audio_uri ? (
            <View style={styles.replay}>
              <AudioPlayButton uri={item.audio_uri} label="Nghe lại" />
            </View>
          ) : null}
          {item.transcript ? (
            <Pressable
              onPress={() => setShowTranscript(!showTranscript)}
              style={styles.transcriptToggle}
            >
              <Text style={styles.transcriptToggleText}>
                {showTranscript ? 'Ẩn transcript ⌄' : 'Xem transcript ›'}
              </Text>
            </Pressable>
          ) : null}
          {showTranscript && (
            <View style={styles.transcript}>
              {item.transcript
                .split('\n')
                .filter((l) => l.trim())
                .map((line, i) => {
                  const isUser = line.startsWith('User:');
                  const text = line.replace(/^(User|Client):\s*/, '');
                  return (
                    <Text key={i} style={styles.tLine}>
                      <Text style={isUser ? styles.tUser : styles.tClient}>
                        {isUser ? 'Bạn' : 'Khách'}
                      </Text>
                      {'  '}
                      {text}
                    </Text>
                  );
                })}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

export default function HistoryScreen() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [pitches, setPitches] = useState<PitchRow[]>([]);
  const [customTitles, setCustomTitles] = useState<Record<string, string>>({});

  useFocusEffect(
    useCallback(() => {
      setSessions(queries.listSessions());
      setPitches(queries.listPitches(5));
      // Loaded once per focus — scenarioTitle must not hit SQLite per row.
      setCustomTitles(
        Object.fromEntries(
          queries.listCustomScenarios().map((c) => [c.id, c.title]),
        ),
      );
    }, []),
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={sessions}
        keyExtractor={(s) => String(s.id)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            <Pressable
              style={styles.row}
              onPress={() => router.push('/pitch')}
            >
              <View style={styles.rowText}>
                <Text style={styles.title}>Pitch hàng tuần</Text>
                <Text style={styles.sub}>
                  {pitches.length} bản gần nhất · ghi 1 bài/tuần để đo tiến bộ
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
            <Text style={styles.section}>Phiên luyện</Text>
          </>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="time-outline" size={40} color="#d4d4d4" />
            <Text style={styles.emptyText}>
              Chưa có phiên nào.{'\n'}Vào tab Luyện để bắt đầu.
            </Text>
          </View>
        }
        renderItem={({ item }) => <SessionItem item={item} customTitles={customTitles} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  list: { paddingBottom: 32 },
  section: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
    fontSize: 13,
    color: '#999',
    fontFamily: F.regular,
  },
  empty: { alignItems: 'center', marginTop: 60, gap: 12 },
  emptyText: {
    textAlign: 'center',
    color: '#bbb',
    fontSize: 15,
    lineHeight: 24,
    fontFamily: F.regular,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5e5',
  },
  rowText: { flex: 1 },
  title: { fontSize: 16, fontFamily: F.semibold, color: '#111' },
  sub: { fontSize: 13, color: '#888', marginTop: 3, fontFamily: F.regular },
  chevron: { fontSize: 22, color: '#ccc', fontFamily: F.regular },
  detail: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: '#fafafa',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5e5',
  },
  comment: { fontSize: 14, color: '#333', lineHeight: 20, marginBottom: 8, fontFamily: F.regular },
  detailSection: { fontSize: 12, fontWeight: '700', color: '#999', letterSpacing: 1, textTransform: 'uppercase', marginTop: 10, marginBottom: 6, fontFamily: F.bold },
  errorRow: { paddingVertical: 6, gap: 2 },
  said: { fontSize: 14, color: '#999', textDecorationLine: 'line-through', fontFamily: F.regular },
  correct: { fontSize: 14, color: '#111', fontFamily: F.regular },
  up: { fontSize: 13, color: '#0a7', marginTop: 3, fontStyle: 'italic', fontFamily: F.regular },
  replay: { marginTop: 12 },
  transcriptToggle: { marginTop: 12, paddingVertical: 4 },
  transcriptToggleText: { fontSize: 13, color: '#666', fontFamily: F.regular },
  transcript: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5e5',
    gap: 8,
  },
  tLine: { fontSize: 13.5, color: '#333', lineHeight: 20, fontFamily: F.regular },
  tUser: { fontFamily: F.bold, color: '#111' },
  tClient: { fontFamily: F.semibold, color: '#aaa' },
});
