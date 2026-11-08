import Phaser from 'phaser';
import artRuntime from '../../.art-generated/art-runtime.json';
import { PROLOGUE_ART } from '../render/prologueAssets';
import { DURATION, clamp01, shotAt, smooth } from '../render/worldPrologueTimeline';
import { PrologueAudio } from '../audio/worldPrologueAudio';
import { Player3D } from '../render/player3D';
import type { GameState } from '../game/types';
import './worldPrologue.css';

export interface WorldPrologueOptions {
  onComplete: (reason: 'finished' | 'skipped') => void;
  soundEnabled: boolean;
  lowEffects: boolean;
  onToggleSound?: () => boolean;
  /** Prepare and render the real camp behind the final dissolve, without advancing it. */
  onArrival?: () => void;
}
export interface WorldPrologueHandle {
  readonly active: boolean;
  readonly paused: boolean;
  setPaused(paused: boolean): void;
  destroy(): void;
}
interface ArtAsset {
  atlas: string; frame: string; pivot: { x: number; y: number };
  visibleBounds: { x: number; y: number; width: number; height: number };
  animation?: { fps: number; frameCount: number };
}
const art = artRuntime as unknown as {
  atlases: { key: string; dataUri: string; data: object }[];
  assets: Record<string, ArtAsset>;
};
const IMMUNE = 'fantasy.actor.immune.front_right.';
const VIRUS = 'fantasy.actor.enemy.basic.';
const HERO = 'fantasy.actor.hero.front_right.';
const ACTOR_GROUPS = [IMMUNE + 'crawl', IMMUNE + 'bite', VIRUS + 'walk', VIRUS + 'windup', HERO + 'idle', HERO + 'walk'];
const actorId = (group: string, index = 0) => `${group}.${String(index).padStart(2, '0')}`;
const neededAtlases = new Set(ACTOR_GROUPS.flatMap(group => Array.from({ length: art.assets[actorId(group)]?.animation?.frameCount ?? 4 }, (_, i) => art.assets[actorId(group, i)]?.atlas).filter(Boolean)));
const TAU = Math.PI * 2;
const mint = 0xbcead8, gold = 0xffdea1, purple = 0x885b9e;
const fraction = (x: number) => x - Math.floor(x);

/** A complete, isolated render snapshot: this never enters any gameplay system. */
export function prologueHeroSnapshot(seconds: number, paused: boolean, moving: boolean, facing: number): GameState {
  const time = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  return {
    game: 'viral-invasion', schemaVersion: 1, seed: 750033, phase: paused ? 'paused' : 'playing',
    tick: Math.floor(time * 60), elapsed: time, visualTime: time,
    player: { x: Math.min(8, Math.max(0, time - 21)) * 95, y: 0, hp: 100, radius: 14, facing,
      moving, dashUntil: 0, dashReady: 0, hurtUntil: 0, actionUntil: 0 },
    targets: [], tissue: { x: 0, y: 0, hp: 100, maxHp: 100, radius: 20 }, terminal: { x: 0, y: 0 }, tool: 1,
    cooldowns: { 1: 0, 2: 0, 3: 0 }, scanReady: 0, scanUntil: 0, effects: [], events: [], message: '', messageUntil: 0,
    shots: 0, hits: 0, scans: 0, dashes: 0, result: null, camp: { introComplete: true, introSeconds: 0 },
  };
}

/** A self-contained film presentation. All movement samples a single pausable clock. */
export function playWorldPrologue(options: WorldPrologueOptions): WorldPrologueHandle {
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
  const overlay = document.createElement('section');
  overlay.id = 'world-prologue'; overlay.className = 'world-prologue';
  overlay.dataset.worldPrologue = 'active'; overlay.dataset.elapsed = '0'; overlay.dataset.shot = 'body';
  overlay.dataset.paused = 'false'; overlay.dataset.ready = 'false';
  overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', '病毒入侵 · 世界序章');
  overlay.innerHTML = `<div class="world-prologue-stage" aria-hidden="true"></div><div class="world-prologue-vignette"></div>
    <header class="world-prologue-header"><div class="world-prologue-brand"><strong>病毒入侵</strong><span><i></i>序章 · 体内防线</span></div>
    <nav class="world-prologue-controls" aria-label="序章播放控制"><button type="button" data-prologue-action="sound"></button><button type="button" data-prologue-action="pause" aria-keyshortcuts="P">暂停</button><button type="button" data-prologue-action="skip" aria-keyshortcuts="Escape">跳过序章 ›</button></nav></header>
    <div class="world-prologue-pause-status" hidden>演出已暂停<small>点击继续，或按 P</small></div>
    <div class="world-prologue-caption" aria-live="polite" aria-atomic="true"><p class="world-prologue-location"></p><h2 class="world-prologue-title"></h2><p class="world-prologue-subtitle"></p></div>
    <div class="world-prologue-progress" role="progressbar" aria-label="序章播放进度" aria-valuemin="0" aria-valuemax="33" aria-valuenow="0"><span></span></div>`;
  document.body.append(overlay);
  const stage = overlay.querySelector<HTMLDivElement>('.world-prologue-stage')!;
  const vignette = overlay.querySelector<HTMLElement>('.world-prologue-vignette')!;
  const pauseButton = overlay.querySelector<HTMLButtonElement>('[data-prologue-action="pause"]')!;
  const soundButton = overlay.querySelector<HTMLButtonElement>('[data-prologue-action="sound"]')!;
  const skipButton = overlay.querySelector<HTMLButtonElement>('[data-prologue-action="skip"]')!;
  const pauseStatus = overlay.querySelector<HTMLDivElement>('.world-prologue-pause-status')!;
  const caption = overlay.querySelector<HTMLDivElement>('.world-prologue-caption')!;
  const location = overlay.querySelector<HTMLParagraphElement>('.world-prologue-location')!;
  const title = overlay.querySelector<HTMLHeadingElement>('.world-prologue-title')!;
  const subtitle = overlay.querySelector<HTMLParagraphElement>('.world-prologue-subtitle')!;
  const progress = overlay.querySelector<HTMLDivElement>('[role="progressbar"]')!;
  const audio = new PrologueAudio();
  const hero3D = new Player3D();
  overlay.dataset.hero3d = 'loading';
  let sound = options.soundEnabled;
  audio.setEnabled(sound);
  let active = true, ready = false, seconds = 0, userPaused = false, externalPaused = false;
  let hiddenPaused = document.hidden, blurredPaused = false, arrivalCalled = false, currentShot = '';
  let game: Phaser.Game | undefined;
  const isPaused = () => userPaused || externalPaused || hiddenPaused || blurredPaused;
  const soundState = () => {
    soundButton.textContent = sound ? '声音 开' : '声音 关';
    soundButton.setAttribute('aria-pressed', String(sound));
    soundButton.setAttribute('aria-label', sound ? '关闭序章声音' : '开启序章声音');
  };
  const pauseState = () => {
    const paused = isPaused(); overlay.dataset.paused = String(paused);
    pauseButton.textContent = userPaused ? '继续' : '暂停'; pauseButton.setAttribute('aria-pressed', String(userPaused));
    pauseStatus.hidden = !paused;
    pauseStatus.innerHTML = externalPaused ? '请横屏观看<small>转回横屏后继续</small>'
      : hiddenPaused || blurredPaused ? '演出已暂停<small>返回窗口后继续</small>' : '演出已暂停<small>点击继续，或按 P</small>';
    if (paused) audio.pause();
    else audio.setEnabled(sound); // Mobile browsers may suspend audio while the page is hidden.
  };
  const destroy = () => {
    if (!active) return;
    active = false; audio.destroy(); hero3D.destroy();
    window.removeEventListener('keydown', keydown, true); window.removeEventListener('keyup', keyup, true);
    window.removeEventListener('blur', blur); window.removeEventListener('focus', focus);
    document.removeEventListener('visibilitychange', visibility);
    overlay.remove(); game?.destroy(true); game = undefined;
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  };
  const finish = (reason: 'finished' | 'skipped') => {
    if (!active) return;
    destroy(); options.onComplete(reason);
  };
  const keydown = (event: KeyboardEvent) => {
    if (!active) return;
    if (event.key === 'Tab') {
      const controls = [soundButton, pauseButton, skipButton], at = controls.indexOf(document.activeElement as HTMLButtonElement);
      controls[at < 0 ? event.shiftKey ? 2 : 0 : (at + (event.shiftKey ? 2 : 1)) % controls.length].focus();
    } else if (event.key === 'Escape' && !event.repeat) finish('skipped');
    else if (event.code === 'KeyP' && !event.repeat) { userPaused = !userPaused; pauseState(); }
    else if ((event.key === 'Enter' || event.key === ' ') && !event.repeat && document.activeElement instanceof HTMLButtonElement && overlay.contains(document.activeElement)) document.activeElement.click();
    // Browser shortcuts remain browser-owned; gameplay keys never reach the background.
    if (!event.ctrlKey && !event.metaKey && !event.altKey) event.preventDefault();
    event.stopImmediatePropagation();
  };
  const keyup = (event: KeyboardEvent) => { if (active) { event.stopImmediatePropagation(); if (!event.ctrlKey && !event.metaKey && !event.altKey) event.preventDefault(); } };
  const blur = () => { blurredPaused = true; pauseState(); };
  const focus = () => { blurredPaused = false; hiddenPaused = document.hidden; pauseState(); };
  const visibility = () => { hiddenPaused = document.hidden; pauseState(); };
  window.addEventListener('keydown', keydown, true); window.addEventListener('keyup', keyup, true);
  window.addEventListener('blur', blur); window.addEventListener('focus', focus);
  document.addEventListener('visibilitychange', visibility);
  overlay.addEventListener('pointerdown', event => event.stopPropagation());
  overlay.addEventListener('pointerup', event => event.stopPropagation());
  overlay.addEventListener('click', event => {
    event.stopPropagation();
    const action = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-prologue-action]')?.dataset.prologueAction;
    if (action === 'skip') finish('skipped');
    if (action === 'pause') { userPaused = !userPaused; pauseState(); }
    if (action === 'sound') { sound = options.onToggleSound?.() ?? !sound; audio.setEnabled(sound); soundState(); }
  });
  soundState(); pauseState(); skipButton.focus({ preventScroll: true });
  void hero3D.ready.then(() => { if (active) overlay.dataset.hero3d = hero3D.available ? 'ready' : 'fallback'; });

  class PrologueScene extends Phaser.Scene {
    private root!: Phaser.GameObjects.Container;
    private background!: Phaser.GameObjects.Image;
    private mist!: Phaser.GameObjects.Image;
    private fx!: Phaser.GameObjects.Graphics;
    private under!: Phaser.GameObjects.Graphics;
    private actors: Phaser.GameObjects.Image[] = [];
    private motes: Phaser.GameObjects.Image[] = [];
    private sideTitle!: Phaser.GameObjects.Text;
    private sideDetail!: Phaser.GameObjects.Text;
    private lastBackground = '';
    private loadFailures = 0;
    private readonly actorTextures = new Map<string, string>();
    private heroImage!: Phaser.GameObjects.Image;
    private heroTexture!: Phaser.Textures.CanvasTexture;
    private readonly heroBuffer = document.createElement('canvas');
    constructor() { super('world-prologue'); }
    preload() {
      this.load.on('loaderror', () => { this.loadFailures++; overlay.dataset.loadErrors = String(this.loadFailures); });
      for (const [id, uri] of Object.entries(PROLOGUE_ART)) this.load.image(`prologue:${id}`, uri);
      for (const atlas of art.atlases) if (neededAtlases.has(atlas.key)) this.load.atlas(atlas.key, atlas.dataUri, atlas.data);
    }
    create() {
      if (!active) return;
      // This second, short-lived renderer needs only 26 actor frames. Keep small
      // per-frame textures instead of retaining three whole 2048px GPU atlases.
      for (const group of ACTOR_GROUPS) {
        const count = art.assets[actorId(group)]?.animation?.frameCount ?? 4;
        for (let i = 0; i < count; i++) {
          const id = actorId(group, i), asset = art.assets[id];
          if (!asset || !this.textures.exists(asset.atlas)) continue;
          const frame = this.textures.getFrame(asset.atlas, asset.frame);
          if (!frame) continue;
          const buffer = document.createElement('canvas'); buffer.width = frame.realWidth; buffer.height = frame.realHeight;
          buffer.getContext('2d')!.drawImage(frame.source.image as HTMLImageElement,
            frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, frame.x, frame.y, frame.cutWidth, frame.cutHeight);
          const key = `prologue:actor:${id}`; this.textures.addCanvas(key, buffer); this.actorTextures.set(id, key);
        }
      }
      if (this.actorTextures.size > 0) for (const key of neededAtlases) this.textures.remove(key);
      const glow = document.createElement('canvas'); glow.width = glow.height = 128;
      const ctx = glow.getContext('2d')!, gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(.15, '#ffffffb0'); gradient.addColorStop(.5, '#ffffff25'); gradient.addColorStop(1, '#ffffff00');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128); this.textures.addCanvas('prologue:glow', glow);
      this.root = this.add.container(0, 0);
      this.background = this.add.image(800, 450, 'prologue:body'); this.root.add(this.background);
      this.mist = this.add.image(800, 450, 'prologue:body').setAlpha(.1).setBlendMode(Phaser.BlendModes.SCREEN); this.root.add(this.mist);
      this.under = this.add.graphics(); this.root.add(this.under);
      for (let i = 0; i < 46; i++) { const sprite = this.add.image(0, 0, 'prologue:glow').setVisible(false); this.root.add(sprite); this.actors.push(sprite); }
      this.heroBuffer.width = this.heroBuffer.height = 512;
      this.heroTexture = this.textures.addCanvas('prologue:hero3d', this.heroBuffer)!;
      this.heroImage = this.add.image(0, 0, 'prologue:hero3d').setVisible(false); this.root.add(this.heroImage);
      this.fx = this.add.graphics(); this.root.add(this.fx);
      for (let i = 0; i < (options.lowEffects ? 14 : 38); i++) { const mote = this.add.image(0, 0, 'prologue:glow').setBlendMode(Phaser.BlendModes.ADD); this.root.add(mote); this.motes.push(mote); }
      this.sideTitle = this.add.text(160, 345, '', { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: '56px', color: '#eff3df', fontStyle: 'bold', lineSpacing: 17, padding: { x: 4, y: 5 } });
      this.sideDetail = this.add.text(166, 500, '', { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: '17px', color: '#bdd5c6', lineSpacing: 11, letterSpacing: 3 });
      this.root.add([this.sideTitle, this.sideDetail]);
      ready = true; overlay.dataset.ready = 'true'; overlay.dataset.loadErrors = String(this.loadFailures);
      this.paint(0);
    }
    update(_now: number, delta: number) {
      if (!active || !ready) return;
      if (!isPaused()) seconds = Math.min(DURATION, seconds + Math.min(100, Math.max(0, delta)) / 1000);
      this.paint(seconds);
      if (!isPaused()) audio.update(seconds, shotAt(seconds).id);
      if (seconds >= DURATION) finish('finished');
    }
    private sprite(index: number, group: string, x: number, y: number, height: number, age: number, flip = false, alpha = 1) {
      const first = art.assets[actorId(group)];
      if (!first) return;
      const frame = Math.floor(Math.max(0, age) * (first.animation?.fps ?? 8)) % (first.animation?.frameCount ?? 4);
      const id = actorId(group, frame), asset = art.assets[id] ?? first, sprite = this.actors[index];
      const texture = this.actorTextures.get(id) ?? this.actorTextures.get(actorId(group));
      if (!sprite || !texture) return;
      sprite.setVisible(true).setTexture(texture).setOrigin(asset.pivot.x, asset.pivot.y);
      sprite.setPosition(x, y).setScale(height / Math.max(1, asset.visibleBounds.height)).setFlipX(flip).setAlpha(alpha).setRotation(0).clearTint();
    }
    private paint(time: number) {
      const shot = shotAt(time), p = shot.progress, t = shot.local;
      overlay.dataset.elapsed = time.toFixed(2); overlay.dataset.shot = shot.id;
      overlay.style.setProperty('--prologue-progress', `${time / DURATION * 100}%`);
      progress.setAttribute('aria-valuenow', time.toFixed(1));
      if (currentShot !== shot.id) {
        currentShot = shot.id; location.textContent = shot.location; title.textContent = shot.title; subtitle.textContent = shot.subtitle;
        if (shot.id === 'arrival' && !arrivalCalled) { arrivalCalled = true; options.onArrival?.(); }
      }
      const W = this.scale.width, H = this.scale.height, scale = Math.max(W / 1600, H / 900);
      this.root.setScale(scale).setPosition((W - 1600 * scale) / 2, (H - 900 * scale) / 2);
      const key = shot.id === 'body' ? 'body' : shot.id === 'lung' ? 'lung' : shot.id === 'heart' || shot.id === 'orders' ? 'heart' : 'vessel';
      if (key !== this.lastBackground) {
        this.lastBackground = key;
        if (this.textures.exists(`prologue:${key}`)) { this.background.setTexture(`prologue:${key}`); this.mist.setTexture(`prologue:${key}`); }
      }
      const source = this.background.texture.getSourceImage() as HTMLImageElement;
      const cover = Math.max(1600 / (source.width || 1600), 900 / (source.height || 900));
      const drift = options.lowEffects ? 0 : Math.sin(time * .13) * 8;
      const zoom = shot.id === 'transit' ? 1.03 + p * .24 : shot.id === 'body' ? 1 + smooth(p) * .055 : 1.07 + p * .045;
      this.background.setScale(cover * zoom).setPosition(800 + drift - (shot.id === 'transit' ? p * 60 : p * 15), 450 + Math.cos(time * .17) * 5);
      this.mist.setScale(cover * (zoom + .055)).setPosition(806 - drift, 448 - p * 12).setAlpha(shot.id === 'transit' ? .13 : .045);
      const entry = smooth(t / .4), exit = shot.id === 'arrival' ? 1 : smooth((shot.end - time) / .35);
      this.root.setAlpha(entry * exit);
      this.under.clear(); this.fx.clear(); this.actors.forEach(sprite => sprite.setVisible(false)); this.heroImage.setVisible(false);
      this.sideTitle.setVisible(false); this.sideDetail.setVisible(false);
      if (shot.id === 'body') this.body(t, p);
      else if (shot.id === 'lung' || shot.id === 'heart') this.battle(shot.id, t, p);
      else if (shot.id === 'orders') this.orders(t, p);
      else this.transit(t, p, shot.id === 'arrival');
      this.motes.forEach((mote, i) => {
        const speed = shot.id === 'transit' ? 105 : 9;
        const x = fraction(i * .61803398875 + time * speed / 1800) * 1800 - 100;
        const y = fraction(i * .381966 + time * .006) * 950 - 25;
        mote.setPosition(x, y).setTint(i % 4 === 0 ? 0xeec9a4 : 0xc9e8ce).setDisplaySize((i % 4 + 1) * (shot.id === 'transit' ? 4 : 2), (i % 4 + 1) * 2).setAlpha((.1 + Math.sin(time * .8 + i) * .06) * entry);
      });
      const dissolve = shot.id === 'arrival' && options.onArrival ? smooth((t - 1.2) / 2.8) : 0;
      overlay.style.backgroundColor = dissolve > 0 ? 'transparent' : '#0b171c';
      stage.style.opacity = String(1 - dissolve); vignette.style.opacity = String(1 - dissolve);
      caption.style.opacity = String(Math.min(1, entry * 1.4) * (1 - smooth((shot.id === 'arrival' ? t - 2.7 : -1) / 1.1)));
    }
    private body(t: number, p: number) {
      this.sideTitle.setText('病毒入侵\n全身防线告急').setVisible(true).setAlpha(smooth((t - .3) / 1.2));
      this.sideDetail.setPosition(166, 550).setText('宿主体内 / 多处感染扩散\n免疫军已进入全面作战').setVisible(true).setAlpha(smooth((t - 1) / 1.2));
      const routes = [
        [[1046, 180], [1052, 230], [1010, 275], [966, 350], [936, 420]],
        [[1046, 180], [1052, 230], [1115, 286], [1145, 360], [1120, 430]],
        [[1046, 180], [1052, 235], [1059, 290], [1077, 359], [1040, 450], [1040, 565], [1070, 640]],
      ];
      routes.forEach((route, j) => {
        const advancement = clamp01((p - j * .13) * 1.4), distance = advancement * (route.length - 1);
        this.fx.lineStyle(3, 0xc584b6, .6);
        this.fx.beginPath(); this.fx.moveTo(route[0][0], route[0][1]);
        for (let k = 1; k <= Math.floor(distance); k++) this.fx.lineTo(route[k][0], route[k][1]);
        const index = Math.min(route.length - 2, Math.floor(distance)), local = Math.min(1, distance - index);
        const x = Phaser.Math.Linear(route[index][0], route[index + 1][0], local), y = Phaser.Math.Linear(route[index][1], route[index + 1][1], local);
        this.fx.lineTo(x, y); this.fx.strokePath();
        if (advancement > .05) {
          this.fx.fillStyle(0x865b93, .16 + Math.sin(t * 4 + j) * .04); this.fx.fillCircle(x, y, 19 + j * 4);
          this.fx.lineStyle(1.5, 0xefbdcf, .5); this.fx.strokeCircle(x, y, 8 + fraction(t * .6 + j * .3) * 22);
        }
      });
      // Individual invading bodies travel from the throat into the vascular tree.
      for (let i = 0; i < 7; i++) {
        const q = clamp01((t - .4 - i * .22) / 3.8);
        this.sprite(i, VIRUS + 'walk', 1045 + Math.sin(q * 5 + i) * (q * 55), 180 + q * 430, 18 + q * 5, t + i, i % 2 === 0, smooth(q * 6));
      }
      this.fx.fillStyle(0xaadcc9, .6 + Math.sin(t * 3) * .2); this.fx.fillCircle(978, 384, 3); this.fx.fillCircle(1103, 420, 3);
    }
    private battle(id: 'lung' | 'heart', t: number, p: number) {
      const heart = id === 'heart', breakthrough = heart ? smooth((p - .32) / .68) : 0;
      const front = heart ? 865 - breakthrough * 330 : 835 + Math.sin(t * 1.2) * 14;
      // Infection grows as a connected, uneven membrane beneath advancing bodies.
      this.under.fillStyle(purple, .16 + (heart ? p * .16 : .02));
      this.under.beginPath(); this.under.moveTo(1620, 290);
      for (let y = 290; y <= 790; y += 22) this.under.lineTo(front + 95 + Math.sin(y * .022 + t * .7) * 45, y);
      this.under.lineTo(1620, 790); this.under.closePath(); this.under.fillPath();
      this.under.lineStyle(2, 0xc797bc, .3);
      for (let i = 0; i < 8; i++) {
        const y = 370 + i * 48;
        this.under.beginPath(); this.under.moveTo(1520, y + 20); this.under.lineTo(front + 180, y); this.under.lineTo(front + 80 + Math.sin(i * 3) * 32, y - 15); this.under.strokePath();
      }
      for (let i = 0; i < 14; i++) {
        const lane = i % 5, row = Math.floor(i / 5), age = t + i * .31, cycle = fraction(age * .68);
        const lunge = row === 0 ? Math.sin(clamp01((cycle - .12) / .55) * Math.PI) * 33 : 0;
        const initialAdvance = Math.max(0, 1 - t / 1.15) * (row === 0 ? 115 : 45);
        let x = front - 60 - row * 150 - initialAdvance + Math.sin(i * 8.3) * 21 + lunge;
        let y = 429 + lane * 50 + Math.sin(i * 5.1) * 17 + row * 9 + Math.sin(age * 2) * 3;
        let alpha = 1, fall = 0;
        if (heart && row === 0 && (lane === 1 || lane === 3)) {
          // Two broken positions open a visible gap. Their neighbours withdraw
          // while the next rank moves in to cover, rather than sliding as a block.
          const wounded = smooth((t - 1.7 - lane * .1) / 1.05);
          x -= wounded * 125; y += wounded * 28;
          fall = smooth((t - 2.3 - lane * .1) / .55);
          alpha = 1 - smooth((t - 2.9 - lane * .1) / .65);
        } else if (heart && row > 0) {
          const recoil = smooth((t - 2.1 - lane * .13) / 1.6);
          x -= recoil * (row === 1 ? 38 : 90);
          if (row === 1 && (lane === 1 || lane === 3)) x += smooth((t - 3.15 - lane * .05) / 1.05) * 145;
        }
        const attacking = row === 0 && cycle > .22 && cycle < .7 && fall < .1;
        this.under.fillStyle(0x102c2a, .18 * alpha); this.under.fillEllipse(x, y + 1, 76, 17);
        this.sprite(i, IMMUNE + (attacking ? 'bite' : 'crawl'), x, y, 62 + lane * 7, age, heart && row > 0 && t > 2.8, alpha);
        if (fall > 0) this.actors[i].setRotation(-fall * 1.05).setTint(0xafaeb6);
      }
      for (let i = 0; i < 22; i++) {
        const lane = i % 5, row = Math.floor(i / 5), age = t + i * .21, cycle = fraction(age * .62);
        const lunging = row === 0 && cycle > .3 && cycle < .7;
        const lunge = row === 0 ? Math.sin(clamp01((cycle - .3) / .4) * Math.PI) * 48 : 0;
        const incoming = row === 0 && !heart ? (1 - smooth(cycle / .25)) * 90 : 0;
        const hit = !heart && row === 0 && lane % 2 === 1 ? smooth((cycle - .76) / .24) : 0;
        const gapCharge = heart && row === 0 && (lane === 1 || lane === 3) ? breakthrough * 80 : 0;
        const x = front + 48 + row * 123 + Math.max(0, 1 - t / 1.1) * 120 + Math.sin(i * 7.7) * 23 - lunge + incoming + hit * 35 - gapCharge;
        const y = 427 + lane * 51 + Math.sin(i * 3.3) * 15 + row * 8 + Math.sin(age * 2) * 4;
        this.under.fillStyle(0x312339, .19 * (1 - hit)); this.under.fillEllipse(x, y + 3, 77, 17);
        this.sprite(14 + i, VIRUS + (lunging ? 'windup' : 'walk'), x, y, 56 + lane * 6, age, true, 1 - hit);
        if (hit > 0) this.actors[14 + i].setRotation(hit * .9);
        if (lunging) this.burst(x - 42, y - 14, (cycle - .3) / .4, 0xd7b1ce, 20);
      }
      // Visible volleys leave the immune line, strike the advance, then burst.
      for (let i = 0; i < 9; i++) {
        const q = fraction(t * 1.3 + i * .257), lane = i % 5, y = 407 + lane * 51;
        const origin = front - 210 + Math.sin(i * 2.2) * 30, x = Phaser.Math.Linear(origin, front + 35, q);
        this.fx.lineStyle(3, mint, .8); this.fx.lineBetween(x - 16, y + 5, x + 6, y);
        if (q > .8) this.burst(front + 35, y, (q - .8) / .2, mint, 34);
      }
      for (let i = 0; i < 5; i++) {
        const q = fraction(t * .9 + i * .271), x = front + Math.sin(i * 8.2) * 55, y = 425 + i * 48;
        if (q < .42) this.burst(x, y, q / .42, i % 2 ? mint : gold, heart ? 52 : 37);
      }
      if (heart && p > .42) {
        const q = smooth((p - .42) / .2);
        this.fx.lineStyle(4, 0xf3d4b6, (1 - q) * .75); this.fx.strokeEllipse(660, 515, 120 + q * 220, 180 + q * 180);
      }
      if (!options.lowEffects) {
        const pulse = Math.pow(Math.max(0, Math.sin(t * 8)), 18) * (heart ? 3 : 1);
        this.root.x += pulse;
      }
    }
    private orders(t: number, p: number) {
      this.under.fillStyle(0x0c2425, .38); this.under.fillRect(0, 0, 1600, 900);
      const alpha = smooth(t / .8);
      this.sideTitle.setPosition(160, 300).setText('先遣小队\n即刻出发').setVisible(true).setAlpha(alpha);
      this.sideDetail.setPosition(166, 510).setText('驻防区域 / 缓流膜湾\n建立前哨 · 清除周边感染').setVisible(true).setAlpha(smooth((t - .5) / 1));
      for (let i = 0; i < 6; i++) {
        const x = 900 + (i % 3 - 1) * 130, y = 470 + Math.floor(i / 3) * 100;
        this.under.fillStyle(0x10352d, .3); this.under.fillEllipse(x, y, 120, 24);
        this.sprite(i + 1, IMMUNE + 'crawl', x, y, 84 + i * 3, t + i * .37, false, alpha);
      }
      this.under.lineStyle(2, mint, .22 + Math.sin(t * 2) * .06); this.under.strokeEllipse(1030, 642, 310 + p * 30, 85);
      this.under.fillStyle(0x173e34, .38); this.under.fillEllipse(1030, 647, 180, 32);
      this.sprite(0, HERO + 'idle', 1040, 640, 245, t, false, alpha);
      this.renderHero(1040, 640, 245, false, .9, alpha);
      for (let i = 0; i < 4; i++) { const q = fraction(t * .35 + i * .25); this.fx.lineStyle(1, mint, .35 * (1 - q)); this.fx.strokeEllipse(1040, 638, 110 + q * 380, 35 + q * 110); }
    }
    private transit(t: number, p: number, arrival: boolean) {
      const x = arrival ? 1000 + p * 70 : 480 + smooth(p) * 540;
      const y = arrival ? 530 + p * 20 : 535 - Math.sin(p * Math.PI) * 60;
      if (!arrival) {
        // Peripheral blood cells sweep past at a different depth from the squad.
        for (let i = 0; i < 11; i++) {
          const q = fraction(t * .21 + i * .187), cx = 1800 - q * 2000, cy = 230 + fraction(i * .618) * 420;
          this.under.fillStyle(i % 2 ? 0xc88282 : 0xe0b89c, .12 + (i % 3) * .03);
          this.under.fillEllipse(cx, cy, 65 + (i % 4) * 23, 26 + (i % 4) * 12);
          this.under.lineStyle(1, 0xf6d2b7, .12); this.under.strokeEllipse(cx, cy, 38 + (i % 4) * 12, 15 + (i % 4) * 6);
        }
      }
      this.under.fillStyle(0xe9f7df, .09); this.under.fillEllipse(x - 50, y - 30, 430, 150);
      for (let i = 0; i < 6; i++) this.sprite(i + 1, IMMUNE + 'crawl', x - 125 - Math.floor(i / 2) * 90, y + (i % 2 ? 30 : -36), 64 - Math.floor(i / 2) * 6, t + i * .29, false, 1 - (arrival ? smooth((t - 1) / 2) : 0));
      this.sprite(0, HERO + (arrival ? 'idle' : 'walk'), x, y, arrival ? 135 - p * 40 : 145, t, false, 1 - (arrival ? smooth((t - 1) / 2) : 0));
      this.renderHero(x, y, arrival ? 135 - p * 40 : 145, !arrival, arrival ? .9 : 0, 1 - (arrival ? smooth((t - 1) / 2) : 0));
      if (!arrival) {
        for (let i = 0; i < (options.lowEffects ? 7 : 19); i++) {
          const q = fraction(t * .43 + i * .19), yy = 150 + fraction(i * .618) * 550, xx = 1800 - q * 2000;
          this.fx.lineStyle(1.5, 0xf3edc8, .15); this.fx.lineBetween(xx, yy, xx - 35 - p * 50, yy + 4);
        }
      } else {
        this.fx.lineStyle(2, mint, .3 * (1 - p)); this.fx.strokeEllipse(1030, 560, 220 + p * 400, 70 + p * 130);
      }
    }
    private burst(x: number, y: number, progress: number, color: number, radius: number) {
      const q = clamp01(progress), alpha = (1 - q) * .85;
      this.fx.lineStyle(2.5 * (1 - q) + .5, color, alpha); this.fx.strokeCircle(x, y, 4 + q * radius);
      this.fx.fillStyle(color, alpha * .28); this.fx.fillCircle(x, y, 7 + q * radius * .45);
      for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + x * .01, inner = q * radius * .7, outer = inner + (1 - q) * 15;
        this.fx.lineStyle(2, color, alpha); this.fx.lineBetween(x + Math.cos(a) * inner, y + Math.sin(a) * inner, x + Math.cos(a) * outer, y + Math.sin(a) * outer); }
    }
    private renderHero(x: number, y: number, height: number, moving: boolean, facing: number, alpha: number) {
      if (!hero3D.available || alpha <= 0) return;
      const state = prologueHeroSnapshot(seconds, isPaused(), moving, facing);
      hero3D.observe(state);
      const frame = hero3D.render(state, { height, facing });
      if (!frame) return;
      const ctx = this.heroBuffer.getContext('2d')!;
      ctx.clearRect(0, 0, 512, 512); ctx.drawImage(frame.canvas, 0, 0, 512, 512); this.heroTexture.refresh();
      this.heroImage.setVisible(true).setPosition(x, y).setDisplaySize(frame.width, frame.height)
        .setOrigin(frame.foot.x / frame.width, frame.foot.y / frame.height).setAlpha(alpha);
      this.actors[0].setVisible(false); overlay.dataset.hero3d = 'active';
    }
  }
  try {
    game = new Phaser.Game({ type: Phaser.AUTO, parent: stage, backgroundColor: '#0b171c', width: Math.max(1, innerWidth), height: Math.max(1, innerHeight),
      banner: false, audio: { noAudio: true }, input: { keyboard: false, mouse: false, touch: false, gamepad: false },
      render: { antialias: true, roundPixels: false }, scale: { mode: Phaser.Scale.RESIZE }, scene: PrologueScene,
      fps: { target: 60, forceSetTimeOut: false }, callbacks: { postBoot: engine => { engine.canvas.setAttribute('aria-hidden', 'true'); } } });
  } catch {
    // Even a failed graphics context leaves a usable skip control and the original game intact.
    overlay.dataset.ready = 'true'; location.textContent = '序章影像暂时不可用'; title.textContent = '先遣小队，准备出发';
    subtitle.textContent = '前往缓流膜湾，建立前哨，清除周边感染。点击跳过序章继续。';
  }
  return { get active() { return active; }, get paused() { return isPaused(); }, setPaused(paused) { if (externalPaused !== paused) { externalPaused = paused; pauseState(); } }, destroy };
}
