import { create } from "zustand";
import { RedisConnection, PubSubStats } from "../types";
import * as persistence from "../services/persistence";
// Keep localStorage as primary storage with SQLite as backup/sync
import {
  saveConnections,
  loadConnections,
  saveActiveConnection,
  loadActiveConnection,
  removeConnection as removeStoredConnection,
} from "../utils/connectionStorage";
import {
  saveSubscriptions,
  loadSubscriptions,
  removeSubscriptions,
} from "../utils/subscriptionStorage";
import {
  saveChannelMessages,
  loadChannelMessages,
  removeSpecificMessage,
  removeChannelMessages,
  removeConnectionMessages,
} from "../utils/messageStorage";

export interface PubSubMessage {
  id: string;
  channel: string;
  message: string;
  timestamp: string;
}

interface AppState {
  connections: RedisConnection[];
  activeConnectionId: string | null;
  selectedKeys: Set<string>;
  theme: "light" | "dark";
  showConnectionsPanel: boolean;
  expandedValueItems: Set<string>;

  // Pub/Sub state
  pubsubStats: PubSubStats | null;
  selectedChannels: Set<string>;
  channelPattern: string;
  subscribedChannels: Map<string, boolean>; // channel -> persistMessages
  messages: PubSubMessage[];
  maxMessages: number;
  isWebSocketConnected: boolean;
  recentMessageIds: Map<string, number>; // messageKey -> timestamp for deduplication

  setConnections: (connections: RedisConnection[]) => void;
  addConnection: (connection: RedisConnection) => void;
  removeConnection: (id: string) => void;
  setActiveConnection: (id: string | null, forceReload?: boolean) => void;
  refreshActiveConnection: () => void;
  toggleKeySelection: (key: string) => void;
  selectAllKeys: (keys: string[]) => void;
  clearSelection: () => void;
  toggleTheme: () => void;
  toggleConnectionsPanel: () => void;
  toggleValueItemExpansion: (itemId: string) => void;
  expandAllValueItems: (itemIds: string[]) => void;
  collapseAllValueItems: () => void;

  // Pub/Sub actions
  setPubsubStats: (stats: PubSubStats | null) => void;
  toggleChannelSelection: (channel: string) => void;
  selectAllChannels: (channels: string[]) => void;
  clearChannelSelection: () => void;
  setChannelPattern: (pattern: string) => void;

  // Real-time pub/sub actions
  setSubscribedChannels: (channels: Map<string, boolean>) => void;
  addSubscribedChannel: (channel: string, persistMessages?: boolean) => void;
  removeSubscribedChannel: (channel: string) => void;
  toggleChannelPersistence: (channel: string) => void;
  clearSubscribedChannels: () => void;
  addMessage: (message: PubSubMessage) => void;
  deleteMessage: (messageId: string) => void;
  clearMessages: () => void;
  setMaxMessages: (max: number) => void;
  setWebSocketConnected: (connected: boolean) => void;

  // Sync localStorage to SQLite (optional background operation)
  initializeFromDatabase: () => Promise<void>;
}

// Initialize subscriptions and messages for the active connection immediately
const getInitialPubSubState = () => {
  const activeConnectionId = loadActiveConnection();
  if (activeConnectionId) {
    const channels = loadSubscriptions(activeConnectionId);

    // Load persistent messages for channels with persistence enabled
    const persistentMessages: PubSubMessage[] = [];
    channels.forEach((persistMessages, channel) => {
      if (persistMessages) {
        const channelMessages = loadChannelMessages(
          activeConnectionId,
          channel
        );
        persistentMessages.push(...channelMessages);
      }
    });

    // Sort messages by timestamp (newest first)
    persistentMessages.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return {
      subscribedChannels: channels,
      messages: persistentMessages.slice(0, 100), // maxMessages
    };
  }

  return {
    subscribedChannels: new Map(),
    messages: [],
  };
};

const initialPubSubState = getInitialPubSubState();

export const useStore = create<AppState>((set, get) => ({
  connections: loadConnections(), // Load immediately from localStorage
  activeConnectionId: loadActiveConnection(), // Load immediately from localStorage
  selectedKeys: new Set(),
  theme: (localStorage.getItem("theme") as "light" | "dark") || "light",
  showConnectionsPanel:
    localStorage.getItem("showConnectionsPanel") !== "false", // Default to true
  expandedValueItems: new Set(),

  // Pub/Sub initial state - loaded from localStorage
  pubsubStats: null,
  selectedChannels: new Set(),
  channelPattern: "*",
  subscribedChannels: initialPubSubState.subscribedChannels,
  messages: initialPubSubState.messages,
  maxMessages: 100,
  isWebSocketConnected: false,
  recentMessageIds: new Map(),

  setConnections: (connections) => {
    // Save to localStorage (primary) and sync to SQLite (backup)
    saveConnections(connections);
    connections.forEach((conn) =>
      persistence.saveConnection(conn).catch(console.error)
    );
    set({ connections });
  },

  addConnection: (connection) => {
    set((state) => {
      const newConnections = [...state.connections, connection];
      // Save to localStorage (primary) and sync to SQLite (backup)
      saveConnections(newConnections);

      // Save connection to SQLite first, then sync any existing subscriptions
      persistence
        .saveConnection(connection)
        .then(() => {
          console.log(`✅ Saved connection ${connection.id} to SQLite`);
          // If this is becoming the active connection and has subscriptions, sync them
          if (
            state.activeConnectionId === connection.id &&
            state.subscribedChannels.size > 0
          ) {
            return persistence.saveSubscriptions(
              connection.id,
              state.subscribedChannels
            );
          }
        })
        .catch(console.error);

      return { connections: newConnections };
    });
  },

  removeConnection: (id) => {
    // Remove from localStorage (primary) and sync to SQLite (backup)
    removeStoredConnection(id);
    removeSubscriptions(id);
    removeConnectionMessages(id);
    // Also remove from SQLite
    persistence.removeConnection(id).catch(console.error);
    persistence.removeSubscriptions(id).catch(console.error);
    persistence.removeConnectionMessages(id).catch(console.error);

    set((state) => ({
      connections: state.connections.filter((c) => c.id !== id),
      activeConnectionId:
        state.activeConnectionId === id ? null : state.activeConnectionId,
      subscribedChannels:
        state.activeConnectionId === id ? new Map() : state.subscribedChannels,
    }));
  },

  setActiveConnection: (id, forceReload = false) => {
    // Save to localStorage (primary) and sync to SQLite (backup)
    saveActiveConnection(id);
    persistence
      .saveAppState("activeConnectionId", id || "")
      .catch(console.error);

    set((state) => {
      // Save current subscriptions before switching (to both storages)
      if (state.activeConnectionId && state.activeConnectionId !== id) {
        saveSubscriptions(state.activeConnectionId, state.subscribedChannels);
        persistence
          .saveSubscriptions(state.activeConnectionId, state.subscribedChannels)
          .catch(console.error);
      }

      // If setting to a new connection OR forceReload is true, load its subscriptions and messages
      if (id && (state.activeConnectionId !== id || forceReload)) {
        // Load subscriptions for the new connection
        const newChannels = loadSubscriptions(id);

        // Load persistent messages for channels with persistence enabled
        const persistentMessages: PubSubMessage[] = [];
        newChannels.forEach((persistMessages, channel) => {
          if (persistMessages) {
            const channelMessages = loadChannelMessages(id, channel);
            persistentMessages.push(...channelMessages);
          }
        });

        // Sort messages by timestamp (newest first)
        persistentMessages.sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );

        return {
          activeConnectionId: id,
          subscribedChannels: newChannels,
          messages: persistentMessages.slice(0, state.maxMessages),
        };
      } else {
        return {
          activeConnectionId: id,
          subscribedChannels: new Map(),
          messages: [],
        };
      }
    });
  },

  refreshActiveConnection: () => {
    set((state) => {
      if (!state.activeConnectionId) return state;

      console.log(
        `🔄 Refreshing subscriptions and messages for connection: ${state.activeConnectionId}`
      );

      // Save current subscriptions first
      saveSubscriptions(state.activeConnectionId, state.subscribedChannels);
      persistence
        .saveSubscriptions(state.activeConnectionId, state.subscribedChannels)
        .catch(console.error);

      // Reload subscriptions and messages for the current connection
      const channels = loadSubscriptions(state.activeConnectionId);

      // Load persistent messages for channels with persistence enabled
      const persistentMessages: PubSubMessage[] = [];
      channels.forEach((persistMessages, channel) => {
        if (persistMessages) {
          const channelMessages = loadChannelMessages(
            state.activeConnectionId!,
            channel
          );
          persistentMessages.push(...channelMessages);
        }
      });

      // Sort messages by timestamp (newest first)
      persistentMessages.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      console.log(
        `✅ Refreshed ${channels.size} subscriptions and ${persistentMessages.length} messages`
      );

      return {
        ...state,
        subscribedChannels: channels,
        messages: persistentMessages.slice(0, state.maxMessages),
      };
    });
  },

  toggleKeySelection: (key) =>
    set((state) => {
      const newSelection = new Set(state.selectedKeys);
      if (newSelection.has(key)) {
        newSelection.delete(key);
      } else {
        newSelection.add(key);
      }
      return { selectedKeys: newSelection };
    }),

  selectAllKeys: (keys) => set({ selectedKeys: new Set(keys) }),

  clearSelection: () => set({ selectedKeys: new Set() }),

  toggleTheme: () =>
    set((state) => {
      const newTheme = state.theme === "light" ? "dark" : "light";
      localStorage.setItem("theme", newTheme);
      return { theme: newTheme };
    }),

  toggleConnectionsPanel: () =>
    set((state) => {
      const newShowPanel = !state.showConnectionsPanel;
      localStorage.setItem("showConnectionsPanel", newShowPanel.toString());
      return { showConnectionsPanel: newShowPanel };
    }),

  toggleValueItemExpansion: (itemId) =>
    set((state) => {
      const newExpanded = new Set(state.expandedValueItems);
      if (newExpanded.has(itemId)) {
        newExpanded.delete(itemId);
      } else {
        newExpanded.add(itemId);
      }
      return { expandedValueItems: newExpanded };
    }),

  expandAllValueItems: (itemIds) =>
    set({ expandedValueItems: new Set(itemIds) }),

  collapseAllValueItems: () => set({ expandedValueItems: new Set() }),

  // Pub/Sub actions
  setPubsubStats: (stats) => set({ pubsubStats: stats }),

  toggleChannelSelection: (channel) =>
    set((state) => {
      const newSelection = new Set(state.selectedChannels);
      if (newSelection.has(channel)) {
        newSelection.delete(channel);
      } else {
        newSelection.add(channel);
      }
      return { selectedChannels: newSelection };
    }),

  selectAllChannels: (channels) => set({ selectedChannels: new Set(channels) }),

  clearChannelSelection: () => set({ selectedChannels: new Set() }),

  setChannelPattern: (pattern) => set({ channelPattern: pattern }),

  // Real-time pub/sub actions
  setSubscribedChannels: (channels) =>
    set((state) => {
      if (state.activeConnectionId) {
        // Save to localStorage (primary) and sync to SQLite (backup)
        saveSubscriptions(state.activeConnectionId, channels);

        // Ensure connection exists in SQLite before saving subscriptions
        const activeConnection = state.connections.find(
          (c) => c.id === state.activeConnectionId
        );
        if (activeConnection) {
          persistence
            .saveConnection(activeConnection)
            .then(() =>
              persistence.saveSubscriptions(state.activeConnectionId!, channels)
            )
            .catch(console.error);
        }
      }
      return { subscribedChannels: channels };
    }),

  addSubscribedChannel: (channel, persistMessages = false) =>
    set((state) => {
      const newChannels = new Map(state.subscribedChannels);
      newChannels.set(channel, persistMessages);
      if (state.activeConnectionId) {
        // Save to localStorage (primary) and sync to SQLite (backup)
        saveSubscriptions(state.activeConnectionId, newChannels);

        // Ensure connection exists in SQLite before saving subscriptions
        const activeConnection = state.connections.find(
          (c) => c.id === state.activeConnectionId
        );
        if (activeConnection) {
          persistence
            .saveConnection(activeConnection)
            .then(() =>
              persistence.saveSubscriptions(
                state.activeConnectionId!,
                newChannels
              )
            )
            .catch(console.error);
        }
      }
      return { subscribedChannels: newChannels };
    }),

  removeSubscribedChannel: (channel) =>
    set((state) => {
      const newChannels = new Map(state.subscribedChannels);
      newChannels.delete(channel);
      if (state.activeConnectionId) {
        // Save to localStorage (primary) and sync to SQLite (backup)
        saveSubscriptions(state.activeConnectionId, newChannels);
        removeChannelMessages(state.activeConnectionId, channel);
        // Also sync to SQLite
        persistence
          .saveSubscriptions(state.activeConnectionId, newChannels)
          .catch(console.error);
        persistence
          .removeChannelMessages(state.activeConnectionId, channel)
          .catch(console.error);
      }
      return { subscribedChannels: newChannels };
    }),

  toggleChannelPersistence: (channel) =>
    set((state) => {
      const newChannels = new Map(state.subscribedChannels);
      const currentPersistence = newChannels.get(channel) || false;
      newChannels.set(channel, !currentPersistence);

      if (state.activeConnectionId) {
        // Save to localStorage (primary) and sync to SQLite (backup)
        saveSubscriptions(state.activeConnectionId, newChannels);
        persistence
          .saveSubscriptions(state.activeConnectionId, newChannels)
          .catch(console.error);

        // If turning off persistence, remove stored messages from both storages
        if (currentPersistence) {
          removeChannelMessages(state.activeConnectionId, channel);
          persistence
            .removeChannelMessages(state.activeConnectionId, channel)
            .catch(console.error);
        }
      }

      return { subscribedChannels: newChannels };
    }),

  clearSubscribedChannels: () =>
    set((state) => {
      if (state.activeConnectionId) {
        // Clear from localStorage (primary) and sync to SQLite (backup)
        saveSubscriptions(state.activeConnectionId, new Map());
        persistence
          .saveSubscriptions(state.activeConnectionId, new Map())
          .catch(console.error);
      }
      return { subscribedChannels: new Map() };
    }),

  // Note: loadSubscribedChannels is now handled automatically in setActiveConnection and initializeFromDatabase

  addMessage: (message) =>
    set((state) => {
      // Create a unique key for this message for deduplication
      const messageKey = `${message.channel}:${message.timestamp}:${message.message}`;
      const now = Date.now();

      // Check if we've seen this message recently (within last 5 seconds)
      const recentTime = state.recentMessageIds.get(messageKey);
      if (recentTime && now - recentTime < 5000) {
        console.log("🔄 Skipping duplicate message:", messageKey);
        return state; // Don't add duplicate
      }

      // Add to recent messages map with timestamp
      const newRecentIds = new Map(state.recentMessageIds);
      newRecentIds.set(messageKey, now);

      // Clean up old message IDs (remove entries older than 10 seconds)
      const cutoffTime = now - 10000;
      for (const [key, timestamp] of newRecentIds.entries()) {
        if (timestamp < cutoffTime) {
          newRecentIds.delete(key);
        }
      }

      const newMessages = [message, ...state.messages];
      // Keep only the latest maxMessages
      if (newMessages.length > state.maxMessages) {
        newMessages.splice(state.maxMessages);
      }

      // Save message to localStorage (primary) and sync to SQLite (backup) if persistence is enabled for this channel
      if (
        state.activeConnectionId &&
        state.subscribedChannels.get(message.channel)
      ) {
        const channelMessages = newMessages.filter(
          (msg) => msg.channel === message.channel
        );
        saveChannelMessages(
          state.activeConnectionId,
          message.channel,
          channelMessages,
          state.maxMessages
        );

        // Ensure connection exists in SQLite before saving messages
        const activeConnection = state.connections.find(
          (c) => c.id === state.activeConnectionId
        );
        if (activeConnection) {
          persistence
            .saveConnection(activeConnection)
            .then(() =>
              persistence.saveChannelMessages(
                state.activeConnectionId!,
                message.channel,
                channelMessages,
                state.maxMessages
              )
            )
            .catch(console.error);
        }
      }

      return {
        messages: newMessages,
        recentMessageIds: newRecentIds,
      };
    }),

  deleteMessage: (messageId) =>
    set((state) => {
      // Remove message from the UI
      const updatedMessages = state.messages.filter(
        (msg) => msg.id !== messageId
      );

      // Find the message to get its channel info
      const messageToDelete = state.messages.find(
        (msg) => msg.id === messageId
      );

      if (messageToDelete && state.activeConnectionId) {
        // Update persistent storage if the channel has persistence enabled
        const isPersistent = state.subscribedChannels.get(
          messageToDelete.channel
        );
        if (isPersistent) {
          // Update localStorage - remove specific message
          removeSpecificMessage(
            state.activeConnectionId,
            messageToDelete.channel,
            messageId
          );

          // Update SQLite - remove specific message
          persistence
            .removeSpecificMessage(
              state.activeConnectionId,
              messageToDelete.channel,
              messageId
            )
            .catch(console.error);

          console.log(
            `🗑️ Deleted message ${messageId} from channel ${messageToDelete.channel}`
          );
        }
      }

      return { messages: updatedMessages };
    }),

  clearMessages: () =>
    set((state) => {
      if (state.activeConnectionId) {
        // Clear messages for all channels with persistence enabled
        state.subscribedChannels.forEach((persistMessages, channel) => {
          if (persistMessages) {
            // Clear from localStorage
            removeChannelMessages(state.activeConnectionId!, channel);
            // Clear from SQLite
            persistence
              .removeChannelMessages(state.activeConnectionId!, channel)
              .catch(console.error);
          }
        });

        console.log("🗑️ Cleared all persistent messages");
      }

      return { messages: [] };
    }),

  setMaxMessages: (max) => set({ maxMessages: max }),

  setWebSocketConnected: (connected) =>
    set({ isWebSocketConnected: connected }),

  // Initialize and recover connections from server restart
  initializeFromDatabase: async () => {
    try {
      console.log("🔄 Initializing and recovering connections...");
      const state = get();

      // First, ensure all existing connections are saved to SQLite immediately
      console.log("💾 Syncing existing connections to SQLite...");
      for (const connection of state.connections) {
        try {
          await persistence.saveConnection(connection);
          console.log(`✅ Synced connection ${connection.id} to SQLite`);
        } catch (error) {
          console.error(
            `❌ Failed to sync connection ${connection.id}:`,
            error
          );
        }
      }

      if (state.connections.length > 0) {
        // Import recovery utilities
        const { recoverAllConnections } = await import(
          "../utils/connectionRecovery"
        );

        // Recover connections (recreate any that don't exist on server with same IDs)
        const { recoveredConnections, connectionMigrations } =
          await recoverAllConnections(state.connections);

        // Since we now preserve IDs, there should be no migrations needed
        if (connectionMigrations.length > 0) {
          console.warn(
            "⚠️ Unexpected connection ID changes detected:",
            connectionMigrations
          );
        }

        // Update store with recovered connections (should be same as original)
        set({ connections: recoveredConnections });
        saveConnections(recoveredConnections);
        console.log(`✅ Recovered ${recoveredConnections.length} connections`);

        // Re-sync recovered connections to SQLite to ensure they're up to date
        for (const connection of recoveredConnections) {
          await persistence.saveConnection(connection);
        }
      }

      // Final sync to SQLite - save app state and subscriptions
      try {
        const updatedState = get();

        // Save app state
        if (updatedState.activeConnectionId) {
          await persistence.saveAppState(
            "activeConnectionId",
            updatedState.activeConnectionId
          );

          // Save subscriptions (connections are now guaranteed to exist in SQLite)
          if (updatedState.subscribedChannels.size > 0) {
            await persistence.saveSubscriptions(
              updatedState.activeConnectionId,
              updatedState.subscribedChannels
            );
            console.log(
              `✅ Synced ${updatedState.subscribedChannels.size} subscriptions to SQLite`
            );
          }
        }

        console.log("✅ Complete sync to SQLite finished");
      } catch (syncError) {
        console.warn(
          "⚠️ SQLite sync failed (continuing with localStorage):",
          syncError
        );
      }
    } catch (error) {
      console.error("⚠️ Failed to initialize/recover connections:", error);
      // Continue with existing state if recovery fails
    }
  },
}));
