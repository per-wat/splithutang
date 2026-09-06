const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function formatRelativeTime(value: string, now = Date.now()): string {
  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return "Recently";
  }

  const seconds = Math.round((timestamp - now) / 1000);
  const ranges: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];

  for (const [unit, secondsInUnit] of ranges) {
    if (Math.abs(seconds) >= secondsInUnit) {
      return formatter.format(Math.round(seconds / secondsInUnit), unit);
    }
  }

  return "Just now";
}
