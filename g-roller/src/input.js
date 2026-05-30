// Tracks what the player is pressing. Works with keyboard and touch/mouse so
// the game is playable on a laptop or a phone.

export class Input {
  constructor(canvas) {
    // steer: -1 = full left, +1 = full right, 0 = centered
    this.steer = 0;
    // jumpHeld: true while the jump key/touch is down (jump uses "hold for height")
    this.jumpHeld = false;

    this._left = false;
    this._right = false;

    window.addEventListener("keydown", (e) => this._onKey(e, true));
    window.addEventListener("keyup", (e) => this._onKey(e, false));

    // Touch / mouse: left half of screen steers left, right half steers right,
    // and any press also counts as "jump" so one-thumb play works.
    const press = (clientX) => {
      this.jumpHeld = true;
      if (clientX < window.innerWidth / 2) { this._left = true; this._right = false; }
      else { this._right = true; this._left = false; }
      this._recompute();
    };
    const release = () => {
      this.jumpHeld = false;
      this._left = this._right = false;
      this._recompute();
    };

    canvas.addEventListener("pointerdown", (e) => press(e.clientX));
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
    canvas.addEventListener("pointerleave", release);
  }

  _onKey(e, down) {
    switch (e.code) {
      case "ArrowLeft":
      case "KeyA":
        this._left = down; break;
      case "ArrowRight":
      case "KeyD":
        this._right = down; break;
      case "Space":
      case "ArrowUp":
      case "KeyW":
        this.jumpHeld = down;
        e.preventDefault(); // stop Space from scrolling the page
        break;
      default:
        return;
    }
    this._recompute();
  }

  _recompute() {
    this.steer = (this._right ? 1 : 0) - (this._left ? 1 : 0);
  }
}
