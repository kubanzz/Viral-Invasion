import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { packageDirectory, qaDirectory, heroPath, hash, loadTsModule, loadTexturelessHero, calibratedBladeSocket, snapshotRig, restoreRig } from './rig-tools.mjs';

const source = resolve(packageDirectory, 'bladeMotion.ts');
const module = await loadTsModule(source, 'blade-motion.bundle.mjs');
const baselineModule = await loadTsModule(resolve(packageDirectory, '../ViralInvasion_BladeMotion_v020/bladeMotion.ts'), 'v020-reference.bundle.mjs');
const gltf = await loadTexturelessHero(), model = gltf.scene, originalBones = snapshotRig(model);
const originalBoneCount = originalBones.length, boneByName = new Map(originalBones.map(({ node }) => [node.name, node]));
const sourceHashes = gltf.animations.map(clip => hash(JSON.stringify(THREE.AnimationClip.toJSON(clip))));
const baselineClips = baselineModule.createBladeMotionV020Clips(model, gltf.animations);
const baselineDash = baselineClips.find(clip => clip.name === 'Blade_FourfoldDash_v020');
const clips = module.createBladeMotionV022Clips(model, gltf.animations);
const metadata = module.BLADE_MOTION_V022;
const rootBytes = await readFile(heroPath), heroDocument = JSON.parse(rootBytes.subarray(20, 20 + rootBytes.readUInt32LE(12)));
const skinIndices = new Set(heroDocument.skins.flatMap(skin => skin.joints));
const eyeBones = heroDocument.nodes.filter((node, index) => skinIndices.has(index) && /eye|eyelid|lid|brow/i.test(node.name ?? '')).map(node => node.name);
const morphTargets = heroDocument.meshes.flatMap(mesh => mesh.primitives).reduce((sum, primitive) => sum + (primitive.targets?.length ?? 0), 0);
const calibrated = await calibratedBladeSocket(model, gltf.animations);
const report = {
  status: 'running', version: '0.22.0', generatorSha256: hash(await readFile(source)),
  methodology: 'Read original medic GLB geometry, skin, bones and source animations with GLTFLoader. Disconnect image materials only for Node coordinate sampling. Use actual redblade rigid GLB and unchanged v020 grip calibration; AnimationMixer samples at 120 Hz. This report does not claim visual/browser/gameplay completion.',
  sourceHero: { sha256: gltf.sourceSha256, bytes: gltf.sourceBytes, skinJoints: skinIndices.size, boneCount: originalBoneCount },
  sourceBlade: { sha256: calibrated.blade.sourceSha256, bytes: calibrated.blade.sourceBytes },
  unchangedV020Reference: { moduleSha256: hash(await readFile(resolve(packageDirectory, '../ViralInvasion_BladeMotion_v020/bladeMotion.ts'))), clip: baselineDash.name, duration: baselineDash.duration },
  rigCapabilities: { skinJoints: skinIndices.size, bones: [...boneByName.keys()], headBones: heroDocument.nodes.filter(node => /head|neck/i.test(node.name ?? '')).map(node => node.name), eyeBones, morphTargets,
    eyelidDeformationAvailable: eyeBones.length > 0 || morphTargets > 0, note: 'Head/neck intent is bone animation. Close/open eye markers are only synchronization cues for the screen close-up; no eyelid or eyeball deformation is present in the original medic.' },
  restoration: { sourceClipsUnchanged: gltf.animations.every((clip, i) => hash(JSON.stringify(THREE.AnimationClip.toJSON(clip))) === sourceHashes[i]), boneCountUnchanged: snapshotRig(model).length === originalBoneCount, maximumPositionError: 0, maximumQuaternionErrorDegrees: 0, maximumScaleError: 0 },
  socket: { parentBone: calibrated.hand.name, localPosition: calibrated.localPosition, localQuaternion: calibrated.localQuaternion, calibration: 'v020 immutable Blade_Ready upper + Idle_Subtle lower; RightHand to Middle1 45%' },
  markerMetadata: metadata, threshold: { maximumAdjacentJointStepDegrees: 75, caveat: 'Coarse IK branch-flip bound, not proof of C1 or artistic naturalness.' }, clips: [], connections: [], failures: [], warnings: [],
};
for (const item of originalBones) {
  report.restoration.maximumPositionError = Math.max(report.restoration.maximumPositionError, item.node.position.distanceTo(item.p));
  report.restoration.maximumQuaternionErrorDegrees = Math.max(report.restoration.maximumQuaternionErrorDegrees, item.node.quaternion.clone().normalize().angleTo(item.q.clone().normalize()) * 180 / Math.PI);
  report.restoration.maximumScaleError = Math.max(report.restoration.maximumScaleError, item.node.scale.distanceTo(item.s));
}
const fail = message => report.failures.push(message);
if (clips.length !== 2) fail('The v022 increment must return exactly two new clips; separate Launch was removed from the latest contract.');
if (originalBoneCount !== 53 || skinIndices.size !== 53) fail('Original medic is not the expected 53-joint rig.');
if (eyeBones.length || morphTargets) fail('Expected no eye/eyelid bones or face morphs; review claimed capability.');
const expected = { Blade_ChargeDraw_v022: .65, Blade_FinishSettle_v022: .30 };
const upperName = name => /mixamorig(?:Spine|Neck|Head|LeftShoulder|RightShoulder|LeftArm|RightArm|LeftForeArm|RightForeArm|LeftHand|RightHand)/.test(name);
const quat = (values, offset = 0) => new THREE.Quaternion().fromArray(values, offset).normalize();
const degrees = radians => radians * 180 / Math.PI;
const lowerReference = calibrated.lower;

function applySample(clip, time) {
  restoreRig(originalBones); model.updateMatrixWorld(true);
  const mixer = new THREE.AnimationMixer(model), bindings = new Set(clip.tracks.map(track => track.name));
  const baseline = lowerReference.clone(); baseline.tracks = baseline.tracks.filter(track => !bindings.has(track.name));
  if (baseline.tracks.length) mixer.clipAction(baseline).setEffectiveTimeScale(0).play();
  const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1).play(); action.clampWhenFinished = true;
  mixer.setTime(time); model.updateMatrixWorld(true);
  return () => { mixer.stopAllAction(); mixer.uncacheRoot(model); restoreRig(originalBones); model.updateMatrixWorld(true); };
}

const referenceClip = new THREE.AnimationClip('qa-same-lower-ready-context', 1, [
  ...calibrated.lower.tracks.map(track => track.clone()),
  ...calibrated.ready.tracks.filter(track => upperName(THREE.PropertyBinding.parseTrackName(track.name).nodeName)).map(track => track.clone()),
]);
const referenceDone = applySample(referenceClip, 0);
const referenceFeet = ['LeftFoot', 'RightFoot'].map(suffix => boneByName.get('mixamorig' + suffix).getWorldPosition(new THREE.Vector3()));
const referenceModelQuaternion = model.getWorldQuaternion(new THREE.Quaternion()).normalize();
const referenceHeadQuaternion = boneByName.get('mixamorigHead').getWorldQuaternion(new THREE.Quaternion()).normalize();
// Imported bone-local XYZ is not anatomical. Define +Z facing/+Y up in the
// actual reference rig, convert those axes into the head's local frame, and
// transform them back with each sampled world quaternion. This measures the
// helmet's genuine nod/roll without assuming its imported local bone axes.
const headLocalForward = new THREE.Vector3(0, 0, 1).applyQuaternion(referenceModelQuaternion).applyQuaternion(referenceHeadQuaternion.clone().invert());
const headLocalUp = new THREE.Vector3(0, 1, 0).applyQuaternion(referenceModelQuaternion).applyQuaternion(referenceHeadQuaternion.clone().invert());
referenceDone();

for (const [name, duration] of Object.entries(expected)) {
  const clip = clips.find(item => item.name === name), meta = metadata?.clips?.find(item => item.name === name);
  if (!clip) { fail('Missing actual Three clip: ' + name); continue; }
  const summary = { name, duration: clip.duration, layer: meta?.layer ?? null, tracks: clip.tracks.length, boneNames: [], changedBones: [], invalidValues: 0,
    maximumQuaternionNormError: 0, maximumAdjacentJointStep: { degrees: 0, bone: '', time: 0 }, rootTranslationMaximumRange: 0,
    maximumGripError: 0, maximumSocketQuaternionErrorDegrees: 0, minimumTwoPalmGap: Infinity, finalTwoPalmGap: 0,
    headHeightRange: 0, headPitchRangeDegrees: 0, neckPitchRangeDegrees: 0, headForwardPitchRangeDegrees: 0, headRigRollRangeDegrees: 0, bladeTipTravel: 0,
    plantedFeetMaximumErrorBeforeDashHandoff: 0, plantedFeetMaximumVerticalErrorBeforeDashHandoff: 0, samples: [] };
  if (Math.abs(duration - clip.duration) > 1e-6) fail(name + ': duration differs from requested contract');
  const seen = new Set();
  for (const track of clip.tracks) {
    const binding = THREE.PropertyBinding.parseTrackName(track.name), bone = boneByName.get(binding.nodeName);
    if (!bone) fail(name + ': unresolved bone ' + binding.nodeName);
    if (seen.has(track.name)) fail(name + ': duplicate track ' + track.name); seen.add(track.name); summary.boneNames.push(binding.nodeName);
    if ([...track.times, ...track.values].some(v => !Number.isFinite(v))) summary.invalidValues++;
    if (track.times[0] < -1e-7 || track.times.at(-1) > duration + 1e-6) fail(name + ': track time outside clip');
    for (let i = 1; i < track.times.length; i++) if (track.times[i] <= track.times[i - 1]) fail(name + ': non-increasing key times ' + track.name);
    if (track.name.endsWith('.quaternion')) {
      const first = quat(track.values); let changed = 0;
      for (let i = 0; i < track.values.length; i += 4) {
        const q = new THREE.Quaternion().fromArray(track.values, i);
        summary.maximumQuaternionNormError = Math.max(summary.maximumQuaternionNormError, Math.abs(q.length() - 1));
        changed = Math.max(changed, degrees(first.angleTo(q.normalize())));
        if (i) {
          const angle = degrees(quat(track.values, i - 4).angleTo(q));
          if (angle > summary.maximumAdjacentJointStep.degrees) summary.maximumAdjacentJointStep = { degrees: angle, bone: binding.nodeName, time: track.times[i / 4], seconds: track.times[i / 4] - track.times[i / 4 - 1] };
        }
      }
      if (changed > .05) summary.changedBones.push({ bone: binding.nodeName, degrees: changed });
    }
    if (binding.propertyName === 'position') {
      if (binding.nodeName !== 'mixamorigHips') fail(name + ': unexpected local joint-position animation: ' + track.name);
      for (let axis = 0; axis < 3; axis++) {
        const values = Array.from(track.values).filter((_, i) => i % 3 === axis), range = Math.max(...values) - Math.min(...values);
        summary.rootTranslationMaximumRange = Math.max(summary.rootTranslationMaximumRange, range);
        if (axis !== 1 && range > 1e-7) fail(name + ': forbidden horizontal root animation competing with gameplay');
      }
    }
  }
  if (summary.invalidValues) fail(name + ': nonfinite key value');
  if (summary.maximumQuaternionNormError > 1e-5) fail(name + ': nonunit quaternion');
  if (summary.maximumAdjacentJointStep.degrees > 75) fail(name + ': IK branch-flip sized step: ' + summary.maximumAdjacentJointStep.bone + ' ' + summary.maximumAdjacentJointStep.degrees);
  const times = new Set([0, duration]);
  for (let i = 0; i <= Math.ceil(duration * 120); i++) times.add(Math.min(duration, i / 120));
  for (const marker of meta?.markers ?? []) times.add(marker.time);
  let previousTip, minimumHead = Infinity, maximumHead = -Infinity, minimumPitch = Infinity, maximumPitch = -Infinity, minimumNeck = Infinity, maximumNeck = -Infinity;
  let minimumForwardPitch = Infinity, maximumForwardPitch = -Infinity, minimumRoll = Infinity, maximumRoll = -Infinity;
  for (const time of [...times].sort((a, b) => a - b)) {
    const done = applySample(clip, time);
    const tip = calibrated.tip.getWorldPosition(new THREE.Vector3()), grip = calibrated.grip.getWorldPosition(new THREE.Vector3());
    const right = calibrated.hand.getWorldPosition(new THREE.Vector3()).lerp(calibrated.finger.getWorldPosition(new THREE.Vector3()), .45);
    const leftHand = boneByName.get('mixamorigLeftHand'), leftMiddle = boneByName.get('mixamorigLeftHandMiddle1');
    const left = leftHand.getWorldPosition(new THREE.Vector3()).lerp(leftMiddle.getWorldPosition(new THREE.Vector3()), .45);
    const head = boneByName.get('mixamorigHead'), neck = boneByName.get('mixamorigNeck'), headPosition = head.getWorldPosition(new THREE.Vector3());
    const headPitch = degrees(new THREE.Euler().setFromQuaternion(head.quaternion, 'XYZ').x), neckPitch = degrees(new THREE.Euler().setFromQuaternion(neck.quaternion, 'XYZ').x);
    const headWorldQuaternion = head.getWorldQuaternion(new THREE.Quaternion()).normalize();
    const rigForward = headLocalForward.clone().applyQuaternion(headWorldQuaternion).applyQuaternion(referenceModelQuaternion.clone().invert()).normalize();
    const rigUp = headLocalUp.clone().applyQuaternion(headWorldQuaternion).applyQuaternion(referenceModelQuaternion.clone().invert()).normalize();
    const forwardPitch = degrees(Math.atan2(-rigForward.y, Math.hypot(rigForward.x, rigForward.z)));
    const rigRoll = degrees(Math.atan2(-rigUp.x, rigUp.y));
    minimumForwardPitch = Math.min(minimumForwardPitch, forwardPitch); maximumForwardPitch = Math.max(maximumForwardPitch, forwardPitch);
    minimumRoll = Math.min(minimumRoll, rigRoll); maximumRoll = Math.max(maximumRoll, rigRoll);
    minimumHead = Math.min(minimumHead, headPosition.y); maximumHead = Math.max(maximumHead, headPosition.y);
    minimumPitch = Math.min(minimumPitch, headPitch); maximumPitch = Math.max(maximumPitch, headPitch); minimumNeck = Math.min(minimumNeck, neckPitch); maximumNeck = Math.max(maximumNeck, neckPitch);
    const gap = left.distanceTo(right), gripError = grip.distanceTo(right);
    summary.maximumGripError = Math.max(summary.maximumGripError, gripError); summary.minimumTwoPalmGap = Math.min(summary.minimumTwoPalmGap, gap); summary.finalTwoPalmGap = gap;
    summary.maximumSocketQuaternionErrorDegrees = Math.max(summary.maximumSocketQuaternionErrorDegrees, degrees(calibrated.socket.quaternion.clone().normalize().angleTo(quat(calibrated.localQuaternion))));
    if (previousTip) summary.bladeTipTravel += previousTip.distanceTo(tip); previousTip = tip.clone();
    const feet = ['LeftFoot', 'RightFoot'].map(suffix => boneByName.get('mixamorig' + suffix).getWorldPosition(new THREE.Vector3()));
    // v020 Dash intentionally has moving legs. Evaluate planted crouch before
    // Charge's .56-.65 dash handoff, and after Finish's initial .055 handoff.
    const planted = name.includes('Charge') ? time <= .56 + 1e-7 : time >= .055 - 1e-7;
    if (planted) for (let i = 0; i < feet.length; i++) {
      summary.plantedFeetMaximumErrorBeforeDashHandoff = Math.max(summary.plantedFeetMaximumErrorBeforeDashHandoff, feet[i].distanceTo(referenceFeet[i]));
      summary.plantedFeetMaximumVerticalErrorBeforeDashHandoff = Math.max(summary.plantedFeetMaximumVerticalErrorBeforeDashHandoff, Math.abs(feet[i].y - referenceFeet[i].y));
    }
    summary.samples.push({ time, bladeTip: tip.toArray(), grip: grip.toArray(), leftPalm: left.toArray(), twoPalmGap: gap, handGripError: gripError,
      head: headPosition.toArray(), importedLocalHeadEulerXDegrees: headPitch, importedLocalNeckEulerXDegrees: neckPitch,
      headRigForward: rigForward.toArray(), headForwardPitchDegrees: forwardPitch, headRigRollDegrees: rigRoll,
      headWorldQuaternion: headWorldQuaternion.toArray(), feet: feet.map(point => point.toArray()) });
    done();
  }
  summary.headHeightRange = maximumHead - minimumHead; summary.headPitchRangeDegrees = maximumPitch - minimumPitch; summary.neckPitchRangeDegrees = maximumNeck - minimumNeck;
  summary.headForwardPitchRangeDegrees = maximumForwardPitch - minimumForwardPitch; summary.headRigRollRangeDegrees = maximumRoll - minimumRoll;
  summary.headMeasurement = { authoritative: 'Head worldQuaternion applied to reference-calibrated rig +Z/+Y anatomical axes, not imported bone-local Euler components',
    positivePitchMeans: 'downward nod', importedEulerFieldsDiagnosticOnly: true, minPitch: minimumForwardPitch, maxPitch: maximumForwardPitch };
  if (summary.maximumGripError > 1e-5) fail(name + ': weapon does not preserve calibrated right palm contact');
  if (summary.maximumSocketQuaternionErrorDegrees > .0001) fail(name + ': weapon local socket quaternion drift');
  if (summary.plantedFeetMaximumErrorBeforeDashHandoff > .015) fail(name + ': planted foot deviation exceeds .015 model units before/after dash handoff.');
  if (name.includes('Charge')) {
    const readySamples = summary.samples.filter(sample => sample.time >= .18 && sample.time <= .48);
    summary.waistBrace = { from: .18, to: .48, maximumTwoPalmGap: Math.max(...readySamples.map(sample => sample.twoPalmGap)), minimumGripY: Math.min(...readySamples.map(sample => sample.grip[1])), maximumGripY: Math.max(...readySamples.map(sample => sample.grip[1])) };
    if (summary.waistBrace.maximumTwoPalmGap > .10) fail(name + ': left supporting palm is not near the waist-side hilt during brace.');
  }
  if (name.includes('Charge') && summary.headForwardPitchRangeDegrees < 8) fail(name + ': actual rig-forward head nod does not articulate the requested dip and lift intent');
  if (meta?.layer === 'full' && !summary.boneNames.includes('mixamorigHips')) fail(name + ': full layer omits lower rig');
  report.clips.push(summary);
}

function comparePoses(name, aClip, aTime, bClip, bTime, full = true) {
  const capture = (clip, t) => {
    const done = applySample(clip, t), result = new Map();
    for (const { node } of originalBones) if (full || upperName(node.name)) result.set(node.name, { p: node.position.clone(), q: node.quaternion.clone().normalize(), s: node.scale.clone() });
    done(); return result;
  };
  const a = capture(aClip, aTime), b = capture(bClip, bTime), result = { name, fullRig: full, boneCount: a.size, maximumQuaternionDegrees: 0, maximumPositionError: 0, maximumScaleError: 0, worstBone: '' };
  for (const [name, first] of a) {
    const other = b.get(name), angle = degrees(first.q.angleTo(other.q));
    if (angle > result.maximumQuaternionDegrees) { result.maximumQuaternionDegrees = angle; result.worstBone = name; }
    result.maximumPositionError = Math.max(result.maximumPositionError, first.p.distanceTo(other.p)); result.maximumScaleError = Math.max(result.maximumScaleError, first.s.distanceTo(other.s));
  }
  if (result.maximumQuaternionDegrees > .001 || result.maximumPositionError > 1e-5 || result.maximumScaleError > 1e-5) fail(name + ': pose is not C0-compatible with existing fourfold dash');
  report.connections.push(result);
}
const charge = clips.find(c => c.name === 'Blade_ChargeDraw_v022'), finish = clips.find(c => c.name === 'Blade_FinishSettle_v022');
if (charge && baselineDash) comparePoses('Charge end -> unchanged v020 Dash start', charge, charge.duration, baselineDash, 0, true);
if (finish && baselineDash) comparePoses('Unchanged v020 Dash start -> Finish start', baselineDash, 0, finish, 0, metadata?.clips?.find(c => c.name === finish.name)?.layer !== 'upper');

report.markerAudit = [];
for (const meta of metadata?.clips ?? []) {
  const seen = new Set();
  for (const marker of meta.markers ?? []) {
    if (seen.has(marker.id)) fail(meta.name + ': duplicate marker id ' + marker.id); seen.add(marker.id);
    if (!Number.isFinite(marker.time) || marker.time < 0 || marker.time > meta.duration + 1e-7) fail(meta.name + ': marker outside duration: ' + marker.id);
  }
  report.markerAudit.push({ name: meta.name, markers: meta.markers, damageGeneratedByQA: false });
}
const chargeMetadata = metadata?.clips?.find(c => c.name === 'Blade_ChargeDraw_v022');
for (const [id, time] of [['eye-open-intent', .32], ['unsheath-flash', .48], ['launch', .65]]) {
  const marker = chargeMetadata?.markers?.find(m => m.id === id);
  if (!marker || Math.abs(marker.time - time) > 1e-7) fail('Charge missing requested ' + id + ' marker at ' + time);
}
if (!report.restoration.sourceClipsUnchanged || !report.restoration.boneCountUnchanged || report.restoration.maximumPositionError > 1e-7 || report.restoration.maximumQuaternionErrorDegrees > .0001 || report.restoration.maximumScaleError > 1e-7) fail('Generator changed source animation or failed to restore original rig transforms');
report.boneCountAfterQA = snapshotRig(model).length; if (report.boneCountAfterQA !== 53) fail('53-bone rig changed during QA');
report.status = report.failures.length ? 'failed' : 'passed';
await writeFile(resolve(qaDirectory, 'numeric-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, generatorSha256: report.generatorSha256, capabilities: report.rigCapabilities,
  clips: report.clips.map(c => ({ name: c.name, tracks: c.tracks, movingBones: c.changedBones.length, maxStep: c.maximumAdjacentJointStep, actualHeadPitchRange: c.headForwardPitchRangeDegrees, headHeight: c.headHeightRange, finalTwoPalmGap: c.finalTwoPalmGap })), connections: report.connections, failures: report.failures, warnings: report.warnings }, null, 2));
if (report.status !== 'passed') process.exitCode = 1;
