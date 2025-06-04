import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { useStore } from '../store/useStore';
import { connectionsApi } from '../services/api';
import toast from 'react-hot-toast';

interface ConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ConnectionModal: React.FC<ConnectionModalProps> = ({ isOpen, onClose }) => {
  const { addConnection, setActiveConnection } = useStore();
  const [formData, setFormData] = useState({
    name: '',
    host: 'localhost',
    port: '6379',
    password: '',
    db: '0',
    username: '',
    tls: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data } = await connectionsApi.create({
        name: formData.name,
        host: formData.host,
        port: parseInt(formData.port),
        password: formData.password || undefined,
        db: formData.db ? parseInt(formData.db) : undefined,
        username: formData.username || undefined,
        tls: formData.tls,
      });
      
      addConnection(data);
      setActiveConnection(data.id);
      toast.success('Connected successfully');
      onClose();
      setFormData({
        name: '',
        host: 'localhost',
        port: '6379',
        password: '',
        db: '0',
        username: '',
        tls: false,
      });
    } catch (error) {
      toast.error('Failed to connect');
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed left-[50%] top-[50%] max-h-[85vh] w-[90vw] max-w-[500px] translate-x-[-50%] translate-y-[-50%] rounded-lg bg-background p-6 shadow-lg">
          <Dialog.Title className="text-lg font-semibold mb-4">
            Add Redis Connection
          </Dialog.Title>
          
          <Dialog.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
            <X className="h-4 w-4" />
          </Dialog.Close>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Connection Name</label>
              <Input
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="My Redis Server"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Host</label>
                <Input
                  required
                  value={formData.host}
                  onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                  placeholder="localhost"
                />
              </div>
              
              <div>
                <label className="text-sm font-medium">Port</label>
                <Input
                  required
                  type="number"
                  value={formData.port}
                  onChange={(e) => setFormData({ ...formData, port: e.target.value })}
                  placeholder="6379"
                />
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium">Password (optional)</label>
              <Input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Password"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Username (optional)</label>
                <Input
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="Username"
                />
              </div>
              
              <div>
                <label className="text-sm font-medium">Database</label>
                <Input
                  type="number"
                  value={formData.db}
                  onChange={(e) => setFormData({ ...formData, db: e.target.value })}
                  placeholder="0"
                />
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="tls"
                checked={formData.tls}
                onChange={(e) => setFormData({ ...formData, tls: e.target.checked })}
                className="rounded border-gray-300"
              />
              <label htmlFor="tls" className="text-sm font-medium">
                Use TLS/SSL
              </label>
            </div>
            
            <div className="flex justify-end space-x-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit">Connect</Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};