interface ActionData { action?: string; station?: string; plot?: string }
interface ClickOrigin {
  isTrusted: boolean; detail: number; pointerType?: string;
  sourceCapabilities?: { firesTouchEvents?: boolean } | null;
}
const actionKey = (data: ActionData): string => JSON.stringify([data.action ?? '', data.station ?? '', data.plot ?? '']);

/** Pointer-down activation owns one semantic action even if its button is rebuilt
 * before the browser delivers that touch's compatibility click. */
export class TouchActivationGuard {
  private key?: string;
  private at = -Infinity;
  handled(data: ActionData, now: number): void { this.key = actionKey(data); this.at = now; }
  rejectsClick(event: ClickOrigin, data: ActionData, now: number): boolean {
    if (!event.isTrusted || event.detail === 0 || now < this.at || now - this.at >= 800 || this.key !== actionKey(data)) return false;
    return event.pointerType !== 'mouse' || event.sourceCapabilities?.firesTouchEvents === true;
  }
  clear(): void { this.key = undefined; this.at = -Infinity; }
}
