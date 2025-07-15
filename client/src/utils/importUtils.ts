export interface ImportKeyData {
  key: string;
  value: any;
  type: 'string' | 'list' | 'set' | 'hash' | 'zset';
  ttl?: number;
}

export interface ParsedImportData {
  keys: ImportKeyData[];
  errors: Array<{ line?: number; message: string }>;
  format: 'json' | 'csv' | 'redis-cli' | 'unknown';
}

export interface ImportOptions {
  conflictResolution: 'skip' | 'overwrite';
  batchSize: number;
}

/**
 * Detects the file format based on content
 */
export const detectFileFormat = (
  content: string,
): 'json' | 'csv' | 'redis-cli' | 'unknown' => {
  const trimmed = content.trim();

  // Check for JSON
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // Continue to other formats
    }
  }

  // Check for Redis CLI commands
  if (/^(SET|GET|LPUSH|RPUSH|SADD|HMSET|ZADD|HSET|LSET)\s+/im.test(trimmed)) {
    return 'redis-cli';
  }

  // Check for CSV (look for comma-separated values and common headers)
  const lines = trimmed.split('\n');
  if (lines.length > 0) {
    const firstLine = lines[0].toLowerCase();
    if (
      firstLine.includes('key') &&
      firstLine.includes('type') &&
      firstLine.includes('value')
    ) {
      return 'csv';
    }
    // Also check if it looks like CSV format
    if (lines[0].split(',').length >= 3) {
      return 'csv';
    }
  }

  return 'unknown';
};

/**
 * Parses JSON format import data
 */
export const parseJsonImport = (content: string): ParsedImportData => {
  const result: ParsedImportData = {
    keys: [],
    errors: [],
    format: 'json',
  };

  try {
    const data = JSON.parse(content);

    // Handle single key format
    if (data.key && data.value && data.type) {
      result.keys.push({
        key: data.key,
        value: data.value,
        type: data.type,
        ttl: data.ttl,
      });
      return result;
    }

    // Handle bulk export format
    if (data.keys && Array.isArray(data.keys)) {
      data.keys.forEach((keyData: any, index: number) => {
        if (!keyData.key || !keyData.type || keyData.value === undefined) {
          result.errors.push({
            line: index + 1,
            message: `Missing required fields (key, type, value) in key object at index ${index}`,
          });
          return;
        }

        result.keys.push({
          key: keyData.key,
          value: keyData.value,
          type: keyData.type,
          ttl: keyData.ttl,
        });
      });
      return result;
    }

    // Handle array format
    if (Array.isArray(data)) {
      data.forEach((keyData: any, index: number) => {
        if (!keyData.key || !keyData.type || keyData.value === undefined) {
          result.errors.push({
            line: index + 1,
            message: `Missing required fields (key, type, value) in key object at index ${index}`,
          });
          return;
        }

        result.keys.push({
          key: keyData.key,
          value: keyData.value,
          type: keyData.type,
          ttl: keyData.ttl,
        });
      });
      return result;
    }

    result.errors.push({
      message:
        'Invalid JSON format. Expected object with "keys" array or direct array of key objects.',
    });
  } catch (error) {
    result.errors.push({
      message: `JSON parsing error: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    });
  }

  return result;
};

/**
 * Parses CSV header and returns column indices
 */
const parseCsvHeader = (headerLine: string): {
  keyIndex: number;
  typeIndex: number;
  valueIndex: number;
  ttlIndex: number;
} => {
  const header = headerLine.split(',').map((h) =>
    h
      .trim()
      .replace(/^"(.*)"$/, '$1')
      .toLowerCase(),
  );
  
  return {
    keyIndex: header.indexOf('key'),
    typeIndex: header.indexOf('type'),
    valueIndex: header.indexOf('value'),
    ttlIndex: header.indexOf('ttl'),
  };
};

/**
 * Validates CSV header has required columns
 */
const validateCsvHeader = (indices: {
  keyIndex: number;
  typeIndex: number;
  valueIndex: number;
}): boolean => {
  return indices.keyIndex !== -1 && indices.typeIndex !== -1 && indices.valueIndex !== -1;
};

/**
 * Parses a single CSV data row
 */
const parseCsvDataRow = (
  values: string[],
  indices: {
    keyIndex: number;
    typeIndex: number;
    valueIndex: number;
    ttlIndex: number;
  },
): { key: ImportKeyData; error?: string } => {
  const { keyIndex, typeIndex, valueIndex, ttlIndex } = indices;
  
  if (values.length <= Math.max(keyIndex, typeIndex, valueIndex)) {
    return { key: {} as ImportKeyData, error: 'Insufficient columns in row' };
  }

  const key = values[keyIndex];
  const type = values[typeIndex] as ImportKeyData['type'];
  let value = values[valueIndex];
  const ttl = ttlIndex >= 0 && values[ttlIndex] ? parseInt(values[ttlIndex]) : undefined;

  if (!key || !type || value === undefined) {
    return { key: {} as ImportKeyData, error: 'Missing required fields (key, type, value)' };
  }

  // Parse value based on type
  const parsedValue = parseValueByType(value, type);
  if (parsedValue.error) {
    return { key: {} as ImportKeyData, error: parsedValue.error };
  }

  return {
    key: {
      key,
      value: parsedValue.value,
      type,
      ttl: ttl && ttl > 0 ? ttl : undefined,
    },
  };
};

/**
 * Parses value based on Redis data type
 */
const parseValueByType = (
  value: string,
  type: ImportKeyData['type'],
): { value: any; error?: string } => {
  const complexTypes = ['hash', 'list', 'set', 'zset'];
  
  if (complexTypes.includes(type)) {
    try {
      return { value: JSON.parse(value) };
    } catch {
      return { value: null, error: `Invalid JSON value for type ${type}` };
    }
  }
  
  return { value };
};

/**
 * Parses CSV format import data
 */
export const parseCsvImport = (content: string): ParsedImportData => {
  const result: ParsedImportData = {
    keys: [],
    errors: [],
    format: 'csv',
  };

  const lines = content.trim().split('\n');
  if (lines.length === 0) {
    result.errors.push({ message: 'Empty CSV file' });
    return result;
  }

  // Parse and validate header
  const indices = parseCsvHeader(lines[0]);
  if (!validateCsvHeader(indices)) {
    result.errors.push({
      line: 1,
      message: 'CSV header must contain "Key", "Type", and "Value" columns',
    });
    return result;
  }

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    try {
      const values = parseCsvLine(line);
      const parsed = parseCsvDataRow(values, indices);
      
      if (parsed.error) {
        result.errors.push({
          line: i + 1,
          message: parsed.error,
        });
        continue;
      }

      result.keys.push(parsed.key);
    } catch (error) {
      result.errors.push({
        line: i + 1,
        message: `Error parsing row: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      });
    }
  }

  return result;
};

/**
 * Parses a CSV line respecting quoted fields
 */
const parseCsvLine = (line: string): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i += 2;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
        i++;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      result.push(current.trim());
      current = '';
      i++;
    } else {
      current += char;
      i++;
    }
  }

  result.push(current.trim());
  return result;
};

/**
 * Parses Redis CLI format import data
 */
export const parseRedisCliImport = (content: string): ParsedImportData => {
  const result: ParsedImportData = {
    keys: [],
    errors: [],
    format: 'redis-cli',
  };

  const lines = content.trim().split('\n');
  const keyMap = new Map<string, Partial<ImportKeyData>>();

  for (const [i, lineContent] of lines.entries()) {
    const line = lineContent.trim();
    if (!line || line.startsWith('#')) { continue; }

    try {
      const parsed = parseRedisCommand(line);
      if (!parsed?.key) { continue; }

      const existing = keyMap.get(parsed.key) ?? {};
      keyMap.set(parsed.key, { ...existing, ...parsed });
    } catch (error) {
      result.errors.push({
        line: i + 1,
        message: `Error parsing command: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      });
    }
  }

  // Convert map to array and validate
  for (const [key, data] of keyMap.entries()) {
    if (!data.type || data.value === undefined) {
      result.errors.push({
        message: `Incomplete data for key "${key}": missing type or value`,
      });
      continue;
    }

    result.keys.push({
      key,
      value: data.value,
      type: data.type,
      ttl: data.ttl,
    });
  }

  return result;
};

/**
 * Parses SET command
 */
const parseSetCommand = (parts: string[]): Partial<ImportKeyData> | null => {
  if (parts.length >= 3) {
    return {
      key: parts[1],
      value: parts[2],
      type: 'string',
    };
  }
  return null;
};

/**
 * Parses LPUSH/RPUSH command
 */
const parseListCommand = (parts: string[]): Partial<ImportKeyData> | null => {
  if (parts.length >= 3) {
    return {
      key: parts[1],
      value: parts.slice(2),
      type: 'list',
    };
  }
  return null;
};

/**
 * Parses SADD command
 */
const parseSetAddCommand = (parts: string[]): Partial<ImportKeyData> | null => {
  if (parts.length >= 3) {
    return {
      key: parts[1],
      value: parts.slice(2),
      type: 'set',
    };
  }
  return null;
};

/**
 * Parses HMSET/HSET command
 */
const parseHashCommand = (parts: string[]): Partial<ImportKeyData> | null => {
  if (parts.length >= 4 && parts.length % 2 === 0) {
    const value: Record<string, string> = {};
    for (let i = 2; i < parts.length; i += 2) {
      value[parts[i]] = parts[i + 1];
    }
    return {
      key: parts[1],
      value,
      type: 'hash',
    };
  }
  return null;
};

/**
 * Parses ZADD command
 */
const parseZaddCommand = (parts: string[]): Partial<ImportKeyData> | null => {
  if (parts.length >= 4 && parts.length % 2 === 0) {
    const value: Array<{ score: number; member: string }> = [];
    for (let i = 2; i < parts.length; i += 2) {
      value.push({
        score: parseFloat(parts[i]),
        member: parts[i + 1],
      });
    }
    return {
      key: parts[1],
      value,
      type: 'zset',
    };
  }
  return null;
};

/**
 * Parses EXPIRE command
 */
const parseExpireCommand = (parts: string[]): Partial<ImportKeyData> | null => {
  if (parts.length >= 3) {
    return {
      key: parts[1],
      ttl: parseInt(parts[2]),
    };
  }
  return null;
};

/**
 * Parses a single Redis command
 */
const parseRedisCommand = (command: string): Partial<ImportKeyData> | null => {
  const parts = parseCommandArgs(command);
  if (parts.length === 0) return null;

  const cmd = parts[0].toUpperCase();

  switch (cmd) {
    case 'SET':
      return parseSetCommand(parts);
    case 'LPUSH':
    case 'RPUSH':
      return parseListCommand(parts);
    case 'SADD':
      return parseSetAddCommand(parts);
    case 'HMSET':
    case 'HSET':
      return parseHashCommand(parts);
    case 'ZADD':
      return parseZaddCommand(parts);
    case 'EXPIRE':
      return parseExpireCommand(parts);
    default:
      return null;
  }
};

/**
 * Parses command arguments respecting quoted strings
 */
const parseCommandArgs = (command: string): string[] => {
  const args: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  for (const char of command) {
    if ((char === '"' || char === "'") && !inQuotes) {
      inQuotes = true;
      quoteChar = char;
    } else if (char === quoteChar && inQuotes) {
      inQuotes = false;
      quoteChar = '';
    } else if (char === ' ' && !inQuotes) {
      if (current.trim()) {
        args.push(current.trim());
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    args.push(current.trim());
  }

  return args;
};

/**
 * Validates key field
 */
const validateKey = (item: ImportKeyData, index: number): { index: number; message: string } | null => {
  if (!item.key || typeof item.key !== 'string') {
    return { index, message: 'Invalid or missing key' };
  }
  return null;
};

/**
 * Validates type field
 */
const validateType = (item: ImportKeyData, index: number): { index: number; message: string } | null => {
  if (!['string', 'list', 'set', 'hash', 'zset'].includes(item.type)) {
    return {
      index,
      message: 'Invalid type. Must be one of: string, list, set, hash, zset',
    };
  }
  return null;
};

/**
 * Validates value field based on type
 */
const validateValue = (item: ImportKeyData, index: number): { index: number; message: string } | null => {
  if (item.value === undefined || item.value === null) {
    return { index, message: 'Missing value' };
  }

  switch (item.type) {
    case 'list':
    case 'set':
      if (!Array.isArray(item.value)) {
        return {
          index,
          message: `Value for ${item.type} must be an array`,
        };
      }
      break;
    case 'hash':
      if (typeof item.value !== 'object' || Array.isArray(item.value)) {
        return { index, message: 'Value for hash must be an object' };
      }
      break;
    case 'zset':
      if (
        !Array.isArray(item.value) ||
        !item.value.every(
          (v) => typeof v === 'object' && 'score' in v && 'member' in v,
        )
      ) {
        return {
          index,
          message: 'Value for zset must be an array of {score, member} objects',
        };
      }
      break;
  }
  return null;
};

/**
 * Validates TTL field
 */
const validateTtl = (item: ImportKeyData, index: number): { index: number; message: string } | null => {
  if (
    item.ttl !== undefined &&
    (typeof item.ttl !== 'number' || item.ttl < 0)
  ) {
    return { index, message: 'TTL must be a positive number' };
  }
  return null;
};

/**
 * Validates import data
 */
export const validateImportData = (
  data: ImportKeyData[],
): Array<{ index: number; message: string }> => {
  const errors: Array<{ index: number; message: string }> = [];

  data.forEach((item, index) => {
    const validators = [validateKey, validateType, validateValue, validateTtl];
    
    for (const validator of validators) {
      const error = validator(item, index);
      if (error) {
        errors.push(error);
      }
    }
  });

  return errors;
};

/**
 * Main function to parse import file content
 */
export const parseImportFile = (
  content: string,
  format?: string,
): ParsedImportData => {
  const detectedFormat = format ?? detectFileFormat(content);

  switch (detectedFormat) {
    case 'json':
      return parseJsonImport(content);
    case 'csv':
      return parseCsvImport(content);
    case 'redis-cli':
      return parseRedisCliImport(content);
    default:
      return {
        keys: [],
        errors: [{ message: 'Unknown or unsupported file format' }],
        format: 'unknown',
      };
  }
};
