import { Router } from 'express';
import { redisInstanceManager, RedisInstanceConfig } from '../services/redisInstanceManager';

const router = Router();

// Check if Redis is installed
router.get('/check', (req, res) => {
  const isInstalled = redisInstanceManager.checkRedisInstalled();
  const version = redisInstanceManager.getRedisVersion();
  
  res.json({
    installed: isInstalled,
    version
  });
});

// Get all instances
router.get('/', (req, res) => {
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