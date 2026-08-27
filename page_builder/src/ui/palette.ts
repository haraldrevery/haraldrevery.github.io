/* Block-type pickers (the "+" palette and the column-content picker). */
import { listModal } from "./dom";
import { BLOCK_LABELS, EMBEDDABLE_LABELS } from "../blocks/defs";
import type { BlockType } from "../blocks/model";

export function showBlockPicker(): Promise<BlockType | null> {
  return listModal<BlockType>(
    "Insert block",
    BLOCK_LABELS.map(([value, label]) => ({ label, value }))
  );
}

export function showColumnTypePicker(): Promise<BlockType | null> {
  return listModal<BlockType>(
    "Column content",
    EMBEDDABLE_LABELS.map(([value, label]) => ({ label, value }))
  );
}
