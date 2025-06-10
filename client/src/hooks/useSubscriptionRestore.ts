import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { wsClient } from '../services/websocket';
import { cleanupOldSubscriptions } from '../utils/subscriptionStorage';

export function useSubscriptionRestore() {
  const { activeConnectionId, loadSubscribedChannels, subscribedChannels } = useStore();
  const hasRestoredRef = useRef<string | null>(null);

  useEffect(() => {
    // Cleanup old subscription data on app start
    cleanupOldSubscriptions();
  }, []);

  useEffect(() => {
    if (!activeConnectionId) {
      hasRestoredRef.current = null;
      return;
    }

    // Only restore once per connection
    if (hasRestoredRef.current === activeConnectionId) {
      return;
    }

    console.log(`🔄 Restoring subscriptions for connection: ${activeConnectionId}`);
    
    // Load subscribed channels from localStorage
    loadSubscribedChannels(activeConnectionId);
    hasRestoredRef.current = activeConnectionId;
    
  }, [activeConnectionId, loadSubscribedChannels]);

  useEffect(() => {
    if (!activeConnectionId || subscribedChannels.size === 0) {
      return;
    }

    // Auto-resubscribe to channels when they're loaded
    const channelsArray = Array.from(subscribedChannels.keys());
    console.log(`🚀 Auto-resubscribing to channels:`, channelsArray);
    
    // Connect WebSocket if not already connected
    if (!wsClient.isConnected()) {
      wsClient.connect();
    }

    // Small delay to ensure WebSocket is connected
    const timer = setTimeout(() => {
      wsClient.subscribe(activeConnectionId, channelsArray);
    }, 500);

    return () => clearTimeout(timer);
    
  }, [activeConnectionId, subscribedChannels]);
}