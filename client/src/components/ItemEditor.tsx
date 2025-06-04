import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Save, Trash2 } from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

interface ItemEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (value: any, key?: string) => void;
  onDelete?: () => void;
  title: string;
  initialValue: any;
  initialKey?: string;
  valueType: 'string' | 'number' | 'boolean' | 'object';
  isKeyEditable?: boolean;
}

export const ItemEditor: React.FC<ItemEditorProps> = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  title,
  initialValue,
  initialKey,
  valueType,
  isKeyEditable = false,
}) => {
  const [value, setValue] = useState<string>('');
  const [key, setKey] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setValue(formatValueForEdit(initialValue));
      setKey(initialKey || '');
      setError('');
    }
  }, [isOpen, initialValue, initialKey]);

  const formatValueForEdit = (val: any): string => {
    if (valueType === 'object') {
      return JSON.stringify(val, null, 2);
    }
    return String(val || '');
  };

  const parseValue = (val: string): any => {
    try {
      switch (valueType) {
        case 'string':
          return val;
        case 'number':
          const num = parseFloat(val);
          if (isNaN(num)) {
            throw new Error('Invalid number');
          }
          return num;
        case 'boolean':
          const lower = val.toLowerCase();
          if (lower === 'true') return true;
          if (lower === 'false') return false;
          throw new Error('Boolean must be "true" or "false"');
        case 'object':
          return JSON.parse(val);
        default:
          return val;
      }
    } catch (err) {
      throw new Error(`Invalid ${valueType}: ${err instanceof Error ? err.message : 'Parse error'}`);
    }
  };

  const handleSave = () => {
    try {
      const parsedValue = parseValue(value);
      setError('');
      
      if (isKeyEditable && !key.trim()) {
        setError('Key cannot be empty');
        return;
      }
      
      onSave(parsedValue, isKeyEditable ? key : undefined);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid value');
    }
  };

  const handleDelete = () => {
    if (onDelete) {
      onDelete();
      onClose();
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed left-[50%] top-[50%] max-h-[90vh] w-[95vw] max-w-[800px] translate-x-[-50%] translate-y-[-50%] rounded-lg bg-background p-6 shadow-lg">
          <Dialog.Title className="text-lg font-semibold mb-4">
            {title}
          </Dialog.Title>
          
          <Dialog.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
            <X className="h-4 w-4" />
          </Dialog.Close>
          
          <div className="space-y-4">
            {isKeyEditable && (
              <div>
                <label className="text-sm font-medium block mb-2">Key</label>
                <Input
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="Enter key name"
                  className="w-full"
                />
              </div>
            )}
            
            <div>
              <label className="text-sm font-medium block mb-2">
                Value ({valueType})
              </label>
              {valueType === 'object' ? (
                <textarea
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="w-full h-64 p-3 font-mono text-sm bg-muted rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring border border-border"
                  placeholder="Enter JSON object"
                />
              ) : (
                <Input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={`Enter ${valueType} value`}
                  className="w-full"
                />
              )}
            </div>
            
            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                {error}
              </div>
            )}
            
            <div className="flex justify-between">
              <div>
                {onDelete && (
                  <Button
                    variant="destructive"
                    onClick={handleDelete}
                    size="sm"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                )}
              </div>
              
              <div className="flex space-x-2">
                <Button variant="secondary" onClick={onClose}>
                  Cancel
                </Button>
                <Button onClick={handleSave}>
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </Button>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};