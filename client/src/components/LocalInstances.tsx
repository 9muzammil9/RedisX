import React, { useState, useEffect } from 'react';
import { Server, Plus, Play, Square, Trash2, Terminal, AlertCircle } from 'lucide-react';
import { Button } from './ui/Button';
import { instancesApi, RedisInstance } from '../services/api';
import { NewInstanceModal } from './NewInstanceModal';
import { InstanceLogsViewer } from './InstanceLogsViewer';
import { useStore } from '../store/useStore';
import { connectionsApi } from '../services/api';
import toast from 'react-hot-toast';

export const LocalInstances: React.FC = () => {
  const [instances, setInstances] = useState<RedisInstance[]>([]);
  const [isRedisInstalled, setIsRedisInstalled] = useState<boolean | null>(null);
  const [redisVersion, setRedisVersion] = useState<string | null>(null);
  const [showNewInstanceModal, setShowNewInstanceModal] = useState(false);
  const [selectedInstanceForLogs, setSelectedInstanceForLogs] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { addConnection } = useStore();

  useEffect(() => {
    checkRedisInstallation();
    fetchInstances();
  }, []);

  const checkRedisInstallation = async () => {
    try {
      const { data } = await instancesApi.checkRedisInstalled();
      setIsRedisInstalled(data.installed);
      setRedisVersion(data.version);
    } catch (error) {
      console.error('Failed to check Redis installation:', error);
      setIsRedisInstalled(false);
    }
  };

  const fetchInstances = async () => {
    try {
      setLoading(true);
      const { data } = await instancesApi.getAll();
      setInstances(data);
    } catch (error) {
      console.error('Failed to fetch instances:', error);
      toast.error('Failed to fetch instances');
    } finally {
      setLoading(false);
    }
  };

  const handleStartInstance = async (id: string) => {
    try {
      await instancesApi.start(id);
      await fetchInstances();
      toast.success('Instance started successfully');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to start instance');
    }
  };

  const handleStopInstance = async (id: string) => {
    try {
      await instancesApi.stop(id);
      await fetchInstances();
      toast.success('Instance stopped successfully');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to stop instance');
    }
  };

  const handleDeleteInstance = async (id: string) => {
    if (!confirm('Are you sure you want to delete this instance? Data will be preserved but configuration will be lost.')) {
      return;
    }

    try {
      const instance = instances.find(i => i.id === id);
      await instancesApi.delete(id);
      
      // Also remove any associated connections
      if (instance) {
        const { connections, removeConnection } = useStore.getState();
        const associatedConnection = connections.find(
          c => c.name === `Local - ${instance.name}` && c.port === instance.config.port
        );
        if (associatedConnection) {
          try {
            await connectionsApi.delete(associatedConnection.id);
            removeConnection(associatedConnection.id);
          } catch (error) {
            console.warn('Failed to remove associated connection:', error);
          }
        }
      }
      
      await fetchInstances();
      toast.success('Instance deleted successfully');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete instance');
    }
  };

  const handleConnect = async (instance: RedisInstance) => {
    try {
      const connection = {
        name: `Local - ${instance.name}`,
        host: instance.config.bind || '127.0.0.1',
        port: instance.config.port,
        password: instance.config.password,
        username: '',
        db: 0,
        tls: false
      };

      const { data } = await connectionsApi.create(connection);
      addConnection(data);
      toast.success('Connected to local instance');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to connect to instance');
    }
  };

  if (isRedisInstalled === false) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 text-yellow-500" />
        <h3 className="text-lg font-semibold mb-2">Redis Not Installed</h3>
        <p className="text-muted-foreground mb-4">
          Redis server is not installed on your system. Please install Redis to use local instances.
        </p>
        <a
          href="https://redis.io/docs/getting-started/installation/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          View Installation Guide
        </a>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Local Instances</h2>
            {redisVersion && (
              <p className="text-sm text-muted-foreground">Redis {redisVersion}</p>
            )}
          </div>
          <Button
            size="sm"
            onClick={() => setShowNewInstanceModal(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            New Instance
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="text-center text-muted-foreground">Loading instances...</div>
        ) : instances.length === 0 ? (
          <div className="text-center">
            <Server className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground mb-4">No local instances</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowNewInstanceModal(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Create your first instance
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {instances.map((instance) => (
              <div
                key={instance.id}
                className="border border-border rounded-lg p-4 hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold">{instance.name}</h3>
                      <span
                        className={`px-2 py-0.5 text-xs rounded-full ${
                          instance.status === 'running'
                            ? 'bg-green-500/20 text-green-500'
                            : instance.status === 'error'
                            ? 'bg-red-500/20 text-red-500'
                            : 'bg-gray-500/20 text-gray-500'
                        }`}
                      >
                        {instance.status}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Port: {instance.config.port} | 
                      Memory: {instance.config.maxmemory || 'unlimited'} |
                      Databases: {instance.config.databases || 16}
                    </p>
                    {instance.pid && (
                      <p className="text-xs text-muted-foreground mt-1">
                        PID: {instance.pid}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {instance.status === 'running' ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleConnect(instance)}
                        >
                          Connect
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelectedInstanceForLogs(instance.id)}
                        >
                          <Terminal className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleStopInstance(instance.id)}
                        >
                          <Square className="w-4 h-4" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleStartInstance(instance.id)}
                      >
                        <Play className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteInstance(instance.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showNewInstanceModal && (
        <NewInstanceModal
          onClose={() => setShowNewInstanceModal(false)}
          onInstanceCreated={() => {
            setShowNewInstanceModal(false);
            fetchInstances();
          }}
        />
      )}

      {selectedInstanceForLogs && (
        <InstanceLogsViewer
          instanceId={selectedInstanceForLogs}
          onClose={() => setSelectedInstanceForLogs(null)}
        />
      )}
    </div>
  );
};