/**
 * WEB PREVIEW GALLERY — the v7 acceptance harness (NOT shipped).
 *
 * Metro resolves `App.web.tsx` for the web platform only; native iOS/Android keep
 * `App.tsx` untouched. The handoff's build protocol is "build one screen, put your
 * output next to `screenshots/screens/<id>.png`, reconcile until they match" — this
 * renders exactly one screen at a time, at the handoff's own 390 × 844, so that
 * comparison is a screenshot away.
 *
 * It deliberately does NOT boot `AppProvider` / `SessionProvider`: those reach for
 * SQLite, HealthKit and billing, none of which exist on web. Each screen is mounted
 * inside the raw contexts with fixture state instead.
 *
 * Pick a screen with the URL hash — `#1.2`, `#2.4`, `#3.4c` — matching the handoff's
 * own screen ids.
 */
// @ts-nocheck

// 

import React, { useEffect, useState } from 'react';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useFonts } from 'expo-font';
import { Assistant_400Regular, Assistant_500Medium, Assistant_600SemiBold, Assistant_700Bold } from '@expo-google-fonts/assistant';
import { FrankRuhlLibre_400Regular, FrankRuhlLibre_500Medium, FrankRuhlLibre_700Bold } from '@expo-google-fonts/frank-ruhl-libre';
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium, IBMPlexMono_600SemiBold } from '@expo-google-fonts/ibm-plex-mono';
import { initI18n, setLocale, currentLocale } from '@/i18n';
import { setGender, getGender, type Gender } from '@/i18n/gender';
import { color, font } from '@/design/tokens';
import { installGlobalFontDefault } from '@/design/typography';
import { GALLERY, DEFAULT_SCREEN, type GalleryEntry } from '@/screens/dev/gallery';
// The REAL app, booted here so the browser is a place to USE Hush and not only to look at it.
import { AppProvider } from '@/state/stores/appStore';
import { SessionProvider } from '@/state/stores/sessionStore';
import { ToastProvider } from '@/components/ds';
import { Root } from '@/app/Root';

installGlobalFontDefault();

/**
 * THE MANIFEST, PUBLISHED — for the static exporter that drives this harness screen by screen.
 *
 * It reads the list from the running module rather than by parsing `gallery.tsx`, because a
 * regex over the source silently missed an entry and every index after it shifted by one. The
 * exporter addresses screens by index (see `resolve`), so a manifest that is off by one is a
 * bundle where a hundred screens are filed under the wrong name.
 */
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__HUSH_GALLERY__ = GALLERY.map((g, index) => ({
    index,
    id: g.id,
    label: g.label,
    status: g.status,
    note: g.note ?? null,
    renderable: !!g.render,
  }));
}

/** The handoff's own phone frame. Screenshots taken at this size line up 1:1 with the PNGs. */
const FRAME_W = 390;
const FRAME_H = 844;

function useHash(): string {
  const read = () => (typeof window === 'undefined' ? '' : decodeURIComponent(window.location.hash.replace(/^#/, '')));
  const [hash, setHash] = useState(read);
  useEffect(() => {
    const on = () => setHash(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

/**
 * THE VOICE CONTROL — language + grammatical person, beside the frame.
 *
 * The founder's whole B list is headed "HEBREW, FEMALE VOICE", and until now the harness could
 * speak neither: it booted whatever locale the browser resolved to and left the gender store at
 * its default (masculine), because the gallery mounts fixture contexts rather than the app store
 * that calls `setGender`. So B.6 — a countdown legend in the wrong Hebrew order, addressing every
 * woman as a man — sat on a screen nobody could read in the voice it was wrong in.
 *
 * Language reloads: RTL is a layout flip (`I18nManager.forceRTL`) that only applies on a fresh
 * mount. Person does not — the gender store re-renders every `useCopy` caller on the spot, which
 * is the same thing that happens when the athlete picks on the name screen.
 */
const VOICE_KEY = 'hush.gallery.voice';

function VoiceBar() {
  const [person, setPerson] = useState<Gender>(getGender());
  const locale = currentLocale();
  const pick = (g: Gender) => {
    setGender(g);
    setPerson(g);
    try {
      window.localStorage.setItem(VOICE_KEY, g);
    } catch {
      /* the bar still works for this page */
    }
  };
  const Chip = ({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) => (
    <Pressable onPress={onPress} style={[styles.voiceChip, on && styles.voiceChipOn]}>
      <Text style={[styles.voiceChipText, on && styles.voiceChipTextOn]}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={styles.voiceBar}>
      <Chip on={locale === 'en'} label="EN" onPress={() => void setLocale('en').then(() => window.location.reload())} />
      <Chip on={locale === 'he'} label="עברית" onPress={() => void setLocale('he').then(() => window.location.reload())} />
      <View style={styles.voiceGap} />
      <Chip on={person === 'male'} label="he/him" onPress={() => pick('male')} />
      <Chip on={person === 'female'} label="she/her" onPress={() => pick('female')} />
    </View>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const hash = useHash();
  const [fontsLoaded] = useFonts({
    Assistant: Assistant_400Regular,
    'Assistant-Medium': Assistant_500Medium,
    'Assistant-SemiBold': Assistant_600SemiBold,
    'Assistant-Bold': Assistant_700Bold,
    FrankRuhlLibre: FrankRuhlLibre_400Regular,
    'FrankRuhlLibre-Medium': FrankRuhlLibre_500Medium,
    'FrankRuhlLibre-Bold': FrankRuhlLibre_700Bold,
    IBMPlexMono: IBMPlexMono_400Regular,
    'IBMPlexMono-Medium': IBMPlexMono_500Medium,
    'IBMPlexMono-SemiBold': IBMPlexMono_600SemiBold,
  });

  useEffect(() => {
    // The person the bar was last left on — restored before the first sentence is rendered, so a
    // reload for the language flip does not quietly drop back into the masculine.
    try {
      if (window.localStorage.getItem(VOICE_KEY) === 'female') setGender('female');
    } catch {
      /* default (masculine) stands */
    }
    initI18n().then(() => setReady(true));
  }, []);

  if (!ready || !fontsLoaded) return <View style={styles.canvas} />;

  /*
   * ════ NO HASH IS THE REAL APP NOW (founder 2026-08-08) ════
   *
   * Founder: *"מה שאני רואה עכשיו זה את הגלרייה... במקום שאבדוק מהפלאפון אראה את זה כאן?"* — and
   * the landing page being an INDEX is why the browser had never replaced a build for him. A list
   * of screens answers "was it built"; it cannot answer "does the app work".
   *
   * The header of this file used to say the real providers were impossible here, because they
   * "reach for SQLite, HealthKit and billing". That was true of an intention, never of the code:
   * `data/local/db` is AsyncStorage top to bottom (its own comment still says SQLite is for
   * "later"), and the only genuinely native imports left in `src/` are expo-notifications and
   * expo-secure-store — two modules, both behind seams, both resolvable with a `.web` variant.
   *
   * So the addresses are:
   *   ·  no hash   → the real app, from the first screen, with real state and real persistence
   *   ·  #gallery  → the screen index this file used to land on
   *   ·  #2.1, #i57 → one screen, mounted bare — unchanged, and still how a screen is reconciled
   *                   against its PNG
   */
  if (!hash) {
    return (
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <View style={styles.canvas}>
          <View style={styles.frame}>
            <Boundary>
              <AppProvider>
                <SessionProvider>
                  <ToastProvider>
                    <Root />
                  </ToastProvider>
                </SessionProvider>
              </AppProvider>
            </Boundary>
          </View>
          <VoiceBar />
        </View>
      </SafeAreaProvider>
    );
  }

  const { id, entry } = resolve(hash === 'gallery' ? '' : hash);

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <View style={styles.canvas}>
        <View style={styles.frame}>
          <Boundary key={id}>
            {/* A REAL navigation container, with one screen in it. Several screens call
                `useNavigation` / `useFocusEffect` internally; outside a container those throw, and
                the gallery would be showing a blank frame for a screen that is perfectly fine on
                the device. One stack is the cheapest way to make the mount honest. */}
            <NavigationContainer key={id} theme={navTheme}>
              <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: styles.scene }}>
                <Stack.Screen name="screen">
                  {() => (entry?.render ? <>{entry.render()}</> : <Index id={id} entry={entry} />)}
                </Stack.Screen>
              </Stack.Navigator>
            </NavigationContainer>
          </Boundary>
        </View>
        <VoiceBar />
      </View>
    </SafeAreaProvider>
  );
}

const Stack = createNativeStackNavigator();
const navTheme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: color.bgBase, card: color.bgBase } };

/**
 * ════ ELEVEN BUILT SCREENS HAD NO ADDRESS ════
 *
 * `id` is not unique in GALLERY. 'Pre-workout' shares `2.1c` with 'Today — week one, no days
 * yet'; 'An interval — rep 3 of 6' shares `2.2m` with 'The set — nothing moved'; three cardio
 * states collide the same way. `GALLERY.find` returns whichever was declared FIRST, so eleven
 * live screens were built, rendering, listed in the index — and impossible to open. Clicking
 * their row set the hash to an id that belongs to someone else, and the frame drew the other
 * screen. This is the same failure the UNFILED catch-all was added for: a hand-maintained key
 * that silently stopped being a key.
 *
 * The ids are the HANDOFF's, and the build protocol is "put your output next to
 * `screenshots/screens/<id>.png`" — renaming them here would break the acceptance test that
 * gives them their meaning. So the id stays ambiguous and a second, unambiguous address is
 * added beside it: `#i57` is the entry at position 57, and every entry has exactly one.
 */
function resolve(hash: string): { id: string; entry?: GalleryEntry } {
  const byIndex = /^i(\d+)$/.exec(hash);
  if (byIndex) return { id: hash, entry: GALLERY[Number(byIndex[1])] };
  const id = hash || DEFAULT_SCREEN;
  return { id, entry: GALLERY.find((g) => g.id === id) };
}

/**
 * The address a row links to: its own id where that id reaches it, and its index where another
 * entry would answer first. A row that cannot open the screen it names is worse than no row.
 */
function addressOf(entry: GalleryEntry, index: number): string {
  return GALLERY.findIndex((g) => g.id === entry.id) === index ? entry.id : `i${index}`;
}

/**
 * A screen that throws must SAY so. Without this the gallery draws an empty frame and the only
 * clue is a React warning in the console — which is exactly the failure mode this harness exists
 * to prevent.
 */
class Boundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <ScrollView contentContainerStyle={styles.index}>
        <Text style={styles.indexTitle}>This screen threw</Text>
        <Text style={styles.indexRow}>{String(this.state.error?.stack ?? this.state.error)}</Text>
      </ScrollView>
    );
  }
}

/** The mark beside each row — what the harness can and cannot show, said in one glyph. */
/*
 * A withdrawn screen had no mark, so the index printed the word "undefined" beside every one of
 * them — five rows of it, in the list the founder reads to decide what is left to do. `cancelled`
 * is a real status in `ScreenStatus`; it simply never got a glyph. `held` is not, and never was.
 */
const MARK: Record<string, string> = { live: '●', device: '◐', todo: '○', cancelled: '×' };

/**
 * THE INDEX — every handoff screen, in the handoff's order, with where it stands.
 *
 * It is the landing page (no hash) and the fallback for a screen the harness cannot mount, so a
 * screen that is BUILT but device-only never reads as missing. The whole point of the page is that
 * "not shown here" and "not built" are different facts, and it says which is which.
 */
function Index({ id, entry }: { id: string; entry?: GalleryEntry }) {
  /*
   * ════ FIVE SCREENS WERE IN THE GALLERY AND IN NO SECTION ════
   *
   * Founder, 2026-08-01: *"look at the gallery yourself — it does not appear there at all."*
   *
   * He was right, and it was the worst possible five. The coach — §00, the newest surface in the
   * product and the one the whole AI move was for — had no `test` matching `0.`, so every one of
   * its screens was filtered out of the index. They were built, they rendered, and the only way to
   * reach one was to already know its id and type it into the URL.
   *
   * The counts made it invisible in both directions: the header counted all 71 live screens while
   * the list below it drew 66, and nobody subtracts two numbers on a page that has always looked
   * right.
   *
   * ── THE FIX IS THE CATCH-ALL, NOT THE ROW ───────────────────────────────────────────────────
   * Adding §00 fixes today. What stops it happening again is `UNFILED`: any entry no section
   * claims lands in a visible group of its own, at the top, where it is embarrassing. A
   * hand-maintained list of sections beside a hand-maintained list of screens will always drift —
   * the only question is whether the drift is loud.
   */
  const sections: { title: string; test: (g: GalleryEntry) => boolean }[] = [
    { title: '00 · THE COACH', test: (g) => g.id.startsWith('0.') },
    { title: '01 · ARRIVE', test: (g) => g.id.startsWith('1.') },
    { title: '02 · TRAIN', test: (g) => g.id.startsWith('2.') },
    { title: '03 · REFLECT', test: (g) => g.id.startsWith('3.') },
    { title: '04 · OWN', test: (g) => g.id.startsWith('4.') },
    { title: '06–11 · SURFACES', test: (g) => /^(6|7|8|9|10|11)\./.test(g.id) },
    { title: '13 · WHEN SOMETHING HURTS', test: (g) => g.id.startsWith('13.') },
  ];
  const unfiled = GALLERY.filter((g) => !sections.some((s) => s.test(g)));
  if (unfiled.length) sections.unshift({ title: '⚠ UNFILED', test: (g) => unfiled.includes(g) });

  /*
   * ════ ⛔ A STATE IS NOT A SCREEN, AND THIS PAGE SAID IT WAS ════
   *
   * FOUNDER, 2026-08-12, three notes in one message: *"יש 5 מסכי TODAY. מה זה?"* … *"יש כאן 3
   * מסכים Pre workout"* … *"יש כאן לא פחות מ9 מסכי The set למה?"*
   *
   * There is one of each. What he counted was eighteen STATES printed as peers of the screen they
   * belong to — same indent, same mark, same type — on the page whose entire job is "walk the
   * product screen by screen". **It answered "how many screens are there" with a number three
   * times too big**, and cost him three separate notes asking what the extras were.
   *
   * ⚠️ AND THE HEADER COUNT WAS PART OF THE LIE. It read "N built" off `GALLERY.length`, so the
   * product looked like it had a hundred and eleven surfaces. It counts SCREENS now, with the
   * states beside it as their own figure — two facts, said as two numbers.
   *
   * The relationship is declared on the entry (`of`), never derived from the id: `2.1b` is the WHY
   * sheet and `2.1f` is the pre-workout card, so nesting by number prefix would have filed two
   * unrelated surfaces under Today.
   */
  const statesOf = (parentId: string) => GALLERY.filter((g) => g.of === parentId);
  const screens = GALLERY.filter((g) => !g.of);

  const live = screens.filter((g) => g.status === 'live').length;
  const built = screens.filter((g) => g.status === 'live' || g.status === 'device').length;
  const states = GALLERY.length - screens.length;

  /** One row — a screen, or one of its states drawn a step in and a shade back. */
  const Row = ({ g, state }: { g: GalleryEntry; state?: boolean }) => (
    // Keyed by INDEX, not id: the duplicate ids collided as React keys too, so two rows in the
    // same section shared one identity.
    <Pressable
      key={GALLERY.indexOf(g)}
      disabled={!g.render}
      onPress={() => {
        window.location.hash = addressOf(g, GALLERY.indexOf(g));
      }}
      style={[styles.indexRowWrap, state && styles.indexStateWrap]}
    >
      <Text style={[styles.indexRow, state && styles.indexStateRow, !g.render && styles.indexRowIdle]}>
        {`${state ? '·' : MARK[g.status]}  ${g.id.padEnd(5, ' ')} ${g.label}`}
      </Text>
      {g.note ? <Text style={[styles.indexRowNote, state && styles.indexStateNote]}>{g.note}</Text> : null}
    </Pressable>
  );

  return (
    <ScrollView contentContainerStyle={styles.index}>
      <Text style={styles.indexTitle}>{entry ? entry.label : id ? `No screen "${id}"` : 'v7'}</Text>
      {entry?.note ? <Text style={styles.indexNote}>{entry.note}</Text> : null}
      <Text style={styles.indexNote}>
        {`${built} of ${screens.length} screens built · ${live} open here · ${states} states beneath them`}
      </Text>

      {sections.map((sec) => {
        const rows = screens.filter(sec.test);
        if (!rows.length) return null;
        return (
          <View key={sec.title} style={styles.indexSection}>
            <Text style={styles.indexSectionTitle}>{sec.title}</Text>
            {rows.map((g) => (
              <View key={GALLERY.indexOf(g)}>
                <Row g={g} />
                {statesOf(g.id).map((s) => (
                  <Row key={GALLERY.indexOf(s)} g={s} state />
                ))}
              </View>
            ))}
          </View>
        );
      })}

      <Text style={styles.indexNote}>
        {'●  opens here     ◐  built, device-only     ○  not built     ·  a state of the screen above'}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: '#0a0a09', alignItems: 'flex-start' },
  // The frame is EXACTLY the handoff's phone so a screenshot overlays its PNG.
  frame: { width: FRAME_W, height: FRAME_H, overflow: 'hidden', backgroundColor: color.bgBase },
  scene: { backgroundColor: color.bgBase },
  voiceBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 4 },
  voiceGap: { width: 14 },
  voiceChip: { paddingVertical: 5, paddingHorizontal: 11, borderRadius: 100, borderWidth: 1, borderColor: 'rgba(241,238,229,0.18)' },
  voiceChipOn: { backgroundColor: color.paper, borderColor: color.paper },
  voiceChipText: { fontFamily: font.mono, fontSize: 11, color: color.textMuted },
  voiceChipTextOn: { color: color.onPaper },
  index: { padding: 22, paddingBottom: 48 },
  indexTitle: { fontFamily: font.serif, fontSize: 30, color: color.textPrimary },
  indexNote: { fontFamily: font.mono, fontSize: 10.5, color: color.textMuted, marginTop: 8 },
  indexSection: { marginTop: 22 },
  indexSectionTitle: { fontFamily: font.mono, fontSize: 10, letterSpacing: 1.6, color: color.textMuted, marginBottom: 8 },
  indexRowWrap: { paddingVertical: 4 },
  indexRow: { fontFamily: font.mono, fontSize: 12, lineHeight: 17, color: color.textPrimary },
  indexRowIdle: { color: color.textMuted },
  indexRowNote: { fontFamily: font.sans, fontSize: 10.5, color: color.textMuted, marginTop: 1, marginStart: 22 },
  // A state is indented under its screen and set one shade back — it reads as belonging to the row
  // above rather than competing with it. The dot replaces the status mark for the same reason: a
  // state has no build status of its own, it is whatever its screen is.
  indexStateWrap: { paddingVertical: 2, marginStart: 20 },
  indexStateRow: { fontSize: 11.5, color: color.textSecondary },
  indexStateNote: { marginStart: 22, opacity: 0.8 },
});
