import { useEffect } from "react";
import { useStore } from "../store/useStore";
import { wsClient } from "../services/websocket";
import { cleanupOldSubscriptions } from "../utils/subscriptionStorage";

export function useSubscriptionRestore() {
  const { activeConnectionId, subscribedChannels, refreshActiveConnection } =
    useStore();

  useEffect(() => {
    // Cleanup old subscription data on app start
    cleanupOldSubscriptions();

    // Refresh subscriptions for the active connection on app start
    if (activeConnectionId) {
      console.log("🔄 App started - refreshing active connection data");
      refreshActiveConnection();
    }
  }, [activeConnectionId, refreshActiveConnection]);

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
