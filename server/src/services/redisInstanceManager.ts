import { spawn, ChildProcess } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { databaseService } from './database';

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

export class RedisInstanceManager extends EventEmitter {
  private instances: Map<string, {
    instance: RedisInstance;
    process?: ChildProcess;
  }> = new Map();

  private dataDir: string;

  constructor() {
    super();
    this.dataDir = join(process.cwd(), 'redis-instances');
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
    
    // Load instances from database on startup
    this.loadInstancesFromDatabase();
  }

  private async loadInstancesFromDatabase() {
    try {
      const dbInstances = databaseService.getInstances();
      
      for (const dbInstance of dbInstances) {
        const config = JSON.parse(dbInstance.config) as RedisInstanceConfig;
        
        // Reconstruct instance data
        const instance: RedisInstance = {
          id: dbInstance.id,
          name: dbInstance.name,
          config,
          status: 'stopped', // Always start as stopped
          logs: [`[${new Date().toISOString()}] Instance loaded from database`],
          configPath: join(this.dataDir, dbInstance.id, 'redis.conf'),
          dataDir: join(this.dataDir, dbInstance.id)
        };
        
        this.instances.set(dbInstance.id, { instance });
        
        // Auto-start instances that were running before shutdown
        if (dbInstance.was_running) {
          console.log(`🔄 Auto-starting instance ${instance.name} (was running before shutdown)`);
          try {
            await this.startInstance(dbInstance.id);
          } catch (error) {
            console.error(`Failed to auto-start instance ${instance.name}:`, error);
          }
        }
      }
      
      console.log(`✅ Loaded ${dbInstances.length} instances from database`);
    } catch (error) {
      console.error('Failed to load instances from database:', error);
    }
  }

  checkRedisInstalled(): boolean {
    try {
      execSync('redis-server --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  getRedisVersion(): string | null {
    try {
      const output = execSync('redis-server --version', { encoding: 'utf8' });
      const match = output.match(/v=(\d+\.\d+\.\d+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  private generateConfig(instanceId: string, config: RedisInstanceConfig): string {
    const configLines = [
      `# RedisX managed instance: ${instanceId}`,
      `port ${config.port}`,
      `bind ${config.bind || '127.0.0.1'}`,
      `protected-mode yes`,
      `daemonize no`,
      `loglevel ${config.loglevel || 'notice'}`,
      `databases ${config.databases || 16}`,
      `timeout ${config.timeout || 0}`,
    ];

    if (config.password) {
      configLines.push(`requirepass ${config.password}`);
    }

    if (config.maxmemory) {
      configLines.push(`maxmemory ${config.maxmemory}`);
    }

    if (config.maxmemoryPolicy) {
      configLines.push(`maxmemory-policy ${config.maxmemoryPolicy}`);
    }

    if (config.appendonly !== undefined) {
      configLines.push(`appendonly ${config.appendonly ? 'yes' : 'no'}`);
    }

    if (config.save === false) {
      configLines.push('save ""');
    } else {
      // Default save configuration
      configLines.push('save 900 1');
      configLines.push('save 300 10');
      configLines.push('save 60 10000');
    }

    // Set data directory
    const instanceDataDir = join(this.dataDir, instanceId);
    configLines.push(`dir ${instanceDataDir}`);

    return configLines.join('\n');
  }

  async createInstance(name: string, config: RedisInstanceConfig): Promise<RedisInstance> {
    const id = uuidv4();
    const instanceDataDir = join(this.dataDir, id);
    
    // Create instance data directory
    if (!existsSync(instanceDataDir)) {
      mkdirSync(instanceDataDir, { recursive: true });
    }

    // Generate and save config file
    const configContent = this.generateConfig(id, config);
    const configPath = join(instanceDataDir, 'redis.conf');
    writeFileSync(configPath, configContent);

    const instance: RedisInstance = {
      id,
      name,
      config,
      status: 'stopped',
      logs: [],
      configPath,
      dataDir: instanceDataDir
    };

    this.instances.set(id, { instance });
    
    // Save to database
    databaseService.saveInstance({
      id,
      name,
      config: JSON.stringify(config),
      status: 'stopped',
      was_running: false
    });
    
    this.emit('instance-created', instance);
    
    return instance;
  }

  async startInstance(id: string): Promise<void> {
    const instanceData = this.instances.get(id);
    if (!instanceData) {
      throw new Error('Instance not found');
    }

    const { instance } = instanceData;
    if (instance.status === 'running') {
      throw new Error('Instance is already running');
    }

    try {
      const process = spawn('redis-server', [instance.configPath!], {
        cwd: instance.dataDir,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      instance.pid = process.pid;
      instance.status = 'running';
      instance.startedAt = new Date();
      instance.logs = [`[${new Date().toISOString()}] Starting Redis instance on port ${instance.config.port}...`];

      // Handle stdout
      process.stdout?.on('data', (data) => {
        const log = data.toString();
        instance.logs.push(`[${new Date().toISOString()}] ${log}`);
        // Keep only last 1000 logs
        if (instance.logs.length > 1000) {
          instance.logs.shift();
        }
        this.emit('instance-log', { id, log });
      });

      // Handle stderr
      process.stderr?.on('data', (data) => {
        const log = data.toString();
        instance.logs.push(`[${new Date().toISOString()}] [ERROR] ${log}`);
        if (instance.logs.length > 1000) {
          instance.logs.shift();
        }
        this.emit('instance-log', { id, log, error: true });
      });

      // Handle process exit
      process.on('exit', (code) => {
        instance.status = code === 0 ? 'stopped' : 'error';
        instance.pid = undefined;
        instance.logs.push(`[${new Date().toISOString()}] Redis instance exited with code ${code}`);
        // Update database - mark as not running
        databaseService.updateInstanceStatus(id, instance.status, false);
        this.emit('instance-stopped', { id, code });
      });

      // Handle process error
      process.on('error', (error) => {
        instance.status = 'error';
        instance.pid = undefined;
        instance.logs.push(`[${new Date().toISOString()}] [ERROR] ${error.message}`);
        this.emit('instance-error', { id, error });
      });

      instanceData.process = process;
      this.emit('instance-started', instance);
      
      // Update database
      databaseService.updateInstanceStatus(id, 'running', true);

      // Wait a bit to ensure Redis has started
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check if Redis is actually running
      if (instance.status !== 'running') {
        throw new Error('Failed to start Redis instance');
      }
    } catch (error: any) {
      instance.status = 'error';
      instance.logs.push(`[${new Date().toISOString()}] [ERROR] Failed to start: ${error.message}`);
      throw error;
    }
  }

  async stopInstance(id: string): Promise<void> {
    const instanceData = this.instances.get(id);
    if (!instanceData) {
      throw new Error('Instance not found');
    }

    const { instance, process } = instanceData;
    if (instance.status !== 'running' || !process) {
      throw new Error('Instance is not running');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        process.kill('SIGKILL');
        reject(new Error('Instance stop timeout'));
      }, 5000);

      process.once('exit', () => {
        clearTimeout(timeout);
        instance.status = 'stopped';
        instance.pid = undefined;
        instance.logs.push(`[${new Date().toISOString()}] Redis instance stopped`);
        instanceData.process = undefined;
        // Update database
        databaseService.updateInstanceStatus(id, 'stopped', false);
        this.emit('instance-stopped', { id });
        resolve();
      });

      process.kill('SIGTERM');
    });
  }

  async deleteInstance(id: string): Promise<void> {
    const instanceData = this.instances.get(id);
    if (!instanceData) {
      throw new Error('Instance not found');
    }

    // Stop instance if running
    if (instanceData.instance.status === 'running') {
      await this.stopInstance(id);
    }

    // Delete config file
    if (instanceData.instance.configPath && existsSync(instanceData.instance.configPath)) {
      unlinkSync(instanceData.instance.configPath);
    }

    // Note: We don't delete the data directory to preserve data
    // User can manually delete it if needed

    // Delete from database
    databaseService.deleteInstance(id);
    
    this.instances.delete(id);
    this.emit('instance-deleted', { id });
  }

  getInstance(id: string): RedisInstance | undefined {
    return this.instances.get(id)?.instance;
  }

  getAllInstances(): RedisInstance[] {
    return Array.from(this.instances.values()).map(data => data.instance);
  }

  getInstanceLogs(id: string): string[] {
    const instance = this.instances.get(id)?.instance;
    return instance?.logs || [];
  }

  isPortAvailable(port: number): boolean {
    try {
      execSync(`lsof -i:${port}`, { stdio: 'ignore' });
      return false; // Port is in use
    } catch {
      return true; // Port is available
    }
  }

  // Graceful shutdown - mark running instances before server stops
  async gracefulShutdown() {
    console.log('🛑 Shutting down Redis instances...');
    
    for (const [id, data] of this.instances) {
      if (data.instance.status === 'running') {
        console.log(`Stopping instance ${data.instance.name}...`);
        try {
          await this.stopInstance(id);
        } catch (error) {
          console.error(`Failed to stop instance ${id}:`, error);
        }
      }
    }
  }
}

export const redisInstanceManager = new RedisInstanceManager();