export type ReportPeriodPreset =
  | "today"
  | "week"
  | "month"
  | "last30"
  | "custom";

export interface ReportPeriodRange {
  from: string;
  to: string;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatLocalYmd(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function getTodayRange(): ReportPeriodRange {
  const today = formatLocalYmd(new Date());
  return { from: today, to: today };
}

export function getWeekRange(reference = new Date()): ReportPeriodRange {
  const date = new Date(reference);
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { from: formatLocalYmd(monday), to: formatLocalYmd(sunday) };
}

export function getMonthRange(reference = new Date()): ReportPeriodRange {
  const start = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const end = new Date(reference.getFullYear(), reference.getMonth() + 1, 0);
  return { from: formatLocalYmd(start), to: formatLocalYmd(end) };
}

export function getLast30DaysRange(reference = new Date()): ReportPeriodRange {
  const end = new Date(reference);
  const start = new Date(reference);
  start.setDate(end.getDate() - 29);
  return { from: formatLocalYmd(start), to: formatLocalYmd(end) };
}

export function getRangeForPreset(
  preset: ReportPeriodPreset,
  custom?: ReportPeriodRange,
): ReportPeriodRange {
  switch (preset) {
    case "today":
      return getTodayRange();
    case "week":
      return getWeekRange();
    case "month":
      return getMonthRange();
    case "last30":
      return getLast30DaysRange();
    case "custom":
      return custom ?? getTodayRange();
    default:
      return getTodayRange();
  }
}

export const REPORT_PERIOD_PRESETS: Array<{
  key: ReportPeriodPreset;
  label: string;
}> = [
  { key: "today", label: "Today" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "last30", label: "Last 30 Days" },
  { key: "custom", label: "Custom" },
];
