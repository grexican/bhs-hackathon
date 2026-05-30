# G-Roller (Web)

A browser port of the **G-Roller** 3D endless runner (originally built in Unity),
rebuilt with **[Three.js](https://threejs.org/)** + **[Vite](https://vitejs.dev/)**.

## The game

You're a ball that auto-runs forward across floating platforms. Steer, jump
between platforms, and roll as far as you can without falling into the void.
The run speeds up and the platforms spread out the longer you survive.

- **SPACE / W / ↑** — jump (hold for height, release early to drop fast)
- **A / D / ← / →** — steer left / right
- **Touch** — tap the left/right half of the screen to steer; any tap jumps

Watch out for the **glowing red boards** — they bounce you.

## Why Three.js?

The original is a 3D physics game (gravity, jumping, platform collisions). Three.js
is the standard, lightweight 3D renderer for the browser. The movement is simple and
custom (variable-height jump, pass-through-from-below platforms, fall-off death), so
the physics is hand-rolled to match the Unity feel instead of pulling in a heavy
physics engine.

## Run it

```bash
cd web
npm install
npm run dev
```

Then open the URL it prints (usually http://localhost:5173).

To build a static version you can host anywhere:

```bash
npm run build      # outputs to web/dist
npm run preview    # serve the built version locally
```

## How the code maps to the original Unity scripts

| Web file            | Original Unity script(s)                          |
|---------------------|---------------------------------------------------|
| `src/game.js`       | `GameManager.cs` (state, loop, scoring, camera)   |
| `src/player.js`     | `PlayerController.cs` (movement, jump, collisions) |
| `src/platforms.js`  | `BoardSpawner.cs` + `SpawnerController.cs`         |
| `src/config.js`     | tunable numbers from `GameManager.cs`             |
| `src/input.js`      | `CrossPlatformInputManager` (keyboard + touch)    |
