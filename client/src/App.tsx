import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { Header } from './components/Header';
import { ConnectionList } from './components/ConnectionList';
import { KeyList } from './components/KeyList';
import { ValueEditor } from './components/ValueEditor';
import { PubSubPanel } from './components/PubSubPanel';
import { useStore } from './store/useStore';
import { useConnectionRestore } from './hooks/useConnectionRestore';

const queryClient = new QueryClient();

type RightPanelTab = 'keys' | 'pubsub';

// Helper functions for tab persistence
const saveActiveTab = (tab: RightPanelTab) => {
  try {
    localStorage.setItem('redis-viewer-active-tab', tab);
  } catch (error) {
    console.error('Failed to save active tab:', error);
  }
};

const loadActiveTab = (): RightPanelTab => {
  try {
    const saved = localStorage.getItem('redis-viewer-active-tab');
    return (saved === 'keys' || saved === 'pubsub') ? saved : 'keys';
  } catch (error) {
    console.error('Failed to load active tab:', error);
    return 'keys';
  }
};

function App() {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [forceEditMode, setForceEditMode] = useState(false);
  const [activeRightTab, setActiveRightTab] = useState<RightPanelTab>(loadActiveTab());
  const { theme, showConnectionsPanel } = useStore();
  
  // Restore connections on app load
  useConnectionRestore();

  const handleKeySelect = (key: string) => {
    setSelectedKey(key);
    setForceEditMode(false); // Reset edit mode when selecting normally
  };

  const handleKeySelectForEdit = (key: string) => {
    setSelectedKey(key);
    setForceEditMode(true);
  };

  const handleForceEditModeUsed = () => {
    setForceEditMode(false);
  };

  const handleKeyDeleted = (deletedKey: string) => {
    // If the currently selected key was deleted, clear the selection
    if (selectedKey === deletedKey) {
      setSelectedKey(null);
      setForceEditMode(false);
    }
  };

  const handleTabChange = (tab: RightPanelTab) => {
    setActiveRightTab(tab);
    saveActiveTab(tab);
  };

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
            <div className={`${showConnectionsPanel ? 'w-96' : 'w-80'} border-r border-border`}>
              <KeyList onKeySelect={handleKeySelect} onKeySelectForEdit={handleKeySelectForEdit} onKeyDeleted={handleKeyDeleted} />
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
                </div>
              </div>

              {/* Tab Content */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {activeRightTab === 'keys' && (
                  <ValueEditor 
                    selectedKey={selectedKey} 
                    forceEditMode={forceEditMode} 
                    onForceEditModeUsed={handleForceEditModeUsed} 
                  />
                )}
                {activeRightTab === 'pubsub' && <PubSubPanel />}
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