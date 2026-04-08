import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

/**
 * Minimal hand-rolled fake of the Web Audio API surface that our app touches.
 * Lives in the test setup so every test gets it for free. We deliberately
 * avoid `standardized-audio-context-mock` — it's heavy and its bugs become
 * ours.
 */

interface FakeAudioParam {
  value: number;
  setValueAtTime(value: number, time: number): FakeAudioParam;
  linearRampToValueAtTime(value: number, time: number): FakeAudioParam;
  exponentialRampToValueAtTime(value: number, time: number): FakeAudioParam;
}

const makeAudioParam = (initial = 0): FakeAudioParam => {
  const param: FakeAudioParam = {
    value: initial,
    setValueAtTime(v) {
      param.value = v;
      return param;
    },
    linearRampToValueAtTime(v) {
      param.value = v;
      return param;
    },
    exponentialRampToValueAtTime(v) {
      param.value = v;
      return param;
    },
  };
  return param;
};

class FakeAudioNode {
  connect(target: FakeAudioNode | object): FakeAudioNode | object {
    return target;
  }
  disconnect(): void {}
}

class FakeOscillator extends FakeAudioNode {
  type: OscillatorType = "sine";
  frequency = makeAudioParam(440);
  start = vi.fn();
  stop = vi.fn();
}

class FakeGain extends FakeAudioNode {
  gain = makeAudioParam(1);
}

class FakeAudioContext {
  currentTime = 0;
  state: AudioContextState = "running";
  destination = new FakeAudioNode();
  resume = vi.fn(async () => {
    this.state = "running";
  });
  close = vi.fn(async () => {
    this.state = "closed";
  });
  createOscillator(): FakeOscillator {
    return new FakeOscillator();
  }
  createGain(): FakeGain {
    return new FakeGain();
  }
}

// biome-ignore lint/suspicious/noExplicitAny: test stub
(globalThis as any).AudioContext = FakeAudioContext;
