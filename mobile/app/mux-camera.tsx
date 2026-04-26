import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { C } from '../lib/colors';
import {
  BroadcastState,
  createNativeBroadcaster,
} from '../lib/nativeBroadcaster';

export default function MuxCameraScreen() {
  const params = useLocalSearchParams<{
    game?: string;
    rtmpUrl?: string;
    streamKey?: string;
    playbackUrl?: string;
  }>();
  const broadcaster = useMemo(() => createNativeBroadcaster(), []);
  const [state, setState] = useState<BroadcastState>('idle');
  const [error, setError] = useState<string | null>(null);

  const hasMuxSession = Boolean(params.rtmpUrl && params.streamKey);
  const isBusy = state === 'connecting';
  const isLive = state === 'live';

  async function startBroadcast() {
    if (!params.rtmpUrl || !params.streamKey) {
      setError('Create a Mux live session first.');
      return;
    }

    setError(null);
    setState('connecting');
    try {
      await broadcaster.start({
        rtmpUrl: params.rtmpUrl,
        streamKey: params.streamKey,
        videoBitrate: 2500000,
        audioBitrate: 128000,
        fps: 30,
      });
      setState('live');
    } catch (e) {
      setState('error');
      setError((e as Error).message);
    }
  }

  async function stopBroadcast() {
    await broadcaster.stop();
    setState('stopped');
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.container}>
      <Text style={s.title}>Native Mux Camera</Text>
      <Text style={s.subtitle}>Game {params.game ?? 'not selected'}</Text>

      <View style={s.preview}>
        <View style={s.previewBadge}>
          <Text style={s.previewBadgeText}>{isLive ? 'LIVE' : state.toUpperCase()}</Text>
        </View>
        <Text style={s.previewText}>Camera preview adapter</Text>
        <Text style={s.previewSubtext}>
          The RTMP encoder view mounts here once the native broadcaster module is installed.
        </Text>
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Mux session</Text>
        <InfoRow label="RTMP URL" value={params.rtmpUrl ?? 'Not created'} />
        <InfoRow label="Stream key" value={params.streamKey ? mask(params.streamKey) : 'Not created'} />
        <InfoRow label="Playback URL" value={params.playbackUrl ?? 'Not created'} />
      </View>

      {error ? (
        <View style={s.errorBox}>
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[
          s.primaryBtn,
          (!hasMuxSession || isBusy || isLive) && s.disabledBtn,
        ]}
        onPress={startBroadcast}
        disabled={!hasMuxSession || isBusy || isLive}
        activeOpacity={0.8}
      >
        {isBusy ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={s.primaryBtnText}>Start Broadcast</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[s.secondaryBtn, !isLive && s.disabledBtn]}
        onPress={stopBroadcast}
        disabled={!isLive}
        activeOpacity={0.8}
      >
        <Text style={s.secondaryBtnText}>Stop Broadcast</Text>
      </TouchableOpacity>

      <View style={s.card}>
        <Text style={s.cardTitle}>Native encoder work left</Text>
        <Text style={s.bodyText}>
          Mux accepts RTMP/RTMPS ingest, but Expo Go does not include an RTMP encoder.
          The next step is adding a custom dev client with an iOS/Android RTMP module,
          then implementing the adapter in mobile/lib/nativeBroadcaster.ts.
        </Text>
      </View>
    </ScrollView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function mask(value: string) {
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

const s = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '800', color: C.text, marginBottom: 4 },
  subtitle: { fontSize: 14, color: C.textDim, marginBottom: 20 },
  preview: {
    aspectRatio: 9 / 16,
    maxHeight: 520,
    backgroundColor: '#020617',
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    marginBottom: 16,
  },
  previewBadge: {
    position: 'absolute',
    top: 14,
    left: 14,
    backgroundColor: C.redBright,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  previewBadgeText: { color: 'white', fontSize: 11, fontWeight: '800' },
  previewText: { color: C.text, fontSize: 18, fontWeight: '800', marginBottom: 8 },
  previewSubtext: { color: C.textDim, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  card: {
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: { color: C.text, fontSize: 15, fontWeight: '700', marginBottom: 12 },
  bodyText: { color: C.textMuted, fontSize: 13, lineHeight: 20 },
  infoRow: { marginBottom: 10 },
  infoLabel: {
    color: C.textDim,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 3,
  },
  infoValue: { color: C.textSub, fontSize: 13, lineHeight: 18 },
  errorBox: {
    backgroundColor: '#1c0c0c',
    borderColor: '#7f1d1d',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  errorText: { color: C.red, fontSize: 13, lineHeight: 18 },
  primaryBtn: {
    backgroundColor: C.red,
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryBtnText: { color: 'white', fontSize: 15, fontWeight: '800' },
  secondaryBtn: {
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
    marginBottom: 16,
  },
  secondaryBtnText: { color: C.text, fontSize: 15, fontWeight: '700' },
  disabledBtn: { opacity: 0.45 },
});
