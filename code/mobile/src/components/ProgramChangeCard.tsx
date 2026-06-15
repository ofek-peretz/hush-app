/**
 * Program change card (spec §4.9, §2.7, §7.5).
 *  - load: auto-applied, reported first-person, with Undo (reverts forward only).
 *  - frame: decided, with a veto ("Keep as is"), never an "Accept" gate (R3).
 * First-person, indicative. If nothing material changed, this card is not
 * rendered at all (the caller shows no line — §5.5 R7).
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TextAction } from '@/components/TextAction';
import { useCopy } from '@/i18n/useCopy';
import type { ProgramChange } from '@/data/local/models';
import { color, layout, type as typo } from '@/design/tokens';

interface Props {
  change: ProgramChange;
  onUndo: (id: string) => void; // load
  onGotIt: (id: string) => void; // frame: acknowledge, change stays
  onKeepAsIs: (id: string) => void; // frame: veto, revert
}

export function ProgramChangeCard({ change, onUndo, onGotIt, onKeepAsIs }: Props) {
  const { t } = useCopy();

  if (change.kind === 'load') {
    return (
      <View style={styles.card}>
        <Text style={styles.line}>{t('program.loadChange', { target: change.capabilityOrTarget })}</Text>
        <View style={styles.actions}>
          <TextAction label={t('program.undo')} onPress={() => onUndo(change.id)} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.line}>{t('program.frameChange', { capability: change.capabilityOrTarget })}</Text>
      <View style={styles.actionsRow}>
        <TextAction label={t('program.gotIt')} onPress={() => onGotIt(change.id)} />
        <View style={styles.spacer} />
        <TextAction label={t('program.keepAsIs')} onPress={() => onKeepAsIs(change.id)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: color.bgSurface, borderRadius: 16, padding: layout.screenMargin, marginBottom: 16 },
  line: { color: color.textPrimary, fontSize: typo.bodyL.size, lineHeight: typo.bodyL.lineHeight },
  actions: { marginTop: 12, alignItems: 'flex-start' },
  actionsRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center' },
  spacer: { width: 24 },
});
