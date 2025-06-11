import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import 'express-async-errors';
import { connectionsRouter } from './routes/connections';
import { keysRouter } from './routes/keys';
import { pubsubRouter } from './routes/pubsub';
import { persistenceRouter } from './routes/persistence';
import { errorHandler } from './middleware/errorHandler';
import { initializeWebSocketServer } from './services/websocketService';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.use('/api/connections', connectionsRouter);
app.use('/api/keys', keysRouter);
app.use('/api/pubsub', pubsubRouter);
app.use('/api/persistence', persistenceRouter);

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