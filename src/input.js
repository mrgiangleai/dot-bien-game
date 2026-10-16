import { blankCmd } from './actor.js';

export const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const $ = (id) => document.getElementById(id);

// Đọc bàn phím/chuột hoặc cảm ứng và tạo lệnh điều khiển cho người chơi.
export class LocalInput {
  constructor(canvas, { sens = 1, onPause }) {
    this.canvas = canvas;
    this.sens = sens;
    this.onPause = onPause;
    this.isTouch = isTouch;
    this.yaw = 0; this.pitch = -0.05;
    this.keys = new Set();
    this.fireHeld = false; this.aimHeld = false; this.aimToggle = false;
    this.jumpQ = false; this.reloadQ = false; this.throwQ = false; this.slotQ = null;
    this.locked = false;
    this.firstPerson = false;
    this.joyId = null; this.joyX = 0; this.joyY = 0;
    this.looks = new Map();
    this.listeners = [];
    this.bind();
  }

  on(el, ev, fn, opt) {
    if (!el) return;
    el.addEventListener(ev, fn, opt);
    this.listeners.push([el, ev, fn, opt]);
  }

  lock() {
    if (this.isTouch) return;
    try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* bỏ qua */ }
  }

  rotate(dx, dy) {
    this.yaw -= dx * this.sens;
    this.pitch = Math.max(-1.25, Math.min(1.25, this.pitch - dy * this.sens));
  }

  clearHeld() {
    this.keys.clear();
    this.fireHeld = this.aimHeld = false;
    this.jumpQ = this.reloadQ = this.throwQ = false;
    this.slotQ = null;
    this.joyId = null; this.joyX = this.joyY = 0;
    this.looks.clear();
    const st = $('stick');
    if (st) st.style.transform = '';
  }

  bind() {
    const c = this.canvas;
    this.on(document, 'keydown', (e) => {
      if (e.target && e.target.tagName === 'INPUT') return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      switch (e.code) {
        case 'Space': this.jumpQ = true; break;
        case 'KeyR': this.reloadQ = true; break;
        case 'Digit1': this.slotQ = 'rifle'; break;
        case 'Digit2': this.slotQ = 'knife'; break;
        case 'Digit3': this.slotQ = 'grenade'; break;
        case 'KeyG': this.throwQ = true; break;
        case 'KeyV': this.firstPerson = !this.firstPerson; break;
        case 'Escape': case 'KeyP': this.onPause(); break;
      }
    });
    this.on(document, 'keyup', (e) => this.keys.delete(e.code));
    this.on(window, 'blur', () => this.clearHeld());
    this.on(c, 'click', () => { if (!this.locked) this.lock(); });
    this.on(document, 'pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === c;
      document.body.classList.toggle('locked', this.locked);
      if (was && !this.locked) { this.fireHeld = this.aimHeld = false; this.onPause(); }
    });
    this.on(document, 'mousemove', (e) => {
      if (this.locked) this.rotate(e.movementX * 0.0022, e.movementY * 0.0022);
    });
    this.on(document, 'mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.fireHeld = true;
      if (e.button === 2) this.aimHeld = true;
    });
    this.on(document, 'mouseup', (e) => {
      if (e.button === 0) this.fireHeld = false;
      if (e.button === 2) this.aimHeld = false;
    });
    this.on(document, 'contextmenu', (e) => e.preventDefault());
    this.on(document, 'wheel', (e) => {
      if (!this.locked) return;
      const order = ['rifle', 'knife', 'grenade'];
      const cur = order.indexOf(this.lastSlot || 'rifle');
      this.slotQ = order[(cur + (e.deltaY > 0 ? 1 : 2)) % 3];
    });

    const tap = this.isTouch ? 'touchstart' : 'click';
    document.querySelectorAll('#slots .slot').forEach((el) => {
      this.on(el, tap, (e) => { e.preventDefault(); e.stopPropagation(); this.slotQ = el.dataset.slot; }, { passive: false });
    });
    this.on($('btn-settings'), tap, (e) => { e.preventDefault(); e.stopPropagation(); this.onPause(); }, { passive: false });
    if (this.isTouch) this.bindTouch();
  }

  bindTouch() {
    const joyZone = $('joy-zone'), joy = $('joystick'), stick = $('stick');
    const opt = { passive: false };
    const updateJoy = (t) => {
      const r = joy.getBoundingClientRect();
      const R = r.width / 2;
      let dx = t.clientX - (r.left + R), dy = t.clientY - (r.top + R);
      const len = Math.hypot(dx, dy);
      if (len > R) { dx *= R / len; dy *= R / len; }
      this.joyX = dx / R; this.joyY = dy / R;
      stick.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    this.on(joyZone, 'touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      if (this.joyId !== null) return;
      this.joyId = t.identifier;
      updateJoy(t);
    }, opt);
    const startLook = (e) => {
      for (const t of e.changedTouches) this.looks.set(t.identifier, { x: t.clientX, y: t.clientY });
    };
    this.on($('look-zone'), 'touchstart', (e) => { e.preventDefault(); startLook(e); }, opt);
    this.on($('t-fire'), 'touchstart', (e) => { e.preventDefault(); this.fireHeld = true; this.fireId = e.changedTouches[0].identifier; startLook(e); }, opt);
    this.on($('t-view'), 'touchstart', (e) => { e.preventDefault(); this.firstPerson = !this.firstPerson; }, opt);
    this.on($('t-jump'), 'touchstart', (e) => { e.preventDefault(); this.jumpQ = true; }, opt);
    this.on($('t-reload'), 'touchstart', (e) => { e.preventDefault(); this.reloadQ = true; }, opt);
    this.on($('t-aim'), 'touchstart', (e) => {
      e.preventDefault();
      this.aimToggle = !this.aimToggle;
      $('t-aim').classList.toggle('on', this.aimToggle);
    }, opt);

    this.on(document, 'touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joyId) { updateJoy(t); continue; }
        const l = this.looks.get(t.identifier);
        if (l) {
          this.rotate((t.clientX - l.x) * 0.006, (t.clientY - l.y) * 0.006);
          l.x = t.clientX; l.y = t.clientY;
        }
      }
      e.preventDefault();
    }, opt);
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joyId) { this.joyId = null; this.joyX = this.joyY = 0; stick.style.transform = ''; }
        if (t.identifier === this.fireId) { this.fireHeld = false; this.fireId = null; }
        this.looks.delete(t.identifier);
      }
    };
    this.on(document, 'touchend', end);
    this.on(document, 'touchcancel', end);
  }

  sample() {
    let mx = this.joyX, mz = -this.joyY;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) mz += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) mz -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    const l = Math.hypot(mx, mz);
    if (l > 1) { mx /= l; mz /= l; }
    const cmd = blankCmd(this.yaw, this.pitch);
    cmd.move.x = mx; cmd.move.z = mz;
    cmd.jump = this.jumpQ;
    cmd.fire = this.fireHeld;
    cmd.aim = this.aimHeld || this.aimToggle;
    cmd.reload = this.reloadQ;
    cmd.slot = this.slotQ;
    cmd.throw = this.throwQ;
    this.jumpQ = this.reloadQ = this.throwQ = false;
    this.slotQ = null;
    return cmd;
  }

  dispose() {
    for (const [el, ev, fn, opt] of this.listeners) el.removeEventListener(ev, fn, opt);
    this.listeners = [];
    if (document.pointerLockElement) document.exitPointerLock();
    document.body.classList.remove('locked');
  }
}
