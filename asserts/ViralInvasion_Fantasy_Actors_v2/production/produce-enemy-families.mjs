import { pathToFileURL } from 'node:url';
import { produceEnemyFamily, rect as R, round as q, squashField as S, translateField as T, rotateField as A } from './enemy-family-production.mjs';
const foot = [256, 435.2];
export const profiles = {
  thinRay: {
    family: 'thinRay', pins: [R(187, 428, 32, 11)], contacts: [[204, 435.2]],
    measurements: { bodyCenter: [251, 284], frontMuzzleJoint: [310, 337], muzzleLipCenter: [390, 354], eyes: [[271, 286], [347, 266]],
      muzzleROI: R(292, 292, 135, 111), leftTopProtrusion: [205, 153], rightTopProtrusion: [291, 152], actualSoleLowestInk: [200, 435, 209, 436] },
    notes: 'Body membrane crawls while a short nozzle pitches and springs at its own attachment; no ray, muzzle flash or projectile is baked into body. Logical root foot differs from actual supporting short stalk.',
    holes: [[165, 280, 10, 15], [218, 356, 12, 16], [287, 388, 12, 10], [351, 223, 9, 13], [372, 353, 9, 12]],
    fieldsAt(t, mode) {
      const a = t * Math.PI * 2, c = q(Math.cos(a)), s = q(Math.sin(a));
      if (mode === 'walk') return [
        S(R(91, 121, 338, 322), foot, [1 + .025 * c, 1 - .021 * c], 29),
        T(R(218, 211, 191, 184), [-2 * s, -.5 * c], 35),
        A(R(291, 289, 139, 121), [310, 337], 1.3 * s, 22),
        T(R(174, 124, 65, 83), [1.5 * s, -.9 * c], 17),
        T(R(270, 120, 65, 86), [-1.3 * s, 1.1 * c], 17),
        T(R(98, 263, 83, 128), [1.2 * c, -.7 * s], 23),
      ];
      if (mode === 'windup0') return [S(R(91, 121, 338, 322), foot, [1.027, .979], 32), T(R(148, 162, 271, 245), [2.8, -.4], 45), S(R(291, 289, 139, 121), [310, 337], [.966, .98], 24)];
      if (mode === 'windup1') return [S(R(91, 121, 338, 322), foot, [1.009, 1.018], 32), S(R(291, 289, 139, 121), [310, 337], [1.045, 1.035], 25), T(R(335, 305, 94, 99), [-2.2, 0], 23)];
      if (mode === 'hurt') return [S(R(91, 121, 338, 322), foot, [1.023, .983], 32), T(R(142, 160, 282, 248), [3.4, -.7], 45), A(R(291, 289, 139, 121), [310, 337], -2, 24)];
      return [S(R(91, 121, 338, 322), foot, [.984, .981], 34)];
    },
  },
  carapace: {
    family: 'carapace', pins: [R(175, 428, 40, 11)], contacts: [[198.5, 435.2]],
    measurements: { bodyCenter: [259, 270], frontPlateHinge: [288, 230], lowerPlateHinge: [226, 353], sidePlateHinge: [163, 290], rightRimHinge: [390, 320],
      plateROIs: [R(238, 136, 126, 140), R(88, 193, 130, 178), R(172, 294, 112, 130), R(344, 218, 90, 184)], eyes: [[275, 266], [366, 250]], actualSoleLowestInk: [192, 435, 206, 436] },
    notes: 'Armour stays nearly rigid: soft upper coral provides limited drive; individually placed plate fields make small relative hinge/rocking motion. No whole-shell rubber squash.',
    holes: [[151, 171, 10, 15], [207, 126, 9, 13], [138, 325, 9, 12], [243, 372, 11, 11], [367, 187, 9, 10], [330, 383, 10, 12]],
    fieldsAt(t, mode) {
      const a = t * Math.PI * 2, c = q(Math.cos(a)), s = q(Math.sin(a));
      if (mode === 'walk') return [
        S(R(68, 63, 372, 382), foot, [1 + .006 * c, 1 - .007 * c], 36),
        T(R(116, 71, 260, 172), [-.7 * s, -1.1 * c], 35),
        A(R(238, 136, 126, 140), [288, 230], 1.0 * s, 25),
        A(R(88, 193, 130, 178), [163, 290], -.8 * s, 26),
        A(R(172, 294, 112, 130), [226, 353], .8 * c, 25),
        A(R(344, 218, 90, 184), [390, 320], -.7 * c, 25),
        T(R(225, 227, 190, 142), [-.65 * s, .2 * c], 30),
      ];
      if (mode === 'windup0') return [S(R(68, 63, 372, 382), foot, [1.008, .989], 36), T(R(228, 204, 190, 177), [1.7, -1], 38), A(R(238, 136, 126, 140), [288, 230], -1, 26)];
      if (mode === 'windup1') return [S(R(68, 63, 372, 382), foot, [.997, 1.009], 36), A(R(238, 136, 126, 140), [288, 230], 1.6, 26), T(R(330, 194, 105, 197), [-1.3, .4], 28), T(R(111, 88, 178, 121), [.7, -1.1], 30)];
      if (mode === 'hurt') return [T(R(218, 208, 208, 181), [2.7, -.7], 43), A(R(238, 136, 126, 140), [288, 230], -1.7, 27), A(R(88, 193, 130, 178), [163, 290], 1.0, 28)];
      return [S(R(68, 63, 372, 382), foot, [.992, .989], 38), A(R(344, 218, 90, 184), [390, 320], 1.1, 26)];
    },
  },
  'fission.parent': {
    family: 'fission.parent', pins: [R(315, 428, 35, 11)], contacts: [[328, 435.2]],
    measurements: { rearLobeCenter: [163, 242], frontLobeCenter: [316, 324], connector: [224, 272], frontEyes: [[269, 313], [347, 341]],
      rearLobeROI: R(57, 137, 222, 218), frontLobeROI: R(184, 194, 262, 250), connectorROI: R(169, 216, 117, 139), actualSoleLowestInk: [326, 435, 331, 436] },
    notes: 'Two fused lobes counter-pulse across their actual narrow connection. Rear lobe trails the front; front source identity/face remains coherent. Does not split into child or reuse another family body.',
    holes: [[121, 228, 11, 15], [176, 285, 10, 13], [233, 322, 9, 13], [311, 387, 12, 10], [394, 298, 10, 14], [361, 399, 8, 11]],
    fieldsAt(t, mode) {
      const a = t * Math.PI * 2, c = q(Math.cos(a)), s = q(Math.sin(a));
      const rear = R(57, 137, 222, 218), front = R(184, 194, 262, 250), neck = R(169, 216, 117, 139);
      if (mode === 'walk') return [
        S(R(52, 130, 395, 314), [328, 435.2], [1 + .014 * c, 1 - .014 * c], 36),
        S(rear, [220, 286], [1 + .022 * c, 1 - .016 * c], 32),
        S(front, [328, 435.2], [1 - .012 * c, 1 + .009 * c], 33),
        T(neck, [-1.3 * s, .6 * c], 32), T(R(233, 252, 198, 154), [-1.5 * s, 0], 36),
        A(R(84, 137, 153, 132), [179, 220], .9 * s, 26),
      ];
      if (mode === 'windup0') return [S(R(52, 130, 395, 314), [328, 435.2], [1.008, .987], 37), T(rear, [2.4, .3], 37), T(front, [-2.4, -.5], 38), S(neck, [224, 272], [1.027, .983], 33)];
      if (mode === 'windup1') return [S(R(52, 130, 395, 314), [328, 435.2], [.993, 1.011], 37), T(rear, [-1.3, -.5], 37), T(front, [-3.1, .4], 38), S(neck, [224, 272], [.98, 1.02], 34)];
      if (mode === 'hurt') return [T(front, [3.1, -.8], 39), T(rear, [.6, .3], 36), S(neck, [224, 272], [.983, 1.018], 34)];
      return [S(R(52, 130, 395, 314), [328, 435.2], [.987, .987], 38), T(rear, [.8, -.4], 36)];
    },
  },
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const requested = process.argv.slice(2);
  if (!requested.length) throw new Error('Pass explicit ready family names; no implicit generation or blanket batch');
  for (const family of requested) {
    if (!profiles[family]) throw new Error(`No measured profile yet: ${family}`);
    const fragment = await produceEnemyFamily(profiles[family]);
    process.stdout.write(JSON.stringify({ family, frames: fragment.assets.length, fragment: `production/enemy.${family}.fragment.json`, contact: fragment.contactSheets[0].path, small: fragment.smallSizeQa.path, preview: fragment.clips[0].preview.path }) + '\n');
  }
}
