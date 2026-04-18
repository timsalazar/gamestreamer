import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { TouchableOpacity, Text } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { C } from '../lib/colors';

const SUPABASE_URL = 'https://izddxiligsqzbnorcwlf.supabase.co';
const SUPABASE_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6ZGR4aWxpZ3NxemJub3Jjd2xmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MTY2NTcsImV4cCI6MjA5MDM5MjY1N30.NMb5P8Iaxdc4TpuNhXbGwMyP7reL2ruvdlh-MUNJTdk';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

function SignOutButton() {
  const router = useRouter();
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/');
  };
  return (
    <TouchableOpacity onPress={handleSignOut} style={{ marginRight: 4, padding: 6 }}>
      <Text style={{ color: C.blueLight, fontSize: 14, fontWeight: '600' }}>Sign Out</Text>
    </TouchableOpacity>
  );
}

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
        <Stack.Screen
          name="teams"
          options={{
            title: 'My Teams',
            headerRight: () => <SignOutButton />,
          }}
        />
        <Stack.Screen name="create-team" options={{ title: 'Create Team' }} />
      </Stack>
    </>
  );
}
