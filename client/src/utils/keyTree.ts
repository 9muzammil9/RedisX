import { RedisKey } from '../types';

export interface KeyTreeNode {
  id: string;
  name: string;
  fullPath: string;
  isKey: boolean;
  children: KeyTreeNode[];
  keyData?: RedisKey;
  level: number;
}

export interface KeyTreeState {
  [nodeId: string]: boolean; // expanded state
}

export const buildKeyTree = (
  keys: RedisKey[],
  separator = ':',
): KeyTreeNode[] => {
  const nodeMap = new Map<string, KeyTreeNode>();

  // First pass: create all nodes
  keys.forEach((key) => {
    const parts = key.key.split(separator);
    let currentPath = '';

    parts.forEach((part, index) => {
      const isLast = index === parts.length - 1;
      currentPath = currentPath ? `${currentPath}${separator}${part}` : part;

      if (!nodeMap.has(currentPath)) {
        nodeMap.set(currentPath, {
          id: currentPath,
          name: part,
          fullPath: currentPath,
          isKey: isLast,
          children: [],
          keyData: isLast ? key : undefined,
          level: index,
        });
      }

      // Update if this is the actual key
      if (isLast) {
        const node = nodeMap.get(currentPath)!;
        node.isKey = true;
        node.keyData = key;
      }
    });
  });

  // Second pass: build parent-child relationships
  const rootNodes: KeyTreeNode[] = [];

  nodeMap.forEach((node) => {
    const parts = node.fullPath.split(separator);
    if (parts.length === 1) {
      // Root level node
      rootNodes.push(node);
    } else {
      // Find parent
      const parentPath = parts.slice(0, -1).join(separator);
      const parent = nodeMap.get(parentPath);
      if (parent) {
        parent.children.push(node);
      }
    }
  });

  // Sort function
  const sortNodes = (nodes: KeyTreeNode[]): KeyTreeNode[] => {
    return nodes
      .map((node) => ({
        ...node,
        children: sortNodes(node.children),
      }))
      .sort((a, b) => {
        // Put non-keys (folders) first, then keys
        if (!a.isKey && b.isKey) { return -1; }
        if (a.isKey && !b.isKey) { return 1; }
        return a.name.localeCompare(b.name);
      });
  };

  return sortNodes(rootNodes);
};

export const flattenTreeForSearch = (nodes: KeyTreeNode[]): KeyTreeNode[] => {
  const result: KeyTreeNode[] = [];

  const traverse = (node: KeyTreeNode) => {
    result.push(node);
    node.children.forEach(traverse);
  };

  nodes.forEach(traverse);
  return result;
};

export const getAllKeys = (nodes: KeyTreeNode[]): RedisKey[] => {
  const keys: RedisKey[] = [];

  const traverse = (node: KeyTreeNode) => {
    if (node.isKey && node.keyData) {
      keys.push(node.keyData);
    }
    node.children.forEach(traverse);
  };

  nodes.forEach(traverse);
  return keys;
};

export const getExpandedPaths = (
  selectedKeys: Set<string>,
  nodes: KeyTreeNode[],
): Set<string> => {
  const expandedPaths = new Set<string>();

  const findParentPaths = (node: KeyTreeNode, targetKeys: Set<string>) => {
    if (node.isKey && targetKeys.has(node.keyData!.key)) {
      // Mark all parent paths as expanded
      const parts = node.fullPath.split(':');
      for (let i = 1; i < parts.length; i++) {
        const parentPath = parts.slice(0, i).join(':');
        expandedPaths.add(parentPath);
      }
    }
    node.children.forEach((child) => findParentPaths(child, targetKeys));
  };

  nodes.forEach((node) => findParentPaths(node, selectedKeys));
  return expandedPaths;
};
