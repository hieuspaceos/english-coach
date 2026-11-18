import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { FIELDS, setUserProfile } from '../src/services/profile';
import { F } from '../src/theme';

export default function OnboardingScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [fieldId, setFieldId] = useState<string | null>(null);
  const [subId, setSubId] = useState<string | null>(null);
  const field = FIELDS.find((f) => f.id === fieldId) ?? null;
  const ready = name.trim().length > 0 && fieldId != null && subId != null;

  const start = () => {
    if (!ready) return;
    setUserProfile(name, fieldId!, subId!);
    router.replace('/');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.Text entering={FadeInDown.duration(400)} style={styles.title}>
          English Coach
        </Animated.Text>
        <Animated.Text entering={FadeInDown.delay(100).duration(400)} style={styles.sub}>
          Luyện tiếng Anh qua tình huống công việc thật — nói với khách, không học thuộc.
        </Animated.Text>

        <Animated.View entering={FadeInDown.delay(250).duration(400)}>
          <Text style={styles.label}>Tên của bạn</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Vd: Hiếu"
            autoCapitalize="words"
            autoCorrect={false}
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(400).duration(400)}>
          <Text style={styles.label}>Bạn làm lĩnh vực gì?</Text>
          <View style={styles.chips}>
            {FIELDS.map((f) => (
              <Pressable
                key={f.id}
                style={[styles.chip, fieldId === f.id && styles.chipOn]}
                onPress={() => {
                  setFieldId(f.id);
                  setSubId(null); // re-pick the sub for the new field
                }}
              >
                <Text style={[styles.chipText, fieldId === f.id && styles.chipTextOn]}>
                  {f.vi}
                </Text>
              </Pressable>
            ))}
          </View>
          {field && (
            <Animated.View entering={FadeInDown.duration(300)}>
              <Text style={styles.label}>Cụ thể hơn:</Text>
              <View style={styles.chips}>
                {field.subs.map((s) => (
                  <Pressable
                    key={s.id}
                    style={[styles.chip, subId === s.id && styles.chipOn]}
                    onPress={() => setSubId(s.id)}
                  >
                    <Text style={[styles.chipText, subId === s.id && styles.chipTextOn]}>
                      {s.vi}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Animated.View>
          )}
          <Text style={styles.hint}>
            AI sẽ vào vai khách hàng đúng nghề của bạn — đổi lại được trong Cài đặt.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(550).duration(400)}>
          <Pressable
            style={[styles.btn, !ready && styles.btnOff]}
            onPress={start}
            disabled={!ready}
          >
            <Text style={styles.btnText}>Bắt đầu luyện</Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scroll: { padding: 28, paddingTop: 90 },
  title: { fontSize: 34, fontFamily: F.extrabold, color: '#111', letterSpacing: -0.5 },
  sub: { fontSize: 15, color: '#888', lineHeight: 22, marginTop: 10, marginBottom: 36, fontFamily: F.regular },
  label: { fontSize: 12, fontFamily: F.bold, color: '#a1a1aa', letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 10, marginTop: 24 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d4d4d4',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 17,
    color: '#111',
    fontFamily: F.regular,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#d4d4d4',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  chipOn: { backgroundColor: '#111', borderColor: '#111' },
  chipText: { fontSize: 14, color: '#555', fontFamily: F.regular },
  chipTextOn: { color: '#fff', fontFamily: F.semibold },
  hint: { fontSize: 12, color: '#bbb', marginTop: 12, lineHeight: 17, fontFamily: F.regular },
  btn: {
    marginTop: 44,
    backgroundColor: '#111',
    borderRadius: 999,
    paddingVertical: 15,
    alignItems: 'center',
  },
  btnOff: { backgroundColor: '#d4d4d4' },
  btnText: { color: '#fff', fontSize: 16, fontFamily: F.semibold },
});
