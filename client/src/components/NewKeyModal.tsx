import { X } from 'lucide-react';
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { keysApi } from '../services/api';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Label } from './ui/Label';
import { Select } from './ui/Select';

interface NewKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionId: string;
  onKeyCreated: () => void;
}

export const NewKeyModal: React.FC<NewKeyModalProps> = ({
  isOpen,
  onClose,
  connectionId,
  onKeyCreated,
}) => {
  const [formData, setFormData] = useState({
    key: '',
    type: 'string' as 'string' | 'list' | 'hash' | 'set' | 'zset',
    value: '',
    ttl: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.key.trim() || !formData.value.trim()) {
      toast.error('Key name and value are required');
      return;
    }

    setIsSubmitting(true);
    try {
      let processedValue: any = formData.value;

      // Process value based on type
      if (formData.type === 'list') {
        try {
          processedValue = JSON.parse(formData.value);
          if (!Array.isArray(processedValue)) {
            throw new Error('List must be a JSON array');
          }
        } catch (error) {
          console.debug('List value not valid JSON, treating as single item:', error);
          // If not valid JSON, treat as single item array
          processedValue = [formData.value];
        }
      } else if (formData.type === 'hash' || formData.type === 'set') {
        try {
          processedValue = JSON.parse(formData.value);
        } catch (error) {
          console.error(`${formData.type} JSON parse error:`, error);
          toast.error(`${formData.type} value must be valid JSON`);
          return;
        }
      }

      const ttl = formData.ttl ? parseInt(formData.ttl, 10) : undefined;

      await keysApi.setValue(
        connectionId,
        formData.key,
        processedValue,
        formData.type,
        ttl,
      );
      toast.success('Key created successfully');

      // Reset form
      setFormData({
        key: '',
        type: 'string',
        value: '',
        ttl: '',
      });

      onKeyCreated();
      onClose();
    } catch (error) {
      console.error('Failed to create key:', error);
      toast.error('Failed to create key');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getValuePlaceholder = () => {
    switch (formData.type) {
      case 'string':
        return 'Enter string value';
      case 'list':
        return 'Enter JSON array: ["item1", "item2"] or single value';
      case 'hash':
        return 'Enter JSON object: {"field1": "value1", "field2": "value2"}';
      case 'set':
        return 'Enter JSON array: ["member1", "member2"]';
      case 'zset':
        return 'Enter JSON object: {"member1": 1.0, "member2": 2.0}';
      default:
        return 'Enter value';
    }
  };

  if (!isOpen) { return null; }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-lg shadow-lg w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">Create New Key</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <Label htmlFor="key">Key Name</Label>
            <Input
              id="key"
              type="text"
              value={formData.key}
              onChange={(e) =>
                setFormData({ ...formData, key: e.target.value })
              }
              placeholder="my:key:name"
              required
            />
          </div>

          <div>
            <Label htmlFor="type">Type</Label>
            <Select
              value={formData.type}
              onValueChange={(value) =>
                setFormData({
                  ...formData,
                  type: value as 'string' | 'list' | 'hash' | 'set' | 'zset',
                })
              }
            >
              <option value="string">String</option>
              <option value="list">List</option>
              <option value="hash">Hash</option>
              <option value="set">Set</option>
              <option value="zset">Sorted Set</option>
            </Select>
          </div>

          <div>
            <Label htmlFor="value">Value</Label>
            <textarea
              id="value"
              value={formData.value}
              onChange={(e) =>
                setFormData({ ...formData, value: e.target.value })
              }
              placeholder={getValuePlaceholder()}
              className="w-full min-h-[100px] px-3 py-2 border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 rounded-md resize-vertical"
              required
            />
          </div>

          <div>
            <Label htmlFor="ttl">TTL (seconds, optional)</Label>
            <Input
              id="ttl"
              type="number"
              value={formData.ttl}
              onChange={(e) =>
                setFormData({ ...formData, ttl: e.target.value })
              }
              placeholder="Leave empty for no expiry"
              min="1"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Key'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
