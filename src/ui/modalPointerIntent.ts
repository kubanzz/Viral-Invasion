/** A click on a newly appeared dialog must originate on that exact button. */
export class ModalPointerIntent {
  private readonly presses = new Map<number, { target: EventTarget | null; pointerType: string }>();
  private readonly completed = new Map<number, { target: EventTarget; pointerType: string }>();
  private latestCompletedPointerId: number | undefined;

  pointerDown(pointerId: number, target: EventTarget | null, pointerType = ''): void {
    this.presses.set(pointerId, { target, pointerType });
    this.completed.delete(pointerId);
    // Stale touch contacts cannot retain an unbounded DOM history.
    if (this.presses.size > 16) this.presses.delete(this.presses.keys().next().value!);
  }
  pointerUp(pointerId: number, target: EventTarget | null): void {
    const pressed = this.presses.get(pointerId);
    this.presses.delete(pointerId); this.completed.delete(pointerId);
    this.latestCompletedPointerId = pointerId;
    if (target && pressed?.target === target) this.completed.set(pointerId, { target, pointerType: pressed.pointerType });
    if (this.completed.size > 16) this.completed.delete(this.completed.keys().next().value!);
  }
  pointerCancel(pointerId: number): void {
    this.presses.delete(pointerId); this.completed.delete(pointerId);
    if (this.latestCompletedPointerId === pointerId) this.latestCompletedPointerId = undefined;
  }

  acceptsClick(event: { detail: number; pointerId?: number; pointerType?: string }, button: EventTarget, inModal: boolean): boolean {
    if (!inModal || event.detail === 0) return true;
    const pointerId = event.pointerId !== undefined && event.pointerId >= 0 ? event.pointerId : undefined;
    // WebKit can expose touch down/up as pointer 0 and its compatibility click
    // as mouse pointer 1. Alias only a completed same-element contact: another
    // finger merely holding a new modal button cannot authorize an old release.
    let matchedId = pointerId !== undefined && this.completed.get(pointerId)?.target === button ? pointerId : undefined;
    const latestId = this.latestCompletedPointerId, latest = latestId === undefined ? undefined : this.completed.get(latestId);
    const compatibilityAlias = pointerId === undefined || pointerId === 0
      || event.pointerType === 'mouse' && latest?.pointerType === 'touch';
    if (matchedId === undefined && compatibilityAlias && latest?.target === button) matchedId = latestId;
    if (matchedId !== undefined) {
      this.completed.delete(matchedId);
      if (this.latestCompletedPointerId === matchedId) this.latestCompletedPointerId = undefined;
      return true;
    }
    if (pointerId !== undefined) this.completed.delete(pointerId);
    return false;
  }
}
