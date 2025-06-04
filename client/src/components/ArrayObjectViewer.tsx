import React, { useState } from 'react';
import { Plus, Edit2, Trash2, CheckSquare, Square } from 'lucide-react';
import { JsonView } from 'react-json-view-lite';
import { Button } from './ui/Button';
import { Checkbox } from './ui/Checkbox';
import { ItemEditor } from './ItemEditor';
import { useStore } from '../store/useStore';

interface ArrayObjectViewerProps {
  data: any;
  type: 'list' | 'hash';
  onUpdate: (newData: any) => void;
}

export const ArrayObjectViewer: React.FC<ArrayObjectViewerProps> = ({
  data,
  type,
  onUpdate,
}) => {
  const { theme } = useStore();
  const [editingItem, setEditingItem] = useState<{
    index?: number;
    key?: string;
    value: any;
    isNew?: boolean;
  } | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string | number>>(new Set());

  const isArray = type === 'list';
  const items = isArray ? (Array.isArray(data) ? data : []) : (data || {});
  const itemKeys = isArray ? Array.from({ length: items.length }, (_, i) => i) : Object.keys(items);

  const detectValueType = (value: any): 'string' | 'number' | 'boolean' | 'object' => {
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
    const value = isArray ? items[index!] : items[key!];
    setEditingItem({
      index,
      key,
      value: tryParseJSON(value),
      isNew: false,
    });
  };

  const handleAdd = () => {
    setEditingItem({
      value: isArray ? '' : {},
      isNew: true,
    });
  };

  const handleSave = (newValue: any, newKey?: string) => {
    if (!editingItem) return;

    let updatedData;

    if (isArray) {
      updatedData = [...items];
      if (editingItem.isNew) {
        updatedData.push(newValue);
      } else if (editingItem.index !== undefined) {
        updatedData[editingItem.index] = newValue;
      }
    } else {
      updatedData = { ...items };
      const finalKey = editingItem.isNew ? newKey : editingItem.key;
      
      if (!finalKey) return;
      
      // If editing an existing item and key changed, remove old key
      if (!editingItem.isNew && editingItem.key && editingItem.key !== finalKey) {
        delete updatedData[editingItem.key];
      }
      
      updatedData[finalKey] = newValue;
    }

    onUpdate(updatedData);
    setEditingItem(null);
  };

  const handleDelete = () => {
    if (!editingItem) return;

    let updatedData;

    if (isArray && editingItem.index !== undefined) {
      updatedData = items.filter((_: any, i: number) => i !== editingItem.index);
    } else if (!isArray && editingItem.key) {
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
    if (newSelection.has(itemKey)) {
      newSelection.delete(itemKey);
    } else {
      newSelection.add(itemKey);
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

    if (isArray) {
      // For arrays, filter out selected indices
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

  const getTitle = (): string => {
    if (editingItem?.isNew) {
      return `Add New ${isArray ? 'Item' : 'Field'}`;
    }
    if (isArray) {
      return `Edit Item [${editingItem?.index}]`;
    }
    return `Edit Field "${editingItem?.key}"`;
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center space-x-4">
          <h4 className="text-sm font-medium text-muted-foreground">
            {isArray ? `Array (${items.length} items)` : `Object (${Object.keys(items).length} fields)`}
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
              
              {selectedItems.size > 0 && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleBulkDelete}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete Selected
                </Button>
              )}
            </>
          )}
          
          <Button size="sm" variant="ghost" onClick={handleAdd}>
            <Plus className="h-4 w-4 mr-1" />
            Add {isArray ? 'Item' : 'Field'}
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-auto">
        {isArray ? (
          items.map((item: any, index: number) => (
            <div
              key={index}
              className={`group flex items-start space-x-3 p-3 border border-border rounded-md hover:bg-accent/50 cursor-pointer bg-card ${
                selectedItems.has(String(index)) ? 'bg-accent' : ''
              }`}
              onDoubleClick={() => handleEdit(index)}
            >
              <Checkbox
                checked={selectedItems.has(String(index))}
                onCheckedChange={() => toggleItemSelection(String(index))}
                onClick={(e) => e.stopPropagation()}
                className="mt-1"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-purple-600 dark:text-purple-400">
                  [{index}]
                </div>
                <div className="text-sm text-foreground mt-1 break-words">
                  {shouldUseTreeView(item) ? (
                    <div className={`json-tree-container ${theme === 'dark' ? 'dark-theme' : 'light-theme'} text-xs`}>
                      <JsonView
                        data={getTreeViewData(item)}
                      />
                    </div>
                  ) : (
                    <pre className="whitespace-pre-wrap font-mono text-xs">
                      {formatDisplayValue(item)}
                    </pre>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  handleEdit(index);
                }}
                className="opacity-0 group-hover:opacity-100 ml-2"
              >
                <Edit2 className="h-4 w-4" />
              </Button>
            </div>
          ))
        ) : (
          Object.entries(items).map(([key, value]) => (
            <div
              key={key}
              className={`group flex items-start space-x-3 p-3 border border-border rounded-md hover:bg-accent/50 cursor-pointer bg-card ${
                selectedItems.has(key) ? 'bg-accent' : ''
              }`}
              onDoubleClick={() => handleEdit(undefined, key)}
            >
              <Checkbox
                checked={selectedItems.has(key)}
                onCheckedChange={() => toggleItemSelection(key)}
                onClick={(e) => e.stopPropagation()}
                className="mt-1"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-blue-600 dark:text-blue-400">
                  {key}
                </div>
                <div className="text-sm text-foreground mt-1 break-words">
                  {shouldUseTreeView(value) ? (
                    <div className={`json-tree-container ${theme === 'dark' ? 'dark-theme' : 'light-theme'} text-xs`}>
                      <JsonView
                        data={getTreeViewData(value)}
                      />
                    </div>
                  ) : (
                    <pre className="whitespace-pre-wrap font-mono text-xs">
                      {formatDisplayValue(value)}
                    </pre>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  handleEdit(undefined, key);
                }}
                className="opacity-0 group-hover:opacity-100 ml-2"
              >
                <Edit2 className="h-4 w-4" />
              </Button>
            </div>
          ))
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
    </div>
  );
};