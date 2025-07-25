import { X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { instancesApi, RedisInstanceConfig } from '../services/api';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Label } from './ui/Label';
import { Select } from './ui/Select';
import { Switch } from './ui/Switch';

interface NewInstanceModalProps {
  onClose: () => void;
  onInstanceCreated: () => void;
}

const MEMORY_POLICIES = [
  { value: 'noeviction', label: 'No Eviction' },
  { value: 'allkeys-lru', label: 'All Keys LRU' },
  { value: 'volatile-lru', label: 'Volatile LRU' },
  { value: 'allkeys-random', label: 'All Keys Random' },
  { value: 'volatile-random', label: 'Volatile Random' },
  { value: 'volatile-ttl', label: 'Volatile TTL' },
];

const LOG_LEVELS = [
  { value: 'debug', label: 'Debug' },
  { value: 'verbose', label: 'Verbose' },
  { value: 'notice', label: 'Notice' },
  { value: 'warning', label: 'Warning' },
];

export const NewInstanceModal: React.FC<NewInstanceModalProps> = ({
  onClose,
  onInstanceCreated,
}) => {
  const [name, setName] = useState('');
  const [config, setConfig] = useState<RedisInstanceConfig>({
    port: 6380,
    bind: '127.0.0.1',
    databases: 16,
    loglevel: 'notice',
    appendonly: false,
    save: true,
    executionMode: 'native', // Default to native
  });
  const [loading, setLoading] = useState(false);
  const [availability, setAvailability] = useState<{
    redis: { installed: boolean; version: string | null };
    docker: { installed: boolean; version: string | null };
  } | null>(null);

  useEffect(() => {
    // Check Redis and Docker availability on mount
    instancesApi
      .checkRedisInstalled()
      .then((response) => {
        setAvailability(response.data);
        // Auto-select Docker if Redis is not available but Docker is
        if (!response.data.redis.installed && response.data.docker.installed) {
          setConfig((prev) => ({ ...prev, executionMode: 'docker' }));
        }
      })
      .catch((error) => {
        console.error('Failed to check availability:', error);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('Please enter an instance name');
      return;
    }

    if (!config.port || config.port < 1024 || config.port > 65535) {
      toast.error('Please enter a valid port (1024-65535)');
      return;
    }

    // Check if selected execution mode is available
    if (availability) {
      if (config.executionMode === 'native' && !availability.redis.installed) {
        toast.error(
          'Native Redis is not available. Please install Redis or use Docker mode.',
        );
        return;
      }
      if (config.executionMode === 'docker' && !availability.docker.installed) {
        toast.error(
          'Docker is not available. Please install Docker or use native mode.',
        );
        return;
      }
    }

    setLoading(true);

    try {
      await instancesApi.create(name, config);
      toast.success('Instance created successfully');
      onInstanceCreated();
    } catch (error: any) {
      toast.error(error.response?.data?.error ?? 'Failed to create instance');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-card border border-border rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Create Local Redis Instance</h2>
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Instance Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Redis Instance"
              required
            />
          </div>

          <div>
            <Label htmlFor="executionMode">Execution Mode</Label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="native"
                  name="executionMode"
                  value="native"
                  checked={config.executionMode === 'native'}
                  onChange={() =>
                    setConfig({ ...config, executionMode: 'native' })
                  }
                  disabled={availability?.redis.installed === false}
                  className="h-4 w-4"
                />
                <Label htmlFor="native" className="flex-1">
                  <div className="flex items-center justify-between">
                    <span>Native Redis ⚙️</span>
                    <span
                      className={`text-xs ${availability?.redis.installed ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {availability?.redis.installed
                        ? `Available (v${availability.redis.version})`
                        : 'Not Available'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Uses Redis installed on your system. Requires redis-server
                    command.
                  </p>
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="docker"
                  name="executionMode"
                  value="docker"
                  checked={config.executionMode === 'docker'}
                  onChange={() =>
                    setConfig({ ...config, executionMode: 'docker' })
                  }
                  disabled={availability?.docker.installed === false}
                  className="h-4 w-4"
                />
                <Label htmlFor="docker" className="flex-1">
                  <div className="flex items-center justify-between">
                    <span>Docker Container 🐳</span>
                    <span
                      className={`text-xs ${availability?.docker.installed ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {availability?.docker.installed
                        ? `Available (v${availability.docker.version})`
                        : 'Not Available'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Runs Redis in a Docker container. Recommended for Windows
                    users - no Redis installation needed!
                  </p>
                </Label>
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="port">Port</Label>
            <Input
              id="port"
              type="number"
              value={config.port}
              onChange={(e) =>
                setConfig({ ...config, port: parseInt(e.target.value) || 6379 })
              }
              placeholder="6380"
              min={1024}
              max={65535}
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              Default Redis port is 6379. Use a different port to avoid
              conflicts.
            </p>
          </div>

          <div>
            <Label htmlFor="bind">Bind Address</Label>
            <Input
              id="bind"
              value={config.bind}
              onChange={(e) => setConfig({ ...config, bind: e.target.value })}
              placeholder="127.0.0.1"
            />
          </div>

          <div>
            <Label htmlFor="password">Password (Optional)</Label>
            <Input
              id="password"
              type="password"
              value={config.password ?? ''}
              onChange={(e) =>
                setConfig({ ...config, password: e.target.value || undefined })
              }
              placeholder="Leave empty for no password"
            />
          </div>

          <div>
            <Label htmlFor="databases">Number of Databases</Label>
            <Input
              id="databases"
              type="number"
              value={config.databases}
              onChange={(e) =>
                setConfig({
                  ...config,
                  databases: parseInt(e.target.value) || 16,
                })
              }
              min={1}
              max={512}
            />
          </div>

          <div>
            <Label htmlFor="maxmemory">Max Memory (Optional)</Label>
            <Input
              id="maxmemory"
              value={config.maxmemory ?? ''}
              onChange={(e) =>
                setConfig({ ...config, maxmemory: e.target.value || undefined })
              }
              placeholder="e.g., 256mb, 1gb"
            />
          </div>

          <div>
            <Label htmlFor="maxmemoryPolicy">Memory Policy</Label>
            <Select
              id="maxmemoryPolicy"
              value={config.maxmemoryPolicy ?? ''}
              onChange={(e) =>
                setConfig({
                  ...config,
                  maxmemoryPolicy: e.target.value || undefined,
                })
              }
            >
              <option value="">Default</option>
              {MEMORY_POLICIES.map((policy) => (
                <option key={policy.value} value={policy.value}>
                  {policy.label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="loglevel">Log Level</Label>
            <Select
              id="loglevel"
              value={config.loglevel}
              onChange={(e) =>
                setConfig({ ...config, loglevel: e.target.value as any })
              }
            >
              {LOG_LEVELS.map((level) => (
                <option key={level.value} value={level.value}>
                  {level.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="appendonly">Enable AOF (Append Only File)</Label>
            <Switch
              id="appendonly"
              checked={config.appendonly ?? false}
              onCheckedChange={(checked) =>
                setConfig({ ...config, appendonly: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="save">Enable RDB Snapshots</Label>
            <Switch
              id="save"
              checked={config.save !== false}
              onCheckedChange={(checked) =>
                setConfig({ ...config, save: checked })
              }
            />
          </div>

          <div className="flex justify-end space-x-2 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Instance'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
