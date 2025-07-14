import React, { useCallback, useRef } from 'react';

interface UseShiftMultiSelectProps<T> {
  items: T[];
  selectedItems?: Set<T>;
  onToggleSelection: (item: T) => void;
  onSelectRange: (items: T[]) => void;
  getItemKey?: (item: T) => string;
}

export function useShiftMultiSelect<T>({
  items,
  onToggleSelection,
  onSelectRange,
}: UseShiftMultiSelectProps<T>) {
  const lastSelectedIndex = useRef<number>(-1);
  const lastSelectedItem = useRef<T | null>(null);

  const handleItemClick = useCallback(
    (item: T, index: number, event: React.MouseEvent) => {
      if (event.shiftKey && lastSelectedIndex.current !== -1) {
        // Shift+click: select range
        const startIndex = Math.min(lastSelectedIndex.current, index);
        const endIndex = Math.max(lastSelectedIndex.current, index);
        const rangeItems = items.slice(startIndex, endIndex + 1);
        
        onSelectRange(rangeItems);
      } else {
        // Regular click: toggle single item
        onToggleSelection(item);
        lastSelectedIndex.current = index;
        lastSelectedItem.current = item;
      }
    },
    [items, onToggleSelection, onSelectRange],
  );

  const handleItemKeyDown = useCallback(
    (item: T, index: number, event: React.KeyboardEvent) => {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        if (event.shiftKey && lastSelectedIndex.current !== -1) {
          // Shift+Space/Enter: select range
          const startIndex = Math.min(lastSelectedIndex.current, index);
          const endIndex = Math.max(lastSelectedIndex.current, index);
          const rangeItems = items.slice(startIndex, endIndex + 1);
          
          onSelectRange(rangeItems);
        } else {
          // Regular Space/Enter: toggle single item
          onToggleSelection(item);
          lastSelectedIndex.current = index;
          lastSelectedItem.current = item;
        }
      }
    },
    [items, onToggleSelection, onSelectRange],
  );

  const resetLastSelected = useCallback(() => {
    lastSelectedIndex.current = -1;
    lastSelectedItem.current = null;
  }, []);

  const updateLastSelected = useCallback((item: T, index: number) => {
    lastSelectedIndex.current = index;
    lastSelectedItem.current = item;
  }, []);

  return {
    handleItemClick,
    handleItemKeyDown,
    resetLastSelected,
    updateLastSelected,
    lastSelectedItem: lastSelectedItem.current,
  };
}