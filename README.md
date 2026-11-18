# English Coach

App luyện nói tiếng Anh cho freelance/remote work — nói chuyện realtime
với AI đóng vai khách hàng, xong được chấm bài (lỗi + từ mới + nhận xét)
và nghe lại bản ghi của cả phiên.

Mở app → chọn tình huống → nói chuyện với AI (tối đa 20 phút) → xem bài
chấm + nghe lại phiên. Tình huống dùng hết thì gõ ý tưởng để AI sinh
tình huống mới.

## Tính năng

- **Call realtime 2 chiều**: mic → Gemini Live → giọng AI qua loa.
  UI tối giản kiểu ChatGPT voice (orb + timer).
- **2 chế độ nói** (đổi trong Cài đặt):
  - *Bấm nút* (mặc định): Nói → Gửi từng lượt bằng `activityStart`/
    `activityEnd`, VAD tắt — AI nhận trọn vẹn lượt rồi mới trả lời.
  - *Tự do*: nói liên tục, server VAD tự nhận hết câu
    (`END_SENSITIVITY_LOW`), AEC phần cứng + gate mic khi AI nói →
    không chồng tiếng; nút "Ngắt lời" để chen chủ động.
- **Chat mode**: nút 💬 trên màn call bật/tắt transcript live
  (mặc định tắt) — transcript vẫn lưu bất kể.
- **Ghi phiên**: cả phiên được ghi ra file `.m4a` — nghe lại cùng
  transcript + lỗi ngay sau call và trong Lịch sử.
- **Chấm bài**: transcript → JSON `{errors, vocab, outline, comment}`
  → lưu DB. Lỗi group theo pattern key để thấy lỗi lặp.
- **Dàn ý luyện lại**: mỗi phiên sinh 4-6 bước theo công thức chuẩn
  của loại tình huống (self-intro = Present→Past→Proof→Future, pitch =
  Problem→Solution→Proof→Ask...), kèm câu mẫu cá nhân hoá từ chính
  nội dung đã nói + phiên bản nâng cấp (`up`). Nút "Luyện lại theo
  dàn ý" mở call mới với outline nạp vào prompt của AI — AI dẫn câu
  hỏi đúng thứ tự các ý.
- **Từ vựng**: lưu từ mới mỗi phiên, ôn theo SRS.
- **Tạo tình huống**: nhập ý tưởng tự do → AI sinh scenario phù hợp
  ngành nghề của bạn.
- **Gamification**: streak, xu, hạng/badge, phạt ngày bỏ lỡ, nhắc giờ
  luyện hằng ngày (cài được giờ + số phiên/ngày).
- **Reset dữ liệu**: nút "Xóa lịch sử luyện tập" trong Cài đặt — xóa
  sessions/lỗi/từ vựng/pitch/xu, giữ API key + hồ sơ + cài đặt.
- **Pitch hàng tuần**: ghi 1 bài pitch/tuần để tự đo tiến bộ.
- **Onboarding**: tên + lĩnh vực + mảng nhỏ → AI vào vai đúng nghề.

## Kiến trúc

- **Realtime voice**: Gemini Live API qua WebSocket
  (`src/services/geminiLive.ts`) — mic PCM16 16kHz lên, PCM16 24kHz về.
  `activityHandling: 'NO_INTERRUPTION'` + `proactivity.proactiveAudio:
  false` + gate mic phía client trong lúc AI nói → tiếng ồn/echo không
  chặt câu của model và model không tự nói tiếp khi im lặng.
- **Mic + ghi file**: `@siteed/audio-studio` — vừa stream PCM vừa ghi
  AAC nén ra file (`output.compressed`). Patch pnpm
  (`patches/@siteed__audio-studio.patch`) đổi `AudioSource.MIC` →
  `VOICE_COMMUNICATION` để Android bật AEC/noise-suppression phần cứng.
- **Playback**: `react-native-audio-api` — `AudioContext` tạo đúng
  24kHz (`src/services/audioPlayback.ts`), jitter buffer ~0.35s.
- **Chấm bài + sinh scenario**: REST `generateContent`, fallback theo
  thứ tự `gemini-3.1-flash-lite` → `gemini-3.5-flash-lite` →
  `gemini-2.5-flash-lite` (quota free tier tính theo từng model).
- **Live model**: `gemini-2.5-flash-native-audio-preview-12-2025`.
- **Data**: `expo-sqlite` — sessions (kèm `audio_uri`), errors, vocab,
  pitches, custom_scenarios, meta.
- **API key**: nhập trong Cài đặt, lưu Expo SecureStore, không backend.

## Chạy (dev)

Cần **dev build** — native modules không chạy trong Expo Go:

```bash
pnpm install
pnpm dlx expo prebuild -p android   # tạo android/ lần đầu
pnpm dlx expo run:android
pnpm dlx expo start --dev-client
```

Lấy Gemini API key miễn phí: https://aistudio.google.com — nhập trong
tab Cài đặt của app (ô nhập dùng `visible-password` để bàn phím Telex
không làm méo key).

## Build release (APK cài trực tiếp)

`android/` nằm trong `.gitignore` (CNG) — keystore và signing config
chỉ tồn tại local:

```bash
# 1. Tạo keystore (giữ file này cẩn thận — mọi update sau này bắt buộc
#    ký cùng key)
keytool -genkeypair -v -keystore android/app/release.keystore \
  -alias english-coach -keyalg RSA -keysize 2048 -validity 10950

# 2. Thêm signingConfigs.release vào android/app/build.gradle trỏ tới
#    release.keystore (xem mẫu trong git history / docs RN signed-apk)

# 3. Build
cd android && ./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```

Lưu ý: chạy lại `expo prebuild` sẽ regenerate `android/` → phải tạo lại
keystore + signing config theo bước trên.

## Lưu ý kỹ thuật (đã va phải)

- Hermes không tạo được `Blob` từ `ArrayBuffer` — WS frame dạng binary
  phải tự decode UTF-8 (`utf8BytesToString` trong `geminiLive.ts`).
- `keepFullAnalysis: false` khi startRecording — serialize analysis của
  audio-studio đi qua đường Blob → uncaught error trên Hermes.
- `endCall` persist transcript + session **trước** khi teardown audio
  (`ctx.close()` có thể treo) và teardown bọc timeout — nút Kết thúc
  không bao giờ kẹt.
- Session không transcript (connect rớt/remount) tự xóa khỏi history.
- Enum VAD đúng là `END_SENSITIVITY_LOW` (không phải
  `END_OF_SPEECH_SENSITIVITY_LOW`) — sai enum bị server từ chối setup.
- `router.dismissTo` tới cùng route chỉ pop chứ không mount màn mới —
  dùng `router.push` khi cần instance mới (nút "Luyện lại theo dàn ý").
- Đã test trên Pixel 6a thật: call 2 chiều (cả 2 chế độ), ghi + nghe
  lại, chấm bài, dàn ý + luyện lại, tạo scenario, pitch, streak/xu,
  nhắc giờ, reset dữ liệu.
