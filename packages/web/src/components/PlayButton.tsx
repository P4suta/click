import type { Component } from "solid-js";

interface PlayButtonProps {
  readonly isPlaying: boolean;
  readonly pulsing: boolean;
  readonly onToggle: () => void;
}

export const PlayButton: Component<PlayButtonProps> = (props) => (
  <button
    type="button"
    classList={{ "play-button": true, "play-button--pulsing": props.pulsing }}
    aria-label={props.isPlaying ? "Stop" : "Play"}
    aria-pressed={props.isPlaying}
    onClick={props.onToggle}
  >
    {props.isPlaying ? (
      <svg class="play-button__icon" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="6" y="5" width="4" height="14" rx="1" />
        <rect x="14" y="5" width="4" height="14" rx="1" />
      </svg>
    ) : (
      <svg class="play-button__icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 5 L19 12 L7 19 Z" />
      </svg>
    )}
  </button>
);
