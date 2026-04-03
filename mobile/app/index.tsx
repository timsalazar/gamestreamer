import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { C } from '../lib/colors';

interface Card {
  icon: string;
  title: string;
  titleColor: string;
  iconBg: string;
  desc: string;
  route: '/scorer' | '/viewer' | '/streamer';
}

const CARDS: Card[] = [
  {
    icon: '📋',
    title: 'Scorer',
    titleColor: C.blueLight,
    iconBg: '#172554',
    desc: 'Keep score at the field using plain-English play input',
    route: '/scorer',
  },
  {
    icon: '📡',
    title: 'Streamer',
    titleColor: C.red,
    iconBg: '#1c1917',
    desc: 'Link your live stream and broadcast the game',
    route: '/streamer',
  },
  {
    icon: '📺',
    title: 'Viewer',
    titleColor: C.purple,
    iconBg: '#162032',
    desc: 'Watch the game live with real-time score updates',
    route: '/viewer',
  },
];

export default function HomeScreen() {
  const router = useRouter();

  return (
    <ScrollView contentContainerStyle={s.container}>
      <Text style={s.logo}>⚾</Text>
      <Text style={s.title}>GameStreamer</Text>
      <Text style={s.subtitle}>Youth baseball live scoring & streaming</Text>

      <View style={s.cards}>
        {CARDS.map((card) => (
          <TouchableOpacity
            key={card.route}
            style={s.card}
            onPress={() => router.push(card.route)}
            activeOpacity={0.75}
          >
            <View style={[s.iconWrap, { backgroundColor: card.iconBg }]}>
              <Text style={s.iconText}>{card.icon}</Text>
            </View>
            <View style={s.cardBody}>
              <Text style={[s.cardTitle, { color: card.titleColor }]}>
                {card.title}
              </Text>
              <Text style={s.cardDesc}>{card.desc}</Text>
            </View>
            <Text style={s.arrow}>›</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  logo: { fontSize: 48, marginBottom: 8 },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: C.text,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: C.textDim,
    marginBottom: 40,
    textAlign: 'center',
  },
  cards: { width: '100%', maxWidth: 380, gap: 12 },
  card: {
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderColor: C.borderDim,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { fontSize: 22 },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 3 },
  cardDesc: { fontSize: 13, color: C.textDim, lineHeight: 18 },
  arrow: { fontSize: 20, color: C.border },
});
