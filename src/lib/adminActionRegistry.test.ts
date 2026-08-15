import { describe, expect, it } from "vitest";
import { matchActionSchema } from "./adminActionSchemas";
import {
  buildActionBody,
  buildActionsFromCatalog,
  validateActionForm,
} from "./adminActionRegistry";
import type { AdminCatalogEntry } from "./adminApi";

function entry(method: string, path: string): AdminCatalogEntry {
  return { method, path, mutate: true };
}

describe("matchActionSchema", () => {
  it("matches notifications POST", () => {
    const schema = matchActionSchema(entry("POST", "/v1/admin/notifications"));
    expect(schema?.label).toBe("Send notification");
  });

  it("matches templated user sessions revoke", () => {
    const schema = matchActionSchema(
      entry("POST", "/v1/admin/sessions/{session_id}/revoke"),
    );
    expect(schema?.label).toBe("Revoke session");
  });

  it("matches roles PUT", () => {
    const schema = matchActionSchema(
      entry("PUT", "/v1/admin/users/{id}/roles"),
    );
    expect(schema?.label).toBe("Manage roles");
  });

  it("returns null for unmapped paths", () => {
    expect(matchActionSchema(entry("GET", "/v1/admin/unknown"))).toBeNull();
  });
});

describe("validateActionForm showWhen", () => {
  const notifications = buildActionsFromCatalog("notifications", [
    entry("POST", "/v1/admin/notifications"),
  ])[0];

  it("allows all-active mode without user_ids", () => {
    const err = validateActionForm(notifications, {
      title: "Maintenance",
      target_mode: "all",
      kind: "admin.maintenance",
    });
    expect(err).toBeNull();
  });

  it("still requires title", () => {
    const err = validateActionForm(notifications, {
      target_mode: "all",
    });
    expect(err).toMatch(/title/i);
  });
});

describe("buildActionBody", () => {
  it("maps notifications all-active target", () => {
    const action = buildActionsFromCatalog("notifications", [
      entry("POST", "/v1/admin/notifications"),
    ])[0];
    const body = buildActionBody(action, {
      title: "Hello",
      target_mode: "all",
      kind: "admin.notice",
    });
    expect(body).toEqual({
      title: "Hello",
      kind: "admin.notice",
      all_active: true,
    });
  });

  it("maps mail body_text field", () => {
    const action = buildActionsFromCatalog("mail", [
      entry("POST", "/v1/admin/mail"),
    ])[0];
    const body = buildActionBody(action, {
      to: "user@example.com",
      subject: "Test",
      body_text: "Plain body",
    });
    expect(body).toMatchObject({
      to: "user@example.com",
      subject: "Test",
      body_text: "Plain body",
    });
  });

  it("maps roles grant_admin", () => {
    const action = buildActionsFromCatalog("users", [
      entry("PUT", "/v1/admin/users/{id}/roles"),
    ])[0];
    const body = buildActionBody(
      action,
      { role_action: "grant_admin" },
      { id: "u1" },
    );
    expect(body).toEqual({ grant_admin: true });
  });
});
