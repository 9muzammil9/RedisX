import { Download, Trash2, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { instancesApi } from '../services/api';
import { Button } from './ui/Button';

interface InstanceLogsViewerProps {
  instanceId: string;
  onClose: () => void;
}

export const InstanceLogsViewer: React.FC<InstanceLogsViewerProps> = ({
  instanceId,
  onClose,
}) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Fetch initial logs
    fetchLogs();

    // Set up SSE for real-time logs
    const eventSource = new EventSource(
      `/api/instances/${instanceId}/logs/stream`,
    );
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'initial') {
        setLogs(data.logs);
      } else if (data.type === 'log') {
        setLogs((prevLogs) => [...prevLogs, data.log]);
      } else if (data.type === 'status') {
        setLogs((prevLogs) => [
          ...prevLogs,
          `[${new Date().toISOString()}] Instance ${data.status}`,
        ]);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
    };

    return () => {
      eventSource.close();
    };
  }, [instanceId]);

  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const fetchLogs = async () => {
    try {
      const { data } = await instancesApi.getLogs(instanceId);
      setLogs(data.logs);
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    }
  };

  const handleScroll = () => {
    if (!containerRef.current) { return; }

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 10;
    setAutoScroll(isAtBottom);
  };

  const handleClearLogs = () => {
    setLogs([]);
  };

  const handleDownloadLogs = () => {
    const content = logs.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `redis-instance-${instanceId}-logs.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-card border border-border rounded-lg flex flex-col max-w-4xl w-full h-[80vh]">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">Instance Logs</h2>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={handleClearLogs}>
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDownloadLogs}>
              <Download className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-auto p-4 font-mono text-sm bg-muted/30"
        >
          {logs.length === 0 ? (
            <div className="text-center text-muted-foreground">
              No logs available
            </div>
          ) : (
            <div className="space-y-1">
              {logs.map((log, index) => (
                <div
                  key={`log-${index}-${log.slice(0, 50)}`}
                  className={`whitespace-pre-wrap break-all ${
                    log.includes('[ERROR]') ? 'text-red-500' : ''
                  }`}
                >
                  {log}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>

        <div className="p-4 border-t border-border">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="rounded"
              />{' '}
              Auto-scroll to bottom
            </label>
            <span className="text-sm text-muted-foreground">
              {logs.length} lines
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
