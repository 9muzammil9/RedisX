import React, { useState, useEffect, useRef } from 'react';
import { Save, X, Clock, Eye, Code, Maximize2, Minimize2, List } from 'lucide-react';
import { JsonView } from 'react-json-view-lite';
import 'react-json-view-lite/dist/index.css';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { ArrayObjectViewer } from './ArrayObjectViewer';
import { useStore } from '../store/useStore';
import { keysApi } from '../services/api';
import { RedisValue } from '../types';
import toast from 'react-hot-toast';

interface ValueEditorProps {
  selectedKey: string | null;
}

type ViewMode = 'raw' | 'json' | 'formatted' | 'editor';

export const ValueEditor: React.FC<ValueEditorProps> = ({ selectedKey }) => {
  const { activeConnectionId, theme } = useStore();
  const [value, setValue] = useState<RedisValue | null>(null);
  const [editedValue, setEditedValue] = useState<string>('');
  const [ttl, setTtl] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('formatted');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const jsonViewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedKey && activeConnectionId) {
      fetchValue();
    }
  }, [selectedKey, activeConnectionId]);

  // Force arrow and punctuation colors in dark mode, and ensure proper indentation
  useEffect(() => {
    if (jsonViewRef.current) {
      const forceStyles = () => {
        const elements = jsonViewRef.current?.querySelectorAll('*');
        elements?.forEach((el: any) => {
          // Force colors in dark mode
          if (theme === 'dark') {
            // Force ALL text elements to be light colored
            if (el.tagName === 'SPAN' || el.tagName === 'DIV' || el.tagName === 'BUTTON') {
              el.style.color = '#e5e7eb';
              el.style.backgroundColor = 'transparent';
            }
            
            // Force arrow and button colors
            if (el.tagName === 'BUTTON' || el.role === 'button' || 
                el.textContent?.includes('▶') || el.textContent?.includes('▼') ||
                el.textContent?.includes('►') || el.textContent?.includes('▲')) {
              el.style.color = '#e5e7eb';
              el.style.fill = '#e5e7eb';
              el.style.backgroundColor = 'transparent';
            }
            
            // Force punctuation colors
            if (el.textContent === ':' || el.textContent === ',' || 
                el.textContent === '{' || el.textContent === '}' ||
                el.textContent === '[' || el.textContent === ']' ||
                el.textContent === '"') {
              el.style.color = '#e5e7eb';
              el.style.backgroundColor = 'transparent';
            }
            
            // Force SVG elements
            if (el.tagName === 'SVG' || el.tagName === 'PATH') {
              el.style.fill = '#e5e7eb';
              el.style.stroke = '#e5e7eb';
            }
            
            // Force any element with inline styles
            if (el.style && el.style.color && el.style.color !== '#e5e7eb') {
              el.style.color = '#e5e7eb';
              el.style.backgroundColor = 'transparent';
            }
          }
          
          // Ensure proper indentation for nested elements
          if (el.style && el.style.marginLeft) {
            const currentMargin = parseInt(el.style.marginLeft) || 0;
            if (currentMargin > 0) {
              el.style.marginLeft = Math.max(currentMargin, 20) + 'px';
              el.style.position = 'relative';
            }
          }
        });
      };

      // Apply immediately and after mutations
      forceStyles();
      const observer = new MutationObserver(forceStyles);
      observer.observe(jsonViewRef.current, { 
        childList: true, 
        subtree: true, 
        attributes: true,
        characterData: true
      });

      return () => observer.disconnect();
    }
  }, [theme, value, viewMode]);

  const fetchValue = async () => {
    if (!selectedKey || !activeConnectionId) return;

    setLoading(true);
    try {
      const { data } = await keysApi.getValue(activeConnectionId, selectedKey);
      setValue(data);
      setEditedValue(formatValueForEdit(data.value, data.type));
      setTtl(data.ttl === -1 ? '' : data.ttl.toString());
      setIsEditing(false);
      // Auto-select best view mode
      if (data.type === 'list') {
        // Always default to editor/list view for Redis lists
        setViewMode('editor');
      } else if (data.type === 'hash') {
        // For hashes, prefer editor mode but still allow tree view for complex data
        if (shouldUseJsonView(data.value, data.type)) {
          setViewMode('json'); // Tree view for complex nested data
        } else {
          setViewMode('editor'); // Editor for simple hashes
        }
      } else {
        setViewMode(shouldUseJsonView(data.value, data.type) ? 'json' : 'formatted');
      }
    } catch (error) {
      toast.error('Failed to fetch value');
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
      return val.length > 5 || val.some(item => {
        try {
          return typeof JSON.parse(item) === 'object';
        } catch {
          return false;
        }
      });
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
      case 'hash':
        const hash: Record<string, string> = {};
        val.split('\n').forEach((line) => {
          const [key, ...valueParts] = line.split(':');
          if (key && valueParts.length) {
            hash[key.trim()] = valueParts.join(':').trim();
          }
        });
        return hash;
      default:
        return val;
    }
  };

  const handleSave = async () => {
    if (!value || !activeConnectionId) return;

    try {
      const parsedValue = parseEditedValue(editedValue, value.type);
      const parsedTtl = ttl ? parseInt(ttl) : undefined;
      
      await keysApi.setValue(
        activeConnectionId,
        value.key,
        parsedValue,
        value.type,
        parsedTtl
      );
      
      toast.success('Value updated successfully');
      setIsEditing(false);
      fetchValue();
    } catch (error) {
      toast.error('Failed to update value');
    }
  };

  const handleArrayObjectUpdate = async (newData: any) => {
    if (!value || !activeConnectionId) return;

    try {
      await keysApi.setValue(
        activeConnectionId,
        value.key,
        newData,
        value.type,
        value.ttl > 0 ? value.ttl : undefined
      );
      
      toast.success('Value updated successfully');
      fetchValue(); // Refresh the data
    } catch (error) {
      toast.error('Failed to update value');
    }
  };

  const getValueSize = (val: any, type: string): string => {
    const str = formatValueForDisplay(val, type);
    const bytes = new Blob([str]).size;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
    return null;
  }

  const jsonData = parseValueForJsonView(value.value, value.type);
  const canShowJson = shouldUseJsonView(value.value, value.type);
  const canShowEditor = value.type === 'list' || value.type === 'hash';

  return (
    <div className={`flex flex-col ${isFullscreen ? 'fixed inset-0 z-50 bg-background' : 'flex-1'}`}>
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex-1">
            <h3 className="font-semibold truncate">{value.key}</h3>
            <div className="flex items-center space-x-4 text-sm text-muted-foreground">
              <span>Type: {value.type}</span>
              <span>Size: {getValueSize(value.value, value.type)}</span>
              {Array.isArray(value.value) && <span>Items: {value.value.length}</span>}
              {typeof value.value === 'object' && value.value && !Array.isArray(value.value) && (
                <span>Fields: {Object.keys(value.value).length}</span>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {/* View mode buttons - always visible when not in text editing mode */}
            {!isEditing && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsFullscreen(!isFullscreen)}
                >
                  {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
                
                {(canShowJson || canShowEditor) && (
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
                      className={`${canShowEditor || canShowJson ? 'rounded-none border-r' : 'rounded-md'}`}
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
                )}
                
                <Button size="sm" onClick={() => setIsEditing(true)}>
                  Edit
                </Button>
              </>
            )}
            
            {/* Edit mode buttons - only visible when in text editing mode */}
            {isEditing && (
              <>
                <Button size="sm" onClick={handleSave}>
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </Button>
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
      
      <div className="flex-1 overflow-hidden">
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
          <div className="h-full overflow-auto bg-muted/30">
            {viewMode === 'editor' && canShowEditor ? (
              <div className="h-full p-4" ref={jsonViewRef}>
                <div className={`json-tree-container ${theme === 'dark' ? 'dark-theme' : 'light-theme'}`}>
                  <ArrayObjectViewer
                    data={value.value}
                    type={value.type as 'list' | 'hash'}
                    onUpdate={handleArrayObjectUpdate}
                  />
                </div>
              </div>
            ) : viewMode === 'json' && canShowJson ? (
              <div className="p-4" ref={jsonViewRef}>
                <div className={`json-tree-container ${theme === 'dark' ? 'dark-theme' : 'light-theme'}`}>
                  <JsonView
                    data={jsonData}
                  />
                </div>
              </div>
            ) : (
              <pre className="p-4 font-mono text-sm whitespace-pre-wrap break-words bg-transparent">
                {viewMode === 'raw' 
                  ? JSON.stringify(value.value, null, 2)
                  : formatValueForDisplay(value.value, value.type)
                }
              </pre>
            )}
          </div>
        )}
      </div>
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
      return Array.isArray(val) && val.length > 0
        ? val.join('\n')
        : '(empty)';
    case 'hash':
      const entries = Object.entries(val || {});
      return entries.length > 0
        ? entries.map(([k, v]) => `${k}: ${v}`).join('\n')
        : '(empty)';
    default:
      return JSON.stringify(val, null, 2);
  }
}