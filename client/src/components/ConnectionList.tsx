import { HardDrive, Plus, RefreshCw, Server, Trash2 } from 'lucide-react';
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { connectionsApi } from '../services/api';
import { useStore } from '../store/useStore';
import { cn } from '../utils/cn';
import { ConfirmationModal } from './ConfirmationModal';
import { ConnectionModal } from './ConnectionModal';
import { Button } from './ui/Button';

export const ConnectionList: React.FC = () => {
  const {
    connections,
    activeConnectionId,
    setActiveConnection,
    removeConnection,
    refreshActiveConnection,
  } = useStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState<any>(null);
  const [reconnectingId, setReconnectingId] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    connectionId: string | null;
    connectionName: string | null;
  }>({
    isOpen: false,
    connectionId: null,
    connectionName: null,
  });

  const handleEditClick = (connection: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingConnection(connection);
    setIsModalOpen(true);
  };

  const handleDeleteClick = (connection: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirmation({
      isOpen: true,
      connectionId: connection.id,
      connectionName: connection.name,
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmation.connectionId) { return; }

    try {
      await connectionsApi.delete(deleteConfirmation.connectionId);
      removeConnection(deleteConfirmation.connectionId);
      toast.success('Connection deleted');
    } catch (error) {
      toast.error('Failed to delete connection');
    }
  };

  const handleReconnect = async (connection: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setReconnectingId(connection.id);

    try {
      // Try to reconnect with stored connection data including password and original ID
      const connectionData = {
        id: connection.id, // Preserve the original ID
        name: connection.name,
        host: connection.host,
        port: connection.port,
        password: connection.password, // Use stored password
        db: connection.db,
        username: connection.username,
        tls: connection.tls,
      };

      const { data } = await connectionsApi.create(connectionData);

      // Since we preserve the connection ID, the connection should have the same ID
      // Reconnected successfully with preserved ID

      // Since the connection ID is preserved, just refresh the active connection state
      setActiveConnection(data.id, true); // Force reload to refresh UI state

      // Verify the connection is working by testing it
      setTimeout(async () => {
        await testConnection(data.id);
        // Connection test completed
      }, 1000);

      toast.success(`Reconnected to ${connection.name}`);
    } catch (error: any) {
      // Check if it's a local instance connection
      if (connection.name.startsWith('Local -')) {
        toast.error(
          'Local instance is not running. Please start it from the Local Instances tab.',
        );
      } else if (
        error.response?.data?.message?.includes('NOAUTH') ||
        error.message?.includes('NOAUTH')
      ) {
        toast.error(
          `Authentication required for ${connection.name}. Please re-enter password.`,
        );
      } else {
        toast.error(
          `Reconnection failed for ${connection.name}. Please check connection details.`,
        );
      }
      // Only open modal for non-local instance connections
      if (!connection.name.startsWith('Local -')) {
        setIsModalOpen(true);
      }
    } finally {
      setReconnectingId(null);
    }
  };

  // Check if a connection is currently connected to the server
  const isConnected = (connectionId: string) => {
    return activeConnectionId === connectionId;
  };

  // Test if a connection is actually valid by trying to get connection info
  const testConnection = async (connectionId: string): Promise<boolean> => {
    try {
      await connectionsApi.getInfo(connectionId);
      return true;
    } catch (error) {
      return false;
    }
  };

  return (
    <div className="w-64 border-r border-border bg-card">
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Connections</h2>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setEditingConnection(null);
              setIsModalOpen(true);
            }}
            className="h-10 w-10 p-0"
          >
            <Plus className="h-6 w-6" />
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
                  : 'hover:bg-accent/50 opacity-70',
              )}
              onClick={() => {
                if (isConnected(connection.id)) {
                  // Force reload subscriptions and messages when clicking on active connection
                  refreshActiveConnection();
                } else {
                  // Try to reconnect if clicking on a disconnected connection
                  handleReconnect(connection, {
                    stopPropagation: () => {},
                  } as React.MouseEvent);
                }
              }}
            >
              <div className="flex items-center space-x-2">
                {connection.name.startsWith('Local -') ? (
                  <span title="Local instance">
                    <HardDrive
                      className={cn(
                        'h-4 w-4',
                        isConnected(connection.id)
                          ? 'text-green-500'
                          : 'text-gray-400',
                      )}
                    />
                  </span>
                ) : (
                  <span title="Edit connection">
                    <Server
                      className={cn(
                        'h-4 w-4 cursor-pointer hover:opacity-70',
                        isConnected(connection.id)
                          ? 'text-green-500'
                          : 'text-gray-400',
                      )}
                      onClick={(e) => handleEditClick(connection, e)}
                    />
                  </span>
                )}
                <div>
                  <p className="text-sm font-medium">{connection.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {connection.host}:{connection.port}
                  </p>
                  {!isConnected(connection.id) && (
                    <p className="text-xs text-orange-500">
                      {connection.name.startsWith('Local -')
                        ? 'Instance stopped'
                        : 'Disconnected'}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => handleReconnect(connection, e)}
                  className="h-10 w-10 p-0"
                  disabled={reconnectingId === connection.id}
                  title={
                    isConnected(connection.id)
                      ? 'Refresh connection'
                      : 'Reconnect'
                  }
                >
                  <RefreshCw
                    className={cn(
                      'h-5 w-5',
                      reconnectingId === connection.id && 'animate-spin',
                    )}
                  />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => handleDeleteClick(connection, e)}
                  className="h-10 w-10 p-0"
                >
                  <Trash2 className="h-5 w-5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <ConnectionModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingConnection(null);
        }}
        editingConnection={editingConnection}
      />

      <ConfirmationModal
        isOpen={deleteConfirmation.isOpen}
        onClose={() =>
          setDeleteConfirmation({
            isOpen: false,
            connectionId: null,
            connectionName: null,
          })
        }
        onConfirm={handleConfirmDelete}
        title="Delete Connection"
        message={`Are you sure you want to delete the connection "${deleteConfirmation.connectionName}"? This action cannot be undone.`}
        confirmText="Delete"
        isDestructive={true}
      />
    </div>
  );
};
