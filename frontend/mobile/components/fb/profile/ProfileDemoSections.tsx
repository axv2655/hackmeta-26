import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SectionBand } from '@/components/ui/SectionBand';
import { aspect, type User } from '@/lib/mock';
import { colors, fontWeights, layout, radius, spacing } from '@/lib/theme';

import { profilePhotos, profileReels, type ProfileTabKey } from './data';
import { ProfileDetails } from './ProfileDetails';
import { ProfileMediaGrid } from './ProfileMediaGrid';
import { ProfileMemories } from './ProfileMemories';
import { ProfilePosts } from './ProfilePosts';
import { ProfileTabs } from './ProfileTabs';

const REEL_TILES = profileReels.map((reel) => ({ id: reel.id, image: reel.poster, viewCount: reel.viewCount }));

export type ProfileDemoSectionsProps = { user: User; onPressCompose: () => void };

/**
 * The bundled sample profile content (details, posts, photos, reels, memories).
 * Shown only in a demo build, and only for the seeded account the sample
 * describes, so no other account ever sees this identity.
 */
export function ProfileDemoSections({ user, onPressCompose }: ProfileDemoSectionsProps) {
  const [tab, setTab] = useState<ProfileTabKey>('all');
  return (
    <View>
      <View style={styles.sampleRow}>
        <Text style={styles.sample}>Sample profile content</Text>
      </View>
      <ProfileTabs active={tab} onChange={setTab} />
      {tab === 'all' ? (
        <>
          <ProfileDetails />
          <SectionBand />
          <ProfilePosts user={user} onPressCompose={onPressCompose} />
        </>
      ) : tab === 'photos' ? (
        <ProfileMediaGrid tiles={profilePhotos} itemLabel="Photo" />
      ) : tab === 'reels' ? (
        <ProfileMediaGrid tiles={REEL_TILES} tileAspect={aspect.reel} itemLabel="Reel" />
      ) : (
        <ProfileMemories />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sampleRow: { paddingHorizontal: layout.gutter, paddingTop: spacing.md },
  sample: {
    alignSelf: 'flex-start',
    fontSize: 12,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
});
