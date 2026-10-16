import { MAP_HALF, MODES } from './config.js';
import { isTouch } from './input.js';

const $ = (id) => document.getElementById(id);
const fmtTime = (s) => {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export class Hud {
  constructor(game) {
    this.g = game;
    this.cache = {};
    this.frame = 0;
    this.bannerT = 0;
    this.hurtV = 0;
    this.hitT = 0;
    this.mm = $('minimap').getContext('2d');
    $('killfeed').innerHTML = '';
    $('banner').classList.remove('show');
  }

  set(key, val, html = false) {
    if (this.cache[key] === val) return;
    this.cache[key] = val;
    const el = $(key);
    if (html) el.innerHTML = val; else el.textContent = val;
  }

  toggle(key, cls, on) {
    const k = key + '.' + cls;
    if (this.cache[k] === on) return;
    this.cache[k] = on;
    $(key).classList.toggle(cls, on);
  }

  teamCounts() {
    const g = this.g;
    let a = 0, b = 0;
    for (const x of g.actors) {
      if (g.mode === 'zombie') {
        if (x.kind === 'human' && x.alive) a++;
        else if (x.kind === 'zombie' && !x.eliminated) b++;
      } else if (g.deadmatch && !x.alive) continue; // deadmatch: chỉ đếm người còn sống
      else if (x.team === 'blue') a++;
      else b++;
    }
    return [a, b];
  }

  hint() {
    const g = this.g, p = g.player;
    if (g.phase === 'safe') return `Vùng an toàn · chuẩn bị trong <kbd>${Math.ceil(g.timer)}</kbd> giây (chưa thể bắn)`;
    if (g.mode === 'zombie') {
      if (g.phase === 'prep') return `Đột biến xuất hiện sau <kbd>${Math.ceil(g.timer)}</kbd> giây · tìm chỗ phòng thủ`;
      if (g.phase === 'end') return 'Vòng mới sắp bắt đầu…';
      if (p.downed) return `Bạn bị hạ gục · hồi sinh sau <kbd>${Math.ceil(p.downTimer)}</kbd>s`;
      if (p.eliminated) return 'Bạn đã bị kết liễu · đang xem đồng đội';
      if (p.kind === 'zombie') return isTouch ? 'Lây nhiễm con người · bấm <kbd>BẮN</kbd> để cào' : 'Lây nhiễm con người · <kbd>Chuột trái</kbd> để cào';
      return 'Sống sót · dùng <kbd>2</kbd> kết liễu đột biến bằng dao';
    }
    if (g.phase === 'end') return 'Trận mới sắp bắt đầu…';
    if (g.deadmatch) {
      if (!p.alive) return 'Bạn đã bị hạ · đang xem đồng đội đến hết vòng';
      return 'Deadmatch · không hồi sinh · hạ hết đội địch để thắng';
    }
    if (!p.alive) return `Hồi sinh sau <kbd>${Math.ceil(p.respawnTimer)}</kbd>s`;
    return `Hạ gục đối thủ · đội đạt <kbd>${MODES.tdm.killTarget}</kbd> điểm thắng`;
  }

  update(dt) {
    const g = this.g, p = g.player, M = MODES[g.mode];
    this.frame++;
    const [a, b] = this.teamCounts();
    this.set('cnt-a', String(a));
    this.set('cnt-b', String(b));
    this.set('lbl-a', M.teamA);
    this.set('lbl-b', M.teamB);
    this.set('score', `${g.score[0]} : ${g.score[1]}`);
    const sec = Math.ceil(g.timer);
    this.set('modeline', g.phase === 'safe' ? `${g.label} · AN TOÀN ${sec}` : g.phase === 'prep' ? `${g.label} · CHUẨN BỊ ${sec}` : `${g.label} · ${fmtTime(g.timer)}`);

    const hp = Math.max(0, Math.ceil(p.hp));
    this.set('hp-text', String(hp));
    $('hp-fill').style.width = `${(100 * Math.max(0, p.hp)) / p.maxHp}%`;
    this.toggle('health', 'zombie', p.kind === 'zombie');

    const human = p.kind === 'human';
    this.toggle('slots', 'hidden', !human);
    this.toggle('ammo', 'hidden', !human || !p.alive);
    if (human) {
      let txt;
      if (p.hasGun) txt = p.reloadTimer > 0 ? '<small>ĐANG NẠP…</small>' : `${p.ammo}<small>/${p.reserve}</small>`;
      else if (p.slot === 'knife') txt = '<small>DAO</small>';
      else txt = `${p.grenades}<small> LỰU ĐẠN</small>`;
      this.set('ammo', txt, true);
      for (const s of ['rifle', 'knife', 'grenade', 'sniper']) this.toggle('slot-' + s, 'active', p.slot === s);
      this.toggle('slot-grenade', 'empty', p.grenades <= 0);
      this.set('gren-count', String(p.grenades));
    }
    this.set('hint', this.hint(), true);
    this.toggle('crosshair', 'aim', p.aiming);

    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) $('banner').classList.remove('show');
    }
    if (this.hurtV > 0) {
      this.hurtV = Math.max(0, this.hurtV - dt * 1.5);
      $('damage-vignette').style.opacity = this.hurtV;
    }
    if (this.hitT > 0) {
      this.hitT -= dt;
      if (this.hitT <= 0) $('hitmarker').className = '';
    }
    if (this.frame % 2 === 0) this.drawMinimap();
    const board = g.input.boardHeld || g.input.boardToggle;
    this.toggle('scoreboard', 'hidden', !board);
    if (board && this.frame % 6 === 0) this.drawBoard();
  }

  // bảng người chơi: 2 cột theo phe, có máu và hạ gục / bị hạ
  drawBoard() {
    const g = this.g, me = g.player, M = MODES[g.mode];
    const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    const groups = g.mode === 'zombie'
      ? [[M.teamA, 'blue', g.actors.filter((a) => a.kind === 'human')], [M.teamB, 'red', g.actors.filter((a) => a.kind === 'zombie')]]
      : [[`ĐỘI ${M.teamA}`, 'blue', g.actors.filter((a) => a.team === 'blue')], [`ĐỘI ${M.teamB}`, 'red', g.actors.filter((a) => a.team === 'red')]];
    const status = (a) => a.eliminated ? 'BỊ LOẠI' : a.downed ? 'HẠ GỤC' : !a.alive ? 'CHẾT' : '';
    const col = ([title, cls, list]) => {
      list.sort((x, y) => y.kills - x.kills || x.deaths - y.deaths);
      const rows = list.map((a) => {
        const hp = a.alive && !a.downed ? Math.max(0, Math.ceil(a.hp)) : 0;
        const pct = a.maxHp ? (100 * hp) / a.maxHp : 0;
        const st = status(a);
        return `<tr class="${a === me ? 'me' : ''}${st ? ' off' : ''}">
          <td class="nm">${esc(a.name)}${a === me ? ' <em>(bạn)</em>' : ''}</td>
          <td class="hp">${st ? `<span class="st">${st}</span>` : `<div class="hbar"><i style="width:${pct}%"></i></div><span>${hp}</span>`}</td>
          <td class="k">${a.kills}</td><td class="d">${a.deaths}</td></tr>`;
      }).join('');
      return `<div class="team ${cls}"><h3>${title}<span>${list.length}</span></h3>
        <table><thead><tr><th>Người chơi</th><th>Máu</th><th>Hạ</th><th>Chết</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    };
    $('scoreboard').innerHTML = `<div class="sb-head">${g.label} · ${g.score[0]} : ${g.score[1]}</div><div class="sb-cols">${groups.map(col).join('')}</div>`;
  }

  drawMinimap() {
    const g = this.g, ctx = this.mm, S = ctx.canvas.width;
    const k = S / (MAP_HALF * 2 + 2);
    const m = (v) => (v + MAP_HALF + 1) * k;
    ctx.fillStyle = '#d9c08f';
    ctx.fillRect(0, 0, S, S);
    const pl = g.world.pool;
    ctx.fillStyle = '#6fb3e0';
    ctx.fillRect(m(pl.x), m(pl.z), pl.w * k, pl.d * k);
    for (const b of g.world.boxes) {
      ctx.fillStyle = b.stair ? '#c9a46a' : b.maxY > 2 ? '#3b3b3b' : '#a88a5c';
      ctx.fillRect(m(b.minX), m(b.minZ), (b.maxX - b.minX) * k, (b.maxZ - b.minZ) * k);
    }
    const me = g.player;
    for (const a of g.actors) {
      if (a === me || !a.alive) continue;
      const ally = a.team === me.team;
      ctx.fillStyle = a.downed ? '#ffcc33' : ally ? '#3d8bff' : a.kind === 'zombie' ? '#e83a2a' : '#ff6a3a';
      ctx.beginPath();
      ctx.arc(m(a.pos.x), m(a.pos.z), 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // người chơi: mũi tên
    ctx.save();
    ctx.translate(m(me.pos.x), m(me.pos.z));
    ctx.rotate(-me.yaw);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2); ctx.lineTo(-5, 5); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  feed(att, victim, verb) {
    const el = document.createElement('div');
    el.className = 'feed';
    const me = this.g.player;
    const name = (a) => {
      const b = document.createElement('b');
      b.textContent = a ? a.name : '???';
      if (a) b.className = a === me ? 'me' : a.team === me.team ? 'ally' : 'enemy';
      return b;
    };
    const v = document.createElement('span');
    v.textContent = ` ${verb} `;
    if (att) el.append(name(att));
    el.append(v, name(victim));
    const box = $('killfeed');
    box.prepend(el);
    while (box.children.length > 5) box.lastChild.remove();
    setTimeout(() => el.remove(), 5000);
  }

  banner(title, sub = '', dur = 3) {
    const el = $('banner');
    el.innerHTML = '';
    const h = document.createElement('h2');
    h.textContent = title;
    const p = document.createElement('p');
    p.textContent = sub;
    el.append(h, p);
    el.classList.add('show');
    this.bannerT = dur;
  }

  hitmarker(head) {
    $('hitmarker').className = head ? 'show head' : 'show';
    this.hitT = 0.12;
  }

  hurt() { this.hurtV = Math.min(0.8, this.hurtV + 0.35); }
}

