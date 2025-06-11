import { Router } from 'express';
import { z } from 'zod';
import { redisManager } from '../services/redisManager';
import { RedisConnection } from '../types';
import { randomUUID } from 'crypto';

const router = Router();

const connectionSchema = z.object({
  id: z.string().optional(), // Allow passing existing ID
  name: z.string().min(1),
  host: z.string().min(1),
  port: z.number().int().positive(),
  password: z.string().optional(),
  db: z.number().int().min(0).optional(),
  username: z.string().optional(),
  tls: z.boolean().optional(),
});

const connections: Map<string, RedisConnection> = new Map();

router.post('/', async (req, res) => {
  const result = connectionSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.flatten() });
  }

  // Use provided ID or generate a new one
  const id = result.data.id || randomUUID();
  const { id: _providedId, ...connectionData } = result.data; // Remove id from data
  const connection: RedisConnection = { id, ...connectionData };

  // Check if connection with this ID already exists
  if (connections.has(id)) {
    console.log(`🔄 Connection ${id} already exists, updating it`);
    // Update existing connection instead of throwing error
    try {
      await redisManager.disconnect(id); // Disconnect old connection first
    } catch (error) {
      // Ignore disconnect errors (connection might already be disconnected)
      console.log(`⚠️ Could not disconnect old connection ${id}:`, error);
    }
  }

  try {
    await redisManager.connect(connection);
    connections.set(id, connection);
    console.log(`✅ Created/restored connection ${id} (${connection.name})`);
    res.json(connection);
  } catch (error) {
    res.status(400).json({ error: 'Failed to connect to Redis server' });
  }
});

router.get('/', (_req, res) => {
  const allConnections = Array.from(connections.values());
  res.json(allConnections);
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    await redisManager.disconnect(id);
    connections.delete(id);
    res.json({ message: 'Connection closed' });
  } catch (error) {
    res.status(404).json({ error: 'Connection not found' });
  }
});

router.get('/:id/exists', (req, res) => {
  const { id } = req.params;
  const exists = connections.has(id);
  res.json({ exists });
});

router.get('/:id/info', async (req, res) => {
  const { id } = req.params;
  
  try {
    const redis = redisManager.getConnection(id);
    const info = await redis.info();
    res.json({ info });
  } catch (error) {
    res.status(404).json({ error: 'Connection not found' });
  }
});

export { router as connectionsRouter };