import React from 'react';
import { 
  Download, 
  Copy, 
  Edit, 
  Trash2, 
  FileDown, 
  Clipboard,
  FolderDown,
  FolderX,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from './ui/ContextMenu';
import { RedisKey } from '../types';
import { KeyTreeNode } from '../utils/keyTree';

interface KeyContextMenuProps {
  children: React.ReactNode;
  node: KeyTreeNode;
  isExpanded?: boolean;
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

export const KeyContextMenu: React.FC<KeyContextMenuProps> = ({
  children,
  node,
  isExpanded,
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
  const isKey = node.isKey && node.keyData;
  const isGroup = !node.isKey && node.children.length > 0;

  const handleExportKey = () => {
    if (isKey && onExportKey) {
      onExportKey(node.keyData!.key);
    }
  };

  const handleExportGroup = () => {
    if (isGroup && onExportGroup) {
      // Create pattern from node path (e.g., "user:profile" -> "user:profile:*")
      const pattern = `${node.name}:*`;
      onExportGroup(pattern);
    }
  };

  const handleCopyKeyName = () => {
    if (isKey && onCopyKeyName) {
      onCopyKeyName(node.keyData!.key);
    }
  };

  const handleCopyValue = () => {
    if (isKey && onCopyValue) {
      onCopyValue(node.keyData!.key);
    }
  };

  const handleEditKey = () => {
    if (isKey && onEditKey) {
      onEditKey(node.keyData!.key);
    }
  };

  const handleDeleteKey = () => {
    if (isKey && onDeleteKey) {
      onDeleteKey(node.keyData!.key);
    }
  };

  const handleDeleteAllKeys = () => {
    if (isGroup && onDeleteAllKeys) {
      // Create pattern from node's full path (e.g., "user:profile" -> "user:profile:*")
      const pattern = `${node.fullPath}:*`;
      onDeleteAllKeys(pattern);
    }
  };

  const handleExpandGroup = () => {
    if (isGroup && onExpandGroup) {
      onExpandGroup(node.id);
    }
  };

  const handleCollapseGroup = () => {
    if (isGroup && onCollapseGroup) {
      onCollapseGroup(node.id);
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      
      <ContextMenuContent className="w-56">
        {isKey && (
          <>
            <ContextMenuItem onClick={handleExportKey} icon={<Download />}>
              Export This Key
            </ContextMenuItem>
            
            <ContextMenuSeparator />
            
            <ContextMenuItem onClick={handleCopyKeyName} icon={<Copy />}>
              Copy Key Name
            </ContextMenuItem>
            
            <ContextMenuItem onClick={handleCopyValue} icon={<Clipboard />}>
              Copy Value
            </ContextMenuItem>
            
            <ContextMenuSeparator />
            
            <ContextMenuItem onClick={handleEditKey} icon={<Edit />}>
              Edit Key
            </ContextMenuItem>
            
            <ContextMenuItem 
              onClick={handleDeleteKey} 
              icon={<Trash2 />}
              className="text-destructive focus:text-destructive"
            >
              Delete Key
            </ContextMenuItem>
          </>
        )}
        
        {isGroup && (
          <>
            {isExpanded ? (
              <ContextMenuItem onClick={handleCollapseGroup} icon={<ChevronUp />}>
                Collapse Group
              </ContextMenuItem>
            ) : (
              <ContextMenuItem onClick={handleExpandGroup} icon={<ChevronDown />}>
                Expand Group
              </ContextMenuItem>
            )}
            
            <ContextMenuSeparator />
            
            <ContextMenuItem onClick={handleExportGroup} icon={<FolderDown />}>
              Export All Keys in Group
            </ContextMenuItem>
            
            <ContextMenuItem onClick={handleCopyKeyName} icon={<Copy />}>
              Copy Pattern ({node.name}:*)
            </ContextMenuItem>
            
            <ContextMenuSeparator />
            
            <ContextMenuItem 
              onClick={handleDeleteAllKeys} 
              icon={<FolderX />}
              className="text-destructive focus:text-destructive"
            >
              Delete All Keys in Group
            </ContextMenuItem>
          </>
        )}
        
        {!isKey && !isGroup && (
          <ContextMenuItem disabled>
            No actions available
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
};