/**
 * Mock distances for the place chip. The Reel mock only carries a place name;
 * the Moves feature will replace this with a real distance from the viewer.
 */
const KNOWN_DISTANCES: Record<string, string> = {
  'Kumo Matcha': '1.2 mi',
  'Saffron Table': '0.8 mi',
  'Richardson Farmers Market': '2.4 mi',
};

/** Stable "x.y mi" label for a place name (same name, same distance). */
export function placeDistanceLabel(placeName: string): string {
  const known = KNOWN_DISTANCES[placeName];
  if (known) return known;

  let hash = 0;
  for (let i = 0; i < placeName.length; i += 1) {
    hash = (hash * 31 + placeName.charCodeAt(i)) % 997;
  }
  const tenths = 4 + (hash % 46); // 0.4 mi .. 4.9 mi
  return `${(tenths / 10).toFixed(1)} mi`;
}
