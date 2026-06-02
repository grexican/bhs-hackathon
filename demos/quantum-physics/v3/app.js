/* ============================================================
   QUANTUM // shared behavior
   - seeded deterministic RNG (hyperframes-style: same seed => same art)
   - reduced-motion guard
   - GSAP scroll reveals (enhancement only; content is visible by default)
   - shared topic data + the index hero & map Three.js scenes
   r128 ONLY. No CapsuleGeometry / post-r128 APIs.
   ============================================================ */

// reduced motion: respected everywhere before we start any rAF loop
const REDUCED = window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// --- seeded RNG (mulberry32). Deterministic art, hyperframes-style. ---
function makeRNG(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- the ten topics, in reading order (drives nav + map + pagers) ---
const TOPICS = [
  ["wave-particle", "Wave / Particle", "Matter travels as a wave, lands as a dot."],
  ["superposition", "Superposition", "Both answers at once, until you ask."],
  ["double-slit", "Double Slit", "One particle interferes with itself."],
  ["uncertainty", "Uncertainty", "Pin the position, lose the momentum."],
  ["quantization", "Quantization", "Energy comes in rungs, never ramps."],
  ["entanglement", "Entanglement", "Two coins, always opposite, any distance."],
  ["tunneling", "Tunneling", "Through the wall it has no right to cross."],
  ["spin", "Spin", "Measure it and the beam splits in two."],
  ["measurement", "Measurement", "The cloud of maybe becomes one fact."],
];

/* ============================================================
   THEME SWAP — pick a look, swap one CSS file, remember it.
   Each theme is an override stylesheet loaded AFTER styles.css.
   "default" means no overlay (the original instrument-room look).
   The choice lives in localStorage so it survives page changes.
   ============================================================ */
const THEMES = [
  ["default",       "Default"],
  ["neo-brutalism", "Neo-Brutalism"],
  ["claymorphism",  "Claymorphism"],
  ["minimalism",    "Minimalism"],
  ["liquid-glass",  "Liquid Glass"],
  ["glassmorphism", "Glassmorphism"],
  ["skeuomorphism", "Skeuomorphism"],
];
const THEME_KEY = "quantum-theme";

// One theme for the whole /v3/ site. We can't rely on localStorage alone:
// when these pages are opened as files (file://), the browser gives each
// .html its OWN localStorage bucket, so a choice on index.html never reaches
// pages/spin.html. Fix: carry the theme in the URL (?theme=) across every
// internal link, and keep localStorage as a same-page backup. URL wins on
// boot because it reflects the click that brought you here.
function readBootTheme() {
  try { const u = new URLSearchParams(location.search).get("theme"); if (u) return u; } catch (e) {}
  try { return localStorage.getItem(THEME_KEY) || "default"; } catch (e) {}
  return "default";
}
let activeTheme = readBootTheme();   // the single source of truth after load
function currentTheme() { return activeTheme; }

function rememberTheme(slug) { try { localStorage.setItem(THEME_KEY, slug); } catch (e) {} }

// topic pages live in /pages/, so they reach the themes folder via ../
function themeHref(slug) {
  const prefix = location.pathname.includes("/pages/") ? "../" : "";
  return prefix + "themes/" + slug + ".css";
}

// swap the overlay <link>; remove it entirely for the default look
function applyTheme(slug) {
  let link = document.getElementById("theme-css");
  if (slug === "default") { if (link) link.remove(); return; }
  if (!link) {
    link = document.createElement("link");
    link.id = "theme-css";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }
  link.href = themeHref(slug);
}

// add/replace ?theme= on a (possibly relative) href, keeping its path + hash
function withTheme(href, slug) {
  const hashAt = href.indexOf("#");
  const hash = hashAt >= 0 ? href.slice(hashAt) : "";
  const beforeHash = hashAt >= 0 ? href.slice(0, hashAt) : href;
  const qAt = beforeHash.indexOf("?");
  const path = qAt >= 0 ? beforeHash.slice(0, qAt) : beforeHash;
  const query = qAt >= 0 ? beforeHash.slice(qAt + 1) : "";
  const params = query.split("&").filter(p => p && !p.startsWith("theme="));
  params.push("theme=" + encodeURIComponent(slug));
  return path + "?" + params.join("&") + hash;
}

// links we should stamp: real navigations to other pages, not anchors/externals
function isInternalNav(a) {
  const href = a.getAttribute("href");
  if (!href || href.startsWith("#")) return false;
  if (/^(https?:|mailto:|tel:)/i.test(href)) return false;
  if (a.target && a.target !== "_self") return false;
  return true;
}

// right before any internal link is followed, stamp the live theme onto it
function carryThemeOnClick(e) {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest && e.target.closest("a[href]");
  if (!a || !isInternalNav(a)) return;
  a.setAttribute("href", withTheme(a.getAttribute("href"), activeTheme));
}

// change the theme: update memory, the <link>, storage, and this page's URL
// (replaceState so a refresh — and any onward link — keeps the new choice)
function setTheme(slug) {
  activeTheme = slug;
  applyTheme(slug);
  rememberTheme(slug);
  try { const url = new URL(location.href); url.searchParams.set("theme", slug); history.replaceState(null, "", url); } catch (e) {}
}

// boot: apply the theme immediately, cache it, and start carrying it on clicks
applyTheme(activeTheme);
rememberTheme(activeTheme);
document.addEventListener("click", carryThemeOnClick, true);

// inject the shared top nav into any page that has <div id="nav-mount">
function mountNav(active) {
  const el = document.getElementById("nav-mount");
  if (!el) return;
  const onIndex = !location.pathname.includes("/pages/");
  const home = onIndex ? "index.html" : "../index.html";
  const link = (slug) => (onIndex ? "pages/" + slug + ".html" : slug + ".html");
  const themeOptions = THEMES.map(t => `<option value="${t[0]}">${t[1]}</option>`).join("");
  // show ALL nine topics so the nav matches the nine sections on the map
  el.innerHTML = `
    <nav class="nav">
      <a class="nav__brand nav__home" href="${home}">QUANTUM<b>//</b>LAB</a>
      <div class="nav__links">
        ${TOPICS.map(t =>
          `<a href="${link(t[0])}"${active===t[0]?' style="color:var(--amber)"':''}>${t[1]}</a>`
        ).join("")}
        <a class="nav__home" href="${home}">Map</a>
        <label class="theme-pick">
          <span class="theme-pick__label">Theme</span>
          <select class="theme-pick__select" aria-label="Color theme">${themeOptions}</select>
        </label>
      </div>
    </nav>`;

  // sync the dropdown to the active theme, then swap + remember on change
  const sel = el.querySelector(".theme-pick__select");
  if (sel) {
    sel.value = currentTheme();
    sel.addEventListener("change", () => setTheme(sel.value));
  }
}

// build the prev/next pager at the bottom of a topic page
function mountPager(slug) {
  const el = document.getElementById("pager-mount");
  if (!el) return;
  const i = TOPICS.findIndex(t => t[0] === slug);
  const prev = TOPICS[(i - 1 + TOPICS.length) % TOPICS.length];
  const next = TOPICS[(i + 1) % TOPICS.length];
  el.innerHTML = `
    <a href="${prev[0]}.html">&larr; PREVIOUS<b>${prev[1]}</b></a>
    <a href="index.html" style="text-align:center">&uarr; ALL TOPICS<b>The Map</b></a>
    <a href="${next[0]}.html" style="text-align:right">NEXT &rarr;<b>${next[1]}</b></a>`;
}

// GSAP reveal: content starts VISIBLE; we only nudge it in. Never gate display.
function revealOnScroll() {
  if (REDUCED || typeof gsap === "undefined") return;
  document.querySelectorAll("[data-reveal]").forEach((node, i) => {
    gsap.from(node, {
      opacity: 0, y: 26, duration: 0.7, ease: "expo.out",
      scrollTrigger: { trigger: node, start: "top 88%" },
      delay: (i % 4) * 0.04,
    });
  });
}

// helper: size a renderer to its parent box and keep it crisp
function fitRenderer(renderer, camera, el) {
  const w = el.clientWidth, h = el.clientHeight || 400;
  renderer.setSize(w, h, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  if (camera.isPerspectiveCamera) { camera.aspect = w / h; camera.updateProjectionMatrix(); }
}

// throttle a render loop; auto-pause when tab hidden
function loop(fn) {
  let raf, running = true;
  function tick(t) { if (running) fn(t); raf = requestAnimationFrame(tick); }
  raf = requestAnimationFrame(tick);
  document.addEventListener("visibilitychange", () => { running = !document.hidden; });
  return () => cancelAnimationFrame(raf);
}

/* ============================================================
   INDEX HERO  — a Three.js probability field
   ============================================================ */
function initHero() {
  const host = document.getElementById("hero-canvas");
  if (!host || typeof THREE === "undefined") return;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0d0c10, 0.055);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
  camera.position.set(0, 0, 16);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  host.appendChild(renderer.domElement);
  fitRenderer(renderer, camera, host);

  const rng = makeRNG(424242);

  const N = REDUCED ? 1400 : 5200;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const amber = new THREE.Color(0xffb33e);
  const cyan = new THREE.Color(0x41e0d6);
  for (let i = 0; i < N; i++) {
    const shell = 2 + Math.floor(rng() * 4) * 1.7;
    const u = rng() * 2 - 1, th = rng() * Math.PI * 2;
    const r = shell * (0.85 + rng() * 0.3);
    const s = Math.sqrt(1 - u * u);
    pos[i*3]   = r * s * Math.cos(th);
    pos[i*3+1] = r * u * 0.7;
    pos[i*3+2] = r * s * Math.sin(th);
    const c = rng() > 0.55 ? amber : cyan;
    col[i*3] = c.r; col[i*3+1] = c.g; col[i*3+2] = c.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ size: 0.07, vertexColors: true, transparent: true,
    opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const cloud = new THREE.Points(g, m);
  scene.add(cloud);

  const ribbonGeo = new THREE.PlaneGeometry(26, 9, 60, 14);
  const ribbon = new THREE.Mesh(ribbonGeo,
    new THREE.MeshBasicMaterial({ color: 0xff8a1e, wireframe: true, transparent: true, opacity: 0.16 }));
  ribbon.rotation.x = -Math.PI / 2.4; ribbon.position.y = -5.5;
  scene.add(ribbon);
  const base = ribbonGeo.attributes.position.array.slice();

  let mx = 0, my = 0;
  window.addEventListener("pointermove", (e) => {
    mx = (e.clientX / window.innerWidth - 0.5);
    my = (e.clientY / window.innerHeight - 0.5);
  });

  const clock = new THREE.Clock();
  loop(() => {
    const t = clock.getElapsedTime();
    cloud.rotation.y = t * 0.06;
    cloud.rotation.x = Math.sin(t * 0.15) * 0.08;
    const arr = ribbonGeo.attributes.position.array;
    for (let i = 0; i < arr.length; i += 3) {
      const x = base[i], y = base[i+1];
      arr[i+2] = Math.sin(x * 0.6 + t * 1.6) * 0.7 + Math.cos(y * 0.8 - t) * 0.4;
    }
    ribbonGeo.attributes.position.needsUpdate = true;
    camera.position.x += (mx * 5 - camera.position.x) * 0.04;
    camera.position.y += (-my * 3 - camera.position.y) * 0.04;
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  });

  window.addEventListener("resize", () => fitRenderer(renderer, camera, host));
}

/* ============================================================
   MAP NODE backgrounds — tiny deterministic Three.js point swirls
   ============================================================ */
function initMapNodes() {
  if (typeof THREE === "undefined") return;
  document.querySelectorAll(".node[data-seed]").forEach((node) => {
    const cv = document.createElement("canvas");
    node.prepend(cv);
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 50);
    cam.position.z = 9;
    const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
    fitRenderer(renderer, cam, node);

    const rng = makeRNG(parseInt(node.dataset.seed, 10) || 1);
    const N = REDUCED ? 120 : 360;
    const p = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = rng() * Math.PI * 2, r = 1 + rng() * 4;
      p[i*3] = Math.cos(a) * r; p[i*3+1] = (rng()*2-1) * 3; p[i*3+2] = Math.sin(a) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(p, 3));
    const hue = node.dataset.hue === "cyan" ? 0x41e0d6 : 0xffb33e;
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: hue, size: 0.09,
      transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite:false }));
    scene.add(pts);

    let spin = 0.003;
    node.addEventListener("pointerenter", () => spin = 0.02);
    node.addEventListener("pointerleave", () => spin = 0.003);
    loop(() => { pts.rotation.y += spin; pts.rotation.x += spin * 0.4; renderer.render(scene, cam); });
  });
}

// boot
document.addEventListener("DOMContentLoaded", () => {
  mountNav(window.__ACTIVE_TOPIC || null);
  if (window.__ACTIVE_TOPIC) mountPager(window.__ACTIVE_TOPIC);
  if (typeof gsap !== "undefined" && gsap.registerPlugin && window.ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
  }
  initHero();
  initMapNodes();
  revealOnScroll();
});

// expose shared helpers for per-page scripts
window.QUANTUM = { makeRNG, REDUCED, fitRenderer, loop, TOPICS };
