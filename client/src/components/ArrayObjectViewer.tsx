import React, { useState } from 'react';
import { Plus, Trash2, CheckSquare, Square, Expand, Minimize2 } from 'lucide-react';
import { Button } from './ui/Button';
import { ItemEditor } from './ItemEditor';
import { KeyEditModal } from './KeyEditModal';
import { ViewerItem } from './ViewerItem';
import { useStore } from '../store/useStore';

// Type definitions for better type safety
type RedisValue = string | number | boolean | object | null;
type ListData = RedisValue[];
type HashData = Record<string, RedisValue>;
type ZsetData = Array<{ member: string; score: number }>;
type RedisData = ListData | HashData | ZsetData;

interface EditingItem {
  index?: number;
  key?: string;
  value: RedisValue;
  isNew?: boolean;
}

interface EditingKey {
  key: string;
  index?: number;
}

interface ArrayObjectViewerProps {
  data: RedisData;
  type: 'list' | 'hash' | 'zset';
  onUpdate: (newData: RedisData) => void;
}

export const ArrayObjectViewer: React.FC<ArrayObjectViewerProps> = ({
  data,
  type,
  onUpdate,
}) => {
  const { theme, expandedValueItems, toggleValueItemExpansion, expandAllValueItems, collapseAllValueItems } = useStore();
  const [editingItem, setEditingItem] = useState<EditingItem | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string | number>>(new Set());
  const [editingKey, setEditingKey] = useState<EditingKey | null>(null);

  const isArray = type === 'list';
  const isZset = type === 'zset';
  const items = isArray || isZset ? (Array.isArray(data) ? data : []) : (data || {});
  const itemKeys = isArray || isZset ? Array.from({ length: items.length }, (_, i) => i) : Object.keys(items);

  // Generate unique item IDs for expand/collapse state
  const getItemId = (index?: number, key?: string): string => {
    if (isArray) return `list-${index}`;
    if (isZset) return `zset-${index}`;
    return `hash-${key}`;
  };

  const allItemIds = itemKeys.map(key => getItemId((isArray || isZset) ? key as number : undefined, (isArray || isZset) ? undefined : key as string));
  const allExpanded = allItemIds.every(id => expandedValueItems.has(id));
  // anyExpanded is used for conditional UI logic
  const hasExpandedItems = allItemIds.some(id => expandedValueItems.has(id));

  const detectValueType = (value: RedisValue): 'string' | 'number' | 'boolean' | 'object' => {
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'object' && value !== null) return 'object';
    return 'string';
  };

  const tryParseJSON = (value: string): any => {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  };

  const shouldUseTreeView = (value: any): boolean => {
    if (typeof value === 'object' && value !== null) {
      return true;
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return typeof parsed === 'object' && parsed !== null;
      } catch {
        return false;
      }
    }
    return false;
  };

  const getTreeViewData = (value: any): any => {
    if (typeof value === 'object' && value !== null) {
      return value;
    }
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  };

  const formatDisplayValue = (value: any): string => {
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  };

  const handleEdit = (index?: number, key?: string) => {
    const value = (isArray || isZset) ? items[index!] : items[key!];
    setEditingItem({
      index,
      key,
      value: tryParseJSON(value),
      isNew: false,
    });
  };

  const handleAdd = () => {
    setEditingItem({
      value: isArray ? '' : isZset ? { score: 0, member: '' } : {},
      isNew: true,
    });
  };

  // Helper functions to reduce complexity
  const updateArrayOrZsetData = (newValue: RedisValue): RedisData => {
    const updatedData = [...(items as RedisValue[])];
    if (editingItem?.isNew) {
      updatedData.push(newValue);
    } else if (editingItem?.index !== undefined) {
      updatedData[editingItem.index] = newValue;
    }
    return updatedData;
  };

  const updateHashData = (newValue: RedisValue, newKey?: string): HashData => {
    const updatedData = { ...(items as HashData) };
    const finalKey = editingItem?.isNew ? newKey : editingItem?.key;

    if (!finalKey) return updatedData;

    // If editing an existing item and key changed, remove old key
    if (!editingItem?.isNew && editingItem?.key && editingItem.key !== finalKey) {
      delete updatedData[editingItem.key];
    }

    updatedData[finalKey] = newValue;
    return updatedData;
  };

  const handleSave = (newValue: RedisValue, newKey?: string) => {
    if (!editingItem) return;

    const updatedData = (isArray || isZset)
      ? updateArrayOrZsetData(newValue)
      : updateHashData(newValue, newKey);

    onUpdate(updatedData);
    setEditingItem(null);
  };

  const handleDelete = () => {
    if (!editingItem) return;

    let updatedData;

    if ((isArray || isZset) && editingItem.index !== undefined) {
      updatedData = items.filter((_: any, i: number) => i !== editingItem.index);
    } else if (!isArray && !isZset && editingItem.key) {
      updatedData = { ...items };
      delete updatedData[editingItem.key];
    } else {
      return;
    }

    onUpdate(updatedData);
    setEditingItem(null);
  };

  const toggleItemSelection = (itemKey: string | number) => {
    const newSelection = new Set(selectedItems);
    const keyStr = String(itemKey);
    if (newSelection.has(keyStr)) {
      newSelection.delete(keyStr);
    } else {
      newSelection.add(keyStr);
    }
    setSelectedItems(newSelection);
  };

  const selectAllItems = () => {
    if (selectedItems.size === itemKeys.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(itemKeys.map(key => String(key))));
    }
  };

  const handleBulkDelete = () => {
    if (selectedItems.size === 0) return;

    let updatedData: any;

    if (isArray || isZset) {
      // For arrays and zsets, filter out selected indices
      const selectedIndices = Array.from(selectedItems).map(item => Number(item));
      updatedData = items.filter((_: any, index: number) => !selectedIndices.includes(index));
    } else {
      // For objects, filter out selected keys
      const selectedKeys = Array.from(selectedItems);
      updatedData = { ...items };
      selectedKeys.forEach(key => {
        delete updatedData[key];
      });
    }

    onUpdate(updatedData);
    setSelectedItems(new Set());
  };

  const handleKeyRename = (newKey: string) => {
    if (!editingKey || !newKey.trim()) return;

    let updatedData;

    if (isArray || isZset) {
      // For arrays and zsets, we can't really rename indices, but this shouldn't happen
      return;
    } else {
      // For objects/hashes, rename the key
      updatedData = { ...items };
      const value = updatedData[editingKey.key];
      delete updatedData[editingKey.key];
      updatedData[newKey] = value;
    }

    onUpdate(updatedData);
    setEditingKey(null);
  };

  // Helper function to get container description
  const getContainerDescription = (): string => {
    if (isArray) {
      return `List (${items.length} items)`;
    }
    if (isZset) {
      return `Sorted Set (${items.length} members)`;
    }
    return `Hash (${Object.keys(items as HashData).length} fields)`;
  };

  const getTitle = (): string => {
    if (editingItem?.isNew) {
      const itemType = isArray ? 'Item' : isZset ? 'Member' : 'Field';
      return `Add New ${itemType}`;
    }
    if (isArray) {
      return `Edit Item [${editingItem?.index}]`;
    }
    if (isZset) {
      return `Edit Member [${editingItem?.index}]`;
    }
    return `Edit Field "${editingItem?.key}"`;
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center space-x-4">
          <h4 className="text-sm font-medium text-muted-foreground">
            {getContainerDescription()}
          </h4>
          {selectedItems.size > 0 && (
            <span className="text-sm text-muted-foreground">
              {selectedItems.size} selected
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {itemKeys.length > 0 && (
            <>
              {selectedItems.size > 0 && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleBulkDelete}
                  className="!bg-red-600 hover:!bg-red-700 !text-white"
                  style={{
                    backgroundColor: '#dc2626 !important',
                    color: 'white !important'
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete Selected
                </Button>
              )}

              <Button
                size="sm"
                variant="ghost"
                onClick={selectAllItems}
                className="h-8"
              >
                {selectedItems.size === itemKeys.length && itemKeys.length > 0 ? (
                  <CheckSquare className="h-4 w-4 mr-1" />
                ) : (
                  <Square className="h-4 w-4 mr-1" />
                )}
                {selectedItems.size === itemKeys.length ? 'Deselect All' : 'Select All'}
              </Button>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (allExpanded) {
                    collapseAllValueItems();
                  } else {
                    expandAllValueItems(allItemIds);
                  }
                }}
                className="h-8"
              >
                {allExpanded ? (
                  <Minimize2 className="h-4 w-4 mr-1" />
                ) : (
                  <Expand className="h-4 w-4 mr-1" />
                )}
                {allExpanded ? 'Collapse All' : 'Expand All'}
              </Button>
            </>
          )}

          <Button size="sm" variant="ghost" onClick={handleAdd}>
            <Plus className="h-4 w-4 mr-1" />
            Add {isArray ? 'Item' : isZset ? 'Member' : 'Field'}
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-auto">
        {isArray || isZset ? (
          items.map((item: any, index: number) => {
            const itemId = getItemId(index);
            const isExpanded = expandedValueItems.has(itemId);
            const hasTreeView = shouldUseTreeView(item);

            return (
              <ViewerItem
                key={index}
                itemKey={index}
                value={item}
                isArray={true}
                isZset={isZset}
                isSelected={selectedItems.has(String(index))}
                isExpanded={isExpanded}
                hasTreeView={hasTreeView}
                theme={theme}
                onToggleSelection={toggleItemSelection}
                onEdit={handleEdit}
                onToggleExpansion={toggleValueItemExpansion}
                getItemId={getItemId}
                getTreeViewData={getTreeViewData}
                formatDisplayValue={formatDisplayValue}
              />
            );
          })
        ) : (
          Object.entries(items).map(([key, value]) => {
            const itemId = getItemId(undefined, key);
            const isExpanded = expandedValueItems.has(itemId);
            const hasTreeView = shouldUseTreeView(value);

            return (
              <ViewerItem
                key={key}
                itemKey={key}
                value={value}
                isArray={false}
                isSelected={selectedItems.has(key)}
                isExpanded={isExpanded}
                hasTreeView={hasTreeView}
                theme={theme}
                onToggleSelection={toggleItemSelection}
                onEdit={handleEdit}
                onToggleExpansion={toggleValueItemExpansion}
                onKeyRename={(key: string) => setEditingKey({ key })}
                getItemId={getItemId}
                getTreeViewData={getTreeViewData}
                formatDisplayValue={formatDisplayValue}
              />
            );
          })
        )}
      </div>

      {editingItem && (
        <ItemEditor
          isOpen={true}
          onClose={() => setEditingItem(null)}
          onSave={handleSave}
          onDelete={!editingItem.isNew ? handleDelete : undefined}
          title={getTitle()}
          initialValue={editingItem.value}
          initialKey={editingItem.key}
          valueType={detectValueType(editingItem.value)}
          isKeyEditable={!isArray && editingItem.isNew}
        />
      )}

      {editingKey && (
        <KeyEditModal
          isOpen={true}
          onClose={() => setEditingKey(null)}
          onSave={handleKeyRename}
          currentKey={editingKey.key}
          title="Rename Key"
        />
      )}
    </div>
  );
};