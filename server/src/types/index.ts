export interface RedisConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  password?: string;
  db?: number;
  username?: string;
  tls?: boolean;
}

export interface RedisKey {
  key: string;
  type: string;
  ttl: number;
  memoryUsage?: number;
}

export interface RedisValue {
  key: string;
  type: string;
  value: any;
  ttl: number;
}