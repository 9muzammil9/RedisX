import { Router } from 'express';
import { z } from 'zod';
import { databaseService } from '../services/database';

const router = Router();

// Connection persistence
const connectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  host: z.string(),
  port: z.number(),
  password: z.string().optional(),
  username: z.string().optional(),
  db: z.number().default(0),
  tls: z.boolean().default(false),
});

// Save connection
router.post('/connections', (req, res) => {
  try {
    const connection = connectionSchema.parse(req.body);
    databaseService.saveConnection(connection);
    res.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to save connection';
    res.status(500).json({ error: message });
  }
});

// Get all connections
router.get('/connections', (_req, res) => {
  const connections = databaseService.getConnections();
  res.json(connections);
});

// Delete connection
router.delete('/connections/:id', (req, res) => {
  const { id } = req.params;
  databaseService.deleteConnection(id);
  res.json({ success: true });
});

// Subscription persistence
const subscriptionsSchema = z.object({
  connectionId: z.string(),
  subscriptions: z.record(z.string(), z.boolean()),
});

// Save subscriptions
router.post('/subscriptions', (req, res) => {
  const { connectionId, subscriptions } = subscriptionsSchema.parse(req.body);
  const subscriptionsMap = new Map(Object.entries(subscriptions));
  databaseService.saveSubscriptions(connectionId, subscriptionsMap);
  res.json({ success: true });
});

// Get subscriptions
router.get('/subscriptions/:connectionId', (req, res) => {
  const { connectionId } = req.params;
  const subscriptions = databaseService.getSubscriptions(connectionId);
  const subscriptionsObj = Object.fromEntries(subscriptions);
  res.json(subscriptionsObj);
});

// Delete subscriptions
router.delete('/subscriptions/:connectionId', (req, res) => {
  const { connectionId } = req.params;
  databaseService.removeSubscriptions(connectionId);
  res.json({ success: true });
});

// Message persistence
const messagesSchema = z.object({
  connectionId: z.string(),
  channel: z.string(),
  messages: z.array(
    z.object({
      id: z.string(),
      channel: z.string(),
      message: z.string(),
      timestamp: z.string(),
    }),
  ),
  maxMessages: z.number().optional().default(100),
});

// Save channel messages
router.post('/messages', (req, res) => {
  const { connectionId, channel, messages, maxMessages } = messagesSchema.parse(
    req.body,
  );
  databaseService.saveChannelMessages(
    connectionId,
    channel,
    messages,
    maxMessages,
  );
  res.json({ success: true });
});

// Get channel messages
router.get('/messages/:connectionId/:channel', (req, res) => {
  const { connectionId, channel } = req.params;
  const messages = databaseService.getChannelMessages(
    connectionId,
    decodeURIComponent(channel),
  );
  res.json(messages);
});

// Delete channel messages
router.delete('/messages/:connectionId/:channel', (req, res) => {
  const { connectionId, channel } = req.params;
  databaseService.removeChannelMessages(
    connectionId,
    decodeURIComponent(channel),
  );
  res.json({ success: true });
});

// Delete specific message by ID
router.delete('/messages/:connectionId/:channel/:messageId', (req, res) => {
  const { connectionId, channel, messageId } = req.params;
  databaseService.removeSpecificMessage(
    connectionId,
    decodeURIComponent(channel),
    messageId,
  );
  res.json({ success: true });
});

// Delete all messages for connection
router.delete('/messages/:connectionId', (req, res) => {
  const { connectionId } = req.params;
  databaseService.removeConnectionMessages(connectionId);
  res.json({ success: true });
});

// App state persistence
const appStateSchema = z.object({
  key: z.string(),
  value: z.string(),
});

// Save app state
router.post('/app-state', (req, res) => {
  const { key, value } = appStateSchema.parse(req.body);
  databaseService.setAppState(key, value);
  res.json({ success: true });
});

// Get app state
router.get('/app-state/:key', (req, res) => {
  const { key } = req.params;
  const value = databaseService.getAppState(key);
  res.json({ value });
});

// Cleanup endpoint
router.post('/cleanup', (req, res) => {
  try {
    const { maxAge } = req.body;
    databaseService.cleanupOldMessages(maxAge ?? 7);
    res.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cleanup failed';
    res.status(500).json({ error: message });
  }
});

export { router as persistenceRouter };
