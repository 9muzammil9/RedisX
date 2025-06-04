import React, { useState } from 'react';
import { Plus, Trash2, Server, RefreshCw } from 'lucide-react';
import { Button } from './ui/Button';
import { useStore } from '../store/useStore';
import { ConnectionModal } from './ConnectionModal';
import { connectionsApi } from '../services/api';
import toast from 'react-hot-toast';
import { cn } from '../utils/cn';

export const ConnectionList: React.FC = () => {
  const { connections, activeConnectionId, setActiveConnection, removeConnection, addConnection } = useStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [reconnectingId, setReconnectingId] = useState<string | null>(null);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await connectionsApi.delete(id);
      removeConnection(id);
      toast.success('Connection deleted');
    } catch (error) {
      toast.error('Failed to delete connection');
    }
  };

  const handleReconnect = async (connection: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setReconnectingId(connection.id);
    
    try {
      // Try to reconnect without password first (for connections that don't need passwords)
      const connectionData = {
        name: connection.name,
        host: connection.host,
        port: connection.port,
        password: undefined, // Will prompt in modal if needed
        db: connection.db,
        username: connection.username,
        tls: connection.tls,
      };

      const { data } = await connectionsApi.create(connectionData);
      
      // Update the stored connection with new server ID
      const updatedConnection = { ...connection, id: data.id };
      removeConnection(connection.id); // Remove old entry
      addConnection(updatedConnection); // Add with new ID
      setActiveConnection(data.id);
      
      toast.success(`Reconnected to ${connection.name}`);
    } catch (error) {
      // If reconnection fails, open the connection modal for password re-entry
      toast.error(`Reconnection failed. Please re-enter connection details.`);
      setIsModalOpen(true);
    } finally {
      setReconnectingId(null);
    }
  };

  // Check if a connection is currently connected to the server
  const isConnected = (connectionId: string) => {
    return activeConnectionId === connectionId;
  };

  return (
    <div className="w-64 border-r border-border bg-card">
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Connections</h2>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsModalOpen(true)}
            className="h-8 w-8 p-0"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="space-y-2">
          {connections.map((connection) => (
            <div
              key={connection.id}
              className={cn(
                'flex items-center justify-between p-3 rounded-md cursor-pointer transition-colors',
                isConnected(connection.id)
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-accent/50 opacity-70'
              )}
              onClick={() => isConnected(connection.id) ? setActiveConnection(connection.id) : null}
            >
              <div className="flex items-center space-x-2">
                <Server className={cn("h-4 w-4", isConnected(connection.id) ? "text-green-500" : "text-gray-400")} />
                <div>
                  <p className="text-sm font-medium">{connection.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {connection.host}:{connection.port}
                  </p>
                  {!isConnected(connection.id) && (
                    <p className="text-xs text-orange-500">Disconnected</p>
                  )}
                </div>
              </div>
              
              <div className="flex items-center space-x-1">
                {!isConnected(connection.id) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => handleReconnect(connection, e)}
                    className="h-8 w-8 p-0"
                    disabled={reconnectingId === connection.id}
                  >
                    <RefreshCw className={cn("h-4 w-4", reconnectingId === connection.id && "animate-spin")} />
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => handleDelete(connection.id, e)}
                  className="h-8 w-8 p-0"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <ConnectionModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
};