import { ClientHttpError, send, sendMutate } from "./client";
import type { UserPersonalServerRecord } from "../types/catalog";

export class PersonalServerApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "PersonalServerApiError";
    this.status = status;
  }
}

function wrap(prefix: string, err: unknown): PersonalServerApiError {
  if (err instanceof ClientHttpError)
    return new PersonalServerApiError(`${prefix}: ${err.message}`, err.status);
  if (err instanceof PersonalServerApiError) return err;
  return new PersonalServerApiError(
    `${prefix}: ${err instanceof Error ? err.message : String(err)}`,
  );
}

function asRecord(data: unknown): Record<string, unknown> | null {
  return data && typeof data === "object"
    ? (data as Record<string, unknown>)
    : null;
}

function unwrapList(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const obj = asRecord(data);
  if (!obj) return [];
  for (const key of ["data", "items", "servers", "results"]) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }
  return [];
}

function unwrapOne(data: unknown): unknown {
  const obj = asRecord(data);
  if (!obj) return data;
  for (const key of ["data", "server", "item"]) {
    if (obj[key] !== undefined) return obj[key];
  }
  return data;
}

function recordFromApi(raw: unknown): UserPersonalServerRecord | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const id = String(obj.id ?? "").trim();
  const name = String(obj.name ?? "").trim();
  if (!id || !name) return null;
  const addr = String(obj.server_address ?? obj.configured_address ?? "");
  const port = Number(obj.port ?? obj.configured_port ?? 25565) || 25565;
  return {
    id,
    ownerId: String(obj.owner_id ?? ""),
    name,
    serverAddress: addr,
    port,
    configuredAddress: String(obj.configured_address ?? addr),
    configuredPort: Number(obj.configured_port ?? port) || port,
    effectiveAddress: String(obj.effective_address ?? obj.configured_address ?? addr),
    effectivePort: Number(obj.effective_port ?? obj.configured_port ?? port) || port,
    addressSource: obj.address_source === "tunnel" ? "tunnel" : "configured",
    buildId: typeof obj.build_id === "string" ? obj.build_id : undefined,
    themeColor: typeof obj.theme_color === "string" ? obj.theme_color : "#7A2CFF",
    isActive: obj.is_active !== false,
  };
}

/** Address a user should connect to (respects tunnel override). */
export function personalServerJoinAddress(
  server: UserPersonalServerRecord,
): { address: string; port: number } {
  return {
    address: server.effectiveAddress,
    port: server.effectivePort,
  };
}

export async function listPersonalServers(): Promise<UserPersonalServerRecord[]> {
  try {
    const raw = await send<unknown>("api", "list_my_personal_servers");
    return unwrapList(raw)
      .map(recordFromApi)
      .filter((x): x is UserPersonalServerRecord => Boolean(x));
  } catch (err) {
    throw wrap("Could not list your servers", err);
  }
}

export async function fetchPersonalServer(
  serverId: string,
): Promise<UserPersonalServerRecord> {
  try {
    const raw = await send<unknown>("api", "get_personal_server", {
      server_id: serverId,
    });
    const record = recordFromApi(unwrapOne(raw));
    if (!record) throw new PersonalServerApiError("Server not found", 404);
    return record;
  } catch (err) {
    throw wrap("Could not fetch server", err);
  }
}

export type PersonalServerWritePayload = {
  name: string;
  serverAddress: string;
  port?: number;
  buildId?: string;
  themeColor?: string;
};

export async function createPersonalServer(
  payload: PersonalServerWritePayload,
): Promise<UserPersonalServerRecord> {
  try {
    const body: Record<string, unknown> = {
      name: payload.name,
      server_address: payload.serverAddress,
    };
    if (payload.port) body.port = payload.port;
    if (payload.buildId) body.build_id = payload.buildId;
    if (payload.themeColor) body.theme_color = payload.themeColor;
    const raw = await sendMutate("api", "create_personal_server", body, "POST");
    const record = recordFromApi(unwrapOne(raw));
    if (!record)
      throw new PersonalServerApiError("Create server response malformed", 502);
    return record;
  } catch (err) {
    throw wrap("Could not create server", err);
  }
}

export async function updatePersonalServer(
  serverId: string,
  payload: Partial<PersonalServerWritePayload>,
): Promise<UserPersonalServerRecord> {
  try {
    const body: Record<string, unknown> = { server_id: serverId };
    if (payload.name !== undefined) body.name = payload.name;
    if (payload.serverAddress !== undefined) body.server_address = payload.serverAddress;
    if (payload.port !== undefined) body.port = payload.port;
    if (payload.buildId !== undefined) body.build_id = payload.buildId;
    if (payload.themeColor !== undefined) body.theme_color = payload.themeColor;
    const raw = await sendMutate("api", "update_personal_server", body, "PATCH");
    const record = recordFromApi(unwrapOne(raw));
    if (!record)
      throw new PersonalServerApiError("Update server response malformed", 502);
    return record;
  } catch (err) {
    throw wrap("Could not update server", err);
  }
}

export async function deletePersonalServer(serverId: string): Promise<void> {
  try {
    await sendMutate(
      "api",
      "delete_personal_server",
      { server_id: serverId },
      "DELETE",
    );
  } catch (err) {
    throw wrap("Could not delete server", err);
  }
}
