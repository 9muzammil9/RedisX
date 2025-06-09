import React from 'react';
import { Edit2, ChevronRight, ChevronDown, Tag } from 'lucide-react';
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
}

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
}) => {
  const index = (isArray || isZset) ? itemKey as number : undefined;
  const key = (isArray || isZset) ? undefined : itemKey as string;
  const itemId = getItemId(index, key);

  return (
    <div
      className={`group flex items-start space-x-3 p-3 border border-border rounded-md hover:bg-accent/50 cursor-pointer bg-transparent ${
        isSelected ? 'bg-accent' : ''
      }`}
      onDoubleClick={() => onEdit(index, key)}
    >
      <div style={{ position: 'relative', zIndex: 10 }}>
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelection(itemKey)}
          onClick={(e) => e.stopPropagation()}
          className="mt-1"
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className={(isArray || isZset) ? "text-sm font-medium text-purple-600 dark:text-purple-400" : "flex items-center space-x-2"}>
          {isArray ? (
            `[${index}]`
          ) : isZset ? (
            <div className="flex items-center space-x-2">
              <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                Score: {value?.score || 0}
              </span>
              <span>`[${index}]`</span>
            </div>
          ) : (
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
          )}
        </div>
        <div className="text-sm text-foreground mt-1 break-words">
          {hasTreeView && isExpanded ? (
            <div 
              className={`json-tree-container ${theme === 'dark' ? 'dark-theme' : 'light-theme'} text-xs`}
              style={theme === 'dark' ? {
                backgroundColor: 'transparent',
                color: '#ffffff'
              } : {}}
            >
              <JsonView 
                data={getTreeViewData(value)} 
              />
            </div>
          ) : hasTreeView && !isExpanded ? (
            <div className="text-muted-foreground text-xs italic">
              {Array.isArray(getTreeViewData(value)) 
                ? `Array (${getTreeViewData(value).length} items)` 
                : `Object (${Object.keys(getTreeViewData(value) || {}).length} keys)`
              }
            </div>
          ) : (
            <pre className="whitespace-pre-wrap font-mono text-xs">
              {isZset ? (value?.member || '') : formatDisplayValue(value)}
            </pre>
          )}
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
    </div>
  );
};