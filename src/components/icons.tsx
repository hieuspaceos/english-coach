import Svg, { Path, Rect, Text as SvgText } from 'react-native-svg';

/** Shield badge with the rank letter — the gamification medal. */
export function BadgeIcon({
  rank,
  color,
  size = 56,
  dim = false,
}: {
  rank: string;
  color: string;
  size?: number;
  /** Lost-streak state: washed-out badge. */
  dim?: boolean;
}) {
  const fill = dim ? '#d4d4d4' : color;
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Path
        d="M32 2 L58 13 V33 C58 49 47 58 32 62 C17 58 6 49 6 33 V13 Z"
        fill={fill}
        opacity={dim ? 0.45 : 1}
      />
      <Path
        d="M32 8 L52 16.5 V33 C52 45.5 44 52.5 32 56 C20 52.5 12 45.5 12 33 V16.5 Z"
        fill="none"
        stroke="#fff"
        strokeOpacity={dim ? 0.4 : 0.35}
        strokeWidth={2}
      />
      <SvgText
        x="32"
        y="41"
        textAnchor="middle"
        fill="#fff"
        fontSize="21"
        fontFamily="BeVietnamPro_800ExtraBold"
      >
        {rank}
      </SvgText>
    </Svg>
  );
}

/** Small coin — the virtual-currency marker in the header chip. */
export function CoinIcon({ size = 12 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Path d="M32 4 C47 4 60 17 60 32 C60 47 47 60 32 60 C17 60 4 47 4 32 C4 17 17 4 32 4 Z" fill="#f59e0b" />
      <Path d="M32 12 C43 12 52 21 52 32 C52 43 43 52 32 52 C21 52 12 43 12 32 C12 21 21 12 32 12 Z" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="4" />
      <SvgText x="32" y="42" textAnchor="middle" fill="#fff" fontSize="26" fontFamily="BeVietnamPro_800ExtraBold">$</SvgText>
    </Svg>
  );
}

/** Voice waveform — the app's mark: 5 bars, gold center (the coin accent). */
export function WaveformIcon({ size = 28 }: { size?: number }) {
  // Same proportions as the launcher icon: w=5.25/bar on a 64-grid.
  const heights = [11, 18, 26, 18, 11];
  const bw = 5.25;
  const gap = 2.75;
  const total = heights.length * bw + (heights.length - 1) * gap;
  const x0 = 32 - total / 2;
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      {heights.map((h, i) => (
        <Rect
          key={i}
          x={x0 + i * (bw + gap)}
          y={32 - h / 2}
          width={bw}
          height={h}
          rx={bw / 2}
          fill={i === 2 ? '#f59e0b' : '#fff'}
        />
      ))}
    </Svg>
  );
}

/** Classic streak flame. */
export function FlameIcon({
  size = 20,
  color = '#111',
}: {
  size?: number;
  color?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Path
        d="M32 4 C37 14 47 19 47 31 C47 43 40 50 32 50 C24 50 17 43 17 31
           C17 23 22 17 25 11 C25.5 17 28 20 30.5 20 C33 16 33.5 9 32 4 Z"
        fill={color}
      />
      <Path
        d="M32 30 C34.5 35 38 37 38 42 C38 47 35 50 32 50 C29 50 26 47 26 42
           C26 38 29 35 30 32 C30.5 35 31.5 36 32 30 Z"
        fill="#fff"
        opacity={0.85}
      />
    </Svg>
  );
}
