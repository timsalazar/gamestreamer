import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Share,
  ActivityIndicator,
  Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { api, GameState, Play, ordinalInning } from '../lib/api';
import { Diamond } from '../components/Diamond';
import { CountDots } from '../components/CountDots';
import { C } from '../lib/colors';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? '';

// ── Setup Screen ──────────────────────────────────────────────────────────

function SetupScreen({
  onGameCreated,
}: {
  onGameCreated: (game: GameState) => void;
}) {
  const [away, setAway] = useState('');
  const [home, setHome] = useState('');
  const [streamUrl, setStreamUrl] = useState('');
  const [loading, setLoading] = useState(false);

  async function createGame() {
    if (!away.trim() || !home.trim()) {
      Alert.alert('Missing teams', 'Enter both team names.');
      return;
    }
    setLoading(true);
    try {
      const game = await api.createGame(
        away.trim(),
        home.trim(),
        streamUrl.trim() || null
      );
      onGameCreated(game);
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={su.container}>
      <Text style={su.emoji}>⚾</Text>
      <Text style={su.title}>New Game</Text>
      <Text style={su.subtitle}>Enter the teams to start scoring</Text>

      <View style={su.form}>
        <TextInput
          style={su.input}
          placeholder="Away team name"
          placeholderTextColor={C.textFaint}
          value={away}
          onChangeText={setAway}
          autoCapitalize="words"
          returnKeyType="next"
        />
        <TextInput
          style={su.input}
          placeholder="Home team name"
          placeholderTextColor={C.textFaint}
          value={home}
          onChangeText={setHome}
          autoCapitalize="words"
          returnKeyType="next"
        />
        <TextInput
          style={su.input}
          placeholder="Stream URL (optional)"
          placeholderTextColor={C.textFaint}
          value={streamUrl}
          onChangeText={setStreamUrl}
          keyboardType="url"
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={createGame}
        />
        <TouchableOpacity
          style={[su.btn, loading && su.btnDisabled]}
          onPress={createGame}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={su.btnText}>Start Game</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const su = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  emoji: { fontSize: 48, textAlign: 'center', marginBottom: 8 },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: C.text,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: C.textDim,
    textAlign: 'center',
    marginBottom: 32,
  },
  form: { gap: 12 },
  input: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: C.text,
  },
  btn: {
    backgroundColor: C.green,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: 'white', fontSize: 16, fontWeight: '700' },
});

// ── Scoring Screen ────────────────────────────────────────────────────────

function ScoringScreen({
  initialGame,
}: {
  initialGame: GameState;
}) {
  const router = useRouter();
  const [game, setGame] = useState<GameState>(initialGame);
  const [playInput, setPlayInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recentPlays, setRecentPlays] = useState<Play[]>(
    initialGame.recent_plays ?? []
  );
  const inputRef = useRef<TextInput>(null);

  // ── Play submission ──────────────────────────────────────────────────────

  async function submitPlay() {
    const text = playInput.trim();
    if (!text || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const data = await api.submitPlay(game.id, text);
      setGame(data.game);
      setRecentPlays((prev) => [data.play, ...prev]);
      setPlayInput('');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function undoPlay() {
    Alert.alert('Undo', 'Undo the last play?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Undo',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.undoPlay(game.id);
            const fresh = await api.getState(game.id);
            setGame(fresh);
            setRecentPlays(fresh.recent_plays ?? []);
          } catch (e) {
            Alert.alert('Error', (e as Error).message);
          }
        },
      },
    ]);
  }

  // ── Count adjustment ─────────────────────────────────────────────────────

  async function adjustCount(field: 'balls' | 'strikes', delta: number) {
    const max = field === 'balls' ? 3 : 2;
    const next = Math.max(0, Math.min(max, (game[field] ?? 0) + delta));
    setGame((g) => ({ ...g, [field]: next }));
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await api.updateCount(game.id, field, next);
  }

  // ── Share ────────────────────────────────────────────────────────────────

  async function shareViewerLink() {
    const webUrl = WEB_URL
      ? `${WEB_URL}/viewer.html?game=${game.id}`
      : `Game ID: ${game.id}`;
    try {
      await Share.share({
        message: `Watch the game live: ${webUrl}`,
        url: WEB_URL ? `${WEB_URL}/viewer.html?game=${game.id}` : undefined,
      });
    } catch (_) {}
  }

  async function copyLink() {
    const url = WEB_URL
      ? `${WEB_URL}/viewer.html?game=${game.id}`
      : game.id;
    await Clipboard.setStringAsync(url);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const runners = game.runners ?? {};

  return (
    <ScrollView style={sc.scroll} contentContainerStyle={sc.container}>

      {/* Scoreboard */}
      <View style={sc.scoreboard}>
        <View style={sc.teamCol}>
          <Text style={sc.teamName}>{game.away_team}</Text>
          <Text style={[sc.score, { color: C.blueLight }]}>{game.away_score}</Text>
        </View>
        <Text style={sc.dash}>–</Text>
        <View style={sc.teamCol}>
          <Text style={sc.teamName}>{game.home_team}</Text>
          <Text style={[sc.score, { color: C.red }]}>{game.home_score}</Text>
        </View>
      </View>

      {/* Inning */}
      <View style={sc.inningBlock}>
        <Text style={sc.inningText}>
          {ordinalInning(game.inning, game.half)}
        </Text>
      </View>

      {/* Outs + Diamond */}
      <View style={sc.fieldRow}>
        <View style={sc.block}>
          <Text style={sc.blockLabel}>Outs</Text>
          <View style={sc.outDots}>
            {[0, 1, 2].map((i) => (
              <View
                key={i}
                style={[
                  sc.outDot,
                  i < game.outs && { backgroundColor: C.amber, borderColor: C.amberLight },
                ]}
              />
            ))}
          </View>
        </View>
        <View style={[sc.block, sc.diamondBlock]}>
          <Text style={sc.blockLabel}>Runners</Text>
          <Diamond
            first={!!runners.first}
            second={!!runners.second}
            third={!!runners.third}
          />
        </View>
      </View>

      {/* Count */}
      <View style={sc.countCard}>
        {/* Balls */}
        <View style={sc.countSide}>
          <Text style={sc.countLabel}>Balls</Text>
          <View style={sc.countRow}>
            <TouchableOpacity
              style={sc.countBtn}
              onPress={() => adjustCount('balls', -1)}
            >
              <Text style={sc.countBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={[sc.countNum, { color: C.greenLight }]}>
              {game.balls ?? 0}
            </Text>
            <TouchableOpacity
              style={sc.countBtn}
              onPress={() => adjustCount('balls', 1)}
            >
              <Text style={sc.countBtnText}>+</Text>
            </TouchableOpacity>
          </View>
          <CountDots
            value={game.balls ?? 0}
            max={4}
            activeColor={C.greenLight}
            activeBorder={C.greenLight}
          />
        </View>

        <View style={sc.countDivider} />

        {/* Strikes */}
        <View style={sc.countSide}>
          <Text style={sc.countLabel}>Strikes</Text>
          <View style={sc.countRow}>
            <TouchableOpacity
              style={sc.countBtn}
              onPress={() => adjustCount('strikes', -1)}
            >
              <Text style={sc.countBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={[sc.countNum, { color: C.red }]}>
              {game.strikes ?? 0}
            </Text>
            <TouchableOpacity
              style={sc.countBtn}
              onPress={() => adjustCount('strikes', 1)}
            >
              <Text style={sc.countBtnText}>+</Text>
            </TouchableOpacity>
          </View>
          <CountDots
            value={game.strikes ?? 0}
            max={3}
            activeColor={C.red}
            activeBorder={C.red}
          />
        </View>
      </View>

      {/* Play input */}
      <View style={sc.inputCard}>
        <Text style={sc.inputLabel}>Describe the play</Text>
        <TextInput
          ref={inputRef}
          style={sc.textarea}
          placeholder={`e.g. "Johnny singled, runner scored"`}
          placeholderTextColor={C.textFaint}
          value={playInput}
          onChangeText={setPlayInput}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          returnKeyType="send"
          onSubmitEditing={submitPlay}
          blurOnSubmit={false}
        />
        <View style={sc.btnRow}>
          <TouchableOpacity
            style={[sc.submitBtn, isSubmitting && sc.submitDisabled]}
            onPress={submitPlay}
            disabled={isSubmitting}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Text style={sc.submitText}>Submit Play</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={sc.undoBtn} onPress={undoPlay}>
            <Text style={sc.undoText}>↩</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Share banner */}
      <View style={sc.shareBanner}>
        <Text style={sc.shareTitle}>📺 Viewer Link</Text>
        <Text style={sc.gameIdText}>Game ID: {game.id}</Text>
        <View style={sc.shareButtons}>
          <TouchableOpacity
            style={[sc.shareBtn, { flex: 1, backgroundColor: C.greenDark }]}
            onPress={copyLink}
            activeOpacity={0.8}
          >
            <Text style={sc.shareBtnText}>Copy Link</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[sc.shareBtn, { flex: 1, backgroundColor: C.blueDark }]}
            onPress={shareViewerLink}
            activeOpacity={0.8}
          >
            <Text style={sc.shareBtnText}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[sc.shareBtn, { backgroundColor: C.surface }]}
            onPress={() =>
              router.push({ pathname: '/viewer', params: { game: game.id } })
            }
            activeOpacity={0.8}
          >
            <Text style={sc.shareBtnText}>Watch</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Play log */}
      <View style={sc.logCard}>
        <Text style={sc.logTitle}>Recent Plays</Text>
        {recentPlays.length === 0 ? (
          <Text style={sc.noPlays}>No plays yet</Text>
        ) : (
          recentPlays.map((p, i) => (
            <View key={p.id ?? i} style={sc.playItem}>
              {p.structured_play?.play_type ? (
                <View style={sc.badge}>
                  <Text style={sc.badgeText}>
                    {p.structured_play.play_type}
                  </Text>
                </View>
              ) : null}
              <Text style={sc.playText}>{p.raw_input}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const sc = StyleSheet.create({
  scroll: { flex: 1 },
  container: { padding: 16, paddingBottom: 40 },

  // Scoreboard
  scoreboard: {
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  teamCol: { flex: 1, alignItems: 'center' },
  teamName: {
    fontSize: 12,
    fontWeight: '700',
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  score: { fontSize: 52, fontWeight: '800', lineHeight: 56 },
  dash: { fontSize: 36, color: C.textFaint, fontWeight: '300' },

  // Inning
  inningBlock: {
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  inningText: { fontSize: 18, fontWeight: '700', color: C.textSub },

  // Field
  fieldRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  block: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 12,
  },
  diamondBlock: { alignItems: 'center' },
  blockLabel: {
    fontSize: 10,
    color: C.textDim,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    fontWeight: '600',
  },
  outDots: { flexDirection: 'row', gap: 8 },
  outDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: C.border,
    borderWidth: 2,
    borderColor: C.textFaint,
  },

  // Count
  countCard: {
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    marginBottom: 12,
  },
  countSide: { flex: 1, alignItems: 'center', gap: 8 },
  countDivider: { width: 1, backgroundColor: C.border, marginHorizontal: 8 },
  countLabel: {
    fontSize: 10,
    color: C.textDim,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
  },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  countBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBtnText: { color: C.textMuted, fontSize: 20, lineHeight: 22 },
  countNum: { fontSize: 32, fontWeight: '800', minWidth: 28, textAlign: 'center' },

  // Input
  inputCard: {
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  inputLabel: { fontSize: 12, color: C.textDim, marginBottom: 8 },
  textarea: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: C.text,
    minHeight: 80,
  },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  submitBtn: {
    flex: 1,
    backgroundColor: C.blue,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: 'white', fontSize: 16, fontWeight: '700' },
  undoBtn: {
    backgroundColor: C.border,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 48,
  },
  undoText: { color: C.textMuted, fontSize: 18 },

  // Share banner
  shareBanner: {
    backgroundColor: C.surfaceDeep,
    borderWidth: 1,
    borderColor: C.greenDark,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    gap: 8,
  },
  shareTitle: {
    fontSize: 11,
    color: C.greenLight,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  gameIdText: {
    fontSize: 12,
    color: C.greenLight,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  shareButtons: { flexDirection: 'row', gap: 8 },
  shareBtn: {
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  shareBtnText: { color: 'white', fontSize: 13, fontWeight: '600' },

  // Play log
  logCard: {
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 16,
  },
  logTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: C.textDim,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  noPlays: { color: C.textFaint, fontSize: 14 },
  playItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.borderDim,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'flex-start',
  },
  badge: {
    backgroundColor: C.blueDeep,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    color: C.blueLight,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  playText: { fontSize: 14, color: C.textSub, flexShrink: 1 },
});

// ── Root export ───────────────────────────────────────────────────────────

export default function ScorerScreen() {
  const [game, setGame] = useState<GameState | null>(null);

  if (!game) {
    return <SetupScreen onGameCreated={setGame} />;
  }
  return <ScoringScreen initialGame={game} />;
}
