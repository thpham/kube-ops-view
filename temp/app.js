// ═══════════════════════════════════════════
// Kubernetes Galaxy — PixiJS v7 PoC
// 3D Celestial Mechanics Edition
// ═══════════════════════════════════════════

var app = new PIXI.Application({
  resizeTo: window,
  backgroundColor: 0x02040a,
  antialias: true,
});
document.body.appendChild(app.view);

// ─── Config ─────────────────────────────
var W = window.innerWidth;
var H = window.innerHeight;
var cx = W / 2;
var cy = H / 2;
var TAU = Math.PI * 2;

// 3D Camera — elevation angle above the galactic plane
var ELEV_DEG = 40;
var ELEV = ELEV_DEG * Math.PI / 180;
var cosE = Math.cos(ELEV);
var sinE = Math.sin(ELEV);

// Kepler speed constants (Kepler 3rd law: n = K / a^1.5)
var K_MASTER = 2.0;
var K_NODE = 0.15;
var K_POD = 0.8;

// Simulation clock (frame-units, incremented by delta each tick)
var simTime = 0;

// ─── Utils ──────────────────────────────
function rand(lo, hi) { return lo + Math.random() * (hi - lo); }
function randI(lo, hi) { return Math.floor(rand(lo, hi)); }

function statusColor(s) {
  return {
    healthy: 0x2ecc71, warning: 0xf1c40f, error: 0xe74c3c,
    oomkilled: 0xff6b35, highcpu: 0xff9500,
  }[s] || 0x7f8c8d;
}

function drawGlow(g, color, radius, alpha) {
  alpha = alpha || 0.03;
  var steps = Math.ceil(radius / 3);
  for (var i = steps; i > 0; i--) {
    g.beginFill(color, alpha);
    g.drawCircle(0, 0, (i / steps) * radius);
    g.endFill();
  }
}

// ─── 3D Projection ─────────────────────
// Orthographic camera at ELEV degrees above the galactic (xz) plane
// World: x = right, y = up (⊥ to galaxy), z = depth into scene
// screenX = cx + x
// screenY = cy − (y·cosE + z·sinE)
// depth   = y·sinE − z·cosE   (higher → closer to camera → drawn on top)
function project(x, y, z) {
  return {
    sx: cx + x,
    sy: cy - (y * cosE + z * sinE),
    depth: y * sinE - z * cosE,
  };
}

// ─── Kepler Orbit Solver ────────────────
// Solve Kepler's equation  M = E − e·sin(E)  for eccentric anomaly E
function solveKepler(M, e) {
  M = ((M % TAU) + TAU) % TAU;
  var E = M;
  for (var k = 0; k < 8; k++) {
    var dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-8) break;
  }
  return E;
}

// Compute 3D position from orbital elements + time
// orb = { a, e, omega, i, node, M0, n }
// (ox, oy, oz) = orbit center in world coords
// eMod / nMod = optional load-distorted values
function orbitPos3D(orb, time, ox, oy, oz, eMod, nMod) {
  var e = (eMod !== undefined) ? eMod : orb.e;
  var n = (nMod !== undefined) ? nMod : orb.n;
  var M = orb.M0 + n * time;
  var E = solveKepler(M, e);
  var cosEA = Math.cos(E), sinEA = Math.sin(E);
  var nu = Math.atan2(Math.sqrt(1 - e * e) * sinEA, cosEA - e);
  var r = orb.a * (1 - e * cosEA);

  var u = nu + orb.omega;
  var cosU = Math.cos(u), sinU = Math.sin(u);
  var cosI = Math.cos(orb.i), sinI = Math.sin(orb.i);
  var cosN = Math.cos(orb.node), sinN = Math.sin(orb.node);

  return {
    x: ox + r * (cosN * cosU - sinN * sinU * cosI),
    y: oy + r * sinU * sinI,
    z: oz + r * (sinN * cosU + cosN * sinU * cosI),
  };
}

// ─── Name Generators ─────────────────────
var deployments = [
  'nginx', 'redis', 'postgres', 'api-srv', 'worker', 'web-fe',
  'cache', 'auth-svc', 'user-svc', 'payment', 'order-proc',
  'notifier', 'ml-pred', 'data-ingest', 'log-collect', 'metric-agent',
  'scheduler', 'gateway', 'proxy', 'vault',
];

function genPodName() {
  var dep = deployments[randI(0, deployments.length)];
  var hash = Math.random().toString(36).substring(2, 12);
  var suffix = Math.random().toString(36).substring(2, 7);
  return dep + '-' + hash + '-' + suffix;
}

function genNodeName(poolName, idx) {
  return poolName + '-node-' + String.fromCharCode(97 + idx);
}

// ─── Namespace Definitions ───────────────
var nsDefs = [
  { name: 'kube-system',   color: 0x5dade2, weight: 0.15 },
  { name: 'default',       color: 0xaaaaaa, weight: 0.10 },
  { name: 'monitoring',    color: 0xf39c12, weight: 0.12 },
  { name: 'ingress-nginx', color: 0x8e44ad, weight: 0.08 },
  { name: 'app-frontend',  color: 0x27ae60, weight: 0.18 },
  { name: 'app-backend',   color: 0xe74c3c, weight: 0.15 },
  { name: 'data-pipeline', color: 0x1abc9c, weight: 0.12 },
  { name: 'ml-training',   color: 0xd35400, weight: 0.10 },
];

var nsCumWeights = [];
var nsTotalWeight = 0;
nsDefs.forEach(function (ns) {
  nsTotalWeight += ns.weight;
  nsCumWeights.push(nsTotalWeight);
});

function pickNamespace() {
  var r = Math.random() * nsTotalWeight;
  for (var i = 0; i < nsCumWeights.length; i++) {
    if (r <= nsCumWeights[i]) return nsDefs[i];
  }
  return nsDefs[nsDefs.length - 1];
}

// ─── World Container + Layers ────────────
var world = new PIXI.Container();
world.eventMode = 'passive';
app.stage.addChild(world);

var layerNames = [
  'nebula', 'stars', 'spiralTrails', 'spiral',
  'poolGlow', 'poolBorders', 'constellations', 'nodes', 'pods',
  'traffic', 'masterTrails', 'masterGlow', 'masters', 'warnings',
];
var layers = {};
layerNames.forEach(function (name) {
  layers[name] = new PIXI.Container();
  world.addChild(layers[name]);
});

// Depth sorting for 3D body layers
layers.masters.sortableChildren = true;
layers.nodes.sortableChildren = true;
layers.pods.sortableChildren = true;

layers.ui = new PIXI.Container();
app.stage.addChild(layers.ui);

app.stage.eventMode = 'static';
app.stage.hitArea = app.screen;

// ═════════════════════════════════════════
// 1. Nebula Clouds
// ═════════════════════════════════════════
[
  { x: cx * 0.3, y: cy * 0.4, r: 350, c: 0x1a3a5c },
  { x: cx * 1.5, y: cy * 0.5, r: 320, c: 0x5a3a1a },
  { x: cx * 0.7, y: cy * 1.5, r: 280, c: 0x2a4a30 },
  { x: cx * 1.3, y: cy * 1.4, r: 300, c: 0x4a2040 },
  { x: cx, y: cy, r: 220, c: 0x3a2a1a },
  { x: cx * 0.2, y: cy * 1.2, r: 260, c: 0x1a2a4a },
  { x: cx * 1.7, y: cy * 1.1, r: 280, c: 0x3a1a3a },
].forEach(function (n) {
  var g = new PIXI.Graphics();
  drawGlow(g, n.c, n.r, 0.012);
  g.x = n.x; g.y = n.y;
  layers.nebula.addChild(g);
});

// ═════════════════════════════════════════
// 2. Starfield (twinkling)
// ═════════════════════════════════════════
var starList = [];
for (var si = 0; si < 900; si++) {
  var s = new PIXI.Graphics();
  var sz = Math.random() < 0.04 ? rand(1.5, 3) : rand(0.3, 1.5);
  var br = rand(0.15, 0.9);
  var starColor = Math.random() < 0.1 ? 0xffd4a0
    : Math.random() < 0.05 ? 0xa0c4ff : 0xffffff;
  s.beginFill(starColor, br);
  s.drawCircle(0, 0, sz);
  s.endFill();
  s.x = rand(0, W); s.y = rand(0, H);
  s._tw = rand(0.001, 0.005);
  s._tp = rand(0, TAU);
  s._br = br;
  starList.push(s);
  layers.stars.addChild(s);
}

// ═════════════════════════════════════════
// 3. Spiral Arms (galaxy disk in 3D)
// ═════════════════════════════════════════

// Spiral container — scaleY compresses disk into 3D tilted ellipse
var spiralContainer = new PIXI.Container();
spiralContainer.x = cx; spiralContainer.y = cy;
spiralContainer.scale.set(1, -sinE); // negative Y → matches 3D projection
layers.spiral.addChild(spiralContainer);

// Faint golden orbit rings (projected as ellipses)
var orbitRings = new PIXI.Graphics();
for (var ri = 50; ri < Math.min(W, H) * 0.45; ri += 25) {
  orbitRings.lineStyle(0.5, 0xffd700, Math.max(0.015, 0.07 - ri * 0.0002));
  orbitRings.drawEllipse(cx, cy, ri, ri * sinE);
}
layers.spiralTrails.addChild(orbitRings);

// Three spiral arms: white → gold → orange → red
for (var arm = 0; arm < 3; arm++) {
  var baseAngle = (arm / 3) * TAU;
  for (var j = 0; j < 220; j++) {
    var tFrac = j / 220;
    var angle = baseAngle + tFrac * Math.PI * 3.8;
    var radius = 30 + tFrac * Math.min(W, H) * 0.44;
    var spread = rand(-20, 20) * (0.5 + tFrac);
    var p = new PIXI.Graphics();
    var pSz = rand(0.4, 2.2) * (1 - tFrac * 0.35);
    var pAl = rand(0.25, 0.75) * (1 - tFrac * 0.35);
    var pCol = tFrac < 0.2 ? 0xffffff : tFrac < 0.45 ? 0xffd700 : tFrac < 0.7 ? 0xff8c00 : 0xff4500;
    p.beginFill(pCol, pAl);
    p.drawCircle(0, 0, pSz);
    p.endFill();
    p.x = Math.cos(angle) * radius + rand(-spread, spread);
    p.y = Math.sin(angle) * radius + rand(-spread, spread);
    spiralContainer.addChild(p);
  }
}

// ═════════════════════════════════════════
// 4. Control Plane — 3 Masters (Kepler orbits)
// ═════════════════════════════════════════
var masterCfg = [
  { color: 0x3498db, label: 'api-server', a: 55 },
  { color: 0xf1c40f, label: 'etcd',       a: 70 },
  { color: 0x2ecc71, label: 'scheduler',  a: 85 },
];

// Master orbit trail rings (projected ellipses)
var mTrails = new PIXI.Graphics();
masterCfg.forEach(function (cfg) {
  mTrails.lineStyle(0.7, cfg.color, 0.1);
  mTrails.drawEllipse(cx, cy, cfg.a, cfg.a * sinE);
});
layers.masterTrails.addChild(mTrails);

// Core glow at galactic center
var coreGlow = new PIXI.Graphics();
drawGlow(coreGlow, 0xffd700, 80, 0.015);
coreGlow.x = cx; coreGlow.y = cy;
layers.masterGlow.addChild(coreGlow);

var masters = masterCfg.map(function (cfg, i) {
  var glow = new PIXI.Graphics();
  drawGlow(glow, cfg.color, 50, 0.035);
  layers.masterGlow.addChild(glow);

  var m = new PIXI.Graphics();
  m.beginFill(cfg.color, 0.1); m.drawCircle(0, 0, 30); m.endFill();
  m.beginFill(cfg.color);       m.drawCircle(0, 0, 16); m.endFill();
  m.beginFill(0xffffff, 0.5);   m.drawCircle(0, 0, 6);  m.endFill();

  m._glow = glow;
  m._label = cfg.label;

  // Kepler orbital elements
  m._orb = {
    a: cfg.a,
    e: rand(0.04, 0.15),
    omega: rand(0, TAU),
    i: rand(-0.18, 0.18),    // ±10° orbital inclination
    node: (TAU / 3) * i + rand(-0.3, 0.3),
    M0: rand(0, TAU),
    n: K_MASTER / Math.pow(cfg.a, 1.5),  // Kepler 3rd law
  };

  // Interactive
  m.eventMode = 'static';
  m.cursor = 'pointer';
  m.hitArea = new PIXI.Circle(0, 0, 20);
  m.on('pointerover', function () {
    showTooltip([this._label, 'role: control-plane', 'status: healthy']);
  });
  m.on('pointerout', hideTooltip);

  layers.masters.addChild(m);
  return m;
});

// ═════════════════════════════════════════
// 5. Node Pools (star clusters — Kepler 3D)
// ═════════════════════════════════════════
var poolDefs = [
  { name: 'default-pool',     color: 0x2ecc71, a: -0.7, d: 0.37, r: 110 },
  { name: 'gpu-pool',         color: 0xe74c3c, a: 0.4,  d: 0.42, r: 100 },
  { name: 'memory-pool',      color: 0xf1c40f, a: 1.3,  d: 0.34, r: 95  },
  { name: 'compute-pool',     color: 0xe67e22, a: 2.2,  d: 0.40, r: 105 },
  { name: 'ingress-pool',     color: 0x9b59b6, a: 3.3,  d: 0.32, r: 85  },
  { name: 'monitoring-pool',  color: 0x3498db, a: 4.6,  d: 0.37, r: 90  },
];

var totalPods = 0;
var totalFailed = 0;
var pools = [];
var allPods = [];

poolDefs.forEach(function (def) {
  var dist = def.d * Math.min(W, H);

  // Pool 3D position (in galactic plane, y = 0)
  var x3d = Math.cos(def.a) * dist;
  var z3d = Math.sin(def.a) * dist;
  var proj = project(x3d, 0, z3d);

  var pool = {
    _x3d: x3d, _y3d: 0, _z3d: z3d,
    sx: proj.sx, sy: proj.sy,
    r: def.r,
    color: def.color,
    name: def.name,
    nodes: [],
    pods: [],
    _load: rand(0.1, 0.5),
    _loadFreq: rand(0.00008, 0.0003),
    _loadPhase: rand(0, TAU),
    _border: null,
    _glowGfx: null,
  };

  // ── Border ring (projected ellipse) ──
  var border = new PIXI.Graphics();
  border.lineStyle(1.2, def.color, 0.2);
  border.drawEllipse(0, 0, pool.r, pool.r * sinE);
  for (var ba = 0; ba < TAU; ba += 0.1) {
    border.beginFill(def.color, 0.1);
    border.drawCircle(
      Math.cos(ba) * pool.r,
      Math.sin(ba) * pool.r * sinE,
      1.2
    );
    border.endFill();
  }
  border.x = pool.sx; border.y = pool.sy;
  pool._border = border;
  layers.poolBorders.addChild(border);

  // ── Pool ambient glow ──
  var pg = new PIXI.Graphics();
  drawGlow(pg, def.color, pool.r * 0.7, 0.006);
  pg.x = pool.sx; pg.y = pool.sy;
  pool._glowGfx = pg;
  layers.poolGlow.addChild(pg);

  // ── Pool label (interactive) ──
  var label = new PIXI.Text(def.name, {
    fontFamily: 'monospace', fontSize: 10, fill: def.color,
  });
  label.anchor.set(0.5);
  label.x = pool.sx;
  label.y = pool.sy - pool.r * sinE - 14;
  label.alpha = 0.65;
  label._pool = pool;
  label.eventMode = 'static';
  label.cursor = 'pointer';
  label.on('pointerover', function () {
    var pl = this._pool;
    var errs = pl.pods.filter(function (pd) {
      return pd._status === 'error' || pd._status === 'oomkilled';
    }).length;
    showTooltip([
      pl.name,
      'nodes: ' + pl.nodes.length + '  pods: ' + pl.pods.length,
      'errors: ' + errs + '  load: ' + (pl._load * 100).toFixed(0) + '%',
    ]);
  });
  label.on('pointerout', hideTooltip);
  layers.poolBorders.addChild(label);

  // ── Nodes (Kepler 3D orbits) ──
  var nCount = randI(3, 7);
  for (var n = 0; n < nCount; n++) {
    var node = new PIXI.Graphics();
    var nr = rand(8, 15);
    node.beginFill(0x1f2937); node.drawCircle(0, 0, nr); node.endFill();
    node.lineStyle(1, def.color, 0.45); node.drawCircle(0, 0, nr);
    node.beginFill(def.color, 0.35); node.drawCircle(0, 0, 3); node.endFill();

    var nodeDist = rand(16, pool.r * 0.55);
    node._orb = {
      a: nodeDist,
      e: rand(0.03, 0.12),
      omega: rand(0, TAU),
      i: rand(-0.35, 0.35),    // ±20° inclination
      node: rand(0, TAU),
      M0: (TAU / nCount) * n + rand(-0.3, 0.3),
      n: K_NODE / Math.pow(nodeDist, 1.5),
    };

    node._name = genNodeName(def.name, n);
    node._cpu = randI(20, 80);
    node._mem = randI(30, 90);
    node._pool = pool;

    node.eventMode = 'static';
    node.cursor = 'pointer';
    node.hitArea = new PIXI.Circle(0, 0, nr + 4);
    node.on('pointerover', function () {
      var pl = this._pool;
      showTooltip([
        this._name,
        'pods: ' + Math.ceil(pl.pods.length / pl.nodes.length),
        'CPU: ' + this._cpu + '%  Mem: ' + this._mem + '%',
      ]);
    });
    node.on('pointerout', hideTooltip);

    pool.nodes.push(node);
    layers.nodes.addChild(node);

    var ng = new PIXI.Graphics();
    drawGlow(ng, def.color, nr + 8, 0.035);
    node._glow = ng;
    layers.poolGlow.addChild(ng);
  }

  // ── Pods (Kepler 3D orbits) ──
  var pCount = randI(30, 55);
  for (var pi = 0; pi < pCount; pi++) {
    var roll = Math.random();
    var status = roll > 0.95 ? 'oomkilled'
      : roll > 0.9 ? 'error'
      : roll > 0.82 ? 'highcpu'
      : roll > 0.72 ? 'warning' : 'healthy';

    if (status === 'error' || status === 'oomkilled') totalFailed++;
    totalPods++;

    var ns = pickNamespace();
    var pod = new PIXI.Graphics();
    var ps = rand(1.5, 4);
    var col = statusColor(status);
    pod.beginFill(col); pod.drawCircle(0, 0, ps); pod.endFill();

    var podDist = rand(pool.r * 0.15, pool.r + 32);
    pod._orb = {
      a: podDist,
      e: rand(0.02, 0.10),
      omega: rand(0, TAU),
      i: rand(-0.30, 0.30),    // ±17° inclination
      node: rand(0, TAU),
      M0: rand(0, TAU),
      n: K_POD / Math.pow(podDist, 1.5),
    };

    pod._status = status;
    pod._name = genPodName();
    pod._nsName = ns.name;
    pod._nsColor = ns.color;
    pod._cpu = randI(5, 95);
    pod._mem = randI(32, 512);
    pod._pool = pool;

    pod.eventMode = 'static';
    pod.cursor = 'pointer';
    pod.hitArea = new PIXI.Circle(0, 0, 8);
    pod.on('pointerover', function () {
      showTooltip([
        this._name,
        'ns: ' + this._nsName + '  status: ' + this._status,
        'CPU: ' + this._cpu + '%  Mem: ' + this._mem + ' MB',
      ]);
    });
    pod.on('pointerout', hideTooltip);

    if (status !== 'healthy') {
      var podGlow = new PIXI.Graphics();
      drawGlow(podGlow, col, ps + 6, 0.055);
      pod._glow = podGlow;
      layers.poolGlow.addChild(podGlow);
    }

    pool.pods.push(pod);
    layers.pods.addChild(pod);
    allPods.push({ pod: pod, pool: pool });
  }

  pools.push(pool);
});

// ═════════════════════════════════════════
// 6. Constellation Connections
// ═════════════════════════════════════════
var constellationLinks = [];
var constellationGfx = new PIXI.Graphics();
layers.constellations.addChild(constellationGfx);
var constellationFrame = 0;

pools.forEach(function (pool) {
  var groups = {};
  pool.pods.forEach(function (pod) {
    if (!groups[pod._nsName]) groups[pod._nsName] = [];
    groups[pod._nsName].push(pod);
  });
  Object.keys(groups).forEach(function (nsName) {
    var group = groups[nsName];
    if (group.length < 2) return;
    // Sort by initial mean anomaly for stable ordering
    group.sort(function (a, b) { return a._orb.M0 - b._orb.M0; });
    var nsColor = group[0]._nsColor;
    for (var ci = 0; ci < group.length - 1; ci++) {
      constellationLinks.push({ a: group[ci], b: group[ci + 1], color: nsColor });
    }
    if (group.length >= 3) {
      constellationLinks.push({ a: group[group.length - 1], b: group[0], color: nsColor });
    }
  });
});

// ═════════════════════════════════════════
// 7. Warning Triangles
// ═════════════════════════════════════════
pools.forEach(function (pool) {
  var errCount = pool.pods.filter(function (pd) {
    return pd._status === 'error' || pd._status === 'oomkilled';
  }).length;
  if (errCount >= 3) {
    var w = new PIXI.Graphics();
    w.beginFill(0xe74c3c);
    w.moveTo(0, -10); w.lineTo(9, 7); w.lineTo(-9, 7); w.closePath();
    w.endFill();
    w.beginFill(0xffffff);
    w.drawRect(-1, -5, 2, 6); w.drawCircle(0, 4.5, 1.2);
    w.endFill();
    w.x = pool.sx; w.y = pool.sy + pool.r * sinE + 18;
    w._pulse = true;
    layers.warnings.addChild(w);
  }
});

// ═════════════════════════════════════════
// 8. Network Traffic System
// ═════════════════════════════════════════
var trafficBeams = [];
var trafficGfx = new PIXI.Graphics();
layers.traffic.addChild(trafficGfx);
var trafficSpawnCounter = 0;

// ═════════════════════════════════════════
// 9. Tooltip System
// ═════════════════════════════════════════
var mousePos = { x: 0, y: 0 };
app.stage.on('pointermove', function (e) {
  mousePos.x = e.global.x;
  mousePos.y = e.global.y;
});

var tooltip = new PIXI.Container();
tooltip.visible = false;
tooltip.eventMode = 'none';
layers.ui.addChild(tooltip);

var tooltipBg = new PIXI.Graphics();
tooltip.addChild(tooltipBg);

var tooltipText = new PIXI.Text('', {
  fontFamily: 'monospace', fontSize: 11, fill: 0xecf0f1,
  wordWrap: true, wordWrapWidth: 300,
});
tooltipText.x = 8; tooltipText.y = 6;
tooltip.addChild(tooltipText);

function showTooltip(lines) {
  tooltipText.text = lines.join('\n');
  tooltipBg.clear();
  tooltipBg.beginFill(0x0a1628, 0.92);
  tooltipBg.lineStyle(1, 0x2a4a6a);
  tooltipBg.drawRoundedRect(0, 0, tooltipText.width + 16, tooltipText.height + 12, 6);
  tooltipBg.endFill();
  tooltip.visible = true;
}

function hideTooltip() {
  tooltip.visible = false;
}

// ═════════════════════════════════════════
// 10. UI — Header Bar
// ═════════════════════════════════════════
var hdr = new PIXI.Graphics();
hdr.beginFill(0x0a1628, 0.88);
hdr.drawRoundedRect(10, 8, W - 20, 42, 8);
hdr.endFill();
hdr.lineStyle(1, 0x1e3a5f, 0.4);
hdr.drawRoundedRect(10, 8, W - 20, 42, 8);
layers.ui.addChild(hdr);

var gear = new PIXI.Graphics();
gear.lineStyle(1.8, 0x7899aa);
gear.drawCircle(34, 29, 6);
for (var ga = 0; ga < TAU; ga += TAU / 8) {
  gear.moveTo(34 + Math.cos(ga) * 5, 29 + Math.sin(ga) * 5);
  gear.lineTo(34 + Math.cos(ga) * 9, 29 + Math.sin(ga) * 9);
}
layers.ui.addChild(gear);

var titleText = new PIXI.Text('Cluster Overview', {
  fontFamily: 'monospace', fontSize: 16, fill: 0xecf0f1, fontWeight: 'bold',
});
titleText.x = 52; titleText.y = 17;
layers.ui.addChild(titleText);

var legendItems = [
  { l: 'Warnings', c: 0xf1c40f }, { l: 'Errors', c: 0xe74c3c },
  { l: 'High CPU', c: 0xff9500 }, { l: 'OOM Killed', c: 0xff6b35 },
];
var lx = Math.max(210, W * 0.36);
legendItems.forEach(function (item) {
  var dot = new PIXI.Graphics();
  dot.beginFill(item.c); dot.drawCircle(0, 0, 4); dot.endFill();
  dot.x = lx; dot.y = 29;
  layers.ui.addChild(dot);
  var txt = new PIXI.Text(item.l, {
    fontFamily: 'monospace', fontSize: 11, fill: 0xaabbcc,
  });
  txt.x = lx + 8; txt.y = 22;
  layers.ui.addChild(txt);
  lx += txt.width + 28;
});

// Search box
var srchBg = new PIXI.Graphics();
srchBg.beginFill(0x0d1f3c, 0.8);
srchBg.drawRoundedRect(0, 0, 150, 26, 4);
srchBg.endFill();
srchBg.lineStyle(1, 0x2a4a6a);
srchBg.drawRoundedRect(0, 0, 150, 26, 4);
srchBg.x = W - 200; srchBg.y = 16;
layers.ui.addChild(srchBg);

var magIcon = new PIXI.Graphics();
magIcon.lineStyle(1.5, 0x556677);
magIcon.drawCircle(W - 188, 28, 5);
magIcon.moveTo(W - 184, 32); magIcon.lineTo(W - 181, 35);
layers.ui.addChild(magIcon);

var srchTxt = new PIXI.Text('Search Pods...', {
  fontFamily: 'monospace', fontSize: 11, fill: 0x556677,
});
srchTxt.x = W - 175; srchTxt.y = 20;
layers.ui.addChild(srchTxt);

// Bell icon
var bellIcon = new PIXI.Graphics();
bellIcon.beginFill(0x7899aa);
bellIcon.moveTo(W - 37, 23);
bellIcon.quadraticCurveTo(W - 37, 17, W - 30, 17);
bellIcon.quadraticCurveTo(W - 23, 17, W - 23, 23);
bellIcon.lineTo(W - 21, 31); bellIcon.lineTo(W - 39, 31);
bellIcon.closePath(); bellIcon.endFill();
bellIcon.beginFill(0x7899aa); bellIcon.drawCircle(W - 30, 33, 2); bellIcon.endFill();
bellIcon.beginFill(0xe74c3c); bellIcon.drawCircle(W - 24, 18, 3); bellIcon.endFill();
layers.ui.addChild(bellIcon);

// ═════════════════════════════════════════
// 11. UI — Footer Status Bar
// ═════════════════════════════════════════
var ftrW = 500, ftrH = 44;
var ftrX = cx - ftrW / 2, ftrY = H - 58;

var ftr = new PIXI.Graphics();
ftr.beginFill(0x0a1628, 0.88);
ftr.drawRoundedRect(ftrX, ftrY, ftrW, ftrH, 8);
ftr.endFill();
ftr.lineStyle(1, 0x1e3a5f, 0.4);
ftr.drawRoundedRect(ftrX, ftrY, ftrW, ftrH, 8);
layers.ui.addChild(ftr);

function addMetric(x, label, value, barColor, showBar) {
  var lbl = new PIXI.Text(label + ' ', {
    fontFamily: 'monospace', fontSize: 12, fill: 0x8899aa,
  });
  lbl.x = x; lbl.y = ftrY + (showBar ? 5 : 12);
  layers.ui.addChild(lbl);

  var val = new PIXI.Text(String(value), {
    fontFamily: 'monospace', fontSize: 14, fill: 0xecf0f1, fontWeight: 'bold',
  });
  val.x = x + lbl.width; val.y = ftrY + (showBar ? 4 : 11);
  layers.ui.addChild(val);

  if (showBar) {
    var bw = 90, bh = 6, by = ftrY + 28;
    var bg = new PIXI.Graphics();
    bg.beginFill(0x1a2a3a); bg.drawRoundedRect(x, by, bw, bh, 3); bg.endFill();
    layers.ui.addChild(bg);
    var bar = new PIXI.Graphics();
    bar.beginFill(barColor);
    bar.drawRoundedRect(x, by, bw * (parseInt(value) / 100), bh, 3);
    bar.endFill();
    layers.ui.addChild(bar);
  }
}

var mx = ftrX + 20;
addMetric(mx, 'CPU:', '72%', 0x2ecc71, true);
addMetric(mx + 125, 'Memory:', '85%', 0xf1c40f, true);
addMetric(mx + 275, 'Pods:', String(totalPods), 0x3498db, false);
addMetric(mx + 365, 'Failed:', String(totalFailed), 0xe74c3c, false);

// ═════════════════════════════════════════
// 12. Zoom & Pan (uniform scale — 3D handled by projection)
// ═════════════════════════════════════════
var zoomText = new PIXI.Text('1.0x', {
  fontFamily: 'monospace', fontSize: 11, fill: 0x556677,
});
zoomText.x = 20; zoomText.y = H - 20;
layers.ui.addChild(zoomText);

app.view.addEventListener('wheel', function (e) {
  e.preventDefault();
  var oldScale = world.scale.x;
  var factor = e.deltaY > 0 ? 0.92 : 1.08;
  var newScale = Math.max(0.25, Math.min(5, oldScale * factor));
  var mX = e.offsetX, mY = e.offsetY;
  world.x = mX - (mX - world.x) * (newScale / oldScale);
  world.y = mY - (mY - world.y) * (newScale / oldScale);
  world.scale.set(newScale); // uniform — no PERSPECTIVE ratio needed
  zoomText.text = newScale.toFixed(1) + 'x';
}, { passive: false });

// Free left-click drag to pan (3px dead zone)
var PAN_THRESHOLD = 3;
var panning = false, panPending = false;
var panStart = { x: 0, y: 0 }, worldStart = { x: 0, y: 0 };

app.view.addEventListener('pointerdown', function (e) {
  if (e.button === 0 && e.offsetY > 55 && e.offsetY < H - 70) {
    panPending = true;
    panning = false;
    panStart.x = e.clientX; panStart.y = e.clientY;
    worldStart.x = world.x; worldStart.y = world.y;
  }
});
app.view.addEventListener('pointermove', function (e) {
  if (panPending && !panning) {
    var dx = e.clientX - panStart.x;
    var dy = e.clientY - panStart.y;
    if (dx * dx + dy * dy > PAN_THRESHOLD * PAN_THRESHOLD) {
      panning = true;
      app.view.style.cursor = 'grabbing';
    }
  }
  if (panning) {
    world.x = worldStart.x + (e.clientX - panStart.x);
    world.y = worldStart.y + (e.clientY - panStart.y);
  }
});
app.view.addEventListener('pointerup', function () {
  panPending = false;
  if (panning) {
    panning = false;
    app.view.style.cursor = 'grab';
  }
});

// Double-click to reset view
var lastClickTime = 0;
app.view.addEventListener('click', function () {
  var now = Date.now();
  if (now - lastClickTime < 300) {
    world.scale.set(1);
    world.x = 0;
    world.y = 0;
    zoomText.text = '1.0x';
  }
  lastClickTime = now;
});

app.view.style.cursor = 'grab';

// ═════════════════════════════════════════
// 13. Animation Loop
// ═════════════════════════════════════════
app.ticker.add(function (delta) {
  var t = Date.now();
  simTime += delta;

  // ── Star twinkling ──
  for (var sti = 0; sti < starList.length; sti++) {
    var star = starList[sti];
    star.alpha = star._br * (0.5 + Math.sin(t * star._tw + star._tp) * 0.5);
  }

  // ── Spiral rotation ──
  spiralContainer.rotation += 0.00015 * delta;

  // ── Pool load drift ──
  for (var pli = 0; pli < pools.length; pli++) {
    var pool = pools[pli];
    pool._load = 0.3 + 0.3 * Math.sin(t * pool._loadFreq + pool._loadPhase);
    if (Math.random() < 0.0003) pool._load = Math.min(1, pool._load + 0.3);
  }

  // ── Masters — Kepler 3D orbits ──
  for (var mi = 0; mi < masters.length; mi++) {
    var m = masters[mi];
    var mPos = orbitPos3D(m._orb, simTime, 0, 0, 0);
    var mProj = project(mPos.x, mPos.y, mPos.z);
    m.x = mProj.sx;
    m.y = mProj.sy;
    m.zIndex = Math.round(mProj.depth * 10);
    m._glow.x = mProj.sx;
    m._glow.y = mProj.sy;
    m._glow.scale.set(1 + Math.sin(t * 0.002 + simTime * m._orb.n) * 0.12);
  }

  // ── Nodes & Pods — Kepler 3D with load distortion ──
  for (var pli2 = 0; pli2 < pools.length; pli2++) {
    var pool2 = pools[pli2];
    var load = pool2._load;

    // Border gravitational breathing
    if (pool2._border) {
      pool2._border.scale.set(1 + load * 0.04 * Math.sin(t / 600));
    }
    if (pool2._glowGfx) {
      pool2._glowGfx.alpha = 0.5 + load * 0.5;
    }

    // Nodes — Kepler 3D, speed boosted by load
    for (var ni = 0; ni < pool2.nodes.length; ni++) {
      var node = pool2.nodes[ni];
      var nN = node._orb.n * (1 + load * 0.3);
      var nPos = orbitPos3D(node._orb, simTime, pool2._x3d, pool2._y3d, pool2._z3d, undefined, nN);
      var nProj = project(nPos.x, nPos.y, nPos.z);
      node.x = nProj.sx;
      node.y = nProj.sy;
      node.zIndex = Math.round(nProj.depth * 10);
      if (node._glow) { node._glow.x = nProj.sx; node._glow.y = nProj.sy; }
    }

    // Pods — Kepler 3D, eccentricity + speed boosted by load
    for (var pj = 0; pj < pool2.pods.length; pj++) {
      var pod = pool2.pods[pj];
      var pE = Math.min(0.8, pod._orb.e + load * 0.15);
      var pN = pod._orb.n * (1 + load * 0.5);
      var pPos = orbitPos3D(pod._orb, simTime, pool2._x3d, pool2._y3d, pool2._z3d, pE, pN);
      var pProj = project(pPos.x, pPos.y, pPos.z);
      pod.x = pProj.sx;
      pod.y = pProj.sy;
      pod.zIndex = Math.round(pProj.depth * 10);
      if (pod._glow) { pod._glow.x = pProj.sx; pod._glow.y = pProj.sy; }
      if (pod._status === 'error' || pod._status === 'oomkilled') {
        pod.scale.set(1 + Math.sin(t / 150) * 0.35);
      }
      if (pod._status === 'highcpu') {
        pod.alpha = 0.6 + Math.sin(t / 80) * 0.4;
      }
    }
  }

  // ── Constellation lines (every 4 frames) ──
  constellationFrame++;
  if (constellationFrame >= 4) {
    constellationFrame = 0;
    constellationGfx.clear();
    if (world.scale.x >= 0.5) {
      for (var ci = 0; ci < constellationLinks.length; ci++) {
        var link = constellationLinks[ci];
        constellationGfx.lineStyle(0.5, link.color, 0.15);
        constellationGfx.moveTo(link.a.x, link.a.y);
        constellationGfx.lineTo(link.b.x, link.b.y);
      }
    }
  }

  // ── Network traffic beams ──
  trafficSpawnCounter++;
  if (trafficSpawnCounter >= 40 && trafficBeams.length < 25) {
    trafficSpawnCounter = 0;
    var spawnCount = randI(1, 4);
    for (var bi = 0; bi < spawnCount && trafficBeams.length < 25; bi++) {
      var srcIdx = randI(0, allPods.length);
      var dstIdx = randI(0, allPods.length);
      if (srcIdx === dstIdx) continue;
      var isCross = allPods[srcIdx].pool !== allPods[dstIdx].pool;
      trafficBeams.push({
        src: allPods[srcIdx].pod,
        dst: allPods[dstIdx].pod,
        progress: 0,
        speed: rand(0.008, 0.02),
        color: isCross ? 0xff88ff : 0x00ffff,
        midX: rand(-30, 30),
        midY: rand(-30, 30),
      });
    }
  }

  trafficGfx.clear();
  for (var ti = trafficBeams.length - 1; ti >= 0; ti--) {
    var beam = trafficBeams[ti];
    beam.progress += beam.speed * delta;
    if (beam.progress >= 1) { trafficBeams.splice(ti, 1); continue; }
    var bsx = beam.src.x, bsy = beam.src.y;
    var bdx = beam.dst.x, bdy = beam.dst.y;
    var bmx = (bsx + bdx) / 2 + beam.midX;
    var bmy = (bsy + bdy) / 2 + beam.midY;
    var prog = beam.progress;
    var invP = 1 - prog;
    var bx = invP * invP * bsx + 2 * invP * prog * bmx + prog * prog * bdx;
    var by = invP * invP * bsy + 2 * invP * prog * bmy + prog * prog * bdy;
    trafficGfx.lineStyle(0.5, beam.color, 0.12);
    trafficGfx.moveTo(bsx, bsy); trafficGfx.lineTo(bx, by);
    trafficGfx.lineStyle(0);
    trafficGfx.beginFill(beam.color, 0.8); trafficGfx.drawCircle(bx, by, 2); trafficGfx.endFill();
    trafficGfx.beginFill(beam.color, 0.15); trafficGfx.drawCircle(bx, by, 5); trafficGfx.endFill();
  }

  // ── Warning pulse ──
  var wc = layers.warnings.children;
  for (var wi = 0; wi < wc.length; wi++) {
    if (wc[wi]._pulse) wc[wi].alpha = 0.5 + Math.sin(t / 300) * 0.5;
  }

  // ── Tooltip position ──
  if (tooltip.visible) {
    tooltip.x = mousePos.x + 15;
    tooltip.y = mousePos.y + 10;
    if (tooltip.x + tooltip.width > W) tooltip.x = mousePos.x - tooltip.width - 10;
    if (tooltip.y + tooltip.height > H) tooltip.y = mousePos.y - tooltip.height - 10;
  }
});
