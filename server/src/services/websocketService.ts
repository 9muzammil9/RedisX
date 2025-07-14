import { WebSocket, WebSocketServer } from 'ws';
import { pubsubService } from './pubsubService';

interface WSClient {
  id: string;
  ws: WebSocket;
  connectionId: string;
  subscriptions: Set<string>;
}

interface WSMessage {
  type: 'subscribe' | 'unsubscribe' | 'unsubscribeAll' | 'ping';
  connectionId: string;
  channel?: string;
  channels?: string[];
}

interface WSResponse {
  type: 'subscribed' | 'unsubscribed' | 'message' | 'error' | 'pong';
  channel?: string;
  channels?: string[];
  message?: string;
  data?: any;
  error?: string;
}

const clients = new Map<string, WSClient>();

export function initializeWebSocketServer(wss: WebSocketServer) {
  console.log('Initializing WebSocket server...');

  wss.on('connection', (ws: WebSocket) => {
    const clientId = generateClientId();
    console.log(`WebSocket client connected: ${clientId}`);

    ws.on('message', async (data: Buffer) => {
      try {
        const message: WSMessage = JSON.parse(data.toString());
        console.log(`Received message from ${clientId}:`, message);

        switch (message.type) {
          case 'subscribe':
            await handleSubscribe(clientId, ws, message);
            break;
          case 'unsubscribe':
            await handleUnsubscribe(clientId, message);
            break;
          case 'unsubscribeAll':
            await handleUnsubscribeAll(clientId);
            break;
          case 'ping':
            ws.send(JSON.stringify({ type: 'pong' } as WSResponse));
            break;
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
        const response: WSResponse = {
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        };
        ws.send(JSON.stringify(response));
      }
    });

    ws.on('close', () => {
      console.log(`WebSocket client disconnected: ${clientId}`);
      handleClientDisconnect(clientId);
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for client ${clientId}:`, error);
      handleClientDisconnect(clientId);
    });
  });
}

async function handleSubscribe(
  clientId: string,
  ws: WebSocket,
  message: WSMessage,
) {
  const { connectionId, channel, channels } = message;
  console.log(`🔔 Handling subscription for client ${clientId}:`, message);

  if (!connectionId) {
    throw new Error('Connection ID is required');
  }

  // Initialize client if not exists
  if (!clients.has(clientId)) {
    clients.set(clientId, {
      id: clientId,
      ws,
      connectionId,
      subscriptions: new Set(),
    });
  }

  const client = clients.get(clientId)!;
  const channelsToSubscribe = channels ?? (channel ? [channel] : []);

  if (channelsToSubscribe.length === 0) {
    throw new Error('At least one channel must be specified');
  }

  // Subscribe to channels
  for (const ch of channelsToSubscribe) {
    // Check if client is already subscribed to this channel
    if (client.subscriptions.has(ch)) {
      console.log(
        `⚠️ Client ${clientId} already subscribed to ${ch}, skipping...`,
      );
      continue;
    }

    console.log(`📡 Subscribing client ${clientId} to channel: ${ch}`);
    await pubsubService.subscribe(connectionId, ch, (channel, message) => {
      console.log(
        `📨 Received message on channel ${channel}: ${message} for client ${clientId}`,
      );
      // Send message to this specific client
      const response: WSResponse = {
        type: 'message',
        channel,
        message,
        data: {
          timestamp: new Date().toISOString(),
        },
      };

      if (client.ws.readyState === WebSocket.OPEN) {
        console.log(`📤 Sending message to client ${clientId}:`, response);
        client.ws.send(JSON.stringify(response));
      } else {
        console.warn(`⚠️ Client ${clientId} WebSocket not open`);
      }
    });

    client.subscriptions.add(ch);
    console.log(
      `✅ Client ${clientId} successfully subscribed to channel: ${ch}`,
    );
  }

  // Send confirmation
  const response: WSResponse = {
    type: 'subscribed',
    channels: channelsToSubscribe,
  };
  ws.send(JSON.stringify(response));
}

async function handleUnsubscribe(clientId: string, message: WSMessage) {
  const client = clients.get(clientId);
  if (!client) {
    return;
  }

  const { channel, channels } = message;
  const channelsToUnsubscribe = channels ?? (channel ? [channel] : []);

  for (const ch of channelsToUnsubscribe) {
    await pubsubService.unsubscribe(client.connectionId, ch);
    client.subscriptions.delete(ch);
  }

  // Send confirmation
  const response: WSResponse = {
    type: 'unsubscribed',
    channels: channelsToUnsubscribe,
  };
  client.ws.send(JSON.stringify(response));
}

async function handleUnsubscribeAll(clientId: string) {
  const client = clients.get(clientId);
  if (!client) {
    return;
  }

  const channels = Array.from(client.subscriptions);
  for (const channel of channels) {
    await pubsubService.unsubscribe(client.connectionId, channel);
  }

  client.subscriptions.clear();

  // Send confirmation
  const response: WSResponse = {
    type: 'unsubscribed',
    channels,
  };
  client.ws.send(JSON.stringify(response));
}

async function handleClientDisconnect(clientId: string) {
  const client = clients.get(clientId);
  if (!client) {
    return;
  }

  console.log(
    `🧹 Cleaning up client ${clientId} with ${client.subscriptions.size} subscriptions`,
  );

  // Unsubscribe from all channels
  for (const channel of client.subscriptions) {
    console.log(`🗑️ Unsubscribing client ${clientId} from channel ${channel}`);
    await pubsubService.unsubscribe(client.connectionId, channel);
  }

  clients.delete(clientId);
  console.log(`✅ Client ${clientId} cleanup completed`);
}

function generateClientId(): string {
  return `ws-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}
