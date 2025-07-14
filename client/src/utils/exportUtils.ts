export type ExportFormat = 'json' | 'redis-cli' | 'csv';

export interface ExportedKey {
  key: string;
  value: any;
  type: string;
  ttl: number;
  timestamp: string;
}

export interface ExportOptions {
  format?: ExportFormat;
  includeMetadata?: boolean;
  prettyPrint?: boolean;
}

/**
 * Downloads a file with the given content
 */
export const downloadFile = (
  content: string,
  filename: string,
  mimeType: string = 'application/json',
) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();

  // Cleanup
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Sanitizes a filename by removing invalid characters
 */
export const sanitizeFilename = (filename: string): string => {
  return filename
    .replace(/[<>:"/\\|?*]/g, '_') // Replace invalid characters with underscore
    .replace(/\s+/g, '_') // Replace spaces with underscore
    .substring(0, 255); // Limit length
};

/**
 * Formats a Redis key for export based on the specified format
 */
export const formatKeyForExport = (
  keyData: ExportedKey,
  format: ExportFormat = 'json',
  options: ExportOptions = {},
): string => {
  const { includeMetadata = true, prettyPrint = true } = options;

  switch (format) {
    case 'json': {
      const exportData: any = {
        key: keyData.key,
        value: keyData.value,
        type: keyData.type,
      };

      if (includeMetadata) {
        exportData.ttl = keyData.ttl;
        exportData.exportedAt = keyData.timestamp;
      }

      return prettyPrint
        ? JSON.stringify(exportData, null, 2)
        : JSON.stringify(exportData);
    }

    case 'redis-cli': {
      return formatAsRedisCLI(keyData);
    }

    case 'csv': {
      const ttlValue = includeMetadata ? keyData.ttl : '';
      const timestampValue = includeMetadata ? keyData.timestamp : '';
      const valueStr =
        typeof keyData.value === 'string'
          ? `"${keyData.value.replace(/"/g, '""')}"` // Escape quotes in CSV
          : `"${JSON.stringify(keyData.value).replace(/"/g, '""')}"`;

      return `"${keyData.key}","${keyData.type}",${valueStr},"${ttlValue}","${timestampValue}"`;
    }

    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
};

/**
 * Formats multiple keys for export
 */
export const formatKeysForExport = (
  keys: ExportedKey[],
  format: ExportFormat = 'json',
  options: ExportOptions = {},
): string => {
  const { prettyPrint = true } = options;

  switch (format) {
    case 'json': {
      const exportData = {
        exported_at: new Date().toISOString(),
        total_keys: keys.length,
        keys: keys.map((key) => {
          const keyData: any = {
            key: key.key,
            value: key.value,
            type: key.type,
          };

          if (options.includeMetadata) {
            keyData.ttl = key.ttl;
          }

          return keyData;
        }),
      };

      return prettyPrint
        ? JSON.stringify(exportData, null, 2)
        : JSON.stringify(exportData);
    }

    case 'redis-cli': {
      return keys.map((key) => formatAsRedisCLI(key)).join('\n');
    }

    case 'csv': {
      const headers = options.includeMetadata
        ? 'Key,Type,Value,TTL,Exported At'
        : 'Key,Type,Value';

      const rows = keys.map((key) => formatKeyForExport(key, 'csv', options));
      return [headers, ...rows].join('\n');
    }

    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
};

/**
 * Formats a key as Redis CLI command
 */
const formatAsRedisCLI = (keyData: ExportedKey): string => {
  const { key, value, type, ttl } = keyData;

  let command = '';

  switch (type) {
    case 'string':
      command = `SET "${key}" "${value}"`;
      break;

    case 'list':
      if (Array.isArray(value)) {
        const values = value.map((v) => `"${v}"`).join(' ');
        command = `LPUSH "${key}" ${values}`;
      }
      break;

    case 'set':
      if (Array.isArray(value)) {
        const values = value.map((v) => `"${v}"`).join(' ');
        command = `SADD "${key}" ${values}`;
      }
      break;

    case 'hash':
      if (typeof value === 'object' && value !== null) {
        const pairs = Object.entries(value)
          .map(([k, v]) => `"${k}" "${v}"`)
          .join(' ');
        command = `HMSET "${key}" ${pairs}`;
      }
      break;

    case 'zset':
      if (Array.isArray(value)) {
        const pairs = value
          .map((item: any) => `${item.score} "${item.member}"`)
          .join(' ');
        command = `ZADD "${key}" ${pairs}`;
      }
      break;

    default:
      command = `# Unsupported type: ${type} for key: ${key}`;
  }

  // Add TTL if present
  if (ttl > 0) {
    command += `\nEXPIRE "${key}" ${ttl}`;
  }

  return command;
};

/**
 * Exports a single key to file
 */
export const exportSingleKey = (
  keyData: ExportedKey,
  options: ExportOptions = {},
) => {
  const { format = 'json' } = options;
  const content = formatKeyForExport(keyData, format, options);
  const extension = format === 'redis-cli' ? 'redis' : format;
  const filename = `${sanitizeFilename(keyData.key)}.${extension}`;

  const mimeTypes = {
    json: 'application/json',
    csv: 'text/csv',
    'redis-cli': 'text/plain',
  };

  downloadFile(content, filename, mimeTypes[format]);
};

/**
 * Exports multiple keys to file
 */
export const exportMultipleKeys = (
  keys: ExportedKey[],
  filename: string = 'redis-keys',
  options: ExportOptions = {},
) => {
  const { format = 'json' } = options;
  const content = formatKeysForExport(keys, format, options);
  const extension = format === 'redis-cli' ? 'redis' : format;
  const fullFilename = `${sanitizeFilename(filename)}.${extension}`;

  const mimeTypes = {
    json: 'application/json',
    csv: 'text/csv',
    'redis-cli': 'text/plain',
  };

  downloadFile(content, fullFilename, mimeTypes[format]);
};

/**
 * Copies text to clipboard
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      // Fallback for older browsers or non-HTTPS
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();

      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    }
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    return false;
  }
};
