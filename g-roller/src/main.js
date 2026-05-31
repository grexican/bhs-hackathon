// Entry point: grab the canvas and start the game.
import { Game } from "./game.js";

// Show the on-screen thumbstick + jump button on touch devices.
if ("ontouchstart" in window || navigator.maxTouchPoints > 0) {
  document.body.classList.add("is-touch");
}

// iOS Safari ignores user-scalable=no, so block its pinch/double-tap zoom gestures.
document.addEventListener("gesturestart", (e) => e.preventDefault());
document.addEventListener("dblclick", (e) => e.preventDefault());

const canvas = document.getElementById("game-canvas");
new Game(canvas);
