import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { C } from '../lib/colors';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: C.bg },
          headerTintColor: C.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: C.bg },
          headerTitleStyle: { fontWeight: '700' },
        }}
      >
        <Stack.Screen
          name="index"
          options={{ title: 'GameStreamer', headerLargeTitle: true }}
        />
        <Stack.Screen name="scorer" options={{ title: 'Scorer' }} />
        <Stack.Screen name="viewer" options={{ title: 'Watch Game' }} />
        <Stack.Screen name="streamer" options={{ title: 'Streamer Setup' }} />
        <Stack.Screen name="boxscore" options={{ title: 'Box Score' }} />
      </Stack>
    </>
  );
}
