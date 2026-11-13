import { useMemo } from 'react';

import { DEMO } from './demo';
import { users as mockUsers } from './mock';
import { avatars } from './mock/assets';
import type { User } from './mock/types';
import { currentUser } from './mock/users';
import { useMe } from './session';
import type { UserLite } from './types';

const AVATARS = Object.values(avatars);

/**
 * A backend user as the app's `User`: the bundled photo for the cast (by id),
 * otherwise a stable pick from the bundled avatars. `isFriend` defaults to
 * true; callers that know better override it.
 */
export function toUser(u: UserLite): User {
  const mock = mockUsers.find((m) => m.id === u.id.replace(/_/g, '-'));
  const hash = [...u.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  return {
    id: u.id,
    kind: 'person',
    name: u.name,
    firstName: u.first_name,
    avatar: mock?.avatar ?? AVATARS[hash % AVATARS.length],
    verified: Boolean(u.fb_verified),
    mutualFriends: 0,
    isFriend: true,
    online: false,
    subtitle: '',
  };
}

const SIGNED_OUT: User = {
  id: '',
  kind: 'person',
  name: 'You',
  firstName: 'You',
  avatar: AVATARS[0],
  verified: false,
  mutualFriends: 0,
  isFriend: false,
  online: false,
  subtitle: '',
};

/** The signed-in user as a `User`. The mock `currentUser` only in a signed-out demo build. */
export function useMeUser(): User {
  const me = useMe();
  return useMemo(() => {
    if (me) return { ...toUser(me), isFriend: false };
    return DEMO ? currentUser : SIGNED_OUT;
  }, [me]);
}
