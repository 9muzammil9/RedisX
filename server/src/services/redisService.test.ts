import { RedisService } from './redisService';
import Redis from 'ioredis-mock';

describe('RedisService', () => {
  let redisService: RedisService;
  let redisMock: any;

  beforeEach(() => {
    redisMock = new Redis();
    redisService = new RedisService(redisMock);
  });

  afterEach(async () => {
    await redisMock.quit();
  });

  describe('setValue', () => {
    it('should stringify objects in lists', async () => {
      const key = 'test-list';
      const value = [
        'string value',
        { name: 'John', age: 30 },
        { nested: { data: 'value' } },
        123,
        true
      ];

      await redisService.setValue(key, value, 'list');
      const result = await redisMock.lrange(key, 0, -1);

      expect(result[0]).toBe('string value');
      expect(result[1]).toBe('{"name":"John","age":30}');
      expect(result[2]).toBe('{"nested":{"data":"value"}}');
      expect(result[3]).toBe('123');
      expect(result[4]).toBe('true');
    });

    it('should stringify objects in sets', async () => {
      const key = 'test-set';
      const value = [
        'string value',
        { type: 'object' },
        456
      ];

      await redisService.setValue(key, value, 'set');
      const result = await redisMock.smembers(key);

      expect(result).toContain('string value');
      expect(result).toContain('{"type":"object"}');
      expect(result).toContain('456');
    });

    it('should stringify object values in hashes', async () => {
      const key = 'test-hash';
      const value = {
        field1: 'string value',
        field2: { nested: 'object' },
        field3: [1, 2, 3],
        field4: 789
      };

      await redisService.setValue(key, value, 'hash');
      const result = await redisMock.hgetall(key);

      expect(result.field1).toBe('string value');
      expect(result.field2).toBe('{"nested":"object"}');
      expect(result.field3).toBe('[1,2,3]');
      expect(result.field4).toBe('789');
    });

    it('should stringify objects for string type', async () => {
      const key = 'test-string';
      const value = { message: 'Hello, World!' };

      await redisService.setValue(key, value, 'string');
      const result = await redisMock.get(key);

      expect(result).toBe('{"message":"Hello, World!"}');
    });

    it('should stringify member objects in sorted sets', async () => {
      const key = 'test-zset';
      const value = [
        { score: 1, member: 'string member' },
        { score: 2, member: { type: 'object member' } },
        { score: 3, member: 999 }
      ];

      await redisService.setValue(key, value, 'zset');
      const result = await redisMock.zrange(key, 0, -1, 'WITHSCORES');

      expect(result).toContain('string member');
      expect(result).toContain('{"type":"object member"}');
      expect(result).toContain('999');
    });
  });
});