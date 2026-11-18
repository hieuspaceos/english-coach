import { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CATEGORIES, SCENARIOS, Scenario } from '../../src/scenarios';
import { generateScenario, buildSystemPrompt } from '../../src/services/generateScenario';
import { queries } from '../../src/db/database';
import { useCoachStore } from '../../src/state/store';
import { F } from '../../src/theme';

export default function CategoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const category = CATEGORIES.find((c) => c.id === id);
  const router = useRouter();
  const apiKey = useCoachStore((s) => s.apiKey);
  const [custom, setCustom] = useState<Scenario[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [topic, setTopic] = useState('');
  const [generating, setGenerating] = useState(false);
  const navLock = useRef(false);

  const openSession = (sid: string) => {
    if (navLock.current) return;
    navLock.current = true;
    if (apiKey) {
      router.push(`/session/${sid}`);
    } else {
      router.push('/(tabs)/settings');
    }
    setTimeout(() => (navLock.current = false), 800);
  };

  const reload = useCallback(() => {
    setCustom(
      queries.listCustomScenarios(id).map((c) => ({
        id: c.id,
        category: c.category,
        title: c.title,
        titleVi: c.title_vi,
        skill: c.skill,
        systemPrompt: c.system_prompt,
      })),
    );
    setCounts(queries.scenarioCounts());
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const scenarios = [
    ...custom,
    ...SCENARIOS.filter((s) => s.category === id),
  ];

  const generate = async () => {
    const t = topic.trim();
    if (!t) return;
    if (!apiKey) {
      router.push('/(tabs)/settings');
      return;
    }
    setGenerating(true);
    try {
      const g = await generateScenario(apiKey, t, category?.titleEn);
      if (!g) {
        Alert.alert('Lỗi', 'Không sinh được bài luyện. Thử lại với chủ đề khác.');
        return;
      }
      queries.insertCustomScenario(
        `custom-${Date.now()}`, id!, g.title, g.title_vi, g.skill,
        buildSystemPrompt(g.client_persona),
      );
      setTopic('');
      reload();
    } catch {
      Alert.alert('Lỗi', 'Không sinh được bài luyện. Kiểm tra mạng rồi thử lại.');
    } finally {
      setGenerating(false);
    }
  };

  const removeCustom = (s: Scenario) => {
    if (!s.id.startsWith('custom-')) return;
    Alert.alert('Xóa bài luyện?', s.title, [
      { text: 'Giữ', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: () => {
          queries.deleteCustomScenario(s.id);
          reload();
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: category?.titleVi ?? 'Luyện' }} />
      <FlatList
        data={scenarios}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Text style={styles.hint}>
            Chọn một tình huống để bắt đầu nói — 20 phút, xong xem đánh giá.
            {'\n'}Mục "đã luyện" hết rồi thì gõ tình huống mới ở ô dưới.
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => openSession(item.id)}
            onLongPress={() => removeCustom(item)}
          >
            <View style={styles.rowText}>
              <Text style={styles.title}>
                {item.title}
                {item.id.startsWith('custom-') ? ' ·' : ''}
              </Text>
              <Text style={styles.sub}>{item.titleVi}</Text>
            </View>
            {counts[item.id] ? (
              <Text style={styles.done}>đã luyện ×{counts[item.id]}</Text>
            ) : null}
            <Ionicons name="mic-outline" size={17} color="#c7c7c7" style={styles.mic} />
          </Pressable>
        )}
      />
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={topic}
          onChangeText={setTopic}
          placeholder="Thêm tình huống khác trong mục này..."
          placeholderTextColor="#bbb"
          returnKeyType="send"
          onSubmitEditing={generate}
          editable={!generating}
        />
        <Pressable onPress={generate} disabled={generating || !topic.trim()}>
          {generating ? (
            <ActivityIndicator color="#111" />
          ) : (
            <Text style={[styles.send, !topic.trim() && styles.sendOff]}>→</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  list: { paddingVertical: 4, flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 17,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5e5',
  },
  rowPressed: { backgroundColor: '#f5f5f5' },
  rowText: { flex: 1 },
  title: { fontSize: 16, fontFamily: F.semibold, color: '#111' },
  sub: { fontSize: 13, color: '#888', marginTop: 3, fontFamily: F.regular },
  mic: { marginLeft: 8 },
  hint: { padding: 16, paddingTop: 12, color: '#999', fontSize: 13, lineHeight: 19, fontFamily: F.regular },
  done: { fontSize: 12, color: '#bbb', fontFamily: F.regular },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    paddingLeft: 16,
    paddingRight: 12,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d4d4d4',
  },
  input: { flex: 1, paddingVertical: 13, fontSize: 15, color: '#111', fontFamily: F.regular },
  send: { fontSize: 24, color: '#111', fontFamily: F.regular, paddingHorizontal: 4 },
  sendOff: { color: '#ccc' },
});
