import { PROLOGUE_MEDIA } from '../render/prologueMedia';
import { DURATION, shotAt, smooth } from '../render/worldPrologueTimeline';
import './worldPrologue.css';
import { playWorldPrologue as playPreviousOpening } from './worldPrologueLegacy';

export const WORLD_PROLOGUE_STORAGE_KEY = PROLOGUE_MEDIA.ready ? 'vi-world-prologue-v3' : 'vi-world-prologue-v1';

export interface WorldPrologueOptions {
  onComplete: (reason: 'finished' | 'skipped') => void;
  soundEnabled: boolean;
  lowEffects: boolean;
  onToggleSound?: () => boolean;
  onArrival?: () => void;
}
export interface WorldPrologueHandle {
  readonly active: boolean;
  readonly paused: boolean;
  setPaused(paused: boolean): void;
  destroy(): void;
}

/** Blender owns the film. The browser owns decoding, audio and the handover. */
export function playWorldPrologue(options: WorldPrologueOptions): WorldPrologueHandle {
  if (!PROLOGUE_MEDIA.ready) return playPreviousOpening(options);
  const overlay = document.createElement('section');
  overlay.id = 'world-prologue'; overlay.className = 'world-prologue';
  Object.assign(overlay.dataset, { worldPrologue: 'active', elapsed: '0', shot: 'body', paused: 'false', ready: 'false', loadErrors: '0', media: 'video', decodedFrames: '0' });
  overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', '病毒入侵 · 世界序章');
  overlay.innerHTML = `<div class="world-prologue-stage" aria-hidden="true"><video playsinline preload="auto" disablepictureinpicture disableremoteplayback></video></div>
    <div class="world-prologue-vignette"></div>
    <header class="world-prologue-header"><div class="world-prologue-brand"><strong>病毒入侵</strong><span>序章 · 体内防线</span></div>
    <nav class="world-prologue-controls" aria-label="序章播放控制"><button type="button" data-prologue-action="sound"></button><button type="button" data-prologue-action="pause" aria-keyshortcuts="P">暂停</button><button type="button" data-prologue-action="skip" aria-keyshortcuts="Escape">跳过序章 ›</button></nav></header>
    <div class="world-prologue-pause-status" hidden></div>
    <div class="world-prologue-caption" aria-live="polite" aria-atomic="true"><p class="world-prologue-location"></p><h2 class="world-prologue-title"></h2><p class="world-prologue-subtitle"></p></div>
    <div class="world-prologue-progress" role="progressbar" aria-label="序章播放进度" aria-valuemin="0" aria-valuemax="33" aria-valuenow="0"><span></span></div>`;
  document.body.append(overlay); document.body.classList.add('world-prologue-playing');
  const video = overlay.querySelector('video')!;
  const stage = overlay.querySelector<HTMLElement>('.world-prologue-stage')!;
  const vignette = overlay.querySelector<HTMLElement>('.world-prologue-vignette')!;
  const caption = overlay.querySelector<HTMLElement>('.world-prologue-caption')!;
  const location = overlay.querySelector<HTMLElement>('.world-prologue-location')!;
  const title = overlay.querySelector<HTMLElement>('.world-prologue-title')!;
  const subtitle = overlay.querySelector<HTMLElement>('.world-prologue-subtitle')!;
  const pauseStatus = overlay.querySelector<HTMLElement>('.world-prologue-pause-status')!;
  const progress = overlay.querySelector<HTMLElement>('[role="progressbar"]')!;
  const soundButton = overlay.querySelector<HTMLButtonElement>('[data-prologue-action="sound"]')!;
  const pauseButton = overlay.querySelector<HTMLButtonElement>('[data-prologue-action="pause"]')!;
  const skipButton = overlay.querySelector<HTMLButtonElement>('[data-prologue-action="skip"]')!;
  let active = true, userPaused = false, externalPaused = false, hiddenPaused = document.hidden, blurredPaused = false;
  let sound = options.soundEnabled, failed = false, arrived = false, currentShot = '', frame = 0, playPending = false;
  const isPaused = () => userPaused || externalPaused || hiddenPaused || blurredPaused || failed;

  const soundState = () => {
    video.muted = !sound; soundButton.textContent = sound ? '声音 开' : '声音 关';
    soundButton.setAttribute('aria-pressed', String(sound));
    soundButton.setAttribute('aria-label', sound ? '关闭序章声音' : '开启序章声音');
  };
  const play = () => {
    if (!active || isPaused() || playPending || !video.paused) return;
    playPending = true;
    void video.play().catch(error => {
      if (!active || isPaused() || error?.name === 'AbortError') return;
      userPaused = true; pauseState();
    }).finally(() => {
      playPending = false;
      // A pause during loading may abort an earlier play promise after a resume.
      if (active && !isPaused() && video.paused && !video.ended) play();
    });
  };
  const pauseState = () => {
    const paused = isPaused(); overlay.dataset.paused = String(paused);
    pauseButton.textContent = userPaused ? '继续' : '暂停'; pauseButton.setAttribute('aria-pressed', String(userPaused));
    pauseStatus.hidden = !paused;
    pauseStatus.innerHTML = failed ? '序章影像未能播放<small>点击跳过序章，继续进入游戏</small>'
      : externalPaused ? '请横屏观看<small>转回横屏后继续</small>'
      : hiddenPaused || blurredPaused ? '演出已暂停<small>返回窗口后继续</small>' : '演出已暂停<small>点击继续，或按 P</small>';
    if (paused) video.pause(); else play();
  };
  const paint = () => {
    if (!active) return;
    const time = Math.max(0, Math.min(DURATION, video.currentTime || 0)), shot = shotAt(time);
    overlay.dataset.elapsed = time.toFixed(2); overlay.dataset.shot = shot.id;
    overlay.dataset.videoWidth = String(video.videoWidth); overlay.dataset.videoHeight = String(video.videoHeight);
    overlay.dataset.videoReadyState = String(video.readyState);
    overlay.dataset.decodedFrames = String(video.getVideoPlaybackQuality?.().totalVideoFrames ?? 0);
    overlay.style.setProperty('--prologue-progress', `${time / DURATION * 100}%`); progress.setAttribute('aria-valuenow', time.toFixed(1));
    if (currentShot !== shot.id) {
      currentShot = shot.id; location.textContent = shot.location; title.textContent = shot.title; subtitle.textContent = shot.subtitle;
    }
    if (time >= 29 && !arrived) { arrived = true; options.onArrival?.(); }
    const dissolve = options.onArrival && shot.id === 'arrival' ? smooth((shot.local - 1.2) / 2.8) : 0;
    overlay.style.backgroundColor = dissolve > 0 ? 'transparent' : '#172a27';
    stage.style.opacity = String(1 - dissolve); vignette.style.opacity = String(1 - dissolve);
    caption.style.opacity = String(shot.id === 'arrival' ? 1 - smooth((shot.local - 2.8) / 1.1) : smooth(shot.local / .35));
    frame = requestAnimationFrame(paint);
  };
  const destroy = () => {
    if (!active) return;
    active = false; cancelAnimationFrame(frame);
    window.removeEventListener('keydown', keydown, true); window.removeEventListener('keyup', keyup, true);
    window.removeEventListener('blur', blur); window.removeEventListener('focus', focus);
    document.removeEventListener('visibilitychange', visibility);
    video.pause(); video.removeAttribute('src'); video.load();
    overlay.remove(); document.body.classList.remove('world-prologue-playing');
  };
  const finish = (reason: 'finished' | 'skipped') => {
    if (!active) return;
    if (reason === 'finished' && !arrived) { arrived = true; options.onArrival?.(); }
    destroy(); options.onComplete(reason);
  };
  const keydown = (event: KeyboardEvent) => {
    if (!active) return;
    if (event.key === 'Tab') {
      const controls = [soundButton, pauseButton, skipButton], index = controls.indexOf(document.activeElement as HTMLButtonElement);
      controls[index < 0 ? event.shiftKey ? 2 : 0 : (index + (event.shiftKey ? 2 : 1)) % controls.length].focus();
    } else if (event.key === 'Escape' && !event.repeat) finish('skipped');
    else if (event.code === 'KeyP' && !event.repeat) { userPaused = !userPaused; pauseState(); }
    else if ((event.key === 'Enter' || event.key === ' ') && !event.repeat && document.activeElement instanceof HTMLButtonElement && overlay.contains(document.activeElement)) document.activeElement.click();
    if (!event.ctrlKey && !event.metaKey && !event.altKey) event.preventDefault();
    event.stopImmediatePropagation();
  };
  const keyup = (event: KeyboardEvent) => { if (active) { event.stopImmediatePropagation(); if (!event.ctrlKey && !event.metaKey && !event.altKey) event.preventDefault(); } };
  const blur = () => { blurredPaused = true; pauseState(); };
  const focus = () => { blurredPaused = false; hiddenPaused = document.hidden; pauseState(); };
  const visibility = () => { hiddenPaused = document.hidden; pauseState(); };
  window.addEventListener('keydown', keydown, true); window.addEventListener('keyup', keyup, true);
  window.addEventListener('blur', blur); window.addEventListener('focus', focus); document.addEventListener('visibilitychange', visibility);
  overlay.addEventListener('pointerdown', event => event.stopPropagation()); overlay.addEventListener('pointerup', event => event.stopPropagation());
  overlay.addEventListener('click', event => {
    event.stopPropagation();
    const action = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-prologue-action]')?.dataset.prologueAction;
    if (action === 'skip') finish('skipped');
    if (action === 'pause') { userPaused = !userPaused; pauseState(); }
    if (action === 'sound') { sound = options.onToggleSound?.() ?? !sound; soundState(); }
  });
  video.onloadeddata = () => { if (active) { overlay.dataset.ready = 'true'; pauseState(); } };
  video.onended = () => finish('finished');
  video.onerror = () => {
    if (!active) return;
    failed = true; overlay.dataset.ready = 'true'; overlay.dataset.loadErrors = '1'; pauseState();
  };
  video.poster = PROLOGUE_MEDIA.poster; video.src = PROLOGUE_MEDIA.movie;
  soundState(); pauseState(); frame = requestAnimationFrame(paint); skipButton.focus({ preventScroll: true });
  return { get active() { return active; }, get paused() { return isPaused(); }, setPaused(paused) { if (externalPaused !== paused) { externalPaused = paused; pauseState(); } }, destroy };
}
