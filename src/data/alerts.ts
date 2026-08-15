export type AlertKind = "Updates" | "Social" | "System";

export type AlertItem = {
  id: string;
  kind: AlertKind;
  title: string;
  body: string;
  time: string;
  unread?: boolean;
};

/** Notification feed — empty until live alert APIs are wired. */
export const DEMO_ALERTS: AlertItem[] = [];
