import { Response, Router } from 'express';
import { z } from 'zod';
import { redisManager } from '../services/redisManager';
import { RedisService } from '../services/redisService';

const router = Router();

// Helper function for consistent error handling
function handleError(
  error: unknown,
  res: Response,
  defaultMessage: string,
): void {
  if (error instanceof Error && error.message.includes('not found')) {
    res.status(404).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: defaultMessage });
}

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
  keys: z
    .array(
      z.object({
        key: z.string(),
        value: z.any(),
        type: z.enum(['string', 'list', 'set', 'hash', 'zset']),
        ttl: z.number().optional(),
      }),
    )
    .min(1),
  options: z
    .object({
      conflictResolution: z.enum(['skip', 'overwrite']).default('skip'),
      batchSize: z.number().min(1).max(1000).default(100),
    })
    .optional()
    .default({}),
});

router.get('/', async (req, res) => {
  const {
    connectionId,
    pattern = '*',
    cursor = '0',
    count = '100',
  } = req.query;

  if (!connectionId || typeof connectionId !== 'string') {
    return res.status(400).json({ error: 'connectionId is required' });
  }

  try {
    const redis = redisManager.getConnection(connectionId);
    const service = new RedisService(redis);
    const result = await service.getAllKeys(
      pattern as string,
      cursor as string,
      parseInt(count as string, 10),
    );
    return res.json(result);
  } catch (error) {
    return handleError(error, res, 'Failed to fetch keys');
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
    return res.json(value);
  } catch (error) {
    return handleError(error, res, 'Failed to fetch value');
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
    return res.json({ message: 'Value updated successfully' });
  } catch (error) {
    return handleError(error, res, 'Failed to update value');
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
    return res.json({ deletedCount });
  } catch (error) {
    return handleError(error, res, 'Failed to delete keys');
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
    return res.json({ message: 'Key renamed successfully' });
  } catch (error) {
    return handleError(error, res, 'Failed to rename key');
  }
});

// Helper function to create initial import results structure
function createImportResults(totalKeys: number) {
  return {
    total: totalKeys,
    successful: 0,
    failed: 0,
    errors: [] as Array<{ key: string; error: string }>,
    results: [] as Array<{
      key: string;
      status: 'success' | 'failed' | 'skipped';
      error?: string;
    }>,
  };
}

// Helper function to handle skipped keys
function handleSkippedKey(results: any, keyName: string) {
  results.results.push({
    key: keyName,
    status: 'skipped',
    error: 'Key already exists and conflict resolution is set to skip',
  });
}

// Helper function to handle successful key import
function handleSuccessfulImport(results: any, keyName: string) {
  results.successful++;
  results.results.push({
    key: keyName,
    status: 'success',
  });
}

// Helper function to handle failed key import
function handleFailedImport(results: any, keyName: string, error: unknown) {
  results.failed++;
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  results.errors.push({
    key: keyName,
    error: errorMessage,
  });
  results.results.push({
    key: keyName,
    status: 'failed',
    error: errorMessage,
  });
}

// Helper function to process a single key import
async function processKeyImport(
  redis: any,
  service: RedisService,
  keyData: any,
  options: any,
  results: any,
) {
  const exists = await redis.exists(keyData.key);

  if (exists && options.conflictResolution === 'skip') {
    handleSkippedKey(results, keyData.key);
    return;
  }

  await service.setValue(keyData.key, keyData.value, keyData.type, keyData.ttl);
  handleSuccessfulImport(results, keyData.key);
}

router.post('/bulk-import', async (req, res) => {
  const result = bulkImportSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.flatten() });
  }

  const { connectionId, keys, options } = result.data;

  try {
    const redis = redisManager.getConnection(connectionId);
    const service = new RedisService(redis);
    const results = createImportResults(keys.length);

    // Process keys in batches
    const batchSize = options.batchSize ?? 100;
    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);

      for (const keyData of batch) {
        try {
          await processKeyImport(redis, service, keyData, options, results);
        } catch (error) {
          handleFailedImport(results, keyData.key, error);
        }
      }
    }

    return res.json(results);
  } catch (error) {
    return handleError(error, res, 'Failed to perform bulk import');
  }
});

export { router as keysRouter };
