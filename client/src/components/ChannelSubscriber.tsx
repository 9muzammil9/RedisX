import { useState } from 'react';
import { Radio, Circle, Wifi, WifiOff, Plus, X, Database } from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Switch } from './ui/Switch';
import { useStore } from '../store/useStore';
import { wsClient } from '../services/websocket';
import toast from 'react-hot-toast';

export function ChannelSubscriber() {
  const { 
    activeConnectionId,
    subscribedChannels,
    addSubscribedChannel,
    removeSubscribedChannel,
    toggleChannelPersistence,
    clearSubscribedChannels,
    isWebSocketConnected
  } = useStore();
  
  const [newChannel, setNewChannel] = useState('');
  const [isSubscribing, setIsSubscribing] = useState(false);

  // No longer need WebSocket setup here - moved to PubSubPanel

  const handleSubscribe = async (channels: string[]) => {
    if (!activeConnectionId || channels.length === 0) return;

    console.log('Attempting to subscribe to channels:', channels, 'with connection:', activeConnectionId);
    setIsSubscribing(true);
    try {
      wsClient.subscribe(activeConnectionId, channels);
      channels.forEach(channel => addSubscribedChannel(channel, false)); // Default to no persistence
      toast.success(`Subscribed to ${channels.length} channel(s)`);
    } catch (error) {
      console.error('Subscription error:', error);
      toast.error('Failed to subscribe to channels');
    } finally {
      setIsSubscribing(false);
    }
  };

  const handleUnsubscribe = async (channels: string[]) => {
    if (!activeConnectionId || channels.length === 0) return;

    try {
      wsClient.unsubscribe(activeConnectionId, channels);
      channels.forEach(channel => removeSubscribedChannel(channel));
      toast.success(`Unsubscribed from ${channels.length} channel(s)`);
    } catch (error) {
      toast.error('Failed to unsubscribe from channels');
    }
  };

  const handleUnsubscribeAll = async () => {
    if (!activeConnectionId || subscribedChannels.size === 0) return;

    try {
      wsClient.unsubscribeAll(activeConnectionId);
      clearSubscribedChannels();
      toast.success('Unsubscribed from all channels');
    } catch (error) {
      toast.error('Failed to unsubscribe from all channels');
    }
  };

  const handleAddChannel = () => {
    if (!newChannel.trim()) return;
    
    const channelName = newChannel.trim();
    if (subscribedChannels.has(channelName)) {
      toast.error('Already subscribed to this channel');
      return;
    }

    handleSubscribe([channelName]);
    setNewChannel('');
  };

  if (!activeConnectionId) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <WifiOff className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No active connection</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <h3 className="font-semibold">Subscriptions</h3>
            {isWebSocketConnected ? (
              <Wifi className="w-4 h-4 text-green-500" />
            ) : (
              <WifiOff className="w-4 h-4 text-red-500" />
            )}
            <span className="text-sm text-muted-foreground">
              ({subscribedChannels.size} active)
            </span>
            {subscribedChannels.size > 0 && (
              <span className="text-xs text-green-600 dark:text-green-400">
                • Restored
              </span>
            )}
            {Array.from(subscribedChannels.values()).some(persist => persist) && (
              <span className="text-xs text-blue-600 dark:text-blue-400">
                <Database className="w-3 h-3 inline mr-1" />
                Persistent
              </span>
            )}
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleUnsubscribeAll}
            disabled={subscribedChannels.size === 0}
          >
            Unsubscribe All
          </Button>
        </div>

        {/* Add new subscription */}
        <div className="flex items-center space-x-2">
          <Input
            placeholder="Enter channel name..."
            value={newChannel}
            onChange={(e) => setNewChannel(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAddChannel()}
            disabled={!isWebSocketConnected || isSubscribing}
          />
          <Button
            onClick={handleAddChannel}
            disabled={!isWebSocketConnected || isSubscribing || !newChannel.trim()}
          >
            <Plus className="w-4 h-4 mr-2" />
            Subscribe
          </Button>
        </div>
      </div>

      {/* Subscribed channels list */}
      <div className="flex-1 overflow-auto p-4">
        {subscribedChannels.size === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <Circle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No active subscriptions</p>
            <p className="text-sm mt-1">Subscribe to channels to receive real-time messages</p>
          </div>
        ) : (
          <div className="space-y-2">
            {Array.from(subscribedChannels.entries()).sort().map(([channel, persistMessages]) => (
              <div
                key={channel}
                className="flex items-center justify-between p-3 bg-muted rounded-lg hover:bg-muted/80 transition-colors"
              >
                <div className="flex items-center space-x-2 flex-1">
                  <Radio className="w-4 h-4 text-green-500" />
                  <span className="font-mono text-sm flex-1">{channel}</span>
                  {persistMessages && (
                    <Database className="w-4 h-4 text-blue-500" title="Messages are being persisted" />
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <div className="flex items-center space-x-1">
                    <span className="text-xs text-muted-foreground">Persist:</span>
                    <Switch
                      checked={persistMessages}
                      onCheckedChange={() => toggleChannelPersistence(channel)}
                      size="sm"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleUnsubscribe([channel])}
                    className="h-8 w-8 p-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}