import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { createClient } from '@supabase/supabase-js';
import { API_BASE } from '../lib/api';
import { C } from '../lib/colors';

// ── Supabase client ────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://izddxiligsqzbnorcwlf.supabase.co';
const SUPABASE_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6ZGR4aWxpZ3NxemJub3Jjd2xmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MTY2NTcsImV4cCI6MjA5MDM5MjY1N30.NMb5P8Iaxdc4TpuNhXbGwMyP7reL2ruvdlh-MUNJTdk';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// ── Types ──────────────────────────────────────────────────────────────────

interface Player {
  batting_order: number;
  name: string;
  position: string;
  number: string;
}

const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'PH'];

// ── Position picker (inline cycle) ────────────────────────────────────────

function PositionPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (pos: string) => void;
}) {
  function cycle() {
    const current = POSITIONS.indexOf(value);
    const next = POSITIONS[(current + 1) % POSITIONS.length];
    onChange(next);
  }

  return (
    <TouchableOpacity style={ct.posPicker} onPress={cycle} activeOpacity={0.7}>
      <Text style={ct.posPickerText}>{value || 'Pos'}</Text>
    </TouchableOpacity>
  );
}

// ── Player Row ─────────────────────────────────────────────────────────────

function PlayerRow({
  player,
  index,
  onChange,
  onRemove,
}: {
  player: Player;
  index: number;
  onChange: (idx: number, field: keyof Player, value: string | number) => void;
  onRemove: (idx: number) => void;
}) {
  return (
    <View style={ct.playerRow}>
      <TextInput
        style={[ct.cell, ct.cellOrder]}
        value={String(player.batting_order)}
        onChangeText={(v) => onChange(index, 'batting_order', parseInt(v) || index + 1)}
        keyboardType="number-pad"
        maxLength={1}
        placeholder="#"
        placeholderTextColor={C.textFaint}
        selectTextOnFocus
      />
      <TextInput
        style={[ct.cell, ct.cellName]}
        value={player.name}
        onChangeText={(v) => onChange(index, 'name', v)}
        placeholder="Player name"
        placeholderTextColor={C.textFaint}
        autoCapitalize="words"
        returnKeyType="next"
      />
      <PositionPicker
        value={player.position}
        onChange={(pos) => onChange(index, 'position', pos)}
      />
      <TextInput
        style={[ct.cell, ct.cellNumber]}
        value={player.number}
        onChangeText={(v) => onChange(index, 'number', v)}
        placeholder="#"
        placeholderTextColor={C.textFaint}
        keyboardType="number-pad"
        maxLength={3}
        selectTextOnFocus
      />
      <TouchableOpacity
        style={ct.removeBtn}
        onPress={() => onRemove(index)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={ct.removeBtnText}>×</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Create Team Screen ────────────────────────────────────────────────────

export default function CreateTeamScreen() {
  const router = useRouter();
  const [teamName, setTeamName] = useState('');
  const [players, setPlayers] = useState<Player[]>(() =>
    Array.from({ length: 9 }, (_, i) => ({
      batting_order: i + 1,
      name: '',
      position: '',
      number: '',
    }))
  );
  const [saving, setSaving] = useState(false);

  // ── Player mutations ─────────────────────────────────────────────────────

  const updatePlayer = useCallback(
    (idx: number, field: keyof Player, value: string | number) => {
      setPlayers((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], [field]: value };
        return next;
      });
    },
    []
  );

  const addPlayer = useCallback(() => {
    setPlayers((prev) => {
      const maxOrder = prev.length
        ? Math.max(...prev.map((p) => p.batting_order))
        : 0;
      return [
        ...prev,
        { batting_order: maxOrder + 1, name: '', position: '', number: '' },
      ];
    });
  }, []);

  const removePlayer = useCallback((idx: number) => {
    setPlayers((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  // ── Save ─────────────────────────────────────────────────────────────────

  async function saveTeam() {
    const name = teamName.trim();

    if (!name) {
      Alert.alert('Team name required', 'Please enter a name for the team.');
      return;
    }
    if (name.length > 50) {
      Alert.alert('Name too long', 'Team name must be 50 characters or fewer.');
      return;
    }

    const cleanPlayers = players
      .filter((p) => p.name.trim())
      .map((p) => ({
        batting_order: p.batting_order,
        name: p.name.trim(),
        position: p.position || null,
        number: p.number.trim() || null,
      }));

    setSaving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        Alert.alert('Not signed in', 'Please sign in to save a team.');
        return;
      }

      const res = await fetch(`${API_BASE}/api/teams`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, players: cleanPlayers }),
      });
      const data = await res.json();

      if (!res.ok) {
        Alert.alert('Error', data.error ?? 'Failed to save team.');
        return;
      }

      // Navigate back to teams list
      if (router.canGoBack()) {
        router.back();
      } else {
        router.push('/teams');
      }
    } catch (err) {
      Alert.alert('Network error', 'Could not reach the server. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={88}
    >
      <ScrollView
        style={ct.scroll}
        contentContainerStyle={ct.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* Team name */}
        <View style={ct.card}>
          <Text style={ct.sectionLabel}>Team Name</Text>
          <TextInput
            style={ct.nameInput}
            value={teamName}
            onChangeText={setTeamName}
            placeholder="e.g. River City Rockets"
            placeholderTextColor={C.textFaint}
            autoCapitalize="words"
            autoFocus
            maxLength={50}
            returnKeyType="done"
          />
          <Text style={[ct.charCount, teamName.length > 45 && ct.charCountWarn]}>
            {teamName.length} / 50
          </Text>
        </View>

        {/* Player roster */}
        <View style={ct.card}>
          <Text style={ct.sectionLabel}>Player Roster</Text>

          {/* Column headers */}
          <View style={ct.headerRow}>
            <Text style={[ct.headerCell, { width: 36 }]}>#</Text>
            <Text style={[ct.headerCell, { flex: 1 }]}>Name</Text>
            <Text style={[ct.headerCell, { width: 52 }]}>Pos</Text>
            <Text style={[ct.headerCell, { width: 44 }]}>Jersey</Text>
            <View style={{ width: 28 }} />
          </View>

          {players.map((player, idx) => (
            <PlayerRow
              key={idx}
              player={player}
              index={idx}
              onChange={updatePlayer}
              onRemove={removePlayer}
            />
          ))}

          <TouchableOpacity
            style={ct.addPlayerBtn}
            onPress={addPlayer}
            activeOpacity={0.7}
          >
            <Text style={ct.addPlayerText}>+ Add Player</Text>
          </TouchableOpacity>
        </View>

        {/* Save button */}
        <TouchableOpacity
          style={[ct.saveBtn, saving && ct.saveBtnDisabled]}
          onPress={saveTeam}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={ct.saveBtnText}>Save Team</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const ct = StyleSheet.create({
  scroll: { flex: 1 },
  container: { padding: 16, paddingBottom: 48 },

  card: {
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textDim,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },

  nameInput: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: C.text,
  },
  charCount: {
    fontSize: 11,
    color: C.textFaint,
    textAlign: 'right',
    marginTop: 4,
  },
  charCountWarn: { color: C.amber },

  // Row headers
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  headerCell: {
    fontSize: 10,
    color: C.textDim,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Player row
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  cell: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    padding: 8,
    fontSize: 13,
    color: C.text,
  },
  cellOrder: { width: 36, textAlign: 'center' },
  cellName: { flex: 1 },
  cellNumber: { width: 44, textAlign: 'center' },

  // Position picker
  posPicker: {
    width: 52,
    height: 36,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  posPickerText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.textSub,
  },

  // Remove button
  removeBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: {
    fontSize: 20,
    color: C.textFaint,
    lineHeight: 22,
  },

  addPlayerBtn: {
    backgroundColor: C.border,
    borderWidth: 1,
    borderColor: C.textFaint,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  addPlayerText: {
    fontSize: 13,
    color: C.textMuted,
    fontWeight: '600',
  },

  saveBtn: {
    backgroundColor: C.green,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: 'white', fontSize: 16, fontWeight: '700' },
});
