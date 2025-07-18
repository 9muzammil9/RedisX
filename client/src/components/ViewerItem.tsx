import { ChevronDown, ChevronRight, Edit2, Tag } from 'lucide-react';
import React from 'react';
import { JsonView } from 'react-json-view-lite';
import { Button } from './ui/Button';
import { Checkbox } from './ui/Checkbox';

interface ViewerItemProps {
  itemKey: string | number;
  value: any;
  isArray: boolean;
  isZset?: boolean;
  isSelected: boolean;
  isExpanded: boolean;
  hasTreeView: boolean;
  theme: string;
  onToggleSelection: (key: string | number) => void;
  onEdit: (index?: number, key?: string) => void;
  onToggleExpansion: (itemId: string) => void;
  onKeyRename?: (key: string) => void;
  getItemId: (index?: number, key?: string) => string;
  getTreeViewData: (value: any) => any;
  formatDisplayValue: (value: any) => string;
  onCheckboxShiftMultiSelect?: (itemKey: string | number, index: number, event: React.MouseEvent) => void;
  onCheckboxToggle?: (itemKey: string | number, index: number) => void;
  itemIndex?: number;
}

const getItemDisplayName = (isArray: boolean, isZset: boolean, index?: number, key?: string): string => {
  if (isArray) {
    return `[${index}]`;
  }
  if (isZset) {
    return `[${index}]`;
  }
  return key || '';
};

const getAriaLabel = (isArray: boolean, isZset: boolean, index?: number, key?: string): string => {
  const itemName = getItemDisplayName(isArray, isZset, index, key);
  return `Item ${itemName} - double click to edit`;
};

const getContainerClassName = (isSelected: boolean): string => {
  const baseClass = 'group flex items-start space-x-3 p-3 border border-border rounded-md hover:bg-accent/50 cursor-pointer bg-transparent text-left w-full';
  return isSelected ? `${baseClass} bg-accent` : baseClass;
};

export const ViewerItem: React.FC<ViewerItemProps> = ({
  itemKey,
  value,
  isArray,
  isZset = false,
  isSelected,
  isExpanded,
  hasTreeView,
  theme,
  onToggleSelection,
  onEdit,
  onToggleExpansion,
  onKeyRename,
  getItemId,
  getTreeViewData,
  formatDisplayValue,
  onCheckboxShiftMultiSelect,
  onCheckboxToggle,
  itemIndex,
}) => {
  const index = isArray || isZset ? (itemKey as number) : undefined;
  const key = isArray || isZset ? undefined : (itemKey as string);
  const itemId = getItemId(index, key);

  return (
    <button
      type="button"
      className={getContainerClassName(isSelected)}
      onDoubleClick={() => onEdit(index, key)}
      aria-label={getAriaLabel(isArray, isZset, index, key)}
    >
      <div style={{ position: 'relative' }}>
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => {
            if (onCheckboxToggle && itemIndex !== undefined) {
              onCheckboxToggle(itemKey, itemIndex);
            } else {
              onToggleSelection(itemKey);
            }
          }}
          onClick={(e) => {
            e.stopPropagation();
            
            // Handle shift multi-select for checkbox clicks
            if (e.shiftKey && onCheckboxShiftMultiSelect && itemIndex !== undefined) {
              e.preventDefault();
              onCheckboxShiftMultiSelect(itemKey, itemIndex, e as any);
            }
          }}
          className="mt-1"
        />
      </div>
      <div className="flex-1 min-w-0">
        <div
          className={
            isArray || isZset
              ? 'text-sm font-medium text-purple-600 dark:text-purple-400'
              : 'flex items-center space-x-2'
          }
        >
          {(() => {
            if (isArray) {
              return getItemDisplayName(isArray, isZset, index, key);
            }
            if (isZset) {
              return (
                <div className="flex items-center space-x-2">
                  <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                    Score: {value?.score || 0}
                  </span>
                  <span>{getItemDisplayName(isArray, isZset, index, key)}</span>
                </div>
              );
            }
            return (
            <>
              <div className="text-sm font-medium text-blue-600 dark:text-blue-400">
                {key}
              </div>
              {onKeyRename && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onKeyRename(key as string);
                  }}
                  className="h-9 w-9 p-0"
                  title="Rename key"
                >
                  <Tag className="h-6 w-6 text-blue-600" />
                </Button>
              )}
            </>
            );
          })()}
        </div>
        <div className="text-sm text-foreground mt-1 break-words">
          {(() => {
            if (hasTreeView && isExpanded) {
              const themeClass = theme === 'dark' ? 'dark-theme' : 'light-theme';
              const themeStyle = {
                backgroundColor: 'transparent',
                color: theme === 'dark' ? '#e5e7eb' : '#000000',
              };
              
              return (
                <div
                  className={`json-tree-container ${themeClass} text-xs`}
                  style={themeStyle}
                >
                  <JsonView data={getTreeViewData(value)} />
                </div>
              );
            }
            
            if (hasTreeView && !isExpanded) {
              const treeData = getTreeViewData(value);
              const description = Array.isArray(treeData)
                ? `Array (${treeData.length} items)`
                : `Object (${Object.keys(treeData || {}).length} keys)`;
                
              return (
                <div className="text-muted-foreground text-xs italic">
                  {description}
                </div>
              );
            }
            
            return (
              <pre className="whitespace-pre-wrap font-mono text-xs">
                {isZset ? value?.member || '' : formatDisplayValue(value)}
              </pre>
            );
          })()}
        </div>
      </div>
      <div className="flex items-center space-x-1">
        {hasTreeView && (
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onToggleExpansion(itemId);
            }}
            className="h-10 w-10 p-0"
          >
            {isExpanded ? (
              <ChevronDown className="h-6 w-6" />
            ) : (
              <ChevronRight className="h-6 w-6" />
            )}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onEdit(index, key);
          }}
          className="opacity-0 group-hover:opacity-100 h-10 w-10 p-0"
        >
          <Edit2 className="h-6 w-6" />
        </Button>
      </div>
    </button>
  );
};
