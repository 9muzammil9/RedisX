import React from 'react';
import { 
  Download, 
  Copy, 
  Edit, 
  Trash2, 
  FileDown, 
  Clipboard,
  FolderDown 
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
  onExportKey?: (key: string) => void;
  onExportGroup?: (pattern: string) => void;
  onCopyKeyName?: (keyName: string) => void;
  onCopyValue?: (key: string) => void;
  onEditKey?: (key: string) => void;
  onDeleteKey?: (key: string) => void;
}

export const KeyContextMenu: React.FC<KeyContextMenuProps> = ({
  children,
  node,
  onExportKey,
  onExportGroup,
  onCopyKeyName,
  onCopyValue,
  onEditKey,
  onDeleteKey,
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
            <ContextMenuItem onClick={handleExportGroup} icon={<FolderDown />}>
              Export All Keys in Group
            </ContextMenuItem>
            
            <ContextMenuItem onClick={handleCopyKeyName} icon={<Copy />}>
              Copy Pattern ({node.name}:*)
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