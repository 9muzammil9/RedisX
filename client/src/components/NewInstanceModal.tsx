import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Label } from './ui/Label';
import { Select } from './ui/Select';
import { Switch } from './ui/Switch';
import { instancesApi, RedisInstanceConfig } from '../services/api';
import toast from 'react-hot-toast';

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

export const NewInstanceModal: React.FC<NewInstanceModalProps> = ({ onClose, onInstanceCreated }) => {
  const [name, setName] = useState('');
  const [config, setConfig] = useState<RedisInstanceConfig>({
    port: 6380,
    bind: '127.0.0.1',
    databases: 16,
    loglevel: 'notice',
    appendonly: false,
    save: true,
  });
  const [loading, setLoading] = useState(false);

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

    setLoading(true);

    try {
      await instancesApi.create(name, config);
      toast.success('Instance created successfully');
      onInstanceCreated();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to create instance');
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
            <Label htmlFor="port">Port</Label>
            <Input
              id="port"
              type="number"
              value={config.port}
              onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value) || 6379 })}
              placeholder="6380"
              min={1024}
              max={65535}
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              Default Redis port is 6379. Use a different port to avoid conflicts.
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
              value={config.password || ''}
              onChange={(e) => setConfig({ ...config, password: e.target.value || undefined })}
              placeholder="Leave empty for no password"
            />
          </div>

          <div>
            <Label htmlFor="databases">Number of Databases</Label>
            <Input
              id="databases"
              type="number"
              value={config.databases}
              onChange={(e) => setConfig({ ...config, databases: parseInt(e.target.value) || 16 })}
              min={1}
              max={512}
            />
          </div>

          <div>
            <Label htmlFor="maxmemory">Max Memory (Optional)</Label>
            <Input
              id="maxmemory"
              value={config.maxmemory || ''}
              onChange={(e) => setConfig({ ...config, maxmemory: e.target.value || undefined })}
              placeholder="e.g., 256mb, 1gb"
            />
          </div>

          <div>
            <Label htmlFor="maxmemoryPolicy">Memory Policy</Label>
            <Select
              id="maxmemoryPolicy"
              value={config.maxmemoryPolicy || ''}
              onChange={(e) => setConfig({ ...config, maxmemoryPolicy: e.target.value || undefined })}
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
              onChange={(e) => setConfig({ ...config, loglevel: e.target.value as any })}
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
              checked={config.appendonly || false}
              onCheckedChange={(checked) => setConfig({ ...config, appendonly: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="save">Enable RDB Snapshots</Label>
            <Switch
              id="save"
              checked={config.save !== false}
              onCheckedChange={(checked) => setConfig({ ...config, save: checked })}
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