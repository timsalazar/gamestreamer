import React, { useState, useEffect, useCallback } from 'react';
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

// ── Stat computation types ─────────────────────────────────────────────────

interface BatterStats {
  ab: number;
  r: number;
  h: number;
  doubles: number;
  triples: number;
  hr: number;
  rbi: number;
  bb: number;
  so: number;
}

interface PitcherStats {
  ip_outs: number;
  h: number;
  r: number;
  er: number;
  bb: number;
  so: number;
}

interface StructuredPlay {
  play_type: string;
  batter?: string;
  pitcher?: string;
  runs_scored?: number;
  outs_recorded?: number;
  unearned_runs?: number;
  runners?: Array<{ from: string; to: string; name?: string }>;
}

// ── Constants ──────────────────────────────────────────────────────────────

const AB_TYPES  = new Set(['single','double','triple','home_run','strikeout','out','error']);
const HIT_TYPES = new Set(['single','double','triple','home_run']);
const SKIP_TYPES = new Set(['ball','strike','fix']);

// ── Stat helpers ───────────────────────────────────────────────────────────

function computeHE(plays: Play[]): { awayH: number; awayE: number; homeH: number; homeE: number } {
  let awayH = 0, awayE = 0, homeH = 0, homeE = 0;
  for (const p of plays) {
    const sp = p.structured_play as StructuredPlay | undefined;
    if (!sp || SKIP_TYPES.has(sp.play_type)) continue;
    const isAway = p.half === 'top';
    if (HIT_TYPES.has(sp.play_type)) {
      if (isAway) awayH++; else homeH++;
    }
    if (sp.play_type === 'error') {
      // fielding team commits the error
      if (isAway) homeE++; else awayE++;
    }
  }
  return { awayH, awayE, homeH, homeE };
}

function computeBatting(plays: Play[]): Map<string, BatterStats> {
  const stats = new Map<string, BatterStats>();

  function get(name: string): BatterStats {
    if (!stats.has(name)) {
      stats.set(name, { ab: 0, r: 0, h: 0, doubles: 0, triples: 0, hr: 0, rbi: 0, bb: 0, so: 0 });
    }
    return stats.get(name)!;
  }

  for (const p of plays) {
    const sp = p.structured_play as StructuredPlay | undefined;
    if (!sp || SKIP_TYPES.has(sp.play_type)) continue;
    const batter = sp.batter;
    if (!batter) continue;
    const s = get(batter);

    if (AB_TYPES.has(sp.play_type))   s.ab++;
    if (sp.play_type === 'walk')       s.bb++;
    if (HIT_TYPES.has(sp.play_type))  s.h++;
    if (sp.play_type === 'double')     s.doubles++;
    if (sp.play_type === 'triple')     s.triples++;
    if (sp.play_type === 'home_run')   s.hr++;
    if (sp.play_type === 'strikeout')  s.so++;
    if (sp.runs_scored)                s.rbi += sp.runs_scored;
  }

  // Runs scored — tally from runners array
  for (const p of plays) {
    const sp = p.structured_play as StructuredPlay | undefined;
    if (!sp || SKIP_TYPES.has(sp.play_type)) continue;
    const runners = sp.runners ?? [];
    for (const runner of runners) {
      if (runner.to === 'H' && runner.name) {
        get(runner.name).r++;
      }
    }
    // Home run batter scores — credit if not already in runners list
    if (sp.play_type === 'home_run' && sp.batter) {
      const alreadyCounted = runners.some(r => r.to === 'H' && r.name === sp.batter);
      if (!alreadyCounted) {
        get(sp.batter).r++;
      }
    }
  }

  return stats;
}

function computePitching(plays: Play[]): Map<string, PitcherStats> {
  const stats = new Map<string, PitcherStats>();

  function get(name: string): PitcherStats {
    if (!stats.has(name)) {
      stats.set(name, { ip_outs: 0, h: 0, r: 0, er: 0, bb: 0, so: 0 });
    }
    return stats.get(name)!;
  }

  for (const p of plays) {
    const sp = p.structured_play as StructuredPlay | undefined;
    if (!sp || SKIP_TYPES.has(sp.play_type)) continue;
    const pitcher = sp.pitcher;
    if (!pitcher) continue;
    const s = get(pitcher);

    if (sp.outs_recorded)              s.ip_outs += sp.outs_recorded;
    if (HIT_TYPES.has(sp.play_type))   s.h++;
    if (sp.play_type === 'walk')       s.bb++;
    if (sp.play_type === 'strikeout')  s.so++;
    if (sp.runs_scored) {
      s.r  += sp.runs_scored;
      const unearned = sp.unearned_runs ?? 0;
      s.er += sp.runs_scored - unearned;
    }
  }

  return stats;
}

function formatIP(outs: number): string {
  const full = Math.floor(outs / 3);
  const partial = outs % 3;
  return `${full}.${partial}`;
}

function formatAVG(h: number, ab: number): string {
  if (ab === 0) return '.---';
  const avg = h / ab;
  return '.' + String(Math.round(avg * 1000)).padStart(3, '0');
}

function formatERA(er: number, ip_outs: number): string {
  if (ip_outs === 0) return '-.--';
  const era = (er * 27) / ip_outs;
  return era.toFixed(2);
}

// ── Line Score ─────────────────────────────────────────────────────────────

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
      n === game.inning && game.half === half && game.status === 'live';
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
          <View style={ls.totalCell}><Text style={ls.headerText}>R</Text></View>
          <View style={ls.totalCell}><Text style={ls.headerText}>H</Text></View>
          <View style={ls.totalCell}><Text style={ls.headerText}>E</Text></View>
        </View>

        {/* Away / Home rows */}
        {(['top', 'bottom'] as const).map((half, rowIdx) => {
          const teamName  = rowIdx === 0 ? game.away_team  : game.home_team;
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
                  <View key={n} style={[ls.cell, isCurrent && ls.currentCell]}>
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
                <Text style={[ls.totalScore, { color: scoreColor }]}>{teamScore}</Text>
              </View>
              {/* H and E filled in by parent — placeholder cells so layout stays consistent */}
              <View style={ls.totalCell}>
                <Text style={ls.totalScore}> </Text>
              </View>
              <View style={ls.totalCell}>
                <Text style={ls.totalScore}> </Text>
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ── Line Score with H/E ────────────────────────────────────────────────────

function LineScoreFull({
  game,
  awayH,
  awayE,
  homeH,
  homeE,
}: {
  game: GameState;
  awayH: number;
  awayE: number;
  homeH: number;
  homeE: number;
}) {
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
      n === game.inning && game.half === half && game.status === 'live';
    return { val, isCurrent };
  }

  const rows = [
    {
      half: 'top' as const,
      teamName: game.away_team,
      teamScore: game.away_score,
      scoreColor: C.blueLight,
      h: awayH,
      e: awayE,
    },
    {
      half: 'bottom' as const,
      teamName: game.home_team,
      teamScore: game.home_score,
      scoreColor: C.red,
      h: homeH,
      e: homeE,
    },
  ];

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View>
        {/* Header */}
        <View style={ls.row}>
          <View style={ls.teamCell} />
          {innings.map((n) => (
            <View key={n} style={ls.cell}>
              <Text style={ls.headerText}>{n}</Text>
            </View>
          ))}
          <View style={ls.sepCell} />
          <View style={ls.totalCell}><Text style={ls.headerText}>R</Text></View>
          <View style={ls.totalCell}><Text style={ls.headerText}>H</Text></View>
          <View style={ls.totalCell}><Text style={ls.headerText}>E</Text></View>
        </View>

        {rows.map(({ half, teamName, teamScore, scoreColor, h, e }) => (
          <View key={half} style={ls.row}>
            <View style={ls.teamCell}>
              <Text style={ls.teamName}>{teamName}</Text>
            </View>
            {innings.map((n) => {
              const { val, isCurrent } = cell(half, n);
              return (
                <View key={n} style={[ls.cell, isCurrent && ls.currentCell]}>
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
              <Text style={[ls.totalScore, { color: scoreColor }]}>{teamScore}</Text>
            </View>
            <View style={ls.totalCell}>
              <Text style={[ls.totalScore, { color: scoreColor }]}>{h}</Text>
            </View>
            <View style={ls.totalCell}>
              <Text style={ls.totalMuted}>{e}</Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const ls = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  teamCell: { minWidth: 110, paddingHorizontal: 10, paddingVertical: 10 },
  teamName: { fontSize: 14, fontWeight: '700', color: C.text },
  cell: { width: 32, paddingVertical: 10, alignItems: 'center' },
  headerText: { fontSize: 11, fontWeight: '600', color: C.textDim, textTransform: 'uppercase' },
  cellText: { fontSize: 14, color: C.textMuted },
  emptyText: { color: C.border },
  currentCell: { backgroundColor: 'rgba(30,58,95,0.3)' },
  currentText: { color: C.text },
  sepCell: { width: 4, backgroundColor: C.surface },
  totalCell: { width: 36, alignItems: 'center', paddingVertical: 10 },
  totalScore: { fontSize: 15, fontWeight: '800' },
  totalMuted: { fontSize: 15, fontWeight: '600', color: C.textMuted },
});

// ── Batting Stats Table ────────────────────────────────────────────────────

function BattingTable({
  teamName,
  isHome,
  stats,
}: {
  teamName: string;
  isHome: boolean;
  stats: Map<string, BatterStats>;
}) {
  const teamColor = isHome ? C.red : C.blueLight;
  const entries = [...stats.entries()];

  const totals: BatterStats = { ab: 0, r: 0, h: 0, doubles: 0, triples: 0, hr: 0, rbi: 0, bb: 0, so: 0 };
  for (const [, s] of entries) {
    totals.ab += s.ab; totals.r += s.r; totals.h += s.h;
    totals.doubles += s.doubles; totals.triples += s.triples; totals.hr += s.hr;
    totals.rbi += s.rbi; totals.bb += s.bb; totals.so += s.so;
  }

  const cols = ['AB','R','H','2B','3B','HR','RBI','BB','SO','AVG'];

  return (
    <View style={bt.wrap}>
      {/* Team header */}
      <View style={[bt.teamHeader, { borderLeftColor: teamColor }]}>
        <Text style={[bt.teamHeaderText, { color: teamColor }]}>{teamName}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          {/* Column headers */}
          <View style={bt.row}>
            <View style={bt.nameCell}>
              <Text style={bt.colHeader}>Batter</Text>
            </View>
            {cols.map((c) => (
              <View key={c} style={bt.statCell}>
                <Text style={bt.colHeader}>{c}</Text>
              </View>
            ))}
          </View>

          {entries.length === 0 ? (
            <View style={bt.row}>
              <Text style={bt.noData}>No batting data yet</Text>
            </View>
          ) : (
            <>
              {entries.map(([name, s]) => (
                <View key={name} style={bt.row}>
                  <View style={bt.nameCell}>
                    <Text style={bt.nameText}>{name}</Text>
                  </View>
                  <View style={bt.statCell}><Text style={bt.statText}>{s.ab}</Text></View>
                  <View style={bt.statCell}>
                    <Text style={[bt.statText, s.r > 0 && bt.highlight]}>{s.r}</Text>
                  </View>
                  <View style={bt.statCell}>
                    <Text style={[bt.statText, s.h > 0 && bt.highlight]}>{s.h}</Text>
                  </View>
                  <View style={bt.statCell}><Text style={bt.statText}>{s.doubles}</Text></View>
                  <View style={bt.statCell}><Text style={bt.statText}>{s.triples}</Text></View>
                  <View style={bt.statCell}>
                    <Text style={[bt.statText, s.hr > 0 && bt.highlight]}>{s.hr}</Text>
                  </View>
                  <View style={bt.statCell}>
                    <Text style={[bt.statText, s.rbi > 0 && bt.highlight]}>{s.rbi}</Text>
                  </View>
                  <View style={bt.statCell}><Text style={bt.statText}>{s.bb}</Text></View>
                  <View style={bt.statCell}><Text style={bt.statText}>{s.so}</Text></View>
                  <View style={bt.statCell}>
                    <Text style={bt.statText}>{formatAVG(s.h, s.ab)}</Text>
                  </View>
                </View>
              ))}
              {/* Totals row */}
              <View style={[bt.row, bt.totalsRow]}>
                <View style={bt.nameCell}>
                  <Text style={bt.totalsText}>Totals</Text>
                </View>
                <View style={bt.statCell}><Text style={bt.totalsText}>{totals.ab}</Text></View>
                <View style={bt.statCell}><Text style={bt.totalsText}>{totals.r}</Text></View>
                <View style={bt.statCell}><Text style={bt.totalsText}>{totals.h}</Text></View>
                <View style={bt.statCell}><Text style={bt.totalsText}>{totals.doubles}</Text></View>
                <View style={bt.statCell}><Text style={bt.totalsText}>{totals.triples}</Text></View>
                <View style={bt.statCell}><Text style={bt.totalsText}>{totals.hr}</Text></View>
                <View style={bt.statCell}><Text style={bt.totalsText}>{totals.rbi}</Text></View>
                <View style={bt.statCell}><Text style={bt.totalsText}>{totals.bb}</Text></View>
                <View style={bt.statCell}><Text style={bt.totalsText}>{totals.so}</Text></View>
                <View style={bt.statCell}><Text style={bt.totalsText}></Text></View>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const bt = StyleSheet.create({
  wrap: {
    backgroundColor: C.surface,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  teamHeader: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderLeftWidth: 3,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  teamHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: C.borderDim,
  },
  nameCell: { width: 130, paddingHorizontal: 12, paddingVertical: 9 },
  statCell: { width: 40, alignItems: 'center', paddingVertical: 9 },
  colHeader: {
    fontSize: 10,
    fontWeight: '600',
    color: C.textDim,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  nameText: { fontSize: 13, color: C.textSub, fontWeight: '500' },
  statText: { fontSize: 13, color: C.textMuted, fontVariant: ['tabular-nums'] as any },
  highlight: { color: C.text, fontWeight: '700' },
  totalsRow: { backgroundColor: C.surface2, borderTopWidth: 1, borderTopColor: C.border },
  totalsText: { fontSize: 12, fontWeight: '700', color: C.textSub },
  noData: { color: C.textFaint, fontSize: 13, padding: 16 },
});

// ── Pitching Stats Table ───────────────────────────────────────────────────

function PitchingTable({
  teamName,
  isHome,
  stats,
}: {
  teamName: string;
  isHome: boolean;
  stats: Map<string, PitcherStats>;
}) {
  const teamColor = isHome ? C.red : C.blueLight;
  const entries = [...stats.entries()];
  const cols = ['IP','H','R','ER','BB','SO','ERA'];

  return (
    <View style={pt.wrap}>
      <View style={[pt.teamHeader, { borderLeftColor: teamColor }]}>
        <Text style={[pt.teamHeaderText, { color: teamColor }]}>{teamName}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          {/* Column headers */}
          <View style={pt.row}>
            <View style={pt.nameCell}>
              <Text style={pt.colHeader}>Pitcher</Text>
            </View>
            {cols.map((c) => (
              <View key={c} style={pt.statCell}>
                <Text style={pt.colHeader}>{c}</Text>
              </View>
            ))}
          </View>

          {entries.length === 0 ? (
            <View style={pt.row}>
              <Text style={pt.noData}>No pitching data yet</Text>
            </View>
          ) : (
            entries.map(([name, s]) => (
              <View key={name} style={pt.row}>
                <View style={pt.nameCell}>
                  <Text style={pt.nameText}>{name}</Text>
                </View>
                <View style={pt.statCell}>
                  <Text style={pt.statText}>{formatIP(s.ip_outs)}</Text>
                </View>
                <View style={pt.statCell}><Text style={pt.statText}>{s.h}</Text></View>
                <View style={pt.statCell}><Text style={pt.statText}>{s.r}</Text></View>
                <View style={pt.statCell}><Text style={pt.statText}>{s.er}</Text></View>
                <View style={pt.statCell}><Text style={pt.statText}>{s.bb}</Text></View>
                <View style={pt.statCell}><Text style={pt.statText}>{s.so}</Text></View>
                <View style={pt.statCell}>
                  <Text style={pt.statText}>{formatERA(s.er, s.ip_outs)}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const pt = StyleSheet.create({
  wrap: {
    backgroundColor: C.surface,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  teamHeader: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderLeftWidth: 3,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  teamHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: C.borderDim,
  },
  nameCell: { width: 130, paddingHorizontal: 12, paddingVertical: 9 },
  statCell: { width: 46, alignItems: 'center', paddingVertical: 9 },
  colHeader: {
    fontSize: 10,
    fontWeight: '600',
    color: C.textDim,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  nameText: { fontSize: 13, color: C.textSub, fontWeight: '500' },
  statText: { fontSize: 13, color: C.textMuted, fontVariant: ['tabular-nums'] as any },
  noData: { color: C.textFaint, fontSize: 13, padding: 16 },
});

// ── Main Screen ────────────────────────────────────────────────────────────

export default function BoxScoreScreen() {
  const params = useLocalSearchParams<{ game?: string }>();
  const router = useRouter();
  const [gameId, setGameId]   = useState(params.game ?? '');
  const [inputId, setInputId] = useState(params.game ?? '');
  const [game, setGame]       = useState<GameState | null>(null);
  const [plays, setPlays]     = useState<Play[]>([]);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    setError(null);
    try {
      const [g, ps] = await Promise.all([api.getState(id), api.getPlays(id)]);
      setGame(g);
      setPlays(ps);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!gameId) return;
    load(gameId);
    const interval = setInterval(() => load(gameId), 15000);
    return () => clearInterval(interval);
  }, [gameId, load]);

  // ── No game entered ──────────────────────────────────────────────────────
  if (!gameId) {
    return (
      <View style={bx.center}>
        <Text style={bx.title}>Box Score</Text>
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

  // ── Error ────────────────────────────────────────────────────────────────
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

  // ── Loading ──────────────────────────────────────────────────────────────
  if (!game) {
    return (
      <View style={bx.center}>
        <Text style={bx.loadingText}>Loading box score…</Text>
      </View>
    );
  }

  // ── Compute stats ────────────────────────────────────────────────────────
  const playsOldestFirst = [...plays].reverse();
  const awayPlays  = playsOldestFirst.filter((p) => p.half === 'top');
  const homePlays  = playsOldestFirst.filter((p) => p.half === 'bottom');

  const { awayH, awayE, homeH, homeE } = computeHE(playsOldestFirst);

  const awayBatting = computeBatting(awayPlays);
  const homeBatting = computeBatting(homePlays);

  // Away pitcher pitches in bottom half; home pitcher pitches in top half
  const awayPitching = computePitching(homePlays);
  const homePitching = computePitching(awayPlays);

  const isLive = game.status === 'live';

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={bx.container}>
      {/* Nav */}
      <View style={bx.navRow}>
        <TouchableOpacity
          style={bx.navBtn}
          onPress={() => router.push({ pathname: '/viewer', params: { game: game.id } })}
        >
          <Text style={bx.navText}>Watch</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={bx.navBtn}
          onPress={() => router.push('/scorer')}
        >
          <Text style={bx.navText}>Scorer</Text>
        </TouchableOpacity>
      </View>

      {/* Title */}
      <Text style={bx.gameTitle}>{game.away_team} @ {game.home_team}</Text>

      {/* Status pill */}
      <View style={[bx.pill, isLive ? bx.pillLive : bx.pillFinal]}>
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
          <Text style={[bx.summaryScore, { color: C.blueLight }]}>{game.away_score}</Text>
        </View>
        <Text style={bx.summaryDash}>–</Text>
        <View style={bx.summaryTeam}>
          <Text style={bx.summaryTeamName}>{game.home_team}</Text>
          <Text style={[bx.summaryScore, { color: C.red }]}>{game.home_score}</Text>
        </View>
      </View>

      {/* Line Score */}
      <Text style={bx.sectionTitle}>Line Score</Text>
      <View style={bx.tableWrap}>
        <LineScoreFull
          game={game}
          awayH={awayH}
          awayE={awayE}
          homeH={homeH}
          homeE={homeE}
        />
      </View>

      {/* Batting */}
      <Text style={bx.sectionTitle}>Batting</Text>
      <BattingTable teamName={game.away_team} isHome={false} stats={awayBatting} />
      <BattingTable teamName={game.home_team} isHome={true}  stats={homeBatting} />

      {/* Pitching */}
      <Text style={bx.sectionTitle}>Pitching</Text>
      <PitchingTable teamName={game.away_team} isHome={false} stats={awayPitching} />
      <PitchingTable teamName={game.home_team} isHome={true}  stats={homePitching} />
    </ScrollView>
  );
}

const bx = StyleSheet.create({
  center: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' },
  title:    { fontSize: 24, fontWeight: '800', color: C.text, marginBottom: 8 },
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
  btnText:     { color: 'white', fontSize: 16, fontWeight: '700' },
  loadingText: { color: C.textDim, fontSize: 16 },
  errorText:   { color: C.red, fontSize: 16, marginBottom: 16 },
  linkText:    { color: C.blueLight, fontSize: 14 },

  container: { padding: 16, paddingBottom: 48 },

  navRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  navBtn: { backgroundColor: C.surface, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  navText: { color: C.blueLight, fontSize: 13 },

  gameTitle: { fontSize: 20, fontWeight: '800', color: C.text, marginBottom: 8 },

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
  pillLive:  { backgroundColor: '#1c1917', borderColor: C.redBright },
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
  summaryTeam:     { flex: 1, alignItems: 'center' },
  summaryTeamName: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textDim,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  summaryScore: { fontSize: 48, fontWeight: '800', lineHeight: 52 },
  summaryDash:  { fontSize: 32, color: C.border },

  sectionTitle: {
    fontSize: 11,
    color: C.textDim,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
    marginBottom: 10,
  },
  tableWrap: {
    backgroundColor: C.surface,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 20,
  },
});
