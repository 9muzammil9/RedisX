import React from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, Key } from 'lucide-react';
import { Checkbox } from './ui/Checkbox';
import { KeyTreeNode } from '../utils/keyTree';
import { cn } from '../utils/cn';

interface KeyTreeNodeProps {
  node: KeyTreeNode;
  expandedNodes: Set<string>;
  selectedKeys: Set<string>;
  onToggleExpanded: (nodeId: string) => void;
  onToggleSelected: (key: string) => void;
  onKeySelect: (key: string) => void;
  selectedKey?: string;
}

export const KeyTreeNodeComponent: React.FC<KeyTreeNodeProps> = ({
  node,
  expandedNodes,
  selectedKeys,
  onToggleExpanded,
  onToggleSelected,
  onKeySelect,
  selectedKey,
}) => {
  const hasChildren = node.children.length > 0;
  const paddingLeft = node.level * 16 + 8; // 16px per level + 8px base padding
  const isExpanded = expandedNodes.has(node.id);
  const isSelected = node.isKey && node.keyData && selectedKeys.has(node.keyData.key);
  
  const handleClick = () => {
    if (node.isKey && node.keyData) {
      onKeySelect(node.keyData.key);
    } else if (hasChildren) {
      onToggleExpanded(node.id);
    }
  };

  const handleToggleExpanded = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleExpanded(node.id);
  };

  const handleCheckboxChange = () => {
    if (node.isKey && node.keyData) {
      onToggleSelected(node.keyData.key);
    }
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleCheckboxChange();
  };

  const isCurrentlySelected = node.isKey && node.keyData && selectedKey === node.keyData.key;

  return (
    <>
      <div
        className={cn(
          'flex items-center py-2 hover:bg-accent/50 cursor-pointer transition-colors',
          isCurrentlySelected && 'bg-accent',
          isSelected && 'bg-accent/30'
        )}
        style={{ paddingLeft }}
        onClick={handleClick}
      >
        {/* Expand/Collapse Icon */}
        <div className="w-4 h-4 mr-2 flex-shrink-0">
          {hasChildren && (
            <button
              onClick={handleToggleExpanded}
              className="w-4 h-4 flex items-center justify-center hover:bg-accent rounded-sm"
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </button>
          )}
        </div>

        {/* Checkbox for keys */}
        {node.isKey && node.keyData && (
          <div onClick={handleCheckboxClick} className="mr-3 flex-shrink-0">
            <Checkbox
              checked={isSelected}
              onCheckedChange={handleCheckboxChange}
            />
          </div>
        )}

        {/* Icon */}
        <div className="mr-2 flex-shrink-0">
          {node.isKey ? (
            <Key className="h-4 w-4 text-blue-500" />
          ) : hasChildren ? (
            isExpanded ? (
              <FolderOpen className="h-4 w-4 text-yellow-500" />
            ) : (
              <Folder className="h-4 w-4 text-yellow-500" />
            )
          ) : null}
        </div>

        {/* Name and details */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{node.name}</p>
          {node.isKey && node.keyData && (
            <div className="flex items-center space-x-4 text-xs text-muted-foreground">
              <span className="capitalize">{node.keyData.type}</span>
              <span>TTL: {node.keyData.ttl === -1 ? 'No expiry' : `${node.keyData.ttl}s`}</span>
            </div>
          )}
          {!node.isKey && hasChildren && (
            <p className="text-xs text-muted-foreground">
              {node.children.filter(child => child.isKey).length} keys
            </p>
          )}
        </div>
      </div>

      {/* Render children if expanded */}
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <KeyTreeNodeComponent
              key={child.id}
              node={child}
              expandedNodes={expandedNodes}
              selectedKeys={selectedKeys}
              onToggleExpanded={onToggleExpanded}
              onToggleSelected={onToggleSelected}
              onKeySelect={onKeySelect}
              selectedKey={selectedKey}
            />
          ))}
        </div>
      )}
    </>
  );
};