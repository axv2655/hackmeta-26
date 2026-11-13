import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { OfflineBar } from '@/components/common/OfflineBar';
import { StackScreen } from '@/components/common/StackScreen';
import { SavedMarkRow, SavedReelTile } from '@/components/marks/SavedRows';
import { useSaved } from '@/lib/saved';
import { spacing, type as typeScale } from '@/lib/theme';
import { toast } from '@/lib/toast';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.heading} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

/** Saved Marks and saved Reels (`GET /me/saved`). */
export default function SavedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { marks, reels, loaded, status, error, load, toggle } = useSaved();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const unsave = (markId: string, name: string) => {
    void toggle(markId);
    toast(`Removed ${name}`, { label: 'Undo', onPress: () => void useSaved.getState().toggle(markId) });
  };

  let body: ReactNode;
  if (!loaded && status === 'error') {
    body = <ErrorState message={error ?? "Couldn't load Saved"} onRetry={() => void load()} />;
  } else if (!loaded) {
    body = <LoadingState label="Loading Saved" />;
  } else if (marks.length === 0 && reels.length === 0) {
    body = (
      <EmptyState
        icon="bookmark"
        title="Nothing saved yet"
        body="Save places from Reels or the map"
        action={{ label: 'Browse Reels', onPress: () => router.navigate('/reels') }}
      />
    );
  } else {
    body = (
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
      >
        <Section title="Saved Marks">
          {marks.length === 0 ? (
            <Text style={styles.empty}>Save places from Reels or the map</Text>
          ) : (
            marks.map((item) => (
              <SavedMarkRow
                key={item.mark.id}
                item={item}
                onPress={() => router.push(`/mark/${encodeURIComponent(item.mark.id)}`)}
                onUnsave={() => unsave(item.mark.id, item.mark.name)}
              />
            ))
          )}
        </Section>
        <Section title="Saved Reels">
          {reels.length === 0 ? (
            <Text style={styles.empty}>Tap the bookmark on a Reel to keep it here</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reels}>
              {reels.map((item) => (
                <SavedReelTile key={item.id} item={item} onPress={() => router.navigate('/reels')} />
              ))}
            </ScrollView>
          )}
        </Section>
      </ScrollView>
    );
  }

  return (
    <StackScreen title="Saved">
      <OfflineBar />
      {body}
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: spacing.lg, gap: spacing.xs },
  heading: { ...typeScale.sectionTitle, paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  empty: { ...typeScale.rowSub, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  reels: { paddingHorizontal: spacing.lg, gap: spacing.md },
});
