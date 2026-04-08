/**
 * Lightweight Design-by-Contract helpers.
 *
 * - `requires(cond, msg)` — precondition: caller must satisfy this before
 *   invoking the function. Use at the top of public functions.
 * - `ensures(cond, msg)` — postcondition: the function guarantees this on
 *   normal return. Use just before returning.
 * - `invariant(cond, msg)` — class or module invariant: must hold across
 *   any externally observable state transition.
 *
 * All three throw `ContractError` (a subclass of `Error`) with a clear
 * `kind` discriminator so test code can assert which contract failed.
 *
 * The helpers use TypeScript `asserts` predicates so callers benefit from
 * static type narrowing in addition to runtime checking.
 */

export type ContractKind = "precondition" | "postcondition" | "invariant";

export class ContractError extends Error {
  readonly kind: ContractKind;
  constructor(message: string, kind: ContractKind) {
    super(message);
    this.name = "ContractError";
    this.kind = kind;
  }
}

export function requires(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ContractError(`Precondition failed: ${message}`, "precondition");
}

export function ensures(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ContractError(`Postcondition failed: ${message}`, "postcondition");
}

export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ContractError(`Invariant violated: ${message}`, "invariant");
}
