type Listener<T> = (payload: T) => void;

/** Typed subscriptions; removals during dispatch affect subsequent dispatches. */
export class EventBus<Events extends object> {
  private listeners = new Map<keyof Events, Set<Listener<never>>>();

  on<K extends keyof Events>(type: K, listener: Listener<Events[K]>): () => void {
    let group = this.listeners.get(type);
    if (!group) this.listeners.set(type, group = new Set());
    group.add(listener as Listener<never>);
    return () => {
      group?.delete(listener as Listener<never>);
      if (group?.size === 0) this.listeners.delete(type);
    };
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const group = this.listeners.get(type);
    if (!group) return;
    for (const listener of [...group]) (listener as Listener<Events[K]>)(payload);
  }

  clear(): void {
    this.listeners.clear();
  }
}
