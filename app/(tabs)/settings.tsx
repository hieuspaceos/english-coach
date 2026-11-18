import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { setApiKey } from '../../src/services/apiKey';
import { queries } from '../../src/db/database';
import { useCoachStore } from '../../src/state/store';
import {
  getDailyGoal,
  setDailyGoal,
  getReminderHour,
  setReminderHour,
  getTalkMode,
  setTalkMode,
  TalkMode,
} from '../../src/services/gamification';
import { syncPracticeReminder } from '../../src/services/reminders';
import { FIELDS, getUserField, getUserName, getUserSubfield, setUserProfile } from '../../src/services/profile';
import { F } from '../../src/theme';

export default function SettingsScreen() {
  const apiKey = useCoachStore((s) => s.apiKey);
  const setKey = useCoachStore((s) => s.setApiKey);
  const [value, setValue] = useState(apiKey ?? '');
  const [saved, setSaved] = useState(false);
  const [hour, setHour] = useState(getReminderHour());
  const [goal, setGoal] = useState(getDailyGoal());
  const [mode, setMode] = useState<TalkMode>(getTalkMode());
  const [profileName, setProfileName] = useState(getUserName() ?? '');
  const [profileField, setProfileField] = useState(getUserField()?.id ?? null);
  const [profileSub, setProfileSub] = useState(getUserSubfield()?.id ?? null);
  const field = FIELDS.find((f) => f.id === profileField) ?? null;

  // Key loads async from SecureStore — fill the field if it arrives
  // after this screen has already mounted.
  useEffect(() => {
    if (apiKey) setValue(apiKey);
  }, [apiKey]);

  const save = async () => {
    try {
      await setApiKey(value);
    } catch {
      Alert.alert('Lỗi', 'Không lưu được key vào SecureStore.');
      return;
    }
    setKey(value.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const changeHour = (delta: number) => {
    const h = (hour + delta + 24) % 24;
    setHour(h);
    setReminderHour(h);
    void syncPracticeReminder(); // re-plan around the new time immediately
  };

  const changeGoal = (g: number) => {
    setGoal(g);
    setDailyGoal(g);
    void syncPracticeReminder();
  };

  const saveProfile = (name: string, fieldId: string | null, subId: string | null) => {
    if (name.trim() && fieldId && subId) setUserProfile(name, fieldId, subId);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView keyboardShouldPersistTaps="handled">
        <Text style={styles.section}>Hồ sơ</Text>
        <Text style={styles.label}>Tên</Text>
        <TextInput
          style={styles.input}
          value={profileName}
          onChangeText={setProfileName}
          onEndEditing={() => saveProfile(profileName, profileField, profileSub)}
          placeholder="Tên của bạn"
          autoCapitalize="words"
          autoCorrect={false}
        />
        <Text style={styles.label}>Lĩnh vực — AI vào vai đúng nghề này</Text>
        <View style={styles.fieldChips}>
          {FIELDS.map((f) => (
            <Pressable
              key={f.id}
              style={[styles.chip, profileField === f.id && styles.chipOn]}
              onPress={() => {
                setProfileField(f.id);
                setProfileSub(null); // re-pick sub for the new field
              }}
            >
              <Text style={[styles.chipText, profileField === f.id && styles.chipTextOn]}>
                {f.vi}
              </Text>
            </Pressable>
          ))}
        </View>
        {field && (
          <View style={[styles.fieldChips, { marginTop: 10 }]}>
            {field.subs.map((s) => (
              <Pressable
                key={s.id}
                style={[styles.chip, profileSub === s.id && styles.chipOn]}
                onPress={() => {
                  setProfileSub(s.id);
                  saveProfile(profileName, field.id, s.id);
                }}
              >
                <Text style={[styles.chipText, profileSub === s.id && styles.chipTextOn]}>
                  {s.vi}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <Text style={styles.section}>API</Text>
        <Text style={styles.label}>Gemini API key</Text>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={setValue}
          placeholder="Dán key vào đây (dạng AIza...)"
          autoCapitalize="none"
          autoCorrect={false}
          // visible-password disables IME composing/suggestions on Android —
          // a Vietnamese Telex keyboard would otherwise mangle the key
          // ("Mas" → "Má") and the call fails with a confusing connect error.
          keyboardType="visible-password"
        />
        <Pressable style={styles.btn} onPress={save}>
          <Text style={styles.btnText}>{saved ? 'Đã lưu ✓' : 'Lưu'}</Text>
        </Pressable>
        <Text style={styles.note}>
          Lấy key miễn phí tại aistudio.google.com — key chỉ lưu trong
          SecureStore trên máy, không gửi đi đâu ngoài Google.
        </Text>

        <Text style={styles.section}>Nhắc luyện</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Giờ nhắc mỗi ngày</Text>
          <View style={styles.stepper}>
            <Pressable style={styles.stepBtn} onPress={() => changeHour(-1)}>
              <Text style={styles.stepBtnText}>−</Text>
            </Pressable>
            <Text style={styles.stepVal}>{String(hour).padStart(2, '0')}:00</Text>
            <Pressable style={styles.stepBtn} onPress={() => changeHour(1)}>
              <Text style={styles.stepBtnText}>+</Text>
            </Pressable>
          </View>
        </View>
        <Text style={styles.note}>
          Nhắc đúng 1 lần/ngày — hôm nay đã luyện xong thì không làm phiền.
        </Text>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Kiểu hội thoại</Text>
          <View style={styles.chips}>
            {(
              [
                ['push', 'Bấm nút'],
                ['auto', 'Tự do'],
              ] as [TalkMode, string][]
            ).map(([m, label]) => (
              <Pressable
                key={m}
                style={[styles.chip, mode === m && styles.chipOn]}
                onPress={() => {
                  setMode(m);
                  setTalkMode(m);
                }}
              >
                <Text style={[styles.chipText, mode === m && styles.chipTextOn]}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <Text style={styles.note}>
          Bấm nút: Nói → Gửi từng lượt, chắc chắn không bị cắt. Tự do: nói liên
          tục, app tự nhận khi bạn dừng — nghe tự nhiên hơn nhưng cần chống vọng
          loa (đã bật AEC; nếu thấy AI bị ngắt thì quay lại Bấm nút).
        </Text>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Mục tiêu mỗi ngày</Text>
          <View style={styles.chips}>
            {[1, 2, 3].map((g) => (
              <Pressable
                key={g}
                style={[styles.chip, goal === g && styles.chipOn]}
                onPress={() => changeGoal(g)}
              >
                <Text style={[styles.chipText, goal === g && styles.chipTextOn]}>
                  {g} phiên
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <Text style={styles.note}>
          Ngày chỉ được tính chuỗi khi hoàn thành đủ số phiên — giống XP goal
          của Duolingo. Tăng lên khi đã quen nhịp.
        </Text>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Dữ liệu</Text>
          <Pressable
            style={styles.resetBtn}
            onPress={() =>
              Alert.alert(
                'Xóa lịch sử luyện tập?',
                'Toàn bộ phiên, lỗi đã lưu, từ vựng, pitch và xu sẽ mất. API key, hồ sơ và cài đặt giữ nguyên.',
                [
                  { text: 'Hủy', style: 'cancel' },
                  {
                    text: 'Xóa hết',
                    style: 'destructive',
                    onPress: () => {
                      queries.resetProgress();
                      useCoachStore.getState().setCoins(0);
                    },
                  },
                ],
              )
            }
          >
            <Text style={styles.resetText}>Xóa lịch sử luyện tập</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  label: { fontSize: 13, color: '#999', marginBottom: 8, paddingHorizontal: 24, marginTop: 32, fontFamily: F.regular },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d4d4d4',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111',
    marginHorizontal: 24,
    fontFamily: F.regular,
  },
  btn: {
    marginTop: 16,
    marginHorizontal: 24,
    backgroundColor: '#111',
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontSize: 15, fontFamily: F.semibold },
  section: {
    fontSize: 12,
    fontFamily: F.bold,
    color: '#a1a1aa',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginTop: 40,
    marginBottom: 4,
    paddingHorizontal: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 14,
    marginTop: 12,
  },
  rowLabel: { fontSize: 16, color: '#111', fontFamily: F.regular },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d4d4d4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { fontSize: 20, color: '#111', lineHeight: 22, fontFamily: F.regular },
  stepVal: { fontSize: 18, fontFamily: F.semibold, color: '#111', fontVariant: ['tabular-nums'] },
  chips: { flexDirection: 'row', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#d4d4d4',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  chipOn: { backgroundColor: '#111', borderColor: '#111' },
  chipText: { fontSize: 14, color: '#666', fontFamily: F.regular },
  chipTextOn: { color: '#fff', fontFamily: F.semibold },
  fieldChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 24 },
  note: { marginTop: 12, fontSize: 13, color: '#aaa', lineHeight: 19, paddingHorizontal: 24, marginBottom: 24, fontFamily: F.regular },
  resetBtn: {
    borderWidth: 1,
    borderColor: '#E53935',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  resetText: { fontSize: 14, color: '#E53935', fontFamily: F.medium },
});
