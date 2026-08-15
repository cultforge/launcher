type Props = {
  active: boolean;
  expiryLabel: string;
};

export function AdminCapabilityBadge({ active, expiryLabel }: Props) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-medium ${
        active
          ? "border-state-success/35 bg-state-success/10 text-state-success"
          : "border-state-warning/35 bg-state-warning/10 text-state-warning"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          active ? "bg-state-success animate-pulse" : "bg-state-warning"
        }`}
      />
      {active ? `Capability · ${expiryLabel}` : "Capability required"}
    </div>
  );
}
