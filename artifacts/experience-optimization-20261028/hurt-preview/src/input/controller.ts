import type { InputFrame, Tool, Vec } from '../game/types';
export const BINDINGS = [
  ['W A S D', '八向移动'], ['鼠标 / 左键', '瞄准 / 使用工具'], ['Space', '冲刺 · 1.5秒冷却'],
  ['Q', '扫描 · 3秒冷却'], ['1', '精确净化'], ['2', '牵引裂解'], ['3', '组织修复'], ['E', '靠近终端复测'], ['Esc', '暂停 / 继续'],
];
export class Controller {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private fire = false;
  private firePressed = false;
  private practiceHit = false;
  private tool: Tool | undefined;
  pointer: Vec = { x: innerWidth / 2, y: innerHeight / 2 };
  constructor(canvas: HTMLCanvasElement, onPause: () => void, onBlur: () => void, acceptsGameInput: () => boolean = () => true) {
    window.addEventListener('keydown', e => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target instanceof HTMLElement && e.target.isContentEditable)) return;
      if (e.code === 'Escape') { if (!e.repeat) onPause(); return; }
      if (!acceptsGameInput() || e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.code === 'Space') e.preventDefault();
      if (e.repeat) return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (/^Digit[123]$/.test(e.code)) this.tool = Number(e.code.at(-1)) as Tool;
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    const updatePointer = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); this.pointer = { x: e.clientX - r.left, y: e.clientY - r.top }; };
    canvas.addEventListener('pointermove', updatePointer);
    canvas.addEventListener('pointerdown', e => { updatePointer(e); if (e.button === 0 && acceptsGameInput()) { this.fire = true; this.firePressed = true; canvas.setPointerCapture(e.pointerId); } });
    window.addEventListener('pointerup', () => { this.fire = false; });
    canvas.addEventListener('pointercancel', () => this.clear());
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('blur', () => { this.clear(); onBlur(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.clear(); onBlur(); } });
  }
  select(tool: Tool) { this.tool = tool; }
  queuePracticeHit() { this.practiceHit = true; }
  clear() { this.keys.clear(); this.pressed.clear(); this.fire = false; this.firePressed = false; this.practiceHit = false; this.tool = undefined; }
  frame(aim: Vec): InputFrame {
    const frame = { moveX: Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA')), moveY: Number(this.keys.has('KeyS')) - Number(this.keys.has('KeyW')), aim, fire: this.fire || this.firePressed, tool: this.tool, dash: this.pressed.has('Space'), scan: this.pressed.has('KeyQ'), interact: this.pressed.has('KeyE'), practiceHit: this.practiceHit };
    this.pressed.clear(); this.tool = undefined; this.firePressed = false; this.practiceHit = false; return frame;
  }
}
