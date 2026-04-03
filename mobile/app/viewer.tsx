import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useGameState } from '../hooks/useGameState';
import { Diamond } from '../components/Diamond';
import { CountDots } from '../components/CountDots';
import { ordinalInning } from '../lib/api';
import { C } from '../lib/colors';

// ── Video Player ──────────────────────────────────────────────────────────

function HLSPlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.play();
  });
  const { width } = useWindowDimensions();
  return (
    <VideoView
      player={player}
      style={{ width, height: width * (9 / 16) }}
      allowsFullscreen
      allowsPictureInPicture
    />
  );
}

function VideoPlayer({ url }: { url: string | null }) {
  const { width } = useWindowDimensions();
  const videoHeight = width * (9 / 16);

  if (!url) {
    return (
      <View style={[vp.placeholder, { height: videoHeight }]}>
        <Text style={vp.placeholderText}>📺 Stream not yet started</Text>
      </View>
    );
  }

  // YouTube
  const yt = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|live\/))([a-zA-Z0-9_-]{11})/
  );
  if (yt) {
    return (
      <WebView
        source={{
          uri: `https://www.youtube.com/embed/${yt[1]}?autoplay=1&mute=1`,
        }}
        style={{ width, height: videoHeight }}
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction={false}
      />
    );
  }

  // Twitch
  const tw = url.match(/twitch\.tv\/([a-zA-Z0-9_]+)/);
  if (tw) {
    return (
      <WebView
        source={{
          uri: `https://player.twitch.tv/?channel=${tw[1]}&parent=localhost`,
        }}
        style={{ width, height: videoHeight }}
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction={false}
      />
    );
  }

  // HLS
  if (url.includes('.m3u8')) {
    return <HLSPlayer uri={url} />;
  }

  // Generic embed
  return (
    <WebView
      source={{ uri: url }}
      style={{ width, height: videoHeight }}
      allowsFullscreenVideo
    />
  );
}

const vp = StyleSheet.create({
  placeholder: {
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: { color: C.textFaint, fontSize: 14 },
});

// ── Scorebug ──────────────────────────────────────────────────────────────

function Scorebug({
  inning,
  half,
  outs,
  balls,
  strikes,
  runners,
  status,
}: {
  inning: number;
  half: string;
  outs: number;
  balls: number;
  strikes: number;
  runners: { first?: string | null; second?: string | null; third?: string | null };
  status: string;
}) {
  const isLive = status === 'live';

  return (
    <View style={sb.wrap}>
      {/* Inning */}
      <View style={sb.inningCol}>
        <Text style={[sb.halfArrow, half === 'top' && sb.halfArrowActive]}>▲</Text>
        <Text style={sb.inningNum}>{inning}</Text>
        <Text style={[sb.halfArrow, half === 'bottom' && sb.halfArrowActive]}>▼</Text>
      </View>

      <View style={sb.divider} />

      {/* Diamond + outs */}
      <View style={sb.fieldGroup}>
        <Diamond
          first={!!runners.first}
          second={!!runners.second}
          third={!!runners.third}
          size="sm"
        />
        <View style={sb.outsCol}>
          <Text style={sb.miniLabel}>Out</Text>
          <View style={{ gap: 3 }}>
            {[0, 1, 2].map((i) => (
              <View
                key={i}
                style={[
                  sb.outPip,
                  i < outs && { backgroundColor: C.amber, borderColor: C.amberLight },
                ]}
              />
            ))}
          </View>
        </View>
      </View>

      <View style={sb.divider} />

      {/* Count */}
      <View style={sb.countCol}>
        <Text style={sb.miniLabel}>Count</Text>
        <View style={{ gap: 4 }}>
          <View style={sb.countRow}>
            <Text style={[sb.countLetter, { color: C.greenLight }]}>B</Text>
            <CountDots
              value={balls}
              max={4}
              activeColor={C.greenLight}
              activeBorder={C.greenLight}
              size={8}
            />
          </View>
          <View style={sb.countRow}>
            <Text style={[sb.countLetter, { color: C.red }]}>S</Text>
            <CountDots
              value={strikes}
              max={3}
              activeColor={C.red}
              activeBorder={C.red}
              size={8}
            />
          </View>
        </View>
      </View>

      <View style={{ flex: 1 }} />

      {/* Status */}
      {isLive ? (
        <View style={sb.liveBadge}>
          <View style={sb.liveDot} />
          <Text style={sb.liveText}>Live</Text>
        </View>
      ) : (
        <Text style={sb.statusText}>
          {status === 'final' ? 'Final' : 'Pre-game'}
        </Text>
      )}
    </View>
  );
}

const sb = StyleSheet.create({
  wrap: {
    backgroundColor: C.bg,
    borderTopWidth: 1,
    borderTopColor: C.borderDim,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    gap: 0,
  },
  inningCol: { alignItems: 'center', minWidth: 36 },
  inningNum: {
    fontSize: 22,
    fontWeight: '900',
    color: C.text,
    lineHeight: 24,
  },
  halfArrow: { fontSize: 10, color: C.textFaint, lineHeight: 13 },
  halfArrowActive: { color: C.text },
  divider: {
    width: 1,
    backgroundColor: C.borderDim,
    alignSelf: 'stretch',
    marginHorizontal: 8,
    minHeight: 36,
  },
  fieldGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  outsCol: { alignItems: 'center', gap: 4 },
  miniLabel: {
    fontSize: 8,
    color: C.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '700',
  },
  outPip: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: C.borderDim,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  countCol: { alignItems: 'flex-start', gap: 4 },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  countLetter: { fontSize: 9, fontWeight: '700', width: 10 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: C.redBright,
  },
  liveText: {
    color: C.redBright,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  statusText: { color: C.textFaint, fontSize: 11, fontWeight: '700' },
});

// ── Game ID Entry ─────────────────────────────────────────────────────────

function GameIdEntry({ onSubmit }: { onSubmit: (id: string) => void }) {
  const [val, setVal] = useState('');
  return (
    <View style={gi.container}>
      <Text style={gi.title}>📺 Watch a Game</Text>
      <Text style={gi.subtitle}>Enter the game ID from the scorer</Text>
      <TextInput
        style={gi.input}
        placeholder="Game ID"
        placeholderTextColor={C.textFaint}
        value={val}
        onChangeText={setVal}
        autoCapitalize="none"
        returnKeyType="go"
        onSubmitEditing={() => val.trim() && onSubmit(val.trim())}
      />
      <TouchableOpacity
        style={gi.btn}
        onPress={() => val.trim() && onSubmit(val.trim())}
        activeOpacity={0.8}
      >
        <Text style={gi.btnText}>Watch</Text>
      </TouchableOpacity>
    </View>
  );
}

const gi = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center' },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: C.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: C.textDim,
    textAlign: 'center',
    marginBottom: 32,
  },
  input: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: C.text,
    marginBottom: 12,
  },
  btn: {
    backgroundColor: C.purple,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  btnText: { color: 'white', fontSize: 16, fontWeight: '700' },
});

// ── Main Viewer ───────────────────────────────────────────────────────────

export default function ViewerScreen() {
  const params = useLocalSearchParams<{ game?: string }>();
  const [activeId, setActiveId] = useState<string | null>(
    params.game ?? null
  );
  const { state, error } = useGameState(activeId);

  if (!activeId) {
    return <GameIdEntry onSubmit={setActiveId} />;
  }

  if (error) {
    return (
      <View style={vw.center}>
        <Text style={vw.errorText}>Could not load game: {error}</Text>
        <TouchableOpacity onPress={() => setActiveId(null)}>
          <Text style={vw.retryText}>Try another game ID</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!state) {
    return (
      <View style={vw.center}>
        <Text style={vw.loadingText}>Connecting to game…</Text>
      </View>
    );
  }

  const runners = state.runners ?? {};

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Video */}
      <VideoPlayer url={state.stream_url} />

      {/* Scoreboard rows */}
      <View style={vw.scoreboard}>
        {[
          { label: 'Away', team: state.away_team, score: state.away_score, color: C.blueLight },
          { label: 'Home', team: state.home_team, score: state.home_score, color: C.red },
        ].map((row) => (
          <View key={row.label} style={vw.scoreRow}>
            <Text style={[vw.rowLabel, { color: row.color }]}>{row.label}</Text>
            <Text style={vw.rowTeam}>{row.team}</Text>
            <Text style={[vw.rowScore, { color: row.color }]}>{row.score}</Text>
          </View>
        ))}
      </View>

      {/* Scorebug */}
      <Scorebug
        inning={state.inning ?? 1}
        half={state.half ?? 'top'}
        outs={state.outs ?? 0}
        balls={state.balls ?? 0}
        strikes={state.strikes ?? 0}
        runners={runners}
        status={state.status}
      />

      {/* Play feed */}
      <ScrollView style={vw.feed}>
        <Text style={vw.feedTitle}>Play by Play</Text>
        {(state.recent_plays ?? []).length === 0 ? (
          <Text style={vw.noPlays}>Waiting for first play…</Text>
        ) : (
          (state.recent_plays ?? []).map((p, i) => (
            <View key={p.id ?? i} style={vw.playItem}>
              {p.structured_play?.play_type ? (
                <View style={vw.badge}>
                  <Text style={vw.badgeText}>{p.structured_play.play_type}</Text>
                </View>
              ) : null}
              <View style={{ flex: 1 }}>
                <Text style={vw.playText}>{p.raw_input}</Text>
                {p.score_after ? (
                  <Text style={vw.playScore}>
                    {p.score_after.away ?? 0}–{p.score_after.home ?? 0}
                  </Text>
                ) : null}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const vw = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { color: C.textDim, fontSize: 16 },
  errorText: { color: C.red, fontSize: 16, marginBottom: 16, textAlign: 'center' },
  retryText: { color: C.blueLight, fontSize: 14 },

  scoreboard: { backgroundColor: C.surface },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 44,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.bg,
  },
  rowLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    minWidth: 36,
  },
  rowTeam: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: C.textSub,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  rowScore: { fontSize: 26, fontWeight: '900' },

  feed: { flex: 1, padding: 16 },
  feedTitle: {
    fontSize: 11,
    color: C.textDim,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
    marginBottom: 12,
  },
  noPlays: { color: C.textFaint, fontSize: 14, textAlign: 'center', paddingVertical: 20 },
  playItem: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.borderDim,
    alignItems: 'flex-start',
  },
  badge: {
    backgroundColor: C.blueDeep,
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginTop: 1,
  },
  badgeText: {
    color: C.blueLight,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  playText: { fontSize: 14, color: C.textSub },
  playScore: { fontSize: 11, color: C.textFaint, marginTop: 2 },
});
