import { useState, useEffect } from 'react';
import { Hash, Send, BarChart3, Radio, MessageSquare } from 'lucide-react';
import { ChannelList } from './ChannelList';
import { PublishMessage } from './PublishMessage';
import { ChannelSubscriber } from './ChannelSubscriber';
import { MessageHistory } from './MessageHistory';
import { useStore, PubSubMessage } from '../store/useStore';
import { useSubscriptionRestore } from '../hooks/useSubscriptionRestore';
import { wsClient } from '../services/websocket';
import toast from 'react-hot-toast';

type PubSubView = 'channels' | 'publish' | 'stats' | 'subscribe' | 'messages';

// Helper functions for PubSub tab persistence
const savePubSubView = (view: PubSubView) => {
  try {
    localStorage.setItem('redis-viewer-pubsub-view', view);
  } catch (error) {
    console.error('Failed to save pubsub view:', error);
  }
};

const loadPubSubView = (): PubSubView => {
  try {
    const saved = localStorage.getItem('redis-viewer-pubsub-view');
    const validViews: PubSubView[] = ['channels', 'publish', 'stats', 'subscribe', 'messages'];
    return validViews.includes(saved as PubSubView) ? (saved as PubSubView) : 'channels';
  } catch (error) {
    console.error('Failed to load pubsub view:', error);
    return 'channels';
  }
};

export function PubSubPanel() {
  const [activeView, setActiveView] = useState<PubSubView>(loadPubSubView());
  const [selectedChannelForPublish, setSelectedChannelForPublish] = useState<string>('');
  const { 
    activeConnectionId, 
    pubsubStats, 
    subscribedChannels, 
    messages,
    addMessage,
    setWebSocketConnected
  } = useStore();

  // Handle subscription restoration
  useSubscriptionRestore();

  // Set up WebSocket connection and message handling for the entire PubSub panel
  useEffect(() => {
    if (!activeConnectionId) return;

    // Connect WebSocket
    wsClient.connect();

    // Set up event handlers
    const unsubscribeConnect = wsClient.onConnect(() => {
      setWebSocketConnected(true);
      toast.success('WebSocket connected');
    });

    const unsubscribeDisconnect = wsClient.onDisconnect(() => {
      setWebSocketConnected(false);
      toast.error('WebSocket disconnected');
    });

    const unsubscribeMessage = wsClient.onMessage((channel, message, timestamp) => {
      const msg: PubSubMessage = {
        id: `${timestamp}-${Math.random()}`,
        channel,
        message,
        timestamp
      };
      addMessage(msg);
    });

    const unsubscribeError = wsClient.onError((error) => {
      toast.error(`WebSocket error: ${error.message}`);
    });

    return () => {
      unsubscribeConnect();
      unsubscribeDisconnect();
      unsubscribeMessage();
      unsubscribeError();
    };
  }, [activeConnectionId, setWebSocketConnected, addMessage]);

  if (!activeConnectionId) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Hash className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No active connection</p>
          <p className="text-sm">Select a Redis connection to monitor pub/sub</p>
        </div>
      </div>
    );
  }

  const handleChannelSelect = (channel: string) => {
    setSelectedChannelForPublish(channel);
  };

  const handleMessageSent = () => {
    // Optionally switch back to channels view or refresh data
    handleViewChange('channels');
  };

  const handleViewChange = (view: PubSubView) => {
    setActiveView(view);
    savePubSubView(view);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Tab Navigation */}
      <div className="border-b border-border">
        <div className="flex">
          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeView === 'channels'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => handleViewChange('channels')}
          >
            <Hash className="w-4 h-4 inline mr-2" />
            Channels
            {pubsubStats && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-muted rounded-full">
                {pubsubStats.totalChannels}
              </span>
            )}
          </button>
          
          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeView === 'publish'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => handleViewChange('publish')}
          >
            <Send className="w-4 h-4 inline mr-2" />
            Publish
          </button>

          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeView === 'stats'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => handleViewChange('stats')}
          >
            <BarChart3 className="w-4 h-4 inline mr-2" />
            Stats
          </button>

          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeView === 'subscribe'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => handleViewChange('subscribe')}
          >
            <Radio className="w-4 h-4 inline mr-2" />
            Subscribe
            {subscribedChannels.size > 0 && (
              <span className="ml-1 text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">
                {subscribedChannels.size}
              </span>
            )}
          </button>

          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeView === 'messages'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => handleViewChange('messages')}
          >
            <MessageSquare className="w-4 h-4 inline mr-2" />
            Messages
            {messages.length > 0 && (
              <span className="ml-1 text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">
                {messages.length}
              </span>
            )}
            {Array.from(subscribedChannels.values()).some(persist => persist) && (
              <span className="ml-1 text-xs bg-blue-500 text-white px-1.5 py-0.5 rounded-full" title="Some messages are being persisted">
                P
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeView === 'channels' && (
          <ChannelList 
            onChannelSelect={handleChannelSelect}
          />
        )}
        
        {activeView === 'publish' && (
          <div className="p-4">
            <div className="max-w-md">
              <h3 className="font-semibold mb-4">Publish Message</h3>
              <PublishMessage 
                defaultChannel={selectedChannelForPublish}
                onMessageSent={handleMessageSent}
              />
            </div>
          </div>
        )}

        {activeView === 'stats' && (
          <div className="p-4">
            <h3 className="font-semibold mb-4">Pub/Sub Statistics</h3>
            {pubsubStats ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-muted p-4 rounded-lg">
                    <div className="text-2xl font-bold">{pubsubStats.totalChannels}</div>
                    <div className="text-sm text-muted-foreground">Active Channels</div>
                  </div>
                  <div className="bg-muted p-4 rounded-lg">
                    <div className="text-2xl font-bold">
                      {pubsubStats.channels.reduce((sum, ch) => sum + ch.subscribers, 0)}
                    </div>
                    <div className="text-sm text-muted-foreground">Total Subscribers</div>
                  </div>
                </div>

                {pubsubStats.channels.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Channel Details</h4>
                    <div className="space-y-2">
                      {pubsubStats.channels.map((channel) => (
                        <div
                          key={channel.channel}
                          className="flex justify-between items-center p-2 bg-muted rounded"
                        >
                          <span className="font-mono text-sm">{channel.channel}</span>
                          <span className="text-sm text-muted-foreground">
                            {channel.subscribers} subscriber(s)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center text-muted-foreground">
                <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No statistics available</p>
              </div>
            )}
          </div>
        )}

        {activeView === 'subscribe' && <ChannelSubscriber />}
        
        {activeView === 'messages' && <MessageHistory />}
      </div>
    </div>
  );
}