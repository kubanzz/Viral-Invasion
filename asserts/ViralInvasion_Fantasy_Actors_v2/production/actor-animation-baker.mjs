/**
 * Offline RGBA animation tools. No art generation, runtime integration or implicit writes.
 * Coordinates are pixels in the FULL source image, including sourceRect/joints.
 * Outputs keep a fixed transparent 512 square (mother: 1024); never auto-crop/recenter.
 */
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const CLIP_KINDS = Object.freeze([
  'rig-baked-sequence', 'static', 'windup-keypose', 'hurt-keypose', 'dissolve-keypose',
]);

const EPS = 1e-9;
const finite = (v, name) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new TypeError(`${name} must be finite`);
  return v;
};
const pair = (v, name) => {
  if (!Array.isArray(v) || v.length !== 2) throw new TypeError(`${name} must be [x,y]`);
  return v.map((n) => finite(n, name));
};
const clamp = (x, low = 0, high = 1) => Math.min(high, Math.max(low, x));
const smooth = (x) => (x = clamp(x), x * x * (3 - 2 * x));
const hash = (data) => createHash('sha256').update(data).digest('hex');
const canonical = (data) => {
  const copy = Buffer.from(data);
  for (let i = 0; i < copy.length; i += 4) if (!copy[i + 3]) copy.fill(0, i, i + 3);
  return copy;
};

export function validateRgba(image) {
  if (!image || !Number.isInteger(image.width) || image.width < 1 ||
      !Number.isInteger(image.height) || image.height < 1 ||
      !(image.data instanceof Uint8Array) || image.data.length !== image.width * image.height * 4) {
    throw new TypeError('Expected {data: Uint8Array, width, height} containing packed RGBA');
  }
  return image;
}

export async function loadRgba(input) {
  if (input?.data) {
    validateRgba(input);
    return { data: canonical(input.data), width: input.width, height: input.height };
  }
  const { data, info } = await sharp(input).toColourspace('srgb').ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  return { data: canonical(data), width: info.width, height: info.height };
}

function rect(value, width, height, name = 'sourceRect') {
  const r = value ?? { left: 0, top: 0, width, height };
  for (const k of ['left', 'top', 'width', 'height']) {
    if (!Number.isInteger(r[k])) throw new TypeError(`${name}.${k} must be an integer`);
  }
  if (r.left < 0 || r.top < 0 || r.width < 1 || r.height < 1 ||
      r.left + r.width > width || r.top + r.height > height) throw new RangeError(`${name} outside image`);
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

/** Decode/crop/mask once. A mask's alpha multiplies source alpha; black/white RGB is ignored. */
export async function prepareParts(parts) {
  if (!Array.isArray(parts) || parts.length === 0) throw new TypeError('At least one part is required');
  const ids = new Set();
  return Promise.all(parts.map(async (part) => {
    if (!part.id || ids.has(part.id)) throw new Error(`Missing or duplicate part id: ${part.id}`);
    ids.add(part.id);
    const source = await loadRgba(part.image);
    const r = rect(part.sourceRect, source.width, source.height);
    const sourceJoint = pair(part.sourceJoint, `${part.id}.sourceJoint`);
    const mask = part.mask ? await loadRgba(part.mask) : null;
    if (mask && !((mask.width === source.width && mask.height === source.height) ||
        (mask.width === r.width && mask.height === r.height))) throw new Error(`${part.id}: mask size mismatch`);
    const data = Buffer.alloc(r.width * r.height * 4);
    for (let y = 0; y < r.height; y++) for (let x = 0; x < r.width; x++) {
      const from = ((r.top + y) * source.width + r.left + x) * 4;
      const to = (y * r.width + x) * 4;
      for (let c = 0; c < 4; c++) data[to + c] = source.data[from + c];
      if (mask) {
        const full = mask.width === source.width && mask.height === source.height;
        const m = ((full ? r.top + y : y) * mask.width + (full ? r.left + x : x)) * 4;
        data[to + 3] = Math.round(data[to + 3] * mask.data[m + 3] / 255);
      }
      if (!data[to + 3]) data.fill(0, to, to + 3);
    }
    return { ...part, sourceJoint, sourceRect: r, image: { data, width: r.width, height: r.height }, prepared: true };
  }));
}

// Affine [a,b,c,d,e,f]: [x',y']=[a*x+c*y+e,b*x+d*y+f].
const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
export const transformPoint = (m, p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
function inverse(m) {
  const det = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(det) < EPS) throw new RangeError('Singular part transform');
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}
function partMatrix(sourceJoint, targetJoint, rotationDeg, scale, translate) {
  const angle = finite(rotationDeg, 'rotationDeg') * Math.PI / 180;
  const [sx, sy] = pair(scale, 'scale');
  if (sx <= EPS || sy <= EPS) throw new RangeError('scale must be positive; author other views explicitly');
  const [dx, dy] = pair(translate, 'translate');
  const a = Math.cos(angle) * sx, b = Math.sin(angle) * sx;
  const c = -Math.sin(angle) * sy, d = Math.cos(angle) * sy;
  return [a, b, c, d, targetJoint[0] + dx - a * sourceJoint[0] - c * sourceJoint[1],
    targetJoint[1] + dy - b * sourceJoint[0] - d * sourceJoint[1]];
}

/** Pixel-centre coordinates. Interpolate premultiplied colour to prevent transparent RGB halos. */
function sample(image, x, y) {
  const px = x - 0.5, py = y - 0.5;
  const ix = Math.floor(px), iy = Math.floor(py), fx = px - ix, fy = py - iy;
  let a = 0, r = 0, g = 0, b = 0;
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const xx = ix + i, yy = iy + j;
    if (xx < 0 || yy < 0 || xx >= image.width || yy >= image.height) continue;
    const p = (yy * image.width + xx) * 4;
    const w = (i ? fx : 1 - fx) * (j ? fy : 1 - fy) * image.data[p + 3] / 255;
    a += w; r += image.data[p] * w; g += image.data[p + 1] * w; b += image.data[p + 2] * w;
  }
  return a > EPS ? [r / a, g / a, b / a, a] : [0, 0, 0, 0];
}
function under(data, index, rgba, opacity) {
  const destA = data[index + 3] / 255, contribution = rgba[3] * opacity * (1 - destA), outA = destA + contribution;
  if (outA <= EPS) return 0;
  for (let c = 0; c < 3; c++) data[index + c] = Math.round((rgba[c] * contribution + data[index + c] * destA) / outA);
  data[index + 3] = Math.round(outA * 255);
  if (!data[index + 3]) data.fill(0, index, index + 3);
  return contribution;
}

function frameSize(options) {
  const expected = options.actorType === 'mother' ? 1024 : 512;
  if ((options.width ?? expected) !== expected || (options.height ?? expected) !== expected) {
    throw new RangeError(`Fixed canvas required: ${expected}x${expected}`);
  }
  return expected;
}

/**
 * Bake prepared RGBA parts. Root targetJoint is [x,y] or a joints dictionary key.
 * Child parent+attachJoint uses the parent's FULL source coordinates and inherits its affine transform.
 * Child translate is in parent-source axes. All root translations use output axes.
 */
export function bakeLayeredFrame(partMasks, joints = {}, pose = {}, options = {}) {
  const size = frameSize(options), data = Buffer.alloc(size * size * 4);
  const byId = new Map(partMasks.map((p) => [p.id, p]));
  if (byId.size !== partMasks.length) throw new Error('Duplicate part IDs');
  const transforms = {}, visiting = new Set(), landmarks = {};
  function resolve(id) {
    if (transforms[id]) return transforms[id];
    const part = byId.get(id);
    if (!part?.prepared) throw new TypeError(`Part ${id} must be decoded using prepareParts`);
    if (visiting.has(id)) throw new Error(`Cyclic part hierarchy at ${id}`);
    visiting.add(id);
    const p = pose.parts?.[id] ?? {};
    let target = p.targetJoint ?? part.targetJoint;
    let parentMatrix = null;
    if (part.parent) {
      parentMatrix = resolve(part.parent);
      target = pair(p.attachJoint ?? part.attachJoint, `${id}.attachJoint`);
    } else if (typeof target === 'string') {
      target = pose.joints?.[target] ?? joints[target];
    }
    target = pair(target, `${id}.targetJoint`);
    const local = partMatrix(part.sourceJoint, target, p.rotationDeg ?? part.rotationDeg ?? 0,
      p.scale ?? part.scale ?? [1, 1], p.translate ?? [0, 0]);
    const m = parentMatrix ? mul(parentMatrix, local) : local;
    transforms[id] = m;
    landmarks[`${id}.joint`] = transformPoint(m, part.sourceJoint);
    for (const [name, point] of Object.entries(part.landmarks ?? {})) landmarks[`${id}.${name}`] = transformPoint(m, pair(point, name));
    visiting.delete(id);
    return m;
  }
  const sorted = [...partMasks].sort((a, b) => (pose.parts?.[a.id]?.z ?? a.z ?? 0) - (pose.parts?.[b.id]?.z ?? b.z ?? 0));
  let clippedParts = 0;
  const visiblePartIds = [];
  // Top to bottom lets actual alpha contribution exclude completely occluded/transparent parts from motion QA.
  for (const part of sorted.reverse()) {
    const m = resolve(part.id), inv = inverse(m), r = part.sourceRect;
    const corners = [[r.left, r.top], [r.left + r.width, r.top], [r.left, r.top + r.height], [r.left + r.width, r.top + r.height]].map((p) => transformPoint(m, p));
    const minX = Math.floor(Math.min(...corners.map((p) => p[0])) - 1);
    const minY = Math.floor(Math.min(...corners.map((p) => p[1])) - 1);
    const maxX = Math.ceil(Math.max(...corners.map((p) => p[0])) + 1);
    const maxY = Math.ceil(Math.max(...corners.map((p) => p[1])) + 1);
    if (minX < -1 || minY < -1 || maxX > size + 1 || maxY > size + 1) clippedParts++;
    const opacity = clamp(finite(pose.parts?.[part.id]?.opacity ?? part.opacity ?? 1, 'opacity'));
    let visible = false;
    for (let y = Math.max(0, minY); y < Math.min(size, maxY); y++) {
      for (let x = Math.max(0, minX); x < Math.min(size, maxX); x++) {
        const s = transformPoint(inv, [x + 0.5, y + 0.5]);
        if (under(data, (y * size + x) * 4, sample(part.image, s[0] - r.left, s[1] - r.top), opacity) > EPS) visible = true;
      }
    }
    if (visible) visiblePartIds.push(part.id);
  }
  let frame = { data, width: size, height: size, transforms, landmarks, clippedParts, visiblePartIds };
  const fields = pose.fields ?? options.fields ?? [];
  frame.fieldConfigurationSignature = JSON.stringify(fields);
  if (fields.length) {
    const warpOptions = { pinnedRects: options.pinnedRects ?? [], pinFeather: options.pinFeather ?? 8 };
    frame = { ...frame, ...warpRgbaLocal(frame, fields, warpOptions) };
    frame.landmarks = Object.fromEntries(Object.entries(landmarks).map(([name, source]) => {
      return [name, invertFieldPoint(source, fields, warpOptions, name)];
    }));
  }
  // Relative matrices remove a shared whole-body transform from animation evidence.
  const reference = inverse(transforms[partMasks[0].id]);
  const relative = partMasks.slice(1).map((p) => mul(reference, transforms[p.id]));
  const rounded = (v) => Math.round(v * 1e7) / 1e7;
  frame.localGeometrySignature = JSON.stringify({ relative: relative.map((m) => m.map(rounded)),
    localField: frame.warpQA?.localGeometryHash ?? null });
  frame.contacts = pose.contacts ?? {};
  return frame;
}

function invertFieldPoint(source, fields, options, name) {
  const residual = (p) => {
    const d = reverseOffset(p[0], p[1], fields, options);
    return [p[0] + d[0] - source[0], p[1] + d[1] - source[1]];
  };
  let dest = [...source];
  for (let i = 0; i < 32; i++) {
    const f = residual(dest), error = Math.hypot(...f);
    if (error < 1e-6) return dest;
    const h = 1e-3;
    const l = residual([dest[0] - h, dest[1]]), r = residual([dest[0] + h, dest[1]]);
    const u = residual([dest[0], dest[1] - h]), d = residual([dest[0], dest[1] + h]);
    const a = (r[0] - l[0]) / (2 * h), b = (r[1] - l[1]) / (2 * h);
    const c = (d[0] - u[0]) / (2 * h), e = (d[1] - u[1]) / (2 * h), determinant = a * e - b * c;
    if (Math.abs(determinant) < EPS) break;
    const step = [(e * f[0] - c * f[1]) / determinant, (-b * f[0] + a * f[1]) / determinant];
    let improved = false;
    for (let damping = 1; damping >= 1 / 1024; damping /= 2) {
      const next = [dest[0] - damping * step[0], dest[1] - damping * step[1]];
      if (Math.hypot(...residual(next)) < error) { dest = next; improved = true; break; }
    }
    if (!improved) break;
  }
  if (Math.hypot(...residual(dest)) > 0.01) throw new Error(`Landmark inverse field did not converge: ${name}`);
  return dest;
}

function validateFields(fields, options) {
  if (!Array.isArray(fields)) throw new TypeError('fields must be an array');
  for (const field of fields) {
    const r = field.rect;
    if (!r || !['left', 'top', 'width', 'height'].every((k) => Number.isFinite(r[k])) || r.width <= 0 || r.height <= 0) throw new TypeError('Invalid field rect');
    finite(field.strength ?? 1, 'field.strength');
    if (finite(field.feather ?? 0, 'field.feather') < 0) throw new RangeError('field.feather must be >=0');
    if (field.vectors) {
      if (!Number.isInteger(field.columns) || field.columns < 2 || !Number.isInteger(field.rows) || field.rows < 2 ||
          field.vectors.length !== field.rows * field.columns) throw new TypeError('Invalid reverse-displacement grid');
      field.vectors.forEach((v) => pair(v, 'field vector'));
    } else pair(field.displacement, 'field.displacement');
  }
  for (const r of options.pinnedRects ?? []) {
    if (!r || !['left', 'top', 'width', 'height'].every((k) => Number.isFinite(r[k])) || r.width <= 0 || r.height <= 0) throw new TypeError('Invalid pinned rect');
  }
  if (!Number.isFinite(options.pinFeather ?? 8) || (options.pinFeather ?? 8) < 0) throw new TypeError('Invalid pinFeather');
}
function reverseOffset(x, y, fields, options) {
  let dx = 0, dy = 0;
  for (const f of fields) {
    const r = f.rect;
    if (x < r.left || y < r.top || x > r.left + r.width || y > r.top + r.height) continue;
    let v = f.displacement;
    if (f.vectors) {
      const gx = clamp((x - r.left) / r.width) * (f.columns - 1);
      const gy = clamp((y - r.top) / r.height) * (f.rows - 1);
      const ix = Math.min(f.columns - 2, Math.floor(gx)), iy = Math.min(f.rows - 2, Math.floor(gy));
      const fx = gx - ix, fy = gy - iy;
      v = [0, 0];
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        const p = f.vectors[(iy + j) * f.columns + ix + i];
        const weight = (i ? fx : 1 - fx) * (j ? fy : 1 - fy);
        v[0] += p[0] * weight; v[1] += p[1] * weight;
      }
    }
    const edge = Math.min(x - r.left, y - r.top, r.left + r.width - x, r.top + r.height - y);
    const weight = (f.strength ?? 1) * ((f.feather ?? 0) > 0 ? smooth(edge / f.feather) : 1);
    dx += v[0] * weight; dy += v[1] * weight;
  }
  let pinWeight = 1;
  for (const r of options.pinnedRects ?? []) {
    const distance = Math.hypot(Math.max(r.left - x, 0, x - r.left - r.width), Math.max(r.top - y, 0, y - r.top - r.height));
    const feather = options.pinFeather ?? 8;
    pinWeight = Math.min(pinWeight, distance === 0 ? 0 : feather > 0 ? smooth(distance / feather) : 1);
  }
  return [dx * pinWeight, dy * pinWeight];
}

/** Reverse fields specify SOURCE minus DESTINATION, never a forward field. Pinned foot ROI has zero offset. */
export function warpRgbaLocal(image, fields, options = {}) {
  validateRgba(image); validateFields(fields, options);
  const { width, height } = image, data = Buffer.alloc(image.data.length);
  let maxDisplacement = 0, unchangedPixels = 0;
  // Fingerprint all field offsets over visible source support, rather than a sparse canvas grid.
  // A uniform shift of the whole visible actor is deliberately excluded from local-motion evidence.
  const geometryHasher = createHash('sha256'), displacementRow = Buffer.alloc(width * 16);
  let minDx = Infinity, maxDx = -Infinity, minDy = Infinity, maxDy = -Infinity;
  for (let y = 0; y < height; y++) {
    displacementRow.fill(0);
    for (let x = 0; x < width; x++) {
    const [dx, dy] = reverseOffset(x + 0.5, y + 0.5, fields, options), p = (y * width + x) * 4;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw new RangeError('Nonfinite combined field displacement');
    maxDisplacement = Math.max(maxDisplacement, Math.hypot(dx, dy));
    if (image.data[p + 3]) {
      minDx = Math.min(minDx, dx); maxDx = Math.max(maxDx, dx);
      minDy = Math.min(minDy, dy); maxDy = Math.max(maxDy, dy);
      displacementRow.writeDoubleLE(Math.round(dx * 1e7) / 1e7, x * 16);
      displacementRow.writeDoubleLE(Math.round(dy * 1e7) / 1e7, x * 16 + 8);
    }
    if (Math.abs(dx) < EPS && Math.abs(dy) < EPS) {
      for (let c = 0; c < 4; c++) data[p + c] = image.data[p + c];
      if (!data[p + 3]) data.fill(0, p, p + 3);
      unchangedPixels++;
    } else {
      const colour = sample(image, x + 0.5 + dx, y + 0.5 + dy);
      for (let c = 0; c < 3; c++) data[p + c] = Math.round(colour[c]);
      data[p + 3] = Math.round(colour[3] * 255);
      if (!data[p + 3]) data.fill(0, p, p + 3);
    }
    }
    geometryHasher.update(displacementRow);
  }
  const displacementHash = geometryHasher.digest('hex');
  const localGeometryHash = maxDx - minDx > 1e-6 || maxDy - minDy > 1e-6 ? displacementHash : null;
  let minJacobian = Infinity, foldedSamples = 0, jacobianSamples = 0;
  const step = options.jacobianStep ?? 8;
  if (!Number.isInteger(step) || step < 1) throw new TypeError('jacobianStep must be a positive integer');
  // Sampled diagnostic, not a proof of a globally invertible field.
  for (let y = 0.5; y < height; y += step) for (let x = 0.5; x < width; x += step) {
    const l = reverseOffset(x - 0.5, y, fields, options), r = reverseOffset(x + 0.5, y, fields, options);
    const u = reverseOffset(x, y - 0.5, fields, options), d = reverseOffset(x, y + 0.5, fields, options);
    const det = (1 + r[0] - l[0]) * (1 + d[1] - u[1]) - (d[0] - u[0]) * (r[1] - l[1]);
    minJacobian = Math.min(minJacobian, det); if (det <= 0) foldedSamples++; jacobianSamples++;
  }
  return { data, width, height, warpQA: { maxDisplacement, unchangedPixels, minJacobian, foldedSamples, jacobianSamples, localGeometryHash } };
}

/** Build an inverse mesh for local compression/extension about a measured source anchor. */
export function makeSquashField({ rect: r, anchor, scale = [1, 1], columns = 3, rows = 3, feather = 0, strength = 1 }) {
  pair(anchor, 'anchor'); pair(scale, 'scale');
  if (scale.some((n) => n <= EPS)) throw new RangeError('squash scale must be positive');
  if (!Number.isInteger(columns) || columns < 2 || !Number.isInteger(rows) || rows < 2) throw new RangeError('grid must be >=2x2');
  const vectors = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    const p = [r.left + x * r.width / (columns - 1), r.top + y * r.height / (rows - 1)];
    vectors.push([(p[0] - anchor[0]) / scale[0] + anchor[0] - p[0], (p[1] - anchor[1]) / scale[1] + anchor[1] - p[1]]);
  }
  const field = { rect: r, columns, rows, vectors, feather, strength };
  validateFields([field], {}); return field;
}

function mix(a, b, t) {
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) return a.map((v, i) => mix(v, b[i], t));
  return finite(a, 'key value') + (finite(b, 'key value') - a) * t;
}
function setPath(object, location, value) {
  const keys = location.split('.');
  if (keys.some((k) => !k || ['__proto__', 'prototype', 'constructor'].includes(k))) throw new TypeError('Unsafe timeline path');
  let target = object;
  for (let i = 0; i < keys.length - 1; i++) target = target[keys[i]] ??= /^\d+$/.test(keys[i + 1]) ? [] : {};
  target[keys.at(-1)] = value;
}
export function sampleTimeline(clip, t) {
  finite(t, 'time');
  const pose = structuredClone(clip.basePose ?? { parts: {} });
  for (const track of clip.tracks ?? []) {
    const keys = track.keys;
    if (!Array.isArray(keys) || !keys.length) throw new TypeError(`Empty track: ${track.path}`);
    const method = track.interpolation ?? 'linear';
    if (!['linear', 'smoothstep', 'step'].includes(method)) throw new TypeError(`Unknown interpolation: ${method}`);
    keys.forEach((key, i) => {
      finite(key.t, 'key time'); mix(key.value, key.value, 0);
      if (key.t < 0 || key.t > 1 || (i && key.t <= keys[i - 1].t)) throw new RangeError('Track times must strictly increase in [0,1]');
    });
    let value = keys[0].value;
    if (t >= keys.at(-1).t) value = keys.at(-1).value;
    else if (t > keys[0].t) {
      const end = keys.findIndex((key) => key.t >= t), a = keys[end - 1], b = keys[end];
      let u = (t - a.t) / (b.t - a.t);
      if (method === 'smoothstep') u = smooth(u);
      if (method === 'step') u = t === b.t ? 1 : 0;
      value = mix(a.value, b.value, u);
    }
    setPath(pose, track.path, structuredClone(value));
  }
  return pose;
}

export function analyzeFrame(frame, { alphaThreshold = 1, footTargets = [] } = {}) {
  validateRgba(frame);
  if (!Number.isInteger(alphaThreshold) || alphaThreshold < 1 || alphaThreshold > 255) throw new RangeError('alphaThreshold must be 1..255');
  let left = frame.width, top = frame.height, right = -1, bottom = -1;
  let opaquePixels = 0, partialPixels = 0, hiddenRgbPixels = 0, borderPixels = 0, alphaSum = 0;
  for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
    const p = (y * frame.width + x) * 4, a = frame.data[p + 3]; alphaSum += a;
    if (a > 0 && a < 255) partialPixels++;
    if (!a && (frame.data[p] || frame.data[p + 1] || frame.data[p + 2])) hiddenRgbPixels++;
    if (a >= alphaThreshold) {
      opaquePixels++; left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
      if (!x || !y || x === frame.width - 1 || y === frame.height - 1) borderPixels++;
    }
  }
  const feet = footTargets.map(({ landmark, target, contact = true }) => {
    const actual = frame.landmarks?.[landmark];
    if (!actual) throw new Error(`Missing measured foot landmark: ${landmark}`);
    pair(target, 'foot target');
    const contactValue = frame.contacts?.[landmark] ?? landmark.split('.').reduce((value, key) => value?.[key], frame.contacts);
    const active = contact && contactValue !== 0 && contactValue !== false;
    return { landmark, target, actual, contact: active, drift: active ? Math.hypot(actual[0] - target[0], actual[1] - target[1]) : null };
  });
  return { sha256: hash(frame.data), bbox: right < 0 ? null : { left, top, width: right - left + 1, height: bottom - top + 1 },
    alpha: { opaquePixels, partialPixels, hiddenRgbPixels, alphaSum, transparentPixels: frame.width * frame.height - opaquePixels },
    borderPixels, clippedParts: frame.clippedParts ?? 0, feet, warp: frame.warpQA ?? null };
}

function imageDistance(a, b) {
  let total = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const aa = a.data[i + 3] / 255, ba = b.data[i + 3] / 255;
    for (let c = 0; c < 3; c++) total += Math.abs(a.data[i + c] * aa - b.data[i + c] * ba);
    total += Math.abs(a.data[i + 3] - b.data[i + 3]);
  }
  return total / a.data.length / 255;
}
function numericLeaves(object, location = '', output = {}) {
  if (typeof object === 'number') output[location] = object;
  else if (object && typeof object === 'object') for (const [key, value] of Object.entries(object)) numericLeaves(value, `${location}.${key}`, output);
  return output;
}

/** In-memory render and QA; loop clips sample i/N and separately render virtual t=1. */
export function renderClip(parts, joints, clip, options = {}) {
  if (!CLIP_KINDS.includes(clip.kind)) throw new TypeError('Explicit clip.kind is required');
  const count = clip.frameCount ?? 1;
  if (!Number.isInteger(count) || count < 1) throw new TypeError('frameCount must be a positive integer');
  if (!Number.isFinite(clip.durationMs) || clip.durationMs <= 0) throw new TypeError('durationMs must be positive');
  if (clip.kind === 'static' && count !== 1) throw new Error('static uses one frame, never repeated animation slots');
  const frames = Array.from({ length: count }, (_, i) => bakeLayeredFrame(parts, joints,
    sampleTimeline(clip, clip.loop ? i / count : count === 1 ? 0 : i / (count - 1)), options));
  const stats = frames.map((frame) => analyzeFrame(frame, options));
  const errors = [], warnings = [], hashes = stats.map((s) => s.sha256), uniqueFrames = new Set(hashes).size;
  let localGeometryChanged = false;
  for (let i = 0; i < frames.length && !localGeometryChanged; i++) for (let j = i + 1; j < frames.length && !localGeometryChanged; j++) {
    const a = frames[i], b = frames[j];
    if (a.fieldConfigurationSignature !== b.fieldConfigurationSignature &&
        a.warpQA?.localGeometryHash !== b.warpQA?.localGeometryHash && (a.warpQA?.localGeometryHash || b.warpQA?.localGeometryHash)) {
      localGeometryChanged = true; break;
    }
    const common = a.visiblePartIds.filter((id) => b.visiblePartIds.includes(id));
    if (common.length < 2) continue;
    const ar = inverse(a.transforms[common[0]]), br = inverse(b.transforms[common[0]]);
    localGeometryChanged = common.slice(1).some((id) => {
      const am = mul(ar, a.transforms[id]), bm = mul(br, b.transforms[id]);
      return am.some((n, k) => Math.abs(n - bm[k]) > 1e-7);
    });
  }
  if (stats.some((s) => !s.bbox)) errors.push('empty-frame');
  if (stats.some((s) => s.alpha.hiddenRgbPixels)) errors.push('hidden-rgb');
  if (stats.some((s) => s.warp?.foldedSamples > 0)) errors.push('sampled-mesh-fold');
  if (stats.some((s) => s.borderPixels)) warnings.push('visible-pixels-touch-canvas-edge');
  const footDrifts = stats.flatMap((s) => s.feet).filter((f) => f.contact).map((f) => f.drift);
  const maxFootDrift = footDrifts.length ? Math.max(...footDrifts) : null;
  if (maxFootDrift !== null && maxFootDrift > (options.maxFootDrift ?? 0.25)) errors.push('contact-foot-drift');
  if (!footDrifts.length) warnings.push('contact-foot-drift-unmeasured');
  if (clip.kind === 'rig-baked-sequence' && (count < 2 || uniqueFrames < 2 || !localGeometryChanged)) errors.push('no-local-geometric-animation');
  let loop = null;
  if (clip.loop) {
    const zero = sampleTimeline(clip, 0), one = sampleTimeline(clip, 1);
    const delta = Math.min(1e-4, 0.01 / count);
    const nearZero = numericLeaves(sampleTimeline(clip, delta)), nearOne = numericLeaves(sampleTimeline(clip, 1 - delta));
    const a = numericLeaves(zero), b = numericLeaves(one), keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    let maxPoseSeam = 0, maxVelocitySeam = 0;
    for (const key of keys) {
      maxPoseSeam = Math.max(maxPoseSeam, Math.abs((a[key] ?? 0) - (b[key] ?? 0)));
      maxVelocitySeam = Math.max(maxVelocitySeam,
        Math.abs(((nearZero[key] ?? 0) - (a[key] ?? 0)) / delta - ((b[key] ?? 0) - (nearOne[key] ?? 0)) / delta));
    }
    const end = bakeLayeredFrame(parts, joints, one, options);
    loop = { virtualEndSha256: hash(end.data), endpointPixelDistance: imageDistance(frames[0], end), maxPoseSeam, maxVelocitySeam,
      lastToFirstPixelDistance: imageDistance(frames.at(-1), frames[0]) };
    if (maxPoseSeam > (options.maxPoseSeam ?? 1e-6) || loop.endpointPixelDistance > (options.maxLoopPixelDistance ?? 1e-6)) errors.push('loop-position-seam');
    if (maxVelocitySeam > (options.maxVelocitySeam ?? 0.1)) errors.push('loop-velocity-seam');
  }
  return { frames, report: { kind: clip.kind, provenance: clip.kind === 'rig-baked-sequence' ? 'offline-rig-baked; not model-authored continuous frames' : 'explicit-keypose-or-static',
    frameSize: frames[0].width, frameCount: count, durationMs: clip.durationMs, looped: !!clip.loop, uniqueFrames,
    repeatedFrames: hashes.map((h, i) => ({ frame: i, sameAs: hashes.indexOf(h) })).filter((r) => r.frame !== r.sameAs),
    localGeometryChanged, maxFootDrift, loop, frames: stats, errors, warnings, passes: errors.length === 0 } };
}

/** Explicit export only. Validates the complete clip before mkdir/write; caller chooses destination. */
export async function exportClip(parts, joints, clip, outputDir, options = {}) {
  if (typeof outputDir !== 'string' || !path.isAbsolute(outputDir)) throw new TypeError('Absolute outputDir is required');
  const result = renderClip(parts, joints, clip, options);
  if (!result.report.passes) throw new Error(`Clip QA failed: ${result.report.errors.join(', ')}`);
  await mkdir(outputDir, { recursive: true });
  const files = [];
  for (let i = 0; i < result.frames.length; i++) {
    const f = result.frames[i], name = `${String(i).padStart(3, '0')}.png`, file = path.join(outputDir, name);
    await sharp(f.data, { raw: { width: f.width, height: f.height, channels: 4 } }).png().toFile(file);
    files.push(file);
  }
  const reportPath = path.join(outputDir, 'clip-qa.json');
  await writeFile(reportPath, JSON.stringify({ ...result.report, files }, null, 2) + '\n', 'utf8');
  return { files, reportPath, report: result.report };
}
