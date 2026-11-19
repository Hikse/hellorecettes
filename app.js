'use strict';
// ---------- données ----------
const CATS = {
  LEGUMES: ['Légumes', '🥕'], FRUITS: ['Fruits', '🍎'], HERBES: ['Herbes fraîches', '🌿'],
  BOULANGERIE: ['Boulangerie', '🥖'], VIANDE: ['Boucherie', '🥩'], POISSON: ['Poissonnerie', '🐟'],
  CREMERIE: ['Crèmerie & fromages', '🧀'], FRAIS: ['Rayon frais', '🥟'], EPICERIE: ['Épicerie salée', '🍚'],
  CONSERVES: ['Conserves & sauces', '🥫'], EPICES: ['Épices & condiments', '🧂'], AUTRE: ['Autres', '🛒'],
};
const CAT_ORDER = Object.keys(CATS);
const cat = c => CATS[c] ? c : 'AUTRE';

let RECIPES = [], BY_ID = {};
const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// ---------- état sauvegardé ----------
const KEY = 'hellorecettes-state';
const S = Object.assign({ cart: {}, checked: [], fav: [], dislike: [], history: [], tab: 'home', mode: 'recipes', filter: 'hide' },
  (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } })());
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

// ---------- quantités ----------
const WEIGHT = ['g', 'ml', 'kg', 'l'];
function fmtNum(d) { const r = Math.round(d * 10) / 10; return String(r).replace('.', ','); }
function fraction(q) {
  const quarters = Math.round(q * 4);
  if (quarters === 0 || Math.abs(q * 4 - quarters) > 0.05) return fmtNum(q);
  const w = Math.floor(quarters / 4), f = ['', '¼', '½', '¾'][quarters % 4];
  return w === 0 ? f : (f ? w + f : String(w));
}
function fmtQty(q, unit) {
  if (q <= 0) return 'selon le goût';
  let n;
  if (WEIGHT.includes(unit)) n = q >= 50 ? String(Math.round(q / 5) * 5) : q >= 10 ? String(Math.round(q)) : fmtNum(q);
  else n = fraction(q);
  return (!unit || unit === 'pc') ? n : n + ' ' + unit;
}

function shoppingList() {
  const map = new Map();
  for (const [id, p] of Object.entries(S.cart)) {
    const r = BY_ID[id]; if (!r) continue;
    for (const i of r.ingredients) {
      const k = norm(i.name).trim() + '|' + i.unit;
      if (!map.has(k)) map.set(k, { key: k, name: i.name, unit: i.unit, cat: cat(i.cat), qty: 0, from: new Set() });
      const a = map.get(k); a.qty += i.qty * p; a.from.add(r.title);
    }
  }
  return [...map.values()].sort((a, b) => CAT_ORDER.indexOf(a.cat) - CAT_ORDER.indexOf(b.cat) || norm(a.name).localeCompare(norm(b.name)));
}

// ---------- utilitaires DOM ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const img = r => `images/${encodeURIComponent(r.image)}`;
const toggle = (arr, v) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];

function stepper(value, attr) {
  return `<div class="stepper"><button data-${attr}="-1" ${value <= 1 ? 'disabled' : ''}>−</button><span>${value} pers.</span><button data-${attr}="1" ${value >= 12 ? 'disabled' : ''}>+</button></div>`;
}

function card(r) {
  const p = S.cart[r.id];
  return `<div class="card" data-open="${r.id}">
    <div class="photo" style="background-image:url('${img(r)}')">
      ${S.fav.includes(r.id) ? '<span class="fav">❤️</span>' : ''}
      <button class="add ${p ? 'in' : ''}" data-add="${r.id}" aria-label="Ajouter au panier">${p ? p + ' p' : '+'}</button>
    </div>
    <div class="info"><div class="title">${esc(r.title)}</div>
      ${r.subtitle ? `<div class="sub">${esc(r.subtitle)}</div>` : ''}
      ${r.time ? `<div class="time">⏱ ${esc(r.time)}</div>` : ''}</div></div>`;
}

// ---------- écrans ----------
let query = '';
function renderHome() {
  const q = norm(query).trim().split(/\s+/).filter(Boolean);
  const list = RECIPES.filter(r => q.every(w => r._s.includes(w)) &&
    (S.filter === 'all' || (S.filter === 'fav' ? S.fav.includes(r.id) : !S.dislike.includes(r.id))));
  const chips = [['all', 'Toutes'], ['fav', '❤️ Favoris'], ['hide', 'Masquer 👎']]
    .map(([k, l]) => `<button class="chip ${S.filter === k ? 'on' : ''}" data-filter="${k}">${l}</button>`).join('');
  $('#screen').innerHTML = `<h1>Mes recettes</h1>
    <label class="search">🔍<input id="q" type="search" placeholder="Rechercher (plat, ingrédient…)" value="${esc(query)}"></label>
    <div class="chips">${chips}</div><div class="count">${list.length} recette(s)</div>
    <div id="list"></div>`;
  renderList(list);
  $('#q').addEventListener('input', e => { query = e.target.value; const pos = e.target.selectionStart; renderHome(); const i = $('#q'); i.focus(); i.setSelectionRange(pos, pos); });
}
function renderList(list) {
  // rendu progressif pour rester fluide
  const el = $('#list'); let i = 0;
  const chunk = () => { el.insertAdjacentHTML('beforeend', list.slice(i, i + 30).map(card).join('')); i += 30; if (i < list.length) requestAnimationFrame(chunk); };
  chunk();
}

function renderCart() {
  const ids = Object.keys(S.cart);
  if (!ids.length) { $('#screen').innerHTML = `<h1>Panier</h1><p class="empty">Ton panier est vide.<br>Ajoute des recettes avec le « + » 🙂</p>`; return; }
  let body;
  if (S.mode === 'recipes') {
    body = ids.map(id => { const r = BY_ID[id]; if (!r) return '';
      return `<div class="citem"><div class="thumb" data-open="${id}" style="background-image:url('${img(r)}')"></div>
        <div class="mid"><div class="title" data-open="${id}">${esc(r.title)}</div>${stepper(S.cart[id], 'cp-' + id)}</div>
        <button class="del" data-remove="${id}" aria-label="Retirer">🗑️</button></div>`; }).join('');
  } else {
    const items = shoppingList(); const done = items.filter(x => S.checked.includes(x.key)).length;
    body = `<div class="progress">${done} / ${items.length} articles dans le chariot<div class="bar"><i style="width:${items.length ? done / items.length * 100 : 0}%"></i></div></div>`;
    let last = '';
    for (const it of items) {
      if (it.cat !== last) { last = it.cat; body += `<div class="cat">${CATS[it.cat][1]}  ${CATS[it.cat][0]}</div>`; }
      const ok = S.checked.includes(it.key);
      body += `<div class="sitem ${ok ? 'done' : ''}" data-check="${esc(it.key)}"><span class="box">${ok ? '✓' : ''}</span>
        <span class="n">${esc(it.name)}${it.from.size > 1 ? `<small>${it.from.size} recettes</small>` : ''}</span><span class="q">${fmtQty(it.qty, it.unit)}</span></div>`;
    }
  }
  $('#screen').innerHTML = `<h1>Panier</h1>
    <div class="seg"><button data-mode="recipes" class="${S.mode === 'recipes' ? 'on' : ''}">Recettes (${ids.length})</button>
    <button data-mode="list" class="${S.mode === 'list' ? 'on' : ''}">Liste de courses</button></div>${body}
    <div class="finish"><button class="big" data-finish>✓ Courses terminées</button></div>`;
}

function renderHistory() {
  const fmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  let h = '<h1>Historique</h1>';
  if (!S.history.length) h += '<p class="count" style="margin-top:12px">Aucun panier terminé pour l\'instant.</p>';
  S.history.forEach((e, k) => {
    const d = fmt.format(new Date(e.date));
    h += `<div class="hdate"><span>${d[0].toUpperCase() + d.slice(1)}</span><button class="del" data-delhist="${k}" aria-label="Supprimer">🗑️</button></div>`;
    h += Object.keys(e.items).map(id => BY_ID[id] ? card(BY_ID[id]) : '').join('');
  });
  $('#screen').innerHTML = h;
}

function render() {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
  const n = Object.keys(S.cart).length; const b = $('#badge'); b.hidden = !n; b.textContent = n;
  ({ home: renderHome, cart: renderCart, history: renderHistory })[S.tab]();
}

// ---------- fiche recette ----------
let detailId = null, detailP = 2;
function openDetail(id, push = true) {
  detailId = String(id); detailP = S.cart[detailId] || 2;
  if (push) history.pushState({ d: detailId }, '');
  renderDetail(); $('#detail').hidden = false; $('#detail').scrollTop = 0; document.body.style.overflow = 'hidden';
}
function closeDetail() { $('#detail').hidden = true; detailId = null; document.body.style.overflow = ''; render(); }
function renderDetail() {
  const r = BY_ID[detailId]; const p = detailP;
  const ing = i => `<div class="ing"><span class="e">${CATS[cat(i.cat)][1]}</span><span class="n">${esc(i.name)}</span><span class="q">${fmtQty(i.qty * p, i.unit)}</span></div>`;
  const box = r.ingredients.filter(i => !i.base), base = r.ingredients.filter(i => i.base);
  const inCart = S.cart[r.id];
  const label = !inCart ? `+ Ajouter au panier (${p} pers.)` : inCart === p ? 'Dans le panier ✓' : `Mettre à jour le panier (${p} pers.)`;
  $('#detail').innerHTML = `<div class="photo" style="background-image:url('${img(r)}')"><button class="back" data-back aria-label="Retour">←</button></div>
    <div class="dwrap"><div class="dhead"><h2>${esc(r.title)}</h2>${r.subtitle ? `<div class="sub" style="white-space:normal">${esc(r.subtitle)}</div>` : ''}
      <div class="tags">${r.time ? `<span class="tag">⏱ ${esc(r.time)}</span>` : ''}${(r.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      <div class="row"><button class="iconbtn ${S.fav.includes(r.id) ? 'on' : ''}" data-fav>❤️</button>
        <button class="iconbtn ${S.dislike.includes(r.id) ? 'on' : ''}" data-dislike>👎</button>${stepper(p, 'dp')}</div></div>
    <h3>Ingrédients</h3>${box.map(ing).join('')}
    ${base.length ? `<div class="base">À avoir chez soi</div>${base.map(ing).join('')}` : ''}
    <h3>Préparation</h3>${r.steps.map((s, k) => `<div class="step"><span class="num">${k + 1}</span><div>${s.title ? `<b>${esc(s.title)}</b>` : ''}<p>${esc(s.text)}</p></div></div>`).join('')}
    </div><div class="bottombar"><button class="big ${inCart === p ? 'ok' : ''}" data-tocart>${label}</button></div>`;
}

// ---------- boîte « pour combien ? » ----------
let modalId = null, modalP = 2;
function openModal(id) { modalId = String(id); modalP = S.cart[modalId] || 2; renderModal(); $('#modal').hidden = false; }
function renderModal() {
  $('#modal').innerHTML = `<div class="dialog"><h4>${esc(BY_ID[modalId].title)}</h4><div>Pour combien de personnes ?</div>
    ${stepper(modalP, 'mp')}<div class="acts"><button class="no" data-mclose>Annuler</button><button class="ok" data-mok>Valider</button></div></div>`;
}
function confirmBox(title, text, onOk) {
  $('#modal').innerHTML = `<div class="dialog"><h4>${title}</h4><div>${text}</div>
    <div class="acts" style="margin-top:18px"><button class="no" data-mclose>Annuler</button><button class="ok" data-cok>Valider</button></div></div>`;
  $('#modal').hidden = false; confirmBox.cb = onOk;
}
const closeModal = () => { $('#modal').hidden = true; modalId = null; };

// ---------- clics ----------
document.addEventListener('click', e => {
  const t = e.target.closest('button,[data-open],[data-check]'); if (!t) { if (e.target.id === 'modal') closeModal(); return; }
  const d = t.dataset;
  if (d.tab) { S.tab = d.tab; save(); render(); scrollTo(0, 0); return; }
  if (d.add) { e.stopPropagation(); openModal(d.add); return; }
  if (d.filter) { S.filter = d.filter; save(); renderHome(); return; }
  if (d.mode) { S.mode = d.mode; save(); renderCart(); return; }
  if (d.remove) { delete S.cart[d.remove]; save(); render(); return; }
  if (d.check) { S.checked = toggle(S.checked, d.check); save(); const y = scrollY; renderCart(); scrollTo(0, y); return; }
  if ('finish' in d) return confirmBox('Terminer ce panier ?', 'Les recettes seront enregistrées dans l\'historique et le panier sera vidé.', () => {
    S.history.unshift({ date: Date.now(), items: { ...S.cart } }); S.cart = {}; S.checked = []; save(); render(); });
  if (d.delhist) return confirmBox('Supprimer ce panier de l\'historique ?', '', () => { S.history.splice(+d.delhist, 1); save(); render(); });
  if ('mclose' in d) return closeModal();
  if ('cok' in d) { closeModal(); confirmBox.cb(); return; }
  if (d.mp) { modalP = Math.min(12, Math.max(1, modalP + +d.mp)); renderModal(); return; }
  if ('mok' in d) { S.cart[modalId] = modalP; save(); closeModal(); if (detailId) renderDetail(); else { const y = scrollY; render(); scrollTo(0, y); } return; }
  for (const k of Object.keys(d)) if (k.startsWith('cp-')) { const id = k.slice(3); S.cart[id] = Math.min(12, Math.max(1, S.cart[id] + +d[k])); save(); renderCart(); return; }
  if (d.dp) { detailP = Math.min(12, Math.max(1, detailP + +d.dp)); renderDetail(); return; }
  if ('fav' in d) { S.fav = toggle(S.fav, +detailId); S.dislike = S.dislike.filter(x => x !== +detailId); save(); renderDetail(); return; }
  if ('dislike' in d) { S.dislike = toggle(S.dislike, +detailId); S.fav = S.fav.filter(x => x !== +detailId); save(); renderDetail(); return; }
  if ('tocart' in d) { S.cart[detailId] = detailP; save(); renderDetail(); return; }
  if ('back' in d) { history.back(); return; }
  if (d.open) { openDetail(d.open); return; }
});
window.addEventListener('popstate', () => { if (detailId) closeDetail(); });

// ---------- démarrage ----------
fetch('recipes.json').then(r => r.json()).then(data => {
  RECIPES = data.map(r => ({ ...r, _s: norm([r.title, r.subtitle, ...(r.tags || []), ...r.ingredients.map(i => i.name)].join(' ')) }));
  for (const r of RECIPES) BY_ID[r.id] = r;
  for (const id of Object.keys(S.cart)) if (!BY_ID[id]) delete S.cart[id];
  render();
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
