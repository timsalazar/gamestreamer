import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
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

interface Team {
  id: string;
  name: string;
  players: unknown[] | null;
  role: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function playerLabel(players: unknown[] | null): string {
  const count = Array.isArray(players) ? players.length : 0;
  return count === 1 ? '1 player' : `${count} players`;
}

// ── Screen ─────────────────────────────────────────────────────────────────

export default function TeamsScreen() {
  const router = useRouter();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Check auth & fetch teams on mount
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          if (!cancelled) {
            // Login screen may not exist yet — show a graceful message
            setError('You must be signed in to view your teams.');
            setLoading(false);
            setAuthChecked(true);
          }
          return;
        }

        setAuthChecked(true);

        const res = await fetch(`${API_BASE}/api/teams`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (!cancelled) {
          if (!res.ok) {
            const data: { error?: string } = await res.json().catch(() => ({}));
            setError(data.error ?? `Failed to load teams (${res.status})`);
          } else {
            const data: Team[] = await res.json();
            setTeams(data);
          }
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError('Network error — could not load teams.');
          setLoading(false);
          setAuthChecked(true);
        }
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    // Navigate back to root; index.tsx will redirect to login once it detects no session
    router.replace('/');
  }, [router]);

  const handleCreateTeam = useCallback(() => {
    router.push('/create-team' as never);
  }, [router]);

  // ── Loading state ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={C.blue} />
        <Text style={s.loadingText}>Loading teams…</Text>
      </View>
    );
  }

  // ── Auth / network error state ───────────────────────────────────────────
  if (error) {
    return (
      <View style={s.centered}>
        <Text style={s.errorText}>{error}</Text>
        {!authChecked && (
          <TouchableOpacity style={s.btnPrimary} onPress={() => router.replace('/')}>
            <Text style={s.btnPrimaryText}>Go to Home</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // ── Empty state ──────────────────────────────────────────────────────────
  if (teams.length === 0) {
    return (
      <View style={s.centered}>
        <Text style={s.emptyIcon}>⚾</Text>
        <Text style={s.emptyTitle}>No teams yet</Text>
        <Text style={s.emptySub}>
          Create your first team to start building rosters and scoring games.
        </Text>
        <TouchableOpacity style={s.btnPrimary} onPress={handleCreateTeam}>
          <Text style={s.btnPrimaryText}>Create Team</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Team list ────────────────────────────────────────────────────────────
  return (
    <FlatList
      data={teams}
      keyExtractor={(item) => item.id}
      contentContainerStyle={s.listContent}
      ItemSeparatorComponent={() => <View style={s.separator} />}
      ListHeaderComponent={
        <View style={s.listHeader}>
          <Text style={s.pageTitle}>My Teams</Text>
          <Text style={s.pageSub}>Manage your rosters and lineups</Text>
        </View>
      }
      ListFooterComponent={
        <TouchableOpacity style={s.btnNew} onPress={handleCreateTeam}>
          <Text style={s.btnNewText}>＋  New Team</Text>
        </TouchableOpacity>
      }
      renderItem={({ item }) => {
        const isOwner = item.role === 'owner';
        return (
          <TouchableOpacity
            style={s.card}
            activeOpacity={0.75}
            onPress={() => router.push({ pathname: '/team', params: { id: item.id } } as never)}
          >
            <View style={s.cardBody}>
              <Text style={s.cardName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={s.cardMeta}>{playerLabel(item.players)}</Text>
            </View>
            <View style={s.cardRight}>
              <View style={[s.badge, isOwner ? s.badgeOwner : s.badgeShared]}>
                <Text style={[s.badgeText, isOwner ? s.badgeOwnerText : s.badgeSharedText]}>
                  {isOwner ? 'Owner' : 'Shared'}
                </Text>
              </View>
              <Text style={s.arrow}>›</Text>
            </View>
          </TouchableOpacity>
        );
      }}
    />
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Layouts
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: C.bg,
  },
  listContent: {
    padding: 20,
    paddingBottom: 40,
  },

  // Header
  listHeader: {
    marginBottom: 20,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: C.text,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  pageSub: {
    fontSize: 14,
    color: C.textDim,
  },

  // Loading
  loadingText: {
    marginTop: 14,
    fontSize: 14,
    color: C.textDim,
  },

  // Error
  errorText: {
    fontSize: 15,
    color: '#fca5a5',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },

  // Empty
  emptyIcon: { fontSize: 52, marginBottom: 16 },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: C.text,
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 14,
    color: C.textDim,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
  },

  // Card
  separator: { height: 12 },
  card: {
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: C.borderDim,
  },
  cardBody: { flex: 1 },
  cardName: {
    fontSize: 17,
    fontWeight: '700',
    color: C.text,
    marginBottom: 4,
  },
  cardMeta: {
    fontSize: 13,
    color: C.textDim,
  },
  cardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  arrow: {
    fontSize: 20,
    color: C.border,
  },

  // Badges
  badge: {
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  badgeOwner: { backgroundColor: '#14532d' },
  badgeShared: { backgroundColor: '#1e3a5f' },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  badgeOwnerText: { color: '#4ade80' },
  badgeSharedText: { color: '#60a5fa' },

  // Buttons
  btnPrimary: {
    backgroundColor: C.blue,
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  btnPrimaryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  btnNew: {
    marginTop: 20,
    backgroundColor: C.blue,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnNewText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
