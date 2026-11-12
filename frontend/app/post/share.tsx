import { ShareScreen } from '@/components/fb/composer/ShareScreen';

// "New post" share settings as a standalone route. It reads the same draft
// store as the composer, so it previews whatever is currently being written.
export default function SharePostScreen() {
  return <ShareScreen />;
}
