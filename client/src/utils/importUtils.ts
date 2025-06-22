export interface ImportKeyData {
  key: string;
  value: any;
  type: "string" | "list" | "set" | "hash" | "zset";
  ttl?: number;
}

export interface ParsedImportData {
  keys: ImportKeyData[];
  errors: Array<{ line?: number; message: string }>;
  format: "json" | "csv" | "redis-cli" | "unknown";
}

export interface ImportOptions {
  conflictResolution: "skip" | "overwrite";
  batchSize: number;
}

/**
 * Detects the file format based on content
 */
export const detectFileFormat = (
  content: string
): "json" | "csv" | "redis-cli" | "unknown" => {
  const trimmed = content.trim();

  // Check for JSON
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      // Continue to other formats
    }
  }

  // Check for Redis CLI commands
  if (/^(SET|GET|LPUSH|RPUSH|SADD|HMSET|ZADD|HSET|LSET)\s+/im.test(trimmed)) {
    return "redis-cli";
  }

  // Check for CSV (look for comma-separated values and common headers)
  const lines = trimmed.split("\n");
  if (lines.length > 0) {
    const firstLine = lines[0].toLowerCase();
    if (
      firstLine.includes("key") &&
      firstLine.includes("type") &&
      firstLine.includes("value")
    ) {
      return "csv";
    }
    // Also check if it looks like CSV format
    if (lines[0].split(",").length >= 3) {
      return "csv";
    }
  }

  return "unknown";
};

/**
 * Parses JSON format import data
 */
export const parseJsonImport = (content: string): ParsedImportData => {
  const result: ParsedImportData = {
    keys: [],
    errors: [],
    format: "json",
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
        error instanceof Error ? error.message : "Unknown error"
      }`,
    });
  }

  return result;
};

/**
 * Parses CSV format import data
 */
export const parseCsvImport = (content: string): ParsedImportData => {
  const result: ParsedImportData = {
    keys: [],
    errors: [],
    format: "csv",
  };

  const lines = content.trim().split("\n");
  if (lines.length === 0) {
    result.errors.push({ message: "Empty CSV file" });
    return result;
  }

  // Parse header
  const header = lines[0].split(",").map((h) =>
    h
      .trim()
      .replace(/^"(.*)"$/, "$1")
      .toLowerCase()
  );
  const keyIndex = header.indexOf("key");
  const typeIndex = header.indexOf("type");
  const valueIndex = header.indexOf("value");
  const ttlIndex = header.indexOf("ttl");

  if (keyIndex === -1 || typeIndex === -1 || valueIndex === -1) {
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

      if (values.length <= Math.max(keyIndex, typeIndex, valueIndex)) {
        result.errors.push({
          line: i + 1,
          message: "Insufficient columns in row",
        });
        continue;
      }

      const key = values[keyIndex];
      const type = values[typeIndex] as ImportKeyData["type"];
      let value = values[valueIndex];
      const ttl =
        ttlIndex >= 0 && values[ttlIndex]
          ? parseInt(values[ttlIndex])
          : undefined;

      if (!key || !type || value === undefined) {
        result.errors.push({
          line: i + 1,
          message: "Missing required fields (key, type, value)",
        });
        continue;
      }

      // Parse value based on type
      try {
        if (
          type === "hash" ||
          type === "list" ||
          type === "set" ||
          type === "zset"
        ) {
          value = JSON.parse(value);
        }
      } catch {
        result.errors.push({
          line: i + 1,
          message: `Invalid JSON value for type ${type}`,
        });
        continue;
      }

      result.keys.push({
        key,
        value,
        type,
        ttl: ttl && ttl > 0 ? ttl : undefined,
      });
    } catch (error) {
      result.errors.push({
        line: i + 1,
        message: `Error parsing row: ${
          error instanceof Error ? error.message : "Unknown error"
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
  let current = "";
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
    } else if (char === "," && !inQuotes) {
      // Field separator
      result.push(current.trim());
      current = "";
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
    format: "redis-cli",
  };

  const lines = content.trim().split("\n");
  const keyMap = new Map<string, Partial<ImportKeyData>>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) continue;

    try {
      const parsed = parseRedisCommand(line);
      if (!parsed) continue;

      const existing = keyMap.get(parsed.key) || {};
      keyMap.set(parsed.key, { ...existing, ...parsed });
    } catch (error) {
      result.errors.push({
        line: i + 1,
        message: `Error parsing command: ${
          error instanceof Error ? error.message : "Unknown error"
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
 * Parses a single Redis command
 */
const parseRedisCommand = (command: string): Partial<ImportKeyData> | null => {
  const parts = parseCommandArgs(command);
  if (parts.length === 0) return null;

  const cmd = parts[0].toUpperCase();

  switch (cmd) {
    case "SET":
      if (parts.length >= 3) {
        return {
          key: parts[1],
          value: parts[2],
          type: "string",
        };
      }
      break;

    case "LPUSH":
    case "RPUSH":
      if (parts.length >= 3) {
        return {
          key: parts[1],
          value: parts.slice(2),
          type: "list",
        };
      }
      break;

    case "SADD":
      if (parts.length >= 3) {
        return {
          key: parts[1],
          value: parts.slice(2),
          type: "set",
        };
      }
      break;

    case "HMSET":
    case "HSET":
      if (parts.length >= 4 && parts.length % 2 === 0) {
        const value: Record<string, string> = {};
        for (let i = 2; i < parts.length; i += 2) {
          value[parts[i]] = parts[i + 1];
        }
        return {
          key: parts[1],
          value,
          type: "hash",
        };
      }
      break;

    case "ZADD":
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
          type: "zset",
        };
      }
      break;

    case "EXPIRE":
      if (parts.length >= 3) {
        return {
          key: parts[1],
          ttl: parseInt(parts[2]),
        };
      }
      break;
  }

  return null;
};

/**
 * Parses command arguments respecting quoted strings
 */
const parseCommandArgs = (command: string): string[] => {
  const args: string[] = [];
  let current = "";
  let inQuotes = false;
  let quoteChar = "";

  for (let i = 0; i < command.length; i++) {
    const char = command[i];

    if ((char === '"' || char === "'") && !inQuotes) {
      inQuotes = true;
      quoteChar = char;
    } else if (char === quoteChar && inQuotes) {
      inQuotes = false;
      quoteChar = "";
    } else if (char === " " && !inQuotes) {
      if (current.trim()) {
        args.push(current.trim());
        current = "";
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
 * Validates import data
 */
export const validateImportData = (
  data: ImportKeyData[]
): Array<{ index: number; message: string }> => {
  const errors: Array<{ index: number; message: string }> = [];

  data.forEach((item, index) => {
    // Validate key
    if (!item.key || typeof item.key !== "string") {
      errors.push({ index, message: "Invalid or missing key" });
    }

    // Validate type
    if (!["string", "list", "set", "hash", "zset"].includes(item.type)) {
      errors.push({
        index,
        message: "Invalid type. Must be one of: string, list, set, hash, zset",
      });
    }

    // Validate value based on type
    if (item.value === undefined || item.value === null) {
      errors.push({ index, message: "Missing value" });
    } else {
      switch (item.type) {
        case "list":
        case "set":
          if (!Array.isArray(item.value)) {
            errors.push({
              index,
              message: `Value for ${item.type} must be an array`,
            });
          }
          break;
        case "hash":
          if (typeof item.value !== "object" || Array.isArray(item.value)) {
            errors.push({ index, message: "Value for hash must be an object" });
          }
          break;
        case "zset":
          if (
            !Array.isArray(item.value) ||
            !item.value.every(
              (v) => typeof v === "object" && "score" in v && "member" in v
            )
          ) {
            errors.push({
              index,
              message:
                "Value for zset must be an array of {score, member} objects",
            });
          }
          break;
      }
    }

    // Validate TTL
    if (
      item.ttl !== undefined &&
      (typeof item.ttl !== "number" || item.ttl < 0)
    ) {
      errors.push({ index, message: "TTL must be a positive number" });
    }
  });

  return errors;
};

/**
 * Main function to parse import file content
 */
export const parseImportFile = (
  content: string,
  format?: string
): ParsedImportData => {
  const detectedFormat = format || detectFileFormat(content);

  switch (detectedFormat) {
    case "json":
      return parseJsonImport(content);
    case "csv":
      return parseCsvImport(content);
    case "redis-cli":
      return parseRedisCliImport(content);
    default:
      return {
        keys: [],
        errors: [{ message: "Unknown or unsupported file format" }],
        format: "unknown",
      };
  }
};
