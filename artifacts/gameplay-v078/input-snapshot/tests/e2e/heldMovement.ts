import type { Page } from '@playwright/test';

/** Real key holds persist while the host reads/aims; travel clears game input. */
export class HeldMovement {
  private readonly held = new Set<string>();
  private organ = '';
  constructor(private readonly page: Page) {}

  async syncOrgan(organ: string): Promise<void> {
    if (this.organ !== organ) { await this.release(); this.organ = organ; }
  }

  async move(x: number, y: number): Promise<void> {
    const length = Math.hypot(x, y) || 1;
    const keys = [Math.abs(x / length) > .383 ? x > 0 ? 'KeyD' : 'KeyA' : '',
      Math.abs(y / length) > .383 ? y > 0 ? 'KeyS' : 'KeyW' : ''].filter(Boolean);
    for (const key of this.held) if (!keys.includes(key)) {
      await this.page.keyboard.up(key); this.held.delete(key);
    }
    for (const key of keys) if (!this.held.has(key)) {
      await this.page.keyboard.down(key); this.held.add(key);
    }
  }

  async release(): Promise<void> {
    for (const key of this.held) await this.page.keyboard.up(key);
    this.held.clear();
  }
}
