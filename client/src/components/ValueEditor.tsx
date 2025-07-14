import {
  Clock,
  Code,
  Eye,
  List,
  Maximize2,
  Minimize2,
  Pencil,
  Save,
  X,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { JsonView } from 'react-json-view-lite';
import 'react-json-view-lite/dist/index.css';
import { keysApi } from '../services/api';
import { useStore } from '../store/useStore';
import { RedisValue } from '../types';
import { ArrayObjectViewer } from './ArrayObjectViewer';
import { KeyEditModal } from './KeyEditModal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

interface ValueEditorProps {
  selectedKey: string | null;
  forceEditMode?: boolean;
  onForceEditModeUsed?: () => void;
  refreshTrigger?: number;
}

type ViewMode = 'raw' | 'json' | 'formatted' | 'editor';

export const ValueEditor: React.FC<ValueEditorProps> = ({
  selectedKey,
  forceEditMode,
  onForceEditModeUsed,
  refreshTrigger,
}) => {
  const { activeConnectionId, theme } = useStore();
  const [value, setValue] = useState<RedisValue | null>(null);
  const [editedValue, setEditedValue] = useState<string>('');
  const [ttl, setTtl] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('formatted');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [editingKey, setEditingKey] = useState(false);
  const jsonViewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedKey && activeConnectionId) {
      fetchValue(true); // Reset view mode when key changes
    }
  }, [selectedKey, activeConnectionId, refreshTrigger]);

  // Handle force edit mode
  useEffect(() => {
    if (forceEditMode && value) {
      setIsEditing(true);
      onForceEditModeUsed?.();
    }
  }, [forceEditMode, value, onForceEditModeUsed]);

  // Apply theme styles directly to JSON view elements
  useEffect(() => {
    const applyThemeStyles = () => {
      // Target everything possible
      const allElements = document.querySelectorAll('*');
      allElements.forEach((element: any) => {
        // Check if element is inside a json-tree-container but exclude checkboxes and buttons
        const isInsideJsonContainer = element.closest('.json-tree-container');
        const isCheckboxOrChild =
          element.closest('[role="checkbox"]') ||
          element.hasAttribute('data-state') ||
          element.getAttribute('role') === 'checkbox' ||
          element.parentElement?.getAttribute('role') === 'checkbox';
        const isButton =
          element.tagName === 'BUTTON' || element.closest('button');
        const isInsideModal =
          element.closest('.fixed.inset-0') ||
          element.closest('[role="dialog"]') ||
          element.closest('.z-50');

        if (
          isInsideJsonContainer &&
          !isCheckboxOrChild &&
          !isButton &&
          !isInsideModal
        ) {
          if (theme === 'dark') {
            element.style.setProperty(
              'background-color',
              'transparent',
              'important',
            );
            element.style.setProperty('color', '#ffffff', 'important');
            element.style.setProperty('background', 'transparent', 'important');
            element.style.setProperty('fill', '#ffffff', 'important');
            element.style.setProperty('stroke', '#ffffff', 'important');
          } else {
            // Light mode - force transparent background like dark mode
            element.style.setProperty(
              'background-color',
              'transparent',
              'important',
            );
            element.style.setProperty('background', 'transparent', 'important');
            element.style.setProperty(
              'color',
              'hsl(var(--foreground))',
              'important',
            );
            element.style.setProperty(
              'fill',
              'hsl(var(--foreground))',
              'important',
            );
            element.style.setProperty(
              'stroke',
              'hsl(var(--foreground))',
              'important',
            );
          }
        }
      });
    };

    // Apply immediately and repeatedly
    applyThemeStyles();
    const interval = setInterval(applyThemeStyles, 100);

    // Also use MutationObserver to catch any new elements
    const observer = new MutationObserver(() => {
      applyThemeStyles();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });

    return () => {
      clearInterval(interval);
      observer.disconnect();
    };
  }, [theme, value, viewMode]);

  const selectInitialViewMode = (data: any) => {
    if (data.type === 'list') {
      return 'editor';
    }
    if (data.type === 'hash') {
      return shouldUseJsonView(data.value, data.type) ? 'json' : 'editor';
    }
    if (data.type === 'zset') {
      return 'editor';
    }
    return shouldUseJsonView(data.value, data.type) ? 'json' : 'formatted';
  };

  const handleFetchError = (error: any) => {
    if (
      error.response?.status === 404 ||
      error.message?.includes('not found')
    ) {
      setValue(null);
      toast.error(`Key "${selectedKey}" not found`);
    } else {
      toast.error('Failed to fetch value');
    }
  };

  const fetchValue = async (resetViewMode = true) => {
    if (!selectedKey || !activeConnectionId) { return; }

    setLoading(true);
    try {
      const { data } = await keysApi.getValue(activeConnectionId, selectedKey);
      setValue(data);
      setEditedValue(formatValueForEdit(data.value, data.type));
      setTtl(data.ttl === -1 ? '' : data.ttl.toString());

      // Only reset isEditing when we're doing a full reset (new key selected)
      if (resetViewMode) {
        setIsEditing(false);
      }

      // Only auto-select view mode on initial load or when explicitly requested
      if (resetViewMode) {
        setViewMode(selectInitialViewMode(data));
      }
    } catch (error: any) {
      handleFetchError(error);
    } finally {
      setLoading(false);
    }
  };

  const shouldUseJsonView = (val: any, type: string): boolean => {
    if (type === 'string') {
      try {
        const parsed = JSON.parse(val);
        return typeof parsed === 'object' && parsed !== null;
      } catch {
        return false;
      }
    }
    if (type === 'list' && Array.isArray(val)) {
      return (
        val.length > 5 ||
        val.some((item) => {
          try {
            return typeof JSON.parse(item) === 'object';
          } catch {
            return false;
          }
        })
      );
    }
    if (type === 'hash' && typeof val === 'object') {
      return Object.keys(val).length > 5;
    }
    return false;
  };

  const parseValueForJsonView = (val: any, type: string): any => {
    switch (type) {
      case 'string':
        try {
          return JSON.parse(val);
        } catch {
          return val;
        }
      case 'list':
        if (Array.isArray(val)) {
          const result: any = {};
          val.forEach((item, index) => {
            try {
              result[`[${index}]`] = JSON.parse(item);
            } catch {
              result[`[${index}]`] = item;
            }
          });
          return result;
        }
        return val;
      case 'hash':
        if (typeof val === 'object') {
          const result: any = {};
          for (const [key, value] of Object.entries(val)) {
            try {
              result[key] = JSON.parse(value as string);
            } catch {
              result[key] = value;
            }
          }
          return result;
        }
        return val;
      default:
        return val;
    }
  };

  const formatValueForEdit = (val: any, type: string): string => {
    switch (type) {
      case 'string':
        return val || '';
      case 'list':
      case 'set':
        return Array.isArray(val) ? val.join('\n') : '';
      case 'hash':
        return Object.entries(val || {})
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n');
      default:
        return JSON.stringify(val, null, 2);
    }
  };

  const parseEditedValue = (val: string, type: string): any => {
    switch (type) {
      case 'string':
        return val;
      case 'list':
      case 'set':
        return val.split('\n').filter((line) => line.trim());
      case 'hash': {
        const hash: Record<string, string> = {};
        val.split('\n').forEach((line) => {
          const [key, ...valueParts] = line.split(':');
          if (key && valueParts.length) {
            hash[key.trim()] = valueParts.join(':').trim();
          }
        });
        return hash;
      }
      default:
        return val;
    }
  };

  const handleSave = async () => {
    if (!value || !activeConnectionId) { return; }

    try {
      const parsedValue = parseEditedValue(editedValue, value.type);
      const parsedTtl = ttl ? parseInt(ttl) : undefined;

      await keysApi.setValue(
        activeConnectionId,
        value.key,
        parsedValue,
        value.type,
        parsedTtl,
      );

      toast.success('Value updated successfully');
      setIsEditing(false);
      fetchValue(false); // Don't reset view mode after saving
    } catch (error) {
      console.error('Failed to update value:', error);
      toast.error('Failed to update value');
    }
  };

  const handleArrayObjectUpdate = async (newData: any) => {
    if (!value || !activeConnectionId) { return; }

    try {
      await keysApi.setValue(
        activeConnectionId,
        value.key,
        newData,
        value.type,
        value.ttl > 0 ? value.ttl : undefined,
      );

      toast.success('Value updated successfully');
      fetchValue(false); // Refresh the data without resetting view mode
    } catch (error) {
      console.error('Failed to update array/object value:', error);
      toast.error('Failed to update value');
    }
  };

  const handleKeyRename = async (newKey: string) => {
    if (!value || !activeConnectionId || !newKey.trim() || newKey === value.key){
      return;
    }

    try {
      // First, get the current value and TTL
      const currentData = value;

      // Create the new key with the same value and TTL
      await keysApi.setValue(
        activeConnectionId,
        newKey,
        currentData.value,
        currentData.type,
        currentData.ttl > 0 ? currentData.ttl : undefined,
      );

      // Delete the old key
      await keysApi.deleteKeys(activeConnectionId, [value.key]);

      toast.success(`Key renamed from "${value.key}" to "${newKey}"`);
      setEditingKey(false);

      // Refresh the key list and navigate to the new key
      window.location.reload(); // This will refresh the entire app to update the key list
    } catch (error) {
      console.error('Failed to rename key:', error);
      toast.error('Failed to rename key');
    }
  };

  const getValueSize = (val: any, type: string): string => {
    const str = formatValueForDisplay(val, type);
    const bytes = new Blob([str]).size;
    if (bytes < 1024) { return `${bytes} B`; }
    if (bytes < 1024 * 1024) { return `${(bytes / 1024).toFixed(1)} KB`; }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const truncateKey = (key: string, maxLength: number = 30): string => {
    if (key.length <= maxLength) { return key; }
    return key.substring(0, maxLength) + '...';
  };

  if (!selectedKey || !activeConnectionId) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Select a key to view its value
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!value) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
        <p className="text-lg mb-2">Key not found</p>
        <p className="text-sm">The key "{selectedKey}" no longer exists</p>
      </div>
    );
  }

  const jsonData = parseValueForJsonView(value.value, value.type);
  const canShowJson = shouldUseJsonView(value.value, value.type);
  const canShowEditor =
    value.type === 'list' || value.type === 'hash' || value.type === 'zset';

  // Helper functions to avoid nested ternary operations
  const getBackgroundColor = () => {
    return theme === 'dark' ? 'bg-muted/30' : 'bg-background';
  };

  const getJsonThemeClass = () => {
    return theme === 'dark' ? 'dark-theme' : 'light-theme';
  };

  const getJsonThemeStyle = () => {
    return theme === 'dark'
      ? {
          backgroundColor: 'transparent',
          color: '#ffffff',
        }
      : {};
  };

  return (
    <div
      className={`flex flex-col ${isFullscreen ? 'fixed inset-0 z-50 bg-background' : 'flex-1'} min-h-0`}
    >
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2">
              <h3
                className="font-semibold truncate flex-shrink min-w-0"
                title={value.key}
                style={{ maxWidth: 'calc(100% - 200px)' }}
              >
                {truncateKey(value.key)}
              </h3>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded flex-shrink-0">
                View: {viewMode}
              </span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setEditingKey(true)}
                className="h-10 w-10 p-0 flex-shrink-0"
                title={`Rename key: ${value.key}`}
              >
                <Pencil className="h-6 w-6" />
              </Button>
            </div>
            <div className="flex items-center space-x-4 text-sm text-muted-foreground">
              <span>Type: {value.type}</span>
              <span>Size: {getValueSize(value.value, value.type)}</span>
              {Array.isArray(value.value) && (
                <span>Items: {value.value.length}</span>
              )}
              {typeof value.value === 'object' &&
                value.value &&
                !Array.isArray(value.value) && (
                  <span>Fields: {Object.keys(value.value).length}</span>
                )}
            </div>
          </div>
          <div className="flex items-center space-x-2 flex-shrink-0">
            {/* View mode buttons - visible when not in text editing mode */}
            {!isEditing && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsFullscreen(!isFullscreen)}
                >
                  {isFullscreen ? (
                    <Minimize2 className="h-4 w-4" />
                  ) : (
                    <Maximize2 className="h-4 w-4" />
                  )}
                </Button>

                <div className="flex border border-border rounded-md">
                  {canShowEditor && (
                    <Button
                      size="sm"
                      variant={viewMode === 'editor' ? 'secondary' : 'ghost'}
                      onClick={() => setViewMode('editor')}
                      className="rounded-r-none border-r"
                    >
                      <List className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant={viewMode === 'formatted' ? 'secondary' : 'ghost'}
                    onClick={() => setViewMode('formatted')}
                    className={`${canShowEditor ? 'rounded-none border-r' : 'rounded-r-none border-r'}`}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  {canShowJson && (
                    <Button
                      size="sm"
                      variant={viewMode === 'json' ? 'secondary' : 'ghost'}
                      onClick={() => setViewMode('json')}
                      className="rounded-none border-r"
                    >
                      Tree
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant={viewMode === 'raw' ? 'secondary' : 'ghost'}
                    onClick={() => setViewMode('raw')}
                    className="rounded-l-none"
                  >
                    <Code className="h-4 w-4" />
                  </Button>
                </div>

                <Button size="sm" onClick={() => setIsEditing(true)}>
                  Edit
                </Button>
              </>
            )}

            {/* Edit mode buttons - visible when in text editing mode */}
            {isEditing && (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setIsEditing(false);
                    setEditedValue(formatValueForEdit(value.value, value.type));
                    setTtl(value.ttl === -1 ? '' : value.ttl.toString());
                  }}
                >
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave}>
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </Button>
              </>
            )}
          </div>
        </div>

        {isEditing && (
          <div className="flex items-center space-x-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <Input
              type="number"
              placeholder="TTL in seconds (empty for no expiry)"
              value={ttl}
              onChange={(e) => setTtl(e.target.value)}
              className="w-64"
            />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-hidden min-h-0">
        {isEditing ? (
          <div className="h-full p-4">
            <textarea
              value={editedValue}
              onChange={(e) => setEditedValue(e.target.value)}
              className="w-full h-full p-3 font-mono text-sm bg-muted rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder={getPlaceholder(value.type)}
            />
          </div>
        ) : (
          <div
            className={`h-full overflow-auto min-w-0 ${getBackgroundColor()}`}
          >
            {(() => {
              if (viewMode === 'raw') {
                return (
                  <div className="h-full flex flex-col">
                    <div className="p-2 text-xs text-muted-foreground border-b flex-shrink-0">
                      Raw JSON View
                    </div>
                    <div className="flex-1 overflow-auto min-w-0">
                      <pre className="p-4 font-mono text-sm whitespace-pre-wrap break-all overflow-wrap-anywhere bg-transparent w-full">
                        {JSON.stringify(value.value, null, 2)}
                      </pre>
                    </div>
                  </div>
                );
              }
              if (viewMode === 'formatted') {
                return (
                  <div className="h-full flex flex-col">
                    <div className="p-2 text-xs text-muted-foreground border-b flex-shrink-0">
                      Formatted View
                    </div>
                    <div className="flex-1 overflow-auto min-w-0">
                      <pre className="p-4 font-mono text-sm whitespace-pre-wrap break-all overflow-wrap-anywhere bg-transparent w-full">
                        {formatValueForDisplay(value.value, value.type)}
                      </pre>
                    </div>
                  </div>
                );
              }
              if (viewMode === 'json' && canShowJson) {
                return (
                  <div className="h-full flex flex-col">
                    <div className="p-2 text-xs text-muted-foreground border-b flex-shrink-0">
                      Tree View
                    </div>
                    <div className="flex-1 overflow-auto min-w-0">
                      <div className="p-4" ref={jsonViewRef}>
                        <div
                          className={`json-tree-container ${getJsonThemeClass()}`}
                          style={getJsonThemeStyle()}
                        >
                          <JsonView data={jsonData} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }
              if (viewMode === 'editor' && canShowEditor) {
                return (
                  <div className="h-full p-4" ref={jsonViewRef}>
                    <div
                      className={`json-tree-container ${getJsonThemeClass()}`}
                    >
                      <ArrayObjectViewer
                        data={value.value}
                        type={value.type as 'list' | 'hash' | 'zset'}
                        onUpdate={handleArrayObjectUpdate}
                      />
                    </div>
                  </div>
                );
              }
              return (
                <div className="h-full flex flex-col">
                  <div className="p-2 text-xs text-muted-foreground border-b flex-shrink-0">
                    No view available
                  </div>
                  <div className="flex-1 overflow-auto min-w-0">
                    <pre className="p-4 font-mono text-sm whitespace-pre-wrap break-all overflow-wrap-anywhere bg-transparent w-full">
                      {formatValueForDisplay(value.value, value.type)}
                    </pre>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {editingKey && value && (
        <KeyEditModal
          isOpen={true}
          onClose={() => setEditingKey(false)}
          onSave={handleKeyRename}
          currentKey={value.key}
          title="Rename Redis Key"
        />
      )}
    </div>
  );
};

function getPlaceholder(type: string): string {
  switch (type) {
    case 'list':
    case 'set':
      return 'Enter one value per line';
    case 'hash':
      return 'Enter key: value pairs, one per line';
    default:
      return 'Enter value';
  }
}

function formatValueForDisplay(val: any, type: string): string {
  switch (type) {
    case 'string':
      return val || '(empty string)';
    case 'list':
    case 'set':
      return Array.isArray(val) && val.length > 0 ? val.join('\n') : '(empty)';
    case 'hash': {
      const entries = Object.entries(val || {});
      return entries.length > 0
        ? entries.map(([k, v]) => `${k}: ${v}`).join('\n')
        : '(empty)';
    }
    default:
      return JSON.stringify(val, null, 2);
  }
}
