/**
 * WEB PREVIEW ONLY (Metro resolves App.web.tsx for the web platform; native iOS/
 * Android keep App.tsx untouched). Renders the real HomeView with fixture data so
 * the Living Dark visuals/animations can be seen in a browser on Windows — without
 * booting the native modules (SQLite / SecureStore / HealthKit) that have no web
 * support. A small toggle flips between workout day and rest day.
 */
import React, { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { initI18n } from '@/i18n';
import { HomeView } from '@/screens/home/HomeView';
import { color } from '@/design/tokens';

export default function App() {
  const [ready, setReady] = useState(false);
  const [resting, setResting] = useState(false);

  useEffect(() => {
    initI18n().then(() => setReady(true));
  }, []);

  if (!ready) return <View style={styles.canvas} />;

  const dateLabel = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <View style={styles.phone}>
        <HomeView
          resting={resting}
          dayName="Upper A"
          muscles="Chest · Shoulders · Triceps"
          greetingPart="morning"
          name="Alex"
          trainedThisWeek={4}
          startError={false}
          dateLabel={dateLabel}
          onStart={() => {}}
          workouts={[
            { id: 'd0', name: 'Upper A', muscles: 'Chest · Shoulders · Triceps' },
            { id: 'd1', name: 'Lower A', muscles: 'Quads · Glutes' },
          ]}
          onChooseWorkout={() => {}}
          onProgram={() => {}}
          onHistory={() => {}}
          onSettings={() => {}}
        />
      </View>
      <Pressable onPress={() => setResting((r) => !r)} style={styles.toggle}>
        <Text style={styles.toggleText}>{resting ? 'Show workout day' : 'Show rest day'}</Text>
      </Pressable>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: color.bgBase },
  // Constrain to a phone-ish width so the browser preview reads like the device.
  phone: { flex: 1, width: '100%', maxWidth: 420, alignSelf: 'center', backgroundColor: color.bgBase },
  toggle: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: color.borderSubtle,
  },
  toggleText: { color: color.textSecondary, fontSize: 13 },
});
