import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { Header } from './components/Header';
import { ConnectionList } from './components/ConnectionList';
import { KeyList } from './components/KeyList';
import { ValueEditor } from './components/ValueEditor';
import { useStore } from './store/useStore';
import { useConnectionRestore } from './hooks/useConnectionRestore';

const queryClient = new QueryClient();

function App() {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const { theme, showConnectionsPanel } = useStore();
  
  // Restore connections on app load
  useConnectionRestore();

  useEffect(() => {
    // Apply theme on mount
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="h-screen flex flex-col bg-background text-foreground">
        <Header />
        <div className="flex-1 flex overflow-hidden">
          {showConnectionsPanel && <ConnectionList />}
          <div className="flex-1 flex">
            <div className={`${showConnectionsPanel ? 'w-96' : 'w-80'} border-r border-border`}>
              <KeyList onKeySelect={setSelectedKey} />
            </div>
            <ValueEditor selectedKey={selectedKey} />
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