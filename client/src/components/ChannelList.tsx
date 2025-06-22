import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, RefreshCw, Hash, Users } from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Checkbox } from './ui/Checkbox';
import { pubsubApi } from '../services/api';
import { useStore } from '../store/useStore';
import { ChannelInfo } from '../types';

interface ChannelListProps {
  readonly onChannelSelect?: (channel: string) => void;
  readonly onRefresh?: () => void;
}

export function ChannelList({ onChannelSelect, onRefresh }: ChannelListProps) {
  const {
    activeConnectionId,
    channelPattern,
    setChannelPattern,
    selectedChannels,
    toggleChannelSelection,
    clearChannelSelection,
    setPubsubStats
  } = useStore();

  const [searchPattern, setSearchPattern] = useState(channelPattern);

  const { data: statsData, isLoading, refetch } = useQuery({
    queryKey: ['pubsub-stats', activeConnectionId, channelPattern],
    queryFn: async () => {
      if (!activeConnectionId) return null;
      const response = await pubsubApi.getStats(activeConnectionId, undefined, channelPattern);
      setPubsubStats(response.data);
      return response.data;
    },
    enabled: !!activeConnectionId,
    refetchInterval: 5000, // Auto-refresh every 5 seconds
  });

  const handlePatternSearch = () => {
    setChannelPattern(searchPattern);
  };

  const handleRefresh = () => {
    refetch();
    onRefresh?.();
  };

  const handleChannelClick = (channel: string) => {
    toggleChannelSelection(channel);
    onChannelSelect?.(channel);
  };

  const channels = statsData?.channels || [];
  const selectedChannelsList = Array.from(selectedChannels);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Hash className="w-4 h-4" />
            <h3 className="font-semibold">Pub/Sub Channels</h3>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Search */}
        <div className="flex gap-2">
          <Input
            value={searchPattern}
            onChange={(e) => setSearchPattern(e.target.value)}
            placeholder="Channel pattern (e.g., user:*, news:*)"
            className="font-mono text-sm"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handlePatternSearch}
          >
            <Search className="w-4 h-4" />
          </Button>
        </div>

        {/* Stats Summary */}
        {statsData && (
          <div className="mt-3 text-sm text-muted-foreground">
            {statsData.totalChannels} channel(s) found
            {selectedChannelsList.length > 0 && (
              <span className="ml-2">
                • {selectedChannelsList.length} selected
                <Button
                  variant="link"
                  size="sm"
                  onClick={clearChannelSelection}
                  className="h-auto p-0 ml-1 text-xs"
                >
                  Clear
                </Button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Channel List */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4 text-center text-muted-foreground">
            Loading channels...
          </div>
        ) : channels.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            <Hash className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No active channels found</p>
            <p className="text-xs mt-1">Try a different pattern or publish some messages</p>
          </div>
        ) : (
          <div className="p-2">
            {channels.map((channelInfo: ChannelInfo) => (
              <div
                key={channelInfo.channel}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors hover:bg-accent ${selectedChannels.has(channelInfo.channel)
                  ? 'bg-accent border-accent-foreground/20'
                  : 'border-transparent'
                  }`}
                onClick={() => handleChannelClick(channelInfo.channel)}
              >
                <Checkbox
                  checked={selectedChannels.has(channelInfo.channel)}
                  onChange={() => handleChannelClick(channelInfo.channel)}
                />

                <div className="flex-1 min-w-0">
                  <div className="font-mono text-sm truncate">
                    {channelInfo.channel}
                  </div>
                </div>

                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="w-3 h-3" />
                  {channelInfo.subscribers}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}