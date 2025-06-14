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
    } catch (error: any) {
      instance.status = 'error';
      instance.logs.push(`[${new Date().toISOString()}] [ERROR] Failed to start native instance: ${error.message}`);
      throw error;
    }
  }

  private async startDockerInstance(id: string): Promise<void> {
    const instanceData = this.instances.get(id)!;
    const { instance } = instanceData;

    try {
      const containerName = `redisx-${id}`;
      
      // First, ensure any existing container with the same name is removed
      try {
        execSync(`docker rm -f ${containerName}`, { stdio: 'ignore' });
      } catch {
        // Ignore if container doesn't exist
      }

      // Build Docker arguments with Windows-compatible paths
      const normalizedDataDir = (instance.dataDir || '').replace(/\\/g, '/');
      const dockerArgs = [
        'run', '--rm', '-d',
        '--name', containerName,
        '-p', `${instance.config.port}:6379`,
        '-v', `${normalizedDataDir}:/data`
      ];

      // Build Redis server arguments
      dockerArgs.push('redis:alpine', 'redis-server');
      
      // Add command line arguments instead of config file for better compatibility
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

      instance.logs = [
        `[${new Date().toISOString()}] Starting Redis instance (Docker) on port ${instance.config.port}...`,
        `[${new Date().toISOString()}] Docker command: docker ${dockerArgs.join(' ')}`
      ];

      const process = spawn('docker', dockerArgs, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // Set up process handlers before waiting
      let containerId = '';
      let dockerOutput = '';
      let dockerErrors = '';
      
      process.stdout?.on('data', (data) => {
        const output = data.toString().trim();
        dockerOutput += output + '\n';
        instance.logs.push(`[${new Date().toISOString()}] Docker stdout: ${output}`);
        
        // Capture container ID
        if (output.length === 64 && /^[a-f0-9]+$/.test(output)) {
          containerId = output;
          (instance as any).containerId = containerId;
          instance.logs.push(`[${new Date().toISOString()}] Container ID: ${containerId}`);
        }
        
        this.emit('instance-log', { id, log: output });
      });

      process.stderr?.on('data', (data) => {
        const error = data.toString().trim();
        dockerErrors += error + '\n';
        instance.logs.push(`[${new Date().toISOString()}] [ERROR] Docker stderr: ${error}`);
        this.emit('instance-log', { id, log: error, error: true });
      });

      // For docker run -d, the process should exit with code 0 immediately after starting the container
      // We need to capture the container ID from stdout first
      let dockerProcessCompleted = false;
      
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (!dockerProcessCompleted) {
            reject(new Error('Docker command timed out'));
          }
        }, 10000); // 10 second timeout

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

      // Wait for Redis to start inside container (Docker containers need more time)
      instance.logs.push(`[${new Date().toISOString()}] Waiting for Redis to start inside container...`);
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Verify container is running and Redis is accessible
      let retries = 0;
      const maxRetries = 6; // 30 seconds total (6 * 5 seconds)
      
      while (retries < maxRetries) {
        try {
          // Check if container is running
          const checkResult = execSync(`docker ps -q -f name=${containerName}`, { encoding: 'utf8' });
          if (!checkResult.trim()) {
            instance.logs.push(`[${new Date().toISOString()}] Container not found, retry ${retries + 1}/${maxRetries}`);
            retries++;
            if (retries < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 5000));
              continue;
            }
            throw new Error('Container is not running after multiple checks');
          }

          instance.logs.push(`[${new Date().toISOString()}] Container is running, testing Redis connectivity...`);

          // Test Redis connection inside container (with retries)
          let redisReady = false;
          for (let i = 0; i < 3; i++) {
            try {
              execSync(`docker exec ${containerName} redis-cli ping`, { stdio: 'ignore', timeout: 5000 });
              instance.logs.push(`[${new Date().toISOString()}] ✅ Redis server is responding to ping`);
              redisReady = true;
              break;
            } catch {
              instance.logs.push(`[${new Date().toISOString()}] Redis ping attempt ${i + 1}/3 failed, retrying...`);
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
          
          if (!redisReady) {
            instance.logs.push(`[${new Date().toISOString()}] ⚠️ Redis not responding to ping, but container is running`);
          }
          
          instance.status = 'running';
          instance.startedAt = new Date();
          instanceData.process = process;
          
          // Update database
          databaseService.updateInstanceStatus(id, 'running', true);
          this.emit('instance-started', instance);
          return; // Success!
          
        } catch (checkError: any) {
          instance.logs.push(`[${new Date().toISOString()}] Check failed: ${checkError.message}`);
          retries++;
          
          if (retries >= maxRetries) {
            // Get container logs for debugging
            try {
              const logs = execSync(`docker logs ${containerName}`, { encoding: 'utf8', timeout: 5000 });
              instance.logs.push(`[${new Date().toISOString()}] Container logs:\n${logs}`);
            } catch (logError: any) {
              instance.logs.push(`[${new Date().toISOString()}] Failed to get container logs: ${logError.message}`);
            }
            
            // Also check if container exists at all
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
            
            throw new Error(`Container verification failed after ${maxRetries} attempts: ${checkError.message}`);
          }
          
          instance.logs.push(`[${new Date().toISOString()}] Retrying container check in 5 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }

    } catch (error: any) {
      instance.status = 'error';
      instance.logs.push(`[${new Date().toISOString()}] [ERROR] Failed to start Docker instance: ${error.message}`);
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

    this.emit('instance-started', instance);
  }

  async stopInstance(id: string): Promise<void> {
    const instanceData = this.instances.get(id);
    if (!instanceData) {
      throw new Error('Instance not found');
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
      } catch (stopError: any) {
        // Force remove if graceful stop fails
        try {
          execSync(`docker rm -f ${containerName}`, { stdio: 'ignore' });
          instance.logs.push(`[${new Date().toISOString()}] Docker container force removed`);
        } catch (rmError: any) {
          instance.logs.push(`[${new Date().toISOString()}] [WARNING] Failed to remove container: ${rmError.message}`);
        }
      }
      
      instance.status = 'stopped';
      instance.pid = undefined;
      instance.logs.push(`[${new Date().toISOString()}] Redis instance (Docker) stopped`);
      instanceData.process = undefined;
      
      // Update database
      databaseService.updateInstanceStatus(id, 'stopped', false);
      this.emit('instance-stopped', { id });
    } catch (error: any) {
      instance.status = 'error';
      instance.logs.push(`[${new Date().toISOString()}] [ERROR] Failed to stop Docker instance: ${error.message}`);
      throw error;
    }
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