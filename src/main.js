import { Game } from './game.js';
import { initAudio } from './audio.js';
import { isTouch } from './input.js';

const $ = (id) => document.getElementById(id);
const KEY = 'dot-bien-settings';
const DEFAULTS = { name: 'Bạn', mode: 'zombie', rule: 'respawn', bots: 9, difficulty: 'normal', sens: 1 };

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) { return { ...DEFAULTS }; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* chế độ riêng tư */ }
}

const settings = load();
let game = null;

if (isTouch) document.body.classList.add('touch');

function seg(id, key, onChange) {
  const el = $(id);
  const btns = el.querySelectorAll('button');
  btns.forEach((b) => {
    b.classList.toggle('on', b.dataset.v === settings[key]);
    b.addEventListener('click', () => {
      settings[key] = b.dataset.v;
      btns.forEach((x) => x.classList.toggle('on', x === b));
      if (onChange) onChange();
    });
  });
}
function slider(input, label, key) {
  input.value = settings[key];
  label.textContent = settings[key];
  input.addEventListener('input', () => { label.textContent = input.value; });
}

$('m-name').value = settings.name;
// luật Deadmatch chỉ hiện khi chọn Đấu đội
const syncRule = () => $('m-rule-wrap').classList.toggle('hidden', settings.mode !== 'tdm');
seg('m-mode', 'mode', syncRule);
seg('m-rule', 'rule');
syncRule();
seg('m-diff', 'difficulty');
slider($('m-bots'), $('m-bots-val'), 'bots');
const fmtSens = (v) => Number(v).toFixed(1);
$('m-sens').value = settings.sens;
$('m-sens-val').textContent = fmtSens(settings.sens);
$('m-sens').addEventListener('input', (e) => {
  settings.sens = +e.target.value;
  $('m-sens-val').textContent = fmtSens(settings.sens);
  save();
});

$('m-play').addEventListener('click', () => {
  settings.name = $('m-name').value.trim().slice(0, 14) || 'Bạn';
  settings.bots = +$('m-bots').value;
  save();
  initAudio();
  if (isTouch && document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
  startGame();
});

function startGame() {
  $('menu').classList.add('hidden');
  $('pause').classList.add('hidden');
  $('hud').classList.remove('hidden');
  game = new Game($('app'), { ...settings }, { onPause: showPause });
  game.start();
  window.__game = game; // tiện debug trong console
  game.input.lock();
}

function showPause() {
  $('p-bots').value = settings.bots;
  $('p-bots-val').textContent = settings.bots;
  $('p-sens').value = settings.sens;
  $('p-sens-val').textContent = fmtSens(settings.sens);
  $('pause').classList.remove('hidden');
}

$('p-bots').addEventListener('input', (e) => { $('p-bots-val').textContent = e.target.value; });
$('p-sens').addEventListener('input', (e) => {
  settings.sens = +e.target.value;
  $('p-sens-val').textContent = fmtSens(settings.sens);
  $('m-sens').value = settings.sens;
  $('m-sens-val').textContent = fmtSens(settings.sens);
  save();
  if (game) game.input.sens = settings.sens;
});
$('p-resume').addEventListener('click', () => {
  $('pause').classList.add('hidden');
  game.resume();
});
$('p-restart').addEventListener('click', () => {
  settings.bots = +$('p-bots').value;
  save();
  game.dispose();
  startGame();
});
$('p-quit').addEventListener('click', () => {
  settings.bots = +$('p-bots').value;
  save();
  game.dispose();
  game = null;
  $('pause').classList.add('hidden');
  $('hud').classList.add('hidden');
  $('m-bots').value = settings.bots;
  $('m-bots-val').textContent = settings.bots;
  $('menu').classList.remove('hidden');
});
