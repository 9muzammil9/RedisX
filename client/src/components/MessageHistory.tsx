import {
  CheckCheck,
  Copy,
  Database,
  Download,
  Info,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useStore } from '../store/useStore';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

export function MessageHistory() {
  const {
    messages,
    clearMessages,
    deleteMessage,
    maxMessages,
    setMaxMessages,
    subscribedChannels,
  } = useStore();
  const [filter, setFilter] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, autoScroll]);

  const filteredMessages = messages.filter(
    (msg) =>
      msg.channel.toLowerCase().includes(filter.toLowerCase()) ||
      msg.message.toLowerCase().includes(filter.toLowerCase()),
  );

  const handleCopyMessage = (message: string, messageId: string) => {
    navigator.clipboard.writeText(message);
    setCopiedId(messageId);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success('Message copied to clipboard');
  };

  const handleDeleteMessage = (messageId: string, channel: string) => {
    deleteMessage(messageId);
    toast.success(`Message deleted from ${channel}`);
  };

  const handleExport = () => {
    const data = JSON.stringify(filteredMessages, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pubsub-messages-${new Date().toISOString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Messages exported');
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const time = date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const milliseconds = date.getMilliseconds().toString().padStart(3, '0');
    return `${time}.${milliseconds}`;
  };

  if (messages.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Info className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg mb-2">No messages yet</p>
          <p className="text-sm">
            Subscribe to channels to see real-time messages
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">
            Message History ({filteredMessages.length})
          </h3>
          <div className="flex items-center space-x-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setAutoScroll(!autoScroll)}
              className={autoScroll ? 'bg-primary text-primary-foreground' : ''}
            >
              Auto-scroll: {autoScroll ? 'ON' : 'OFF'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleExport}
              disabled={filteredMessages.length === 0}
            >
              <Download className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                clearMessages();
                toast.success('All messages cleared');
              }}
              disabled={messages.length === 0}
              title="Clear all messages"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Input
            placeholder="Filter by channel or message..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="flex-1"
          />
          <div className="flex items-center space-x-2">
            <span className="text-sm text-muted-foreground">Max messages:</span>
            <Input
              type="number"
              value={maxMessages}
              onChange={(e) => setMaxMessages(parseInt(e.target.value) || 100)}
              className="w-20"
              min="10"
              max="1000"
            />
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto p-4 space-y-2">
        {filteredMessages.map((msg) => {
          const isPersistent = subscribedChannels.get(msg.channel) ?? false;
          return (
            <div
              key={msg.id}
              className="bg-muted rounded-lg p-3 hover:bg-muted/80 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-muted-foreground">
                    {formatTimestamp(msg.timestamp)}
                  </span>
                  <span className="text-xs font-medium text-primary">
                    {msg.channel}
                  </span>
                  {isPersistent && (
                    <span title="Message persisted to storage">
                      <Database className="w-3 h-3 text-blue-500" />
                    </span>
                  )}
                </div>
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => handleCopyMessage(msg.message, msg.id)}
                    className="h-6 w-6 p-1 rounded hover:bg-accent/50 transition-colors flex items-center justify-center"
                    title="Copy message"
                  >
                    {copiedId === msg.id ? (
                      <CheckCheck className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                  <button
                    onClick={() => handleDeleteMessage(msg.id, msg.channel)}
                    className="h-6 w-6 p-1 rounded hover:bg-accent/50 transition-colors flex items-center justify-center group"
                    title="Delete message"
                  >
                    <Trash2 className="w-4 h-4 text-muted-foreground group-hover:text-red-500" />
                  </button>
                </div>
              </div>
              <div className="font-mono text-sm whitespace-pre-wrap break-all">
                {msg.message}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
