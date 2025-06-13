import { RedisConnection } from '../types';

const CONNECTIONS_STORAGE_KEY = 'redisx-connections';
const ACTIVE_CONNECTION_STORAGE_KEY = 'redisx-active-connection';

export const saveConnections = (connections: RedisConnection[]): void => {
  try {
    // Save all connection data including passwords
    localStorage.setItem(CONNECTIONS_STORAGE_KEY, JSON.stringify(connections));
  } catch (error) {
    console.error('Failed to save connections to localStorage:', error);
  }
};

export const loadConnections = (): RedisConnection[] => {
  try {
    const stored = localStorage.getItem(CONNECTIONS_STORAGE_KEY);
    if (!stored) return [];
    
    const connections = JSON.parse(stored);
    return Array.isArray(connections) ? connections : [];
  } catch (error) {
    console.error('Failed to load connections from localStorage:', error);
    return [];
  }
};

export const saveActiveConnection = (connectionId: string | null): void => {
  try {
    if (connectionId) {
      localStorage.setItem(ACTIVE_CONNECTION_STORAGE_KEY, connectionId);
    } else {
      localStorage.removeItem(ACTIVE_CONNECTION_STORAGE_KEY);
    }
  } catch (error) {
    console.error('Failed to save active connection to localStorage:', error);
  }
};

export const loadActiveConnection = (): string | null => {
  try {
    return localStorage.getItem(ACTIVE_CONNECTION_STORAGE_KEY);
  } catch (error) {
    console.error('Failed to load active connection from localStorage:', error);
    return null;
  }
};

export const removeConnection = (connectionId: string): void => {
  try {
    const connections = loadConnections();
    const updatedConnections = connections.filter(conn => conn.id !== connectionId);
    saveConnections(updatedConnections);
    
    // If the removed connection was active, clear active connection
    const activeConnectionId = loadActiveConnection();
    if (activeConnectionId === connectionId) {
      saveActiveConnection(null);
    }
  } catch (error) {
    console.error('Failed to remove connection from localStorage:', error);
  }
};