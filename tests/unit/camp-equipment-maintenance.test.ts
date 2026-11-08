import { describe, expect, it } from 'vitest';
import { INTRO_FACILITY_IDS } from '../../src/game/campProgression';
import { emptyCampProfile, type CampProfileSnapshot } from '../../src/meta/campProfile';
import { campEquipmentMarkup } from '../../src/ui/campEquipmentHud';
import { createCampEquipmentState } from '../../src/ui/campEquipmentState';

function camp(): CampProfileSnapshot {
  const data = emptyCampProfile();
  Object.assign(data, { campUnlocked: true, campIntroSeen: true, prologue: 'ready', builtFacilities: [...INTRO_FACILITY_IDS], materials: 40 });
  return { data, status: { mode: 'persistent', code: 'loaded', message: '已保存' } };
}

describe('focused maintenance choices', () => {
  it('omits the mode switch when only repair or upgrade applies', () => {
    const snapshot = camp();
    let html = campEquipmentMarkup(snapshot, 'forge', createCampEquipmentState(snapshot));
    expect(html).not.toContain('data-action="eq-maintenance-mode"');
    expect(html).toContain('data-action="camp-upgrade"');
    snapshot.data.weapons.piercing.pending = 'purple';
    html = campEquipmentMarkup(snapshot, 'forge', createCampEquipmentState(snapshot));
    expect(html).not.toContain('data-action="eq-maintenance-mode"');
    expect(html).toContain('data-action="camp-repair"');
    expect(html).toContain('eq-maintenance-result');
    expect(html).toContain('保留强化 +0');
    const repairDetail = html.split('data-equipment-weapon="piercing"')[1];
    expect(repairDetail).toContain('未修复');
    expect(repairDetail).not.toContain('未获得');
    const warehouse = campEquipmentMarkup(snapshot, 'warehouse', { ...createCampEquipmentState(snapshot), weaponId: 'piercing' });
    const collectedDetail = warehouse.split('data-equipment-weapon="piercing"')[1];
    expect(collectedDetail).toContain('待修复');
    expect(collectedDetail).not.toContain('未获得');
  });
  it('shows both choices when an owned weapon has a higher-quality repair candidate', () => {
    const snapshot = camp(); snapshot.data.weapons.steady.pending = 'gold'; snapshot.data.weapons.steady.upgrade = 2;
    const html = campEquipmentMarkup(snapshot, 'forge', createCampEquipmentState(snapshot));
    expect(html.match(/data-action="eq-maintenance-mode"/g)).toHaveLength(2);
    expect(html).toContain('data-mode="repair" aria-pressed="true"');
    expect(html).toContain('data-mode="upgrade" aria-pressed="false"');
    expect(html).toContain('eq-maintenance-result');
    expect(html).toContain('保留强化 +2');
  });
});
