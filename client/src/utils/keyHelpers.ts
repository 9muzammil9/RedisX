export function parseNestedKeys(keys: string[]): Map<string, string[]> {
  const nested = new Map<string, string[]>();

  keys.forEach((key) => {
    const parts = key.split(':');
    if (parts.length > 1) {
      const namespace = parts[0];
      if (!nested.has(namespace)) {
        nested.set(namespace, []);
      }
      nested.get(namespace)!.push(key);
    } else {
      if (!nested.has('')) {
        nested.set('', []);
      }
      nested.get('')!.push(key);
    }
  });

  return nested;
}

export function getKeyNamespace(key: string): string {
  const index = key.indexOf(':');
  return index > -1 ? key.substring(0, index) : '';
}

export function getKeyWithoutNamespace(key: string): string {
  const index = key.indexOf(':');
  return index > -1 ? key.substring(index + 1) : key;
}
