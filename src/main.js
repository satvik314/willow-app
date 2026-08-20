import './style.css';
import { PHILS, SAFETY } from './philosophers.js';
import { askGemini, getApiKey, setApiKey } from './gemini.js';

/* ---------------- glyphs ---------------- */
var GLYPHS = {
  cup:'<path d="M4.5 9h15c0 4.1-3.4 7-7.5 7S4.5 13.1 4.5 9Z"/><path d="M12 16v3.5M8.5 19.5h7"/><path d="M4.5 10.5C3 11 2.5 12 3 13M19.5 10.5c1.5.5 2 1.5 1.5 2.5"/>',
  laurel:'<path d="M12 21V5"/><path d="M12 16c-4 0-6-2-6-5.5 3.4 0 6 2 6 5.5Z"/><path d="M12 11c4 0 6-2 6-5.5-3.4 0-6 2-6 5.5Z"/>',
  quill:'<path d="M19 4c1 7.5-4.2 12.5-11 12.5C8.3 9.6 12.5 5 19 4Z"/><path d="M4.5 20 11 13.5"/>',
  lamp:'<path d="M3.5 14.5c0-2.5 2.6-4 6-4h2.8c3.2 0 4.7 1.6 4.7 4S15 18 12.3 18H9.5c-3.4 0-6-1-6-3.5Z"/><path d="M17 13.5 21 12"/><path d="M10.5 10.5c-.6-1.8 1.2-2.5 1.2-4.5 1.8 1.7 2 3.4.7 4.5"/>'
};
function svgGlyph(k){
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">'+GLYPHS[k]+'</svg>';
}
var SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4"/></svg>';
var MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/></svg>';
var KEY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 9.5a4 4 0 1 0-4 4l-6 6v2h2l1-1h2v-2h2l1.5-1.5"/><circle cx="16.5" cy="7.5" r=".6" fill="currentColor" stroke="none"/></svg>';

/* ---------------- state ---------------- */
var convos = [];
var activeId = null;
var draftPhil = 'marcus';
var theme = 'day';
var busy = false;
var saveTimer = null;

var el = {};
['menu','pickBtn','pickGlyph','pickName','pickEra','thread','rail','input','send','convos',
 'newChat','themeBtn','menuBtn','sidebar','scrim','keyBtn','keyModal','keyScrim','keyInput','keySave','keyCancel'].forEach(function(k){ el[k] = document.getElementById(k); });

function philOf(id){ return PHILS.filter(function(p){ return p.id === id; })[0]; }
function active(){ return activeId ? convos.filter(function(c){ return c.id === activeId; })[0] : null; }
function currentPhil(){ var c = active(); return philOf(c ? c.philId : draftPhil); }
function accentOf(p){ return theme === 'night' ? p.accentNight : p.accent; }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function para(t){
  return t.trim().split(/\n{2,}/).map(function(b){
    return '<p>' + esc(b).replace(/\n/g,'<br>').replace(/\*([^*]+)\*/g,'<em>$1</em>') + '</p>';
  }).join('');
}

/* ---------------- storage ---------------- */
function save(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(function(){
    try{ localStorage.setItem('willow:state', JSON.stringify({ theme:theme, convos:convos.slice(0,80) })); }
    catch(e){ /* keeps working in memory */ }
  }, 350);
}
function load(){
  try{
    var raw = localStorage.getItem('willow:state');
    if(raw){
      var s = JSON.parse(raw);
      if(Array.isArray(s.convos)) convos = s.convos;
      if(s.theme) theme = s.theme;
    }
  }catch(e){ /* first run, nothing saved yet */ }
}

/* ---------------- theme ---------------- */
function applyTheme(){
  document.documentElement.setAttribute('data-theme', theme === 'night' ? 'night' : 'day');
  el.themeBtn.innerHTML = theme === 'night' ? SUN : MOON;
  el.themeBtn.setAttribute('aria-label', theme === 'night' ? 'Switch to day' : 'Switch to night');
}
el.themeBtn.addEventListener('click', function(){
  theme = theme === 'night' ? 'day' : 'night';
  applyTheme(); render(); save();
});

/* ---------------- API key modal ---------------- */
el.keyBtn.innerHTML = KEY_ICON;
function openKeyModal(on){
  el.keyModal.classList.toggle('open', on);
  el.keyScrim.classList.toggle('on', on);
  if(on){ el.keyInput.value = getApiKey(); setTimeout(function(){ el.keyInput.focus(); }, 50); }
}
el.keyBtn.addEventListener('click', function(){ openKeyModal(true); });
el.keyScrim.addEventListener('click', function(){ openKeyModal(false); });
el.keyCancel.addEventListener('click', function(){ openKeyModal(false); });
el.keySave.addEventListener('click', function(){
  setApiKey(el.keyInput.value.trim());
  openKeyModal(false);
});
el.keyInput.addEventListener('keydown', function(e){
  if(e.key === 'Enter'){ e.preventDefault(); el.keySave.click(); }
});

/* ---------------- picker ---------------- */
el.menu.innerHTML = PHILS.map(function(p){
  return '<button class="opt" role="option" data-id="' + p.id + '" aria-selected="false">' +
    '<span class="glyph" data-accent="' + p.id + '">' + svgGlyph(p.glyph) + '</span>' +
    '<span><span class="opt-name">' + p.name + '</span><span class="opt-era">' + p.era + '</span>' +
    '<span class="opt-blurb">' + p.blurb + '</span></span></button>';
}).join('');

function openMenu(on){
  el.menu.classList.toggle('open', on);
  el.pickBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
}
el.pickBtn.addEventListener('click', function(e){ e.stopPropagation(); openMenu(!el.menu.classList.contains('open')); });
document.addEventListener('click', function(){ openMenu(false); });
document.addEventListener('keydown', function(e){ if(e.key === 'Escape'){ openMenu(false); drawer(false); openKeyModal(false); } });
el.menu.addEventListener('click', function(e){
  var opt = e.target.closest('.opt'); if(!opt) return;
  openMenu(false);
  var c = active();
  if(c && c.messages.length){ activeId = null; }   /* a new voice starts a new conversation */
  draftPhil = opt.dataset.id;
  render(); el.input.focus();
});

/* ---------------- drawer ---------------- */
function drawer(on){
  el.sidebar.classList.toggle('open', on);
  el.scrim.classList.toggle('on', on);
}
el.menuBtn.addEventListener('click', function(){ drawer(true); });
el.scrim.addEventListener('click', function(){ drawer(false); });

/* ---------------- sidebar list ---------------- */
function when(ts){
  var d = Date.now() - ts, m = Math.round(d / 60000);
  if(m < 1) return 'just now';
  if(m < 60) return m + 'm ago';
  var h = Math.round(m / 60);
  if(h < 24) return h + 'h ago';
  return new Date(ts).toLocaleDateString(undefined, { month:'short', day:'numeric' });
}
function bucket(ts){
  var now = new Date(), then = new Date(ts);
  var midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if(ts >= midnight) return 'Today';
  if(ts >= midnight - 86400000) return 'Yesterday';
  if(ts >= midnight - 6 * 86400000) return 'Earlier this week';
  return 'Older';
}
function renderList(){
  if(!convos.length){
    el.convos.innerHTML = '<p class="empty-note">Conversations you start will be kept here, so you can pick one up again later.</p>';
    return;
  }
  var sorted = convos.slice().sort(function(a, b){ return b.updated - a.updated; });
  var html = '', lastGroup = '';
  sorted.forEach(function(c){
    var g = bucket(c.updated);
    if(g !== lastGroup){ html += '<div class="group">' + g + '</div>'; lastGroup = g; }
    var p = philOf(c.philId);
    html += '<button class="convo' + (c.id === activeId ? ' on' : '') + '" data-id="' + c.id +
      '" style="--dot:' + accentOf(p) + '">' +
      '<span class="dot"></span><span><span class="convo-title">' + esc(c.title) + '</span>' +
      '<span class="convo-meta">' + p.name + ' &middot; ' + when(c.updated) + '</span></span>' +
      '<span class="wipe" role="button" tabindex="0" aria-label="Delete conversation" data-wipe="' + c.id + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></span></button>';
  });
  el.convos.innerHTML = html;
}
el.convos.addEventListener('click', function(e){
  var wipe = e.target.closest('[data-wipe]');
  if(wipe){
    e.stopPropagation();
    var id = wipe.dataset.wipe;
    convos = convos.filter(function(c){ return c.id !== id; });
    if(activeId === id) activeId = null;
    render(); save(); return;
  }
  var item = e.target.closest('.convo'); if(!item) return;
  activeId = item.dataset.id;
  drawer(false); render(); el.input.focus();
});
el.newChat.addEventListener('click', function(){
  var c = active();
  activeId = null;
  draftPhil = c ? c.philId : draftPhil;
  drawer(false); render(); el.input.focus();
});

/* ---------------- render ---------------- */
function render(){
  var p = currentPhil(), c = active();
  document.documentElement.style.setProperty('--accent', accentOf(p));
  el.pickGlyph.innerHTML = svgGlyph(p.glyph);
  el.pickName.textContent = p.name;
  el.pickEra.textContent = p.era;
  Array.prototype.forEach.call(el.menu.children, function(o){
    o.setAttribute('aria-selected', o.dataset.id === p.id ? 'true' : 'false');
    o.querySelector('.glyph').style.color = accentOf(philOf(o.dataset.id));
  });
  el.input.placeholder = 'Say something to ' + p.name.split(' ')[0] + '…';

  if(!c || !c.messages.length){
    el.thread.innerHTML =
      '<div class="opening"><span class="glyph">' + svgGlyph(p.glyph) + '</span>' +
      '<p class="eyebrow">In conversation with</p><h1>' + p.name + '</h1>' +
      '<p class="opening-line">' + esc(p.greeting) + '</p><div class="chips">' +
      p.starters.map(function(s){ return '<button class="chip">' + esc(s) + '</button>'; }).join('') + '</div></div>';
    Array.prototype.forEach.call(el.thread.querySelectorAll('.chip'), function(ch){
      ch.addEventListener('click', function(){ send(ch.textContent); });
    });
  } else {
    el.thread.innerHTML = c.messages.map(function(m){
      if(m.role === 'user') return '<div class="msg from-you"><div class="bubble">' + para(m.content) + '</div></div>';
      return '<div class="msg from-phil"><div class="meta"><span class="who">' + p.name +
        '</span><span class="era">' + p.era + '</span></div>' + para(m.content) + '</div>';
    }).join('');
  }
  growLeaves();
  renderList();
  scrollDown();
}
function growLeaves(){
  var c = active();
  var replies = c ? c.messages.filter(function(m){ return m.role === 'assistant'; }).length : 0;
  var shown = Math.min(replies, 14), out = '';
  var from = theme === 'night' ? [132,199,154] : [63,107,74];
  var to   = theme === 'night' ? [255,138,61] : [255,106,19];
  for(var i = 0; i < shown; i++){
    var t = shown > 1 ? Math.min(i / Math.max(shown - 1, 7), 1) : 0;
    var col = 'rgb(' + from.map(function(v, k){ return Math.round(v + (to[k] - v) * t); }).join(',') + ')';
    out += '<span class="leaf" style="animation-delay:' + (i * 0.05) + 's">' +
      '<svg viewBox="0 0 24 24"><path d="M2 12C7 4 15 2 22 3c1 7-1 15-9 16-5 .6-9-3-11-7Z" fill="' + col + '" opacity=".92"/>' +
      '<path d="M3 12C9 9 16 6 21 4" stroke="rgba(255,255,255,.5)" stroke-width="1" fill="none"/></svg></span>';
  }
  el.rail.innerHTML = out + (replies > 1 ? '<span class="rail-count">' + replies + ' replies</span>' : '');
}
function scrollDown(){ el.thread.scrollTop = el.thread.scrollHeight; }

/* ---------------- composer ---------------- */
function sizeInput(){
  el.input.style.height = 'auto';
  el.input.style.height = Math.min(el.input.scrollHeight, 150) + 'px';
  el.send.disabled = !el.input.value.trim() || busy;
}
el.input.addEventListener('input', sizeInput);
el.input.addEventListener('keydown', function(e){
  if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); send(el.input.value); }
});
el.send.addEventListener('click', function(){ send(el.input.value); });

function send(text){
  text = (text || '').trim();
  if(!text || busy) return;

  if(!getApiKey()){
    openKeyModal(true);
    return;
  }

  el.input.value = ''; sizeInput();
  var c = active();
  if(!c){
    c = { id:'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          philId:draftPhil, title:text.length > 52 ? text.slice(0, 52).trim() + '…' : text,
          messages:[], updated:Date.now() };
    convos.unshift(c); activeId = c.id;
  }
  c.messages.push({ role:'user', content:text });
  c.updated = Date.now();
  render(); save(); ask(c);
}

function ask(c){
  var p = philOf(c.philId);
  busy = true; el.send.disabled = true;
  var wait = document.createElement('div');
  wait.className = 'thinking'; wait.innerHTML = '<i></i><i></i><i></i>';
  el.thread.appendChild(wait); scrollDown();

  askGemini(p.system + SAFETY, c.messages)
    .then(function(text){
      c.messages.push({ role:'assistant', content:text });
      c.updated = Date.now();
      busy = false;
      if(c.id === activeId) render(); else { sizeInput(); renderList(); }
      save();
    })
    .catch(function(err){
      busy = false; wait.remove();
      if(err && err.message === 'bad-key'){
        if(c.id === activeId){ sizeInput(); }
        openKeyModal(true);
        return;
      }
      if(c.id !== activeId){ sizeInput(); return; }
      var snag = document.createElement('div');
      snag.className = 'snag';
      snag.innerHTML = p.name + ' could not be reached just now. Your message is still here.<button type="button">Try again</button>';
      snag.querySelector('button').addEventListener('click', function(){ snag.remove(); ask(c); });
      el.thread.appendChild(snag); sizeInput(); scrollDown();
    });
}

/* ---------------- start ---------------- */
(function init(){
  if(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) theme = 'night';
  load();
  applyTheme();
  render();
  el.input.focus();
})();
