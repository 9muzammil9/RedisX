import { PubSubMessage } from '../store/useStore';

interface PersistedMessages {
  [connectionId: string]: {
    [channel: string]: {
      messages: PubSubMessage[];
      lastUpdated: number;
      maxMessages: number;
    };
  };
}

const STORAGE_KEY = 'redis-viewer-messages';
const MAX_MESSAGES_PER_CHANNEL = 50; // Limit to prevent storage bloat
const MAX_AGE_HOURS = 24; // Keep messages for 24 hours

export function saveChannelMessages(
  connectionId: string, 
  channel: string, 
  messages: PubSubMessage[], 
  maxMessages: number = MAX_MESSAGES_PER_CHANNEL
): void {
  try {
    const existingData = getStoredMessages();
    
    if (!existingData[connectionId]) {
      existingData[connectionId] = {};
    }
    
    // Keep only the latest messages within the limit
    const limitedMessages = messages.slice(0, Math.min(maxMessages, MAX_MESSAGES_PER_CHANNEL));
    
    existingData[connectionId][channel] = {
      messages: limitedMessages,
      lastUpdated: Date.now(),
      maxMessages
    };
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existingData));
    console.log(`💾 Saved ${limitedMessages.length} messages for ${connectionId}:${channel}`);
  } catch (error) {
    console.error('Failed to save channel messages:', error);
    // If storage is full, try to cleanup and retry
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      cleanupOldMessages();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(existingData));
      } catch (retryError) {
        console.error('Failed to save messages even after cleanup:', retryError);
      }
    }
  }
}

export function loadChannelMessages(connectionId: string, channel: string): PubSubMessage[] {
  try {
    const data = getStoredMessages();
    const channelData = data[connectionId]?.[channel];
    
    if (!channelData) {
      return [];
    }
    
    // Check if messages are not too old
    const ageHours = (Date.now() - channelData.lastUpdated) / (1000 * 60 * 60);
    if (ageHours > MAX_AGE_HOURS) {
      console.log(`🗑️ Removing old messages for ${connectionId}:${channel} (${ageHours.toFixed(1)}h old)`);
      removeChannelMessages(connectionId, channel);
      return [];
    }
    
    console.log(`📥 Loaded ${channelData.messages.length} messages for ${connectionId}:${channel}`);
    return channelData.messages;
  } catch (error) {
    console.error('Failed to load channel messages:', error);
    return [];
  }
}

export function removeChannelMessages(connectionId: string, channel: string): void {
  try {
    const data = getStoredMessages();
    
    if (data[connectionId]?.[channel]) {
      delete data[connectionId][channel];
      
      // Remove connection entry if no channels left
      if (Object.keys(data[connectionId]).length === 0) {
        delete data[connectionId];
      }
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      console.log(`🗑️ Removed messages for ${connectionId}:${channel}`);
    }
  } catch (error) {
    console.error('Failed to remove channel messages:', error);
  }
}

export function removeConnectionMessages(connectionId: string): void {
  try {
    const data = getStoredMessages();
    delete data[connectionId];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    console.log(`🗑️ Removed all messages for connection ${connectionId}`);
  } catch (error) {
    console.error('Failed to remove connection messages:', error);
  }
}

export function getPersistedChannels(connectionId: string): string[] {
  try {
    const data = getStoredMessages();
    return Object.keys(data[connectionId] || {});
  } catch (error) {
    console.error('Failed to get persisted channels:', error);
    return [];
  }
}

export function cleanupOldMessages(): void {
  try {
    const data = getStoredMessages();
    const cutoff = Date.now() - (MAX_AGE_HOURS * 60 * 60 * 1000);
    let hasChanges = false;
    
    for (const [connectionId, connections] of Object.entries(data)) {
      for (const [channel, channelData] of Object.entries(connections)) {
        if (channelData.lastUpdated < cutoff) {
          delete data[connectionId][channel];
          hasChanges = true;
          console.log(`🧹 Cleaned up old messages for ${connectionId}:${channel}`);
        }
      }
      
      // Remove empty connection entries
      if (Object.keys(data[connectionId]).length === 0) {
        delete data[connectionId];
        hasChanges = true;
      }
    }
    
    if (hasChanges) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      console.log('🧹 Message cleanup completed');
    }
  } catch (error) {
    console.error('Failed to cleanup old messages:', error);
  }
}

export function getStorageStats(): { totalConnections: number; totalChannels: number; totalMessages: number; storageSize: string } {
  try {
    const data = getStoredMessages();
    let totalChannels = 0;
    let totalMessages = 0;
    
    for (const connections of Object.values(data)) {
      for (const channelData of Object.values(connections)) {
        totalChannels++;
        totalMessages += channelData.messages.length;
      }
    }
    
    const storageData = localStorage.getItem(STORAGE_KEY) || '';
    const storageSize = `${(storageData.length / 1024).toFixed(1)} KB`;
    
    return {
      totalConnections: Object.keys(data).length,
      totalChannels,
      totalMessages,
      storageSize
    };
  } catch (error) {
    console.error('Failed to get storage stats:', error);
    return { totalConnections: 0, totalChannels: 0, totalMessages: 0, storageSize: '0 KB' };
  }
}

export function clearAllMessages(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log('🧹 Cleared all stored messages');
  } catch (error) {
    console.error('Failed to clear all messages:', error);
  }
}

function getStoredMessages(): PersistedMessages {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.error('Failed to parse stored messages:', error);
    return {};
  }
}