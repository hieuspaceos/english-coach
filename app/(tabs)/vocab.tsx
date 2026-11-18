import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { queries, VocabRow } from '../../src/db/database';
import { F } from '../../src/theme';

export default function VocabScreen() {
  const [due, setDue] = useState<VocabRow[]>([]);
  const [stats, setStats] = useState({ total: 0, due: 0 });
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  const reload = useCallback(() => {
    setDue(queries.listVocabDue());
    setStats(queries.vocabStats());
    setRevealed({});
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const review = (item: VocabRow, remembered: boolean) => {
    queries.markVocabReviewed(item.id, remembered);
    setDue((d) => d.filter((v) => v.id !== item.id));
    setStats((s) => ({ ...s, due: s.due - 1 }));
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={due}
        keyExtractor={(v) => String(v.id)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Text style={styles.hint}>
            {stats.total} từ · {stats.due} đến hạn ôn
          </Text>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="book-outline" size={40} color="#d4d4d4" />
            <Text style={styles.emptyText}>
              {stats.total === 0
                ? 'Chưa có từ nào.\nVocab tự lưu sau mỗi phiên luyện.'
                : 'Hết từ đến hạn. Nghỉ ngơi đi.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.term}>{item.term}</Text>
            {revealed[item.id] ? (
              <>
                <Text style={styles.meaning}>{item.meaning_vi}</Text>
                {item.example ? (
                  <Text style={styles.example}>{item.example}</Text>
                ) : null}
                <View style={styles.actions}>
                  <Pressable onPress={() => review(item, false)}>
                    <Text style={styles.actionMuted}>Quên</Text>
                  </Pressable>
                  <Pressable onPress={() => review(item, true)}>
                    <Text style={styles.actionStrong}>Nhớ</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <Pressable
                onPress={() => setRevealed((r) => ({ ...r, [item.id]: true }))}
              >
                <Text style={styles.reveal}>Xem nghĩa</Text>
              </Pressable>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  hint: { padding: 16, color: '#999', fontSize: 13, fontFamily: F.regular },
  list: { paddingBottom: 32 },
  empty: { alignItems: 'center', marginTop: 100, gap: 12 },
  emptyText: {
    textAlign: 'center',
    color: '#bbb',
    fontSize: 15,
    lineHeight: 24,
    fontFamily: F.regular,
  },
  card: {
    marginHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5e5',
  },
  term: { fontSize: 20, fontFamily: F.semibold, color: '#111' },
  meaning: { fontSize: 15, color: '#333', marginTop: 8, fontFamily: F.regular },
  example: { fontSize: 14, color: '#888', marginTop: 6, fontStyle: 'italic', fontFamily: F.regular },
  reveal: { marginTop: 12, fontSize: 15, color: '#999', fontFamily: F.regular },
  actions: {
    flexDirection: 'row',
    gap: 28,
    marginTop: 14,
  },
  actionMuted: { fontSize: 15, color: '#999', fontFamily: F.regular },
  actionStrong: { fontSize: 15, color: '#111', fontFamily: F.semibold },
});
