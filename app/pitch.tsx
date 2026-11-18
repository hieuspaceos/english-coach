import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  useAudioRecorder,
  useAudioPlayer,
  RecordingPresets,
  requestRecordingPermissionsAsync,
} from 'expo-audio';
import { queries, PitchRow } from '../src/db/database';
import { F } from '../src/theme';

function PitchItem({ item }: { item: PitchRow }) {
  const player = useAudioPlayer(item.file_uri);
  const [playing, setPlaying] = useState(false);

  // Reset the button when playback finishes on its own.
  useEffect(() => {
    const sub = player.addListener('playbackStatusUpdate', (s) => {
      if (s.didJustFinish) setPlaying(false);
    });
    return () => sub.remove();
  }, [player]);

  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>
          {new Date(item.created_at).toLocaleDateString('vi-VN')}
        </Text>
        <Text style={styles.rowSub}>
          {Math.round(item.duration_sec / 60)} phút
        </Text>
      </View>
      <Pressable
        onPress={() => {
          if (playing) {
            player.pause();
          } else {
            player.seekTo(0);
            player.play();
          }
          setPlaying(!playing);
        }}
      >
        <Text style={styles.playText}>{playing ? 'Dừng' : 'Nghe'}</Text>
      </Pressable>
    </View>
  );
}

export default function PitchScreen() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [items, setItems] = useState<PitchRow[]>([]);
  const startedRef = useRef(0);

  const reload = useCallback(() => {
    setItems(queries.listPitches());
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => {
      setSeconds(Math.round((Date.now() - startedRef.current) / 1000));
    }, 500);
    return () => clearInterval(t);
  }, [recording]);

  const toggle = async () => {
    if (recording) {
      await recorder.stop();
      const uri = recorder.uri;
      if (uri) {
        queries.insertPitch(uri, null, seconds);
      }
      setRecording(false);
      reload();
      return;
    }
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Microphone', 'Cần quyền micro để ghi âm.');
      return;
    }
    await recorder.prepareToRecordAsync();
    recorder.record();
    startedRef.current = Date.now();
    setSeconds(0);
    setRecording(true);
  };

  const mm = Math.floor(seconds / 60);
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <View style={styles.container}>
      <Text style={styles.hint}>
        Mỗi tuần ghi 1 bài pitch 2 phút — nghe lại bản cũ để đo tiến bộ.
      </Text>

      <View style={styles.recorder}>
        <Text style={styles.timer}>{`${mm}:${ss}`}</Text>
        <Pressable
          style={[styles.orb, recording && styles.orbLive]}
          onPress={toggle}
        >
          <Text style={styles.orbText}>{recording ? 'Dừng' : 'Ghi'}</Text>
        </Pressable>
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => String(i.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <PitchItem item={item} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  hint: { padding: 16, color: '#999', fontSize: 13, fontFamily: F.regular },
  recorder: { alignItems: 'center', paddingVertical: 24 },
  timer: {
    fontSize: 15,
    color: '#999',
    fontVariant: ['tabular-nums'],
    fontFamily: F.medium,
    marginBottom: 20,
  },
  orb: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbLive: { backgroundColor: '#dc2626' },
  orbText: { color: '#fff', fontSize: 16, fontFamily: F.semibold },
  list: { paddingBottom: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5e5',
  },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, color: '#111', fontFamily: F.regular },
  rowSub: { fontSize: 13, color: '#999', marginTop: 2, fontFamily: F.regular },
  playText: { fontSize: 15, color: '#2563eb', fontFamily: F.medium },
});
