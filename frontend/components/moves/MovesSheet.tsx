import { forwardRef, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import BottomSheet, { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { ScrollView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { selection, success } from '@/lib/haptics';
import { shareMove } from '@/lib/invites';
import { currentUser } from '@/lib/mock';
import { bitmojiFor } from '@/lib/mock/bitmoji';
import { CATEGORY_META, type MapMove } from '@/lib/mock/moves';
import { myFirstName, useSession } from '@/lib/session';
import { colors, spacing } from '@/lib/theme';

import { BitmojiFace, SheetGlassBackground, SheetHandle, useSheetBottomInset } from './SheetParts';

export const SHEET_COLLAPSED = 84;
/** Height of SheetHandle (7 top + 5 bar + 5 bottom). */
const HANDLE_HEIGHT = 17;
const SHEET_SIDE_INSET = 8;

export type MovesSheetProps = {
  moves: MapMove[];
  selected: MapMove | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  animatedIndex: SharedValue<number>;
  onIndexChange?: (index: number) => void;
  /** Pull up / take it back (the parent talks to the backend). */
  onPull: (id: string) => void;
};

export { useSheetBottomInset };

/**
 * Apple-Maps-style floating glass sheet that lives inside the Moves tab (not a
 * modal), so the map stays live under it and the tab bar stays on top.
 * Detents: search pill, half (friends out now + list), and full-height list.
 * Selecting a friend swaps the content to their Move card in place.
 */
export const MovesSheet = forwardRef<BottomSheet, MovesSheetProps>(function MovesSheet(
  { moves, selected, onSelect, onClose, animatedIndex, onIndexChange, onPull },
  ref,
) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const bottomInset = useSheetBottomInset();
  const [query, setQuery] = useState('');
  const pulled = useMemo(() => new Set(moves.filter((m) => m.going).map((m) => m.id)), [moves]);
  const me = useSession((s) => s.userId);

  const fullHeight = height - insets.top - 8 - bottomInset;
  const snapPoints = useMemo(() => [SHEET_COLLAPSED, '48%', fullHeight], [fullHeight]);

  // gorhom keeps the content at full height and slides it; with a detached
  // sheet floating above the tab bar the off-sheet part would show through
  // below it, so clip the content to the sheet's visible height.
  const animatedPosition = useSharedValue(height);
  const clipStyle = useAnimatedStyle(() => ({
    height: Math.max(0, height - bottomInset - animatedPosition.value - HANDLE_HEIGHT),
  }));

  const togglePull = (id: string) => {
    if (!pulled.has(id)) success();
    onPull(id);
  };

  const q = query.trim().toLowerCase();
  const visible = q ? moves.filter((m) => `${m.user.name} ${m.title} ${m.mark.name}`.toLowerCase().includes(q)) : moves;
  const live = visible.filter((m) => m.status !== 'ghost');
  const ghosts = visible.filter((m) => m.status === 'ghost');

  return (
    <BottomSheet
      ref={ref}
      index={0}
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      detached
      bottomInset={bottomInset}
      style={styles.sheet}
      animatedIndex={animatedIndex}
      animatedPosition={animatedPosition}
      onChange={onIndexChange}
      backgroundComponent={SheetGlassBackground}
      handleComponent={SheetHandle}
      keyboardBehavior="extend"
      keyboardBlurBehavior="restore"
      enablePanDownToClose={false}
    >
      <Animated.View style={[styles.clip, clipStyle]}>
        {selected ? (
          <MoveCard
            move={selected}
            pulled={pulled.has(selected.id)}
            onPull={() => togglePull(selected.id)}
            onClose={onClose}
          />
        ) : (
          <>
            <View style={styles.header}>
              <View style={styles.search}>
                <Icon name="search" size={20} color={colors.textSecondary} />
                <BottomSheetTextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search friends and Moves"
                  placeholderTextColor={colors.textSecondary}
                  style={styles.searchInput}
                  returnKeyType="search"
                  clearButtonMode="while-editing"
                />
                <Icon name="mic" size={20} color={colors.textSecondary} />
              </View>
              <View style={styles.meFace}>
                <Image source={bitmojiFor(me, 'selfie')} style={styles.meImage} contentFit="cover" />
              </View>
            </View>

            <BottomSheetScrollView
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {!q ? (
                <>
                  <Text style={styles.sectionTitle}>Out now</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.outRow}>
                    {moves
                      .filter((m) => m.status !== 'ghost')
                      .map((m) => (
                        <PressableScale key={m.id} onPress={() => onSelect(m.id)} style={styles.outItem} scaleTo={0.94}>
                          <BitmojiFace userId={m.user.id} size={64} category={m.mark.category} />
                          <Text style={styles.outName} numberOfLines={1}>
                            {m.user.firstName}
                          </Text>
                          <Text style={styles.outMeta} numberOfLines={1}>
                            {CATEGORY_META[m.mark.category].label}
                          </Text>
                        </PressableScale>
                      ))}
                  </ScrollView>
                </>
              ) : null}

              {live.length > 0 ? <Text style={styles.sectionTitle}>Happening now</Text> : null}
              {live.length > 0 ? (
                <View style={styles.group}>
                  {live.map((m, i) => (
                    <MoveRow
                      key={m.id}
                      move={m}
                      first={i === 0}
                      pulled={pulled.has(m.id)}
                      onPress={() => onSelect(m.id)}
                      onPull={() => togglePull(m.id)}
                    />
                  ))}
                </View>
              ) : null}

              {ghosts.length > 0 ? <Text style={styles.sectionTitle}>Earlier</Text> : null}
              {ghosts.length > 0 ? (
                <View style={styles.group}>
                  {ghosts.map((m, i) => (
                    <MoveRow key={m.id} move={m} first={i === 0} onPress={() => onSelect(m.id)} />
                  ))}
                </View>
              ) : null}

              {visible.length === 0 ? <Text style={styles.empty}>No Moves match “{query}”.</Text> : null}
            </BottomSheetScrollView>
          </>
        )}
      </Animated.View>
    </BottomSheet>
  );
});

function statusText(m: MapMove): string {
  if (m.status === 'omw') return `On the way · ${m.timeLabel}`;
  if (m.status === 'ghost') return `Left ${m.timeLabel} ago`;
  return `There · ${m.timeLabel}`;
}

function MoveRow({
  move,
  first,
  pulled,
  onPress,
  onPull,
}: {
  move: MapMove;
  first: boolean;
  pulled?: boolean;
  onPress: () => void;
  onPull?: () => void;
}) {
  const ghost = move.status === 'ghost';
  return (
    <Pressable
      onPress={() => {
        selection();
        onPress();
      }}
      style={({ pressed }) => [styles.row, !first && styles.rowDivider, pressed && styles.rowPressed]}
    >
      <BitmojiFace userId={move.user.id} category={move.mark.category} ghost={ghost} />
      <View style={styles.rowBody}>
        <Text style={styles.rowName} numberOfLines={1}>
          {move.user.firstName}
          <Text
            style={[styles.rowStatus, !ghost && move.status === 'there' && styles.live]}
          >{`  ${statusText(move)}`}</Text>
        </Text>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {move.title}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {move.mark.name} · {move.distanceLabel}
          {move.joined.length > 0 ? ` · +${move.joined.length} ${ghost ? 'went' : 'going'}` : ''}
        </Text>
      </View>
      {onPull ? (
        <Button
          title={pulled ? 'Going' : 'Pull up'}
          size="sm"
          variant={pulled ? 'primary' : 'tinted'}
          icon={pulled ? 'check' : undefined}
          onPress={onPull}
        />
      ) : (
        <Icon name="images" size={20} color={colors.textSecondary} />
      )}
    </Pressable>
  );
}

function MoveCard({
  move,
  pulled,
  onPull,
  onClose,
}: {
  move: MapMove;
  pulled: boolean;
  onPull: () => void;
  onClose: () => void;
}) {
  const ghost = move.status === 'ghost';
  const meta = CATEGORY_META[move.mark.category];
  const myId = useSession((s) => s.userId);
  const names = move.joined.map((u) => (u.id === myId ? 'You' : u.firstName));
  const plural = names.length > 1 || names[0] === 'You';
  return (
    <BottomSheetScrollView contentContainerStyle={styles.card} showsVerticalScrollIndicator={false}>
      <View style={styles.cardTop}>
        <View style={styles.cardHero}>
          <Image
            source={bitmojiFor(move.user.id, move.pose)}
            style={[styles.cardBody, ghost && { opacity: 0.5 }]}
            contentFit="contain"
            contentPosition="bottom"
          />
        </View>
        <View style={styles.cardInfo}>
          <View style={[styles.chip, { backgroundColor: ghost ? colors.surface : `${meta.color}1F` }]}>
            <Icon name={meta.icon} size={13} color={ghost ? colors.textSecondary : meta.color} />
            <Text style={[styles.chipText, { color: ghost ? colors.textSecondary : meta.color }]}>{meta.label}</Text>
          </View>
          <Text style={styles.cardName}>{move.user.name}</Text>
          <Text style={[styles.cardStatus, move.status === 'there' && styles.live]}>{statusText(move)}</Text>
        </View>
        <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityLabel="Close">
          <Icon name="close" size={16} color={colors.textSecondary} />
        </Pressable>
      </View>

      <Text style={styles.cardTitle}>“{move.title}”</Text>

      <View style={styles.placeRow}>
        <Icon name="map-pin" size={16} color={colors.textSecondary} />
        <Text style={styles.placeText}>
          {move.mark.name} · {move.mark.area} · {move.distanceLabel}
        </Text>
      </View>

      {move.joined.length > 0 ? (
        <View style={styles.joinedRow}>
          <View style={styles.faces}>
            {move.joined.map((u, i) => (
              <View key={u.id} style={[styles.faceWrap, i > 0 && { marginLeft: -12 }]}>
                <BitmojiFace userId={u.id} size={32} ghost={ghost} />
              </View>
            ))}
          </View>
          <Text style={styles.joinedText}>
            {names.join(', ')} {ghost ? 'went' : plural ? 'are going' : 'is going'}
          </Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        {ghost ? (
          <Button title="See Moments" icon="images" variant="primary" style={styles.flex} />
        ) : move.mine ?? move.user.id === currentUser.id ? (
          <Button title="Your Move" icon="check" variant="tinted" style={styles.flex} />
        ) : (
          <Button
            title={pulled ? "You're going" : 'Pull up'}
            icon={pulled ? 'check' : 'navigation'}
            variant={pulled ? 'tinted' : 'primary'}
            onPress={onPull}
            style={styles.flex}
          />
        )}
        {/* Friends outside the group get a no-login link, sent from your own phone (9.4). */}
        <Button
          title="Share"
          icon="share-external"
          variant="secondary"
          style={styles.flex}
          onPress={() =>
            shareMove({
              moveId: move.id,
              markName: move.mark.name,
              creatorFirst: move.user.firstName,
              inviterFirst: myFirstName(currentUser.firstName),
            })
          }
        />
      </View>
    </BottomSheetScrollView>
  );
}

const styles = StyleSheet.create({
  sheet: { marginHorizontal: SHEET_SIDE_INSET },
  clip: { overflow: 'hidden' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  search: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(118,118,128,0.14)',
  },
  searchInput: {
    flex: 1,
    fontSize: 17,
    color: colors.text,
    paddingVertical: 0,
  },
  meFace: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EEF3FF',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.white,
  },
  meImage: { width: '100%', height: '100%' },
  scrollContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxxl },
  sectionTitle: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  outRow: { gap: 14, paddingHorizontal: spacing.xs, paddingBottom: spacing.xs },
  outItem: { alignItems: 'center', width: 70 },
  outName: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  outMeta: { fontSize: 12, color: colors.textSecondary },
  group: {
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.62)',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  rowPressed: { backgroundColor: 'rgba(0,0,0,0.05)' },
  rowBody: { flex: 1, minWidth: 0 },
  rowName: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
    color: colors.text,
  },
  rowStatus: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  live: { color: colors.online },
  rowTitle: { fontSize: 15, lineHeight: 20, color: colors.text, marginTop: 1 },
  rowMeta: {
    fontSize: 13,
    lineHeight: 17,
    color: colors.textSecondary,
    marginTop: 1,
  },
  empty: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: spacing.xxl,
    fontSize: 15,
  },
  card: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
  cardTop: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  cardHero: { width: 112, height: 112 },
  cardBody: { width: '100%', height: '100%' },
  cardInfo: { flex: 1, paddingBottom: spacing.sm, gap: 4 },
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  chipText: { fontSize: 13, fontWeight: '700' },
  cardName: {
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: colors.text,
  },
  cardStatus: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  close: {
    position: 'absolute',
    top: 4,
    right: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(118,118,128,0.16)',
  },
  cardTitle: {
    fontSize: 19,
    lineHeight: 25,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.md,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
  },
  placeText: { fontSize: 15, color: colors.textSecondary },
  joinedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: spacing.md,
  },
  faces: { flexDirection: 'row' },
  faceWrap: { borderRadius: 18, borderWidth: 2, borderColor: colors.white },
  joinedText: { flex: 1, fontSize: 15, color: colors.text },
  actions: { flexDirection: 'row', gap: 10, marginTop: spacing.lg },
  flex: { flex: 1 },
});

export default MovesSheet;
