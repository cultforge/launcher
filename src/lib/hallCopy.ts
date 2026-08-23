/** Time-aware copy for guild hall (avoid "tonight" at 9 AM). */
export function hallPeriodCopy(nowMs: number = Date.now()): {
  hangingOut: string;
  tableHeading: string;
  featuredPackPrefix: string;
} {
  const hour = new Date(nowMs).getHours();
  if (hour >= 5 && hour < 12) {
    return {
      hangingOut: "this morning",
      tableHeading: "On the table today",
      featuredPackPrefix: "Today's pack",
    };
  }
  if (hour >= 12 && hour < 17) {
    return {
      hangingOut: "this afternoon",
      tableHeading: "On the table today",
      featuredPackPrefix: "Today's pack",
    };
  }
  if (hour >= 17 && hour < 22) {
    return {
      hangingOut: "tonight",
      tableHeading: "On the table tonight",
      featuredPackPrefix: "Tonight's pack",
    };
  }
  return {
    hangingOut: "late tonight",
    tableHeading: "On the table tonight",
    featuredPackPrefix: "Tonight's pack",
  };
}
