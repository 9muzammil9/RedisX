import React from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, Key } from 'lucide-react';
import { Checkbox } from './ui/Checkbox';
import { KeyTreeNode } from '../utils/keyTree';
import { KeyContextMenu } from './KeyContextMenu';
import { cn } from '../utils/cn';

interface KeyTreeNodeProps {
  node: KeyTreeNode;
  expandedNodes: Set<string>;
  selectedKeys: Set<string>;
  onToggleExpanded: (nodeId: string) => void;
  onToggleSelected: (key: string) => void;
  onKeySelect: (key: string) => void;
  selectedKey?: string;
  onExportKey?: (key: string) => void;
  onExportGroup?: (pattern: string) => void;
  onCopyKeyName?: (keyName: string) => void;
  onCopyValue?: (key: string) => void;
  onEditKey?: (key: string) => void;
  onDeleteKey?: (key: string) => void;
  onDeleteAllKeys?: (pattern: string) => void;
  onExpandGroup?: (nodeId: string) => void;
  onCollapseGroup?: (nodeId: string) => void;
}

// Helper functions to count keys and groups recursively
const countTotalKeys = (node: KeyTreeNode): number => {
  let count = 0;
  
  if (node.isKey) {
    count = 1;
  }
  
  // Recursively count keys in children
  node.children.forEach(child => {
    count += countTotalKeys(child);
  });
  
  return count;
};

const countSubgroups = (node: KeyTreeNode): number => {
  let count = 0;
  
  node.children.forEach(child => {
    if (!child.isKey && child.children.length > 0) {
      count += 1;
      count += countSubgroups(child);
    }
  });
  
  return count;
};

const countDirectSubgroups = (node: KeyTreeNode): number => {
  return node.children.filter(child => !child.isKey && child.children.length > 0).length;
};

export const KeyTreeNodeComponent: React.FC<KeyTreeNodeProps> = ({
  node,
  expandedNodes,
  selectedKeys,
  onToggleExpanded,
  onToggleSelected,
  onKeySelect,
  selectedKey,
  onExportKey,
  onExportGroup,
  onCopyKeyName,
  onCopyValue,
  onEditKey,
  onDeleteKey,
  onDeleteAllKeys,
  onExpandGroup,
  onCollapseGroup,
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

  const isCurrentlySelected = node.isKey && node.keyData && selectedKey === node.keyData.key;

  // Extract nested ternary operations
  const buttonAriaLabel = `Select key ${node.name}`;
  const groupAriaLabel = `${isExpanded ? 'Collapse' : 'Expand'} group ${node.name}`;
  const ariaLabel = node.isKey ? buttonAriaLabel : groupAriaLabel;
  
  // Extract icon logic to avoid nested ternary
  const getIconComponent = () => {
    if (node.isKey) {
      return <Key className="h-4 w-4 text-blue-500" />;
    }
    if (hasChildren && isExpanded) {
      return <FolderOpen className="h-4 w-4 text-yellow-500" />;
    }
    if (hasChildren) {
      return <Folder className="h-4 w-4 text-yellow-500" />;
    }
    return null;
  };

  // Helper function to get all keys within a group recursively
  const getAllKeysInGroup = (node: KeyTreeNode): string[] => {
    const keys: string[] = [];
    
    if (node.isKey && node.keyData) {
      keys.push(node.keyData.key);
    }
    
    node.children.forEach(child => {
      keys.push(...getAllKeysInGroup(child));
    });
    
    return keys;
  };

  // Check if all keys in this group are selected
  const allKeysInGroup = !node.isKey ? getAllKeysInGroup(node) : [];
  const isGroupPartiallySelected = allKeysInGroup.length > 0 && allKeysInGroup.some(key => selectedKeys.has(key));
  const isGroupFullySelected = allKeysInGroup.length > 0 && allKeysInGroup.every(key => selectedKeys.has(key));

  const handleGroupCheckboxChange = (checked: boolean) => {
    if (!node.isKey) {
      const keysInGroup = getAllKeysInGroup(node);
      keysInGroup.forEach(key => {
        const isCurrentlySelected = selectedKeys.has(key);
        if (checked !== isCurrentlySelected) {
          onToggleSelected(key);
        }
      });
    }
  };

  // Extract checkbox checked state logic
  const getCheckboxState = () => {
    if (node.isKey) {
      return isSelected;
    }
    if (isGroupPartiallySelected && !isGroupFullySelected) {
      return 'indeterminate';
    }
    return isGroupFullySelected;
  };

  const renderContent = () => (
    <>
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

      {/* Checkbox for keys and groups */}
      {(node.isKey && node.keyData) || (!node.isKey && allKeysInGroup.length > 0) ? (
        <div className="mr-3 flex-shrink-0">
          <Checkbox
            checked={getCheckboxState()}
            onCheckedChange={(checked) => {
              if (node.isKey && node.keyData) {
                console.log('Checkbox onCheckedChange called for key:', node.keyData?.key, 'checked:', checked);
                onToggleSelected(node.keyData.key);
              } else {
                console.log('Checkbox onCheckedChange called for group:', node.name, 'checked:', checked);
                // For groups: if indeterminate or unchecked, select all; if checked, unselect all
                const shouldSelect = checked === true || checked === 'indeterminate';
                handleGroupCheckboxChange(shouldSelect);
              }
            }}
            onClick={(e) => {
              e.stopPropagation();
              console.log('Checkbox onClick called for:', node.isKey ? `key ${node.keyData?.key}` : `group ${node.name}`);
            }}
          />
        </div>
      ) : null}

      {/* Icon */}
      <div className="mr-2 flex-shrink-0">
        {getIconComponent()}
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
            {(() => {
              const totalKeys = countTotalKeys(node);
              const directSubgroups = countDirectSubgroups(node);
              
              const keysText = totalKeys === 1 ? 'key' : 'keys';
              const groupsText = directSubgroups === 1 ? 'group' : 'groups';
              
              if (directSubgroups > 0) {
                // Group has subgroups - show both keys and groups
                return `${totalKeys} ${keysText}, ${directSubgroups} ${groupsText}`;
              } else {
                // Group has no subgroups - show only keys
                return `${totalKeys} ${keysText}`;
              }
            })()}
          </p>
        )}
      </div>
    </>
  );

  return (
    <>
      <KeyContextMenu
        node={node}
        isExpanded={isExpanded}
        onExportKey={onExportKey}
        onExportGroup={onExportGroup}
        onCopyKeyName={onCopyKeyName}
        onCopyValue={onCopyValue}
        onEditKey={onEditKey}
        onDeleteKey={onDeleteKey}
        onDeleteAllKeys={onDeleteAllKeys}
        onExpandGroup={onExpandGroup}
        onCollapseGroup={onCollapseGroup}
      >
        {node.isKey || hasChildren ? (
          <button
            type="button"
            className={cn(
              'w-full flex items-center py-2 hover:bg-accent/50 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 text-left bg-transparent border-0',
              isCurrentlySelected && 'bg-accent',
              isSelected && 'bg-accent/30'
            )}
            style={{ paddingLeft }}
            onClick={handleClick}
            aria-label={ariaLabel}
            aria-expanded={node.isKey ? undefined : isExpanded}
          >
            {renderContent()}
          </button>
        ) : (
          <div
            className="flex items-center py-2"
            style={{ paddingLeft }}
          >
            {renderContent()}
          </div>
        )}
      </KeyContextMenu>

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
              selectedKey={selectedKey ?? undefined}
              onExportKey={onExportKey}
              onExportGroup={onExportGroup}
              onCopyKeyName={onCopyKeyName}
              onCopyValue={onCopyValue}
              onEditKey={onEditKey}
              onDeleteKey={onDeleteKey}
              onDeleteAllKeys={onDeleteAllKeys}
              onExpandGroup={onExpandGroup}
              onCollapseGroup={onCollapseGroup}
            />
          ))}
        </div>
      )}
    </>
  );
};