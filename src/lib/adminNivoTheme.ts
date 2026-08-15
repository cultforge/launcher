export const adminChartTheme = {
  background: "transparent",
  text: {
    fontSize: 10,
    fill: "var(--color-text-muted)",
  },
  axis: {
    domain: {
      line: { stroke: "rgba(255,255,255,0.08)", strokeWidth: 1 },
    },
    ticks: {
      line: { stroke: "rgba(255,255,255,0.06)", strokeWidth: 1 },
      text: { fill: "var(--color-text-muted)", fontSize: 9 },
    },
    legend: {
      text: { fill: "var(--color-text-secondary)", fontSize: 10 },
    },
  },
  grid: {
    line: { stroke: "rgba(255,255,255,0.04)", strokeWidth: 1 },
  },
  tooltip: {
    container: {
      background: "rgba(8,12,10,0.95)",
      color: "var(--color-text-primary)",
      fontSize: 11,
      borderRadius: 8,
      border: "1px solid rgba(255,255,255,0.1)",
      boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
    },
  },
};

export const adminChartColors = [
  "var(--color-primary-base)",
  "var(--color-accent-delta)",
  "var(--color-accent-epsilon)",
  "var(--color-state-warning)",
  "var(--color-accent-gamma)",
  "var(--color-text-muted)",
];
