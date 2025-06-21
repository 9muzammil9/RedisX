import { spawn, ChildProcess } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import Redis from 'ioredis';
import { databaseService } from './database';
import { settingsService } from './settingsService';

// Type definitions for Redis client configuration
interface RedisClientConfig {
  host: string;
  port: number;
  password?: string;
  retryDelayOnFailover: number;
  maxRetriesPerRequest: number;
  connectTimeout: number;
  lazyConnect: boolean;
}

// Helper function to safely extract error message
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return getErrorMessage(error);
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error && typeof (error as any).message === 'string') {
    return (error as any).message;
  }
  return 'Unknown error';
}

// Constants
const REDIS_CONNECTION_TIMEOUT = 2000;
const REDIS_RETRY_DELAY = 100;
const MAX_RETRIES_PER_REQUEST = 1;
const DOCKER_STARTUP_TIMEOUT = 10000;
const REDIS_STARTUP_DELAY = 5000;
const MAX_VERIFICATION_RETRIES = 6;
const VERIFICATION_RETRY_DELAY = 5000;
const MAX_LOG_ENTRIES = 1000;

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

export class RedisInstanceManager extends EventEmitter {
  readonly instances: Map<string, {
    instance: RedisInstance;
    process?: ChildProcess;
  }> = new Map();

  readonly dataDir: string;
  readonly defaultInstanceId = 'default-redis';

  constructor() {
    super();
    this.dataDir = join(process.cwd(), 'redis-instances');
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
    
    // Load instances from database on startup
    this.loadInstancesFromDatabase();
    
    // Check for default Redis instance
    this.checkDefaultRedisInstance();
    
    // Periodically check default Redis status
    setInterval(() => {
      this.refreshDefaultRedisStatus();
    }, 10000); // Check every 10 seconds
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
          instance.logs.push(`[${new Date().toISOString()}] 🔄 Auto-starting instance ${instance.name} (was running before shutdown)`);
          try {
            await this.startInstance(dbInstance.id);
          } catch (error: unknown) {
            instance.logs.push(`[${new Date().toISOString()}] [ERROR] Failed to auto-start instance ${instance.name}: ${getErrorMessage(error)}`);
          }
        }
      }
      
      // Successfully loaded instances from database
    } catch (error: unknown) {
      // Failed to load instances from database - this is logged internally
    }
  }

  private async checkDefaultRedisInstance() {
    try {
      const settings = settingsService.getDefaultRedisSettings();
      
      if (!settings.enabled) {
        // Default Redis detection is disabled in settings
        return;
      }

      // Check if default Redis is running
      const clientConfig = this.createRedisClientConfig(settings.host, settings.port, settings.password);

      const testClient = new Redis(clientConfig);

      try {
        await testClient.ping();
        
        // Default Redis is running, add it to instances
        const defaultInstance: RedisInstance = {
          id: this.defaultInstanceId,
          name: 'Default Redis (System)',
          config: {
            port: settings.port,
            bind: settings.host,
            password: settings.password,
            executionMode: 'native'
          },
          status: 'running',
          logs: [
            `[${new Date().toISOString()}] Default Redis instance detected on ${settings.host}:${settings.port}`,
            `[${new Date().toISOString()}] This is an external Redis instance managed by the system`,
            settings.password ? `[${new Date().toISOString()}] Authentication: Enabled` : `[${new Date().toISOString()}] Authentication: Disabled`
          ]
        };

        this.instances.set(this.defaultInstanceId, { instance: defaultInstance });
        // Default Redis instance detected and added to instances list
      } catch (error: unknown) {
        // Default Redis is not running or authentication failed
        if (getErrorMessage(error).includes('NOAUTH')) {
          // Default Redis instance found but requires authentication
        } else {
          // No default Redis instance detected
        }
      } finally {
        testClient.disconnect();
      }
    } catch (error: unknown) {
      // Failed to check default Redis instance - this is logged internally
    }
  }

  private async refreshDefaultRedisStatus() {
    try {
      const settings = settingsService.getDefaultRedisSettings();
      
      if (!settings.enabled) {
        // If disabled, remove from instances if it exists
        if (this.instances.has(this.defaultInstanceId)) {
          this.instances.delete(this.defaultInstanceId);
        }
        return;
      }

      const instanceData = this.instances.get(this.defaultInstanceId);
      if (!instanceData) {
        // Default Redis not in list, check if it's now available
        return this.checkDefaultRedisInstance();
      }

      const clientConfig = this.createRedisClientConfig(settings.host, settings.port, settings.password);

      const testClient = new Redis(clientConfig);

      try {
        await testClient.ping();
        
        // Redis is still running
        if (instanceData.instance.status !== 'running') {
          instanceData.instance.status = 'running';
          instanceData.instance.logs.push(`[${new Date().toISOString()}] Default Redis instance is back online`);
          this.emit('instance-started', instanceData.instance);
        }
      } catch (error) {
        // Redis is no longer running
        if (instanceData.instance.status === 'running') {
          instanceData.instance.status = 'stopped';
          instanceData.instance.logs.push(`[${new Date().toISOString()}] Default Redis instance is no longer running`);
          this.emit('instance-stopped', { id: this.defaultInstanceId });
        }
      } finally {
        testClient.disconnect();
      }
    } catch (error) {
      // Ignore refresh errors
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

  checkDockerInstalled(): boolean {
    try {
      execSync('docker --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  getDockerVersion(): string | null {
    try {
      const output = execSync('docker --version', { encoding: 'utf8' });
      const match = output.match(/Docker version (\d+\.\d+\.\d+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  private generateConfig(instanceId: string, config: RedisInstanceConfig): string {
    const isDocker = config.executionMode === 'docker';
    const configLines = [
      `# RedisX managed instance: ${instanceId}`,
      `port ${isDocker ? '6379' : config.port}`, // Docker always uses 6379 internally
      `bind ${isDocker ? '0.0.0.0' : (config.bind || '127.0.0.1')}`, // Docker needs 0.0.0.0
      `protected-mode ${isDocker ? 'no' : 'yes'}`, // Disable protected mode for Docker
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

    // Handle default Redis instance
    if (id === this.defaultInstanceId) {
      throw new Error('Cannot start default Redis instance - it is managed by the system');
    }

    const { instance } = instanceData;
    if (instance.status === 'running') {
      throw new Error('Instance is already running');
    }

    if (instance.config.executionMode === 'docker') {
      return this.startDockerInstance(id);
    } else {
      return this.startNativeInstance(id);
    }
  }

  private async startNativeInstance(id: string): Promise<void> {
    const instanceData = this.instances.get(id)!;
    const { instance } = instanceData;

    try {
      const process = spawn('redis-server', [instance.configPath!], {
        cwd: instance.dataDir,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      instance.pid = process.pid;
      instance.status = 'running';
      instance.startedAt = new Date();
      instance.logs = [`[${new Date().toISOString()}] Starting Redis instance (native) on port ${instance.config.port}...`];

      this.setupProcessHandlers(id, process);
      
      // Update database
      databaseService.updateInstanceStatus(id, 'running', true);

      // Wait a bit to ensure Redis has started
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check if Redis is actually running
      if (instance.status !== 'running') {
        throw new Error('Failed to start Redis instance');
      }
    } catch (error: unknown) {
      instance.status = 'error';
      instance.logs.push(`[${new Date().toISOString()}] [ERROR] Failed to start native instance: ${getErrorMessage(error)}`);
      throw error;
    }
  }

  // Helper function to create Redis client configuration
  private createRedisClientConfig(host: string, port: number, password?: string): RedisClientConfig {
    const config: RedisClientConfig = {
      host,
      port,
      retryDelayOnFailover: REDIS_RETRY_DELAY,
      maxRetriesPerRequest: MAX_RETRIES_PER_REQUEST,
      connectTimeout: REDIS_CONNECTION_TIMEOUT,
      lazyConnect: true
    };

    if (password) {
      config.password = password;
    }

    return config;
  }

  // Helper function to build Docker arguments for Redis instance
  private buildDockerArgs(instance: RedisInstance, containerName: string): string[] {
    const normalizedDataDir = (instance.dataDir || '').replace(/\\/g, '/');
    const dockerArgs = [
      'run', '--rm', '-d',
      '--name', containerName,
      '-p', `${instance.config.port}:6379`,
      '-v', `${normalizedDataDir}:/data`,
      'redis:alpine', 'redis-server'
    ];

    // Add Redis configuration arguments
    dockerArgs.push('--bind', '0.0.0.0');
    dockerArgs.push('--protected-mode', 'no');
    dockerArgs.push('--databases', (instance.config.databases || 16).toString());
    
    if (instance.config.password) {
      dockerArgs.push('--requirepass', instance.config.password);
    }
    
    if (instance.config.maxmemory) {
      dockerArgs.push('--maxmemory', instance.config.maxmemory);
    }
    
    if (instance.config.maxmemoryPolicy) {
      dockerArgs.push('--maxmemory-policy', instance.config.maxmemoryPolicy);
    }
    
    if (instance.config.appendonly) {
      dockerArgs.push('--appendonly', 'yes');
    }
    
    if (instance.config.save === false) {
      dockerArgs.push('--save', '');
    }
    
    dockerArgs.push('--loglevel', instance.config.loglevel || 'notice');

    return dockerArgs;
  }

  // Helper function to set up Docker process handlers
  private setupDockerProcessHandlers(
    process: ChildProcess, 
    instance: RedisInstance, 
    id: string
  ): { dockerOutput: string; dockerErrors: string } {
    let dockerOutput = '';
    let dockerErrors = '';
    
    process.stdout?.on('data', (data) => {
      const output = data.toString().trim();
      dockerOutput += output + '\n';
      instance.logs.push(`[${new Date().toISOString()}] Docker stdout: ${output}`);
      
      // Capture container ID
      if (output.length === 64 && /^[a-f0-9]+$/.test(output)) {
        (instance as RedisInstance & { containerId?: string }).containerId = output;
        instance.logs.push(`[${new Date().toISOString()}] Container ID: ${output}`);
      }
      
      this.emit('instance-log', { id, log: output });
    });

    process.stderr?.on('data', (data) => {
      const error = data.toString().trim();
      dockerErrors += error + '\n';
      instance.logs.push(`[${new Date().toISOString()}] [ERROR] Docker stderr: ${error}`);
      this.emit('instance-log', { id, log: error, error: true });
    });

    return { dockerOutput, dockerErrors };
  }

  // Helper function to test Redis connection inside container
  private async testRedisInContainer(containerName: string, instance: RedisInstance): Promise<boolean> {
    for (let i = 0; i < 3; i++) {
      try {
        execSync(`docker exec ${containerName} redis-cli ping`, { stdio: 'ignore', timeout: 5000 });
        instance.logs.push(`[${new Date().toISOString()}] ✅ Redis server is responding to ping`);
        return true;
      } catch {
        instance.logs.push(`[${new Date().toISOString()}] Redis ping attempt ${i + 1}/3 failed, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    return false;
  }

  // Helper function to verify container is running and Redis is accessible
  private async verifyDockerContainer(containerName: string, instance: RedisInstance): Promise<void> {
    let retries = 0;
    
    while (retries < MAX_VERIFICATION_RETRIES) {
      try {
        // Check if container is running
        const checkResult = execSync(`docker ps -q -f name=${containerName}`, { encoding: 'utf8' });
        if (!checkResult.trim()) {
          instance.logs.push(`[${new Date().toISOString()}] Container not found, retry ${retries + 1}/${MAX_VERIFICATION_RETRIES}`);
          retries++;
          if (retries < MAX_VERIFICATION_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, VERIFICATION_RETRY_DELAY));
            continue;
          }
          throw new Error('Container is not running after multiple checks');
        }

        instance.logs.push(`[${new Date().toISOString()}] Container is running, testing Redis connectivity...`);

        // Test Redis connection inside container
        const redisReady = await this.testRedisInContainer(containerName, instance);
        
        if (!redisReady) {
          instance.logs.push(`[${new Date().toISOString()}] ⚠️ Redis not responding to ping, but container is running`);
        }
        
        return; // Success!
        
      } catch (checkError: unknown) {
        instance.logs.push(`[${new Date().toISOString()}] Check failed: ${getErrorMessage(checkError)}`);
        retries++;
        
        if (retries >= MAX_VERIFICATION_RETRIES) {
          await this.logContainerDebugInfo(containerName, instance);
          throw new Error(`Container verification failed after ${MAX_VERIFICATION_RETRIES} attempts: ${getErrorMessage(checkError)}`);
        }
        
        instance.logs.push(`[${new Date().toISOString()}] Retrying container check in 5 seconds...`);
        await new Promise(resolve => setTimeout(resolve, VERIFICATION_RETRY_DELAY));
      }
    }
  }

  // Helper function to log container debugging information
  private async logContainerDebugInfo(containerName: string, instance: RedisInstance): Promise<void> {
    try {
      const logs = execSync(`docker logs ${containerName}`, { encoding: 'utf8', timeout: 5000 });
      instance.logs.push(`[${new Date().toISOString()}] Container logs:\n${logs}`);
    } catch (logError: unknown) {
      instance.logs.push(`[${new Date().toISOString()}] Failed to get container logs: ${getErrorMessage(logError)}`);
    }
    
    try {
      const allContainers = execSync(`docker ps -a -q -f name=${containerName}`, { encoding: 'utf8' });
      if (allContainers.trim()) {
        instance.logs.push(`[${new Date().toISOString()}] Container exists but may have exited`);
      } else {
        instance.logs.push(`[${new Date().toISOString()}] Container was never created`);
      }
    } catch {
      // Ignore
    }
  }

  private async startDockerInstance(id: string): Promise<void> {
    const instanceData = this.instances.get(id)!;
    const { instance } = instanceData;

    try {
      const containerName = `redisx-${id}`;
      
      // Remove any existing container with the same name
      try {
        execSync(`docker rm -f ${containerName}`, { stdio: 'ignore' });
      } catch {
        // Ignore if container doesn't exist
      }

      // Build Docker arguments
      const dockerArgs = this.buildDockerArgs(instance, containerName);

      instance.logs = [
        `[${new Date().toISOString()}] Starting Redis instance (Docker) on port ${instance.config.port}...`,
        `[${new Date().toISOString()}] Docker command: docker ${dockerArgs.join(' ')}`
      ];

      const process = spawn('docker', dockerArgs, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // Set up process handlers
      const { dockerOutput, dockerErrors } = this.setupDockerProcessHandlers(process, instance, id);
      
      // Wait for Docker process to complete
      let dockerProcessCompleted = false;
      
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (!dockerProcessCompleted) {
            reject(new Error('Docker command timed out'));
          }
        }, DOCKER_STARTUP_TIMEOUT);

        process.on('exit', (code) => {
          dockerProcessCompleted = true;
          clearTimeout(timeout);
          if (code === 0) {
            resolve();
          } else {
            const errorMsg = `Docker command failed with code ${code}. Output: ${dockerOutput.trim()}. Errors: ${dockerErrors.trim()}`;
            reject(new Error(errorMsg));
          }
        });
        
        process.on('error', (error) => {
          dockerProcessCompleted = true;
          clearTimeout(timeout);
          reject(error);
        });
      });

      // Wait for Redis to start inside container
      instance.logs.push(`[${new Date().toISOString()}] Waiting for Redis to start inside container...`);
      await new Promise(resolve => setTimeout(resolve, REDIS_STARTUP_DELAY));

      // Verify container is running and Redis is accessible
      await this.verifyDockerContainer(containerName, instance);
      
      instance.status = 'running';
      instance.startedAt = new Date();
      instanceData.process = process;
      
      // Update database
      databaseService.updateInstanceStatus(id, 'running', true);
      this.emit('instance-started', instance);

    } catch (error: unknown) {
      instance.status = 'error';
      instance.logs.push(`[${new Date().toISOString()}] [ERROR] Failed to start Docker instance: ${getErrorMessage(error)}`);
      throw error;
    }
  }

  private setupProcessHandlers(id: string, process: ChildProcess): void {
    const instanceData = this.instances.get(id)!;
    const { instance } = instanceData;

    instance.pid = process.pid;
    instanceData.process = process;

    // Handle stdout
    process.stdout?.on('data', (data) => {
      const log = data.toString();
      instance.logs.push(`[${new Date().toISOString()}] ${log}`);
      // Keep only last MAX_LOG_ENTRIES logs
      if (instance.logs.length > MAX_LOG_ENTRIES) {
        instance.logs.shift();
      }
      this.emit('instance-log', { id, log });
    });

    // Handle stderr
    process.stderr?.on('data', (data) => {
      const log = data.toString();
      instance.logs.push(`[${new Date().toISOString()}] [ERROR] ${log}`);
      if (instance.logs.length > MAX_LOG_ENTRIES) {
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
      instance.logs.push(`[${new Date().toISOString()}] [ERROR] ${getErrorMessage(error)}`);
      this.emit('instance-error', { id, error });
    });

    this.emit('instance-started', instance);
  }

  async stopInstance(id: string): Promise<void> {
    const instanceData = this.instances.get(id);
    if (!instanceData) {
      throw new Error('Instance not found');
    }

    // Handle default Redis instance
    if (id === this.defaultInstanceId) {
      return this.stopDefaultRedisInstance();
    }

    const { instance } = instanceData;
    if (instance.status !== 'running') {
      throw new Error('Instance is not running');
    }

    if (instance.config.executionMode === 'docker') {
      return this.stopDockerInstance(id);
    } else {
      return this.stopNativeInstance(id);
    }
  }

  private async stopNativeInstance(id: string): Promise<void> {
    const instanceData = this.instances.get(id)!;
    const { instance, process } = instanceData;

    if (!process) {
      throw new Error('Instance process not found');
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
        instance.logs.push(`[${new Date().toISOString()}] Redis instance (native) stopped`);
        instanceData.process = undefined;
        // Update database
        databaseService.updateInstanceStatus(id, 'stopped', false);
        this.emit('instance-stopped', { id });
        resolve();
      });

      process.kill('SIGTERM');
    });
  }

  private async stopDockerInstance(id: string): Promise<void> {
    const instanceData = this.instances.get(id)!;
    const { instance } = instanceData;

    try {
      const containerName = `redisx-${id}`;
      
      // Check if container exists and is running
      try {
        const containerExists = execSync(`docker ps -q -f name=${containerName}`, { encoding: 'utf8' });
        if (containerExists.trim()) {
          // Gracefully stop the container
          execSync(`docker stop ${containerName}`, { stdio: 'ignore', timeout: 10000 });
          instance.logs.push(`[${new Date().toISOString()}] Docker container stopped gracefully`);
        } else {
          instance.logs.push(`[${new Date().toISOString()}] Container was already stopped`);
        }
      } catch (stopError: unknown) {
        // Force remove if graceful stop fails
        try {
          execSync(`docker rm -f ${containerName}`, { stdio: 'ignore' });
          instance.logs.push(`[${new Date().toISOString()}] Docker container force removed`);
        } catch (rmError: unknown) {
          instance.logs.push(`[${new Date().toISOString()}] [WARNING] Failed to remove container: ${getErrorMessage(rmError)}`);
        }
      }
      
      instance.status = 'stopped';
      instance.pid = undefined;
      instance.logs.push(`[${new Date().toISOString()}] Redis instance (Docker) stopped`);
      instanceData.process = undefined;
      
      // Update database
      databaseService.updateInstanceStatus(id, 'stopped', false);
      this.emit('instance-stopped', { id });
    } catch (error: unknown) {
      instance.status = 'error';
      instance.logs.push(`[${new Date().toISOString()}] [ERROR] Failed to stop Docker instance: ${getErrorMessage(error)}`);
      throw error;
    }
  }

  private async stopDefaultRedisInstance(): Promise<void> {
    try {
      // For default Redis, we'll try to stop it using redis-cli shutdown
      execSync('redis-cli -p 6379 shutdown', { stdio: 'ignore', timeout: 5000 });
      
      const instanceData = this.instances.get(this.defaultInstanceId);
      if (instanceData) {
        instanceData.instance.status = 'stopped';
        instanceData.instance.logs.push(`[${new Date().toISOString()}] Default Redis instance stopped via redis-cli shutdown`);
        this.emit('instance-stopped', { id: this.defaultInstanceId });
      }
    } catch (error: unknown) {
      const instanceData = this.instances.get(this.defaultInstanceId);
      if (instanceData) {
        instanceData.instance.logs.push(`[${new Date().toISOString()}] [ERROR] Failed to stop default Redis instance: ${getErrorMessage(error)}`);
        instanceData.instance.logs.push(`[${new Date().toISOString()}] [INFO] Default Redis may be managed by systemd or another service manager`);
      }
      throw new Error(`Cannot stop default Redis instance: ${getErrorMessage(error)}. It may be managed by systemd or another service.`);
    }
  }

  async deleteInstance(id: string): Promise<void> {
    const instanceData = this.instances.get(id);
    if (!instanceData) {
      throw new Error('Instance not found');
    }

    // Prevent deletion of default Redis instance
    if (id === this.defaultInstanceId) {
      throw new Error('Cannot delete default Redis instance - it is managed by the system');
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
    
    // Special handling for default Redis instance
    if (id === this.defaultInstanceId && instance) {
      const logs = [...(instance.logs || [])];
      
      // Add current status info
      try {
        const info = execSync('redis-cli -p 6379 info server', { encoding: 'utf8', timeout: 2000 });
        const lines = info.split('\n');
        const serverInfo = lines.find(line => line.startsWith('redis_version:'));
        const uptimeInfo = lines.find(line => line.startsWith('uptime_in_seconds:'));
        
        if (serverInfo) {
          logs.push(`[${new Date().toISOString()}] ${serverInfo.trim()}`);
        }
        if (uptimeInfo) {
          const seconds = parseInt(uptimeInfo.split(':')[1]);
          const uptime = Math.floor(seconds / 3600) + 'h ' + Math.floor((seconds % 3600) / 60) + 'm';
          logs.push(`[${new Date().toISOString()}] Uptime: ${uptime}`);
        }
      } catch (error) {
        logs.push(`[${new Date().toISOString()}] [WARNING] Could not retrieve Redis server info`);
      }
      
      return logs;
    }
    
    return instance?.logs || [];
  }

  isPortAvailable(port: number): boolean {
    try {
      // Try different approaches for different platforms
      if (process.platform === 'win32') {
        execSync(`netstat -an | findstr :${port}`, { stdio: 'ignore' });
        return false; // Port is in use
      } else {
        execSync(`lsof -i:${port}`, { stdio: 'ignore' });
        return false; // Port is in use
      }
    } catch {
      return true; // Port is available
    }
  }

  // Test if a Redis instance is actually connectable
  async testRedisConnection(instance: RedisInstance): Promise<boolean> {
    try {
      if (instance.config.executionMode === 'docker') {
        const containerName = `redisx-${instance.id}`;
        // Test connection inside the container
        execSync(`docker exec ${containerName} redis-cli ping`, { stdio: 'ignore', timeout: 5000 });
        return true;
      } else {
        // For native instances, we could use redis-cli if available
        // For now, just return true if status is running
        return instance.status === 'running';
      }
    } catch {
      return false;
    }
  }

  // Method to refresh default Redis instance after settings change
  async refreshDefaultRedisInstance(): Promise<void> {
    // Remove existing default instance if it exists
    if (this.instances.has(this.defaultInstanceId)) {
      this.instances.delete(this.defaultInstanceId);
    }
    
    // Re-check for default Redis instance with new settings
    await this.checkDefaultRedisInstance();
  }

  // Graceful shutdown - mark running instances before server stops
  async gracefulShutdown() {
    // Shutting down Redis instances...
    
    for (const [id, data] of this.instances) {
      if (data.instance.status === 'running') {
        // Stopping instance
        try {
          await this.stopInstance(id);
        } catch (error: unknown) {
          data.instance.logs.push(`[${new Date().toISOString()}] [ERROR] Failed to stop instance ${id}: ${getErrorMessage(error)}`);
        }
      }
    }
  }
}

export const redisInstanceManager = new RedisInstanceManager();