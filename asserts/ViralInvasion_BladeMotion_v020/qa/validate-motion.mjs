import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { packageDirectory, qaDirectory, hash, loadTsModule, loadTexturelessHero, calibratedBladeSocket, snapshotRig, restoreRig } from './rig-tools.mjs';

const source = resolve(packageDirectory, 'bladeMotion.ts'), module = await loadTsModule(source, 'blade-motion.bundle.mjs');
const gltf = await loadTexturelessHero(), model = gltf.scene;
const originalBones = snapshotRig(model), boneCount = originalBones.length;
const sourceClipHashes = gltf.animations.map(clip => hash(JSON.stringify(THREE.AnimationClip.toJSON(clip))));
const clips = module.createBladeMotionV020Clips(model, gltf.animations);
assert.ok(Array.isArray(clips) && clips.length >= 4, 'Generator must deliver actual Three AnimationClips');
const generatorRestoration = { sourceClipsUnchanged: gltf.animations.every((clip, index) => hash(JSON.stringify(THREE.AnimationClip.toJSON(clip))) === sourceClipHashes[index]),
  bonePositionMaximumError: 0, boneQuaternionMaximumError: 0, boneScaleMaximumError: 0, boneCountUnchanged: snapshotRig(model).length === boneCount };
for (const { node, p, q, s } of originalBones) {
  generatorRestoration.bonePositionMaximumError = Math.max(generatorRestoration.bonePositionMaximumError, node.position.distanceTo(p));
  generatorRestoration.boneQuaternionMaximumError = Math.max(generatorRestoration.boneQuaternionMaximumError, node.quaternion.clone().normalize().angleTo(q.clone().normalize()));
  generatorRestoration.boneScaleMaximumError = Math.max(generatorRestoration.boneScaleMaximumError, node.scale.distanceTo(s));
}
const calibrated = await calibratedBladeSocket(model, gltf.animations);
const exportedReference = module.createBladeReadyReferenceV020?.(gltf.animations);
const referenceCompatibility = { compared: !!exportedReference, maximumQuaternionDegrees: 0, maximumScalarDifference: 0, missingTracks: [] };
if (exportedReference) {
  const legacyTracks = new Map(calibrated.ready.tracks.map(track => [track.name, track]));
  for (const track of exportedReference.tracks) {
    const legacy = legacyTracks.get(track.name);
    if (!legacy) { referenceCompatibility.missingTracks.push(track.name); continue; }
    const value = track.InterpolantFactoryMethodLinear().evaluate(0), expectedValue = legacy.InterpolantFactoryMethodLinear().evaluate(0);
    if (track.name.endsWith('.quaternion')) referenceCompatibility.maximumQuaternionDegrees = Math.max(referenceCompatibility.maximumQuaternionDegrees, new THREE.Quaternion().fromArray(value).normalize().angleTo(new THREE.Quaternion().fromArray(expectedValue).normalize()) * 180 / Math.PI);
    else for (let i = 0; i < value.length; i++) referenceCompatibility.maximumScalarDifference = Math.max(referenceCompatibility.maximumScalarDifference, Math.abs(value[i] - expectedValue[i]));
  }
}
const boneByName = new Map(originalBones.map(({ node }) => [node.name, node]));
const expected = { Blade_Guard_v020: .45, Blade_Counter_v020: .34, Blade_FourfoldDash_v020: .32, Blade_FinishSheath_v020: .18 };
const metadata = module.BLADE_MOTION_V020;
const report = {
  status: 'running', methodology: 'Actual original medic GLB bones and redblade GLB, official GLTFLoader and AnimationMixer in Node; texture material disconnected only for headless coordinate QA. This is not a visual/browser/gameplay approval.',
  sourceHero: { sha256: gltf.sourceSha256, bytes: gltf.sourceBytes, boneCount },
  sourceBlade: { sha256: calibrated.blade.sourceSha256, bytes: calibrated.blade.sourceBytes },
  generatorSha256: hash(await readFile(source)), generatorRestoration, referenceCompatibility, markerMetadata: metadata ?? null,
  motionSanityThreshold: { maximumAdjacentJointStepDegrees: 75, note: 'A coarse safety bound for these approximately 60 Hz authored clips, intended to catch IK branch flips; this does not establish C1 or artistic naturalness.' },
  socket: { calibration: 'Production Idle_Subtle lower + existing Blade_Ready upper, right hand to middle finger 45% contact', parentBone: calibrated.hand.name, localPosition: calibrated.localPosition, localQuaternion: calibrated.localQuaternion },
  clips: [], warnings: [], failures: [],
};
function fail(message) { report.failures.push(message); }
function changedDegrees(track) {
  if (!track.name.endsWith('.quaternion')) return 0;
  const first = new THREE.Quaternion().fromArray(track.values).normalize(), sample = new THREE.Quaternion();
  let max = 0;
  for (let i = 0; i < track.values.length; i += 4) max = Math.max(max, first.angleTo(sample.fromArray(track.values, i).normalize()) * 180 / Math.PI);
  return max;
}
for (const [name, duration] of Object.entries(expected)) {
  const clip = clips.find(clip => clip.name === name);
  if (!clip) { fail('Missing clip ' + name); continue; }
  const summary = { name, duration: clip.duration, tracks: clip.tracks.length, quaternionKeys: 0, invalidValues: 0, maxQuaternionNormError: 0,
    boneNames: [], changedBones: [], rootTranslationMaximumRange: 0, rootRotationMaximumDegrees: 0,
    maximumAdjacentJointStep: { degrees: 0, bone: '', time: 0 }, samples: [], bladeTipTravel: 0,
    bladeTipMaximumSpeed: { unitsPerSecond: 0, time: 0 }, bladeSegmentMinimumDistanceToHeadJoint: Infinity,
    handGripMaximumError: 0, localSocketQuaternionMaximumError: 0, minimumTwoPalmGap: Infinity, finalTwoPalmGap: null };
  if (Math.abs(clip.duration - duration) > 1e-6) fail(name + ': duration differs from contract');
  const bindings = new Set();
  for (const track of clip.tracks) {
    const binding = THREE.PropertyBinding.parseTrackName(track.name), bone = boneByName.get(binding.nodeName);
    if (!bone) fail(name + ': unresolved bone ' + binding.nodeName);
    if (bindings.has(track.name)) fail(name + ': duplicate track ' + track.name); bindings.add(track.name);
    summary.boneNames.push(binding.nodeName);
    if ([...track.times, ...track.values].some(value => !Number.isFinite(value))) summary.invalidValues++;
    if (track.times[0] < -1e-7 || track.times[track.times.length - 1] > duration + 1e-6) fail(name + ': track time outside clip');
    for (let i = 1; i < track.times.length; i++) if (track.times[i] <= track.times[i - 1]) fail(name + ': unsorted/duplicate key times ' + track.name);
    if (track.name.endsWith('.quaternion')) {
      summary.quaternionKeys += track.values.length / 4;
      for (let i = 0; i < track.values.length; i += 4) summary.maxQuaternionNormError = Math.max(summary.maxQuaternionNormError, Math.abs(new THREE.Quaternion().fromArray(track.values, i).length() - 1));
      for (let i = 4; i < track.values.length; i += 4) {
        const step = new THREE.Quaternion().fromArray(track.values, i - 4).normalize().angleTo(new THREE.Quaternion().fromArray(track.values, i).normalize()) * 180 / Math.PI;
        if (step > summary.maximumAdjacentJointStep.degrees) summary.maximumAdjacentJointStep = { degrees: step, bone: binding.nodeName, time: track.times[i / 4], deltaSeconds: track.times[i / 4] - track.times[i / 4 - 1] };
      }
      const degrees = changedDegrees(track);
      if (degrees > .05) summary.changedBones.push({ name: binding.nodeName, degrees });
      if (binding.nodeName === 'mixamorigHips') summary.rootRotationMaximumDegrees = Math.max(summary.rootRotationMaximumDegrees, degrees);
    }
    if (binding.nodeName === 'mixamorigHips' && binding.propertyName === 'position') {
      for (let axis = 0; axis < 3; axis++) {
        const values = Array.from(track.values).filter((_, index) => index % 3 === axis);
        summary.rootTranslationMaximumRange = Math.max(summary.rootTranslationMaximumRange, Math.max(...values) - Math.min(...values));
      }
    }
  }
  if (summary.invalidValues) fail(name + ': non-finite key values');
  if (summary.maxQuaternionNormError > 1e-5) fail(name + ': non-unit quaternions');
  if (summary.rootTranslationMaximumRange > 1e-7) fail(name + ': animated root translation would compete with gameplay displacement');
  if (summary.maximumAdjacentJointStep.degrees > report.motionSanityThreshold.maximumAdjacentJointStepDegrees) fail(name + ': joint step exceeds coarse branch-flip sanity bound: ' + summary.maximumAdjacentJointStep.bone + ' ' + summary.maximumAdjacentJointStep.degrees.toFixed(3) + ' degrees');
  if (!summary.changedBones.some(bone => /Arm|ForeArm|Hand/.test(bone.name) && bone.degrees > 2)) report.warnings.push(name + ': no arm joint changes over 2 degrees; static stance may be intentional');
  const mixer = new THREE.AnimationMixer(model), action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
  // Upper clips deliberately omit legs/root. Match production's lower-idle
  // context; for the full dash only retain baseline properties absent in it.
  const underlay = calibrated.lower.clone(); underlay.tracks = underlay.tracks.filter(track => !bindings.has(track.name));
  const underlayAction = mixer.clipAction(underlay).setEffectiveTimeScale(0);
  const sampleTimes = new Set([0, duration, duration * .25, duration * .5, duration * .75]);
  for (let index = 0; index <= Math.ceil(duration * 120); index++) sampleTimes.add(Math.min(duration, index / 120));
  let previousTip, previousTime;
  for (const time of [...sampleTimes].sort((a, b) => a - b)) {
    mixer.stopAllAction(); restoreRig(originalBones); underlayAction.reset().play(); action.reset().play(); action.clampWhenFinished = true; mixer.setTime(time); model.updateMatrixWorld(true);
    const tip = calibrated.tip.getWorldPosition(new THREE.Vector3()), grip = calibrated.grip.getWorldPosition(new THREE.Vector3());
    const hand = calibrated.hand.getWorldPosition(new THREE.Vector3()).lerp(calibrated.finger.getWorldPosition(new THREE.Vector3()), .45);
    const handGripError = hand.distanceTo(grip);
    summary.handGripMaximumError = Math.max(summary.handGripMaximumError, handGripError);
    summary.localSocketQuaternionMaximumError = Math.max(summary.localSocketQuaternionMaximumError, calibrated.socket.quaternion.clone().normalize().angleTo(new THREE.Quaternion().fromArray(calibrated.localQuaternion).normalize()));
    if (previousTip) {
      const travel = tip.distanceTo(previousTip), delta = time - previousTime;
      summary.bladeTipTravel += travel;
      if (delta > 1e-7 && travel / delta > summary.bladeTipMaximumSpeed.unitsPerSecond) summary.bladeTipMaximumSpeed = { unitsPerSecond: travel / delta, time };
    }
    previousTip = tip.clone(); previousTime = time;
    const head = model.getObjectByName('mixamorigHead').getWorldPosition(new THREE.Vector3());
    const nearest = new THREE.Line3(grip, tip).closestPointToPoint(head, true, new THREE.Vector3());
    summary.bladeSegmentMinimumDistanceToHeadJoint = Math.min(summary.bladeSegmentMinimumDistanceToHeadJoint, nearest.distanceTo(head));
    const leftHand = model.getObjectByName('mixamorigLeftHand').getWorldPosition(new THREE.Vector3());
    const leftPalm = leftHand.clone().lerp(model.getObjectByName('mixamorigLeftHandMiddle1').getWorldPosition(new THREE.Vector3()), .45);
    const twoPalmGap = leftPalm.distanceTo(hand); summary.minimumTwoPalmGap = Math.min(summary.minimumTwoPalmGap, twoPalmGap); summary.finalTwoPalmGap = twoPalmGap;
    summary.samples.push({ time, bladeTip: tip.toArray(), grip: grip.toArray(), handGripError,
      rightHand: calibrated.hand.getWorldPosition(new THREE.Vector3()).toArray(),
      leftHand: leftHand.toArray(), leftPalm: leftPalm.toArray(), twoPalmGap, head: head.toArray() });
  }
  if (summary.handGripMaximumError > 1e-5) fail(name + ': blade grip is not coincident with production calibrated palm contact');
  if (name === 'Blade_FinishSheath_v020') {
    const final = summary.samples.at(-1), referenceGrip = new THREE.Vector3().fromArray(calibrated.referenceWorldGrip);
    const leftTarget = referenceGrip.clone().add(new THREE.Vector3(.18, -.225, -.13)), rightTarget = referenceGrip.clone().add(new THREE.Vector3(.14, -.21, -.12));
    summary.finalGuidingHand = { leftPalmTarget: leftTarget.toArray(), rightGripTarget: rightTarget.toArray(),
      leftPalmError: new THREE.Vector3().fromArray(final.leftPalm).distanceTo(leftTarget), rightGripError: new THREE.Vector3().fromArray(final.grip).distanceTo(rightTarget) };
    if (summary.finalTwoPalmGap > .06 || summary.finalGuidingHand.leftPalmError > .015 || summary.finalGuidingHand.rightGripError > .02) fail(name + ': final guiding palm is not near the intended reachable waist-side blade grip');
  }
  if (summary.localSocketQuaternionMaximumError > 1e-5) fail(name + ': socket calibration drifted during animation');
  if (name.includes('FourfoldDash')) {
    let maxQuaternionAngle = 0, maxScalarDelta = 0;
    for (const track of clip.tracks) {
      const count = track.getValueSize(), last = track.values.length - count;
      if (track.name.endsWith('.quaternion')) maxQuaternionAngle = Math.max(maxQuaternionAngle, new THREE.Quaternion().fromArray(track.values).normalize().angleTo(new THREE.Quaternion().fromArray(track.values, last).normalize()));
      else for (let i = 0; i < count; i++) maxScalarDelta = Math.max(maxScalarDelta, Math.abs(track.values[i] - track.values[last + i]));
    }
    summary.loopClosure = { maxQuaternionDegrees: maxQuaternionAngle * 180 / Math.PI, maxScalarDelta, c1VelocityClaimed: false };
    if (maxQuaternionAngle > 1e-5 || maxScalarDelta > 1e-7) fail(name + ': loop does not close in pose (C0)');
  }
  mixer.stopAllAction(); mixer.uncacheRoot(model); restoreRig(originalBones); model.updateMatrixWorld(true);
  report.clips.push(summary);
}
// Check all explicit numeric seconds in the supplied marker metadata, without
// claiming they are actually dispatched by the game integration.
function inspectMarkers(value, path = 'metadata', duration) {
  if (!value || typeof value !== 'object') return;
  const inferred = Number.isFinite(value.duration) ? value.duration : duration;
  for (const [key, child] of Object.entries(value)) {
    if (['time', 'at', 'start', 'end', 'from', 'to'].includes(key) && typeof child === 'number' && Number.isFinite(inferred) && (child < -1e-8 || child > inferred + 1e-7)) fail(path + '.' + key + ': marker outside clip');
    if (child && typeof child === 'object') inspectMarkers(child, path + '.' + key, inferred);
  }
}
inspectMarkers(metadata);
report.markerAudit = [];
for (const meta of metadata?.clips ?? []) {
  const numeric = report.clips.find(clip => clip.name === meta.name), markerIds = new Set();
  const markers = meta.markers ?? [], windows = meta.windows ?? [];
  for (const marker of markers) {
    if (markerIds.has(marker.id)) fail(meta.name + ': duplicate marker id ' + marker.id); markerIds.add(marker.id);
    if (!Number.isFinite(marker.time) || marker.time < 0 || marker.time > meta.duration + 1e-7) fail(meta.name + ': invalid marker ' + marker.id);
  }
  for (const window of windows) if (!Number.isFinite(window.start) || !Number.isFinite(window.end) || window.start < 0 || window.end > meta.duration + 1e-7 || window.end < window.start) fail(meta.name + ': invalid window ' + window.id);
  const hit = markers.find(marker => marker.id === 'hit');
  if (hit && !windows.some(window => hit.time >= window.start && hit.time <= window.end)) fail(meta.name + ': hit marker is outside all declared active windows');
  if (meta.name === 'Blade_Guard_v020' && (meta.perfectWindow?.start !== 0 || meta.perfectWindow?.end !== .18 || meta.duration !== .45)) fail('Guard duration/perfect window differs from requested .45/.18 contract');
  report.markerAudit.push({ name: meta.name, markerCount: markers.length, windows, hit: hit?.time ?? null,
    maximumBladeTipSpeedTime: numeric?.bladeTipMaximumSpeed.time,
    maximumSpeedInsideActiveWindow: !!numeric && windows.some(window => numeric.bladeTipMaximumSpeed.time >= window.start && numeric.bladeTipMaximumSpeed.time <= window.end) });
}
report.status = report.failures.length ? 'failed' : 'passed';
report.boneCountUnchanged = snapshotRig(model).length === boneCount;
if (!generatorRestoration.sourceClipsUnchanged || !generatorRestoration.boneCountUnchanged || generatorRestoration.bonePositionMaximumError > 1e-7 || generatorRestoration.boneQuaternionMaximumError > 1e-5 || generatorRestoration.boneScaleMaximumError > 1e-7) {
  fail('Generator mutated input source clips or failed to restore the original rig transforms'); report.status = 'failed';
}
if (referenceCompatibility.missingTracks.length || referenceCompatibility.maximumQuaternionDegrees > .0001 || referenceCompatibility.maximumScalarDifference > 1e-7) {
  fail('Exported Blade_Ready reference is incompatible with the existing production blade socket'); report.status = 'failed';
}
await writeFile(resolve(qaDirectory, 'numeric-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, heroSha256: report.sourceHero.sha256, clips: report.clips.map(({ name, duration, changedBones, bladeTipTravel, handGripMaximumError, loopClosure }) => ({ name, duration, movingBones: changedBones.length, bladeTipTravel, handGripMaximumError, loopClosure })), warnings: report.warnings, failures: report.failures }, null, 2));
if (report.failures.length || !report.boneCountUnchanged) process.exitCode = 1;
