import { create } from 'zustand';
import { RedisConnection } from '../types';
import { saveConnections, loadConnections, saveActiveConnection, loadActiveConnection, removeConnection as removeStoredConnection } from '../utils/connectionStorage';

interface AppState {
  connections: RedisConnection[];
  activeConnectionId: string | null;
  selectedKeys: Set<string>;
  theme: 'light' | 'dark';
  showConnectionsPanel: boolean;
  
  setConnections: (connections: RedisConnection[]) => void;
  addConnection: (connection: RedisConnection) => void;
  removeConnection: (id: string) => void;
  setActiveConnection: (id: string | null) => void;
  toggleKeySelection: (key: string) => void;
  selectAllKeys: (keys: string[]) => void;
  clearSelection: () => void;
  toggleTheme: () => void;
  toggleConnectionsPanel: () => void;
}

export const useStore = create<AppState>((set) => ({
  connections: loadConnections(),
  activeConnectionId: loadActiveConnection(),
  selectedKeys: new Set(),
  theme: (localStorage.getItem('theme') as 'light' | 'dark') || 'light',
  showConnectionsPanel: (localStorage.getItem('showConnectionsPanel') !== 'false'), // Default to true
  
  setConnections: (connections) => {
    saveConnections(connections);
    set({ connections });
  },
  
  addConnection: (connection) => {
    set((state) => {
      const newConnections = [...state.connections, connection];
      saveConnections(newConnections);
      return { connections: newConnections };
    });
  },
  
  removeConnection: (id) => {
    removeStoredConnection(id);
    set((state) => ({
      connections: state.connections.filter((c) => c.id !== id),
      activeConnectionId: state.activeConnectionId === id ? null : state.activeConnectionId,
    }));
  },
  
  setActiveConnection: (id) => {
    saveActiveConnection(id);
    set({ activeConnectionId: id });
  },
  
  toggleKeySelection: (key) =>
    set((state) => {
      const newSelection = new Set(state.selectedKeys);
      if (newSelection.has(key)) {
        newSelection.delete(key);
      } else {
        newSelection.add(key);
      }
      return { selectedKeys: newSelection };
    }),
  
  selectAllKeys: (keys) =>
    set({ selectedKeys: new Set(keys) }),
  
  clearSelection: () => set({ selectedKeys: new Set() }),
  
  toggleTheme: () =>
    set((state) => {
      const newTheme = state.theme === 'light' ? 'dark' : 'light';
      localStorage.setItem('theme', newTheme);
      document.documentElement.classList.toggle('dark');
      return { theme: newTheme };
    }),
  
  toggleConnectionsPanel: () =>
    set((state) => {
      const newShowPanel = !state.showConnectionsPanel;
      localStorage.setItem('showConnectionsPanel', newShowPanel.toString());
      return { showConnectionsPanel: newShowPanel };
    }),
}));