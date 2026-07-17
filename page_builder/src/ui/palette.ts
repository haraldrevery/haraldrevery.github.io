/* Block-type picker (the "+" palette). */
import { listModal } from "./dom";
import { BLOCK_LABELS } from "../blocks/model";
import type { BlockType } from "../blocks/model";

export function showBlockPicker(): Promise<BlockType | null> {
  return listModal<BlockType>(
    "Insert block",
    BLOCK_LABELS.map(([value, label]) => ({ label, value }))
  );
}
