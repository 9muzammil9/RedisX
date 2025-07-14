export interface ChannelSubscription {
  channel: string;
  persistMessages: boolean;
}

interface SubscriptionData {
  connectionId: string;
  channels: ChannelSubscription[];
  timestamp: number;
}

const STORAGE_KEY = 'redisx-subscriptions';

export function saveSubscriptions(
  connectionId: string,
  channels: Map<string, boolean>,
): void {
  try {
    const existingData = getStoredSubscriptions();

    if (channels.size === 0) {
      // Remove subscription data if no channels
      delete existingData[connectionId];
    } else {
      // Save subscription data with persistence flags
      const channelData: ChannelSubscription[] = Array.from(
        channels.entries(),
      ).map(([channel, persistMessages]) => ({
        channel,
        persistMessages,
      }));

      existingData[connectionId] = {
        connectionId,
        channels: channelData,
        timestamp: Date.now(),
      };
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(existingData));
    console.log(
      `💾 Saved subscriptions for ${connectionId}:`,
      Array.from(channels.keys()),
    );
  } catch (error) {
    console.error('Failed to save subscriptions:', error);
  }
}

// Legacy function for backward compatibility
export function saveSubscriptionsLegacy(
  connectionId: string,
  channels: Set<string>,
): void {
  const channelMap = new Map<string, boolean>();
  channels.forEach((channel) => channelMap.set(channel, false)); // Default to no persistence
  saveSubscriptions(connectionId, channelMap);
}

export function loadSubscriptions(connectionId: string): Map<string, boolean> {
  try {
    const data = getStoredSubscriptions();
    const subscription = data[connectionId];

    if (subscription) {
      // Check if data is not too old (24 hours)
      const isStale = Date.now() - subscription.timestamp > 24 * 60 * 60 * 1000;

      if (!isStale) {
        const channelMap = new Map<string, boolean>();

        // Handle both old and new data formats
        if (Array.isArray(subscription.channels)) {
          if (
            subscription.channels.length > 0 &&
            typeof subscription.channels[0] === 'string'
          ) {
            // Legacy format: array of strings
            (subscription.channels as unknown as string[]).forEach((channel) =>
              channelMap.set(channel, false),
            );
          } else {
            // New format: array of ChannelSubscription objects
            subscription.channels.forEach((sub) =>
              channelMap.set(sub.channel, sub.persistMessages),
            );
          }
        }

        console.log(
          `📥 Loaded subscriptions for ${connectionId}:`,
          Array.from(channelMap.keys()),
        );
        return channelMap;
      } else {
        // Remove stale data
        console.log(`🗑️ Removing stale subscription data for ${connectionId}`);
        removeSubscriptions(connectionId);
      }
    }

    return new Map();
  } catch (error) {
    console.error('Failed to load subscriptions:', error);
    return new Map();
  }
}

// Legacy function for backward compatibility
export function loadSubscriptionsLegacy(connectionId: string): Set<string> {
  const channelMap = loadSubscriptions(connectionId);
  return new Set(channelMap.keys());
}

export function removeSubscriptions(connectionId: string): void {
  try {
    const data = getStoredSubscriptions();
    delete data[connectionId];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    console.log(`🗑️ Removed subscriptions for ${connectionId}`);
  } catch (error) {
    console.error('Failed to remove subscriptions:', error);
  }
}

export function getAllSubscriptions(): Record<string, SubscriptionData> {
  return getStoredSubscriptions();
}

export function clearAllSubscriptions(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log('🧹 Cleared all subscription data');
  } catch (error) {
    console.error('Failed to clear subscriptions:', error);
  }
}

// Clean up old subscription data (older than 7 days)
export function cleanupOldSubscriptions(): void {
  try {
    const data = getStoredSubscriptions();
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days
    let hasChanges = false;

    for (const [connectionId, subscription] of Object.entries(data)) {
      if (subscription.timestamp < cutoff) {
        delete data[connectionId];
        hasChanges = true;
        console.log(`🧹 Cleaned up old subscription data for ${connectionId}`);
      }
    }

    if (hasChanges) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  } catch (error) {
    console.error('Failed to cleanup old subscriptions:', error);
  }
}

function getStoredSubscriptions(): Record<string, SubscriptionData> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.error('Failed to parse stored subscriptions:', error);
    return {};
  }
}
