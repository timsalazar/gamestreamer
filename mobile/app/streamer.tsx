import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { api } from '../lib/api';
import { C } from '../lib/colors';

interface Platform {
  icon: string;
  iconBg: string;
  name: string;
  urlFormat: string;
  steps: string[];
  tip: string;
}

const PLATFORMS: Platform[] = [
  {
    icon: '▶️',
    iconBg: '#1c0000',
    name: 'YouTube Live',
    urlFormat: 'youtube.com/live/VIDEO_ID',
    steps: [
      'Open YouTube Studio and tap Go Live in the top-right corner.',
      'Choose Stream (for OBS) or Webcam for a quick browser broadcast.',
      'Set your title and tap Go Live. YouTube gives you a URL like youtube.com/live/AbCdEfG.',
      'Copy that URL and paste it into the field above.',
    ],
    tip: 'OBS users: Copy the Stream key from YouTube Studio and paste it into OBS under Settings → Stream → YouTube RTMPS.',
  },
  {
    icon: '🟣',
    iconBg: '#13001f',
    name: 'Twitch',
    urlFormat: 'twitch.tv/your_channel',
    steps: [
      'Open OBS Studio (or Streamlabs) on your laptop.',
      'Go to Settings → Stream, choose Twitch, and connect your account.',
      'Tap Start Streaming in OBS.',
      'Your stream URL is twitch.tv/your_channel_name — paste that above.',
    ],
    tip: 'No account yet? Sign up free at twitch.tv. Your channel URL is available immediately.',
  },
  {
    icon: '📹',
    iconBg: '#00101e',
    name: 'OBS / Custom HLS',
    urlFormat: 'https://your-server.com/stream.m3u8',
    steps: [
      'In OBS, go to Settings → Output → Recording and set format to HLS.',
      'Or use a self-hosted media server (nginx-rtmp, SRS, or MediaMTX) and point OBS at it via RTMP.',
      'The server produces a .m3u8 playlist URL — e.g. https://yourserver.com/live/game.m3u8.',
      'Paste that .m3u8 URL into the stream URL field above.',
    ],
    tip: 'Quick local option: Run mediamtx on your laptop and push with OBS via RTMP. It outputs an HLS URL on your local network.',
  },
];

export default function StreamerScreen() {
  const params = useLocalSearchParams<{ game?: string }>();
  const [gameId, setGameId] = useState(params.game ?? '');
  const [streamUrl, setStreamUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  async function saveStream() {
    if (!gameId.trim()) {
      setMsg({ type: 'error', text: 'Enter a game ID.' });
      return;
    }
    if (!streamUrl.trim()) {
      setMsg({ type: 'error', text: 'Enter a stream URL.' });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await api.updateStreamUrl(gameId.trim(), streamUrl.trim());
      setMsg({ type: 'ok', text: 'Stream URL saved! Viewers will see your video.' });
    } catch (e) {
      setMsg({ type: 'error', text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.container}>
      <Text style={s.title}>📡 Streamer Setup</Text>
      <Text style={s.subtitle}>
        Broadcast your game and link it to GameStreamer
      </Text>

      {/* Connect card */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Connect your stream</Text>
        <Text style={s.cardDesc}>
          Once you go live on YouTube, Twitch, or any HLS source, paste the
          URL here. Viewers will see your video alongside the live score.
        </Text>
        <Text style={s.fieldLabel}>Game ID</Text>
        <TextInput
          style={s.input}
          placeholder="e.g. abc123"
          placeholderTextColor={C.textFaint}
          value={gameId}
          onChangeText={setGameId}
          autoCapitalize="none"
          returnKeyType="next"
        />
        <Text style={s.fieldLabel}>Stream URL</Text>
        <TextInput
          style={s.input}
          placeholder="https://youtube.com/live/..."
          placeholderTextColor={C.textFaint}
          value={streamUrl}
          onChangeText={setStreamUrl}
          keyboardType="url"
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={saveStream}
        />
        <TouchableOpacity
          style={[s.saveBtn, saving && s.saveBtnDisabled]}
          onPress={saveStream}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={s.saveBtnText}>Save Stream URL</Text>
          )}
        </TouchableOpacity>
        {msg ? (
          <View
            style={[
              s.msgBox,
              msg.type === 'ok' ? s.msgOk : s.msgError,
            ]}
          >
            <Text
              style={[
                s.msgText,
                { color: msg.type === 'ok' ? C.greenLight : C.red },
              ]}
            >
              {msg.text}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Platform guides */}
      <Text style={s.sectionLabel}>How to go live</Text>
      {PLATFORMS.map((p) => (
        <View key={p.name} style={s.platformCard}>
          <View style={s.platformHeader}>
            <View style={[s.platformIcon, { backgroundColor: p.iconBg }]}>
              <Text style={s.platformIconText}>{p.icon}</Text>
            </View>
            <View>
              <Text style={s.platformName}>{p.name}</Text>
              <Text style={s.platformUrl}>{p.urlFormat}</Text>
            </View>
          </View>
          {p.steps.map((step, i) => (
            <View key={i} style={s.stepRow}>
              <Text style={s.stepNum}>{i + 1}.</Text>
              <Text style={s.stepText}>{step}</Text>
            </View>
          ))}
          <View style={s.tip}>
            <Text style={s.tipText}>
              <Text style={s.tipBold}>Tip: </Text>
              {p.tip}
            </Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '800', color: C.text, marginBottom: 4 },
  subtitle: {
    fontSize: 14,
    color: C.textDim,
    marginBottom: 24,
    lineHeight: 20,
  },
  sectionLabel: {
    fontSize: 11,
    color: C.textDim,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
    marginBottom: 12,
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 20,
    marginBottom: 24,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 4 },
  cardDesc: {
    fontSize: 13,
    color: C.textDim,
    lineHeight: 20,
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 12,
    color: C.textMuted,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: C.text,
    marginBottom: 12,
  },
  saveBtn: {
    backgroundColor: C.red,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: 'white', fontSize: 15, fontWeight: '700' },
  msgBox: {
    marginTop: 12,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
  },
  msgOk: {
    backgroundColor: C.greenDeep,
    borderColor: C.greenDark,
  },
  msgError: { backgroundColor: '#1c0c0c', borderColor: '#7f1d1d' },
  msgText: { fontSize: 13, lineHeight: 18 },

  platformCard: {
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 20,
    marginBottom: 12,
  },
  platformHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  platformIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  platformIconText: { fontSize: 18 },
  platformName: { fontSize: 15, fontWeight: '700', color: C.text },
  platformUrl: {
    fontSize: 11,
    color: C.textDim,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  stepRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  stepNum: { fontSize: 13, color: C.textDim, minWidth: 16 },
  stepText: { flex: 1, fontSize: 13, color: C.textSub, lineHeight: 20 },
  tip: {
    backgroundColor: C.bg,
    borderLeftWidth: 3,
    borderLeftColor: C.blue,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 4,
    marginTop: 12,
  },
  tipText: { fontSize: 13, color: C.textMuted, lineHeight: 20 },
  tipBold: { color: C.text, fontWeight: '700' },
});
