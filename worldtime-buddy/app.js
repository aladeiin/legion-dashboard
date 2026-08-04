(function () {
  'use strict';

  const SLOT_MINUTES = 30;
  const SLOTS_PER_DAY = (24 * 60) / SLOT_MINUTES; // 48
  const CELL_WIDTH = 26;

  const LS_LOCATIONS = 'wtb.locations';
  const LS_WORK_HOURS = 'wtb.workHours';
  const LS_USE24H = 'wtb.use24h';

  const board = document.getElementById('board');
  const summaryEl = document.getElementById('summary');
  const dateLabelEl = document.getElementById('dateLabel');
  const datePicker = document.getElementById('datePicker');
  const citySearch = document.getElementById('citySearch');
  const suggestionsEl = document.getElementById('citySuggestions');
  const formatToggle = document.getElementById('formatToggle');
  const workStartInput = document.getElementById('workStart');
  const workEndInput = document.getElementById('workEnd');

  let ALL_ZONES = [];
  try {
    ALL_ZONES = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  } catch (e) {
    ALL_ZONES = [];
  }

  const systemTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  const state = {
    locations: loadLocations(),
    workStart: 9,
    workEnd: 18,
    use24h: true,
    selectedDate: new Date(), // JS Date; only y/m/d in home tz is used
    selectedSlot: null,
    slots: [] // computed per render: { instant }
  };

  loadPrefs();

  function loadLocations() {
    try {
      const raw = localStorage.getItem(LS_LOCATIONS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch (e) {}

    const homeCity = guessHomeCityLabel(systemTz);
    const defaults = [{ id: uid(), city: homeCity.city, country: homeCity.country, tz: systemTz }];
    ['America/New_York', 'Europe/London', 'Asia/Kolkata', 'Asia/Tokyo'].forEach((tz) => {
      if (tz === systemTz) return;
      const match = CITIES.find((c) => c.tz === tz);
      if (match) defaults.push({ id: uid(), city: match.city, country: match.country, tz: match.tz });
    });
    return defaults;
  }

  function guessHomeCityLabel(tz) {
    const match = CITIES.find((c) => c.tz === tz);
    if (match) return { city: match.city, country: match.country };
    const tail = tz.split('/').pop() || tz;
    return { city: tail.replace(/_/g, ' '), country: 'My Location' };
  }

  function loadPrefs() {
    try {
      const wh = JSON.parse(localStorage.getItem(LS_WORK_HOURS) || 'null');
      if (wh && Number.isFinite(wh.start) && Number.isFinite(wh.end)) {
        state.workStart = wh.start;
        state.workEnd = wh.end;
      }
    } catch (e) {}
    try {
      const u = localStorage.getItem(LS_USE24H);
      if (u !== null) state.use24h = u === 'true';
    } catch (e) {}
    workStartInput.value = state.workStart;
    workEndInput.value = state.workEnd;
    formatToggle.textContent = state.use24h ? '24h' : '12h';
  }

  function persistLocations() {
    localStorage.setItem(LS_LOCATIONS, JSON.stringify(state.locations));
  }
  function persistPrefs() {
    localStorage.setItem(LS_WORK_HOURS, JSON.stringify({ start: state.workStart, end: state.workEnd }));
    localStorage.setItem(LS_USE24H, String(state.use24h));
  }

  function uid() {
    return Math.random().toString(36).slice(2, 10);
  }

  function homeLocation() {
    return state.locations[0];
  }

  function selectedDateParts() {
    return {
      year: state.selectedDate.getFullYear(),
      month: state.selectedDate.getMonth(),
      day: state.selectedDate.getDate()
    };
  }

  function buildSlots() {
    const home = homeLocation();
    const { year, month, day } = selectedDateParts();
    const anchor = zonedTimeToUtc(year, month + 1, day, 0, 0, home.tz);
    const slots = [];
    for (let i = 0; i < SLOTS_PER_DAY; i++) {
      slots.push(new Date(anchor.getTime() + i * SLOT_MINUTES * 60000));
    }
    state.slots = slots;
  }

  function categoryFor(hour) {
    if (hour >= 22 || hour < 6) return 'night';
    if (hour < state.workStart) return 'early';
    if (hour < state.workEnd) return 'work';
    return 'evening';
  }

  function isWithinWork(hour) {
    return hour >= state.workStart && hour < state.workEnd;
  }

  function computeSuggestedSlots() {
    const suggested = new Array(SLOTS_PER_DAY).fill(false);
    for (let i = 0; i < SLOTS_PER_DAY; i++) {
      const instant = state.slots[i];
      let allOk = true;
      for (const loc of state.locations) {
        const parts = getZonedParts(instant, loc.tz);
        if (!isWithinWork(parts.hour)) {
          allOk = false;
          break;
        }
      }
      suggested[i] = allOk;
    }
    return suggested;
  }

  function nearestSlotToNow() {
    const now = Date.now();
    let best = 0;
    let bestDiff = Infinity;
    state.slots.forEach((s, i) => {
      const diff = Math.abs(s.getTime() - now);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = i;
      }
    });
    return best;
  }

  function render() {
    buildSlots();
    if (state.selectedSlot === null || state.selectedSlot >= SLOTS_PER_DAY) {
      state.selectedSlot = nearestSlotToNow();
    }
    renderDateLabel();
    renderBoard();
    renderNowMarker();
    renderSummary();
  }

  function renderDateLabel() {
    const home = homeLocation();
    const { year, month, day } = selectedDateParts();
    const label = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(new Date(year, month, day, 12));
    dateLabelEl.textContent = label;
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    datePicker.value = iso;
  }

  function renderBoard() {
    const suggested = computeSuggestedSlots();
    board.innerHTML = '';
    board.style.gridTemplateColumns = `230px repeat(${SLOTS_PER_DAY}, ${CELL_WIDTH}px)`;

    // Header row
    const headerSidebar = document.createElement('div');
    headerSidebar.className = 'sidebar-cell header-sidebar-cell';
    headerSidebar.style.gridColumn = '1';
    headerSidebar.style.gridRow = '1';
    board.appendChild(headerSidebar);

    const home = homeLocation();
    state.slots.forEach((instant, i) => {
      const cell = document.createElement('div');
      cell.className = 'timeline-cell header-timeline-cell';
      cell.style.gridColumn = String(i + 2);
      cell.style.gridRow = '1';
      const parts = getZonedParts(instant, home.tz);
      if (parts.minute === 0) {
        cell.classList.add('hour-major');
        cell.textContent = state.use24h ? String(parts.hour).padStart(2, '0') : formatHour12Short(parts.hour);
      }
      board.appendChild(cell);
    });

    state.locations.forEach((loc, rowIndex) => {
      const gridRow = rowIndex + 2;

      const sidebar = document.createElement('div');
      sidebar.className = 'sidebar-cell';
      sidebar.style.gridColumn = '1';
      sidebar.style.gridRow = String(gridRow);
      sidebar.draggable = true;
      sidebar.dataset.index = String(rowIndex);
      sidebar.addEventListener('dragstart', onDragStart);
      sidebar.addEventListener('dragover', onDragOver);
      sidebar.addEventListener('drop', onDrop);

      const nameRow = document.createElement('div');
      nameRow.className = 'city-name-row';
      const star = rowIndex === 0 ? '<span class="home-star" title="Home / reference location">★</span>' : '';
      nameRow.innerHTML = `${star}<span>${escapeHtml(loc.city)}</span>`;
      sidebar.appendChild(nameRow);

      const meta = document.createElement('div');
      meta.className = 'city-meta';
      meta.innerHTML = `<span>${escapeHtml(loc.country || '')}</span><span>·</span><span>${formatOffsetLabel(loc.tz, state.slots[0])}</span>`;
      sidebar.appendChild(meta);

      const live = document.createElement('div');
      live.className = 'city-live-time';
      live.dataset.liveTz = loc.tz;
      sidebar.appendChild(live);

      const actions = document.createElement('div');
      actions.className = 'sidebar-actions';
      const homeBtn = document.createElement('button');
      homeBtn.textContent = rowIndex === 0 ? 'Home' : 'Make home';
      homeBtn.disabled = rowIndex === 0;
      homeBtn.addEventListener('click', () => makeHome(rowIndex));
      actions.appendChild(homeBtn);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-btn';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => removeLocation(rowIndex));
      removeBtn.disabled = state.locations.length <= 1;
      actions.appendChild(removeBtn);

      sidebar.appendChild(actions);
      board.appendChild(sidebar);

      state.slots.forEach((instant, i) => {
        const parts = getZonedParts(instant, loc.tz);
        const cell = document.createElement('div');
        cell.className = `timeline-cell ${categoryFor(parts.hour)}`;
        if (parts.minute === 0) cell.classList.add('hour-start');
        if (i === state.selectedSlot) cell.classList.add('selected');
        if (suggested[i]) cell.classList.add('suggested');
        cell.style.gridColumn = String(i + 2);
        cell.style.gridRow = String(gridRow);
        cell.dataset.slot = String(i);

        if (parts.minute === 0) {
          const label = document.createElement('span');
          label.className = 'cell-label';
          label.textContent = state.use24h ? String(parts.hour).padStart(2, '0') : formatHour12Short(parts.hour);
          cell.appendChild(label);
        }
        if (parts.hour === 0 && parts.minute === 0) {
          const boundary = document.createElement('span');
          boundary.className = 'day-boundary';
          boundary.textContent = parts.weekday;
          cell.appendChild(boundary);
        }

        cell.addEventListener('click', () => {
          state.selectedSlot = i;
          renderBoard();
          renderNowMarker();
          renderSummary();
        });

        board.appendChild(cell);
      });
    });

    board.style.gridTemplateRows = `30px repeat(${state.locations.length}, 66px)`;
    updateLiveClocks();
  }

  function renderNowMarker() {
    let marker = document.getElementById('nowMarker');
    if (marker) marker.remove();

    const { year, month, day } = selectedDateParts();
    const now = new Date();
    const home = homeLocation();
    const nowParts = getZonedParts(now, home.tz);
    const isToday = nowParts.year === year && nowParts.month === month + 1 && nowParts.day === day;
    if (!isToday) return;

    const firstSlot = state.slots[0].getTime();
    const offsetMinutes = (now.getTime() - firstSlot) / 60000;
    if (offsetMinutes < 0 || offsetMinutes > 24 * 60) return;

    const left = 230 + (offsetMinutes / SLOT_MINUTES) * CELL_WIDTH;
    marker = document.createElement('div');
    marker.id = 'nowMarker';
    marker.className = 'now-marker';
    marker.style.left = `${left}px`;
    marker.style.height = `${30 + state.locations.length * 66}px`;
    board.style.position = 'relative';
    board.appendChild(marker);
  }

  function updateLiveClocks() {
    document.querySelectorAll('[data-live-tz]').forEach((el) => {
      const tz = el.dataset.liveTz;
      const parts = getZonedParts(new Date(), tz);
      el.textContent = `Now ${formatTime(parts.hour, parts.minute, state.use24h)}`;
    });
  }

  function renderSummary() {
    if (state.selectedSlot === null) {
      summaryEl.innerHTML = '<div class="summary-empty">Click any time slot in the grid to pick a meeting time and compare it across every city.</div>';
      return;
    }
    const instant = state.slots[state.selectedSlot];
    const suggested = computeSuggestedSlots();

    let html = '<div class="summary-title">Meeting time</div>';
    state.locations.forEach((loc) => {
      const parts = getZonedParts(instant, loc.tz);
      const ok = isWithinWork(parts.hour);
      const home = homeLocation();
      const homeParts = getZonedParts(instant, home.tz);
      const dayDiff = parts.day !== homeParts.day || parts.month !== homeParts.month ? ` (${parts.weekday})` : '';
      html += `
        <div class="summary-item">
          <span class="summary-city">${escapeHtml(loc.city)}</span>
          <span class="summary-time ${ok ? 'ok' : 'warn'}">${formatTime(parts.hour, parts.minute, state.use24h)}${dayDiff}</span>
        </div>`;
    });

    const suggestedCount = suggested.filter(Boolean).length;
    html += `
      <div class="summary-suggest">
        <span class="legend"><span class="legend-swatch" style="background:#ffd60a"></span>Suggested overlap: ${suggestedCount ? suggestedCount * 0.5 + 'h across the day' : 'none found — try widening work hours'}</span>
        <button id="jumpSuggested">Jump to next suggested slot</button>
      </div>`;

    summaryEl.innerHTML = html;
    const jumpBtn = document.getElementById('jumpSuggested');
    if (jumpBtn) jumpBtn.addEventListener('click', jumpToNextSuggested);
  }

  function jumpToNextSuggested() {
    const suggested = computeSuggestedSlots();
    if (!suggested.some(Boolean)) return;
    let idx = (state.selectedSlot + 1) % SLOTS_PER_DAY;
    for (let i = 0; i < SLOTS_PER_DAY; i++) {
      if (suggested[idx]) break;
      idx = (idx + 1) % SLOTS_PER_DAY;
    }
    state.selectedSlot = idx;
    renderBoard();
    renderNowMarker();
    renderSummary();
    const cell = board.querySelector(`.timeline-cell[data-slot="${idx}"]`);
    if (cell) cell.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' });
  }

  function formatHour12Short(hour) {
    const period = hour >= 12 ? 'p' : 'a';
    let h12 = hour % 12;
    if (h12 === 0) h12 = 12;
    return `${h12}${period}`;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---- Location management ----

  function makeHome(index) {
    const [loc] = state.locations.splice(index, 1);
    state.locations.unshift(loc);
    persistLocations();
    render();
  }

  function removeLocation(index) {
    if (state.locations.length <= 1) return;
    state.locations.splice(index, 1);
    persistLocations();
    render();
  }

  let dragIndex = null;
  function onDragStart(e) {
    dragIndex = Number(e.currentTarget.dataset.index);
    e.dataTransfer.effectAllowed = 'move';
  }
  function onDragOver(e) {
    e.preventDefault();
  }
  function onDrop(e) {
    e.preventDefault();
    const dropIndex = Number(e.currentTarget.dataset.index);
    if (dragIndex === null || dragIndex === dropIndex) return;
    const [moved] = state.locations.splice(dragIndex, 1);
    state.locations.splice(dropIndex, 0, moved);
    dragIndex = null;
    persistLocations();
    render();
  }

  // ---- Add city search ----

  function searchCandidates(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const results = [];
    const seen = new Set();

    CITIES.forEach((c) => {
      if (results.length >= 8) return;
      if (c.city.toLowerCase().includes(q) || c.country.toLowerCase().includes(q) || c.tz.toLowerCase().includes(q)) {
        const key = c.city + '|' + c.tz;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({ city: c.city, country: c.country, tz: c.tz });
        }
      }
    });

    if (results.length < 8) {
      ALL_ZONES.forEach((tz) => {
        if (results.length >= 8) return;
        if (!tz.toLowerCase().includes(q)) return;
        if (results.some((r) => r.tz === tz)) return;
        const tail = tz.split('/').pop().replace(/_/g, ' ');
        results.push({ city: tail, country: tz, tz });
      });
    }

    return results;
  }

  function renderSuggestions(list) {
    if (!list.length) {
      suggestionsEl.innerHTML = '<div class="suggestion-empty">No matching city or time zone</div>';
      suggestionsEl.classList.remove('hidden');
      return;
    }
    suggestionsEl.innerHTML = list
      .map(
        (c, i) => `
      <div class="suggestion-item" data-index="${i}">
        <span class="suggestion-city">${escapeHtml(c.city)}</span>
        <span class="suggestion-meta">${escapeHtml(c.country)} · ${formatOffsetLabel(c.tz, new Date())}</span>
      </div>`
      )
      .join('');
    suggestionsEl.classList.remove('hidden');

    Array.from(suggestionsEl.querySelectorAll('.suggestion-item')).forEach((el, i) => {
      el.addEventListener('click', () => addCity(list[i]));
    });
  }

  function addCity(entry) {
    state.locations.push({ id: uid(), city: entry.city, country: entry.country, tz: entry.tz });
    persistLocations();
    citySearch.value = '';
    suggestionsEl.classList.add('hidden');
    render();
  }

  citySearch.addEventListener('input', () => {
    const list = searchCandidates(citySearch.value);
    if (citySearch.value.trim()) renderSuggestions(list);
    else suggestionsEl.classList.add('hidden');
  });

  citySearch.addEventListener('focus', () => {
    if (citySearch.value.trim()) renderSuggestions(searchCandidates(citySearch.value));
  });

  document.addEventListener('click', (e) => {
    if (!suggestionsEl.contains(e.target) && e.target !== citySearch) {
      suggestionsEl.classList.add('hidden');
    }
  });

  // ---- Top bar controls ----

  document.getElementById('prevDay').addEventListener('click', () => {
    state.selectedDate = new Date(state.selectedDate.getTime());
    state.selectedDate.setDate(state.selectedDate.getDate() - 1);
    state.selectedSlot = null;
    render();
  });

  document.getElementById('nextDay').addEventListener('click', () => {
    state.selectedDate = new Date(state.selectedDate.getTime());
    state.selectedDate.setDate(state.selectedDate.getDate() + 1);
    state.selectedSlot = null;
    render();
  });

  document.getElementById('todayBtn').addEventListener('click', () => {
    state.selectedDate = new Date();
    state.selectedSlot = null;
    render();
  });

  datePicker.addEventListener('change', () => {
    if (!datePicker.value) return;
    const [y, m, d] = datePicker.value.split('-').map(Number);
    state.selectedDate = new Date(y, m - 1, d);
    state.selectedSlot = null;
    render();
  });

  formatToggle.addEventListener('click', () => {
    state.use24h = !state.use24h;
    formatToggle.textContent = state.use24h ? '24h' : '12h';
    persistPrefs();
    render();
  });

  function onWorkHoursChange() {
    let start = Number(workStartInput.value);
    let end = Number(workEndInput.value);
    if (!Number.isFinite(start) || start < 0 || start > 23) start = state.workStart;
    if (!Number.isFinite(end) || end < 1 || end > 24 || end <= start) end = state.workEnd;
    state.workStart = start;
    state.workEnd = end;
    workStartInput.value = start;
    workEndInput.value = end;
    persistPrefs();
    render();
  }
  workStartInput.addEventListener('change', onWorkHoursChange);
  workEndInput.addEventListener('change', onWorkHoursChange);

  // ---- Live clock refresh ----
  setInterval(() => {
    updateLiveClocks();
    renderNowMarker();
  }, 30000);

  render();
})();
