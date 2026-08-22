export function ManagedBuildBanner({ extrasHint }: { extrasHint?: string }) {
  return (
    <p className="text-[11px] text-text-muted px-0.5">
      Guild-managed — content follows the guild manifest. Local add, remove, and
      enable/disable are locked for everyone, including Officers.
      {extrasHint ? (
        <>
          {" "}
          <span className="text-amber-400/90">{extrasHint}</span>
        </>
      ) : null}
    </p>
  );
}
