import { Router } from 'express';
import { z } from 'zod';
import { pubsubService } from '../services/pubsubService';

const router = Router();

const getChannelsSchema = z.object({
  connectionId: z.string(),
  pattern: z.string().optional().default('*'),
});

const getStatsSchema = z.object({
  connectionId: z.string(),
  channels: z.array(z.string()).optional(),
  pattern: z.string().optional(),
});

const publishMessageSchema = z.object({
  connectionId: z.string(),
  channel: z.string().min(1, 'Channel name is required'),
  message: z.string(),
});

// GET /api/pubsub/channels - Get active channels
router.get('/channels', async (req, res) => {
  const { connectionId, pattern } = getChannelsSchema.parse(req.query);
  
  try {
    const channels = await pubsubService.getChannels(connectionId, pattern);
    res.json({ channels });
  } catch (error) {
    if (error instanceof Error && error.message === 'Connection not found') {
      return res.status(404).json({ error: 'Connection not found' });
    }
    throw error;
  }
});

// GET /api/pubsub/stats - Get channel statistics
router.get('/stats', async (req, res) => {
  const { connectionId, channels, pattern } = getStatsSchema.parse(req.query);
  
  try {
    let stats;
    if (pattern) {
      stats = await pubsubService.getPatternStats(connectionId, pattern);
    } else {
      stats = await pubsubService.getChannelStats(connectionId, channels);
    }
    
    res.json(stats);
  } catch (error) {
    if (error instanceof Error && error.message === 'Connection not found') {
      return res.status(404).json({ error: 'Connection not found' });
    }
    throw error;
  }
});

// POST /api/pubsub/publish - Publish a message to a channel
router.post('/publish', async (req, res) => {
  const { connectionId, channel, message } = publishMessageSchema.parse(req.body);
  
  try {
    const subscriberCount = await pubsubService.publishMessage(connectionId, channel, message);
    
    res.json({ 
      success: true, 
      subscriberCount,
      message: `Message published to ${subscriberCount} subscriber(s)`
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Connection not found') {
      return res.status(404).json({ error: 'Connection not found' });
    }
    throw error;
  }
});

export { router as pubsubRouter };