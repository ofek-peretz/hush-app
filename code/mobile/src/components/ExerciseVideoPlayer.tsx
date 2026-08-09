/**
 * Exercise demo video player (Launch Roadmap item 5). A calm, looping, muted clip — a silent form
 * reference, consistent with the form-guide it replaces (no controls, no sound, no logging). Plays
 * a remote (streamed) or bundled source via expo-video. Rendered only when a source exists; the
 * caller falls back to the vector form-guide otherwise.
 */
// @ts-nocheck

// 

import React from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { radius } from '@/design/tokens';
import type { VideoSource } from '@/platform/media/exerciseVideo';

interface Props {
  source: VideoSource;
  accessibilityLabel: string;
  style?: ViewStyle | ViewStyle[];
}

export function ExerciseVideoPlayer({ source, accessibilityLabel, style }: Props) {
  const src = source.kind === 'remote' ? source.uri : source.module;
  const player = useVideoPlayer(src, (p) => {
    p.loop = true; // a demo loops quietly
    p.muted = true; // silent product — never plays sound
    p.play();
  });

  return (
    <VideoView
      player={player}
      style={[styles.video, style]}
      contentFit="contain"
      nativeControls={false}
      accessibilityLabel={accessibilityLabel}
    />
  );
}

const styles = StyleSheet.create({
  video: { width: '100%', aspectRatio: 16 / 10, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#0C0C0D' },
});
