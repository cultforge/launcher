import { ResponsiveLine } from "@nivo/line";
import { adminChartColors, adminChartTheme } from "../../../lib/adminNivoTheme";
import type { TimeSeriesPoint } from "../../../lib/adminParse";
import { AdminEmptyState } from "./AdminEmptyState";

type Props = {
  data: TimeSeriesPoint[];
  height?: number;
};

export function AdminLineChart({ data, height = 180 }: Props) {
  if (!data.length) {
    return <AdminEmptyState title="No time-series data" compact />;
  }

  const lineData = [
    {
      id: "series",
      data: data.map((p) => ({ x: p.x, y: p.y })),
    },
  ];

  return (
    <div style={{ height }}>
      <ResponsiveLine
        data={lineData}
        theme={adminChartTheme}
        margin={{ top: 12, right: 16, bottom: 28, left: 36 }}
        xScale={{ type: "point" }}
        yScale={{ type: "linear", min: "auto", max: "auto", stacked: false }}
        axisBottom={{
          tickSize: 0,
          tickPadding: 8,
          tickRotation: -25,
        }}
        axisLeft={{
          tickSize: 0,
          tickPadding: 8,
        }}
        enableGridX={false}
        colors={adminChartColors}
        lineWidth={2}
        pointSize={4}
        pointBorderWidth={2}
        pointBorderColor={{ from: "serieColor" }}
        enableArea
        areaOpacity={0.08}
        useMesh
        animate={false}
      />
    </div>
  );
}
