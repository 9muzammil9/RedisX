import { Router } from 'express';
import { redisInstanceManager, RedisInstanceConfig } from '../services/redisInstanceManager';

const router = Router();

// Check if Redis and Docker are installed
router.get('/check', (_req, res) => {
  const redisInstalled = redisInstanceManager.checkRedisInstalled();
  const redisVersion = redisInstanceManager.getRedisVersion();
  const dockerInstalled = redisInstanceManager.checkDockerInstalled();
  const dockerVersion = redisInstanceManager.getDockerVersion();
  
  res.json({
    redis: {
      installed: redisInstalled,
      version: redisVersion
    },
    docker: {
      installed: dockerInstalled,
      version: dockerVersion
    }
  });
});

// Get all instances
router.get('/', (_req, res) => {
  const instances = redisInstanceManager.getAllInstances();
  res.json(instances);
});

// Get instance by ID
router.get('/:id', (req, res) => {
  const instance = redisInstanceManager.getInstance(req.params.id);
  if (!instance) {
    return res.status(404).json({ error: 'Instance not found' });
  }
  res.json(instance);
});

// Get instance logs
router.get('/:id/logs', (req, res) => {
  const logs = redisInstanceManager.getInstanceLogs(req.params.id);
  res.json({ logs });
});

// Test instance connectivity
router.get('/:id/test', async (req, res) => {
  try {
    const instance = redisInstanceManager.getInstance(req.params.id);
    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    const isConnectable = await redisInstanceManager.testRedisConnection(instance);
    res.json({ 
      connectable: isConnectable,
      status: instance.status,
      port: instance.config.port,
      executionMode: instance.config.executionMode 
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Debug Docker instance
router.get('/:id/debug', (req, res) => {
  try {
    const instance = redisInstanceManager.getInstance(req.params.id);
    if (!instance) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    if (instance.config.executionMode !== 'docker') {
      return res.json({ error: 'Debug endpoint only available for Docker instances' });
    }

    const containerName = `redisx-${instance.id}`;
    const debugInfo: any = {
      containerName,
      instanceStatus: instance.status,
      port: instance.config.port,
      dataDir: instance.dataDir,
      logs: instance.logs.slice(-10) // Last 10 log entries
    };

    // Check container status
    try {
      const { execSync } = require('child_process');
      const runningContainers = execSync(`docker ps -f name=${containerName} --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"`, { encoding: 'utf8' });
      debugInfo.runningContainers = runningContainers;
      
      const allContainers = execSync(`docker ps -a -f name=${containerName} --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"`, { encoding: 'utf8' });
      debugInfo.allContainers = allContainers;
    } catch (error: any) {
      debugInfo.dockerError = error.message;
    }

    res.json(debugInfo);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create new instance
router.post('/', async (req, res) => {
  try {
    const { name, config } = req.body;
    
    if (!name || !config || !config.port) {
      return res.status(400).json({ error: 'Name and port are required' });
    }

    // Check if port is available
    if (!redisInstanceManager.isPortAvailable(config.port)) {
      return res.status(400).json({ error: `Port ${config.port} is already in use` });
    }

    const instance = await redisInstanceManager.createInstance(name, config as RedisInstanceConfig);
    res.json(instance);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Start instance
router.post('/:id/start', async (req, res) => {
  try {
    await redisInstanceManager.startInstance(req.params.id);
    const instance = redisInstanceManager.getInstance(req.params.id);
    res.json(instance);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Stop instance
router.post('/:id/stop', async (req, res) => {
  try {
    await redisInstanceManager.stopInstance(req.params.id);
    const instance = redisInstanceManager.getInstance(req.params.id);
    res.json(instance);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete instance
router.delete('/:id', async (req, res) => {
  try {
    await redisInstanceManager.deleteInstance(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  // Send initial logs
  const logs = redisInstanceManager.getInstanceLogs(id);
  res.write(`data: ${JSON.stringify({ type: 'initial', logs })}\n\n`);

  // Listen for new logs
  const logHandler = (data: any) => {
    if (data.id === id) {
      res.write(`data: ${JSON.stringify({ type: 'log', log: data.log, error: data.error })}\n\n`);
    }
  };

  const statusHandler = (data: any) => {
    if (data.id === id) {
      res.write(`data: ${JSON.stringify({ type: 'status', status: 'stopped' })}\n\n`);
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