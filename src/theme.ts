/**
 * Design tokens — Be Vietnam Pro is registered per-weight by expo-font,
 * so `fontFamily` (not `fontWeight`) carries the weight. Keep
 * `fontVariant: ['tabular-nums']` anywhere numbers must line up.
 */
export const F = {
  regular: 'BeVietnamPro_400Regular',
  medium: 'BeVietnamPro_500Medium',
  semibold: 'BeVietnamPro_600SemiBold',
  bold: 'BeVietnamPro_700Bold',
  extrabold: 'BeVietnamPro_800ExtraBold',
} as const;

/** Soft elevation for floating surfaces — low opacity, wide radius. */
export const SOFT_SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.07,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
} as const;
