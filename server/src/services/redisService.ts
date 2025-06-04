import { Redis } from 'ioredis';
import { RedisKey, RedisValue } from '../types';

export class RedisService {
  constructor(private redis: Redis) {}

  async getAllKeys(pattern = '*', cursor = '0', count = 100): Promise<{
    keys: RedisKey[];
    nextCursor: string;
  }> {
    const [nextCursor, foundKeys] = await this.redis.scan(
      cursor,
      'MATCH',
      pattern,
      'COUNT',
      count
    );

    const keys: RedisKey[] = await Promise.all(
      foundKeys.map(async (key) => {
        const [type, ttl] = await Promise.all([
          this.redis.type(key),
          this.redis.ttl(key),
        ]);

        return {
          key,
          type,
          ttl,
        };
      })
    );

    return { keys, nextCursor };
  }

  async getValue(key: string): Promise<RedisValue> {
    const [type, ttl] = await Promise.all([
      this.redis.type(key),
      this.redis.ttl(key),
    ]);

    let value: any;

    switch (type) {
      case 'string':
        value = await this.redis.get(key);
        break;
      case 'list':
        value = await this.redis.lrange(key, 0, -1);
        break;
      case 'set':
        value = await this.redis.smembers(key);
        break;
      case 'zset':
        value = await this.redis.zrange(key, 0, -1, 'WITHSCORES');
        break;
      case 'hash':
        value = await this.redis.hgetall(key);
        break;
      case 'stream':
        value = await this.redis.xrange(key, '-', '+');
        break;
      default:
        throw new Error(`Unsupported type: ${type}`);
    }

    return { key, type, value, ttl };
  }

  async setValue(key: string, value: any, type: string, ttl?: number): Promise<void> {
    switch (type) {
      case 'string':
        await this.redis.set(key, value);
        break;
      case 'list':
        await this.redis.del(key);
        if (Array.isArray(value) && value.length > 0) {
          await this.redis.rpush(key, ...value);
        }
        break;
      case 'set':
        await this.redis.del(key);
        if (Array.isArray(value) && value.length > 0) {
          await this.redis.sadd(key, ...value);
        }
        break;
      case 'hash':
        await this.redis.del(key);
        if (typeof value === 'object' && Object.keys(value).length > 0) {
          await this.redis.hmset(key, value);
        }
        break;
      default:
        throw new Error(`Cannot set value for type: ${type}`);
    }

    if (ttl && ttl > 0) {
      await this.redis.expire(key, ttl);
    }
  }

  async deleteKeys(keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    return await this.redis.del(...keys);
  }

  async renameKey(oldKey: string, newKey: string): Promise<void> {
    await this.redis.rename(oldKey, newKey);
  }

  async setTTL(key: string, ttl: number): Promise<void> {
    if (ttl > 0) {
      await this.redis.expire(key, ttl);
    } else {
      await this.redis.persist(key);
    }
  }

  async getInfo(): Promise<string> {
    return await this.redis.info();
  }

  async flushDb(): Promise<void> {
    await this.redis.flushdb();
  }
}