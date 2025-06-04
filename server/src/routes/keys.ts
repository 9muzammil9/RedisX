import { Router } from 'express';
import { z } from 'zod';
import { redisManager } from '../services/redisManager';
import { RedisService } from '../services/redisService';

const router = Router();

const getValueSchema = z.object({
  connectionId: z.string(),
  key: z.string(),
});

const setValueSchema = z.object({
  connectionId: z.string(),
  key: z.string(),
  value: z.any(),
  type: z.enum(['string', 'list', 'set', 'hash', 'zset']),
  ttl: z.number().optional(),
});

const deleteKeysSchema = z.object({
  connectionId: z.string(),
  keys: z.array(z.string()).min(1),
});

const renameKeySchema = z.object({
  connectionId: z.string(),
  oldKey: z.string(),
  newKey: z.string(),
});

router.get('/', async (req, res) => {
  const { connectionId, pattern = '*', cursor = '0', count = '100' } = req.query;

  if (!connectionId || typeof connectionId !== 'string') {
    return res.status(400).json({ error: 'connectionId is required' });
  }

  try {
    const redis = redisManager.getConnection(connectionId);
    const service = new RedisService(redis);
    const result = await service.getAllKeys(
      pattern as string,
      cursor as string,
      parseInt(count as string, 10)
    );
    res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to fetch keys' });
    }
  }
});

router.get('/value', async (req, res) => {
  const result = getValueSchema.safeParse(req.query);
  if (!result.success) {
    return res.status(400).json({ error: result.error.flatten() });
  }

  const { connectionId, key } = result.data;

  try {
    const redis = redisManager.getConnection(connectionId);
    const service = new RedisService(redis);
    const value = await service.getValue(key);
    res.json(value);
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to fetch value' });
    }
  }
});

router.put('/value', async (req, res) => {
  const result = setValueSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.flatten() });
  }

  const { connectionId, key, value, type, ttl } = result.data;

  try {
    const redis = redisManager.getConnection(connectionId);
    const service = new RedisService(redis);
    await service.setValue(key, value, type, ttl);
    res.json({ message: 'Value updated successfully' });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to update value' });
    }
  }
});

router.delete('/', async (req, res) => {
  const result = deleteKeysSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.flatten() });
  }

  const { connectionId, keys } = result.data;

  try {
    const redis = redisManager.getConnection(connectionId);
    const service = new RedisService(redis);
    const deletedCount = await service.deleteKeys(keys);
    res.json({ deletedCount });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to delete keys' });
    }
  }
});

router.put('/rename', async (req, res) => {
  const result = renameKeySchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.flatten() });
  }

  const { connectionId, oldKey, newKey } = result.data;

  try {
    const redis = redisManager.getConnection(connectionId);
    const service = new RedisService(redis);
    await service.renameKey(oldKey, newKey);
    res.json({ message: 'Key renamed successfully' });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to rename key' });
    }
  }
});

export { router as keysRouter };