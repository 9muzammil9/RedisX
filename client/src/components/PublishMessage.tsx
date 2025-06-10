import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Send } from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Label } from './ui/Label';
import { pubsubApi } from '../services/api';
import { useStore } from '../store/useStore';

interface PublishMessageProps {
  defaultChannel?: string;
  onMessageSent?: (channel: string, message: string) => void;
}

export function PublishMessage({ defaultChannel = '', onMessageSent }: PublishMessageProps) {
  const [channel, setChannel] = useState(defaultChannel);
  const [message, setMessage] = useState('');
  const { activeConnectionId } = useStore();

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!activeConnectionId) throw new Error('No active connection');
      if (!channel.trim()) throw new Error('Channel name is required');
      if (!message.trim()) throw new Error('Message is required');

      return pubsubApi.publishMessage(activeConnectionId, channel.trim(), message);
    },
    onSuccess: (response) => {
      toast.success(response.data.message);
      setMessage(''); // Clear message after sending
      onMessageSent?.(channel, message);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to publish message');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    publishMutation.mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="channel">Channel</Label>
        <Input
          id="channel"
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          placeholder="Enter channel name (e.g., notifications, user:123)"
          className="font-mono"
        />
      </div>
      
      <div>
        <Label htmlFor="message">Message</Label>
        <Input
          id="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Enter message content"
          className="font-mono"
        />
      </div>

      <Button 
        type="submit" 
        disabled={!channel.trim() || !message.trim() || !activeConnectionId || publishMutation.isPending}
        className="w-full"
      >
        <Send className="w-4 h-4 mr-2" />
        {publishMutation.isPending ? 'Publishing...' : 'Publish Message'}
      </Button>
    </form>
  );
}