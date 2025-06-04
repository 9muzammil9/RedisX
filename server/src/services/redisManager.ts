import Redis from 'ioredis';
import { RedisConnection } from '../types';

class RedisManager {
  private connections: Map<string, Redis> = new Map();

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
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    await redis.ping();
    this.connections.set(id, redis);
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
    }
  }

  async disconnectAll(): Promise<void> {
    for (const [id, connection] of this.connections) {
      await connection.quit();
      this.connections.delete(id);
    }
  }

  getAllConnections(): Map<string, Redis> {
    return this.connections;
  }
}

export const redisManager = new RedisManager();