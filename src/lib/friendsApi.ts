import { ClientHttpError, send, sendMutate } from "./client";

export class FriendsApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "FriendsApiError";
    this.status = status;
  }
}

function wrap(prefix: string, err: unknown): FriendsApiError {
  if (err instanceof ClientHttpError) {
    return new FriendsApiError(`${prefix}: ${err.message}`, err.status);
  }
  if (err instanceof FriendsApiError) return err;
  return new FriendsApiError(
    `${prefix}: ${err instanceof Error ? err.message : String(err)}`,
  );
}

function asRecord(data: unknown): Record<string, unknown> | null {
  return data && typeof data === "object"
    ? (data as Record<string, unknown>)
    : null;
}

function unwrapList(data: unknown, keys: string[]): unknown[] {
  if (Array.isArray(data)) return data;
  const obj = asRecord(data);
  if (!obj) return [];
  for (const key of keys) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }
  return [];
}

export type FriendRequestRow = {
  connectionId: string;
  peerId: string;
  username: string;
  handleName?: string;
  avatarUrl?: string;
  direction: "incoming" | "outgoing";
};

function mapRequestRow(
  raw: unknown,
  direction: "incoming" | "outgoing",
): FriendRequestRow | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const peerId = String(
    obj.user_id ?? obj.peer_id ?? obj.to_id ?? obj.from_id ?? "",
  ).trim();
  const connectionId = String(obj.connection_id ?? obj.id ?? "").trim();
  if (!peerId && !connectionId) return null;
  return {
    connectionId: connectionId || peerId,
    peerId: peerId || connectionId,
    username:
      String(obj.username ?? obj.name ?? "").trim() || peerId || "Player",
    handleName:
      typeof obj.handle_name === "string" ? obj.handle_name : undefined,
    avatarUrl: typeof obj.avatar_url === "string" ? obj.avatar_url : undefined,
    direction,
  };
}

export async function fetchFriendRequests(): Promise<{
  incoming: FriendRequestRow[];
  outgoing: FriendRequestRow[];
}> {
  try {
    const raw = await send<unknown>("api", "get_friend_requests", {
      scope: "both",
    });
    const obj = asRecord(raw);
    const incoming = unwrapList(obj?.incoming ?? raw, ["incoming"]).map((r) =>
      mapRequestRow(r, "incoming"),
    );
    const outgoing = unwrapList(obj?.outgoing ?? [], ["outgoing"]).map((r) =>
      mapRequestRow(r, "outgoing"),
    );
    return {
      incoming: incoming.filter((x): x is FriendRequestRow => Boolean(x)),
      outgoing: outgoing.filter((x): x is FriendRequestRow => Boolean(x)),
    };
  } catch (err) {
    throw wrap("Could not load friend requests", err);
  }
}

export async function requestFriend(target: string): Promise<void> {
  try {
    await sendMutate(
      "api",
      "request_friend",
      { target: target.trim() },
      "POST",
    );
  } catch (err) {
    throw wrap("Could not send friend request", err);
  }
}

export async function acceptFriend(opts: {
  peerId?: string;
  connectionId?: string;
}): Promise<void> {
  const body: Record<string, unknown> = {};
  if (opts.peerId) body.peer_id = opts.peerId;
  if (opts.connectionId) body.connection_id = opts.connectionId;
  try {
    await sendMutate("api", "accept_friend", body, "POST");
  } catch (err) {
    throw wrap("Could not accept friend request", err);
  }
}

export async function rejectFriend(opts: {
  peerId?: string;
  connectionId?: string;
}): Promise<void> {
  const body: Record<string, unknown> = {};
  if (opts.peerId) body.peer_id = opts.peerId;
  if (opts.connectionId) body.connection_id = opts.connectionId;
  try {
    await sendMutate("api", "reject_friend", body, "POST");
  } catch (err) {
    throw wrap("Could not reject friend request", err);
  }
}

export async function removeFriend(peerId: string): Promise<void> {
  try {
    await sendMutate(
      "api",
      "remove_friend",
      { peer_id: peerId },
      "DELETE",
    );
  } catch (err) {
    throw wrap("Could not remove friend", err);
  }
}

export async function discoverFriends(
  query: string,
  limit = 20,
): Promise<unknown[]> {
  try {
    const raw = await send<unknown>("api", "discover_friends", {
      query: query.trim(),
      limit: String(limit),
    });
    return unwrapList(raw, ["data", "users", "results", "friends"]);
  } catch (err) {
    throw wrap("Could not discover friends", err);
  }
}

export async function fetchPlayerStats(
  identifier: string,
): Promise<Record<string, unknown> | null> {
  try {
    const raw = await send<unknown>("api", "get_player_stats", {
      identifier,
    });
    const obj = asRecord(raw);
    const stats = asRecord(obj?.stats ?? obj?.data ?? raw);
    return stats;
  } catch {
    return null;
  }
}
