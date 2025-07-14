import { execSync } from 'child_process';
import { databaseService } from './database';
export interface DefaultRedisSettings {
  host: string;
  port: number;
  password?: string;
  enabled: boolean;
}
class SettingsService {
  private defaultSettings: DefaultRedisSettings = {
    host: 'localhost',
    port: 6379,
    password: undefined,
    enabled: false, // Will be set based on Redis installation check
  };
  constructor() {
    this.loadDefaultRedisSettings();
    // Check if Redis is installed and update enabled status accordingly
    if (!this.checkRedisInstalled()) {
      this.defaultSettings.enabled = false;
    }
  }
  private checkRedisInstalled(): boolean {
    try {
      execSync('redis-server --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
  private loadDefaultRedisSettings() {
    try {
      const settings = databaseService.getDefaultRedisSettings();
      if (settings) {
        this.defaultSettings = {
          host: settings.host ?? 'localhost',
          port: settings.port ?? 6379,
          password: settings.password ?? undefined,
          enabled: settings.enabled !== false && this.checkRedisInstalled(), // Only enable if Redis is installed
        };
      }
    } catch (error) {
      console.error('Failed to load default Redis settings:', error);
    }
  }
  getDefaultRedisSettings(): DefaultRedisSettings {
    return { ...this.defaultSettings };
  }
  updateDefaultRedisSettings(
    settings: Partial<DefaultRedisSettings>,
  ): DefaultRedisSettings {
    this.defaultSettings = {
      ...this.defaultSettings,
      ...settings,
    };
    // Save to database
    databaseService.saveDefaultRedisSettings(this.defaultSettings);
    return { ...this.defaultSettings };
  }
}
export const settingsService = new SettingsService();