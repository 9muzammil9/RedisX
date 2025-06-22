import { RedisConnection } from "../types";

const API_BASE = "http://localhost:4000/api/persistence";

// Connection persistence
export async function saveConnection(
  connection: RedisConnection
): Promise<void> {
  try {
    const response = await fetch(`${API_BASE}/connections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(connection),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  } catch (error) {
    console.warn("Failed to save connection to SQLite:", error);
    throw error;
  }
}

export async function loadConnections(): Promise<RedisConnection[]> {
  const response = await fetch(`${API_BASE}/connections`);
  if (!response.ok) return [];
  return response.json();
}

export async function removeConnection(id: string): Promise<void> {
  await fetch(`${API_BASE}/connections/${id}`, {
    method: "DELETE",
  });
}

// Subscription persistence
export async function saveSubscriptions(
  connectionId: string,
  subscriptions: Map<string, boolean>
): Promise<void> {
  const subscriptionsObj = Object.fromEntries(subscriptions);
  await fetch(`${API_BASE}/subscriptions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      connectionId,
      subscriptions: subscriptionsObj,
    }),
  });
}

export async function loadSubscriptions(
  connectionId: string
): Promise<Map<string, boolean>> {
  try {
    const response = await fetch(`${API_BASE}/subscriptions/${connectionId}`);
    if (!response.ok) return new Map();

    const subscriptionsObj = await response.json();
    return new Map(Object.entries(subscriptionsObj));
  } catch (error) {
    console.error("Failed to load subscriptions:", error);
    return new Map();
  }
}

export async function removeSubscriptions(connectionId: string): Promise<void> {
  await fetch(`${API_BASE}/subscriptions/${connectionId}`, {
    method: "DELETE",
  });
}

// Message persistence
interface PubSubMessage {
  id: string;
  channel: string;
  message: string;
  timestamp: string;
}

export async function saveChannelMessages(
  connectionId: string,
  channel: string,
  messages: PubSubMessage[],
  maxMessages: number = 100
): Promise<void> {
  await fetch(`${API_BASE}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      connectionId,
      channel,
      messages,
      maxMessages,
    }),
  });
}

export async function loadChannelMessages(
  connectionId: string,
  channel: string
): Promise<PubSubMessage[]> {
  try {
    const response = await fetch(
      `${API_BASE}/messages/${connectionId}/${encodeURIComponent(channel)}`
    );
    if (!response.ok) return [];
    return response.json();
  } catch (error) {
    console.error("Failed to load channel messages:", error);
    return [];
  }
}

export async function removeSpecificMessage(
  connectionId: string,
  channel: string,
  messageId: string
): Promise<void> {
  await fetch(
    `${API_BASE}/messages/${connectionId}/${encodeURIComponent(
      channel
    )}/${encodeURIComponent(messageId)}`,
    {
      method: "DELETE",
    }
  );
}

export async function removeChannelMessages(
  connectionId: string,
  channel: string
): Promise<void> {
  await fetch(
    `${API_BASE}/messages/${connectionId}/${encodeURIComponent(channel)}`,
    {
      method: "DELETE",
    }
  );
}

export async function removeConnectionMessages(
  connectionId: string
): Promise<void> {
  await fetch(`${API_BASE}/messages/${connectionId}`, {
    method: "DELETE",
  });
}

// App state persistence
export async function saveAppState(key: string, value: string): Promise<void> {
  await fetch(`${API_BASE}/app-state`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
}

export async function loadAppState(key: string): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE}/app-state/${key}`);
    if (!response.ok) return null;

    const { value } = await response.json();
    return value;
  } catch (error) {
    console.error("Failed to load app state:", error);
    return null;
  }
}

// Utility functions for backward compatibility with localStorage
export function loadConnectionsSync(): RedisConnection[] {
  // This will be replaced with async loading during app initialization
  return [];
}

export function loadActiveConnectionSync(): string | null {
  // This will be replaced with async loading during app initialization
  return null;
}

// Cleanup
export async function cleanupOldMessages(maxAge: number = 7): Promise<void> {
  await fetch(`${API_BASE}/cleanup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ maxAge }),
  });
}
