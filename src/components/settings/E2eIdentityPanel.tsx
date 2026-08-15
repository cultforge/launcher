import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  enrollE2eIdentity,
  fetchE2ePublicIdentity,
  loadLocalE2eIdentity,
  type LocalE2eIdentity,
} from "../../lib/cryptoIdentityApi";
import { useAppStore } from "../../userstore";

export function E2eIdentityPanel() {
  const userId = useAppStore((s) => s.currentUser?.id ?? "");
  const [local, setLocal] = useState<LocalE2eIdentity | null>(null);
  const [busy, setBusy] = useState(false);
  const [remoteSummary, setRemoteSummary] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const next = await loadLocalE2eIdentity();
    setLocal(next);
    if (!userId) {
      setRemoteSummary(null);
      return;
    }
    try {
      const remote = await fetchE2ePublicIdentity(userId);
      setRemoteSummary(
        remote.publicKeyJwk
          ? `Server has a public key (${remote.algorithm || "ECDSA"}).`
          : "No public identity on the server yet.",
      );
    } catch {
      setRemoteSummary("Could not load remote identity (offline or not enrolled).");
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onEnroll = async () => {
    setBusy(true);
    try {
      const next = await enrollE2eIdentity();
      setLocal(next);
      toast.success("E2E identity enrolled");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Enrollment failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3 flex flex-col gap-3">
      <div>
        <div className="text-[13px] text-text-primary font-medium">
          End-to-end identity
        </div>
        <p className="text-[11px] text-text-muted mt-1 leading-relaxed">
          Generates a local ECDSA P-256 keypair and registers the public key with
          CultForge auth. Private key stays on this device.
        </p>
      </div>
      <div className="text-[11px] text-text-secondary space-y-1">
        <p>
          Local key:{" "}
          {local?.hasPrivateKey ? "present" : "not generated"}
          {local?.enrolledAt
            ? ` · enrolled ${new Date(local.enrolledAt).toLocaleString()}`
            : ""}
        </p>
        {remoteSummary ? <p>{remoteSummary}</p> : null}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void onEnroll()}
        className="w-fit px-3.5 py-2 text-[11px] font-semibold rounded-lg border border-primary-base/30 text-primary-base hover:bg-primary-base/10 cursor-pointer disabled:opacity-50"
      >
        {busy
          ? "Enrolling…"
          : local?.enrolledAt
            ? "Re-enroll public key"
            : "Generate & enroll"}
      </button>
    </div>
  );
}
