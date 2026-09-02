export const MINUTES_PER_DAY = 24 * 60;

export const FREQUENCY_COUNTS: Record<string, number> = {
  "Once a day": 1,
  "A few times a day": 3,
  "Many times a day": 6,
  "Almost constantly": 10,
};

export const DURATION_MINUTES: Record<string, number> = {
  "A few minutes": 3,
  "5–15 minutes": 10,
  "15–30 minutes": 22,
  "30–60 minutes": 45,
  "1–2 hours": 90,
  "Almost constant": 180,
};

export function ruminationDailyHours(
  freqLabel: string | null | undefined,
  durLabel: string | null | undefined
): number {
  const freq = FREQUENCY_COUNTS[freqLabel ?? ""] ?? 3;
  const dur = DURATION_MINUTES[durLabel ?? ""] ?? 10;
  return Math.min((freq * dur) / 60, 24);
}

export function durationFitsDay(freqLabel: string, durLabel: string): boolean {
  const freq = FREQUENCY_COUNTS[freqLabel] ?? 3;
  const dur = DURATION_MINUTES[durLabel] ?? 10;
  return freq * dur <= MINUTES_PER_DAY;
}
