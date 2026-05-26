export type LeaderboardEntry = {
  name: string;
  protein: number;
  calories: number;
};

export function formatLeaderboard(entries: LeaderboardEntry[]): string {
  if (entries.length === 0) return "No crew logs yet today.";

  const ranked = [...entries].sort((left, right) => right.protein - left.protein);
  const lines = ranked.map((entry, index) => {
    const medal = index === 0 ? "1." : index === 1 ? "2." : index === 2 ? "3." : `${index + 1}.`;
    return `${medal} ${entry.name} — ${entry.protein}g protein (${entry.calories} kcal logged)`;
  });

  return ["Crew leaderboard (today)", ...lines].join("\n");
}

export function parseCrewLogCommand(text: string): { name: string; protein: number; calories: number } | undefined {
  const match = text.match(/^crew\s+log\s+(.+?)\s+(\d+)g?\s+protein(?:\s+(\d+)\s*kcal)?$/i);
  if (!match) return undefined;
  return {
    name: match[1].trim(),
    protein: Number(match[2]),
    calories: Number(match[3] ?? 0)
  };
}
