import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Toaster } from 'react-hot-toast';
import { ConnectionList } from './components/ConnectionList';
import { Header } from './components/Header';
import { KeyList } from './components/KeyList';
import { LocalInstances } from './components/LocalInstances';
import { PubSubPanel } from './components/PubSubPanel';
import { ValueEditor } from './components/ValueEditor';
import { useConnectionRestore } from './hooks/useConnectionRestore';
import { useStore } from './store/useStore';

const queryClient = new QueryClient();

type RightPanelTab = 'keys' | 'pubsub' | 'instances';

// Helper functions for tab and panel persistence
import * as persistence from './services/persistence';

const saveActiveTab = (tab: RightPanelTab) => {
  try {
    // Save to both localStorage (for quick access) and SQLite
    localStorage.setItem('redisx-active-tab', tab);
    persistence.saveAppState('activeTab', tab);
  } catch (error) {
    console.error('Failed to save active tab:', error);
  }
};

const loadActiveTab = (): RightPanelTab => {
  try {
    const saved = localStorage.getItem('redisx-active-tab');
    return saved === 'keys' || saved === 'pubsub' || saved === 'instances'
      ? saved
      : 'keys';
  } catch (error) {
    console.error('Failed to load active tab:', error);
    return 'keys';
  }
};

const saveKeysPanelWidth = (width: number) => {
  try {
    localStorage.setItem('redisx-keys-panel-width', width.toString());
    persistence.saveAppState('keysPanelWidth', width.toString());
  } catch (error) {
    console.error('Failed to save keys panel width:', error);
  }
};

const loadKeysPanelWidth = (): number => {
  try {
    const saved = localStorage.getItem('redisx-keys-panel-width');
    const width = saved ? parseInt(saved, 10) : 350;
    return isNaN(width) ? 350 : Math.max(350, Math.min(800, width)); // Clamp between 350-800px
  } catch (error) {
    console.error('Failed to load keys panel width:', error);
    return 350;
  }
};

function App() {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [forceEditMode, setForceEditMode] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [deletedKey, setDeletedKey] = useState<string | undefined>(undefined);
  const [activeRightTab, setActiveRightTab] =
    useState<RightPanelTab>(loadActiveTab());
  const [keysPanelWidth, setKeysPanelWidth] =
    useState<number>(loadKeysPanelWidth());
  const [isResizing, setIsResizing] = useState(false);
  const { theme, showConnectionsPanel, initializeFromDatabase } = useStore();

  // Sync localStorage to database in background (non-blocking)
  useEffect(() => {
    // Run sync in background without blocking the UI
    initializeFromDatabase();
  }, [initializeFromDatabase]);

  // Restore connections on app load
  useConnectionRestore();

  const handleKeySelect = (key: string) => {
    setSelectedKey(key);
    setForceEditMode(false); // Reset edit mode when selecting normally
    // Always trigger a refresh, even if the same key is selected
    setRefreshTrigger((prev) => prev + 1);
    // Automatically switch to Keys & Values tab when a key is selected
    if (activeRightTab !== 'keys') {
      handleTabChange('keys');
    }
  };

  const handleKeySelectForEdit = (key: string) => {
    setSelectedKey(key);
    setForceEditMode(true);
    // Automatically switch to Keys & Values tab when a key is selected for editing
    if (activeRightTab !== 'keys') {
      handleTabChange('keys');
    }
  };

  const handleForceEditModeUsed = () => {
    setForceEditMode(false);
  };

  const handleKeyDeleted = (keyName: string) => {
    // If the currently selected key was deleted, clear the selection
    if (selectedKey === keyName) {
      setSelectedKey(null);
      setForceEditMode(false);
    }
    // Set the deleted key to trigger removal from KeyList
    setDeletedKey(keyName);
    // Clear the deleted key after a short delay to reset the state
    setTimeout(() => setDeletedKey(undefined), 100);
  };

  const handleTabChange = (tab: RightPanelTab) => {
    setActiveRightTab(tab);
    saveActiveTab(tab);
  };

  // Resize handler for keys panel
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) { return; }

      const connectionsPanelWidth = showConnectionsPanel ? 256 : 0; // w-64 = 256px
      const minWidth = 350; // Minimum width for keys panel to accommodate buttons and content
      const maxWidth = window.innerWidth * 0.6; // Maximum 60% of screen width

      const newWidth = e.clientX - connectionsPanelWidth;
      const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

      setKeysPanelWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, showConnectionsPanel]);

  // Save keys panel width when it changes (debounced to avoid excessive saves)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      saveKeysPanelWidth(keysPanelWidth);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [keysPanelWidth]);

  useEffect(() => {
    // Apply theme whenever it changes
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="h-screen flex flex-col bg-background text-foreground">
        <Header />
        <div className="flex-1 flex overflow-hidden">
          {showConnectionsPanel && <ConnectionList />}
          <div className="flex-1 flex">
            <div
              className="border-r border-border relative"
              style={{ width: keysPanelWidth }}
            >
              <KeyList
                onKeySelect={handleKeySelect}
                onKeySelectForEdit={handleKeySelectForEdit}
                onKeyDeleted={handleKeyDeleted}
                deletedKey={deletedKey}
              />

              {/* Resize Handle */}
              <button
                type="button"
                aria-label="Resize keys panel"
                className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors focus:outline-none focus:bg-primary/40 border-0 bg-transparent ${
                  isResizing ? 'bg-primary/30' : ''
                }`}
                onMouseDown={handleMouseDown}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    const direction = e.key === 'ArrowLeft' ? -10 : 10;
                    const newWidth = Math.max(
                      350,
                      Math.min(
                        window.innerWidth * 0.6,
                        keysPanelWidth + direction,
                      ),
                    );
                    setKeysPanelWidth(newWidth);
                  }
                }}
                title="Drag to resize or use arrow keys"
              />
            </div>

            {/* Right Panel with Tabs */}
            <div className="flex-1 flex flex-col">
              {/* Tab Navigation */}
              <div className="border-b border-border">
                <div className="flex">
                  <button
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeRightTab === 'keys'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => handleTabChange('keys')}
                  >
                    Keys & Values
                  </button>
                  <button
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeRightTab === 'pubsub'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => handleTabChange('pubsub')}
                  >
                    Pub/Sub
                  </button>
                  <button
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeRightTab === 'instances'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => handleTabChange('instances')}
                  >
                    Local Instances
                  </button>
                </div>
              </div>

              {/* Tab Content */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {activeRightTab === 'keys' && (
                  <ValueEditor
                    selectedKey={selectedKey}
                    forceEditMode={forceEditMode}
                    onForceEditModeUsed={handleForceEditModeUsed}
                    refreshTrigger={refreshTrigger}
                    onKeyDeleted={handleKeyDeleted}
                  />
                )}
                {activeRightTab === 'pubsub' && <PubSubPanel />}
                {activeRightTab === 'instances' && <LocalInstances />}
              </div>
            </div>
          </div>
        </div>
      </div>
      <Toaster
        position="bottom-right"
        toastOptions={{
          className: 'bg-background text-foreground border border-border',
          style: {
            background: 'hsl(var(--background))',
            color: 'hsl(var(--foreground))',
            border: '1px solid hsl(var(--border))',
          },
        }}
      />
    </QueryClientProvider>
  );
}

export default App;
