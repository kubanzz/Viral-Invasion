import { describe, expect, it } from 'vitest';
import { INTRO_FACILITY_IDS } from '../../src/game/campProgression';
import { emptyCampProfile, type CampProfileSnapshot } from '../../src/meta/campProfile';
import { campEquipmentMarkup } from '../../src/ui/campEquipmentHud';
import { createCampEquipmentState } from '../../src/ui/campEquipmentState';

function camp(): CampProfileSnapshot {
  const data = emptyCampProfile();
  Object.assign(data, { campUnlocked: true, campIntroSeen: true, prologue: 'ready', builtFacilities: [...INTRO_FACILITY_IDS] });
  return { data, status: { mode: 'persistent', code: 'loaded', message: '已保存' } };
}
function inventory(snapshot: CampProfileSnapshot, itemId: string): string {
  return campEquipmentMarkup(snapshot, 'warehouse', { ...createCampEquipmentState(snapshot), warehouseTab: 'inventory', inventoryItemId: itemId });
}
function decomposeButton(html: string): string { return html.match(/<button\b[^>]*data-action="camp-decompose"[^>]*>/)?.[0] ?? ''; }

describe('inventory model use and instance protections', () => {
  it('labels an equipped weapon model without calling every duplicate equipped', () => {
    const snapshot = camp(); snapshot.data.inventory.push({ id: 'spare', kind: 'weapon', templateId: 'steady', rarity: 'blue', repaired: true });
    const spare = inventory(snapshot, 'spare');
    expect(spare).toContain('配装使用此型号');
    expect(spare).toContain('按已修复的最高品质生效');
    expect(decomposeButton(spare)).not.toContain('disabled');
    expect(spare).not.toContain('配装中');
    const strongest = inventory(snapshot, 'starter:steady');
    expect(strongest).toContain('配装使用此型号');
    expect(strongest).toContain('受保护');
    expect(decomposeButton(strongest)).toContain('disabled');
  });
  it('shows equipped module model use while allowing its lower-quality duplicate to be decomposed', () => {
    const snapshot = camp(); snapshot.data.equippedModules = ['PULSE_BREAK'];
    snapshot.data.inventory.push({ id: 'module-gold', kind: 'module', templateId: 'PULSE_BREAK', rarity: 'gold', repaired: true },
      { id: 'module-blue', kind: 'module', templateId: 'PULSE_BREAK', rarity: 'blue', repaired: true },
      { id: 'unused', kind: 'module', templateId: 'IMMUNE_BEACON', rarity: 'purple', repaired: true });
    expect(inventory(snapshot, 'module-blue')).toContain('配装使用此型号');
    expect(decomposeButton(inventory(snapshot, 'module-blue'))).not.toContain('disabled');
    expect(decomposeButton(inventory(snapshot, 'module-gold'))).toContain('disabled');
    const unusedDetail = inventory(snapshot, 'unused').split('data-equipment-item="unused"')[1];
    expect(unusedDetail).not.toContain('配装使用此型号');
  });
});
