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

interface KeyListProps {
  onKeySelect: (key: string) => void;
}

export const KeyList: React.FC<KeyListProps> = ({ onKeySelect }) => {
  const { activeConnectionId, selectedKeys, toggleKeySelection, selectAllKeys, clearSelection, showConnectionsPanel, toggleConnectionsPanel } = useStore();
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
    } catch (error) {
      toast.error('Failed to fetch keys');
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