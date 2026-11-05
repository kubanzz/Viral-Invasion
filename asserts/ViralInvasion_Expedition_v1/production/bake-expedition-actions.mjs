/**
 * Offline Expedition v1 action baking. No generation, frozen-image writes or game integration.
 * node asserts/ViralInvasion_Expedition_v1/production/bake-expedition-actions.mjs [entity ...]
 * Default: all entities in asset-contract.json. Explicit entity arguments support staged delivery.
 * Reads each source-processing.json entry's current output.path (versioned registered master).
 * action-regions.json optionally overrides defaults:
 * {entities:{ritualPriest:{strength:1,regions:{head:[l,t,w,h]},directions:{back_right:{regions:{...}}}}}}
 * Source keys prefer entity/direction/state, then entity/direction. Broken icons require
 * their own real state source. Native256-square icons remain centered; actors stay512 square.
 * --phase p0|p1 selects a contract phase. --validate stages everything without image writes.
 * Region coordinates are normalized to the registered source's visible bbox. They identify
 * anatomy; they never change source scale, pivot or canvas. Inspect the defaults on real art.
 * Existing PNG/GIF outputs are refused, including QA. Change version/path for revisions.
 */
import sharp from 'sharp';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, lstat, rename } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadRgba, warpRgbaLocal, makeSquashField, analyzeFrame } from '../../ViralInvasion_Fantasy_Actors_v2/production/actor-animation-baker.mjs';

const PRODUCTION = dirname(fileURLToPath(import.meta.url)), ROOT = dirname(PRODUCTION);
const CANVAS = [512, 512], FOOT = [256, 435.2];
const PODS = new Set(['basePod', 'rapidPod']);
const METHOD = 'Maliang source art + offline action-specific continuous local soft-body deformation; not AI-generated individual frames';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const rel = path => relative(ROOT, path).replaceAll('\\', '/');
const round = n => Math.round(n * 1e7) / 1e7;
const defaults = {
  basePod: { pod: [.05,0,.95,.8], leafLeft: [.07,0,.6,.77], leafRight: [.5,.15,.5,.58], base: [0,.7,1,.3] },
  rapidPod: { pod: [.04,0,.96,.8], leafLeft: [.02,.04,.59,.73], leafRight: [.48,.07,.52,.69], base: [0,.7,1,.3] },
  ritualMatron: { body: [.1,.15,.8,.7], core: [.3,.25,.4,.45], crown: [.03,0,.94,.45], armLeft: [0,.25,.42,.55], armRight: [.58,.25,.42,.55], base: [0,.8,1,.2] },
  ritualPriest: { body: [.12,.3,.78,.62], head: [.15,0,.8,.45], armLeft: [.1,.4,.53,.36], armRight: [.6,.4,.38,.36], base: [0,.91,1,.09] },
  heartDevourer: { body: [.05,.15,.9,.73], core: [.29,.25,.42,.48], crown: [.02,0,.96,.5], jawLeft: [.04,.31,.46,.52], jawRight: [.5,.31,.46,.52], base: [0,.85,1,.15] },
  campTentWarehouse: { upper: [0,0,1,.8], feature: [.2,.2,.6,.5], base: [0,.72,1,.28] },
  campForge: { upper: [0,0,1,.8], feature: [.2,.2,.6,.5], base: [0,.72,1,.28] },
  campSupply: { upper: [0,0,1,.8], feature: [.2,.2,.6,.5], base: [0,.72,1,.28] },
  campSortie: { upper: [0,0,1,.8], feature: [.2,.2,.6,.5], base: [0,.72,1,.28] },
};
const timing = {
  ready: [360, true], idle: [400, true], channel: [220, true], load: [150, false], fire: [95, false],
  windup: [190, false], cast: [130, false], construction: [180, false], defeated: [250, false],
  recovery: [220, false], phase2: [300, true], normal: [0,false], broken: [0,false],
};

async function guard(file) {
  const path = resolve(ROOT, file), inside = relative(ROOT, path);
  if (!inside || inside.startsWith('..') || isAbsolute(inside)) throw new Error('Writes must stay inside Expedition_v1');
  let cursor = path;
  for (;;) {
    try { if ((await lstat(cursor)).isSymbolicLink()) throw new Error('Output symlinks/junctions are unsupported'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (cursor === ROOT) break; cursor = dirname(cursor);
  }
  return path;
}
async function absent(file) {
  const path = await guard(file);
  try { await lstat(path); } catch (e) { if (e.code === 'ENOENT') return path; throw e; }
  throw new Error('Refusing to overwrite existing image: ' + rel(path));
}
async function writeImage(file, buffer) {
  const path = await absent(file); await mkdir(await guard(dirname(path)), { recursive: true });
  await writeFile(path, buffer, { flag: 'wx' }); return { path: rel(path), sha256: hash(buffer), bytes: buffer.length };
}
async function writeJson(file, object) {
  const path = await guard(file), temp = await guard(file + '.' + randomUUID() + '.tmp');
  await mkdir(await guard(dirname(path)), { recursive: true });
  await writeFile(temp, JSON.stringify(object, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' }); await rename(temp, path);
}
async function readJson(path, fallback) {
  try { return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, '')); }
  catch (e) { if (e.code === 'ENOENT' && fallback !== undefined) return fallback; throw e; }
}
const png = (frame, size = frame.width) => {
  let pipeline = sharp(frame.data, { raw: { width: frame.width, height: frame.height, channels: 4 } });
  if (size !== frame.width) pipeline = pipeline.resize(size, size, { kernel: 'lanczos3' });
  return pipeline.png({ palette: true, colours: 256, dither: .35, effort: 10, compressionLevel: 9 }).toBuffer();
};
const smooth = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
function curve(values, t) {
  const position = Math.max(0, Math.min(1, t)) * (values.length - 1), index = Math.min(values.length - 2, Math.floor(position));
  return values[index] + (values[index + 1] - values[index]) * smooth(position - index);
}
function makeFields(entity, direction, bbox, overrides, state) {
  const global = overrides.entities?.[entity] ?? {}, specific = global.directions?.[direction] ?? {};
  const sharedState = global.states?.[state] ?? {}, directionState = specific.states?.[state] ?? {};
  const regions = { ...(defaults[entity] ?? {}), ...(global.regions ?? {}), ...(specific.regions ?? {}), ...(sharedState.regions ?? {}), ...(directionState.regions ?? {}) };
  const strength = (directionState.strength ?? sharedState.strength ?? specific.strength ?? global.strength ?? 1) * (global._autoScale ?? 1);
  if (!Number.isFinite(strength) || strength <= 0 || strength > 2) throw new Error(entity + ': strength must be in (0,2]');
  const [left, top, right, bottom] = bbox, width = right - left, height = bottom - top;
  function region(name, pad = PODS.has(entity) ? .12 : .09) {
    const r = regions[name];
    if (!Array.isArray(r) || r.length !== 4 || r.some(n => !Number.isFinite(n)) || r[2] <= 0 || r[3] <= 0)
      throw new Error(entity + '/' + direction + ': invalid region ' + name);
    const p = Math.min(width, height) * pad;
    const x = Math.max(0, left + r[0] * width - p), y = Math.max(0, top + r[1] * height - p);
    return { left: x, top: y, width: Math.min(512, left + (r[0] + r[2]) * width + p) - x,
      height: Math.min(512, top + (r[1] + r[3]) * height + p) - y };
  }
  const anchor = (name, position = [.5, .5]) => {
    const r = regions[name]; return [left + (r[0] + r[2] * position[0]) * width, top + (r[1] + r[3] * position[1]) * height];
  };
  const fields = [];
  const feather = r => {
    const explicit = directionState.fieldFeatherPx ?? sharedState.fieldFeatherPx ?? specific.fieldFeatherPx ?? global.fieldFeatherPx ?? (PODS.has(entity) ? 48 : 44);
    return explicit !== null ? Math.max(8, Math.min(explicit, r.width * .45, r.height * .45)) : Math.max(8, Math.min(32, r.width * .17, r.height * .22));
  };
  function add(name, field, operation) { if (!(directionState.disabledParts ?? sharedState.disabledParts ?? specific.disabledParts ?? global.disabledParts ?? []).includes(name)) fields.push({ ...field, strength, part: name, operation }); }
  return { fields, regions, strength,
    move(name, x, y) { const rect = region(name); add(name, { rect, displacement: [-x, -y].map(round), feather: feather(rect) }, 'local-translation'); },
    scale(name, x, y, at = [.5, .75]) { const rect = region(name); add(name, makeSquashField({ rect, anchor: anchor(name, at), scale: [x, y], feather: feather(rect) }), 'local-squash'); },
    rotate(name, degrees, at = [.5, .75]) {
      const rect = region(name), a = anchor(name, at), radians = -degrees * Math.PI / 180, c = Math.cos(radians), s = Math.sin(radians), vectors = [];
      for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
        const dx = rect.left + x * rect.width / 2 - a[0], dy = rect.top + y * rect.height / 2 - a[1];
        vectors.push([round(c * dx - s * dy - dx), round(s * dx + c * dy - dy)]);
      }
      add(name, { rect, columns: 3, rows: 3, vectors, feather: feather(rect) }, 'local-rotation');
    },
    wholeScale(x, y, at = FOOT) { add('registered-whole', makeSquashField({ rect: { left: 0, top: 0, width: 512, height: 512 }, anchor: at, scale: [x, y], feather: 0 }), 'anchor-preserving-upper-body-or-collapse-scale'); },
  };
}

/** Default anatomy is provisional until actual source review supplies action-regions.json. */
function poseAt(entity, direction, state, t, bbox, overrides) {
  const f = makeFields(entity, direction, bbox, overrides, state), c = Math.cos(t * Math.PI * 2), s = Math.sin(t * Math.PI * 2);
  const back = direction === 'back_right';
  let desaturate = 0, darken = 0, pinStrategy = 'ground-ink-strip', description = '';
  const base = f.regions.base;
  const baseTop = base ? bbox[1] + base[1] * (bbox[3] - bbox[1]) : 435.2;
  const hinge = [(bbox[0] + bbox[2]) / 2, baseTop];
  if (PODS.has(entity)) {
    if (state === 'construction') {
      const q = curve([.68,.84,1],t); f.wholeScale(q,q,hinge);
      f.rotate('leafLeft', 3*(1-q), [.5,1]); f.rotate('leafRight', -3*(1-q), [.5,1]);
      description = 'crystal base remains full size; upper life pod grows in three continuous stages';
    } else if (state === 'ready') {
      f.scale('pod',1+.02*c,1-.03*c); f.rotate('leafLeft',-1.8*c); f.rotate('leafRight',1.8*c);
      description='separate pod respiration and opposing soft leaf flex above a fixed crystal base';
    } else if (state === 'load') {
      const q=curve([.3,1],t); f.scale('pod',1+.035*q,1-.12*q,[.5,1]); f.rotate('leafLeft',4*q); f.rotate('leafRight',-4*q);
      description='empty life pod compresses and closes its leaves; no player or ammunition painted';
    } else if (state === 'fire') {
      const q=curve([-.65,1,0],t), rapid=entity==='rapidPod'; f.scale('pod',1-.035*q,1+.10*q,[.5,1]);
      f.rotate('leafLeft',-(rapid?8:7)*q); f.rotate('leafRight',(rapid?8:7)*q); f.move('pod',0,-2.5*q);
      description='stored leaf tension releases and rebounds to rest without a projectile';
    }
    pinStrategy='fixed-base-band';
  } else if (entity==='ritualMatron') {
    if(state==='idle'){f.scale('body',1+.018*c,1-.025*c);f.move('core',0,-2*c);f.rotate('crown',1.4*c);description='independent body breath and crown settling';}
    else if(state==='channel'){f.scale('core',1+.05*c,1+.065*c);f.rotate('armLeft',-3*c);f.rotate('armRight',3*c);f.move('crown',0,-3*c);description='ritual core volume alternates against opposing petals; no membrane or light effect';}
    else if(state==='windup'){const q=curve([.25,1],t);f.scale('body',1+.025*q,1-.055*q);f.move('core',0,4*q);f.move('armLeft',4*q,-5*q);f.move('armRight',-4*q,-5*q);f.rotate('armLeft',-6*q);f.rotate('armRight',6*q);f.move('crown',0,-5*q);description='belly compresses while the two real clasped arms draw inward/up before release';}
    else if(state==='cast'){const q=curve([-.35,1],t);f.scale('core',1+.065*q,1+.08*q);f.move('armLeft',-9*q,-4*q);f.move('armRight',9*q,-4*q);f.rotate('armLeft',6*q);f.rotate('armRight',-6*q);f.move('crown',0,-6*q);description='two actual clasped arms separate visibly from anticipation to release; no membrane or ritual VFX';}
  } else if(entity==='ritualPriest') {
    if(state==='idle'){f.scale('body',1+.018*c,1-.025*c);f.move('head',0,-2*c);f.rotate('armLeft',1.5*c);f.rotate('armRight',-1.5*c);description='robe breath with independent motion of the actual visible sleeves';}
    else if(state==='channel'){f.move('armLeft',-2*c,-4*c);f.move('armRight',2*c,-4*c);f.rotate('armLeft',-3*c);f.rotate('armRight',3*c);f.scale('body',1+.015*c,1-.025*c);description='two real folded sleeves channel in counterphase with body; no staff or hidden hand invented';}
    else if(state==='windup'){const q=curve([.2,1],t);f.rotate('body',-3*q,[.5,.95]);f.move('head',-4*q,-2*q);f.move('armLeft',3*q,-8*q);f.move('armRight',-3*q,-8*q);f.rotate('armLeft',-5*q);f.rotate('armRight',5*q);description='body draws back and actual folded sleeves lift together';}
    else if(state==='cast'){const q=curve([-.4,1],t);f.rotate('body',3*q,[.5,.95]);f.move('armLeft',-8*q,(back?-7:4)*q);f.move('armRight',8*q,(back?-7:4)*q);f.rotate('armLeft',5*q);f.rotate('armRight',-5*q);f.move('head',-2*q,0);description='anticipation to release separates only the sleeves visible in the original source';}
  } else if(entity==='heartDevourer') {
    if(state==='idle'){f.scale('body',1+.02*c,1-.03*c);f.scale('core',1-.025*c,1+.035*c);f.rotate('crown',1.5*c);description='large mother breath with core counter-volume';}
    else if(state==='windup'){const q=curve([.25,1],t);f.scale('core',1-.07*q,1-.085*q);f.move('jawLeft',6*q,-2*q);f.move('jawRight',-6*q,-2*q);f.rotate('jawLeft',-5*q);f.rotate('jawRight',5*q);f.move('crown',0,-4*q);description='explicit anticipation-to-peak core compression and inward closing of the two real front petals';}
    else if(state==='recovery'){const q=curve([1,.2],t);f.scale('body',1+.03*q,1-.045*q);f.move('core',0,4*q);f.move('jawLeft',-3*q,3*q);f.move('jawRight',3*q,3*q);f.rotate('jawLeft',4*q);f.rotate('jawRight',-4*q);description='flared front petals and compressed body settle from the recovery peak toward rest';}
    else if(state==='phase2'){f.scale('core',1.04+.04*c,1.045+.05*c);f.rotate('jawLeft',-4*c);f.rotate('jawRight',4*c);f.move('crown',0,-4*c);description='second-phase core pressure and broader opposed jaw motion, without effect overlays';}
  } else if(entity.startsWith('camp')) {
    if(state==='construction'){f.wholeScale(.73,.73,hinge);f.rotate('feature',-2,[.5,1]);pinStrategy='fixed-base-band';description='single construction keypose with the original base intact and incomplete upper volume';}
    else if(state==='ready'){description='single static ready state from its selected real source';}
  }
  if(state==='defeated'&&(entity==='ritualMatron'||entity==='ritualPriest')){
    const q=curve([.45,1],t); f.wholeScale(1-.065*q,1-.20*q);
    if(entity==='ritualMatron'){f.rotate('armLeft',5*q);f.rotate('armRight',-5*q);f.scale('core',1-.015*q,1-.025*q);}
    else{f.rotate('head',5*q);f.rotate('armLeft',7*q);f.rotate('armRight',-7*q);}
    desaturate=.4+.4*q;darken=.04+.06*q;pinStrategy='logical-anchor-only';description='dry collapsed grey source body around its fixed foot anchor; no blood or added debris';
  }
  if(!description)throw new Error('Missing expedition pose '+entity+'/'+state);
  let pins=[];
  if(pinStrategy==='fixed-base-band')pins=[{left:0,top:baseTop,width:512,height:512-baseTop}];
  else if(pinStrategy!=='logical-anchor-only')pins=[{left:Math.max(0,bbox[0]-2),top:434,width:Math.min(512,bbox[2]+2)-Math.max(0,bbox[0]-2),height:3}];
  return{fields:f.fields,regions:f.regions,strength:f.strength,pinnedRects:pins,pinFeather:pinStrategy==='fixed-base-band'?72:pinStrategy==='logical-anchor-only'?0:24,
    desaturate,darken,pinStrategy,description};
}
function pigment(frame, amount, darken) {
  if (!amount && !darken) return frame;
  const data = Buffer.from(frame.data);
  for (let p = 0; p < data.length; p += 4) {
    if (!data[p + 3]) { data.fill(0, p, p + 3); continue; }
    const grey = .2126 * data[p] + .7152 * data[p + 1] + .0722 * data[p + 2];
    for (let c = 0; c < 3; c++) data[p + c] = Math.round(((1 - amount) * data[p + c] + amount * grey) * (1 - darken));
  }
  return { ...frame, data };
}
function pinCheck(source, output, rects) {
  let changedPixels = 0;
  for (const r of rects) for (let y = Math.max(0, Math.ceil(r.top - .5)); y < 512 && y + .5 <= r.top + r.height; y++) for (let x = Math.max(0, Math.ceil(r.left - .5)); x < 512 && x + .5 <= r.left + r.width; x++) {
    const p = (y * 512 + x) * 4; if ([0, 1, 2, 3].some(c => source.data[p + c] !== output.data[p + c])) changedPixels++;
  }
  return { beforePigmentAndPaletteChangedPixels: changedPixels, exactGeometryPin: changedPixels === 0 };
}
function groundFootprint(image, sourceBbox, baseRegion, entity) {
  const top=sourceBbox[1]+baseRegion[1]*(sourceBbox[3]-sourceBbox[1]);let left=512,right=-1;
  for(let y=Math.max(0,Math.floor(top));y<512;y++)for(let x=0;x<512;x++)if(image.data[(y*512+x)*4+3]>=8){left=Math.min(left,x);right=Math.max(right,x);}
  if(right<left)throw new Error(entity.key+': empty crystal base');
  const baseAlphaWidthPx=right-left+1,worldLogicalCanvasWidth=entity.worldLogicalCanvasWidth;
  const worldDiameter=worldLogicalCanvasWidth*baseAlphaWidthPx/512,limit=entity.groundWorldDiameterMax??80;
  return{baseAlphaWidthPx,worldLogicalCanvasWidth,worldDiameter,limit,pass:worldDiameter<=limit,alphaThreshold:8,
    baseRegionPx:[0,Math.max(0,Math.floor(top)),512,512-Math.max(0,Math.floor(top))],left,rightInclusive:right,
    measurement:'actual encoded alpha>=8 over full-width crystal base band'};
}
async function makeContact(frames) {
  const columns = 4, cell = 192, row = 214, layers = [];
  for (const [i, item] of frames.entries()) {
    const x = i % columns * cell, y = Math.floor(i / columns) * row;
    layers.push({ input: await sharp(item.buffer).resize(cell, cell).flatten({ background: i % 2 ? '#d9ded7' : '#aebfb7' }).png().toBuffer(), left: x, top: y });
    layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="192" height="22"><text x="5" y="16" font-family="Arial" font-size="11" fill="#e7eeee">${item.asset.direction} ${item.asset.state} ${item.asset.frameIndex}</text></svg>`), left: x, top: y + cell });
  }
  return sharp({ create: { width: columns * cell, height: Math.ceil(frames.length / columns) * row, channels: 3, background: '#26332f' } }).composite(layers).png().toBuffer();
}
async function makeGif(frames, delays) {
  const buffers = [];
  for (const frame of frames) buffers.push(await sharp(frame.buffer).resize(192, 192).flatten({ background: '#b9c6c0' }).ensureAlpha().raw().toBuffer());
  return sharp(Buffer.concat(buffers), { raw: { width: 192, height: 192 * frames.length, channels: 4, pageHeight: 192 } })
    .gif({ loop: 0, delay: delays, colours: 128, dither: .3, effort: 5 }).toBuffer();
}

function selectSource(entity,direction,state,report){
  const mapping=entity.sourceKeys?.[direction],explicit=typeof mapping==='object'?mapping[state]:entity.sourceKeys?.[state];
  const candidates=[explicit,entity.key+'/'+direction+'/'+state,entity.key+'/'+direction].filter(x=>typeof x==='string');
  const entry=candidates.map(key=>report.sources.find(s=>s.key===key)).find(Boolean);
  if(!entry)throw new Error('Missing selected state source: '+entity.key+'/'+direction+'/'+state);
  const stateSpecific=entry.key===explicit||entry.key.endsWith('/'+state);
  if(entity.kind==='icon'&&state==='broken'&&!stateSpecific&&entry.state!=='broken')throw new Error(entity.key+': broken icon requires its own real broken source');
  return{entry,stateSpecific};
}
async function loadSelectedSource(entity,direction,state,report){
  const picked=selectSource(entity,direction,state,report),path=await guard(picked.entry.output.path),bytes=await readFile(path);
  if(hash(bytes)!==picked.entry.output.sha256)throw new Error('Registered source SHA changed: '+picked.entry.key);
  const image=await loadRgba(bytes),qa=analyzeFrame(image),icon=entity.kind==='icon';
  if(image.width!==image.height||!(icon?[256,512]:[512]).includes(image.width)||!qa.bbox||qa.borderPixels)throw new Error('Source canvas/alpha invalid: '+picked.entry.key);
  return{...picked,path,bytes,image,qa,bbox:[qa.bbox.left,qa.bbox.top,qa.bbox.left+qa.bbox.width,qa.bbox.top+qa.bbox.height]};
}
function directSource(entity,state,selected){return entity.kind==='icon'||entity.key.startsWith('camp')&&(selected.stateSpecific||state==='ready');}
function staticPose(){return{fields:[],regions:{},strength:1,pinnedRects:[],pinFeather:0,desaturate:0,darken:0,pinStrategy:'registered-static-state-source',description:'unaltered registered Maliang state source; one static frame'};}
function poseFor(entity,direction,state,t,selected,overrides){return directSource(entity,state,selected)?staticPose():poseAt(entity.key,direction,state,t,selected.bbox,overrides);}

/** A single multiplier per entity; no frame-specific attenuation or disabled fold checks. */
async function chooseEntityStrength(entity,sourceReport,overrides){
  const sources=[];
  for(const direction of entity.directions)for(const [state,count]of Object.entries(entity.states)){
    const selected=await loadSelectedSource(entity,direction,state,sourceReport);
    if(!directSource(entity,state,selected))sources.push({direction,state,count,selected});
  }
  if(!sources.length)return{overrides,report:{method:'static registered state sources; no deformation',factor:1,effectiveStrength:1,testedPoses:0,allSampledPosesHaveZeroFolds:true,attempts:[]}};
  const attempts=[];
  for(const factor of [1,.9,.8,.7,.6]){
    const tuned=structuredClone(overrides);tuned.entities??={};tuned.entities[entity.key]??={};tuned.entities[entity.key]._autoScale=factor;
    let firstFold=null,testedPoses=0,minimumJacobian=Infinity,maximumDisplacementPx=0;
    outer:for(const {direction,state,count,selected}of sources){
      const loop=count>1&&timing[state][1],samples=new Set(count===1?[0]:Array.from({length:loop?8:9},(_,i)=>i/8));
      for(let i=0;i<count;i++)samples.add(count===1?0:loop?i/count:i/(count-1));
      for(const t of [...samples].sort((a,b)=>a-b)){
        const pose=poseFor(entity,direction,state,t,selected,tuned),result=warpRgbaLocal(selected.image,pose.fields,{pinnedRects:pose.pinnedRects,pinFeather:pose.pinFeather,jacobianStep:4});
        testedPoses++;minimumJacobian=Math.min(minimumJacobian,result.warpQA.minJacobian);maximumDisplacementPx=Math.max(maximumDisplacementPx,result.warpQA.maxDisplacement);
        if(result.warpQA.foldedSamples){firstFold={direction,state,t,foldedSamples:result.warpQA.foldedSamples};break outer;}
      }
    }
    attempts.push({factor,testedPoses,minimumJacobian,maximumDisplacementPx,firstFold});
    if(!firstFold)return{overrides:tuned,report:{method:'entity-wide continuous1/8 phase zero-fold selection on actual source',factor,effectiveStrength:(overrides.entities?.[entity.key]?.strength??1)*factor,testedPoses,minimumJacobian,maximumDisplacementPx,allSampledPosesHaveZeroFolds:true,attempts,frameSpecificAttenuation:false}};
  }
  throw new Error(entity.key+': no zero-fold solution>=0.6; revise real anatomy regions/feather/anchors before output. '+JSON.stringify(attempts));
}
function frameTiming(entity,state,count){
  if(count===1)return{frameMs:0,loop:false};
  if(!timing[state])throw new Error('Unknown animation timing '+state);
  return{frameMs:entity.key==='rapidPod'&&state==='fire'?70:timing[state][0],loop:timing[state][1]};
}
export async function bakeExpeditionActions(requested=[],options={}){
  const contract=await readJson(resolve(PRODUCTION,'asset-contract.json'));
  if(JSON.stringify(contract.canvas)!==JSON.stringify(CANVAS)||JSON.stringify(contract.foot)!==JSON.stringify(FOOT))throw new Error('Unexpected expedition actor registration');
  const allCount=contract.entities.reduce((sum,e)=>sum+e.directions.length*Object.values(e.states).reduce((a,b)=>a+b,0),0);
  const allGroups=contract.entities.reduce((sum,e)=>sum+e.directions.length*Object.keys(e.states).length,0);
  if(allCount!==74||allGroups!==43||allCount!==contract.expectedRuntimeCount||allGroups!==contract.expectedAnimationGroupCount)throw new Error('Contract must remain74 frames/43 groups');
  if(options.phase&&!['p0','p1'].includes(options.phase))throw new Error('phase must be p0 or p1');
  const entities=contract.entities.filter(e=>(!options.phase||e.phase===options.phase)&&(!requested.length||requested.includes(e.key)));
  if(!entities.length||requested.some(key=>!entities.some(e=>e.key===key)))throw new Error('Unknown entity or entity outside selected phase');
  const sourceReport=await readJson(resolve(PRODUCTION,'source-processing.json')),overrides=await readJson(resolve(PRODUCTION,'action-regions.json'),{});
  const fragmentFile=resolve(PRODUCTION,'animation-fragment.json');
  const fragment=await readJson(fragmentFile,{schemaVersion:1,scope:'Expedition_v1-actions-only',assets:[],clips:[],qa:[],sourceGroups:[]});
  if(fragment.scope!=='Expedition_v1-actions-only')throw new Error('Refuse unrelated animation fragment');
  for(const entity of entities){
    if(entity.kind!=='icon'&&!defaults[entity.key])throw new Error('No entity anatomy profile '+entity.key);
    await absent('production/qa/'+entity.key+'.contact.png');
    for(const direction of entity.directions)for(const [state,count]of Object.entries(entity.states)){
      if(!Number.isInteger(count)||count<1||count>3||!timing[state])throw new Error('Unsupported state count/timing '+state);
      for(let i=0;i<count;i++)await absent(`${entity.key}/${direction}/${state}/${String(i).padStart(2,'0')}.png`);
      if(count>1)await absent(`production/qa/animations/${entity.key}.${direction}.${state}.gif`);
    }
  }
  for(const entity of entities){
    const tuning=await chooseEntityStrength(entity,sourceReport,overrides),entityOverrides=tuning.overrides;
    console.log(JSON.stringify({entity:entity.key,phase:entity.phase,validation:'zero-fold-poses',...tuning.report}));
    const staged=[],clips=[],groups=[],seenSources=new Set();
    for(const direction of entity.directions)for(const [state,count]of Object.entries(entity.states)){
      const selected=await loadSelectedSource(entity,direction,state,sourceReport),entry=selected.entry,icon=entity.kind==='icon';
      const canvas=[selected.image.width,selected.image.height],pivot=icon?[.5,.5]:[.5,.85],anchor=pivot.map((v,i)=>v*canvas[i]),foot=icon?null:FOOT;
      if(!seenSources.has(entry.key)){
        seenSources.add(entry.key);groups.push({sourceId:entry.key,registrationGroup:entry.key,sourcePath:rel(selected.path),sourceSha256:hash(selected.bytes),runId:entry.runId,
          matrixOriginalToRegistered:entry.registration.matrixOriginalToRegistered,canvas,pivot,foot,anchor,
          sourceMethod:entry.sourceMethod??null,generationOccurredThisBatch:entry.generationOccurredThisBatch??true,parentRunId:entry.parentRunId??null,provenanceRecord:entry.provenanceRecord??null,sourceProvenance:entry.sourceProvenance??null,
          regions:icon?{}:makeFields(entity.key,direction,selected.bbox,entityOverrides,state).regions,strengthResolution:tuning.report});
      }
      const {frameMs,loop}=frameTiming(entity,state,count),clipFrames=[];
      for(let i=0;i<count;i++){
        const t=count===1?0:loop?i/count:i/(count-1),pose=poseFor(entity,direction,state,t,selected,entityOverrides);
        if(count>1&&pose.fields.length<2)throw new Error(entity.key+'/'+state+': action needs independent local anatomy motion');
        const warped=pose.fields.length?warpRgbaLocal(selected.image,pose.fields,{pinnedRects:pose.pinnedRects,pinFeather:pose.pinFeather,jacobianStep:4}):{...selected.image,warpQA:{maxDisplacement:0,minJacobian:1,foldedSamples:0,localGeometryHash:null}};
        if(warped.warpQA.foldedSamples)throw new Error(entity.key+'/'+state+': folded reverse field');
        const pins=pinCheck(selected.image,warped,pose.pinnedRects);if(!pins.exactGeometryPin)throw new Error(entity.key+'/'+state+': exact support pixels moved');
        const frame=pigment(warped,pose.desaturate,pose.darken),buffer=await png(frame),decoded=await loadRgba(buffer),qa=analyzeFrame(decoded);
        if(!qa.bbox||qa.borderPixels||qa.alpha.hiddenRgbPixels||!qa.alpha.transparentPixels)throw new Error(entity.key+'/'+state+': encoded alpha/margin failed');
        const footprint=PODS.has(entity.key)?groundFootprint(decoded,selected.bbox,pose.regions.base,entity):null;
        if(footprint&&!footprint.pass)throw new Error(entity.key+': base world diameter exceeds limit '+footprint.worldDiameter);
        const id=`${entity.idPrefix}.${direction}.${state}.${String(i).padStart(2,'0')}`,group=`${entity.key}.${direction}.${state}`;
        const kind=count===1?'static-state':'rig-baked-sequence';
        const asset={id,entity:entity.key,phase:entity.phase,direction,state,frameIndex:i,kind,runtime:true,sourceId:entry.key,registrationGroup:entry.key,runId:entry.runId??null,
          path:`${entity.key}/${direction}/${state}/${String(i).padStart(2,'0')}.png`,sha256:hash(buffer),bytes:buffer.length,dimensions:canvas,canvas,pivot,foot,anchor,trim:false,
          worldVisibleHeight:entity.suggestedVisibleWorldHeight??null,worldLogicalCanvasWidth:entity.worldLogicalCanvasWidth??null,worldWidthStatus:entity.worldWidthStatus,
          animation:{group,index:i,fps:count===1?0:1000/frameMs,frameCount:count},actorRegistration:{canvas,foot,anchor,commonCanvasScale:1},groundFootprint:footprint,
          method:count===1?'Maliang selected state source plus transparent registration and explicit static keypose processing':METHOD,
          aiGeneratedThisFrame:false,sourceGenerationOccurredThisBatch:entry.generationOccurredThisBatch??true,
          alpha:qa.alpha,bbox:qa.bbox,sourceProcessing:{key:entry.key,report:'production/source-processing.json',sourcePath:rel(selected.path),sourceSha256:hash(selected.bytes),rawSha256:entry.raw.sha256,matrixOriginalToRegistered:entry.registration.matrixOriginalToRegistered,prompt:entry.prompt??null,
            sourceMethod:entry.sourceMethod??null,generationOccurredThisBatch:entry.generationOccurredThisBatch??true,parentRunId:entry.parentRunId??null,provenanceRecord:entry.provenanceRecord??null,sourceProvenance:entry.sourceProvenance??null},
          deformation:{normalizedTime:t,description:pose.description,effectiveStrength:pose.strength,strengthResolution:tuning.report,fields:pose.fields,pinnedRects:pose.pinnedRects,pinFeather:pose.pinFeather,pinStrategy:pose.pinStrategy,pigment:{desaturate:pose.desaturate,darken:pose.darken},warpQA:warped.warpQA,pinCheck:pins},
          palette:{colours:256,dither:.35},status:'baked-awaiting-actual-visual-review',runtimeSamplingEstimate:Object.fromEntries(await Promise.all([128,192,256].map(async size=>[size,(await png(frame,size)).length])))};
        const item={asset,buffer};staged.push(item);clipFrames.push(item);
      }
      const distinct=new Set(clipFrames.map(f=>f.asset.sha256)).size;if(distinct!==count)throw new Error(entity.key+'/'+state+': duplicate frames');
      const endpointPoses=loop?[0,1].map(t=>poseFor(entity,direction,state,t,selected,entityOverrides)):null;
      const loopClosed=!loop||JSON.stringify(endpointPoses[0].fields)===JSON.stringify(endpointPoses[1].fields);if(!loopClosed)throw new Error('Loop parameters do not close');
      const name=`${entity.key}.${direction}.${state}`;
      clips.push({name,entity:entity.key,phase:entity.phase,direction,state,sourceId:entry.key,registrationGroup:entry.key,ids:clipFrames.map(f=>f.asset.id),frameDurationsMs:clipFrames.map(()=>frameMs),durationMs:frameMs*count,loop,
        kind:count===1?'static-state':'rig-baked-sequence',method:count===1?'selected-static-state-or-explicit-local-keypose':METHOD,foot,anchor,pivot,canvas,trim:false,
        qa:{distinctFrames:distinct,localGeometryEvidence:count===1?null:clipFrames.some(f=>!!f.asset.deformation.warpQA.localGeometryHash),loopParameterClosure:loopClosed,actualVisualReview:false},frames:clipFrames});
    }
    const contact=await makeContact(staged),gifs=[];
    for(const clip of clips)if(clip.frames.length>1)gifs.push({clip,buffer:await makeGif(clip.frames,clip.frameDurationsMs)});
    if(options.validateOnly){console.log(JSON.stringify({entity:entity.key,validation:'complete-staged-frames-and-qa',frames:staged.length,writes:0}));continue;}
    for(const item of staged)await writeImage(item.asset.path,item.buffer);
    const contactEntry=await writeImage('production/qa/'+entity.key+'.contact.png',contact);
    for(const gif of gifs)gif.clip.qa.animation=await writeImage(`production/qa/animations/${gif.clip.name}.gif`,gif.buffer);
    fragment.assets.push(...staged.map(f=>f.asset));fragment.clips.push(...clips.map(({frames,...clip})=>clip));fragment.sourceGroups.push(...groups);fragment.qa.push({entity:entity.key,phase:entity.phase,contact:contactEntry,runtime:false});
    fragment.expectedRuntimeCount=74;fragment.expectedAnimationGroupCount=43;fragment.completedRuntimeCount=fragment.assets.length;fragment.completedAnimationGroupCount=fragment.clips.length;
    fragment.completedByPhase=Object.fromEntries(['p0','p1'].map(phase=>[phase,{frames:fragment.assets.filter(a=>a.phase===phase).length,groups:fragment.clips.filter(c=>c.phase===phase).length}]));
    fragment.method=METHOD;fragment.status=fragment.assets.length===74?'all-baked-awaiting-actual-visual-review':'partial-baked-awaiting-actual-visual-review';fragment.updatedAt=new Date().toISOString();fragment.canvas=CANVAS;fragment.pivot=[.5,.85];fragment.foot=FOOT;fragment.trim=false;
    fragment.totalBytes=fragment.assets.reduce((sum,a)=>sum+a.bytes,0);fragment.totalMiB=fragment.totalBytes/1048576;
    fragment.runtimeSamplingEstimate=Object.fromEntries([128,192,256].map(size=>[size,{bytes:fragment.assets.reduce((sum,a)=>sum+a.runtimeSamplingEstimate[size],0),method:'actual full-canvas sampling and256-colour PNG encoding in memory'}]));
    const existing=contract.runtimeBudget.existingApproxMiB,newBytes=fragment.assets.reduce((sum,a)=>sum+a.runtimeSamplingEstimate[contract.entities.find(e=>e.key===a.entity).recommendedRuntimeTexture],0),newEstimate=newBytes*4/3*1.2/1048576+.25;
    fragment.budget={sourcePngTargetBytes:8*1048576,sourcePngTargetMet:fragment.totalBytes<8*1048576,existingApproxMiB:existing,newRecommendedPngBytes:newBytes,newConservativeEstimateMiB:newEstimate,
      newConservativeMaxMiB:contract.runtimeBudget.newConservativeMaxMiB,newRuntimeWithinTarget:newEstimate<=contract.runtimeBudget.newConservativeMaxMiB,combinedRecommendedEstimateMiB:existing+newEstimate,totalRuntimeBudgetMiB:contract.runtimeBudget.totalMiB,qaCountsTowardRuntimeBudget:false};
    await writeJson(fragmentFile,fragment);console.log(JSON.stringify({entity:entity.key,frames:staged.length,completed:fragment.completedRuntimeCount,totalBytes:fragment.totalBytes,contact:contactEntry.path}));
  }
  return options.validateOnly?{validatedEntities:entities.map(e=>e.key),writes:0}:{fragment:rel(fragmentFile),completedRuntimeCount:fragment.completedRuntimeCount,totalBytes:fragment.totalBytes,budget:fragment.budget};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  try{
    const args=process.argv.slice(2),requested=[],options={};
    for(let i=0;i<args.length;i++){if(args[i]==='--validate')options.validateOnly=true;else if(args[i]==='--phase')options.phase=args[++i];else if(args[i].startsWith('--'))throw new Error('Unknown option '+args[i]);else requested.push(args[i]);}
    console.log(JSON.stringify(await bakeExpeditionActions(requested,options)));
  }catch(error){console.error(error.stack??String(error));process.exitCode=1;}
}
