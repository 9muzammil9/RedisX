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
    enabled: false // Disabled by default to avoid conflicts with managed instances
  };

  constructor() {
    this.loadDefaultRedisSettings();
  }

  private loadDefaultRedisSettings() {
    try {
      const settings = databaseService.getDefaultRedisSettings();
      if (settings) {
        this.defaultSettings = {
          host: settings.host ?? 'localhost',
          port: settings.port ?? 6379,
          password: settings.password ?? undefined,
          enabled: settings.enabled !== false // default to true
        };
      }
    } catch (error) {
      console.error('Failed to load default Redis settings:', error);
    }
  }

  getDefaultRedisSettings(): DefaultRedisSettings {
    return { ...this.defaultSettings };
  }

  updateDefaultRedisSettings(settings: Partial<DefaultRedisSettings>): DefaultRedisSettings {
    this.defaultSettings = {
      ...this.defaultSettings,
      ...settings
    };

    // Save to database
    databaseService.saveDefaultRedisSettings(this.defaultSettings);

    return { ...this.defaultSettings };
  }
}

export const settingsService = new SettingsService();