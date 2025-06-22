import { Redis } from 'ioredis';
import { RedisKey, RedisValue } from '../types';

export class RedisService {
  constructor(readonly redis: Redis) { }

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
      case 'zset': {
        const zsetData = await this.redis.zrange(key, 0, -1, 'WITHSCORES');
        // Convert flat array [member1, score1, member2, score2] to [{member, score}, ...]
        value = [];
        for (let i = 0; i < zsetData.length; i += 2) {
          value.push({
            member: zsetData[i],
            score: parseFloat(zsetData[i + 1])
          });
        }
        break;
      }
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

  private async setStringValue(key: string, value: any): Promise<void> {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    await this.redis.set(key, stringValue);
  }

  private async setListValue(key: string, value: any): Promise<void> {
    await this.redis.del(key);
    if (Array.isArray(value) && value.length > 0) {
      const stringValues = value.map(item =>
        typeof item === 'string' ? item : JSON.stringify(item)
      );
      await this.redis.rpush(key, ...stringValues);
    }
  }

  private async setSetValue(key: string, value: any): Promise<void> {
    await this.redis.del(key);
    if (Array.isArray(value) && value.length > 0) {
      const stringValues = value.map(item =>
        typeof item === 'string' ? item : JSON.stringify(item)
      );
      await this.redis.sadd(key, ...stringValues);
    }
  }

  private async setHashValue(key: string, value: any): Promise<void> {
    await this.redis.del(key);
    if (typeof value === 'object' && Object.keys(value).length > 0) {
      const stringifiedValue: Record<string, string> = {};
      for (const [k, v] of Object.entries(value)) {
        stringifiedValue[k] = typeof v === 'string' ? v : JSON.stringify(v);
      }
      await this.redis.hmset(key, stringifiedValue);
    }
  }

  private async setZsetValue(key: string, value: any): Promise<void> {
    await this.redis.del(key);
    if (Array.isArray(value) && value.length > 0) {
      const flatArgs: (string | number)[] = [];
      for (const item of value) {
        if (typeof item === 'object' && 'score' in item && 'member' in item) {
          const memberString = typeof item.member === 'string' ? item.member : JSON.stringify(item.member);
          flatArgs.push(item.score, memberString);
        }
      }
      if (flatArgs.length > 0) {
        await this.redis.zadd(key, ...flatArgs);
      }
    }
  }

  async setValue(key: string, value: any, type: string, ttl?: number): Promise<void> {
    switch (type) {
      case 'string':
        await this.setStringValue(key, value);
        break;
      case 'list':
        await this.setListValue(key, value);
        break;
      case 'set':
        await this.setSetValue(key, value);
        break;
      case 'hash':
        await this.setHashValue(key, value);
        break;
      case 'zset':
        await this.setZsetValue(key, value);
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