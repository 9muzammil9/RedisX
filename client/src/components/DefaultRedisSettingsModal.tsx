import React, { useState, useEffect } from 'react';
import { X, Check, AlertCircle, Eye, EyeOff } from 'lucide-react';

interface DefaultRedisSettings {
  host: string;
  port: number;
  password?: string;
  enabled: boolean;
}

interface DefaultRedisSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: DefaultRedisSettings) => void;
}

export const DefaultRedisSettingsModal: React.FC<DefaultRedisSettingsModalProps> = ({
  isOpen,
  onClose,
  onSave
}) => {
  const [settings, setSettings] = useState<DefaultRedisSettings>({
    host: 'localhost',
    port: 6379,
    password: '',
    enabled: true
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  // Load current settings when modal opens
  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/settings/default-redis');
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    
    try {
      const response = await fetch('/api/settings/default-redis/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: settings.host,
          port: settings.port,
          password: settings.password || undefined
        })
      });
      
      const result = await response.json();
      setTestResult(result);
    } catch (error) {
      setTestResult({
        success: false,
        message: 'Failed to test connection'
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/settings/default-redis', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      
      if (response.ok) {
        const updatedSettings = await response.json();
        onSave(updatedSettings);
        onClose();
      } else {
        throw new Error('Failed to save settings');
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-semibold text-foreground">
            Default Redis Settings
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Enable/Disable */}
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="enabled"
              checked={settings.enabled}
              onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="enabled" className="text-sm font-medium text-foreground">
              Enable default Redis detection
            </label>
          </div>

          {settings.enabled && (
            <>
              {/* Host */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Host
                </label>
                <input
                  type="text"
                  value={settings.host}
                  onChange={(e) => setSettings({ ...settings, host: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                  placeholder="localhost"
                />
              </div>

              {/* Port */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Port
                </label>
                <input
                  type="number"
                  value={settings.port}
                  onChange={(e) => setSettings({ ...settings, port: parseInt(e.target.value) || 6379 })}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                  placeholder="6379"
                  min="1"
                  max="65535"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Password (optional)
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={settings.password || ''}
                    onChange={(e) => setSettings({ ...settings, password: e.target.value || undefined })}
                    className="w-full px-3 py-2 pr-10 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                    placeholder="Leave empty if no password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Test Connection */}
              <div>
                <button
                  onClick={handleTest}
                  disabled={isTesting}
                  className="w-full px-4 py-2 bg-muted text-muted-foreground rounded-md hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isTesting ? 'Testing...' : 'Test Connection'}
                </button>
                
                {testResult && (
                  <div className={`mt-2 p-3 rounded-md flex items-center space-x-2 ${
                    testResult.success 
                      ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-400 border border-green-200 dark:border-green-800'
                      : 'bg-destructive/10 text-destructive border border-destructive/20'
                  }`}>
                    {testResult.success ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <AlertCircle className="w-4 h-4" />
                    )}
                    <span className="text-sm">{testResult.message}</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end space-x-3 p-6 border-t border-border bg-muted/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-foreground bg-background border border-border rounded-md hover:bg-muted focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary border border-transparent rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
};