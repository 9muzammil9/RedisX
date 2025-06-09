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

const bulkImportSchema = z.object({
  connectionId: z.string(),
  keys: z.array(z.object({
    key: z.string(),
    value: z.any(),
    type: z.enum(['string', 'list', 'set', 'hash', 'zset']),
    ttl: z.number().optional(),
  })).min(1),
  options: z.object({
    conflictResolution: z.enum(['skip', 'overwrite']).default('skip'),
    batchSize: z.number().min(1).max(1000).default(100),
  }).optional().default({}),
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

router.post('/bulk-import', async (req, res) => {
  const result = bulkImportSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.flatten() });
  }

  const { connectionId, keys, options } = result.data;

  try {
    const redis = redisManager.getConnection(connectionId);
    const service = new RedisService(redis);
    
    const results = {
      total: keys.length,
      successful: 0,
      failed: 0,
      errors: [] as Array<{ key: string; error: string }>,
      results: [] as Array<{ key: string; status: 'success' | 'failed' | 'skipped'; error?: string }>,
    };

    // Process keys in batches
    const batchSize = options.batchSize || 100;
    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);
      
      for (const keyData of batch) {
        try {
          // Check if key exists for conflict resolution
          const exists = await redis.exists(keyData.key);
          
          if (exists && options.conflictResolution === 'skip') {
            results.results.push({
              key: keyData.key,
              status: 'skipped',
              error: 'Key already exists and conflict resolution is set to skip'
            });
            continue;
          }

          // Set the value
          await service.setValue(keyData.key, keyData.value, keyData.type, keyData.ttl);
          
          results.successful++;
          results.results.push({
            key: keyData.key,
            status: 'success'
          });
        } catch (error) {
          results.failed++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          results.errors.push({
            key: keyData.key,
            error: errorMessage
          });
          results.results.push({
            key: keyData.key,
            status: 'failed',
            error: errorMessage
          });
        }
      }
    }

    res.json(results);
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to perform bulk import' });
    }
  }
});

export { router as keysRouter };