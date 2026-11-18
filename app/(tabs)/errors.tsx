import { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { queries, StoredError } from '../../src/db/database';
import { F } from '../../src/theme';

export default function ErrorsScreen() {
  const [errors, setErrors] = useState<StoredError[]>([]);

  useFocusEffect(
    useCallback(() => {
      setErrors(queries.listRecurringErrors());
    }, []),
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={errors}
        keyExtractor={(e, i) => `${e.err_key}|${e.said}|${i}`}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          errors.length > 0 ? (
            <Text style={styles.hint}>Lỗi lặp ≥3 lần = bài grammar cần học tiếp.</Text>
          ) : undefined
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="checkmark-circle-outline" size={40} color="#d4d4d4" />
            <Text style={styles.emptyText}>
              Chưa có lỗi nào.{'\n'}Luyện một phiên rồi quay lại đây.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowText}>
              {item.err_key ? <Text style={styles.tag}>{item.err_key}</Text> : null}
              <Text style={styles.said}>{item.said}</Text>
              <Text style={styles.correct}>{item.correct}</Text>
            </View>
            <Text style={[styles.count, item.occurrences >= 3 && styles.countHot]}>
              ×{item.occurrences}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  hint: { padding: 16, color: '#999', fontSize: 13, fontFamily: F.regular },
  list: { paddingVertical: 4 },
  empty: { alignItems: 'center', marginTop: 100, gap: 12 },
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
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5e5',
  },
  rowText: { flex: 1, gap: 2 },
  tag: { fontSize: 12, color: '#aaa', letterSpacing: 0.3, fontFamily: F.regular },
  said: { fontSize: 15, color: '#999', textDecorationLine: 'line-through', fontFamily: F.regular },
  correct: { fontSize: 15, color: '#111', fontFamily: F.regular },
  count: { fontSize: 14, color: '#bbb', fontVariant: ['tabular-nums'], fontFamily: F.medium },
  countHot: { color: '#dc2626', fontFamily: F.bold },
});
