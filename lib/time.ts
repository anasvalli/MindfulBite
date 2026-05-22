export function parseTime12h(timeStr: string): Date | null {
  if (!timeStr) return null;
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return null;
  let h = parseInt(match[1]);
  const m = parseInt(match[2]);
  const period = match[3].toUpperCase();
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
}

export function getSecondsLeft(
  meals: any[]
): { name: string; time: string; secondsLeft: number; totalSeconds: number } | null {
  if (!meals || meals.length === 0) return null;
  const now = new Date();

  const sorted = meals
    .map(m => ({ ...m, parsed: parseTime12h(m.time) }))
    .filter(m => m.parsed !== null)
    .sort((a, b) => a.parsed!.getTime() - b.parsed!.getTime());

  if (sorted.length === 0) return null;

  for (let i = 0; i < sorted.length; i++) {
    const mealTime = sorted[i].parsed!;
    if (mealTime > now) {
      const secondsLeft = Math.max(0, Math.round((mealTime.getTime() - now.getTime()) / 1000));
      const prevTime =
        i > 0
          ? sorted[i - 1].parsed!
          : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const totalSeconds = Math.round((mealTime.getTime() - prevTime.getTime()) / 1000);
      return { name: sorted[i].name, time: sorted[i].time, secondsLeft, totalSeconds };
    }
  }
  return null;
}

export function localDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
