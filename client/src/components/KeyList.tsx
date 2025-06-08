import React, { useState, useEffect } from 'react';
import { Search, Trash2, RefreshCw, CheckSquare, Square, Plus } from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { useStore } from '../store/useStore';
import { keysApi } from '../services/api';
import { RedisKey } from '../types';
import toast from 'react-hot-toast';
import { NewKeyModal } from './NewKeyModal';
import { buildKeyTree, getExpandedPaths, KeyTreeNode } from '../utils/keyTree';
import { KeyTreeNodeComponent } from './KeyTreeNode';
import { exportSingleKey, copyToClipboard, ExportedKey } from '../utils/exportUtils';

interface KeyListProps {
  onKeySelect: (key: string) => void;
  onKeySelectForEdit?: (key: string) => void;
}

export const KeyList: React.FC<KeyListProps> = ({ onKeySelect, onKeySelectForEdit }) => {
  const { activeConnectionId, selectedKeys, toggleKeySelection, selectAllKeys, clearSelection, showConnectionsPanel, toggleConnectionsPanel, setActiveConnection } = useStore();
  const [keys, setKeys] = useState<RedisKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchPattern, setSearchPattern] = useState('*');
  const [cursor, setCursor] = useState('0');
  const [hasMore, setHasMore] = useState(false);
  const [isNewKeyModalOpen, setIsNewKeyModalOpen] = useState(false);
  const [keyTree, setKeyTree] = useState<KeyTreeNode[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const fetchKeys = async (pattern = '*', newCursor = '0') => {
    if (!activeConnectionId) return;

    setLoading(true);
    try {
      const { data } = await keysApi.getAll(activeConnectionId, pattern, newCursor);
      let updatedKeys: RedisKey[];
      if (newCursor === '0') {
        updatedKeys = data.keys;
        setKeys(data.keys);
      } else {
        updatedKeys = [...keys, ...data.keys];
        setKeys(updatedKeys);
      }
      setCursor(data.nextCursor);
      setHasMore(data.nextCursor !== '0');
      
      // Build tree structure
      const tree = buildKeyTree(updatedKeys);
      setKeyTree(tree);
      
      // Auto-expand paths for selected keys
      const autoExpandPaths = getExpandedPaths(selectedKeys, tree);
      setExpandedNodes(new Set([...expandedNodes, ...autoExpandPaths]));
    } catch (error: any) {
      // Check if it's a connection error (likely because server restarted)
      if (error.response?.status === 404 || error.response?.status === 400) {
        toast.error('Connection lost. Please reconnect using the refresh button in the connections panel.');
        // Clear the active connection since it's no longer valid
        setActiveConnection(null);
      } else {
        toast.error('Failed to fetch keys');
      }
      console.error('Error fetching keys:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeConnectionId) {
      fetchKeys();
      clearSelection();
    }
  }, [activeConnectionId]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCursor('0');
    fetchKeys(searchPattern, '0');
  };

  const handleDeleteSelected = async () => {
    if (!activeConnectionId || selectedKeys.size === 0) return;

    try {
      const keysToDelete = Array.from(selectedKeys);
      await keysApi.deleteKeys(activeConnectionId, keysToDelete);
      toast.success(`Deleted ${keysToDelete.length} keys`);
      clearSelection();
      fetchKeys(searchPattern, '0');
    } catch (error) {
      toast.error('Failed to delete keys');
    }
  };

  const handleSelectAll = () => {
    if (selectedKeys.size === keys.length) {
      clearSelection();
    } else {
      selectAllKeys(keys.map((k) => k.key));
    }
  };

  const handleKeyCreated = () => {
    fetchKeys(searchPattern, '0');
  };

  const handleToggleExpanded = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  const handleKeySelect = (key: string) => {
    setSelectedKey(key);
    onKeySelect(key);
  };

  const handleExportKey = async (key: string) => {
    if (!activeConnectionId) return;
    
    try {
      const { data } = await keysApi.getValue(activeConnectionId, key);
      const keyData = keys.find(k => k.key === key);
      if (!keyData) return;
      
      const exportData: ExportedKey = {
        key: keyData.key,
        value: data.value,
        type: keyData.type,
        ttl: keyData.ttl,
        timestamp: new Date().toISOString(),
      };
      
      exportSingleKey(exportData);
      toast.success(`Exported key: ${key}`);
    } catch (error) {
      toast.error('Failed to export key');
      console.error('Export error:', error);
    }
  };

  const handleExportGroup = async (pattern: string) => {
    if (!activeConnectionId) return;
    
    try {
      const { data } = await keysApi.getAll(activeConnectionId, pattern);
      const keysToExport = data.keys.slice(0, 100); // Limit to 100 keys
      
      if (keysToExport.length === 0) {
        toast.error('No keys found matching pattern');
        return;
      }
      
      // Get values for all keys
      const exportPromises = keysToExport.map(async (keyData) => {
        try {
          const { data: valueData } = await keysApi.getValue(activeConnectionId, keyData.key);
          return {
            key: keyData.key,
            value: valueData.value,
            type: keyData.type,
            ttl: keyData.ttl,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          console.error(`Failed to get value for key ${keyData.key}:`, error);
          return null;
        }
      });
      
      const exportedKeys = (await Promise.all(exportPromises)).filter(Boolean) as ExportedKey[];
      
      if (exportedKeys.length > 0) {
        const { exportMultipleKeys } = await import('../utils/exportUtils');
        exportMultipleKeys(exportedKeys, `redis-keys-${pattern.replace(/[^a-zA-Z0-9]/g, '_')}`);
        toast.success(`Exported ${exportedKeys.length} keys`);
      }
    } catch (error) {
      toast.error('Failed to export group');
      console.error('Export group error:', error);
    }
  };

  const handleCopyKeyName = async (keyName: string) => {
    const success = await copyToClipboard(keyName);
    if (success) {
      toast.success('Key name copied to clipboard');
    } else {
      toast.error('Failed to copy key name');
    }
  };

  const handleCopyValue = async (key: string) => {
    if (!activeConnectionId) return;
    
    try {
      const { data } = await keysApi.getValue(activeConnectionId, key);
      const valueStr = typeof data.value === 'string' 
        ? data.value 
        : JSON.stringify(data.value, null, 2);
      
      const success = await copyToClipboard(valueStr);
      if (success) {
        toast.success('Value copied to clipboard');
      } else {
        toast.error('Failed to copy value');
      }
    } catch (error) {
      toast.error('Failed to get key value');
      console.error('Copy value error:', error);
    }
  };

  const handleEditKey = (key: string) => {
    if (onKeySelectForEdit) {
      onKeySelectForEdit(key);
      toast.success('Key opened in edit mode');
    } else {
      handleKeySelect(key);
      toast.success('Key selected for editing');
    }
  };

  const handleDeleteKey = async (key: string) => {
    if (!activeConnectionId) return;
    
    try {
      await keysApi.deleteKeys(activeConnectionId, [key]);
      toast.success(`Deleted key: ${key}`);
      fetchKeys(searchPattern, '0');
    } catch (error) {
      toast.error('Failed to delete key');
      console.error('Delete key error:', error);
    }
  };

  if (!activeConnectionId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-4">
        <div className="text-center">
          <p className="mb-2">No connection selected</p>
          {!showConnectionsPanel && (
            <Button
              size="sm"
              variant="secondary"
              onClick={toggleConnectionsPanel}
            >
              Show Connections Panel
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="p-4 border-b border-border">
        <form onSubmit={handleSearch} className="flex space-x-2 mb-3">
          <Input
            placeholder="Search pattern (e.g., user:*)"
            value={searchPattern}
            onChange={(e) => setSearchPattern(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" disabled={loading}>
            <Search className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => fetchKeys(searchPattern, '0')}
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => setIsNewKeyModalOpen(true)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </form>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleSelectAll}
              className="h-8"
            >
              {selectedKeys.size === keys.length && keys.length > 0 ? (
                <CheckSquare className="h-4 w-4 mr-2" />
              ) : (
                <Square className="h-4 w-4 mr-2" />
              )}
              Select All
            </Button>
            <span className="text-sm text-muted-foreground">
              {selectedKeys.size > 0 && `${selectedKeys.size} selected`}
            </span>
          </div>
          
          {selectedKeys.size > 0 && (
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDeleteSelected}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Selected
            </Button>
          )}
        </div>
      </div>
      
      <div className="flex-1 overflow-auto">
        {loading && keys.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">Loading...</div>
        ) : keys.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">No keys found</div>
        ) : (
          <div>
            {keyTree.map((node) => (
              <KeyTreeNodeComponent
                key={node.id}
                node={node}
                expandedNodes={expandedNodes}
                selectedKeys={selectedKeys}
                onToggleExpanded={handleToggleExpanded}
                onToggleSelected={toggleKeySelection}
                onKeySelect={handleKeySelect}
                selectedKey={selectedKey || undefined}
                onExportKey={handleExportKey}
                onExportGroup={handleExportGroup}
                onCopyKeyName={handleCopyKeyName}
                onCopyValue={handleCopyValue}
                onEditKey={handleEditKey}
                onDeleteKey={handleDeleteKey}
              />
            ))}
          </div>
        )}
        
        {hasMore && (
          <div className="p-4 text-center">
            <Button
              variant="secondary"
              onClick={() => fetchKeys(searchPattern, cursor)}
              disabled={loading}
            >
              Load More
            </Button>
          </div>
        )}
      </div>
      
      {activeConnectionId && (
        <NewKeyModal
          isOpen={isNewKeyModalOpen}
          onClose={() => setIsNewKeyModalOpen(false)}
          connectionId={activeConnectionId}
          onKeyCreated={handleKeyCreated}
        />
      )}
    </div>
  );
};