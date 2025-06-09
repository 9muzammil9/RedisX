import axios from 'axios';
import { RedisConnection, RedisValue, KeysResponse } from '../types';

const api = axios.create({
  baseURL: '/api',
});

export const connectionsApi = {
  create: (connection: Omit<RedisConnection, 'id'>) => 
    api.post<RedisConnection>('/connections', connection),
  
  getAll: () => 
    api.get<RedisConnection[]>('/connections'),
  
  delete: (id: string) => 
    api.delete(`/connections/${id}`),
  
  getInfo: (id: string) => 
    api.get<{ info: string }>(`/connections/${id}/info`),
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
  
  setValue: (connectionId: string, key: string, value: any, type: string, ttl?: number) =>
    api.put('/keys/value', { connectionId, key, value, type, ttl }),
  
  deleteKeys: (connectionId: string, keys: string[]) =>
    api.delete<{ deletedCount: number }>('/keys', {
      data: { connectionId, keys },
    }),
  
  renameKey: (connectionId: string, oldKey: string, newKey: string) =>
    api.put('/keys/rename', { connectionId, oldKey, newKey }),
  
  bulkImport: (connectionId: string, keys: Array<{
    key: string;
    value: any;
    type: string;
    ttl?: number;
  }>, options?: {
    conflictResolution?: 'skip' | 'overwrite';
    batchSize?: number;
  }) =>
    api.post<{
      total: number;
      successful: number;
      failed: number;
      errors: Array<{ key: string; error: string }>;
      results: Array<{ key: string; status: 'success' | 'failed' | 'skipped'; error?: string }>;
    }>('/keys/bulk-import', { connectionId, keys, options }),
};