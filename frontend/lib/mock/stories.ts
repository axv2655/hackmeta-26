import { stories as storyImages } from './assets';
import type { Story } from './types';
import { dev, dhivyesh, jordan, maya, priya, tony } from './users';

/** Friends' stories, unseen first. The "Create story" card is not in this list. */
export const stories: Story[] = [
  { id: 'story-maya', user: maya, image: storyImages.s2, seen: false, timeLabel: '18 m' },
  { id: 'story-tony', user: tony, image: storyImages.s6, seen: false, timeLabel: '1 h' },
  { id: 'story-dev', user: dev, image: storyImages.s3, seen: false, timeLabel: '3 h' },
  { id: 'story-priya', user: priya, image: storyImages.s1, seen: true, timeLabel: '6 h' },
  { id: 'story-dhivyesh', user: dhivyesh, image: storyImages.s5, seen: true, timeLabel: '11 h' },
  { id: 'story-jordan', user: jordan, image: storyImages.s4, seen: true, timeLabel: '19 h' },
];
