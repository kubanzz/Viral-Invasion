export const DURATION = 33;
export type PrologueShotId = 'body' | 'lung' | 'heart' | 'orders' | 'transit' | 'arrival';
export interface PrologueShot {
  id: PrologueShotId;
  start: number;
  end: number;
  location: string;
  title: string;
  subtitle: string;
}
export const PROLOGUE_SHOTS: readonly PrologueShot[] = [
  { id: 'body', start: 0, end: 6, location: '宿主体内 · 全域', title: '一场看不见的战争', subtitle: '病毒沿血流扩散。身体的每一道防线，都在告急。' },
  { id: 'lung', start: 6, end: 11, location: '肺部 · 呼吸前线', title: '免疫军仍在抵抗', subtitle: '从肺泡到心脉，免疫军正在守住最后的通路。' },
  { id: 'heart', start: 11, end: 16, location: '心脉 · 防线突破', title: '感染正在推进', subtitle: '新的感染源撕开防线。我们需要一支深入组织的先遣队。' },
  { id: 'orders', start: 16, end: 21, location: '先遣小队 · 驻防指令', title: '现在，轮到你了', subtitle: '前往缓流膜湾，建立前哨，清除周边感染。' },
  { id: 'transit', start: 21, end: 29, location: '血流通道 · 前往缓流膜湾', title: '向微观前线进发', subtitle: '随血流进入组织深处。小队将与你一同驻扎。' },
  { id: 'arrival', start: 29, end: DURATION, location: '缓流膜湾 · 小队抵达', title: '在这里，点亮第一座前哨', subtitle: '带领小队前往锚定点，建立营地，准备第一次清剿。' },
];
export const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
export const smooth = (value: number): number => { const t = clamp01(value); return t * t * (3 - 2 * t); };
/** A presentation-only clock. It never reads or mutates campaign or camp state. */
export function shotAt(seconds: number): PrologueShot & { local: number; progress: number; index: number } {
  const time = Math.max(0, Math.min(DURATION, Number.isFinite(seconds) ? seconds : 0));
  const index = Math.max(0, PROLOGUE_SHOTS.findIndex(shot => time >= shot.start && time < shot.end));
  const resolved = time >= DURATION ? PROLOGUE_SHOTS.length - 1 : index;
  const shot = PROLOGUE_SHOTS[resolved];
  return { ...shot, index: resolved, local: time - shot.start, progress: clamp01((time - shot.start) / (shot.end - shot.start)) };
}
