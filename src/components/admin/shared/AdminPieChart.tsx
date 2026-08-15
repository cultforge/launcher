import { ResponsivePie } from "@nivo/pie";
import { adminChartColors, adminChartTheme } from "../../../lib/adminNivoTheme";
import { AdminEmptyState } from "./AdminEmptyState";

type Slice = { id: string; label: string; value: number };

type Props = {
  data: Slice[];
  height?: number;
};

export function AdminPieChart({ data, height = 180 }: Props) {
  if (!data.length) {
    return <AdminEmptyState title="No breakdown data" compact />;
  }

  return (
    <div style={{ height }}>
      <ResponsivePie
        data={data}
        theme={adminChartTheme}
        margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
        innerRadius={0.55}
        padAngle={1.5}
        cornerRadius={3}
        activeOuterRadiusOffset={6}
        colors={adminChartColors}
        borderWidth={1}
        borderColor={{ from: "color", modifiers: [["darker", 0.4]] }}
        enableArcLinkLabels={false}
        arcLabelsSkipAngle={12}
        arcLabelsTextColor="var(--color-text-primary)"
        animate={false}
      />
    </div>
  );
}
