type MessageHandler = (
  channel: string,
  message: string,
  timestamp: string
) => void;
type ErrorHandler = (error: Error) => void;
type ConnectionHandler = () => void;

interface WSMessage {
  type: "subscribe" | "unsubscribe" | "unsubscribeAll" | "ping";
  connectionId: string;
  channel?: string;
  channels?: string[];
}

interface WSResponse {
  type: "subscribed" | "unsubscribed" | "message" | "error" | "pong";
  channel?: string;
  channels?: string[];
  message?: string;
  data?: {
    timestamp: string;
  };
  error?: string;
}

export class WebSocketClient {
  private ws: WebSocket | null = null;
  readonly url: string;
  readonly reconnectInterval = 5000;
  private reconnectTimer?: NodeJS.Timeout;
  readonly pingInterval = 30000;
  private pingTimer?: NodeJS.Timeout;
  readonly messageHandlers = new Set<MessageHandler>();
  readonly errorHandlers = new Set<ErrorHandler>();
  readonly connectHandlers = new Set<ConnectionHandler>();
  readonly disconnectHandlers = new Set<ConnectionHandler>();
  readonly subscribedChannels = new Map<string, Set<string>>(); // connectionId -> Set<channel>
  private isReconnecting = false;

  constructor() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host =
      window.location.hostname === "localhost"
        ? "localhost:4000"
        : window.location.host;
    this.url = `${protocol}//${host}/ws`;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log("🔄 WebSocket already connected, skipping...");
      return;
    }

    if (this.ws?.readyState === WebSocket.CONNECTING) {
      console.log("🔄 WebSocket already connecting, skipping...");
      return;
    }

    console.log("🚀 Creating new WebSocket connection...");
    try {
      // Close any existing connection first
      if (this.ws) {
        this.ws.close();
      }

      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log("WebSocket connected to:", this.url);
        this.isReconnecting = false;
        this.startPing();

        // Resubscribe to all channels after reconnection
        if (this.subscribedChannels.size > 0) {
          console.log("🔄 Resubscribing to channels after reconnection");
          for (const [
            connectionId,
            channels,
          ] of this.subscribedChannels.entries()) {
            if (channels.size > 0) {
              console.log(
                `🚀 Resubscribing to ${channels.size} channels for ${connectionId}`
              );
              this.send({
                type: "subscribe",
                connectionId,
                channels: Array.from(channels),
              });
            }
          }
        }

        this.connectHandlers.forEach((handler) => handler());
      };

      this.ws.onmessage = (event) => {
        try {
          const response: WSResponse = JSON.parse(event.data);
          this.handleMessage(response);
        } catch (error) {
          console.error("Failed to parse WebSocket message:", error);
        }
      };

      this.ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        this.errorHandlers.forEach((handler) =>
          handler(new Error("WebSocket error"))
        );
      };

      this.ws.onclose = () => {
        console.log("WebSocket disconnected");
        this.stopPing();
        this.disconnectHandlers.forEach((handler) => handler());

        if (!this.isReconnecting) {
          this.scheduleReconnect();
        }
      };
    } catch (error) {
      console.error("Failed to create WebSocket:", error);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    this.isReconnecting = true;
    this.reconnectTimer = setTimeout(() => {
      console.log("Attempting to reconnect WebSocket...");
      this.connect();
    }, this.reconnectInterval);
  }

  private startPing(): void {
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: "ping", connectionId: "" });
      }
    }, this.pingInterval);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = undefined;
    }
  }

  private handleMessage(response: WSResponse): void {
    switch (response.type) {
      case "message":
        if (response.channel && response.message && response.data?.timestamp) {
          console.log(
            `🔔 Processing message: ${response.channel} -> ${response.message}`
          );
          this.messageHandlers.forEach((handler) =>
            handler(
              response.channel!,
              response.message!,
              response.data!.timestamp
            )
          );
        } else {
          console.warn("⚠️ Message missing required fields:", response);
        }
        break;
      case "error":
        if (response.error) {
          this.errorHandlers.forEach((handler) =>
            handler(new Error(response.error!))
          );
        }
        break;
      case "subscribed":
        console.log("Subscribed to channels:", response.channels);
        break;
      case "unsubscribed":
        console.log("Unsubscribed from channels:", response.channels);
        break;
    }
  }

  private send(message: WSMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  subscribe(connectionId: string, channels: string[]): void {
    console.log(
      "🚀 Subscribing to channels:",
      channels,
      "for connection:",
      connectionId
    );

    if (!this.subscribedChannels.has(connectionId)) {
      this.subscribedChannels.set(connectionId, new Set());
    }

    const channelSet = this.subscribedChannels.get(connectionId)!;
    channels.forEach((channel) => channelSet.add(channel));

    const message: WSMessage = {
      type: "subscribe",
      connectionId,
      channels,
    };
    console.log("📤 Sending subscription message:", message);
    this.send(message);
  }

  unsubscribe(connectionId: string, channels: string[]): void {
    const channelSet = this.subscribedChannels.get(connectionId);
    if (channelSet) {
      channels.forEach((channel) => channelSet.delete(channel));
      if (channelSet.size === 0) {
        this.subscribedChannels.delete(connectionId);
      }
    }

    this.send({
      type: "unsubscribe",
      connectionId,
      channels,
    });
  }

  unsubscribeAll(connectionId: string): void {
    this.subscribedChannels.delete(connectionId);

    this.send({
      type: "unsubscribeAll",
      connectionId,
    });
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onError(handler: ErrorHandler): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  onConnect(handler: ConnectionHandler): () => void {
    this.connectHandlers.add(handler);
    return () => this.connectHandlers.delete(handler);
  }

  onDisconnect(handler: ConnectionHandler): () => void {
    this.disconnectHandlers.add(handler);
    return () => this.disconnectHandlers.delete(handler);
  }

  disconnect(): void {
    this.isReconnecting = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    this.stopPing();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.subscribedChannels.clear();
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
export const wsClient = new WebSocketClient();
