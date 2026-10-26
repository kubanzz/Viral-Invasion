export interface DepthEntity { id: string; y: number }
/** Original order resolves ties, avoiding flicker when foot anchors coincide. */
export function depthSort<T extends DepthEntity>(entities: readonly T[]): T[] {
  return entities.map((entity, index) => ({ entity, index })).sort((a, b) => a.entity.y - b.entity.y || a.index - b.index).map(item => item.entity);
}
