import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';

export interface ConnectionRecord {
  id: string;
  name: string;
  host: string;
  port: number;
  password?: string;
  username?: string;
  db: number;
  tls: boolean;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionRecord {
  id: string;
  connection_id: string;
  channel: string;
  persist_messages: boolean;
  created_at: string;
}

export interface MessageRecord {
  id: string;
  connection_id: string;
  channel: string;
  message: string;
  timestamp: string;
  created_at: string;
}

export interface AppStateRecord {
  key: string;
  value: string;
  updated_at: string;
}

export interface InstanceRecord {
  id: string;
  name: string;
  config: string; // JSON stringified config
  status: 'running' | 'stopped' | 'error';
  was_running: boolean; // Track if instance was running before shutdown
  created_at: string;
  updated_at: string;
}

class DatabaseService {
  readonly db: Database.Database;
  private initialized = false;

  constructor() {
    // Create data directory if it doesn't exist
    const dataDir = path.join(process.cwd(), 'data');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    const dbPath = path.join(dataDir, 'redisx.db');
    this.db = new Database(dbPath);

    // Enable WAL mode for better performance
    this.db.pragma('journal_mode = WAL');

    this.initializeTables();
  }

  private initializeTables() {
    if (this.initialized) { return; }

    // Connections table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS connections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        password TEXT,
        username TEXT,
        db INTEGER DEFAULT 0,
        tls BOOLEAN DEFAULT FALSE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // Subscriptions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        connection_id TEXT NOT NULL,
        channel TEXT NOT NULL,
        persist_messages BOOLEAN DEFAULT FALSE,
        created_at TEXT NOT NULL,
        FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE,
        UNIQUE(connection_id, channel)
      )
    `);

    // Messages table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        connection_id TEXT NOT NULL,
        channel TEXT NOT NULL,
        message TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
      )
    `);

    // App state table for general settings
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // Redis instances table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS instances (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        config TEXT NOT NULL,
        status TEXT NOT NULL,
        was_running BOOLEAN DEFAULT FALSE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // Create indexes for better performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_subscriptions_connection_id ON subscriptions(connection_id);
      CREATE INDEX IF NOT EXISTS idx_messages_connection_channel ON messages(connection_id, channel);
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
    `);

    this.initialized = true;
    console.log('✅ Database initialized successfully');
  }

  // Connection methods
  saveConnection(
    connection: Omit<ConnectionRecord, 'created_at' | 'updated_at'>,
  ): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO connections 
      (id, name, host, port, password, username, db, tls, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM connections WHERE id = ?), ?), ?)
    `);

    stmt.run(
      connection.id,
      connection.name,
      connection.host,
      connection.port,
      connection.password ?? null,
      connection.username ?? null,
      connection.db,
      connection.tls ? 1 : 0,
      connection.id,
      now,
      now,
    );
  }

  getConnections(): ConnectionRecord[] {
    const stmt = this.db.prepare(
      'SELECT * FROM connections ORDER BY updated_at DESC',
    );
    const rows = stmt.all() as any[];

    return rows.map((row) => ({
      ...row,
      tls: Boolean(row.tls),
    }));
  }

  deleteConnection(id: string): void {
    const stmt = this.db.prepare('DELETE FROM connections WHERE id = ?');
    stmt.run(id);
  }

  // Subscription methods
  saveSubscriptions(
    connectionId: string,
    channels: Map<string, boolean>,
  ): void {
    // Check if connection exists first
    const connectionExists = this.db
      .prepare('SELECT COUNT(*) as count FROM connections WHERE id = ?')
      .get(connectionId) as { count: number };

    if (!connectionExists || connectionExists.count === 0) {
      console.warn(
        `⚠️ Connection ${connectionId} does not exist in database, skipping subscription save`,
      );
      return;
    }

    // Start transaction
    const deleteStmt = this.db.prepare(
      'DELETE FROM subscriptions WHERE connection_id = ?',
    );
    const insertStmt = this.db.prepare(`
      INSERT INTO subscriptions (id, connection_id, channel, persist_messages, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction(() => {
      // Clear existing subscriptions for this connection
      deleteStmt.run(connectionId);

      // Insert new subscriptions
      const now = new Date().toISOString();
      for (const [channel, persistMessages] of channels) {
        const id = `${connectionId}:${channel}`;
        insertStmt.run(id, connectionId, channel, persistMessages ? 1 : 0, now);
      }
    });

    transaction();
  }

  getSubscriptions(connectionId: string): Map<string, boolean> {
    const stmt = this.db.prepare(
      'SELECT channel, persist_messages FROM subscriptions WHERE connection_id = ?',
    );
    const rows = stmt.all(connectionId) as any[];

    const subscriptions = new Map<string, boolean>();
    for (const row of rows) {
      subscriptions.set(row.channel, Boolean(row.persist_messages));
    }

    return subscriptions;
  }

  removeSubscriptions(connectionId: string): void {
    const stmt = this.db.prepare(
      'DELETE FROM subscriptions WHERE connection_id = ?',
    );
    stmt.run(connectionId);
  }

  // Message methods
  saveChannelMessages(
    connectionId: string,
    channel: string,
    messages: any[],
    maxMessages: number = 100,
  ): void {
    // Check if connection exists first
    const connectionExists = this.db
      .prepare('SELECT COUNT(*) as count FROM connections WHERE id = ?')
      .get(connectionId) as { count: number };

    if (!connectionExists || connectionExists.count === 0) {
      console.warn(
        `⚠️ Connection ${connectionId} does not exist in database, skipping message save`,
      );
      return;
    }

    const deleteStmt = this.db.prepare(
      'DELETE FROM messages WHERE connection_id = ? AND channel = ?',
    );
    const insertStmt = this.db.prepare(`
      INSERT INTO messages (id, connection_id, channel, message, timestamp, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction(() => {
      // Clear existing messages for this channel
      deleteStmt.run(connectionId, channel);

      // Insert new messages (limited to maxMessages)
      const now = new Date().toISOString();
      const messagesToSave = messages.slice(0, maxMessages);

      for (const msg of messagesToSave) {
        insertStmt.run(
          msg.id,
          connectionId,
          channel,
          msg.message,
          msg.timestamp,
          now,
        );
      }
    });

    transaction();
  }

  getChannelMessages(connectionId: string, channel: string): any[] {
    const stmt = this.db.prepare(`
      SELECT id, channel, message, timestamp 
      FROM messages 
      WHERE connection_id = ? AND channel = ? 
      ORDER BY timestamp DESC
    `);

    return stmt.all(connectionId, channel) as any[];
  }

  removeSpecificMessage(
    connectionId: string,
    channel: string,
    messageId: string,
  ): void {
    try {
      const stmt = this.db.prepare(
        'DELETE FROM messages WHERE connection_id = ? AND channel = ? AND id = ?',
      );
      const result = stmt.run(connectionId, channel, messageId);

      if (result.changes > 0) {
        console.log(`🗑️ Deleted message ${messageId} from SQLite`);
      }
    } catch (error) {
      console.warn(
        `⚠️ Failed to delete message ${messageId} from SQLite:`,
        error,
      );
    }
  }

  removeChannelMessages(connectionId: string, channel: string): void {
    const stmt = this.db.prepare(
      'DELETE FROM messages WHERE connection_id = ? AND channel = ?',
    );
    stmt.run(connectionId, channel);
  }

  removeConnectionMessages(connectionId: string): void {
    const stmt = this.db.prepare(
      'DELETE FROM messages WHERE connection_id = ?',
    );
    stmt.run(connectionId);
  }

  // App state methods
  setAppState(key: string, value: string): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO app_state (key, value, updated_at)
      VALUES (?, ?, ?)
    `);
    stmt.run(key, value, now);
  }

  getAppState(key: string): string | null {
    const stmt = this.db.prepare('SELECT value FROM app_state WHERE key = ?');
    const row = stmt.get(key) as any;
    return row ? row.value : null;
  }

  // Instance methods
  saveInstance(
    instance: Omit<InstanceRecord, 'created_at' | 'updated_at'>,
  ): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO instances 
      (id, name, config, status, was_running, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM instances WHERE id = ?), ?), ?)
    `);

    stmt.run(
      instance.id,
      instance.name,
      instance.config,
      instance.status,
      instance.was_running ? 1 : 0,
      instance.id,
      now,
      now,
    );
  }

  getInstances(): InstanceRecord[] {
    const stmt = this.db.prepare(
      'SELECT * FROM instances ORDER BY created_at DESC',
    );
    const rows = stmt.all() as any[];

    return rows.map((row) => ({
      ...row,
      was_running: Boolean(row.was_running),
    }));
  }

  getInstance(id: string): InstanceRecord | null {
    const stmt = this.db.prepare('SELECT * FROM instances WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) { return null; }

    return {
      ...row,
      was_running: Boolean(row.was_running),
    };
  }

  updateInstanceStatus(id: string, status: string, wasRunning?: boolean): void {
    const now = new Date().toISOString();
    const updates: string[] = ['status = ?', 'updated_at = ?'];
    const params: any[] = [status, now];

    if (wasRunning !== undefined) {
      updates.push('was_running = ?');
      params.push(wasRunning ? 1 : 0);
    }

    params.push(id);

    const stmt = this.db.prepare(`
      UPDATE instances 
      SET ${updates.join(', ')}
      WHERE id = ?
    `);

    stmt.run(...params);
  }

  deleteInstance(id: string): void {
    const stmt = this.db.prepare('DELETE FROM instances WHERE id = ?');
    stmt.run(id);
  }

  // Cleanup methods
  cleanupOldMessages(maxAge: number = 7): void {
    const cutoffDate = new Date(
      Date.now() - maxAge * 24 * 60 * 60 * 1000,
    ).toISOString();
    const stmt = this.db.prepare('DELETE FROM messages WHERE created_at < ?');
    const result = stmt.run(cutoffDate);

    if (result.changes > 0) {
      console.log(`🧹 Cleaned up ${result.changes} old messages`);
    }
  }

  // Default Redis settings methods
  getDefaultRedisSettings(): any {
    const stmt = this.db.prepare('SELECT value FROM app_state WHERE key = ?');
    const row = stmt.get('default_redis_settings') as any;

    if (!row) { return null; }

    try {
      return JSON.parse(row.value);
    } catch {
      return null;
    }
  }

  saveDefaultRedisSettings(settings: any): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO app_state (key, value, updated_at)
      VALUES (?, ?, ?)
    `);
    stmt.run('default_redis_settings', JSON.stringify(settings), now);
  }

  close(): void {
    this.db.close();
  }
}

export const databaseService = new DatabaseService();
