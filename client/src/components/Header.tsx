import React from 'react';
import { Moon, Sun, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Switch } from './ui/Switch';
import { Button } from './ui/Button';
import { useStore } from '../store/useStore';

export const Header: React.FC = () => {
  const { theme, toggleTheme, showConnectionsPanel, toggleConnectionsPanel } = useStore();

  return (
    <header className="border-b border-border bg-card">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center space-x-3">
          <Button
            size="sm"
            variant="ghost"
            onClick={toggleConnectionsPanel}
            aria-label={showConnectionsPanel ? 'Hide connections panel' : 'Show connections panel'}
          >
            {showConnectionsPanel ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </Button>
          <img src="/logo.svg" alt="RedisX Logo" className="h-8 w-8" />
          <h1 className="text-xl font-semibold">RedisX</h1>
        </div>
        
        <div className="flex items-center space-x-2">
          <Sun className="h-4 w-4" />
          <Switch
            checked={theme === 'dark'}
            onCheckedChange={toggleTheme}
            aria-label="Toggle theme"
          />
          <Moon className="h-4 w-4" />
        </div>
      </div>
    </header>
  );
};