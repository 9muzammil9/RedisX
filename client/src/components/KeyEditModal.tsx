import React, { useState, useEffect } from 'react';
import { Save, X, Maximize2, Minimize2 } from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

interface KeyEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (newKey: string) => void;
  currentKey: string;
  title: string;
}

export const KeyEditModal: React.FC<KeyEditModalProps> = ({
  isOpen,
  onClose,
  onSave,
  currentKey,
  title,
}) => {
  const [newKey, setNewKey] = useState(currentKey);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    setNewKey(currentKey);
  }, [currentKey, isOpen]);

  const handleSave = () => {
    if (newKey.trim() && newKey !== currentKey) {
      onSave(newKey.trim());
    }
    onClose();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className={`bg-card border border-border rounded-lg shadow-lg p-6 ${isFullscreen ? 'w-full h-full max-w-none max-h-none m-4 flex flex-col' : 'w-96 max-w-[90vw]'
        }`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <div className="flex items-center space-x-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className={`space-y-4 ${isFullscreen ? 'flex-1 flex flex-col' : ''}`}>
          <div className={isFullscreen ? 'flex-1 flex flex-col' : ''}>
            <label htmlFor="key-name-input" className="text-sm font-medium text-muted-foreground block mb-2">
              Key Name
            </label>
            {isFullscreen ? (
              <textarea
                id="key-name-input"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Enter key name"
                autoFocus
                className="w-full flex-1 p-3 font-mono text-sm bg-muted rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
            ) : (
              <Input
                id="key-name-input"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Enter key name"
                autoFocus
                className="w-full"
              />
            )}
          </div>

          <div className="flex items-center justify-end space-x-2">
            <Button size="sm" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!newKey.trim() || newKey === currentKey}
            >
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};