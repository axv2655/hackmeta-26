import { avatars, posts } from './assets';
import type { User } from './types';

function person(
  id: string,
  name: string,
  avatar: User['avatar'],
  subtitle: string,
  extra: Partial<User> = {},
): User {
  return {
    id,
    kind: 'person',
    name,
    firstName: name.split(' ')[0] ?? name,
    avatar,
    verified: false,
    mutualFriends: 0,
    isFriend: true,
    online: false,
    subtitle,
    ...extra,
  };
}

/** The signed-in user. */
export const currentUser: User = person('u-anish', 'Anish Alle', avatars.a1, 'Computer Science at UT Dallas', {
  isFriend: false,
});

// Friends
export const tony = person('u-tony', 'Tony Nguyen', avatars.a9, 'Computer Science at UT Dallas', {
  mutualFriends: 24,
  online: true,
});
export const maya = person('u-maya', 'Maya Patel', avatars.a10, 'Neuroscience at UT Dallas', {
  mutualFriends: 31,
  online: true,
});
export const priya = person('u-priya', 'Priya Shah', avatars.a6, 'Finance at UT Dallas', {
  mutualFriends: 18,
});
export const dev = person('u-dev', 'Dev Mehta', avatars.a5, 'Mechanical Engineering at UT Dallas', {
  mutualFriends: 15,
  online: true,
});
export const dhivyesh = person('u-dhivyesh', 'Dhivyesh Kumar', avatars.a11, 'Software Engineering at UT Dallas', {
  mutualFriends: 22,
});
export const jordan = person('u-jordan', 'Jordan Lee', avatars.a7, 'Arts, Technology, and Emerging Communication at UT Dallas', {
  mutualFriends: 12,
});

// Not friends yet: "People you may know" and friend requests
export const marcus = person('u-marcus', 'Marcus Johnson', avatars.a3, 'Lives in Menlo Park, California', {
  isFriend: false,
  mutualFriends: 9,
});
export const emily = person('u-emily', 'Emily Chen', avatars.a2, 'Biology at UT Dallas', {
  isFriend: false,
  mutualFriends: 14,
});
export const hannah = person('u-hannah', 'Hannah Brooks', avatars.a4, 'Marketing at UT Dallas', {
  isFriend: false,
  mutualFriends: 6,
});
export const grace = person('u-grace', 'Grace Kim', avatars.a8, 'Works at Meta', {
  isFriend: false,
  mutualFriends: 11,
});
export const sofia = person('u-sofia', 'Sofia Ramirez', avatars.a12, 'Lives in Palo Alto, California', {
  isFriend: false,
  mutualFriends: 3,
});

// Pages and groups. There are no logo files, so they reuse a matching photo.
export const kumoMatcha: User = {
  id: 'pg-kumo',
  kind: 'page',
  name: 'Kumo Matcha',
  firstName: 'Kumo Matcha',
  avatar: posts.p1,
  verified: true,
  mutualFriends: 0,
  isFriend: false,
  online: false,
  subtitle: 'Cafe · Menlo Park, California',
  audienceCount: 12400,
};

export const utdClimbing: User = {
  id: 'gr-climbing',
  kind: 'group',
  name: 'MPK Climbing Club',
  firstName: 'MPK Climbing Club',
  avatar: posts.p6,
  verified: false,
  mutualFriends: 0,
  isFriend: false,
  online: false,
  subtitle: 'Public group · 842 members',
  audienceCount: 842,
};

export const richardsonNow: User = {
  id: 'pg-richardson',
  kind: 'page',
  name: 'Menlo Park Now',
  firstName: 'Menlo Park Now',
  avatar: posts.p5,
  verified: true,
  mutualFriends: 0,
  isFriend: false,
  online: false,
  subtitle: 'Local news · Menlo Park, California',
  audienceCount: 58300,
};

/** The current user's friends, in display order. */
export const friends: User[] = [tony, maya, priya, dev, dhivyesh, jordan];

/** People the current user is not friends with yet ("People you may know"). */
export const suggestions: User[] = [emily, marcus, grace, hannah, sofia];

export const pages: User[] = [kumoMatcha, richardsonNow];
export const groups: User[] = [utdClimbing];

/** Everyone except the current user: 11 people, then pages and groups. */
export const people: User[] = [...friends, ...suggestions];

/** Every seeded identity, current user first. */
export const users: User[] = [currentUser, ...people, ...pages, ...groups];

export function getUser(id: string): User | undefined {
  return users.find((u) => u.id === id);
}
