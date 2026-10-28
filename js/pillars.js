// Pillars: the parts of life a person chooses to tend (3 to 5 of them).
// Colours are soft tints from one family, equally muted, so no pillar shouts louder than another.
export const TINTS = ["#d9b3a6", "#cfc59b", "#a9c4b5", "#a9b9d6", "#c4b4c9"];

export const SUGGESTED = ["Friends", "Family", "Health", "Rest", "Career", "Study", "Creativity", "Money", "Home", "Love", "Fun", "Purpose"];

export const MIN_PILLARS = 3, MAX_PILLARS = 5, MAX_NAME = 12;

// Orbit for the pillar at position i of n: inner planets orbit faster, outer ones slower.
export function orbit(i, n) {
  const span = n <= 3 ? [60, 150] : [52, 165];
  const rx = span[0] + (span[1] - span[0]) * (n === 1 ? 0 : i / (n - 1));
  return {
    rx, ry: rx * 0.44,
    size: [7.2, 6.4, 6, 5.6, 5.2][i] ?? 5,
    period: 50 + i * 24,          // seconds per lap
    offset: (i * 0.37 + 0.1) % 1, // where on the orbit it starts, as a fraction of a lap
  };
}
