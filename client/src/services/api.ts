import axios from 'axios';
import {
  KeysResponse,
  PubSubStats,
  PublishResponse,
  RedisConnection,
  RedisValue,
} from '../types';

const api = axios.create({
  baseURL: '/api',
});

export const connectionsApi = {
  create: (connection: Omit<RedisConnection, 'id'> | RedisConnection) =>
    api.post<RedisConnection>('/connections', connection),

  getAll: () => api.get<RedisConnection[]>('/connections'),

  delete: (id: string) => api.delete(`/connections/${id}`),

  getInfo: (id: string) => api.get<{ info: string }>(`/connections/${id}/info`),

  exists: (id: string) => api.get(`/connections/${id}/exists`),
};

export const keysApi = {
  getAll: (connectionId: string, pattern = '*', cursor = '0', count = 100) =>
    api.get<KeysResponse>('/keys', {
      params: { connectionId, pattern, cursor, count },
    }),

  getValue: (connectionId: string, key: string) =>
    api.get<RedisValue>('/keys/value', {
      params: { connectionId, key },
    }),

  setValue: (
    connectionId: string,
    key: string,
    value: any,
    type: string,
    ttl?: number,
  ) => api.put('/keys/value', { connectionId, key, value, type, ttl }),

  deleteKeys: (connectionId: string, keys: string[]) =>
    api.delete<{ deletedCount: number }>('/keys', {
      data: { connectionId, keys },
    }),

  renameKey: (connectionId: string, oldKey: string, newKey: string) =>
    api.put('/keys/rename', { connectionId, oldKey, newKey }),

  bulkImport: (
    connectionId: string,
    keys: Array<{
      key: string;
      value: any;
      type: string;
      ttl?: number;
    }>,
    options?: {
      conflictResolution?: 'skip' | 'overwrite';
      batchSize?: number;
    },
  ) =>
    api.post<{
      total: number;
      successful: number;
      failed: number;
      errors: Array<{ key: string; error: string }>;
      results: Array<{
        key: string;
        status: 'success' | 'failed' | 'skipped';
        error?: string;
      }>;
    }>('/keys/bulk-import', { connectionId, keys, options }),
};

export const pubsubApi = {
  getChannels: (connectionId: string, pattern = '*') =>
    api.get<{ channels: string[] }>('/pubsub/channels', {
      params: { connectionId, pattern },
    }),

  getStats: (connectionId: string, channels?: string[], pattern?: string) =>
    api.get<PubSubStats>('/pubsub/stats', {
      params: { connectionId, channels, pattern },
    }),

  publishMessage: (connectionId: string, channel: string, message: string) =>
    api.post<PublishResponse>('/pubsub/publish', {
      connectionId,
      channel,
      message,
    }),
};

export const instancesApi = {
  checkRedisInstalled: () =>
    api.get<{
      redis: { installed: boolean; version: string | null };
      docker: { installed: boolean; version: string | null };
    }>('/instances/check'),

  getAll: () => api.get<RedisInstance[]>('/instances'),

  getById: (id: string) => api.get<RedisInstance>(`/instances/${id}`),

  getLogs: (id: string) => api.get<{ logs: string[] }>(`/instances/${id}/logs`),

  create: (name: string, config: RedisInstanceConfig) =>
    api.post<RedisInstance>('/instances', { name, config }),

  start: (id: string) => api.post<RedisInstance>(`/instances/${id}/start`),

  stop: (id: string) => api.post<RedisInstance>(`/instances/${id}/stop`),

  delete: (id: string) => api.delete(`/instances/${id}`),

  test: (id: string) =>
    api.get<{
      connectable: boolean;
      status: string;
      port: number;
      executionMode: string;
    }>(`/instances/${id}/test`),

  debug: (id: string) => api.get<any>(`/instances/${id}/debug`),
};

export interface RedisInstanceConfig {
  port: number;
  maxmemory?: string;
  maxmemoryPolicy?: string;
  appendonly?: boolean;
  save?: boolean;
  password?: string;
  bind?: string;
  databases?: number;
  timeout?: number;
  loglevel?: 'debug' | 'verbose' | 'notice' | 'warning';
  executionMode: 'native' | 'docker';
}

export interface RedisInstance {
  id: string;
  name: string;
  config: RedisInstanceConfig;
  status: 'running' | 'stopped' | 'error';
  pid?: number;
  startedAt?: Date;
  logs: string[];
  configPath?: string;
  dataDir?: string;
}
