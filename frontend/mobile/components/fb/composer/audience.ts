import type { IconName } from '@/components/ui/Icon';
import type { Audience } from '@/lib/mock';

export type AudienceOption = { value: Audience; label: string; icon: IconName };

/** The audiences a personal post can cycle through, in order. */
export const audienceOptions: readonly AudienceOption[] = [
  { value: 'public', label: 'Public', icon: 'globe' },
  { value: 'friends', label: 'Friends', icon: 'friends' },
  { value: 'only-me', label: 'Only me', icon: 'lock' },
];

const FALLBACK: AudienceOption = { value: 'friends', label: 'Friends', icon: 'friends' };

export function audienceOption(value: Audience): AudienceOption {
  return audienceOptions.find((option) => option.value === value) ?? FALLBACK;
}

export function nextAudience(value: Audience): Audience {
  const index = audienceOptions.findIndex((option) => option.value === value);
  const next = audienceOptions[(index + 1) % audienceOptions.length] ?? FALLBACK;
  return next.value;
}
