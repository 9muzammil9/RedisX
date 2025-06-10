import { Redis } from 'ioredis';
import { redisManager } from './redisManager';
import { ChannelInfo, PubSubStats } from '../types';

type MessageHandler = (channel: string, message: string) => void;

interface Subscription {
  connectionId: string;
  channel: string;
  handlers: Set<MessageHandler>;
  subscriber?: Redis;
}

class PubSubService {
  private subscriptions = new Map<string, Subscription>();

  async getChannels(connectionId: string, pattern = '*'): Promise<string[]> {
    const redis = redisManager.getConnection(connectionId);
    if (!redis) throw new Error('Connection not found');
    
    const result = await redis.pubsub('CHANNELS', pattern);
    return result as string[];
  }

  async getChannelStats(connectionId: string, channels?: string[]): Promise<PubSubStats> {
    const redis = redisManager.getConnection(connectionId);
    if (!redis) throw new Error('Connection not found');
    
    const allChannels = channels || await this.getChannels(connectionId);
    
    if (allChannels.length === 0) {
      return {
        totalChannels: 0,
        channels: []
      };
    }

    // Get subscriber count for each channel
    const subscriberCounts = await redis.pubsub('NUMSUB', ...allChannels);
    
    // Parse the flat array response: [channel1, count1, channel2, count2, ...]
    const channelInfos: ChannelInfo[] = [];
    for (let i = 0; i < subscriberCounts.length; i += 2) {
      channelInfos.push({
        channel: subscriberCounts[i] as string,
        subscribers: parseInt(subscriberCounts[i + 1] as string, 10)
      });
    }

    return {
      totalChannels: channelInfos.length,
      channels: channelInfos
    };
  }

  async publishMessage(connectionId: string, channel: string, message: string): Promise<number> {
    const redis = redisManager.getConnection(connectionId);
    if (!redis) throw new Error('Connection not found');
    
    return await redis.publish(channel, message);
  }

  async getPatternStats(connectionId: string, pattern: string): Promise<PubSubStats> {
    const channels = await this.getChannels(connectionId, pattern);
    return await this.getChannelStats(connectionId, channels);
  }

  async subscribe(connectionId: string, channel: string, handler: MessageHandler): Promise<void> {
    const subscriptionKey = `${connectionId}:${channel}`;
    console.log(`🔧 PubSubService: Subscribing to ${subscriptionKey}`);
    
    let subscription = this.subscriptions.get(subscriptionKey);
    
    if (!subscription) {
      console.log(`📡 Creating new Redis subscription for ${subscriptionKey}`);
      // Create new subscriber connection for this channel
      const mainRedis = redisManager.getConnection(connectionId);
      if (!mainRedis) throw new Error('Connection not found');
      
      // Get connection details to create a duplicate for pub/sub
      const connectionDetails = redisManager.getConnectionDetails(connectionId);
      if (!connectionDetails) throw new Error('Connection details not found');
      
      // Create a duplicate connection for subscribing
      const subscriber = new Redis({
        host: connectionDetails.host,
        port: connectionDetails.port,
        password: connectionDetails.password,
        db: connectionDetails.db,
        username: connectionDetails.username,
        tls: connectionDetails.tls ? {} : undefined,
      });
      
      subscription = {
        connectionId,
        channel,
        handlers: new Set(),
        subscriber
      };
      
      // Set up message handler
      subscriber.on('message', (receivedChannel: string, message: string) => {
        console.log(`🎯 PubSubService: Received message on ${receivedChannel}: ${message}`);
        if (receivedChannel === channel && subscription) {
          console.log(`🔄 PubSubService: Calling ${subscription.handlers.size} handlers`);
          subscription.handlers.forEach(h => h(receivedChannel, message));
        }
      });
      
      // Subscribe to the channel
      console.log(`📡 PubSubService: Subscribing Redis client to channel: ${channel}`);
      await subscriber.subscribe(channel);
      console.log(`✅ PubSubService: Redis subscription successful for: ${channel}`);
      
      this.subscriptions.set(subscriptionKey, subscription);
    } else {
      console.log(`🔄 Adding handler to existing subscription for ${subscriptionKey}`);
    }
    
    subscription.handlers.add(handler);
    console.log(`👥 Total handlers for ${subscriptionKey}: ${subscription.handlers.size}`);
  }

  async unsubscribe(connectionId: string, channel: string, handler?: MessageHandler): Promise<void> {
    const subscriptionKey = `${connectionId}:${channel}`;
    const subscription = this.subscriptions.get(subscriptionKey);
    
    if (!subscription) return;
    
    if (handler) {
      subscription.handlers.delete(handler);
    } else {
      subscription.handlers.clear();
    }
    
    // If no more handlers, clean up the subscription
    if (subscription.handlers.size === 0) {
      if (subscription.subscriber) {
        await subscription.subscriber.unsubscribe(channel);
        subscription.subscriber.disconnect();
      }
      this.subscriptions.delete(subscriptionKey);
    }
  }

  async unsubscribeAll(connectionId: string): Promise<void> {
    const keysToDelete: string[] = [];
    
    for (const [key, subscription] of this.subscriptions.entries()) {
      if (subscription.connectionId === connectionId) {
        if (subscription.subscriber) {
          await subscription.subscriber.unsubscribe();
          subscription.subscriber.disconnect();
        }
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.subscriptions.delete(key));
  }
}

export const pubsubService = new PubSubService();