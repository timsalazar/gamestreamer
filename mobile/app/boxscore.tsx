import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api, Play, GameState, ordinalInning } from '../lib/api';
import { C } from '../lib/colors';

// ── Line Score Table ───────────────────────────────────────────────────────

function LineScore({ game }: { game: GameState }) {
  const maxInning = Math.max(
    game.inning,
    game.inning_scores?.top?.length ?? 0,
    game.inning_scores?.bottom?.length ?? 0,
    9
  );
  const innings = Array.from({ length: maxInning }, (_, i) => i + 1);

  function cell(half: 'top' | 'bottom', n: number) {
    const idx = n - 1;
    const val = game.inning_scores?.[half]?.[idx];
    const isCurrent =
      n === game.inning && game.half === (half === 'top' ? 'top' : 'bottom') &&
      game.status === 'live';
    return { val, isCurrent };
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View>
        {/* Header row */}
        <View style={ls.row}>
          <View style={ls.teamCell} />
          {innings.map((n) => (
            <View key={n} style={ls.cell}>
              <Text style={ls.headerText}>{n}</Text>
            </View>
          ))}
          <View style={ls.sepCell} />
          <View style={ls.totalCell}>
            <Text style={ls.headerText}>R</Text>
          </View>
        </View>

        {/* Away row */}
        {(['top', 'bottom'] as const).map((half, rowIdx) => {
          const teamName = rowIdx === 0 ? game.away_team : game.home_team;
          const teamScore = rowIdx === 0 ? game.away_score : game.home_score;
          const scoreColor = rowIdx === 0 ? C.blueLight : C.red;
          return (
            <View key={half} style={ls.row}>
              <View style={ls.teamCell}>
                <Text style={ls.teamName}>{teamName}</Text>
              </View>
              {innings.map((n) => {
                const { val, isCurrent } = cell(half, n);
                return (
                  <View
                    key={n}
                    style={[ls.cell, isCurrent && ls.currentCell]}
                  >
                    <Text
                      style={[
                        ls.cellText,
                        val === undefined ? ls.emptyText : undefined,
                        isCurrent && ls.currentText,
                      ]}
                    >
                      {val !== undefined && val !== null ? String(val) : '·'}
                    </Text>
                  </View>
                );
              })}
              <View style={ls.sepCell} />
              <View style={ls.totalCell}>
                <Text style={[ls.totalScore, { color: scoreColor }]}>
                  {teamScore}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const ls = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  teamCell: {
    minWidth: 110,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  teamName: { fontSize: 14, fontWeight: '700', color: C.text },
  cell: {
    width: 32,
    paddingVertical: 10,
    alignItems: 'center',
  },
  headerText: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textDim,
    textTransform: 'uppercase',
  },
  cellText: {
    fontSize: 14,
    color: C.textMuted,
  },
  emptyText: { color: C.border },
  currentCell: { backgroundColor: 'rgba(30,58,95,0.3)' },
  currentText: { color: C.text },
  sepCell: { width: 4, backgroundColor: C.surface },
  totalCell: { width: 36, alignItems: 'center', paddingVertical: 10 },
  totalScore: { fontSize: 16, fontWeight: '800' },
});

// ── Play Log ───────────────────────────────────────────────────────────────

function PlayLog({ plays }: { plays: Play[] }) {
  if (plays.length === 0) {
    return <Text style={pl.noPlays}>No plays yet</Text>;
  }

  // Group by inning + half (oldest first)
  const ordered = [...plays].reverse();
  const groups: { key: string; inning: number; half: string; plays: Play[] }[] =
    [];
  for (const p of ordered) {
    const key = `${p.inning}-${p.half}`;
    const existing = groups.find((g) => g.key === key);
    if (existing) {
      existing.plays.push(p);
    } else {
      groups.push({ key, inning: p.inning, half: p.half, plays: [p] });
    }
  }

  return (
    <View style={pl.card}>
      {groups.map((group) => (
        <View key={group.key}>
          <Text style={pl.inningHeader}>
            {ordinalInning(group.inning, group.half)}
          </Text>
          {group.plays.map((p, i) => (
            <View key={p.id ?? i} style={pl.item}>
              {p.structured_play?.play_type ? (
                <View style={pl.badge}>
                  <Text style={pl.badgeText}>{p.structured_play.play_type}</Text>
                </View>
              ) : null}
              <View style={{ flex: 1 }}>
                <Text style={pl.playText}>{p.raw_input}</Text>
                {p.score_after ? (
                  <Text style={pl.playScore}>
                    {p.score_after.away ?? 0}–{p.score_after.home ?? 0}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const pl = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  noPlays: { color: C.textFaint, fontSize: 14, textAlign: 'center', padding: 24 },
  inningHeader: {
    fontSize: 11,
    color: C.blue,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.blueDeep,
  },
  item: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: C.borderDim,
    alignItems: 'flex-start',
  },
  badge: {
    backgroundColor: C.bg,
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
  playText: { fontSize: 13, color: C.textSub },
  playScore: { fontSize: 11, color: C.textFaint, marginTop: 2 },
});

// ── Main Screen ────────────────────────────────────────────────────────────

export default function BoxScoreScreen() {
  const params = useLocalSearchParams<{ game?: string }>();
  const router = useRouter();
  const [gameId, setGameId] = useState(params.game ?? '');
  const [inputId, setInputId] = useState(params.game ?? '');
  const [game, setGame] = useState<GameState | null>(null);
  const [plays, setPlays] = useState<Play[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load(id: string) {
    setError(null);
    try {
      const [g, ps] = await Promise.all([api.getState(id), api.getPlays(id)]);
      setGame(g);
      setPlays(ps);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    if (!gameId) return;
    load(gameId);
    const interval = setInterval(() => load(gameId), 5000);
    return () => clearInterval(interval);
  }, [gameId]);

  if (!gameId) {
    return (
      <View style={bx.center}>
        <Text style={bx.title}>📊 Box Score</Text>
        <Text style={bx.subtitle}>Enter a game ID to view the box score</Text>
        <TextInput
          style={bx.input}
          placeholder="Game ID"
          placeholderTextColor={C.textFaint}
          value={inputId}
          onChangeText={setInputId}
          autoCapitalize="none"
          returnKeyType="go"
          onSubmitEditing={() => inputId.trim() && setGameId(inputId.trim())}
        />
        <TouchableOpacity
          style={bx.btn}
          onPress={() => inputId.trim() && setGameId(inputId.trim())}
          activeOpacity={0.8}
        >
          <Text style={bx.btnText}>View Box Score</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (error) {
    return (
      <View style={bx.center}>
        <Text style={bx.errorText}>{error}</Text>
        <TouchableOpacity onPress={() => setGameId('')}>
          <Text style={bx.linkText}>Try another game</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!game) {
    return (
      <View style={bx.center}>
        <Text style={bx.loadingText}>Loading box score…</Text>
      </View>
    );
  }

  const isLive = game.status === 'live';

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={bx.container}>
      {/* Nav links */}
      <View style={bx.navRow}>
        <TouchableOpacity
          style={bx.navBtn}
          onPress={() =>
            router.push({ pathname: '/viewer', params: { game: game.id } })
          }
        >
          <Text style={bx.navText}>📺 Watch</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={bx.navBtn}
          onPress={() => router.push('/scorer')}
        >
          <Text style={bx.navText}>⚾ Scorer</Text>
        </TouchableOpacity>
      </View>

      {/* Title */}
      <Text style={bx.gameTitle}>
        {game.away_team} @ {game.home_team}
      </Text>

      {/* Status pill */}
      <View
        style={[
          bx.pill,
          isLive ? bx.pillLive : bx.pillFinal,
        ]}
      >
        {isLive && <View style={bx.liveDot} />}
        <Text style={[bx.pillText, { color: isLive ? C.redBright : C.textDim }]}>
          {isLive
            ? `Live · ${ordinalInning(game.inning, game.half)}`
            : game.status === 'final'
            ? 'Final'
            : 'Scheduled'}
        </Text>
      </View>

      {/* Summary scoreboard */}
      <View style={bx.summary}>
        <View style={bx.summaryTeam}>
          <Text style={bx.summaryTeamName}>{game.away_team}</Text>
          <Text style={[bx.summaryScore, { color: C.blueLight }]}>
            {game.away_score}
          </Text>
        </View>
        <Text style={bx.summaryDash}>–</Text>
        <View style={bx.summaryTeam}>
          <Text style={bx.summaryTeamName}>{game.home_team}</Text>
          <Text style={[bx.summaryScore, { color: C.red }]}>
            {game.home_score}
          </Text>
        </View>
      </View>

      {/* Line score */}
      <Text style={bx.sectionTitle}>Line Score</Text>
      <View style={bx.lineScoreWrap}>
        <LineScore game={game} />
      </View>

      {/* Play by play */}
      <Text style={bx.sectionTitle}>Play by Play</Text>
      <PlayLog plays={plays} />
    </ScrollView>
  );
}

const bx = StyleSheet.create({
  center: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: C.text, marginBottom: 8 },
  subtitle: { fontSize: 14, color: C.textDim, marginBottom: 24 },
  input: {
    width: '100%',
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
    width: '100%',
    backgroundColor: C.blue,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  btnText: { color: 'white', fontSize: 16, fontWeight: '700' },
  loadingText: { color: C.textDim, fontSize: 16 },
  errorText: { color: C.red, fontSize: 16, marginBottom: 16 },
  linkText: { color: C.blueLight, fontSize: 14 },

  container: { padding: 16, paddingBottom: 40 },
  navRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  navBtn: {
    backgroundColor: C.surface,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  navText: { color: C.blueLight, fontSize: 13 },

  gameTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: C.text,
    marginBottom: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
    borderWidth: 1,
    marginBottom: 20,
  },
  pillLive: { backgroundColor: '#1c1917', borderColor: C.redBright },
  pillFinal: { backgroundColor: C.surface, borderColor: C.border },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: C.redBright,
  },
  pillText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },

  summary: {
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  summaryTeam: { flex: 1, alignItems: 'center' },
  summaryTeamName: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textDim,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  summaryScore: { fontSize: 48, fontWeight: '800', lineHeight: 52 },
  summaryDash: { fontSize: 32, color: C.border },

  sectionTitle: {
    fontSize: 11,
    color: C.textDim,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
    marginBottom: 10,
  },
  lineScoreWrap: {
    backgroundColor: C.surface,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 20,
  },
});
