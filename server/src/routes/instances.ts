import { execSync } from 'child_process';
import { Router } from 'express';
import {
  RedisInstanceConfig,
  redisInstanceManager,
} from '../services/redisInstanceManager';

const router = Router();

// Check if Redis and Docker are installed
router.get('/check', (_req, res) => {
  const redisInstalled = redisInstanceManager.checkRedisInstalled();
  const redisVersion = redisInstanceManager.getRedisVersion();
  const dockerInstalled = redisInstanceManager.checkDockerInstalled();
  const dockerVersion = redisInstanceManager.getDockerVersion();

  return res.json({
    redis: {
      installed: redisInstalled,
      version: redisVersion,
    },
    docker: {
      installed: dockerInstalled,
      version: dockerVersion,
    },
  });
});

// Get all instances
router.get('/', (_req, res) => {
  const instances = redisInstanceManager.getAllInstances();
  return res.json(instances);
});

// Debug endpoint to test auto-detection
router.post('/debug/auto-detect', async (_req, res) => {
  try {
    console.log('[Debug] Manually triggering auto-detection');
    await (redisInstanceManager as any).autoDetectRedisInstances();
    const instances = redisInstanceManager.getAllInstances();
    return res.json({ success: true, instances });
  } catch (error) {
    console.error('[Debug] Auto-detection failed:', error);
    return res.status(500).json({ error: (error as Error).message });
  }
});

// Get instance by ID
router.get('/:id', (req, res) => {
  const instance = redisInstanceManager.getInstance(req.params.id);
  if (!instance) {
    return res.status(404).json({ error: 'Instance not found' });
  }
  return res.json(instance);
});

// Get instance logs
router.get('/:id/logs', (req, res) => {
  const logs = redisInstanceManager.getInstanceLogs(req.params.id);
  return res.json({ logs });
});

// Test instance connectivity
router.get('/:id/test', async (req, res) => {
  try {
    const instance = redisInstanceManager.getInstance(req.params.id);
    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    const isConnectable =
      await redisInstanceManager.testRedisConnection(instance);
    return res.json({
      connectable: isConnectable,
      status: instance.status,
      port: instance.config.port,
      executionMode: instance.config.executionMode,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});

// Helper functions for debug endpoint
function getContainerInfo(containerName: string) {
  try {
    const runningContainers = execSync(
      `docker ps -f name=${containerName} --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"`,
      { encoding: 'utf8' },
    );
    const allContainers = execSync(
      `docker ps -a -f name=${containerName} --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"`,
      { encoding: 'utf8' },
    );
    return { runningContainers, allContainers };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown docker error';
    return { dockerError: errorMessage };
  }
}

function createDebugInfo(instance: any, containerName: string) {
  return {
    containerName,
    instanceStatus: instance.status,
    port: instance.config.port,
    dataDir: instance.dataDir,
    logs: instance.logs.slice(-10), // Last 10 log entries
    ...getContainerInfo(containerName),
  };
}

// Debug Docker instance
router.get('/:id/debug', (req, res) => {
  try {
    const instance = redisInstanceManager.getInstance(req.params.id);
    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    if (instance.config.executionMode !== 'docker') {
      return res.json({
        error: 'Debug endpoint only available for Docker instances',
      });
    }

    const containerName = `redisx-${instance.id}`;
    const debugInfo = createDebugInfo(instance, containerName);

    return res.json(debugInfo);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});

// Create new instance
router.post('/', async (req, res) => {
  try {
    const { name, config } = req.body;

    if (!name || !config?.port) {
      return res.status(400).json({ error: 'Name and port are required' });
    }

    // Check if port is available
    if (!redisInstanceManager.isPortAvailable(config.port)) {
      return res
        .status(400)
        .json({ error: `Port ${config.port} is already in use` });
    }

    const instance = await redisInstanceManager.createInstance(
      name,
      config as RedisInstanceConfig,
    );
    return res.json(instance);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});

// Start instance
router.post('/:id/start', async (req, res) => {
  try {
    await redisInstanceManager.startInstance(req.params.id);
    const instance = redisInstanceManager.getInstance(req.params.id);
    return res.json(instance);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});

// Stop instance
router.post('/:id/stop', async (req, res) => {
  try {
    await redisInstanceManager.stopInstance(req.params.id);
    const instance = redisInstanceManager.getInstance(req.params.id);
    return res.json(instance);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});

// Delete instance
router.delete('/:id', async (req, res) => {
  try {
    await redisInstanceManager.deleteInstance(req.params.id);
    return res.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});

// Remove default Redis instance (for troubleshooting conflicts)
router.delete('/default-redis', (_req, res) => {
  try {
    const removed = redisInstanceManager.removeDefaultRedisInstance();
    return res.json({
      success: true,
      removed,
      message: removed
        ? 'Default Redis instance removed'
        : 'No default Redis instance found',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});

// SSE endpoint for real-time logs
router.get('/:id/logs/stream', (req, res) => {
  const { id } = req.params;
  const instance = redisInstanceManager.getInstance(id);

  if (!instance) {
    return res.status(404).json({ error: 'Instance not found' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  // Send initial logs
  const logs = redisInstanceManager.getInstanceLogs(id);
  res.write(`data: ${JSON.stringify({ type: 'initial', logs })}\n\n`);

  // Listen for new logs
  const logHandler = (data: any) => {
    if (data.id === id) {
      res.write(
        `data: ${JSON.stringify({ type: 'log', log: data.log, error: data.error })}\n\n`,
      );
    }
  };

  const statusHandler = (data: any) => {
    if (data.id === id) {
      res.write(
        `data: ${JSON.stringify({ type: 'status', status: 'stopped' })}\n\n`,
      );
    }
  };

  redisInstanceManager.on('instance-log', logHandler);
  redisInstanceManager.on('instance-stopped', statusHandler);

  // Clean up on client disconnect
  req.on('close', () => {
    redisInstanceManager.off('instance-log', logHandler);
    redisInstanceManager.off('instance-stopped', statusHandler);
  });
});

export default router;
