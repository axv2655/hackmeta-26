import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Button } from '@/components/ui/Button';
import type { MenuShortcut } from '@/lib/mock';
import { motion, spacing } from '@/lib/theme';

import { chunk, MOVES_TAGLINE, moreShortcuts, movesShortcut, primaryShortcuts } from './data';
import { ShortcutTile } from './ShortcutTile';

const GAP = spacing.sm;

export type ShortcutGridProps = {
  onPressShortcut?: (shortcut: MenuShortcut) => void;
};

function Rows({ items, onPress }: { items: MenuShortcut[]; onPress?: (shortcut: MenuShortcut) => void }) {
  return (
    <>
      {chunk(items, 2).map((row) => (
        <View key={row[0].id} style={styles.row}>
          {row.map((shortcut) => (
            <ShortcutTile key={shortcut.id} shortcut={shortcut} onPress={onPress} />
          ))}
          {/* Keep a lone last tile at half width. */}
          {row.length === 1 ? <View style={styles.spacer} /> : null}
        </View>
      ))}
    </>
  );
}

/** Two-column shortcut grid: Moves on top, eight tiles, and four more behind "See more". */
export function ShortcutGrid({ onPressShortcut }: ShortcutGridProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.grid}>
      <View style={styles.row}>
        <ShortcutTile shortcut={movesShortcut} onPress={onPressShortcut} isNew tagline={MOVES_TAGLINE} />
      </View>
      <Rows items={primaryShortcuts} onPress={onPressShortcut} />
      {expanded ? (
        // Occasional, user-caused reveal: a short fade explains where the new tiles came from.
        <Animated.View entering={FadeIn.duration(motion.base)} style={styles.grid}>
          <Rows items={moreShortcuts} onPress={onPressShortcut} />
        </Animated.View>
      ) : null}
      <Button
        title={expanded ? 'See less' : 'See more'}
        variant="secondary"
        size="md"
        onPress={() => setExpanded((v) => !v)}
        style={styles.more}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: GAP },
  row: { flexDirection: 'row', gap: GAP },
  spacer: { flex: 1 },
  more: { marginTop: spacing.xs },
});

export default ShortcutGrid;
