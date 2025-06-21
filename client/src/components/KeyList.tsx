import React, { useState, useEffect } from 'react';
import { Search, Trash2, RefreshCw, CheckSquare, Square, Plus, Upload, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { useStore } from '../store/useStore';
import { keysApi } from '../services/api';
import { RedisKey } from '../types';
import toast from 'react-hot-toast';
import { NewKeyModal } from './NewKeyModal';
import { BulkImportModal } from './BulkImportModal';
import { buildKeyTree, getExpandedPaths, KeyTreeNode } from '../utils/keyTree';
import { KeyTreeNodeComponent } from './KeyTreeNode';
import { exportSingleKey, copyToClipboard, ExportedKey } from '../utils/exportUtils';

interface KeyListProps {
  onKeySelect: (key: string) => void;
  onKeySelectForEdit?: (key: string) => void;
  onKeyDeleted?: (key: string) => void;
}

export const KeyList: React.FC<KeyListProps> = ({ onKeySelect, onKeySelectForEdit, onKeyDeleted }) => {
  const { activeConnectionId, selectedKeys, toggleKeySelection, selectAllKeys, clearSelection, showConnectionsPanel, toggleConnectionsPanel, setActiveConnection } = useStore();
  const [keys, setKeys] = useState<RedisKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchPattern, setSearchPattern] = useState('*');
  const [cursor, setCursor] = useState('0');
  const [hasMore, setHasMore] = useState(false);
  const [isNewKeyModalOpen, setIsNewKeyModalOpen] = useState(false);
  const [isBulkImportModalOpen, setIsBulkImportModalOpen] = useState(false);
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
      
      // Notify parent about deleted keys
      keysToDelete.forEach(key => onKeyDeleted?.(key));
      
      clearSelection();
      fetchKeys(searchPattern, '0');
    } catch (error) {
      console.error('Failed to delete keys:', error);
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

  const handleImportComplete = () => {
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
      
      // Notify parent about deleted key
      onKeyDeleted?.(key);
      
      fetchKeys(searchPattern, '0');
    } catch (error) {
      toast.error('Failed to delete key');
      console.error('Delete key error:', error);
    }
  };

  const handleDeleteAllKeys = async (pattern: string) => {
    if (!activeConnectionId) return;
    
    // First, get all keys matching the pattern to show count in confirmation
    try {
      const { data } = await keysApi.getAll(activeConnectionId, pattern, '0', 1000);
      const keysToDelete = data.keys.map(k => k.key);
      
      if (keysToDelete.length === 0) {
        toast.info('No keys found matching the pattern');
        return;
      }
      
      const confirmed = confirm(
        `Are you sure you want to delete ${keysToDelete.length} key(s) matching pattern "${pattern}"?\n\n` +
        `This action cannot be undone.\n\n` +
        `Keys to be deleted:\n${keysToDelete.slice(0, 10).join('\n')}` +
        (keysToDelete.length > 10 ? `\n... and ${keysToDelete.length - 10} more` : '')
      );
      
      if (!confirmed) return;
      
      await keysApi.deleteKeys(activeConnectionId, keysToDelete);
      toast.success(`Deleted ${keysToDelete.length} keys matching pattern: ${pattern}`);
      
      // Notify parent about deleted keys
      keysToDelete.forEach(key => onKeyDeleted?.(key));
      
      fetchKeys(searchPattern, '0');
    } catch (error) {
      toast.error('Failed to delete keys');
      console.error('Delete all keys error:', error);
    }
  };

  // Helper function to get all expandable node IDs recursively
  const getAllExpandableNodeIds = (nodes: KeyTreeNode[]): string[] => {
    const expandableIds: string[] = [];
    
    const traverse = (node: KeyTreeNode) => {
      if (!node.isKey && node.children.length > 0) {
        expandableIds.push(node.id);
      }
      node.children.forEach(traverse);
    };
    
    nodes.forEach(traverse);
    return expandableIds;
  };

  const handleExpandAll = () => {
    const allExpandableIds = getAllExpandableNodeIds(keyTree);
    if (allExpandableIds.length === 0) {
      toast.info('No groups to expand');
      return;
    }
    setExpandedNodes(new Set(allExpandableIds));
    toast.success(`Expanded ${allExpandableIds.length} groups`);
  };

  const handleCollapseAll = () => {
    if (expandedNodes.size === 0) {
      toast.info('No groups to collapse');
      return;
    }
    setExpandedNodes(new Set());
    toast.success('Collapsed all groups');
  };

  // Helper function to get all subgroup IDs recursively within a specific group
  const getAllSubgroupIds = (node: KeyTreeNode): string[] => {
    const subgroupIds: string[] = [];
    
    const traverse = (currentNode: KeyTreeNode) => {
      if (!currentNode.isKey && currentNode.children.length > 0) {
        subgroupIds.push(currentNode.id);
      }
      currentNode.children.forEach(traverse);
    };
    
    // Include the node itself if it's a group
    if (!node.isKey && node.children.length > 0) {
      subgroupIds.push(node.id);
    }
    
    // Then traverse all children
    node.children.forEach(traverse);
    
    return subgroupIds;
  };

  const handleExpandGroup = (nodeId: string) => {
    // Find the node in the tree
    const findNode = (nodes: KeyTreeNode[], targetId: string): KeyTreeNode | null => {
      for (const node of nodes) {
        if (node.id === targetId) {
          return node;
        }
        const found = findNode(node.children, targetId);
        if (found) return found;
      }
      return null;
    };

    const targetNode = findNode(keyTree, nodeId);
    if (!targetNode) {
      toast.error('Group not found');
      return;
    }

    const subgroupIds = getAllSubgroupIds(targetNode);
    if (subgroupIds.length === 0) {
      toast.info('No subgroups to expand');
      return;
    }

    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      subgroupIds.forEach(id => newSet.add(id));
      return newSet;
    });

    toast.success(`Expanded ${subgroupIds.length} groups in "${targetNode.name}"`);
  };

  const handleCollapseGroup = (nodeId: string) => {
    // Find the node in the tree
    const findNode = (nodes: KeyTreeNode[], targetId: string): KeyTreeNode | null => {
      for (const node of nodes) {
        if (node.id === targetId) {
          return node;
        }
        const found = findNode(node.children, targetId);
        if (found) return found;
      }
      return null;
    };

    const targetNode = findNode(keyTree, nodeId);
    if (!targetNode) {
      toast.error('Group not found');
      return;
    }

    const subgroupIds = getAllSubgroupIds(targetNode);
    if (subgroupIds.length === 0) {
      toast.info('No subgroups to collapse');
      return;
    }

    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      subgroupIds.forEach(id => newSet.delete(id));
      return newSet;
    });

    toast.success(`Collapsed ${subgroupIds.length} groups in "${targetNode.name}"`);
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
    <div className="h-full flex flex-col">
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
            variant="secondary"
            onClick={() => setIsBulkImportModalOpen(true)}
          >
            <Upload className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => setIsNewKeyModalOpen(true)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </form>
        
        <div className="space-y-2">
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
          
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {(() => {
                const allExpandableIds = getAllExpandableNodeIds(keyTree);
                const isAllExpanded = allExpandableIds.length > 0 && allExpandableIds.every(id => expandedNodes.has(id));
                const hasExpandableGroups = allExpandableIds.length > 0;
                
                if (!hasExpandableGroups) {
                  return (
                    <span className="text-sm text-muted-foreground">No groups to expand</span>
                  );
                }
                
                return (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={isAllExpanded ? handleCollapseAll : handleExpandAll}
                      className="h-8"
                    >
                      {isAllExpanded ? (
                        <ChevronDown className="h-4 w-4 mr-2" />
                      ) : (
                        <ChevronRight className="h-4 w-4 mr-2" />
                      )}
                      {isAllExpanded ? 'Collapse All' : 'Expand All'}
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      {expandedNodes.size > 0 && `${expandedNodes.size} of ${allExpandableIds.length} groups expanded`}
                    </span>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex-1 overflow-auto">
        {(() => {
          if (loading && keys.length === 0) {
            return <div className="p-4 text-center text-muted-foreground">Loading...</div>;
          }
          if (keys.length === 0) {
            return <div className="p-4 text-center text-muted-foreground">No keys found</div>;
          }
          return (
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
                  selectedKey={selectedKey ?? undefined}
                  onExportKey={handleExportKey}
                  onExportGroup={handleExportGroup}
                  onCopyKeyName={handleCopyKeyName}
                  onCopyValue={handleCopyValue}
                  onEditKey={handleEditKey}
                  onDeleteKey={handleDeleteKey}
                  onDeleteAllKeys={handleDeleteAllKeys}
                  onExpandGroup={handleExpandGroup}
                  onCollapseGroup={handleCollapseGroup}
                />
              ))}
            </div>
          );
        })()}
        
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
        <>
          <NewKeyModal
            isOpen={isNewKeyModalOpen}
            onClose={() => setIsNewKeyModalOpen(false)}
            connectionId={activeConnectionId}
            onKeyCreated={handleKeyCreated}
          />
          <BulkImportModal
            isOpen={isBulkImportModalOpen}
            onClose={() => setIsBulkImportModalOpen(false)}
            onImportComplete={handleImportComplete}
          />
        </>
      )}
    </div>
  );
};