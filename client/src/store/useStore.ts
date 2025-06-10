import { create } from 'zustand';
import { RedisConnection, PubSubStats } from '../types';
import { saveConnections, loadConnections, saveActiveConnection, loadActiveConnection, removeConnection as removeStoredConnection } from '../utils/connectionStorage';
import { saveSubscriptions, loadSubscriptions, removeSubscriptions, loadSubscriptionsLegacy } from '../utils/subscriptionStorage';
import { saveChannelMessages, loadChannelMessages, removeChannelMessages, removeConnectionMessages } from '../utils/messageStorage';

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
  theme: 'light' | 'dark';
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
  setActiveConnection: (id: string | null) => void;
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
  loadSubscribedChannels: (connectionId: string) => void;
  addMessage: (message: PubSubMessage) => void;
  clearMessages: () => void;
  setMaxMessages: (max: number) => void;
  setWebSocketConnected: (connected: boolean) => void;
}

export const useStore = create<AppState>((set) => ({
  connections: loadConnections(),
  activeConnectionId: loadActiveConnection(),
  selectedKeys: new Set(),
  theme: (localStorage.getItem('theme') as 'light' | 'dark') || 'light',
  showConnectionsPanel: (localStorage.getItem('showConnectionsPanel') !== 'false'), // Default to true
  expandedValueItems: new Set(),
  
  // Pub/Sub initial state
  pubsubStats: null,
  selectedChannels: new Set(),
  channelPattern: '*',
  subscribedChannels: new Map(),
  messages: [],
  maxMessages: 100,
  isWebSocketConnected: false,
  recentMessageIds: new Map(),
  
  setConnections: (connections) => {
    saveConnections(connections);
    set({ connections });
  },
  
  addConnection: (connection) => {
    set((state) => {
      const newConnections = [...state.connections, connection];
      saveConnections(newConnections);
      return { connections: newConnections };
    });
  },
  
  removeConnection: (id) => {
    removeStoredConnection(id);
    removeSubscriptions(id); // Also remove stored subscriptions
    removeConnectionMessages(id); // Remove stored messages
    set((state) => ({
      connections: state.connections.filter((c) => c.id !== id),
      activeConnectionId: state.activeConnectionId === id ? null : state.activeConnectionId,
      subscribedChannels: state.activeConnectionId === id ? new Map() : state.subscribedChannels,
    }));
  },
  
  setActiveConnection: (id) => {
    saveActiveConnection(id);
    set((state) => {
      // Clear subscriptions when switching connections
      if (state.activeConnectionId && state.activeConnectionId !== id) {
        saveSubscriptions(state.activeConnectionId, state.subscribedChannels);
      }
      return { 
        activeConnectionId: id,
        subscribedChannels: new Map(), // Will be loaded by loadSubscribedChannels
        messages: [] // Clear messages when switching connections
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
  
  selectAllKeys: (keys) =>
    set({ selectedKeys: new Set(keys) }),
  
  clearSelection: () => set({ selectedKeys: new Set() }),
  
  toggleTheme: () =>
    set((state) => {
      const newTheme = state.theme === 'light' ? 'dark' : 'light';
      localStorage.setItem('theme', newTheme);
      return { theme: newTheme };
    }),
  
  toggleConnectionsPanel: () =>
    set((state) => {
      const newShowPanel = !state.showConnectionsPanel;
      localStorage.setItem('showConnectionsPanel', newShowPanel.toString());
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
  
  collapseAllValueItems: () =>
    set({ expandedValueItems: new Set() }),
  
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
  
  selectAllChannels: (channels) =>
    set({ selectedChannels: new Set(channels) }),
  
  clearChannelSelection: () => set({ selectedChannels: new Set() }),
  
  setChannelPattern: (pattern) => set({ channelPattern: pattern }),
  
  // Real-time pub/sub actions
  setSubscribedChannels: (channels) => 
    set((state) => {
      if (state.activeConnectionId) {
        saveSubscriptions(state.activeConnectionId, channels);
      }
      return { subscribedChannels: channels };
    }),
  
  addSubscribedChannel: (channel, persistMessages = false) =>
    set((state) => {
      const newChannels = new Map(state.subscribedChannels);
      newChannels.set(channel, persistMessages);
      if (state.activeConnectionId) {
        saveSubscriptions(state.activeConnectionId, newChannels);
      }
      return { subscribedChannels: newChannels };
    }),
  
  removeSubscribedChannel: (channel) =>
    set((state) => {
      const newChannels = new Map(state.subscribedChannels);
      newChannels.delete(channel);
      if (state.activeConnectionId) {
        saveSubscriptions(state.activeConnectionId, newChannels);
        removeChannelMessages(state.activeConnectionId, channel);
      }
      return { subscribedChannels: newChannels };
    }),

  toggleChannelPersistence: (channel) =>
    set((state) => {
      const newChannels = new Map(state.subscribedChannels);
      const currentPersistence = newChannels.get(channel) || false;
      newChannels.set(channel, !currentPersistence);
      
      if (state.activeConnectionId) {
        saveSubscriptions(state.activeConnectionId, newChannels);
        
        // If turning off persistence, remove stored messages
        if (currentPersistence) {
          removeChannelMessages(state.activeConnectionId, channel);
        }
      }
      
      return { subscribedChannels: newChannels };
    }),
  
  clearSubscribedChannels: () => 
    set((state) => {
      if (state.activeConnectionId) {
        saveSubscriptions(state.activeConnectionId, new Map());
      }
      return { subscribedChannels: new Map() };
    }),

  loadSubscribedChannels: (connectionId) =>
    set((state) => {
      const channels = loadSubscriptions(connectionId);
      
      // Load persistent messages for channels with persistence enabled
      const persistentMessages: PubSubMessage[] = [];
      channels.forEach((persistMessages, channel) => {
        if (persistMessages) {
          const channelMessages = loadChannelMessages(connectionId, channel);
          persistentMessages.push(...channelMessages);
        }
      });
      
      // Sort messages by timestamp (newest first)
      persistentMessages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      return { 
        subscribedChannels: channels,
        messages: persistentMessages.slice(0, state.maxMessages)
      };
    }),
  
  addMessage: (message) =>
    set((state) => {
      // Create a unique key for this message for deduplication
      const messageKey = `${message.channel}:${message.timestamp}:${message.message}`;
      const now = Date.now();
      
      // Check if we've seen this message recently (within last 5 seconds)
      const recentTime = state.recentMessageIds.get(messageKey);
      if (recentTime && (now - recentTime) < 5000) {
        console.log('🔄 Skipping duplicate message:', messageKey);
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
      
      // Save message to localStorage if persistence is enabled for this channel
      if (state.activeConnectionId && state.subscribedChannels.get(message.channel)) {
        const channelMessages = newMessages.filter(msg => msg.channel === message.channel);
        saveChannelMessages(state.activeConnectionId, message.channel, channelMessages, state.maxMessages);
      }
      
      return { 
        messages: newMessages,
        recentMessageIds: newRecentIds
      };
    }),
  
  clearMessages: () => set({ messages: [] }),
  
  setMaxMessages: (max) => set({ maxMessages: max }),
  
  setWebSocketConnected: (connected) => set({ isWebSocketConnected: connected }),
}));