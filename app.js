const STORAGE_PREFIX = 'juicePWA:';
const STORAGE_KEYS = {
  manualList: `${STORAGE_PREFIX}manualList`, // legacy aggregated ingredients
  manualSelections: `${STORAGE_PREFIX}manualSelections`,
  manualExtras: `${STORAGE_PREFIX}manualExtras`,
  pantry: `${STORAGE_PREFIX}pantry`,
  checkedList: `${STORAGE_PREFIX}checkedList`,
  completedDrinks: `${STORAGE_PREFIX}completedDrinks`,
  missingTolerance: `${STORAGE_PREFIX}missingTolerance`
};

const DATA_SOURCES = {
  recipes: 'data/recipes.json',
  plan: 'data/plan-7days.json',
  motivation: 'data/motivation.json'
};

const UNIT_CONVERSIONS = {
  tl: { unit: 'ml', factor: 5 }
};

const CATEGORY_ORDER = ['Obst', 'Gemüse', 'Kräuter/Gewürze', 'Öle/Extras', 'Sonstiges'];
const CATEGORY_MAP = {
  Obst: new Set(['orange', 'zitrone', 'grapefruit', 'limette', 'apfel', 'grüner apfel', 'ananas', 'blaubeeren']),
  Gemüse: new Set(['karotte', 'rote bete', 'selleriestange', 'sellerie', 'gurke', 'spinat', 'grünkohl']),
  'Kräuter/Gewürze': new Set(['ingwer', 'kurkuma', 'petersilie', 'minze']),
  'Öle/Extras': new Set(['hanföl'])
};

const DAILY_TARGET = 4;
const APP_ROUTES = ['recipes', 'list', 'filter', 'motivation'];
const REMINDER_TIPS = [
  'Flasche am Abend vorbereiten, damit der Morgen leicht startet.',
  'Wasser neben den Entsafter stellen – weniger Wege, mehr Routine.',
  'Verknüpfe den Saft mit einer bestehenden Gewohnheit (z. B. Frühstück).'
];

const state = {
  data: {
    recipes: [],
    plan: [],
    motivation: [],
    ingredientNames: []
  },
  ui: {
    route: 'recipes',
    selectedTags: new Set(),
    missingTolerance: readStorage(STORAGE_KEYS.missingTolerance, 5),
    quoteIndex: 0,
    scrollPositions: {}
  },
  manualSelections: readStorage(STORAGE_KEYS.manualSelections, []),
  manualExtras: readStorage(STORAGE_KEYS.manualExtras, readStorage(STORAGE_KEYS.manualList, {})),
  pantry: readStorage(STORAGE_KEYS.pantry, {}),
  checkedList: readStorage(STORAGE_KEYS.checkedList, {}),
  completedDrinks: readStorage(STORAGE_KEYS.completedDrinks, {})
};

state.ui.missingTolerance = 0;
writeStorage(STORAGE_KEYS.missingTolerance, state.ui.missingTolerance);

if (!Array.isArray(state.manualSelections)) {
  state.manualSelections = [];
  writeStorage(STORAGE_KEYS.manualSelections, state.manualSelections);
}

if (typeof state.manualExtras !== 'object' || state.manualExtras === null) {
  state.manualExtras = {};
  writeStorage(STORAGE_KEYS.manualExtras, state.manualExtras);
}

let deferredInstallPrompt = null;
let quoteRotationTimer = null;

async function init() {
  await loadData();
  bindNavigation();
  bindInstallPrompt();
  handleRouteChange();
  registerServiceWorker();
}

document.addEventListener('DOMContentLoaded', init);

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    console.warn('Storage read failed', key, err);
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn('Storage write failed', key, err);
  }
}

async function loadData() {
  try {
    const [recipes, plan, motivation] = await Promise.all([
      fetchJSON(DATA_SOURCES.recipes),
      fetchJSON(DATA_SOURCES.plan),
      fetchJSON(DATA_SOURCES.motivation)
    ]);

    state.data.recipes = recipes;
    state.data.plan = plan.days || [];
    state.data.motivation = motivation.quotes || [];
    state.data.ingredientNames = [...new Set(recipes.flatMap((r) => r.ingredients.map((i) => i.name)))].sort();
    state.ui.quoteIndex = getDailyQuoteIndex();
  } catch (error) {
    console.error('Daten konnten nicht geladen werden', error);
    renderError('Daten konnten nicht geladen werden. Bitte später erneut versuchen.');
  }
}

async function fetchJSON(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fehler beim Laden von ${url}`);
  }
  return response.json();
}

function bindNavigation() {
  const navButtons = document.getElementById('nav-buttons');
  if (navButtons) {
    navButtons.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-route]');
      if (!button) return;
      navigateTo(button.dataset.route);
    });
  }

  window.addEventListener('hashchange', handleRouteChange);
}

function navigateTo(route) {
  if (!APP_ROUTES.includes(route)) {
    route = 'recipes';
  }
  if (route === state.ui.route) {
    return;
  }
  saveCurrentScrollPosition();
  renderRoute.restoreScroll = true;
  if (`#/` + route !== window.location.hash) {
    window.location.hash = `#/` + route;
  } else {
    state.ui.route = route;
    renderRoute();
  }
}

function handleRouteChange() {
  const hash = window.location.hash.replace('#/', '');
  saveCurrentScrollPosition();
  renderRoute.restoreScroll = true;
  const route = APP_ROUTES.includes(hash) ? hash : 'recipes';
  state.ui.route = route;
  syncNavState();
  renderRoute();
}

function syncNavState() {
  const navButtons = document.getElementById('nav-buttons');
  if (!navButtons) return;
  navButtons.querySelectorAll('button[data-route]').forEach((button) => {
    button.classList.toggle('active', button.dataset.route === state.ui.route);
    button.setAttribute('aria-pressed', button.classList.contains('active'));
  });
}

function renderRoute() {
  const container = document.getElementById('app-main');
  if (!container) return;
  container.classList.remove('fade-in');
  void container.offsetWidth;
  container.classList.add('fade-in');

  stopQuoteRotation();

  switch (state.ui.route) {
    case 'recipes':
      container.innerHTML = getRecipesTemplate();
      attachRecipesEvents();
      break;
    case 'list':
      container.innerHTML = getShoppingTemplate();
      attachShoppingEvents();
      break;
    case 'filter':
      container.innerHTML = getFilterTemplate();
      attachFilterEvents();
      break;
    case 'motivation':
      container.innerHTML = getMotivationTemplate();
      attachMotivationEvents();
      startQuoteRotation();
      break;
    default:
      container.innerHTML = '<p>Seite nicht gefunden.</p>';
  }

  if (renderRoute.restoreScroll) {
    restoreScrollPosition();
    renderRoute.restoreScroll = false;
  }
}

function renderError(message) {
  const container = document.getElementById('app-main');
  if (!container) return;
  container.innerHTML = `<div class="panel">${message}</div>`;
}

// ---------------------- RECIPES VIEW ----------------------

function getRecipesTemplate() {
  const allTags = [...new Set(state.data.recipes.flatMap((r) => r.tags || []))].sort();
  const filteredRecipes = state.data.recipes.filter((recipe) => {
    const matchesTags = state.ui.selectedTags.size
      ? recipe.tags?.some((tag) => state.ui.selectedTags.has(tag))
      : true;
    return matchesTags;
  });

  return `
    <section class="view-header">
      <h1>Rezepte</h1>
      <div class="tag-list">
        ${allTags
          .map((tag) => {
            const active = state.ui.selectedTags.has(tag);
            return `<button class="tag ${active ? 'active' : ''}" data-tag="${tag}">${tag}</button>`;
          })
          .join('')}
      </div>
    </section>
    <section class="card-grid">
      ${filteredRecipes.map(recipeCard).join('')}
    </section>
  `;
}

function recipeCard(recipe) {
  const ingredients = recipe.ingredients
    .map((item) => `<li>${formatQuantity(item.qty)} ${item.unit} ${item.name}${item.note ? ` – ${item.note}` : ''}</li>`)
    .join('');
  const recipeImage = recipe.image || '🥤';
  const recipeColor = recipe.color || 'var(--md-sys-color-primary)';
  return `
    <article class="recipe-card modern-card" data-recipe="${recipe.id}" style="--recipe-color: ${recipeColor}">
      <div class="recipe-image">
        <span class="recipe-emoji">${recipeImage}</span>
        <div class="recipe-overlay">
          <span class="material-icons">visibility</span>
        </div>
      </div>
      <div class="recipe-content">
        <header class="recipe-header">
          <h2>${recipe.title}</h2>
          <p class="recipe-goal">${recipe.goal}</p>
        </header>
        <div class="recipe-stats">
          <div class="stat-item">
            <span class="material-icons">local_drink</span>
            <span>${recipe.serves_ml} ml</span>
          </div>
          <div class="stat-item">
            <span class="material-icons">restaurant</span>
            <span>1 Portion</span>
          </div>
        </div>
        <div class="ingredients-preview">
          <span class="material-icons">list</span>
          <span>${recipe.ingredients.map(item => item.name).join(', ')}</span>
        </div>
        <div class="tag-list">
          ${(recipe.tags || []).map((tag) => `<span class="tag">${tag}</span>`).join('')}
        </div>
        <div class="recipe-actions">
          <div class="portion-control">
            <label for="portion-${recipe.id}" class="portion-label">
              <span class="material-icons">add_circle</span>
              Portionen
            </label>
            <input
              id="portion-${recipe.id}"
              class="portion-input"
              type="number"
              min="1"
              max="6"
              step="1"
              value="1"
              inputmode="numeric"
            />
          </div>
          <mwc-button raised data-action="add" label="Hinzufügen">
            <span slot="icon" class="material-icons">add_shopping_cart</span>
          </mwc-button>
        </div>
      </div>
    </article>
  `;
}

function attachRecipesEvents() {
  document.querySelectorAll('.tag-list button[data-tag]').forEach((button) => {
    button.addEventListener('click', () => {
      const tag = button.dataset.tag;
      if (state.ui.selectedTags.has(tag)) {
        state.ui.selectedTags.delete(tag);
      } else {
        state.ui.selectedTags.add(tag);
      }
      renderRoute();
    });
  });

  document.querySelectorAll('.recipe-card').forEach((card) => {
    card.addEventListener('click', (event) => {
      const recipeId = card.dataset.recipe;
      if (!recipeId) return;
      const recipe = state.data.recipes.find((r) => r.id === recipeId);
      if (!recipe) return;
      const actionElement = getActionElement(event);
      const action = actionElement?.dataset.action;

      if (action === 'add') {
        event.stopPropagation();
        const portionInput = card.querySelector('.portion-input');
        const portions = clampNumber(parseInt(portionInput?.value, 10) || 1, 1, 6);
        portionInput.value = portions;
        addRecipeToManualList(recipe, portions);
        renderRoute();
      } else if (!event.target.closest('.recipe-actions') && !event.target.closest('input')) {
        openRecipeDialog(recipe);
      }
    });
  });
}

function openRecipeDialog(recipe) {
  const dialog = document.getElementById('recipe-dialog');
  if (!dialog) return;
  const ingredients = recipe.ingredients
    .map((item) => `<li>${formatQuantity(item.qty)} ${item.unit} ${item.name}${item.note ? ` – ${item.note}` : ''}</li>`)
    .join('');
  dialog.heading = recipe.title;
  dialog.innerHTML = `
    <div class="dialog-panel">
      <p><strong>Ziel:</strong> ${recipe.goal}</p>
      <p><strong>Menge:</strong> ${recipe.serves_ml} ml</p>
      <p><strong>Zubereitung:</strong> ${recipe.steps}</p>
      <h3>Zutaten</h3>
      <ul class="ingredients">${ingredients}</ul>
      <div class="tag-list">
        ${(recipe.tags || []).map((tag) => `<span class="tag">${tag}</span>`).join('')}
      </div>
    </div>
    <mwc-button dialogAction="close" slot="primaryAction" label="Schließen"></mwc-button>
  `;
  dialog.show();
}

function addRecipeToManualList(recipe, portions) {
  const entry = {
    id: `${recipe.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    recipeId: recipe.id,
    portions,
    active: true
  };
  state.manualSelections.push(entry);
  writeStorage(STORAGE_KEYS.manualSelections, state.manualSelections);
  showToast(`${recipe.title} hinzugefügt.`);
}

// ---------------------- SHOPPING LIST VIEW ----------------------

function getShoppingTemplate() {
  const totals = getShoppingTotals();
  const exportText = buildExportText(totals);

  return `
    <section class="view-header">
      <h1>Einkaufsliste</h1>
      <p>Aktiviere oder deaktiviere Rezepte, um deine Einkaufsliste zu steuern.</p>
    </section>
    <section class="panel">
      <h2>Rezepte in der Liste</h2>
      ${state.manualSelections.length
        ? `<div id="selection-list" class="list-section">
            ${state.manualSelections.map(renderSelectionCard).join('')}
          </div>`
        : '<p>Noch keine Rezepte hinzugefügt. Nutze „Zur Einkaufsliste“ auf der Rezeptseite.</p>'}
    </section>
    ${renderExtrasSection()}
    <section class="panel">
      <h2>Einkaufsliste</h2>
      ${totals.length ? totals.map(categoryBlock).join('') : '<p>Noch keine aktiven Zutaten.</p>'}
    </section>
    <section class="panel">
      <h2>Export</h2>
      <div class="inline-controls">
        <mwc-button outlined id="export-text" label="Download Text"></mwc-button>
        <mwc-button outlined id="export-csv" label="Download CSV"></mwc-button>
        <mwc-button outlined id="share-list" label="Teilen"></mwc-button>
      </div>
      <textarea class="export-output" readonly>${escapeHTML(exportText)}</textarea>
    </section>
  `;
}

function renderSelectionCard(selection) {
  const recipe = state.data.recipes.find((r) => r.id === selection.recipeId);
  const title = recipe ? recipe.title : selection.recipeId;
  const goal = recipe?.goal ? `<p class="selection-goal">${recipe.goal}</p>` : '';
  const portions = selection.portions || 1;
  const isActive = selection.active !== false;
  return `
    <article class="panel selection-card" data-entry="${selection.id}">
      <header class="selection-header">
        <h3>${title}</h3>
        <span class="selection-portions">${portions} Portion(en)</span>
      </header>
      ${goal}
      <div class="selection-actions">
        <label class="selection-toggle">
          <input type="checkbox" data-action="toggle-selection" data-entry="${selection.id}" ${isActive ? 'checked' : ''} />
          <span>Aktiv</span>
        </label>
        <div class="inline-controls">
          <button type="button" data-action="selection-minus" data-entry="${selection.id}">-</button>
          <button type="button" data-action="selection-plus" data-entry="${selection.id}">+</button>
          <button type="button" data-action="selection-remove" data-entry="${selection.id}">Entfernen</button>
        </div>
      </div>
    </article>
  `;
}

function renderExtrasSection() {
  const extras = Object.entries(state.manualExtras || {});
  if (!extras.length) {
    return `
      <section class="panel">
        <h2>Zusätzliche Zutaten</h2>
        <p>Fehlende Zutaten aus dem Filter landen hier.</p>
      </section>
    `;
  }

  return `
    <section class="panel">
      <h2>Zusätzliche Zutaten</h2>
      <div class="list-group" id="extras-list">
        ${extras
          .map(([key, item]) => `
            <div class="shopping-item" data-extra="${key}">
              <span>${formatQuantity(item.qty)} ${item.unit} ${item.name}</span>
              <button type="button" data-action="remove-extra" data-key="${key}">Entfernen</button>
            </div>
          `)
          .join('')}
      </div>
    </section>
  `;
}

function saveManualSelections() {
  writeStorage(STORAGE_KEYS.manualSelections, state.manualSelections);
}

function saveManualExtras() {
  writeStorage(STORAGE_KEYS.manualExtras, state.manualExtras);
}

function toggleManualSelection(entryId, isActive) {
  const selection = state.manualSelections.find((item) => item.id === entryId);
  if (!selection) return;
  selection.active = isActive;
  saveManualSelections();
  renderRoute();
}

function changeSelectionPortions(entryId, delta) {
  const selection = state.manualSelections.find((item) => item.id === entryId);
  if (!selection) return;
  const next = clampNumber((selection.portions || 1) + delta, 1, 12);
  if (next === selection.portions) return;
  selection.portions = next;
  saveManualSelections();
  renderRoute();
}

function removeManualSelection(entryId) {
  const index = state.manualSelections.findIndex((item) => item.id === entryId);
  if (index === -1) return;
  state.manualSelections.splice(index, 1);
  saveManualSelections();
  renderRoute();
}

function addExtraIngredient(name, qty, unit) {
  const normalized = normalizeIngredient(name, qty, unit);
  const key = getIngredientKey(normalized.name, normalized.unit);
  const existing = state.manualExtras[key];
  state.manualExtras[key] = {
    name: normalized.name,
    unit: normalized.unit,
    qty: roundTo((existing ? existing.qty : 0) + normalized.qty)
  };
  saveManualExtras();
}

function removeExtraIngredient(key) {
  if (state.manualExtras[key]) {
    delete state.manualExtras[key];
    saveManualExtras();
    renderRoute();
  }
}

function categoryBlock(group) {
  return `
    <article class="panel">
      <h3>${group.category}</h3>
      <div class="list-group">
        ${group.items
          .map((item) => {
            const key = getIngredientKey(item.name, item.unit);
            const checked = state.checkedList[key] ? 'checked' : '';
            return `
              <label class="shopping-item ${checked ? 'done' : ''}" data-key="${key}">
                <span>${formatQuantity(item.qty)} ${item.unit} ${item.name}</span>
                <input type="checkbox" ${checked} />
              </label>
            `;
          })
          .join('')}
      </div>
    </article>
  `;
}

function attachShoppingEvents() {
  document.querySelectorAll('input[data-action="toggle-selection"]').forEach((input) => {
    input.addEventListener('change', (event) => {
      const entryId = event.target.dataset.entry;
      const isActive = event.target.checked;
      toggleManualSelection(entryId, isActive);
    });
  });

  document.querySelectorAll('button[data-action="selection-minus"]').forEach((button) => {
    button.addEventListener('click', () => changeSelectionPortions(button.dataset.entry, -1));
  });

  document.querySelectorAll('button[data-action="selection-plus"]').forEach((button) => {
    button.addEventListener('click', () => changeSelectionPortions(button.dataset.entry, 1));
  });

  document.querySelectorAll('button[data-action="selection-remove"]').forEach((button) => {
    button.addEventListener('click', () => removeManualSelection(button.dataset.entry));
  });

  document.querySelectorAll('button[data-action="remove-extra"]').forEach((button) => {
    button.addEventListener('click', () => removeExtraIngredient(button.dataset.key));
  });

  document.querySelectorAll('label.shopping-item input[type="checkbox"]').forEach((box) => {
    box.addEventListener('change', (event) => {
      const label = event.target.closest('label.shopping-item');
      if (!label) return;
      const key = label.dataset.key;
      state.checkedList[key] = event.target.checked;
      if (!event.target.checked) {
        delete state.checkedList[key];
      }
      writeStorage(STORAGE_KEYS.checkedList, state.checkedList);
      label.classList.toggle('done', Boolean(state.checkedList[key]));
    });
  });

  const exportTextBtn = document.getElementById('export-text');
  if (exportTextBtn) {
    exportTextBtn.addEventListener('click', () => downloadShoppingList('juicy-einkauf.txt', 'text/plain'));
  }

  const exportCsvBtn = document.getElementById('export-csv');
  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', () => downloadShoppingList('juicy-einkauf.csv', 'text/csv'));
  }

  const shareBtn = document.getElementById('share-list');
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      if (!navigator.share) {
        showToast('Teilen wird von diesem Gerät nicht unterstützt.');
        return;
      }
      const totals = getShoppingTotals();
      const text = buildExportText(totals);
      try {
        await navigator.share({ title: 'Juicy Einkaufsliste', text });
      } catch (err) {
        console.warn('Share abgebrochen', err);
      }
    });
  }
}

function getShoppingTotals() {
  const totals = {};

  for (const selection of state.manualSelections) {
    if (selection.active === false) continue;
    const recipe = state.data.recipes.find((r) => r.id === selection.recipeId);
    if (!recipe) continue;
    for (const ingredient of recipe.ingredients) {
      const scaledQty = (ingredient.qty || 0) * (selection.portions || 1);
      addIngredientToTotals(totals, ingredient.name, scaledQty, ingredient.unit);
    }
  }

  for (const key of Object.keys(state.manualExtras || {})) {
    const item = state.manualExtras[key];
    if (!item) continue;
    addIngredientToTotals(totals, item.name, item.qty, item.unit);
  }

  const grouped = new Map();
  for (const key of Object.keys(totals)) {
    const item = totals[key];
    const category = categorizeIngredient(item.name);
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category).push(item);
  }

  return CATEGORY_ORDER.filter((category) => grouped.has(category)).map((category) => ({
    category,
    items: grouped
      .get(category)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((item) => ({ ...item }))
  }));
}

function addIngredientToTotals(totals, name, qty, unit) {
  const normalized = normalizeIngredient(name, qty, unit);
  const key = getIngredientKey(normalized.name, normalized.unit);
  const existing = totals[key];
  totals[key] = {
    name: normalized.name,
    unit: normalized.unit,
    qty: roundTo(existing ? existing.qty + normalized.qty : normalized.qty)
  };
}

function normalizeIngredient(name, qty, unit) {
  const trimmedName = name.trim();
  const lowerUnit = unit.trim().toLowerCase();
  if (UNIT_CONVERSIONS[lowerUnit]) {
    const { unit: targetUnit, factor } = UNIT_CONVERSIONS[lowerUnit];
    return {
      name: trimmedName,
      qty: qty * factor,
      unit: targetUnit
    };
  }
  return {
    name: trimmedName,
    qty,
    unit: lowerUnit
  };
}

function categorizeIngredient(name) {
  const lookupName = name.toLowerCase();
  for (const [category, values] of Object.entries(CATEGORY_MAP)) {
    if (values.has(lookupName)) {
      return category;
    }
  }
  return 'Sonstiges';
}

function buildExportText(totals) {
  if (!totals.length) return '';
  return totals
    .map((group) => {
      const items = group.items.map((item) => `- ${formatQuantity(item.qty)} ${item.unit} ${item.name}`).join('\n');
      return `${group.category}:\n${items}`;
    })
    .join('\n\n');
}

function downloadShoppingList(filename, mime) {
  const totals = getShoppingTotals();
  if (!totals.length) {
    showToast('Keine Zutaten zum Export.');
    return;
  }
  const text = mime === 'text/csv' ? buildCsv(totals) : buildExportText(totals);
  const blob = new Blob([text], { type: mime });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function buildCsv(totals) {
  const rows = [['Kategorie', 'Zutat', 'Menge', 'Einheit']];
  for (const group of totals) {
    for (const item of group.items) {
      rows.push([group.category, item.name, String(item.qty).replace('.', ','), item.unit]);
    }
  }
  return rows.map((row) => row.map((cell) => `"${cell}"`).join(';')).join('\n');
}

// ---------------------- FILTER VIEW ----------------------

function getFilterTemplate() {
let tolerance = clampNumber(Number(state.ui.missingTolerance) || 0, 0, 5);
  if (tolerance !== state.ui.missingTolerance) {
    state.ui.missingTolerance = tolerance;
    writeStorage(STORAGE_KEYS.missingTolerance, tolerance);
  }
  const pantryItems = Object.keys(state.pantry).sort((a, b) => a.localeCompare(b));
  const allNames = state.data.ingredientNames;
  const matches = getPantryMatches(tolerance);

  return `
    <section class="view-header">
      <h1>Filter</h1>
      <p>Was ist zu Hause?</p>
    </section>
    <section class="panel pantry-panel">
      <div class="panel-header">
        <h2>
          <span class="material-icons">kitchen</span>
          Speisekammer
        </h2>
        <p class="panel-subtitle">Verwalte deine vorhandenen Zutaten</p>
      </div>
      <form id="pantry-form" class="modern-form" autocomplete="off">
        <div class="form-row">
          <div class="input-group">
            <label for="pantry-name" class="input-label">
              <span class="material-icons">grass</span>
              Zutat
            </label>
            <input list="ingredient-suggestions" id="pantry-name" class="modern-input" placeholder="Zutat eingeben..." required />
            <datalist id="ingredient-suggestions">
              ${allNames.map((name) => `<option value="${name}"></option>`).join('')}
            </datalist>
          </div>
          <div class="input-group quantity-group">
            <label for="pantry-qty" class="input-label">
              <span class="material-icons">straighten</span>
              Menge
            </label>
            <input id="pantry-qty" class="modern-input quantity-input" type="number" step="0.5" min="0" placeholder="0" />
          </div>
          <div class="input-group">
            <label for="pantry-unit" class="input-label">
              <span class="material-icons">scale</span>
              Einheit
            </label>
            <select id="pantry-unit" class="modern-select">
              <option value="st">Stück</option>
              <option value="g">Gramm</option>
              <option value="ml">Milliliter</option>
              <option value="bund">Bund</option>
            </select>
          </div>
        </div>
        <div class="form-actions">
          <mwc-button raised label="Hinzufügen" type="submit">
            <span slot="icon" class="material-icons">add</span>
          </mwc-button>
          <mwc-button outlined id="clear-pantry" type="button" label="Alles leeren">
            <span slot="icon" class="material-icons">clear_all</span>
          </mwc-button>
        </div>
      </form>
      <div class="pantry-list">
        ${pantryItems.length
          ? pantryItems
              .map((name) => {
                const item = state.pantry[name];
                return `
                  <div class="shopping-item pantry-row" data-name="${name}">
                    <span>${name}</span>
                    <span>${item.qty ? formatQuantity(item.qty) : '—'} ${item.unit || ''}</span>
                    <div class="inline-controls">
                      <button type="button" data-action="decrement">-</button>
                      <button type="button" data-action="increment">+</button>
                      <button type="button" data-action="remove">Entfernen</button>
                    </div>
                  </div>
                `;
              })
              .join('')
          : '<p>Noch keine Zutaten gespeichert.</p>'}
      </div>
    </section>
    <section class="panel">
      <h2>Rezept-Match</h2>
      <div class="inline-controls">
        <label for="missing-range">Fehlende Zutaten ≤</label>
        <input type="range" id="missing-range" min="0" max="5" step="1" value="${tolerance}" />
        <span id="missing-value">${tolerance}</span>
      </div>
      <div class="card-grid">
        ${matches.length
          ? matches
              .map(
                ({ recipe, missing }) => `
                  <article class="recipe-card" data-match="${recipe.id}">
                    <h2>${recipe.title}</h2>
                    <p>${recipe.goal}</p>
                    <p>Fehlend: ${missing.length} (${missing.join(', ') || '—'})</p>
                    <mwc-button outlined data-action="details" label="Details"></mwc-button>
                    <mwc-button raised data-action="add-missing" label="Fehlende Zutaten zur Einkaufsliste hinzufügen"></mwc-button>
                  </article>
                `
              )
              .join('')
          : '<p>Keine passenden Rezepte gefunden.</p>'}
      </div>
    </section>
  `;
}

function attachFilterEvents() {
  const form = document.getElementById('pantry-form');
  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const nameInput = document.getElementById('pantry-name');
      const qtyInput = document.getElementById('pantry-qty');
      const unitSelect = document.getElementById('pantry-unit');
      const name = resolveIngredientName(nameInput.value);
      if (!name) return;
      const qty = qtyInput.value ? Number(qtyInput.value) : null;
      const existing = state.pantry[name] || {};
      const unit = qty !== null ? unitSelect.value : existing.unit || '';
      state.pantry[name] = {
        qty: qty !== null ? qty : existing.qty ?? null,
        unit
      };
      writeStorage(STORAGE_KEYS.pantry, state.pantry);
      nameInput.value = '';
      qtyInput.value = '';
      renderRoute();
    });

    const submitBtn = form.querySelector('mwc-button[type="submit"], mwc-button[raised]');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        if (typeof form.requestSubmit === 'function') {
          form.requestSubmit();
        } else {
          form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        }
      });
    }
  }

  document.querySelectorAll('.pantry-row button').forEach((button) => {
    button.addEventListener('click', () => {
      const row = button.closest('.pantry-row');
      if (!row) return;
      const name = row.dataset.name;
      const item = state.pantry[name] || { qty: 0, unit: 'st' };
      if (button.dataset.action === 'remove') {
        delete state.pantry[name];
      }
      if (button.dataset.action === 'increment') {
        item.qty = roundTo((item.qty || 0) + 1);
        if (!item.unit) item.unit = 'st';
        state.pantry[name] = item;
      }
      if (button.dataset.action === 'decrement') {
        item.qty = roundTo((item.qty || 0) - 1);
        if (item.qty <= 0) {
          delete state.pantry[name];
        } else {
          state.pantry[name] = item;
        }
      }
      writeStorage(STORAGE_KEYS.pantry, state.pantry);
      renderRoute();
    });
  });

  const clearBtn = document.getElementById('clear-pantry');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      state.pantry = {};
      writeStorage(STORAGE_KEYS.pantry, state.pantry);
      renderRoute();
    });
  }

  const range = document.getElementById('missing-range');
  if (range) {
    range.addEventListener('input', () => {
      document.getElementById('missing-value').textContent = range.value;
    });
    range.addEventListener('change', () => {
      const value = Number(range.value);
      state.ui.missingTolerance = value;
      document.getElementById('missing-value').textContent = value;
      writeStorage(STORAGE_KEYS.missingTolerance, value);
      renderRoute();
    });
  }

  document.querySelectorAll('.recipe-card[data-match]').forEach((card) => {
    card.addEventListener('click', (event) => {
      const recipeId = card.dataset.match;
      const recipe = state.data.recipes.find((r) => r.id === recipeId);
      if (!recipe) return;
      const actionElement = getActionElement(event);
      const action = actionElement?.dataset.action;
      if (action === 'details') {
        openRecipeDialog(recipe);
      }
      if (action === 'add-missing') {
        const matches = getPantryMatches(state.ui.missingTolerance);
        const match = matches.find((m) => m.recipe.id === recipeId);
        if (!match) return;
        for (const ingredientName of match.missing) {
          const ingredient = recipe.ingredients.find((i) => i.name === ingredientName);
          if (ingredient) {
            addExtraIngredient(ingredient.name, ingredient.qty, ingredient.unit);
          }
        }
        showToast('Fehlende Zutaten hinzugefügt.');
                renderRoute();
      }
    });
  });
}

function getPantryMatches(tolerance) {
  return state.data.recipes
    .map((recipe) => {
      const missing = recipe.ingredients
        .map((ingredient) => ingredient.name)
        .filter((name) => !state.pantry[name]);
      return { recipe, missing };
    })
    .filter(({ missing }) => missing.length <= tolerance)
    .sort((a, b) => a.missing.length - b.missing.length);
}

// ---------------------- MOTIVATION VIEW ----------------------

function getMotivationTemplate() {
  const today = getToday();
  const completed = state.completedDrinks[today] || 0;
  const quote = state.data.motivation[state.ui.quoteIndex] || 'Zeit für frische Energie!';
  const streak = calculateStreak();
  const progress = Math.min(completed / DAILY_TARGET, 1);

  return `
    <section class="view-header">
      <h1>Motivation</h1>
      <p>Täglicher Fokus & Fortschritt</p>
    </section>
    <section class="panel">
      <h2>Tages-Quote</h2>
      <p id="quote-text">${quote}</p>
      <mwc-button outlined id="next-quote" label="Nächster Impuls"></mwc-button>
    </section>
    <section class="panel progress-card">
      <canvas id="confetti-canvas"></canvas>
      <h2>Fortschritt heute</h2>
      <p>${completed} / ${DAILY_TARGET} Getränke</p>
      <mwc-linear-progress progress="${progress}" buffer="1"></mwc-linear-progress>
      <div class="inline-controls">
        <mwc-button outlined id="minus-drink" label="-"></mwc-button>
        <mwc-button raised id="plus-drink" label="+"></mwc-button>
        <mwc-button outlined id="reset-drink" label="Reset"></mwc-button>
      </div>
      <p class="streak">Streak: ${streak} Tag(e)</p>
    </section>
    <section class="panel">
      <h2>Reminder</h2>
      <ul>
        ${REMINDER_TIPS.map((tip) => `<li>${tip}</li>`).join('')}
      </ul>
    </section>
  `;
}

function attachMotivationEvents() {
  const today = getToday();
  const minusBtn = document.getElementById('minus-drink');
  const plusBtn = document.getElementById('plus-drink');
  const resetBtn = document.getElementById('reset-drink');
  const nextQuoteBtn = document.getElementById('next-quote');

  if (minusBtn) {
    minusBtn.addEventListener('click', () => updateCompleted(today, -1));
  }
  if (plusBtn) {
    plusBtn.addEventListener('click', () => updateCompleted(today, 1));
  }
  if (resetBtn) {
    resetBtn.addEventListener('click', () => setCompleted(today, 0));
  }
  if (nextQuoteBtn) {
    nextQuoteBtn.addEventListener('click', advanceQuote);
  }
}

function updateCompleted(dayKey, delta) {
  const current = state.completedDrinks[dayKey] || 0;
  const next = clampNumber(current + delta, 0, 10);
  setCompleted(dayKey, next);
}

function setCompleted(dayKey, value) {
  const previous = state.completedDrinks[dayKey] || 0;
  state.completedDrinks[dayKey] = value;
  writeStorage(STORAGE_KEYS.completedDrinks, state.completedDrinks);
  renderRoute();
  if (value >= DAILY_TARGET && previous < DAILY_TARGET) {
    triggerConfetti();
    showToast('Ziel erreicht! Konfetti!');
  }
}

function calculateStreak() {
  let streak = 0;
  for (let offset = 0; offset < 30; offset++) {
    const day = getDateWithOffset(-offset);
    const completed = state.completedDrinks[day] || 0;
    if (completed >= DAILY_TARGET) {
      streak += 1;
    } else {
      break;
    }
  }
  return streak;
}

function advanceQuote() {
  if (!state.data.motivation.length) return;
  state.ui.quoteIndex = (state.ui.quoteIndex + 1) % state.data.motivation.length;
  const quoteEl = document.getElementById('quote-text');
  if (quoteEl) {
    quoteEl.textContent = state.data.motivation[state.ui.quoteIndex];
  }
}

function startQuoteRotation() {
  stopQuoteRotation();
  if (!state.data.motivation.length) return;
  quoteRotationTimer = setInterval(() => {
    state.ui.quoteIndex = (state.ui.quoteIndex + 1) % state.data.motivation.length;
    const quoteEl = document.getElementById('quote-text');
    if (quoteEl) {
      quoteEl.textContent = state.data.motivation[state.ui.quoteIndex];
    }
  }, 15000);
}

function stopQuoteRotation() {
  if (quoteRotationTimer) {
    clearInterval(quoteRotationTimer);
    quoteRotationTimer = null;
  }
}

function saveCurrentScrollPosition() {
  const position = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
  state.ui.scrollPositions[state.ui.route] = position;
}

function restoreScrollPosition() {
  const position = state.ui.scrollPositions[state.ui.route] || 0;
  if (typeof window.scrollTo === 'function') {
    window.scrollTo({ top: position, left: 0, behavior: 'auto' });
  } else {
    document.documentElement.scrollTop = position;
    document.body.scrollTop = position;
  }
}

function triggerConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const { width } = canvas.parentElement.getBoundingClientRect();
  canvas.width = width;
  canvas.height = 160;
  const particles = Array.from({ length: 80 }, () => ({
    x: Math.random() * canvas.width,
    y: -Math.random() * 50,
    size: 4 + Math.random() * 4,
    speed: 2 + Math.random() * 3,
    color: `hsl(${Math.floor(Math.random() * 360)}, 80%, 60%)`
  }));

  let frames = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((particle) => {
      particle.y += particle.speed;
      particle.x += Math.sin(particle.y / 15);
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
    });
    frames += 1;
    if (frames < 90) {
      requestAnimationFrame(draw);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
  draw();
}

// ---------------------- INSTALL & SW ----------------------

function bindInstallPrompt() {
  const installBtn = document.getElementById('install-btn');
  if (!installBtn) return;

  // Check if running as standalone PWA
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                       window.navigator.standalone === true;

  // Check if iOS
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

  // Hide button if already installed
  if (isStandalone) {
    installBtn.classList.add('hidden');
    return;
  }

  // For iOS, show button with different behavior
  if (isIOS) {
    installBtn.classList.remove('hidden');
    installBtn.addEventListener('click', () => {
      showToast('Tippe auf Teilen-Symbol und wähle "Zum Home-Bildschirm"');
    });
    return;
  }

  // For other browsers, hide initially
  installBtn.classList.add('hidden');

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installBtn.classList.remove('hidden');
  });

  installBtn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) {
      showToast('Installationshinweis nicht verfügbar.');
      return;
    }
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') {
      showToast('App wird installiert.');
    }
    deferredInstallPrompt = null;
    installBtn.classList.add('hidden');
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('service-worker.js')
      .catch((err) => console.error('Service Worker Registrierung fehlgeschlagen', err));
  });
}

// ---------------------- UTILITIES ----------------------

function getIngredientKey(name, unit) {
  return `${name.toLowerCase()}__${unit}`;
}

function getActionElement(event) {
  if (typeof event.composedPath === 'function') {
    const path = event.composedPath();
    for (const node of path) {
      if (node instanceof Element && node.dataset && node.dataset.action) {
        return node;
      }
    }
  }
  if (event.target && event.target.closest) {
    return event.target.closest('[data-action]');
  }
  return null;
}

function resolveIngredientName(input) {
  const value = (input || '').trim();
  if (!value) return '';
  const lower = value.toLowerCase();
  const match = state.data.ingredientNames.find((name) => name.toLowerCase() === lower);
  if (match) return match;
  return value
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function formatQuantity(value) {
  if (value == null) return '';
  if (Math.abs(value - Math.round(value)) < 0.05) {
    return String(Math.round(value));
  }
  return value.toFixed(1);
}

function roundTo(value, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHTML(text) {
  return String(text).replace(/[&<>'"]/g, (char) => {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    };
    return entities[char] || char;
  });
}

function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.open = false;
  requestAnimationFrame(() => {
    toast.labelText = message;
    toast.open = true;
  });
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function getDateWithOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function getDailyQuoteIndex() {
  if (!state.data.motivation.length) return 0;
  const today = new Date();
  const seed = today.getFullYear() * 1000 + today.getMonth() * 32 + today.getDate();
  return seed % state.data.motivation.length;
}
