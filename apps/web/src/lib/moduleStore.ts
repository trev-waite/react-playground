/** A small bridge between Vite module updates and React subscriptions. */
export function moduleStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => value,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    update(next: T) {
      value = next;
      for (const listener of listeners) listener();
    },
  };
}
