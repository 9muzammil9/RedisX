import { Router } from 'express';
import { settingsService } from '../services/settingsService';
import { redisInstanceManager } from '../services/redisInstanceManager';
import Redis, { Redis as RedisType } from 'ioredis';

const router = Router();

// Get default Redis settings
router.get('/default-redis', (_req, res) => {
  try {
    const settings = settingsService.getDefaultRedisSettings();
    res.json(settings);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// Update default Redis settings
router.put('/default-redis', async (req, res): Promise<void> => {
  try {
    const { host, port, password, enabled } = req.body;
    
    const updatedSettings = settingsService.updateDefaultRedisSettings({
      host: host ?? 'localhost',
      port: port ?? 6379,
      password: password ?? undefined,
      enabled: enabled !== false // default to true
    });
    
    // Refresh the default Redis instance with new settings
    await redisInstanceManager.refreshDefaultRedisInstance();
    
    res.json(updatedSettings);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// Helper functions for Redis connection testing
function createRedisConfig(host?: string, port?: number, password?: string) {
  const config = {
    host: host ?? 'localhost',
    port: port ?? 6379,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    lazyConnect: true,
    ...(password && { password })
  };
  return config;
}

function extractRedisVersion(info: string): string {
  const lines = info.split('\n');
  const versionLine = lines.find(line => line.startsWith('redis_version:'));
  return versionLine ? versionLine.split(':')[1].trim() : 'Unknown';
}

function getErrorResponse(error: Error) {
  if (error.message?.includes('NOAUTH')) {
    return {
      success: false,
      message: 'Authentication required. Please provide a password.'
    };
  }
  if (error.message?.includes('invalid password')) {
    return {
      success: false,
      message: 'Invalid password provided.'
    };
  }
  return {
    success: false,
    message: `Connection failed: ${error.message}`
  };
}

// Test default Redis connection with provided settings
router.post('/default-redis/test', async (req, res): Promise<void> => {
  let testClient: RedisType | null = null;
  
  try {
    const { host, port, password } = req.body;
    const clientConfig = createRedisConfig(host, port, password);
    
    // Create Redis client instance (synchronous constructor)
    testClient = new Redis(clientConfig);

    try {
      await testClient.ping();
      const info = await testClient.info('server');
      const version = extractRedisVersion(info);
      
      testClient.disconnect();
      
      res.json({ 
        success: true, 
        message: 'Connection successful',
        version
      });
    } catch (error) {
      if (testClient) {
        testClient.disconnect();
      }
      const errorResponse = getErrorResponse(error as Error);
      res.json(errorResponse);
    }
  } catch (error) {
    if (testClient) {
      testClient.disconnect();
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

export default router;