// Pillars: the parts of life a person chooses to tend (3 to 5 of them).
// Colours are soft tints from one family, equally muted, so no pillar shouts louder than another.
export const TINTS = ["#d9b3a6", "#cfc59b", "#a9c4b5", "#a9b9d6", "#c4b4c9"];

export const SUGGESTED = ["Friends", "Family", "Health", "Rest", "Career", "Study", "Creativity", "Money", "Home", "Love", "Fun", "Purpose"];

// A few gentle ideas per suggested pillar, shown when you tap its planet. Pillars people name themselves have none.
export const ACTIVITIES = {
  Friends: ["Message someone", "Call a friend", "Catch up in person", "Plan something"],
  Family: ["Call home", "Visit", "Share a meal", "Send a photo"],
  Health: ["Walk", "Stretch", "Exercise", "Cook something good"],
  Rest: ["Nap", "Read for fun", "Bath or shower", "Sit outside"],
  Career: ["Focused work", "Learn a skill", "Update my CV", "Plan my week"],
  Study: ["Study session", "Revise notes", "Assignment work", "Read"],
  Creativity: ["Draw", "Write", "Make music", "Try something new"],
  Money: ["Check my budget", "Pay bills", "Plan savings", "Sell something"],
  Home: ["Tidy one space", "Laundry", "Cook", "Fix something"],
  Love: ["Quality time", "Date", "Write a note", "Talk properly"],
  Fun: ["Game", "Watch something", "Go out", "Play"],
  Purpose: ["Volunteer", "Journal", "Think about goals", "Help someone"],
};

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
