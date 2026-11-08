(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const WORLD = W * 4;
  const TOP = 70, GROUND = H - 40;
  const $ = (id) => document.getElementById(id);
  const ui = {
    hud: $('hud'), menu: $('menu'), pause: $('pause'), over: $('over'),
    score: $('score'), wave: $('wave'), lives: $('lives'), humans: $('humans'),
    finalScore: $('finalScore'), finalWave: $('finalWave'),
  };

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

  // ---------- Input ----------
  const keys = {};
  const GAME_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
  addEventListener('keydown', (e) => {
    if (GAME_KEYS.includes(e.code)) e.preventDefault();
    if ((e.code === 'KeyP' || e.code === 'Escape') && !e.repeat) togglePause();
    keys[e.code] = true;
  });
  addEventListener('keyup', (e) => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (state === 'play') togglePause(); });
  const down = (...codes) => codes.some((c) => keys[c]);

  // ---------- Static world ----------
  const stars = [0.08, 0.2, 0.45].flatMap((f, layer) =>
    Array.from({ length: 70 + layer * 20 }, () => ({
      x: rand(0, W), y: rand(0, GROUND - 60), f,
      r: 0.6 + layer * 0.5 + Math.random() * 0.5, tw: rand(0, Math.PI * 2),
    })));

  const SEG = 32;
  const terrain = [];
  for (let i = 0, h = 40; i <= WORLD / SEG + 1; i++) {
    h = clamp(h + rand(-18, 18), 10, 120);
    terrain.push(h);
  }
  for (let pass = 0; pass < 2; pass++)
    for (let i = 1; i < terrain.length - 1; i++)
      terrain[i] = (terrain[i - 1] + terrain[i] * 2 + terrain[i + 1]) / 4;
  const groundY = (x) => {
    const i = clamp(Math.floor(x / SEG), 0, terrain.length - 2);
    const t = clamp(x / SEG - i, 0, 1);
    return GROUND - (terrain[i] * (1 - t) + terrain[i + 1] * t);
  };

  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, '#02020c');
  bgGrad.addColorStop(0.7, '#0a0626');
  bgGrad.addColorStop(1, '#1a0634');

  // ---------- Game state ----------
  let state = 'menu';
  let player, bullets, enemyShots, enemies, humans, particles;
  let score, lives, wave, toSpawn, spawnTimer, banner, shake, camX, deathTimer, time = 0;

  function resetGame() {
    player = { x: WORLD / 2, y: H / 2, vx: 0, vy: 0, dir: 1, inv: 2, cool: 0, dead: false };
    bullets = []; enemyShots = []; enemies = []; particles = [];
    humans = Array.from({ length: 10 }, (_, i) => {
      const x = (i + 0.5) * (WORLD / 10) + rand(-120, 120);
      return { x, y: groundY(x), state: 'ground', carrier: null, phase: rand(0, 6) };
    });
    score = 0; lives = 3; wave = 0; shake = 0; deathTimer = 0;
    camX = player.x - W / 2;
    nextWave();
  }

  function nextWave() {
    wave++;
    toSpawn = 4 + wave * 2;
    spawnTimer = 1.5;
    banner = 2.2;
  }

  function startGame() {
    resetGame();
    state = 'play';
    ui.menu.classList.add('hidden');
    ui.over.classList.add('hidden');
    ui.pause.classList.add('hidden');
    ui.hud.classList.remove('hidden');
    canvas.focus();
  }

  function togglePause() {
    if (state === 'play') { state = 'pause'; ui.pause.classList.remove('hidden'); }
    else if (state === 'pause') { state = 'play'; ui.pause.classList.add('hidden'); }
  }

  function gameOver() {
    state = 'over';
    ui.finalScore.textContent = score;
    ui.finalWave.textContent = wave;
    ui.over.classList.remove('hidden');
  }

  $('startBtn').addEventListener('click', startGame);
  $('restartBtn').addEventListener('click', startGame);

  // ---------- Effects ----------
  function explode(x, y, color, n = 24, speed = 260) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), s = rand(0.2, 1) * speed;
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.4, 0.9), max: 0.9, color, size: rand(1.5, 3.5) });
    }
  }

  // ---------- Entities ----------
  function spawnEnemy() {
    let x;
    do { x = rand(100, WORLD - 100); } while (Math.abs(x - player.x) < 600);
    const speed = 80 + wave * 12;
    enemies.push({
      x, y: rand(TOP + 30, GROUND - 220), vx: (Math.random() < 0.5 ? -1 : 1) * speed, vy: 0,
      speed, mode: 'roam', target: null, think: rand(1, 4), fire: rand(1.5, 3.5), t: rand(0, 6),
    });
    explode(x, enemies[enemies.length - 1].y, '#b400ff', 14, 120);
  }

  function killEnemy(e, i) {
    explode(e.x, e.y, '#ff2a6d', 28);
    explode(e.x, e.y, '#ff9de2', 10, 140);
    shake = Math.min(shake + 6, 12);
    score += 150;
    if (e.target) {
      const h = e.target;
      if (h.state === 'taken') { h.state = 'falling'; h.carrier = null; }
      else if (h.state === 'ground') h.carrier = null;
    }
    enemies.splice(i, 1);
  }

  function hitPlayer() {
    if (player.inv > 0 || player.dead) return;
    lives--;
    explode(player.x, player.y, '#00e5ff', 40, 320);
    shake = 14;
    if (lives <= 0) { player.dead = true; deathTimer = 1.4; }
    else player.inv = 2.2;
  }

  // ---------- Update ----------
  function update(dt) {
    time += dt;
    if (state === 'menu') { camX += 60 * dt; return; }
    if (state !== 'play') return;

    // player
    const p = player;
    if (!p.dead) {
      const boost = down('ShiftLeft', 'ShiftRight');
      const maxV = boost ? 760 : 440;
      const ix = (down('KeyD', 'ArrowRight') ? 1 : 0) - (down('KeyA', 'ArrowLeft') ? 1 : 0);
      const iy = (down('KeyS', 'ArrowDown') ? 1 : 0) - (down('KeyW', 'ArrowUp') ? 1 : 0);
      if (ix) { p.vx += ix * (boost ? 2600 : 1700) * dt; p.dir = ix; }
      else p.vx *= Math.pow(0.08, dt);
      p.vx = clamp(p.vx, -maxV, maxV);
      p.vy += (iy * 340 - p.vy) * Math.min(1, 12 * dt);
      p.x = clamp(p.x + p.vx * dt, 30, WORLD - 30);
      p.y = clamp(p.y + p.vy * dt, TOP, GROUND - 24);
      if (p.x <= 30 || p.x >= WORLD - 30) p.vx = 0;
      p.inv = Math.max(0, p.inv - dt);
      p.cool -= dt;
      if (down('Space') && p.cool <= 0) {
        p.cool = 0.13;
        bullets.push({ x: p.x + p.dir * 26, y: p.y + 2, vx: p.dir * 1300 + p.vx, life: 0.75 });
      }
    } else if ((deathTimer -= dt) <= 0) { gameOver(); return; }

    // camera (leads in facing direction)
    const targetCam = clamp(p.x - W / 2 + p.dir * 180, 0, WORLD - W);
    camX += (targetCam - camX) * Math.min(1, 4 * dt);

    // spawning / waves
    if (toSpawn > 0 && (spawnTimer -= dt) <= 0) {
      spawnEnemy(); toSpawn--;
      spawnTimer = Math.max(0.5, 2.2 - wave * 0.15);
    }
    if (toSpawn === 0 && enemies.length === 0 && !p.dead) nextWave();
    banner = Math.max(0, banner - dt);

    // player bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx * dt; b.life -= dt;
      let hit = false;
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (Math.abs(e.y - b.y) < 16 && Math.abs(e.x - b.x) < 22 + Math.abs(b.vx) * dt) {
          killEnemy(e, j); hit = true; break;
        }
      }
      if (hit || b.life <= 0 || b.x < 0 || b.x > WORLD) bullets.splice(i, 1);
    }

    // enemies
    const fireRate = Math.max(1.2, 3.5 - wave * 0.2);
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      e.t += dt;
      if (e.mode === 'roam') {
        e.vy = Math.sin(e.t * 2) * 60;
        if (e.x < 60 || e.x > WORLD - 60) e.vx = -e.vx;
        if ((e.think -= dt) <= 0) {
          e.think = rand(2, 5);
          const free = humans.filter((h) => h.state === 'ground' && !h.carrier);
          if (free.length && Math.random() < 0.35 + wave * 0.05) {
            const h = free.reduce((a, c) => (Math.abs(c.x - e.x) < Math.abs(a.x - e.x) ? c : a));
            e.target = h; h.carrier = e; e.mode = 'seek';
          }
        }
      } else if (e.mode === 'seek') {
        const h = e.target;
        const dx = h.x - e.x, dy = h.y - 22 - e.y, d = Math.hypot(dx, dy) || 1;
        e.vx = (dx / d) * e.speed * 1.2; e.vy = (dy / d) * e.speed * 1.2;
        if (d < 8) { e.mode = 'lift'; h.state = 'taken'; }
      } else if (e.mode === 'lift') {
        e.vx = 0; e.vy = -(35 + wave * 4);
        const h = e.target;
        h.x = e.x; h.y = e.y + 22;
        if (e.y < TOP + 10) {
          h.state = 'dead';
          explode(h.x, h.y, '#ffe680', 20, 160);
          e.target = null; e.mode = 'roam'; e.vx = (Math.random() < 0.5 ? -1 : 1) * e.speed * 1.3;
        }
      }
      e.x += e.vx * dt;
      e.y = clamp(e.y + e.vy * dt, TOP, GROUND - 20);

      // enemy fire when on screen
      if ((e.fire -= dt) <= 0) {
        e.fire = rand(fireRate, fireRate * 1.8);
        if (!p.dead && Math.abs(e.x - p.x) < W * 0.6) {
          const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1, s = 240 + wave * 10;
          enemyShots.push({ x: e.x, y: e.y, vx: (dx / d) * s, vy: (dy / d) * s, life: 3 });
        }
      }
      if (!p.dead && dist2(e, p) < 26 * 26 && p.inv <= 0) { hitPlayer(); killEnemy(e, i); }
    }

    // enemy shots
    for (let i = enemyShots.length - 1; i >= 0; i--) {
      const s = enemyShots[i];
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      let gone = s.life <= 0 || s.y > GROUND;
      if (!gone && !p.dead && p.inv <= 0 && dist2(s, p) < 18 * 18) { hitPlayer(); gone = true; }
      if (gone) enemyShots.splice(i, 1);
    }

    // humans
    for (const h of humans) {
      if (h.state === 'falling') {
        h.y += 130 * dt;
        const gy = groundY(h.x);
        if (h.y >= gy) { h.y = gy; h.state = 'ground'; score += 250; explode(h.x, h.y - 6, '#7dffb2', 12, 100); }
      }
    }
    if (humans.every((h) => h.state === 'dead') && !p.dead) { p.dead = true; deathTimer = 1.2; }

    // particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const q = particles[i];
      q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.97; q.vy *= 0.97; q.life -= dt;
      if (q.life <= 0) particles.splice(i, 1);
    }
    shake = Math.max(0, shake - 40 * dt);
  }

  // ---------- Render ----------
  function drawStars() {
    for (const s of stars) {
      const x = (((s.x - camX * s.f) % W) + W) % W;
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(time * 2 + s.tw);
      ctx.fillStyle = s.f > 0.3 ? '#cfefff' : '#9a8cff';
      ctx.fillRect(x, s.y, s.r, s.r);
    }
    ctx.globalAlpha = 1;
  }

  function drawTerrain(cx) {
    const start = Math.max(0, Math.floor(cx / SEG) - 1);
    const end = Math.min(terrain.length - 1, Math.ceil((cx + W) / SEG) + 1);
    ctx.beginPath();
    ctx.moveTo(start * SEG - cx, H);
    for (let i = start; i <= end; i++) ctx.lineTo(i * SEG - cx, GROUND - terrain[i]);
    ctx.lineTo(end * SEG - cx, H);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, GROUND - 120, 0, H);
    g.addColorStop(0, '#2a0b4a'); g.addColorStop(1, '#0a0216');
    ctx.fillStyle = g; ctx.fill();
    ctx.beginPath();
    for (let i = start; i <= end; i++) ctx.lineTo(i * SEG - cx, GROUND - terrain[i]);
    ctx.strokeStyle = '#c04bff'; ctx.lineWidth = 2;
    ctx.shadowColor = '#b400ff'; ctx.shadowBlur = 12;
    ctx.stroke(); ctx.shadowBlur = 0;
  }

  function drawShip(x, y, dir, thrust) {
    ctx.save();
    ctx.translate(x, y); ctx.scale(dir, 1);
    if (thrust) {
      const fl = 10 + Math.random() * (thrust > 1 ? 22 : 10);
      ctx.fillStyle = thrust > 1 ? '#ff4fd8' : '#ff9a3c';
      ctx.beginPath(); ctx.moveTo(-18, -4); ctx.lineTo(-18 - fl, 0); ctx.lineTo(-18, 4); ctx.fill();
    }
    ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 16;
    ctx.fillStyle = '#062a3a'; ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(26, 2); ctx.lineTo(4, -8); ctx.lineTo(-10, -14); ctx.lineTo(-18, -12);
    ctx.lineTo(-14, -3); ctx.lineTo(-18, 8); ctx.lineTo(10, 8); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#bff8ff';
    ctx.beginPath(); ctx.ellipse(6, -2, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawEnemy(e, cx) {
    const x = e.x - cx, y = e.y;
    if (e.mode === 'lift') {
      ctx.fillStyle = 'rgba(255, 42, 109, 0.18)';
      ctx.beginPath(); ctx.moveTo(x - 6, y + 6); ctx.lineTo(x + 6, y + 6);
      ctx.lineTo(x + 14, y + 34); ctx.lineTo(x - 14, y + 34); ctx.fill();
    }
    const pulse = 0.6 + 0.4 * Math.sin(e.t * 8);
    ctx.save(); ctx.translate(x, y);
    ctx.shadowColor = '#ff2a6d'; ctx.shadowBlur = 14;
    ctx.fillStyle = '#2a0420'; ctx.strokeStyle = '#ff2a6d'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-20, 2); ctx.lineTo(-8, -10); ctx.lineTo(8, -10); ctx.lineTo(20, 2);
    ctx.lineTo(10, 10); ctx.lineTo(-10, 10); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#b400ff'; ctx.beginPath(); ctx.moveTo(-20, 2); ctx.lineTo(20, 2); ctx.stroke();
    ctx.fillStyle = `rgba(255, 80, 220, ${pulse})`;
    ctx.beginPath(); ctx.arc(0, -3, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawHuman(h, cx) {
    if (h.state === 'dead') return;
    const x = h.x - cx, y = h.y;
    if (x < -20 || x > W + 20) return;
    const arm = h.state === 'taken' ? Math.sin(time * 14) * 3 : 0;
    ctx.fillStyle = h.state === 'ground' ? '#ffe680' : '#ffb347';
    ctx.fillRect(x - 2, y - 12, 4, 8);
    ctx.fillRect(x - 3 - arm, y - 11, 1.5, 5);
    ctx.fillRect(x + 1.5 + arm, y - 11, 1.5, 5);
    ctx.fillRect(x - 2, y - 4, 1.5, 4);
    ctx.fillRect(x + 0.5, y - 4, 1.5, 4);
    ctx.beginPath(); ctx.arc(x, y - 15, 2.5, 0, Math.PI * 2); ctx.fill();
  }

  function drawRadar() {
    const rw = 360, rh = 40, rx = (W - rw) / 2, ry = 52;
    ctx.fillStyle = 'rgba(0, 10, 30, 0.6)'; ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.5)'; ctx.lineWidth = 1; ctx.strokeRect(rx, ry, rw, rh);
    const sx = rw / WORLD, sy = rh / H;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.strokeRect(rx + camX * sx, ry, W * sx, rh);
    for (const h of humans) if (h.state !== 'dead') { ctx.fillStyle = '#ffe680'; ctx.fillRect(rx + h.x * sx - 1, ry + h.y * sy - 1, 2, 2); }
    for (const e of enemies) { ctx.fillStyle = e.mode === 'lift' ? '#ffffff' : '#ff2a6d'; ctx.fillRect(rx + e.x * sx - 1.5, ry + e.y * sy - 1.5, 3, 3); }
    if (!player.dead) { ctx.fillStyle = '#00e5ff'; ctx.fillRect(rx + player.x * sx - 2, ry + player.y * sy - 2, 4, 4); }
  }

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, W, H);
    if (shake > 0) ctx.translate(rand(-shake, shake) * 0.5, rand(-shake, shake) * 0.5);
    const cx = camX;
    drawStars();
    if (state === 'menu') {
      drawTerrain(((cx % (WORLD - W)) + (WORLD - W)) % (WORLD - W));
      return;
    }
    drawTerrain(cx);
    for (const h of humans) drawHuman(h, cx);
    for (const e of enemies) if (e.x - cx > -40 && e.x - cx < W + 40) drawEnemy(e, cx);

    // lasers
    ctx.lineCap = 'round';
    for (const b of bullets) {
      const x = b.x - cx, tail = -Math.sign(b.vx) * 60;
      const g = ctx.createLinearGradient(x, 0, x + tail, 0);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, '#00e5ff'); g.addColorStop(1, 'rgba(0,229,255,0)');
      ctx.strokeStyle = g; ctx.lineWidth = 3;
      ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.moveTo(x, b.y); ctx.lineTo(x + tail, b.y); ctx.stroke();
    }
    ctx.shadowBlur = 0;
    for (const s of enemyShots) {
      ctx.fillStyle = '#ff4fd8';
      ctx.beginPath(); ctx.arc(s.x - cx, s.y, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255, 79, 216, 0.25)';
      ctx.beginPath(); ctx.arc(s.x - cx, s.y, 8, 0, Math.PI * 2); ctx.fill();
    }

    if (!player.dead && !(player.inv > 0 && Math.floor(time * 12) % 2)) {
      const moving = down('KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight');
      drawShip(player.x - cx, player.y, player.dir, moving ? (down('ShiftLeft', 'ShiftRight') ? 2 : 1) : 0);
    }

    ctx.globalCompositeOperation = 'lighter';
    for (const q of particles) {
      ctx.globalAlpha = Math.max(0, q.life / q.max);
      ctx.fillStyle = q.color;
      ctx.fillRect(q.x - cx - q.size / 2, q.y - q.size / 2, q.size, q.size);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawRadar();
    if (banner > 0) {
      ctx.globalAlpha = Math.min(1, banner);
      ctx.font = 'bold 64px "Courier New", monospace'; ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff'; ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 24;
      ctx.fillText(`WAVE ${wave}`, W / 2, H / 2 - 40);
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }
  }

  function updateHud() {
    ui.score.textContent = score;
    ui.wave.textContent = wave;
    ui.lives.textContent = '\u25B2'.repeat(Math.max(0, lives)) || '0';
    ui.humans.textContent = humans.filter((h) => h.state !== 'dead').length;
  }

  // ---------- Loop ----------
  resetGame();
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render();
    if (state !== 'menu') updateHud();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.__game = { get state() { return state; }, get player() { return player; }, get enemies() { return enemies; }, get humans() { return humans; }, get lives() { return lives; }, set lives(v) { lives = v; } };
})();
