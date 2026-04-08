import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ContractError, ensures, invariant, requires } from "../src/contracts";

describe("contracts", () => {
  describe("requires", () => {
    it("does nothing when the condition is true", () => {
      expect(() => requires(true, "must hold")).not.toThrow();
    });

    it("throws ContractError with kind 'precondition' when false", () => {
      try {
        requires(false, "x must be positive");
        throw new Error("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ContractError);
        const ce = err as ContractError;
        expect(ce.kind).toBe("precondition");
        expect(ce.message).toBe("Precondition failed: x must be positive");
      }
    });

    it("treats null/undefined/0/'' as false", () => {
      expect(() => requires(null, "n")).toThrow(ContractError);
      expect(() => requires(undefined, "u")).toThrow(ContractError);
      expect(() => requires(0, "z")).toThrow(ContractError);
      expect(() => requires("", "e")).toThrow(ContractError);
    });

    it("acts as a TS type narrower", () => {
      const x: number | null = 5;
      requires(x !== null, "x must not be null");
      // After this line, TS narrows `x` to `number`. The runtime check above
      // would also throw if x were null, so this is safe.
      const doubled: number = x * 2;
      expect(doubled).toBe(10);
    });
  });

  describe("ensures", () => {
    it("does nothing when the condition is true", () => {
      expect(() => ensures(true, "ok")).not.toThrow();
    });

    it("throws with kind 'postcondition' when false", () => {
      try {
        ensures(false, "result must be > 0");
      } catch (err) {
        expect(err).toBeInstanceOf(ContractError);
        const ce = err as ContractError;
        expect(ce.kind).toBe("postcondition");
        expect(ce.message).toBe("Postcondition failed: result must be > 0");
      }
    });
  });

  describe("invariant", () => {
    it("does nothing when the condition is true", () => {
      expect(() => invariant(true, "ok")).not.toThrow();
    });

    it("throws with kind 'invariant' when false", () => {
      try {
        invariant(false, "size must equal capacity");
      } catch (err) {
        expect(err).toBeInstanceOf(ContractError);
        const ce = err as ContractError;
        expect(ce.kind).toBe("invariant");
        expect(ce.message).toBe("Invariant violated: size must equal capacity");
      }
    });
  });

  describe("ContractError", () => {
    it("preserves the contract kind on the instance", () => {
      const err = new ContractError("test", "precondition");
      expect(err.kind).toBe("precondition");
      expect(err.name).toBe("ContractError");
      expect(err).toBeInstanceOf(Error);
    });
  });

  // ----------------------------------------------------------------------------
  // Property-based tests
  // ----------------------------------------------------------------------------
  describe("properties", () => {
    it("property: requires is total over booleans (true → no throw, false → ContractError 'precondition')", () => {
      fc.assert(
        fc.property(fc.boolean(), fc.string(), (cond, msg) => {
          if (cond) {
            expect(() => requires(cond, msg)).not.toThrow();
          } else {
            try {
              requires(cond, msg);
              throw new Error("requires should have thrown");
            } catch (err) {
              expect(err).toBeInstanceOf(ContractError);
              expect((err as ContractError).kind).toBe("precondition");
            }
          }
        }),
        { numRuns: 100 },
      );
    });

    it("property: ensures is total over booleans (true → no throw, false → ContractError 'postcondition')", () => {
      fc.assert(
        fc.property(fc.boolean(), fc.string(), (cond, msg) => {
          if (cond) {
            expect(() => ensures(cond, msg)).not.toThrow();
          } else {
            try {
              ensures(cond, msg);
              throw new Error("ensures should have thrown");
            } catch (err) {
              expect(err).toBeInstanceOf(ContractError);
              expect((err as ContractError).kind).toBe("postcondition");
            }
          }
        }),
        { numRuns: 100 },
      );
    });

    it("property: invariant is total over booleans (true → no throw, false → ContractError 'invariant')", () => {
      fc.assert(
        fc.property(fc.boolean(), fc.string(), (cond, msg) => {
          if (cond) {
            expect(() => invariant(cond, msg)).not.toThrow();
          } else {
            try {
              invariant(cond, msg);
              throw new Error("invariant should have thrown");
            } catch (err) {
              expect(err).toBeInstanceOf(ContractError);
              expect((err as ContractError).kind).toBe("invariant");
            }
          }
        }),
        { numRuns: 100 },
      );
    });
  });
});
