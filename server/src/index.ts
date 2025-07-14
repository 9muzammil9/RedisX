import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import 'express-async-errors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { errorHandler } from './middleware/errorHandler';
import { connectionsRouter } from './routes/connections';
import instancesRouter from './routes/instances';
import { keysRouter } from './routes/keys';
import { persistenceRouter } from './routes/persistence';
import { pubsubRouter } from './routes/pubsub';
import settingsRouter from './routes/settings';
import { redisInstanceManager } from './services/redisInstanceManager';
import { initializeWebSocketServer } from './services/websocketService';

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 4000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use('/api/connections', connectionsRouter);
app.use('/api/keys', keysRouter);
app.use('/api/pubsub', pubsubRouter);
app.use('/api/persistence', persistenceRouter);
app.use('/api/instances', instancesRouter);
app.use('/api/settings', settingsRouter);

app.use(errorHandler);

// Create HTTP server
const server = createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server, path: '/ws' });
initializeWebSocketServer(wss);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server available at ws://localhost:${PORT}/ws`);
});

// Graceful shutdown handlers
const gracefulShutdown = async () => {
  console.log('\n🛑 Received shutdown signal...');

  // Shutdown Redis instances
  await redisInstanceManager.gracefulShutdown();

  // Close server
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('❌ Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
