export type StartupPhase =
  | "restoring-preferences"
  | "starting-services"
  | "connecting-services"
  | "signing-in"
  | "offline"
  | "ready";

export const STARTUP_LABELS: Record<StartupPhase, string> = {
  "restoring-preferences": "Restoring preferences",
  "starting-services": "Starting local services",
  "connecting-services": "Connecting services",
  "signing-in": "Signing in",
  offline: "Entering offline mode",
  ready: "Ready",
};
