(function () {
  'use strict';

  const STORAGE_KEY = 'money-tierlist:v2';
  const THEME_KEY = 'money-tierlist:theme';
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const itemById = new Map(ITEMS.map(item => [item.id, item]));
  const tierByKey = new Map(TIERS.map(tier => [tier.key, tier]));
  const zoneKeys = ['bank', ...TIERS.map(tier => tier.key)];

  const chipEls = new Map();
  const zoneEls = new Map();

  let state = loadState();
  let selectedId = null;
  let drag = null;
  let suppressClickUntil = 0;
  let toastTimer = 0;
  let rouletteTimer = 0;


  function emptyState() {
    const next = { bank: ITEMS.map(item => item.id) };
    TIERS.forEach(tier => { next[tier.key] = []; });
    return next;
  }

  function loadState() {
    const fallback = emptyState();
    let raw;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (error) { return fallback; }
    if (!raw) return fallback;

    try {
      const parsed = JSON.parse(raw);
      const saved = parsed && parsed.zones ? parsed.zones : parsed;
      if (!saved || typeof saved !== 'object') return fallback;

      const next = emptyState();
      const seen = new Set();
      zoneKeys.forEach(key => {
        const list = Array.isArray(saved[key]) ? saved[key] : [];
        next[key] = list.filter(id => {
          if (!itemById.has(id) || seen.has(id)) return false;
          seen.add(id);
          return true;
        });
      });
      ITEMS.forEach(item => {
        if (!seen.has(item.id)) next.bank.push(item.id);
      });
      return next;
    } catch (error) {
      return fallback;
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, zones: state }));
    } catch (error) {}
  }

  function zoneOf(id) {
    for (const key of zoneKeys) {
      if (state[key].indexOf(id) !== -1) return key;
    }
    return null;
  }

  function formatMoney(value) {
    return new Intl.NumberFormat('ru-RU').format(value) + ' ₽';
  }


  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function applyTheme(theme, persist) {
    const isDark = theme === 'dark';
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');

    const button = $('#themeToggle');
    if (button) {
      button.textContent = isDark ? 'Тема: тёмная' : 'Тема: светлая';
      button.setAttribute('aria-pressed', isDark ? 'true' : 'false');
      button.title = isDark ? 'Включить светлую тему' : 'Включить тёмную тему';
    }

    const meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark ? '#0f0f0f' : '#e8e8e8');

    if (persist) {
      try { localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light'); } catch (error) {}
    }
  }

  function toggleTheme() {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
  }


  function buildChips() {
    ITEMS.forEach(item => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.dataset.id = item.id;
      chip.textContent = item.text;
      chip.title = 'Перетащи в тир или тапни, чтобы выбрать';
      chip.addEventListener('click', () => handleChipClick(item.id));
      chipEls.set(item.id, chip);
    });
  }

  function buildTiers() {
    const board = $('#tiers');
    const fragment = document.createDocumentFragment();

    TIERS.forEach(tier => {
      const row = document.createElement('section');
      row.className = 'tier';
      row.style.setProperty('--tier', tier.color);
      row.style.setProperty('--ink', tier.ink);

      const label = document.createElement('div');
      label.className = 'tier-label';
      label.title = 'Положить выбранное задание в этот тир';
      label.addEventListener('click', () => {
        if (selectedId) place(selectedId, tier.key);
      });

      const amount = document.createElement('span');
      amount.className = 'tier-amount' + (tier.key === 'never' ? ' tier-amount--word' : '');
      amount.textContent = tier.amount;

      const note = document.createElement('span');
      note.className = 'tier-note';
      note.textContent = tier.note || '';

      const count = document.createElement('span');
      count.className = 'tier-count';
      count.dataset.countFor = tier.key;
      count.textContent = '0';

      label.append(amount, note, count);

      const zone = document.createElement('div');
      zone.className = 'tier-zone is-empty';
      zone.dataset.drop = tier.key;
      zone.tabIndex = 0;
      zone.setAttribute('role', 'button');
      zone.setAttribute('aria-label', 'Тир ' + tier.amount + '. Положить выбранное задание');

      zone.addEventListener('click', event => {
        if (event.target.closest('.chip')) return;
        if (selectedId) place(selectedId, tier.key);
      });
      zone.addEventListener('keydown', event => {
        if ((event.key === 'Enter' || event.key === ' ') && selectedId) {
          event.preventDefault();
          place(selectedId, tier.key);
        }
      });

      row.append(label, zone);
      fragment.append(row);
      zoneEls.set(tier.key, zone);
    });

    board.append(fragment);
  }

  function buildBank() {
    const bank = $('#bank');
    bank.addEventListener('click', event => {
      if (event.target.closest('.chip')) return;
      if (selectedId) place(selectedId, 'bank');
    });
    bank.addEventListener('keydown', event => {
      if ((event.key === 'Enter' || event.key === ' ') && selectedId) {
        event.preventDefault();
        place(selectedId, 'bank');
      }
    });
    zoneEls.set('bank', bank);
  }


  function render() {
    zoneKeys.forEach(key => {
      const zone = zoneEls.get(key);
      const ids = state[key];
      const fragment = document.createDocumentFragment();
      ids.forEach(id => {
        const chip = chipEls.get(id);
        if (chip) fragment.append(chip);
      });
      zone.replaceChildren(fragment);
      zone.classList.toggle('is-empty', ids.length === 0);
    });

    chipEls.forEach((chip, id) => {
      chip.classList.toggle('is-selected', id === selectedId);
    });

    updateCounts();
    updateProgress();
    updateSelectionBar();
    applySearch();
    saveState();
  }

  function updateCounts() {
    let sorted = 0;
    let money = 0;

    TIERS.forEach(tier => {
      const count = state[tier.key].length;
      const badge = $('[data-count-for="' + tier.key + '"]');
      if (badge) badge.textContent = count === 0 ? '' : count + ' шт';
      money += count * (VALUES[tier.key] || 0);
      sorted += count;
    });

    $('#sortedCount').textContent = sorted + ' / ' + ITEMS.length;
    $('#moneyTotal').textContent = formatMoney(money);
    $('#bankCount').textContent = state.bank.length + ' шт';

    const percent = Math.round((sorted / ITEMS.length) * 100);
    $('#progressFill').style.width = percent + '%';
    $('#progressBar').setAttribute('aria-valuenow', String(percent));
  }

  function updateProgress() {
    const percent = Math.round(((ITEMS.length - state.bank.length) / ITEMS.length) * 100);
    $('#progressLabel').textContent = percent + '%';
  }

  function updateSelectionBar() {
    const bar = $('#selectionBar');
    const text = $('#selectionText');
    if (!selectedId) {
      bar.classList.remove('is-visible');
      bar.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('has-selection');
      return;
    }
    const item = itemById.get(selectedId);
    text.textContent = '«' + item.text + '»';
    bar.classList.add('is-visible');
    bar.setAttribute('aria-hidden', 'false');
    document.body.classList.add('has-selection');
  }

  function flashChip(id) {
    const chip = chipEls.get(id);
    if (!chip) return;
    chip.classList.add('is-placed');
    window.setTimeout(() => chip.classList.remove('is-placed'), 520);
  }


  function handleChipClick(id) {
    if (Date.now() < suppressClickUntil) return;
    const targetZone = zoneOf(id);

    if (selectedId && selectedId !== id && targetZone !== 'bank') {
      place(selectedId, targetZone);
      return;
    }

    selectedId = selectedId === id ? null : id;
    render();
    if (selectedId) {
      const chip = chipEls.get(selectedId);
      if (chip && chip.hidden) {
        $('#search').value = '';
        applySearch();
      }
    }
  }

  function place(id, targetKey, beforeId) {
    const from = zoneOf(id);
    if (!from || !zoneEls.has(targetKey)) return;

    const movingBeforeItself = beforeId === id;
    if (movingBeforeItself) return;

    state[from] = state[from].filter(x => x !== id);
    const target = state[targetKey];
    const index = beforeId ? target.indexOf(beforeId) : -1;
    if (index >= 0) target.splice(index, 0, id);
    else target.push(id);

    selectedId = null;
    render();
    flashChip(id);

    const zone = zoneEls.get(targetKey);
    if (zone) {
      const chip = chipEls.get(id);
      if (chip) {
        const zoneRect = zone.getBoundingClientRect();
        const chipRect = chip.getBoundingClientRect();
        if (chipRect.top < zoneRect.top || chipRect.bottom > zoneRect.bottom) {
          chip.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }
    }
  }

  function resetAll() {
    const ok = window.confirm('Сбросить тир-лист и вернуть все ' + ITEMS.length + ' заданий в банк?');
    if (!ok) return;
    state = emptyState();
    selectedId = null;
    render();
    toast('Готово. Можно начинать заново.');
  }

  function shuffleBank() {
    const bank = state.bank;
    for (let i = bank.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [bank[i], bank[j]] = [bank[j], bank[i]];
    }
    render();
    toast('Банк перемешан.');
  }

  function randomPick() {
    const query = $('#search').value.trim().toLowerCase();
    const pool = state.bank.filter(id => {
      const item = itemById.get(id);
      return !query || item.text.toLowerCase().includes(query);
    });
    if (pool.length === 0) {
      toast(state.bank.length === 0 ? 'Банк пуст — всё уже разложено.' : 'По поиску ничего не нашлось.');
      return;
    }

    window.clearTimeout(rouletteTimer);
    $$('.chip.is-lucky').forEach(chip => chip.classList.remove('is-lucky'));
    let ticks = 0;
    const spin = () => {
      $$('.chip.is-lucky').forEach(chip => chip.classList.remove('is-lucky'));
      const randomId = pool[Math.floor(Math.random() * pool.length)];
      const chip = chipEls.get(randomId);
      if (chip && !chip.hidden) {
        chip.classList.add('is-lucky');
        chip.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
      ticks += 1;
      if (ticks < 14) {
        rouletteTimer = window.setTimeout(spin, 55 + ticks * 14);
      } else {
        const finalId = pool[Math.floor(Math.random() * pool.length)];
        selectedId = finalId;
        render();
        const finalChip = chipEls.get(finalId);
        if (finalChip) {
          finalChip.classList.add('is-lucky');
          window.setTimeout(() => finalChip.classList.remove('is-lucky'), 900);
        }
        toast('Попалось: «' + itemById.get(finalId).text + '»');
      }
    };
    spin();
  }


  function applySearch() {
    const query = $('#search').value.trim().toLowerCase();
    let visible = 0;
    state.bank.forEach(id => {
      const chip = chipEls.get(id);
      const match = !query || itemById.get(id).text.toLowerCase().includes(query);
      chip.hidden = !match;
      if (match) visible += 1;
    });
    const total = state.bank.length;
    $('#bankMeta').textContent = query
      ? visible + ' из ' + total + ' в банке'
      : total + ' заданий ждут оценки';
    $('#searchEmpty').classList.toggle('is-visible', query !== '' && visible === 0);
  }


  function onPointerDown(event) {
    if (event.pointerType === 'touch' || event.button !== 0) return;
    const chip = event.target.closest('.chip');
    if (!chip) return;

    drag = {
      id: chip.dataset.id,
      chip,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      ghost: null,
      over: null,
      rect: chip.getBoundingClientRect()
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
    window.addEventListener('pointercancel', onPointerUp, { once: true });
  }

  function onPointerMove(event) {
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;

    if (!drag.active) {
      if (Math.hypot(dx, dy) < 7) return;
      startGhost(event);
    }

    event.preventDefault();
    moveGhost(event.clientX, event.clientY);
    highlightDrop(event.clientX, event.clientY);
    autoScroll(event.clientY);
  }

  function startGhost(event) {
    drag.active = true;
    drag.chip.classList.add('is-dragging');
    document.body.classList.add('dragging');

    const ghost = document.createElement('div');
    ghost.className = 'chip ghost';
    ghost.textContent = drag.chip.textContent;
    ghost.style.width = drag.rect.width + 'px';
    document.body.append(ghost);
    drag.ghost = ghost;

    if (selectedId) {
      selectedId = null;
      updateSelectionBar();
      chipEls.forEach(chip => chip.classList.remove('is-selected'));
    }
    moveGhost(event.clientX, event.clientY);
  }

  function moveGhost(x, y) {
    if (!drag || !drag.ghost) return;
    drag.ghost.style.left = x + 'px';
    drag.ghost.style.top = y + 'px';
  }

  function highlightDrop(x, y) {
    const el = document.elementFromPoint(x, y);
    const zone = el ? el.closest('[data-drop]') : null;
    if (drag.over === zone) return;
    if (drag.over) drag.over.classList.remove('drop-over');
    drag.over = zone;
    if (zone) zone.classList.add('drop-over');
  }

  function autoScroll(y) {
    if (y < 90) window.scrollBy(0, -14);
    else if (y > window.innerHeight - 90) window.scrollBy(0, 14);
  }

  function onPointerUp() {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    if (!drag) return;

    if (drag.over) drag.over.classList.remove('drop-over');
    document.body.classList.remove('dragging');
    drag.chip.classList.remove('is-dragging');
    if (drag.ghost) drag.ghost.remove();

    if (drag.active && drag.over) {
      place(drag.id, drag.over.dataset.drop);
      suppressClickUntil = Date.now() + 250;
    }
    if (drag.active) suppressClickUntil = Date.now() + 250;
    drag = null;
  }


  async function exportPng() {
    const capture = $('#capture');
    if (!capture) return;
    if (typeof window.html2canvas !== 'function') {
      window.print();
      return;
    }

    const button = $('#exportBtn');
    button.disabled = true;
    button.textContent = 'Готовлю...';
    document.body.classList.add('capturing');

    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const themedBackground = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
      const canvas = await window.html2canvas(capture, {
        backgroundColor: themedBackground || '#e8e8e8',
        scale: Math.min(3, window.devicePixelRatio > 1 ? 2 : 2),
        useCORS: true,
        logging: false,
        windowWidth: document.documentElement.clientWidth
      });
      const link = document.createElement('a');
      link.download = 'tier-list-chto-by-ya-sdelal.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast('PNG сохранён. Можно постить.');
    } catch (error) {
      toast('Не получилось собрать PNG — открываю печать.');
      window.print();
    } finally {
      document.body.classList.remove('capturing');
      button.disabled = false;
      button.textContent = 'Скачать PNG';
    }
  }


  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => el.classList.remove('is-visible'), 2600);
  }

  function bindEvents() {
    $('#search').addEventListener('input', applySearch);
    $('#shuffleBtn').addEventListener('click', shuffleBank);
    $('#randomBtn').addEventListener('click', randomPick);
    $('#resetBtn').addEventListener('click', resetAll);
    $('#exportBtn').addEventListener('click', exportPng);
    $('#themeToggle').addEventListener('click', toggleTheme);
    $('#clearSelection').addEventListener('click', () => {
      selectedId = null;
      render();
    });

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && selectedId) {
        selectedId = null;
        render();
      }
    });
  }

  function init() {
    applyTheme(currentTheme(), false);
    buildChips();
    buildTiers();
    buildBank();
    bindEvents();
    $('#captureDate').textContent = new Date().toLocaleDateString('ru-RU');
    $('#totalItems').textContent = ITEMS.length + ' заданий';
    render();
  }

  init();
})();
