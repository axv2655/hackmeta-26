import { useComposerStore } from '@/components/fb/composer/draftStore';
import { useFriends } from '@/lib/friends';
import { onLogout } from '@/lib/session';
import { useFeedStore } from '@/lib/store/feed';
import { useMyMoves } from '@/lib/store/moves';
import { useUIStore } from '@/lib/store/ui';

/**
 * Logout resets for stores that do not register their own `onLogout`
 * (inbox, suggestions, saved, Muse status, live Moves and the proximity
 * prompt reset themselves). Runs on every logout, including a 401, so the
 * next account never sees the previous user's friends, Moves or drafts.
 * Imported once by the root layout for its side effect.
 */
onLogout(() => {
  useFriends.setState({ incoming: [], outgoing: [], friends: [], relations: {}, loaded: false });
  useMyMoves.setState({ mine: [], focusId: null });
  useFeedStore.getState().reset();
  useComposerStore.getState().reset();
  useUIStore.getState().setNotificationCount(0);
  useUIStore.getState().setNotificationsFocused(false);
});
