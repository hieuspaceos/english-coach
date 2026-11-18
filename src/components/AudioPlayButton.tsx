import { useEffect, useState } from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';
import { useAudioPlayer } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { F } from '../theme';

/** Play/stop button for a saved audio file — resets itself on natural finish. */
export function AudioPlayButton({ uri, label }: { uri: string; label: string }) {
  const player = useAudioPlayer(uri);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const sub = player.addListener('playbackStatusUpdate', (s) => {
      if (s.didJustFinish) setPlaying(false);
    });
    return () => sub.remove();
  }, [player]);

  return (
    <Pressable
      style={styles.btn}
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
      <Ionicons
        name={playing ? 'stop' : 'play'}
        size={14}
        color="#fff"
        style={{ marginRight: 6 }}
      />
      <Text style={styles.text}>{playing ? 'Dừng' : label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#111',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
  },
  text: { color: '#fff', fontSize: 14, fontFamily: F.semibold },
});
