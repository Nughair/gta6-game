// HUD: health, cash, wanted stars, objective, timer, message toasts, crosshair, speed,
// and the 2D canvas minimap. Also owns the title / pause / end screens. Solmar Bay.
import { WORLD } from './config.js';

export class HUD {
  constructor() {
    this.el = (id) => document.getElementById(id);
    this.healthFill = this.el('health-fill');
    this.healthText = this.el('health-text');
    this.cashEl = this.el('cash');
    this.starsEl = this.el('stars');
    this.objectiveEl = this.el('objective');
    this.timerEl = this.el('timer');
    this.messageEl = this.el('message');
    this.speedEl = this.el('speed');
    this.crosshairEl = this.el('crosshair');
    this.minimap = this.el('minimap');
    this.mm = this.minimap.getContext('2d');
    this.toastTimer = 0;
    this.time = 0;
  }

  setHealth(h) {
    const pct = Math.max(0, Math.min(100, h));
    this.healthFill.style.width = `${pct}%`;
    this.healthFill.style.background = pct > 50 ? '#3aa86a' : pct > 25 ? '#d8a03a' : '#d84a4a';
    this.healthText.textContent = `${Math.ceil(pct)}`;
  }

  setCash(c) {
    this.cashEl.textContent = `$${c.toLocaleString('en-US')}`;
  }

  setStars(n) {
    let s = '';
    for (let i = 0; i < 5; i += 1) s += i < n ? '★' : '☆';
    this.starsEl.textContent = s;
    this.starsEl.style.color = n > 0 ? '#ffd23a' : '#5a6270';
  }

  setObjective(text) {
    this.objectiveEl.textContent = text;
  }

  setTimer(text) {
    this.timerEl.textContent = text;
  }

  setSpeed(kmh, inCar) {
    this.speedEl.textContent = inCar ? `${Math.round(Math.abs(kmh))} km/h` : '';
  }

  setCrosshair(on) {
    this.crosshairEl.style.display = on ? 'block' : 'none';
  }

  toast(text, seconds = 5) {
    this.messageEl.textContent = text;
    this.messageEl.style.opacity = '1';
    this.toastTimer = seconds;
  }

  update(dt) {
    this.time += dt;
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.messageEl.style.opacity = '0';
    }
  }

  drawMinimap(state) {
    const ctx = this.mm;
    const S = 200;
    const scale = S / (WORLD.extent * 2 + 20);
    const toX = (x) => S / 2 + x * scale;
    const toY = (z) => S / 2 + z * scale;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(12, 18, 26, 0.85)';
    ctx.fillRect(0, 0, S, S);
    // Water strip (south edge, z below waterZ): the top band of the minimap.
    ctx.fillStyle = '#1e6f9e';
    ctx.fillRect(0, 0, S, toY(WORLD.waterZ));
    // Blocks.
    ctx.fillStyle = '#4a5058';
    for (const bx of WORLD.blockCenters) {
      for (const bz of WORLD.blockCenters) {
        ctx.fillRect(toX(bx - 13), toY(bz - 13), 26 * scale, 26 * scale);
      }
    }
    // Streets.
    ctx.strokeStyle = '#8a929c';
    ctx.lineWidth = 2;
    for (const s of WORLD.streets) {
      ctx.beginPath();
      ctx.moveTo(toX(s), 0);
      ctx.lineTo(toX(s), S);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, toY(s));
      ctx.lineTo(S, toY(s));
      ctx.stroke();
    }
    // Objective marker (pulsing diamond).
    if (state.objective) {
      const pulse = 5 + Math.sin(this.time * 5) * 2;
      const ox = toX(state.objective.x);
      const oy = toY(state.objective.z);
      ctx.fillStyle = '#ffd23a';
      ctx.beginPath();
      ctx.moveTo(ox, oy - pulse);
      ctx.lineTo(ox + pulse, oy);
      ctx.lineTo(ox, oy + pulse);
      ctx.lineTo(ox - pulse, oy);
      ctx.closePath();
      ctx.fill();
    }
    // Mission car.
    if (state.missionCar) {
      ctx.fillStyle = '#3ad8d8';
      ctx.beginPath();
      ctx.arc(toX(state.missionCar.x), toY(state.missionCar.z), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Traffic cars.
    ctx.fillStyle = '#e8e8e8';
    for (const c of state.cars || []) {
      ctx.fillRect(toX(c.x) - 1.5, toY(c.z) - 1.5, 3, 3);
    }
    // Police.
    ctx.fillStyle = '#ff4a3a';
    for (const c of state.police || []) {
      ctx.beginPath();
      ctx.arc(toX(c.x), toY(c.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow.
    const px = toX(state.player.x);
    const py = toY(state.player.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(state.heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, S - 2, S - 2);
  }

  showScreen(name) {
    for (const id of ['title-screen', 'pause-screen', 'end-screen']) {
      this.el(id).classList.toggle('hidden', id !== name);
    }
    this.el('hud').classList.toggle('hidden', name === 'title-screen');
  }

  hideScreens() {
    for (const id of ['title-screen', 'pause-screen', 'end-screen']) {
      this.el(id).classList.add('hidden');
    }
    this.el('hud').classList.remove('hidden');
  }

  setEnd(title, text, buttonLabel) {
    this.el('end-title').textContent = title;
    this.el('end-text').textContent = text;
    this.el('end-button').textContent = buttonLabel;
  }

  setTitleButtons(hasSave) {
    this.el('continue-button').style.display = hasSave ? 'inline-block' : 'none';
  }
}
