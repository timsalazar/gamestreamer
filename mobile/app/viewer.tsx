import React, { useEffect, useState } from 'react';
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
import { api, GameLineups, GameState, Play } from '../lib/api';
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

function teamAbbr(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'TBD';
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase();
}

function LineScore({ state }: { state: GameState }) {
  const maxInning = Math.max(
    state.inning ?? 1,
    state.inning_scores?.top?.length ?? 0,
    state.inning_scores?.bottom?.length ?? 0,
    9
  );
  const innings = Array.from({ length: maxInning }, (_, i) => i + 1);

  function inningValue(half: 'top' | 'bottom', inning: number) {
    return state.inning_scores?.[half]?.[inning - 1];
  }

  function statValue(value: number) {
    return (
      <View style={ls.statCell}>
        <Text style={ls.statText}>{value}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={ls.scrollContent}
      style={ls.wrap}
    >
      <View>
        <View style={ls.headerRow}>
          <View style={ls.teamCell} />
          {innings.map((inning) => (
            <View key={inning} style={ls.inningCell}>
              <Text style={ls.headerText}>{inning}</Text>
            </View>
          ))}
          <View style={ls.sep} />
          {['R', 'H', 'E'].map((label) => (
            <View key={label} style={ls.statCell}>
              <Text style={ls.headerText}>{label}</Text>
            </View>
          ))}
        </View>

        {[
          {
            key: 'top' as const,
            name: state.away_team,
            runs: state.away_score ?? 0,
            hits: state.away_hits ?? 0,
            errors: state.away_errors ?? 0,
            accent: C.text,
          },
          {
            key: 'bottom' as const,
            name: state.home_team,
            runs: state.home_score ?? 0,
            hits: state.home_hits ?? 0,
            errors: state.home_errors ?? 0,
            accent: C.textMuted,
          },
        ].map((row) => (
          <View key={row.key} style={ls.dataRow}>
            <View style={ls.teamCell}>
              <Text style={[ls.teamAbbr, { color: row.accent }]}>{teamAbbr(row.name)}</Text>
            </View>
            {innings.map((inning) => {
              const value = inningValue(row.key, inning);
              const isCurrent =
                state.status === 'live' &&
                state.half === row.key &&
                state.inning === inning;
              return (
                <View
                  key={inning}
                  style={[ls.inningCell, isCurrent && ls.currentCell]}
                >
                  <Text style={[ls.inningText, value == null && ls.emptyText]}>
                    {value == null ? '' : String(value)}
                  </Text>
                </View>
              );
            })}
            <View style={ls.sep} />
            {statValue(row.runs)}
            {statValue(row.hits)}
            {statValue(row.errors)}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

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

function computePitching(plays: Play[], fallbackPitcher: string | null = null) {
  const stats = new Map<string, { ip_outs: number; h: number; r: number; er: number; bb: number; so: number }>();

  function get(name: string) {
    if (!stats.has(name)) {
      stats.set(name, { ip_outs: 0, h: 0, r: 0, er: 0, bb: 0, so: 0 });
    }
    return stats.get(name)!;
  }

  for (const play of plays) {
    const sp = play.structured_play;
    if (!sp || sp.play_type === 'ball' || sp.play_type === 'strike') continue;
    const pitcher = sp.pitcher || fallbackPitcher;
    if (!pitcher) continue;
    const s = get(pitcher);
    if (sp.outs_recorded) s.ip_outs += sp.outs_recorded;
    if (sp.hit === true || ['single', 'double', 'triple', 'home_run'].includes(sp.play_type)) s.h++;
    if (sp.play_type === 'walk') s.bb++;
    if (sp.play_type === 'strikeout') s.so++;
    if (sp.runs_scored) {
      s.r += sp.runs_scored;
      s.er += sp.runs_scored - (sp.unearned_runs ?? 0);
    }
  }

  return stats;
}

function formatIP(outs: number) {
  return `${Math.floor(outs / 3)}.${outs % 3}`;
}

function formatERA(er: number, ipOuts: number) {
  if (!ipOuts) return '-.--';
  return ((er * 27) / ipOuts).toFixed(2);
}

function getTeamPitching(plays: Play[], lineup: GameLineups | null, side: 'away' | 'home') {
  const defenseHalf = side === 'away' ? 'bottom' : 'top';
  const defensivePlays = [...plays].reverse().filter((play) => play.half === defenseHalf);
  const recentPitcher = [...defensivePlays].reverse().map((play) => play.structured_play?.pitcher).find(Boolean) ?? null;
  const lineupPitcher =
    lineup?.[side]?.effective_players?.find((player) => player?.position === 'P' && player?.name)?.name ?? null;
  const currentPitcher = recentPitcher ?? lineupPitcher;
  const stats = computePitching(defensivePlays, currentPitcher);

  if (currentPitcher && !stats.has(currentPitcher)) {
    stats.set(currentPitcher, { ip_outs: 0, h: 0, r: 0, er: 0, bb: 0, so: 0 });
  }

  return { stats, currentPitcher };
}

function PitchingCard({
  teamName,
  plays,
  lineup,
  side,
}: {
  teamName: string;
  plays: Play[];
  lineup: GameLineups | null;
  side: 'away' | 'home';
}) {
  const { stats, currentPitcher } = getTeamPitching(plays, lineup, side);
  const rows = [...stats.entries()];

  return (
    <View style={pc.card}>
      <View style={pc.header}>
        <Text style={pc.label}>{teamName}</Text>
        <Text style={pc.meta}>{currentPitcher ? `P: ${currentPitcher}` : 'Pitching'}</Text>
      </View>
      <View style={pc.tableHead}>
        {['Pitcher', 'IP', 'H', 'R', 'ER', 'BB', 'SO', 'ERA'].map((label, index) => (
          <Text key={label} style={[pc.headText, index === 0 ? pc.nameCol : pc.numCol]}>
            {label}
          </Text>
        ))}
      </View>
      {rows.length === 0 ? (
        <Text style={pc.empty}>No pitching data yet</Text>
      ) : (
        rows.map(([name, s]) => {
          const isCurrent = currentPitcher === name;
          return (
            <View key={name} style={[pc.row, isCurrent && pc.currentRow]}>
              <Text style={[pc.cellText, pc.nameCol, isCurrent && pc.currentText]}>
                {name}
              </Text>
              <Text style={[pc.cellText, pc.numCol]}>{formatIP(s.ip_outs)}</Text>
              <Text style={[pc.cellText, pc.numCol]}>{s.h}</Text>
              <Text style={[pc.cellText, pc.numCol]}>{s.r}</Text>
              <Text style={[pc.cellText, pc.numCol]}>{s.er}</Text>
              <Text style={[pc.cellText, pc.numCol]}>{s.bb}</Text>
              <Text style={[pc.cellText, pc.numCol]}>{s.so}</Text>
              <Text style={[pc.cellText, pc.numCol]}>{formatERA(s.er, s.ip_outs)}</Text>
            </View>
          );
        })
      )}
    </View>
  );
}

const pc = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  label: { color: C.text, fontSize: 14, fontWeight: '700' },
  meta: { color: C.textDim, fontSize: 11, fontWeight: '600' },
  tableHead: {
    flexDirection: 'row',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.borderDim,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.borderDim,
  },
  currentRow: { backgroundColor: '#1d2a3a', borderRadius: 8 },
  headText: {
    color: C.textFaint,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  cellText: { color: C.textSub, fontSize: 12, fontWeight: '600' },
  currentText: { color: C.text },
  nameCol: { flex: 2.4, paddingRight: 6 },
  numCol: { flex: 1, textAlign: 'center' },
  empty: { color: C.textFaint, fontSize: 13, textAlign: 'center', paddingVertical: 10 },
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
  const [plays, setPlays] = useState<Play[]>([]);
  const [lineup, setLineup] = useState<GameLineups | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadViewerData() {
      if (!activeId) return;
      try {
        const [nextPlays, nextLineup] = await Promise.all([
          api.getPlays(activeId),
          api.getLineup(activeId).catch(() => null),
        ]);
        if (!cancelled) {
          setPlays(nextPlays);
          setLineup(nextLineup);
        }
      } catch {
        if (!cancelled) setPlays([]);
      }
    }

    loadViewerData();
    const timer = setInterval(loadViewerData, state?.status === 'final' ? 10000 : 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeId, state?.status]);

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

      <LineScore state={state} />

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
        <Text style={vw.feedTitle}>Pitching</Text>
        <PitchingCard teamName={state.away_team} plays={plays} lineup={lineup} side="away" />
        <PitchingCard teamName={state.home_team} plays={plays} lineup={lineup} side="home" />

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

const ls = StyleSheet.create({
  wrap: {
    backgroundColor: '#000',
    borderTopWidth: 1,
    borderTopColor: C.borderDim,
    borderBottomWidth: 1,
    borderBottomColor: C.borderDim,
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  teamCell: {
    width: 52,
    justifyContent: 'center',
    marginRight: 8,
  },
  teamAbbr: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  inningCell: {
    width: 42,
    height: 34,
    borderWidth: 1,
    borderColor: '#7a7a7a',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  currentCell: {
    backgroundColor: '#1f1f1f',
  },
  headerText: {
    color: C.text,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  inningText: {
    color: C.text,
    fontSize: 18,
    fontWeight: '800',
  },
  emptyText: {
    color: 'transparent',
  },
  sep: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: '#5e5e5e',
    marginHorizontal: 10,
  },
  statCell: {
    width: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  statText: {
    color: C.text,
    fontSize: 18,
    fontWeight: '800',
    marginTop: 8,
  },
});
