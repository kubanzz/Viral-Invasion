import { describe, expect, it } from 'vitest';
import { HEART_WORLD, ORGAN_DEFINITIONS } from '../../src/game/organConfig';
import { GEOMETRY_RADII, connectivityWitness, formalDevicePulseSweep, sourceAndCoreExceptions, structuralCertificate, wholeWorldCollisionSweep } from '../../artifacts/completion-v074/pulse-reachability/sweep';

describe('AC-M10-02 formal heart pulse reachability', () => {
  it('certifies the actual five-fold 2400×1500 layout, including a conservative 52-radius body', () => {
    const proof = structuralCertificate();
    expect([HEART_WORLD.width, HEART_WORLD.height]).toEqual([2400, 1500]);
    expect(ORGAN_DEFINITIONS.heart.geometry).toBe(HEART_WORLD);
    expect(proof.obstacles).toHaveLength(5); expect(proof.pairs).toHaveLength(10);
    expect(proof.valid).toBe(true); expect(proof.minimumBoundaryClearance).toBe(6);
    expect(proof.minimumPairGap).toBeGreaterThan(74);
    expect(proof.interpretation).toContain('not simply connected');
  });

  it('rejects connectedness assumptions when an expanded fold touches the formal outer boundary', () => {
    const changed = structuredClone(HEART_WORLD);
    changed.obstacles = changed.obstacles.map(obstacle => obstacle.id === 'fold-d' ? { ...obstacle, x: obstacle.x + 6 } : obstacle);
    expect(structuralCertificate(52, changed).valid).toBe(false);
    expect(structuralCertificate().valid).toBe(true);
  });

  it('keeps all sampled 145 pushes legal across the entire heart, all folds, corners and 64 bearings', () => {
    const before = JSON.stringify(HEART_WORLD), result = wholeWorldCollisionSweep();
    expect(result.failures).toEqual([]); expect(result.cases).toBeGreaterThan(500000);
    expect(result.radii).toEqual([...GEOMETRY_RADII]); expect(result.directionCount).toBe(64);
    expect(result.families['outer-boundary']).toBeGreaterThan(0); expect(result.families['outer-corner']).toBeGreaterThan(0);
    expect(result.families['obstacle-boundary']).toBeGreaterThan(0); expect(result.families['whole-world-grid']).toBeGreaterThan(0);
    expect(result.minimumObstacleClearance).toBeGreaterThanOrEqual(-1e-7); expect(result.minimumBoundaryClearance).toBeGreaterThanOrEqual(-1e-7);
    expect(result.moved).toBeGreaterThan(0); expect(result.stationary).toBeGreaterThan(0);
    expect(JSON.stringify(HEART_WORLD)).toBe(before);
  }, 30000);

  it.each([...GEOMETRY_RADII, 19])('constructs clear paths through the whole formal component for radius %s', radius => {
    const witness = connectivityWitness(radius);
    expect(witness.allNodesLegal).toBe(true); expect(witness.allReachable).toBe(true);
    expect(witness.reachableNodes).toBe(witness.nodeCount); expect(witness.unreachableNodeIds).toEqual([]);
    expect(witness.landmarkPaths.every(path => path.reachable && path.route[0].id === 'player-start')).toBe(true);
  });

  it('uses the actual formal valve, visibility and collision world for displacement/exposure facts', () => {
    const result = formalDevicePulseSweep();
    expect(result.origin).toEqual(ORGAN_DEFINITIONS.heart.device); expect(result.failures).toEqual([]);
    expect(result.affected).toBeGreaterThan(0); expect(result.moved).toBeGreaterThan(0);
    expect(result.occluded).toBeGreaterThan(0); expect(result.boundaryLandings).toBeGreaterThan(0);
  }, 30000);

  it('keeps excluded sources and zero-push cores separate from movable-infection sweeps', () => {
    const result = sourceAndCoreExceptions();
    expect(result).toHaveLength(2); expect(result.every(row => row.valid)).toBe(true);
  });
});
