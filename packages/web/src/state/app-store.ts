import {
  ensures,
  initialState,
  reduce,
  requires,
  type TempoAction,
  type TempoState,
} from "@click/core";
import { createSignal } from "solid-js";
import { loadPersisted, type Persisted, savePersisted } from "./persistence";

/**
 * Solid signal-based store wrapping the pure core reducer. We deliberately use
 * `createSignal<TempoState>` rather than `createStore` so that the entire state
 * is replaced atomically on each dispatch — this matches the immutable reducer
 * semantics of `@click/core` and keeps reasoning trivially simple.
 *
 * Persistence is opt-in: call `enablePersistence()` once at app boot.
 */
export interface AppStore {
  readonly state: () => TempoState;
  readonly dispatch: (action: TempoAction) => void;
  readonly enablePersistence: () => void;
}

export function createAppStore(): AppStore {
  const persisted = loadPersisted();
  const seed = mergePersisted(initialState(), persisted);
  const [state, setState] = createSignal<TempoState>(seed);
  let persistenceEnabled = false;

  const dispatch = (action: TempoAction): void => {
    requires(
      action !== null && typeof action === "object" && typeof action.type === "string",
      "AppStore.dispatch: action must be a non-null object with a string `type`",
    );
    const next = reduce(state(), action);
    setState(next);
    if (persistenceEnabled) savePersisted(next);
  };

  const enablePersistence = (): void => {
    persistenceEnabled = true;
  };

  const store: AppStore = { state, dispatch, enablePersistence };
  ensures(
    typeof store.state === "function" &&
      typeof store.dispatch === "function" &&
      typeof store.enablePersistence === "function",
    "createAppStore: returned store must expose state/dispatch/enablePersistence functions",
  );
  return store;
}

const mergePersisted = (base: TempoState, persisted: Partial<Persisted> | null): TempoState =>
  persisted ? Object.freeze({ ...base, ...persisted }) : base;
