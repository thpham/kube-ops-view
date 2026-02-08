// ═══════════════════════════════════════════
// Kubernetes Galaxy — PixiJS v7 PoC
// ═══════════════════════════════════════════

const app = new PIXI.Application({
  resizeTo: window,
  backgroundColor: 0x02040a,
  antialias: true,
});
document.body.appendChild(app.view);

// ─── Config ─────────────────────────────
const W = window.innerWidth;
const H = window.innerHeight;
const cx = W / 2;
const cy = H / 2;
const TAU = Math.PI * 2;

// ─── Utils ──────────────────────────────
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const randI = (lo, hi) => Math.floor(rand(lo, hi));

function statusColor(s) {
  return {
    healthy: 0x2ecc71,
    warning: 0xf1c40f,
    error: 0xe74c3c,
    oomkilled: 0xff6b35,
    highcpu: 0xff9500,
  }[s] || 0x7f8c8d;
}

// Soft radial glow via concentric fills (no blur filter needed)
function drawGlow(g, color, radius, alpha) {
  alpha = alpha || 0.03;
  var steps = Math.ceil(radius / 3);
  for (var i = steps; i > 0; i--) {
    g.beginFill(color, alpha);
    g.drawCircle(0, 0, (i / steps) * radius);
    g.endFill();
  }
}

// ─── Layers (back → front) ──────────────
var layerNames = [
  'nebula', 'stars', 'spiralTrails', 'spiral',
  'poolGlow', 'poolBorders', 'nodes', 'pods',
  'masterTrails', 'masterGlow', 'masters',
  'warnings', 'ui',
];
var layers = {};
layerNames.forEach(function (name) {
  layers[name] = new PIXI.Container();
  app.stage.addChild(layers[name]);
});

// ═════════════════════════════════════════
// 1. Nebula Clouds
// ═════════════════════════════════════════
var nebulae = [
  { x: cx * 0.3, y: cy * 0.4, r: 350, c: 0x1a3a5c },
  { x: cx * 1.5, y: cy * 0.5, r: 320, c: 0x5a3a1a },
  { x: cx * 0.7, y: cy * 1.5, r: 280, c: 0x2a4a30 },
  { x: cx * 1.3, y: cy * 1.4, r: 300, c: 0x4a2040 },
  { x: cx, y: cy, r: 220, c: 0x3a2a1a },
  { x: cx * 0.2, y: cy * 1.2, r: 260, c: 0x1a2a4a },
  { x: cx * 1.7, y: cy * 1.1, r: 280, c: 0x3a1a3a },
];
nebulae.forEach(function (n) {
  var g = new PIXI.Graphics();
  drawGlow(g, n.c, n.r, 0.012);
  g.x = n.x;
  g.y = n.y;
  layers.nebula.addChild(g);
});

// ═════════════════════════════════════════
// 2. Starfield (twinkling)
// ═════════════════════════════════════════
var starList = [];
for (var i = 0; i < 900; i++) {
  var s = new PIXI.Graphics();
  var sz = Math.random() < 0.04 ? rand(1.5, 3) : rand(0.3, 1.5);
  var br = rand(0.15, 0.9);
  // Slight color variation for stars
  var starColor =
    Math.random() < 0.1
      ? 0xffd4a0
      : Math.random() < 0.05
        ? 0xa0c4ff
        : 0xffffff;
  s.beginFill(starColor, br);
  s.drawCircle(0, 0, sz);
  s.endFill();
  s.x = rand(0, W);
  s.y = rand(0, H);
  s._tw = rand(0.001, 0.005);
  s._tp = rand(0, TAU);
  s._br = br;
  starList.push(s);
  layers.stars.addChild(s);
}

// ═════════════════════════════════════════
// 3. Spiral Arms (galaxy structure)
// ═════════════════════════════════════════
var spiralContainer = new PIXI.Container();
spiralContainer.x = cx;
spiralContainer.y = cy;
layers.spiral.addChild(spiralContainer);

// Concentric orbit rings (faint golden rings)
var orbitRings = new PIXI.Graphics();
for (var r = 50; r < Math.min(W, H) * 0.45; r += 25) {
  orbitRings.lineStyle(0.5, 0xffd700, Math.max(0.015, 0.07 - r * 0.0002));
  orbitRings.drawCircle(cx, cy, r);
}
layers.spiralTrails.addChild(orbitRings);

// Three spiral arms with color gradient: white → gold → orange → red
for (var arm = 0; arm < 3; arm++) {
  var baseAngle = (arm / 3) * TAU;
  for (var j = 0; j < 220; j++) {
    var t = j / 220;
    var angle = baseAngle + t * Math.PI * 3.8;
    var radius = 30 + t * Math.min(W, H) * 0.44;
    var spread = rand(-20, 20) * (0.5 + t);

    var p = new PIXI.Graphics();
    var pSz = rand(0.4, 2.2) * (1 - t * 0.35);
    var pAl = rand(0.25, 0.75) * (1 - t * 0.35);
    var pCol =
      t < 0.2 ? 0xffffff : t < 0.45 ? 0xffd700 : t < 0.7 ? 0xff8c00 : 0xff4500;

    p.beginFill(pCol, pAl);
    p.drawCircle(0, 0, pSz);
    p.endFill();

    p.x = Math.cos(angle) * radius + rand(-spread, spread);
    p.y = Math.sin(angle) * radius + rand(-spread, spread);
    spiralContainer.addChild(p);
  }
}

// ═════════════════════════════════════════
// 4. Control Plane — 3-body Masters
// ═════════════════════════════════════════
var masterCfg = [
  { color: 0x3498db, label: 'api-server' },
  { color: 0xf1c40f, label: 'etcd' },
  { color: 0x2ecc71, label: 'scheduler' },
];

// Master orbit trail rings
var mTrails = new PIXI.Graphics();
[
  { r: 55, c: 0x3498db },
  { r: 70, c: 0xf1c40f },
  { r: 85, c: 0x2ecc71 },
].forEach(function (o) {
  mTrails.lineStyle(0.7, o.c, 0.1);
  mTrails.drawCircle(cx, cy, o.r);
});
layers.masterTrails.addChild(mTrails);

// Core glow at galactic center
var coreGlow = new PIXI.Graphics();
drawGlow(coreGlow, 0xffd700, 80, 0.015);
coreGlow.x = cx;
coreGlow.y = cy;
layers.masterGlow.addChild(coreGlow);

var masters = masterCfg.map(function (cfg, i) {
  // Individual glow
  var glow = new PIXI.Graphics();
  drawGlow(glow, cfg.color, 50, 0.035);
  layers.masterGlow.addChild(glow);

  // Body: outer halo + core + bright center
  var m = new PIXI.Graphics();
  m.beginFill(cfg.color, 0.1);
  m.drawCircle(0, 0, 30);
  m.endFill();
  m.beginFill(cfg.color);
  m.drawCircle(0, 0, 16);
  m.endFill();
  m.beginFill(0xffffff, 0.5);
  m.drawCircle(0, 0, 6);
  m.endFill();

  m._glow = glow;
  m._orbitR = 55 + i * 15;
  m._a = (TAU / 3) * i + rand(0, 0.5);
  m._spd = 0.005 + i * 0.0012;

  layers.masters.addChild(m);
  return m;
});

// ═════════════════════════════════════════
// 5. Node Pools (star clusters)
// ═════════════════════════════════════════
var poolDefs = [
  { name: 'default-pool', color: 0x2ecc71, a: -0.7, d: 0.37, r: 110 },
  { name: 'gpu-pool', color: 0xe74c3c, a: 0.4, d: 0.42, r: 100 },
  { name: 'memory-pool', color: 0xf1c40f, a: 1.3, d: 0.34, r: 95 },
  { name: 'compute-pool', color: 0xe67e22, a: 2.2, d: 0.40, r: 105 },
  { name: 'ingress-pool', color: 0x9b59b6, a: 3.3, d: 0.32, r: 85 },
  { name: 'monitoring-pool', color: 0x3498db, a: 4.6, d: 0.37, r: 90 },
];

var totalPods = 0;
var totalFailed = 0;
var pools = [];

poolDefs.forEach(function (def) {
  var dist = def.d * Math.min(W, H);
  var pool = {
    x: cx + Math.cos(def.a) * dist,
    y: cy + Math.sin(def.a) * dist,
    r: def.r,
    color: def.color,
    name: def.name,
    nodes: [],
    pods: [],
  };

  // ── Pool border ring with dotted effect ──
  var border = new PIXI.Graphics();
  border.lineStyle(1.2, def.color, 0.2);
  border.drawCircle(pool.x, pool.y, pool.r);
  for (var a = 0; a < TAU; a += 0.1) {
    border.beginFill(def.color, 0.1);
    border.drawCircle(
      pool.x + Math.cos(a) * pool.r,
      pool.y + Math.sin(a) * pool.r,
      1.2
    );
    border.endFill();
  }
  layers.poolBorders.addChild(border);

  // ── Pool ambient glow ──
  var pg = new PIXI.Graphics();
  drawGlow(pg, def.color, pool.r * 0.7, 0.006);
  pg.x = pool.x;
  pg.y = pool.y;
  layers.poolGlow.addChild(pg);

  // ── Pool label ──
  var label = new PIXI.Text(def.name, {
    fontFamily: 'monospace',
    fontSize: 10,
    fill: def.color,
  });
  label.anchor.set(0.5);
  label.x = pool.x;
  label.y = pool.y - pool.r - 14;
  label.alpha = 0.65;
  layers.poolBorders.addChild(label);

  // ── Nodes (stars within cluster) ──
  var nCount = randI(3, 7);
  for (var n = 0; n < nCount; n++) {
    var node = new PIXI.Graphics();
    var nr = rand(8, 15);

    // Body
    node.beginFill(0x1f2937);
    node.drawCircle(0, 0, nr);
    node.endFill();
    // Colored ring
    node.lineStyle(1, def.color, 0.45);
    node.drawCircle(0, 0, nr);
    // Bright center dot
    node.beginFill(def.color, 0.35);
    node.drawCircle(0, 0, 3);
    node.endFill();

    node._a = (TAU / nCount) * n + rand(-0.3, 0.3);
    node._d = rand(16, pool.r * 0.55);
    pool.nodes.push(node);
    layers.nodes.addChild(node);

    // Node glow
    var ng = new PIXI.Graphics();
    drawGlow(ng, def.color, nr + 8, 0.035);
    node._glow = ng;
    layers.poolGlow.addChild(ng);
  }

  // ── Pods (orbiting planets) ──
  var pCount = randI(30, 55);
  for (var p = 0; p < pCount; p++) {
    var roll = Math.random();
    var status =
      roll > 0.95
        ? 'oomkilled'
        : roll > 0.9
          ? 'error'
          : roll > 0.82
            ? 'highcpu'
            : roll > 0.72
              ? 'warning'
              : 'healthy';

    if (status === 'error' || status === 'oomkilled') totalFailed++;
    totalPods++;

    var pod = new PIXI.Graphics();
    var ps = rand(1.5, 4);
    var col = statusColor(status);
    pod.beginFill(col);
    pod.drawCircle(0, 0, ps);
    pod.endFill();

    pod._a = rand(0, TAU);
    pod._d = rand(pool.r * 0.15, pool.r + 32);
    pod._spd = rand(0.002, 0.007);
    pod._status = status;

    // Glow halo for non-healthy pods
    if (status !== 'healthy') {
      var podGlow = new PIXI.Graphics();
      drawGlow(podGlow, col, ps + 6, 0.055);
      pod._glow = podGlow;
      layers.poolGlow.addChild(podGlow);
    }

    pool.pods.push(pod);
    layers.pods.addChild(pod);
  }

  pools.push(pool);
});

// ═════════════════════════════════════════
// 6. Warning Triangles (error indicators)
// ═════════════════════════════════════════
pools.forEach(function (pool) {
  var errCount = pool.pods.filter(function (p) {
    return p._status === 'error' || p._status === 'oomkilled';
  }).length;
  if (errCount >= 3) {
    var w = new PIXI.Graphics();
    w.beginFill(0xe74c3c);
    w.moveTo(0, -10);
    w.lineTo(9, 7);
    w.lineTo(-9, 7);
    w.closePath();
    w.endFill();
    // Exclamation mark
    w.beginFill(0xffffff);
    w.drawRect(-1, -5, 2, 6);
    w.drawCircle(0, 4.5, 1.2);
    w.endFill();

    w.x = pool.x;
    w.y = pool.y + pool.r + 18;
    w._pulse = true;
    layers.warnings.addChild(w);
  }
});

// ═════════════════════════════════════════
// 7. UI — Header Bar
// ═════════════════════════════════════════
var hdr = new PIXI.Graphics();
hdr.beginFill(0x0a1628, 0.88);
hdr.drawRoundedRect(10, 8, W - 20, 42, 8);
hdr.endFill();
hdr.lineStyle(1, 0x1e3a5f, 0.4);
hdr.drawRoundedRect(10, 8, W - 20, 42, 8);
layers.ui.addChild(hdr);

// Gear icon
var gear = new PIXI.Graphics();
gear.lineStyle(1.8, 0x7899aa);
gear.drawCircle(34, 29, 6);
for (var ga = 0; ga < TAU; ga += TAU / 8) {
  gear.moveTo(34 + Math.cos(ga) * 5, 29 + Math.sin(ga) * 5);
  gear.lineTo(34 + Math.cos(ga) * 9, 29 + Math.sin(ga) * 9);
}
layers.ui.addChild(gear);

// Title
var titleText = new PIXI.Text('Cluster Overview', {
  fontFamily: 'monospace',
  fontSize: 16,
  fill: 0xecf0f1,
  fontWeight: 'bold',
});
titleText.x = 52;
titleText.y = 17;
layers.ui.addChild(titleText);

// Legend
var legendItems = [
  { l: 'Warnings', c: 0xf1c40f },
  { l: 'Errors', c: 0xe74c3c },
  { l: 'High CPU', c: 0xff9500 },
  { l: 'OOM Killed', c: 0xff6b35 },
];
var lx = Math.max(210, W * 0.36);
legendItems.forEach(function (item) {
  var dot = new PIXI.Graphics();
  dot.beginFill(item.c);
  dot.drawCircle(0, 0, 4);
  dot.endFill();
  dot.x = lx;
  dot.y = 29;
  layers.ui.addChild(dot);

  var txt = new PIXI.Text(item.l, {
    fontFamily: 'monospace',
    fontSize: 11,
    fill: 0xaabbcc,
  });
  txt.x = lx + 8;
  txt.y = 22;
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
srchBg.x = W - 200;
srchBg.y = 16;
layers.ui.addChild(srchBg);

// Magnifying glass icon (drawn)
var magIcon = new PIXI.Graphics();
magIcon.lineStyle(1.5, 0x556677);
magIcon.drawCircle(W - 188, 28, 5);
magIcon.moveTo(W - 184, 32);
magIcon.lineTo(W - 181, 35);
layers.ui.addChild(magIcon);

var srchTxt = new PIXI.Text('Search Pods...', {
  fontFamily: 'monospace',
  fontSize: 11,
  fill: 0x556677,
});
srchTxt.x = W - 175;
srchTxt.y = 20;
layers.ui.addChild(srchTxt);

// Bell icon (notification)
var bellIcon = new PIXI.Graphics();
bellIcon.beginFill(0x7899aa);
bellIcon.moveTo(W - 37, 23);
bellIcon.quadraticCurveTo(W - 37, 17, W - 30, 17);
bellIcon.quadraticCurveTo(W - 23, 17, W - 23, 23);
bellIcon.lineTo(W - 21, 31);
bellIcon.lineTo(W - 39, 31);
bellIcon.closePath();
bellIcon.endFill();
bellIcon.beginFill(0x7899aa);
bellIcon.drawCircle(W - 30, 33, 2);
bellIcon.endFill();
// Red notification dot
bellIcon.beginFill(0xe74c3c);
bellIcon.drawCircle(W - 24, 18, 3);
bellIcon.endFill();
layers.ui.addChild(bellIcon);

// ═════════════════════════════════════════
// 8. UI — Footer Status Bar
// ═════════════════════════════════════════
var ftrW = 500;
var ftrH = 44;
var ftrX = cx - ftrW / 2;
var ftrY = H - 58;

var ftr = new PIXI.Graphics();
ftr.beginFill(0x0a1628, 0.88);
ftr.drawRoundedRect(ftrX, ftrY, ftrW, ftrH, 8);
ftr.endFill();
ftr.lineStyle(1, 0x1e3a5f, 0.4);
ftr.drawRoundedRect(ftrX, ftrY, ftrW, ftrH, 8);
layers.ui.addChild(ftr);

function addMetric(x, label, value, barColor, showBar) {
  var lbl = new PIXI.Text(label + ' ', {
    fontFamily: 'monospace',
    fontSize: 12,
    fill: 0x8899aa,
  });
  lbl.x = x;
  lbl.y = ftrY + (showBar ? 5 : 12);
  layers.ui.addChild(lbl);

  var val = new PIXI.Text(String(value), {
    fontFamily: 'monospace',
    fontSize: 14,
    fill: 0xecf0f1,
    fontWeight: 'bold',
  });
  val.x = x + lbl.width;
  val.y = ftrY + (showBar ? 4 : 11);
  layers.ui.addChild(val);

  if (showBar) {
    var bw = 90;
    var bh = 6;
    var by = ftrY + 28;
    var bg = new PIXI.Graphics();
    bg.beginFill(0x1a2a3a);
    bg.drawRoundedRect(x, by, bw, bh, 3);
    bg.endFill();
    layers.ui.addChild(bg);

    var pct = parseInt(value) / 100;
    var bar = new PIXI.Graphics();
    bar.beginFill(barColor);
    bar.drawRoundedRect(x, by, bw * pct, bh, 3);
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
// 9. Animation Loop
// ═════════════════════════════════════════
app.ticker.add(function (delta) {
  var t = Date.now();

  // ── Star twinkling ──
  for (var i = 0; i < starList.length; i++) {
    var star = starList[i];
    star.alpha = star._br * (0.5 + Math.sin(t * star._tw + star._tp) * 0.5);
  }

  // ── Spiral slow rotation ──
  spiralContainer.rotation += 0.00015 * delta;

  // ── Masters chaotic 3-body orbit ──
  for (var mi = 0; mi < masters.length; mi++) {
    var m = masters[mi];
    m._a += m._spd * delta;
    m.x = cx + Math.cos(m._a) * m._orbitR;
    m.y = cy + Math.sin(m._a * 1.1) * m._orbitR;
    m._glow.x = m.x;
    m._glow.y = m.y;
    // Breathing glow pulse
    var pulse = 1 + Math.sin(t * 0.002 + m._a) * 0.12;
    m._glow.scale.set(pulse);
  }

  // ── Pool nodes & pods ──
  for (var pi = 0; pi < pools.length; pi++) {
    var pool = pools[pi];

    // Nodes: slow drift
    for (var ni = 0; ni < pool.nodes.length; ni++) {
      var node = pool.nodes[ni];
      node._a += 0.0008 * delta;
      node.x = pool.x + Math.cos(node._a) * node._d;
      node.y = pool.y + Math.sin(node._a) * node._d;
      if (node._glow) {
        node._glow.x = node.x;
        node._glow.y = node.y;
      }
    }

    // Pods: orbit
    for (var pj = 0; pj < pool.pods.length; pj++) {
      var pod = pool.pods[pj];
      pod._a += pod._spd * delta;
      pod.x = pool.x + Math.cos(pod._a) * pod._d;
      pod.y = pool.y + Math.sin(pod._a) * pod._d;
      if (pod._glow) {
        pod._glow.x = pod.x;
        pod._glow.y = pod.y;
      }

      // Error / OOM pulse
      if (pod._status === 'error' || pod._status === 'oomkilled') {
        pod.scale.set(1 + Math.sin(t / 150) * 0.35);
      }
      // High CPU flicker
      if (pod._status === 'highcpu') {
        pod.alpha = 0.6 + Math.sin(t / 80) * 0.4;
      }
    }
  }

  // ── Warning triangle pulse ──
  var warnChildren = layers.warnings.children;
  for (var wi = 0; wi < warnChildren.length; wi++) {
    if (warnChildren[wi]._pulse) {
      warnChildren[wi].alpha = 0.5 + Math.sin(t / 300) * 0.5;
    }
  }
});
