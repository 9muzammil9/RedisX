import Redis from 'ioredis';
import { RedisConnection } from '../types';

class RedisManager {
  private connections: Map<string, Redis> = new Map();
  private connectionConfigs: Map<string, RedisConnection> = new Map();

  async connect(config: RedisConnection): Promise<void> {
    const { id, host, port, password, db, username, tls } = config;
    
    const redis = new Redis({
      host,
      port,
      password,
      db,
      username,
      tls: tls ? {} : undefined,
      retryStrategy: (times) => {
        // Only retry a few times for initial connection
        if (times > 3) {
          return null; // Stop retrying
        }
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      enableOfflineQueue: false,
      lazyConnect: true, // Don't connect immediately
    });

    // Handle connection errors gracefully
    redis.on('error', (error) => {
      console.warn(`Redis connection error for ${id}:`, error.message);
    });

    try {
      await redis.connect();
      await redis.ping();
      this.connections.set(id, redis);
      this.connectionConfigs.set(id, config);
    } catch (error) {
      // Clean up the failed connection
      redis.disconnect();
      throw error;
    }
  }

  getConnection(id: string): Redis {
    const connection = this.connections.get(id);
    if (!connection) {
      throw new Error(`Connection ${id} not found`);
    }
    return connection;
  }

  async disconnect(id: string): Promise<void> {
    const connection = this.connections.get(id);
    if (connection) {
      await connection.quit();
      this.connections.delete(id);
      this.connectionConfigs.delete(id);
    }
  }

  async disconnectAll(): Promise<void> {
    for (const [id, connection] of this.connections) {
      await connection.quit();
      this.connections.delete(id);
      this.connectionConfigs.delete(id);
    }
  }

  getAllConnections(): Map<string, Redis> {
    return this.connections;
  }

  getConnectionDetails(id: string): RedisConnection | undefined {
    return this.connectionConfigs.get(id);
  }
}

export const redisManager = new RedisManager();