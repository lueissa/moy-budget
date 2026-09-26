/**
 * Мой бюджет — персональный финансовый калькулятор
 * Данные хранятся в localStorage. Работает офлайн.
 */
(function () {
  "use strict";

  const STORAGE_KEY = "liza-finance-v1";

  const CATEGORIES = [
    { id: "food", name: "Еда", icon: "🍽️" },
    { id: "transport", name: "Транспорт", icon: "🚌" },
    { id: "housing", name: "Жильё", icon: "🏠" },
    { id: "comms", name: "Связь", icon: "📱" },
    { id: "health", name: "Здоровье", icon: "💊" },
    { id: "fun", name: "Развлечения", icon: "🎬" },
    { id: "other", name: "Другое", icon: "📦" },
  ];

  const rubFmt = new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  });

  const rubFmtDec = new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  function formatRub(n, withDecimals) {
    const v = Number(n) || 0;
    return (withDecimals ? rubFmtDec : rubFmt).format(v);
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function defaultState() {
    return {
      incomes: [],
      expenses: [],
      goal: null,
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return {
        incomes: Array.isArray(parsed.incomes) ? parsed.incomes : [],
        expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
        goal: parsed.goal && typeof parsed.goal === "object" ? parsed.goal : null,
      };
    } catch {
      return defaultState();
    }
  }

  function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  let state = loadState();

  /* ——— DOM ——— */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const elBalance = $("#balance-value");
  const elIncomeTotal = $("#income-total");
  const elExpenseTotal = $("#expense-total");
  const elIncomeList = $("#income-list");
  const elExpenseList = $("#expense-list");
  const elCatSummary = $("#cat-summary");
  const elGoalView = $("#goal-view");
  const elGoalForm = $("#goal-form");
  const elToast = $("#toast");
  const elModal = $("#reset-modal");
  const categorySelect = $("#expense-category");

  function toast(msg) {
    elToast.textContent = msg;
    elToast.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => elToast.classList.remove("show"), 2200);
  }

  function categoryById(id) {
    return CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
  }

  function totals() {
    const income = state.incomes.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const expense = state.expenses.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    return { income, expense, balance: income - expense };
  }

  function renderBalance() {
    const { income, expense, balance } = totals();
    elBalance.textContent = formatRub(balance);
    elBalance.classList.remove("positive", "negative", "zero");
    if (balance > 0) elBalance.classList.add("positive");
    else if (balance < 0) elBalance.classList.add("negative");
    else elBalance.classList.add("zero");
    elIncomeTotal.textContent = formatRub(income);
    elExpenseTotal.textContent = formatRub(expense);
  }

  function renderIncomes() {
    if (!state.incomes.length) {
      elIncomeList.innerHTML =
        '<li class="empty">Пока нет доходов. Добавьте зарплату или другой источник.</li>';
      return;
    }
    elIncomeList.innerHTML = state.incomes
      .map(
        (item) => `
      <li class="list-item" data-id="${item.id}">
        <div class="list-item__icon" aria-hidden="true">💰</div>
        <div class="list-item__body">
          <div class="list-item__name">${escapeHtml(item.name)}</div>
          <div class="list-item__meta">Доход</div>
        </div>
        <div class="list-item__amount income">+${formatRub(item.amount)}</div>
        <button type="button" class="btn-icon" data-action="del-income" aria-label="Удалить ${escapeHtml(item.name)}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
        </button>
      </li>`
      )
      .join("");
  }

  function renderExpenses() {
    const byCat = {};
    CATEGORIES.forEach((c) => (byCat[c.id] = 0));
    state.expenses.forEach((e) => {
      const id = byCat[e.category] !== undefined ? e.category : "other";
      byCat[id] += Number(e.amount) || 0;
    });
    const maxCat = Math.max(...Object.values(byCat), 1);
    const activeCats = CATEGORIES.filter((c) => byCat[c.id] > 0);

    if (activeCats.length) {
      elCatSummary.innerHTML = activeCats
        .map((c) => {
          const pct = Math.round((byCat[c.id] / maxCat) * 100);
          return `
          <div class="cat-bar">
            <div class="cat-bar__top">
              <span class="cat-bar__name">${c.icon} ${c.name}</span>
              <span class="cat-bar__sum">${formatRub(byCat[c.id])}</span>
            </div>
            <div class="cat-bar__track"><div class="cat-bar__fill" style="width:${pct}%"></div></div>
          </div>`;
        })
        .join("");
    } else {
      elCatSummary.innerHTML = "";
    }

    if (!state.expenses.length) {
      elExpenseList.innerHTML =
        '<li class="empty">Расходов пока нет. Добавьте покупку или платёж.</li>';
      return;
    }

    elExpenseList.innerHTML = state.expenses
      .map((item) => {
        const cat = categoryById(item.category);
        return `
      <li class="list-item" data-id="${item.id}">
        <div class="list-item__icon expense" aria-hidden="true">${cat.icon}</div>
        <div class="list-item__body">
          <div class="list-item__name">${escapeHtml(item.name)}</div>
          <div class="list-item__meta">${cat.name}</div>
        </div>
        <div class="list-item__amount expense">−${formatRub(item.amount)}</div>
        <button type="button" class="btn-icon" data-action="del-expense" aria-label="Удалить ${escapeHtml(item.name)}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
        </button>
      </li>`;
      })
      .join("");
  }

  function renderGoal() {
    if (!state.goal) {
      elGoalView.classList.add("hidden");
      elGoalView.innerHTML = "";
      elGoalForm.classList.remove("hidden");
      return;
    }

    elGoalForm.classList.add("hidden");
    elGoalView.classList.remove("hidden");

    const { name, target, saved } = state.goal;
    const t = Math.max(Number(target) || 0, 0);
    const s = Math.max(Number(saved) || 0, 0);
    const pct = t > 0 ? Math.min(100, Math.round((s / t) * 1000) / 10) : 0;
    const left = Math.max(t - s, 0);

    elGoalView.innerHTML = `
      <div class="goal-card">
        <div class="goal-card__name">${escapeHtml(name)}</div>
        <div class="goal-card__amounts">
          Накоплено ${formatRub(s)} из ${formatRub(t)}
          ${left > 0 ? ` · осталось ${formatRub(left)}` : " · цель достигнута! 🎉"}
        </div>
        <div class="goal-progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Прогресс цели">
          <div class="goal-progress__fill" style="width:${Math.min(pct, 100)}%"></div>
        </div>
        <div class="goal-progress__pct">${pct.toLocaleString("ru-RU")}%</div>
        <div class="goal-actions">
          <button type="button" class="btn-secondary" id="btn-goal-add">+ Пополнить</button>
          <button type="button" class="btn-secondary" id="btn-goal-edit">Изменить</button>
        </div>
        <button type="button" class="btn-reset" id="btn-goal-clear" style="width:100%;margin-top:10px">Удалить цель</button>
      </div>`;

    $("#btn-goal-add").addEventListener("click", onGoalAdd);
    $("#btn-goal-edit").addEventListener("click", onGoalEdit);
    $("#btn-goal-clear").addEventListener("click", onGoalClear);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function persistAndRender() {
    saveState(state);
    renderBalance();
    renderIncomes();
    renderExpenses();
    renderGoal();
  }

  /* ——— Actions ——— */
  function addIncome(e) {
    e.preventDefault();
    const form = e.target;
    const name = form.name.value.trim();
    const amount = parseFloat(String(form.amount.value).replace(",", "."));
    if (!name || !(amount > 0)) {
      toast("Укажите название и сумму больше 0");
      return;
    }
    state.incomes.unshift({ id: uid(), name, amount });
    form.reset();
    persistAndRender();
    toast("Доход добавлен");
  }

  function addExpense(e) {
    e.preventDefault();
    const form = e.target;
    const name = form.name.value.trim();
    const amount = parseFloat(String(form.amount.value).replace(",", "."));
    const category = form.category.value;
    if (!name || !(amount > 0)) {
      toast("Укажите название и сумму больше 0");
      return;
    }
    state.expenses.unshift({ id: uid(), name, amount, category });
    form.reset();
    form.category.value = "food";
    persistAndRender();
    toast("Расход добавлен");
  }

  function saveGoal(e) {
    e.preventDefault();
    const form = e.target;
    const name = form.goalName.value.trim();
    const target = parseFloat(String(form.goalTarget.value).replace(",", "."));
    const saved = parseFloat(String(form.goalSaved.value).replace(",", ".")) || 0;
    if (!name || !(target > 0)) {
      toast("Укажите название и сумму цели");
      return;
    }
    if (saved < 0) {
      toast("Накоплено не может быть отрицательным");
      return;
    }
    state.goal = { name, target, saved };
    form.reset();
    persistAndRender();
    toast("Цель сохранена");
  }

  function onGoalAdd() {
    const raw = prompt("Сколько добавить к накоплениям? (₽)", "1000");
    if (raw === null) return;
    const add = parseFloat(String(raw).replace(",", "."));
    if (!(add > 0)) {
      toast("Введите положительную сумму");
      return;
    }
    state.goal.saved = (Number(state.goal.saved) || 0) + add;
    persistAndRender();
    toast("Накопления обновлены");
  }

  function onGoalEdit() {
    const g = state.goal;
    $("#goal-name").value = g.name;
    $("#goal-target").value = g.target;
    $("#goal-saved").value = g.saved;
    elGoalForm.classList.remove("hidden");
    elGoalView.classList.add("hidden");
    $("#goal-name").focus();
  }

  function onGoalClear() {
    if (!confirm("Удалить цель накоплений?")) return;
    state.goal = null;
    persistAndRender();
    toast("Цель удалена");
  }

  /* ——— Calculators ——— */
  function calcPercent(e) {
    e.preventDefault();
    const form = e.target;
    const sum = parseFloat(String(form.sum.value).replace(",", "."));
    const pct = parseFloat(String(form.pct.value).replace(",", "."));
    const out = $("#pct-result");
    if (!(sum >= 0) || !(pct >= 0)) {
      toast("Введите корректные числа");
      return;
    }
    const result = (sum * pct) / 100;
    out.classList.remove("hidden");
    out.innerHTML = `${pct.toLocaleString("ru-RU")}% от ${formatRub(sum, true)}<strong>${formatRub(result, true)}</strong>`;
  }

  function calcMonthly(e) {
    e.preventDefault();
    const form = e.target;
    const target = parseFloat(String(form.target.value).replace(",", "."));
    const months = parseInt(form.months.value, 10);
    const already = parseFloat(String(form.already.value).replace(",", ".")) || 0;
    const out = $("#monthly-result");
    if (!(target > 0) || !(months > 0)) {
      toast("Укажите цель и число месяцев");
      return;
    }
    const left = Math.max(target - already, 0);
    const perMonth = left / months;
    out.classList.remove("hidden");
    if (left === 0) {
      out.innerHTML = `Цель уже достигнута!<strong>${formatRub(0)}</strong>`;
    } else {
      out.innerHTML = `Откладывайте каждый месяц (${months} мес.)<strong>${formatRub(perMonth, true)}</strong>`;
    }
  }

  /* ——— Tabs ——— */
  function switchTab(tabId) {
    $$(".tab").forEach((t) => {
      const on = t.dataset.tab === tabId;
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    $$(".panel").forEach((p) => {
      p.classList.toggle("active", p.id === "panel-" + tabId);
    });
  }

  /* ——— Reset ——— */
  function openResetModal() {
    elModal.classList.add("open");
  }

  function closeResetModal() {
    elModal.classList.remove("open");
  }

  function confirmReset() {
    state = defaultState();
    localStorage.removeItem(STORAGE_KEY);
    persistAndRender();
    closeResetModal();
    toast("Все данные сброшены");
  }

  /* ——— Init ——— */
  function fillCategories() {
    categorySelect.innerHTML = CATEGORIES.map(
      (c) => `<option value="${c.id}">${c.icon} ${c.name}</option>`
    ).join("");
  }

  function bind() {
    $("#form-income").addEventListener("submit", addIncome);
    $("#form-expense").addEventListener("submit", addExpense);
    $("#form-goal").addEventListener("submit", saveGoal);
    $("#form-pct").addEventListener("submit", calcPercent);
    $("#form-monthly").addEventListener("submit", calcMonthly);

    elIncomeList.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action='del-income']");
      if (!btn) return;
      const id = btn.closest("[data-id]").dataset.id;
      state.incomes = state.incomes.filter((i) => i.id !== id);
      persistAndRender();
      toast("Доход удалён");
    });

    elExpenseList.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action='del-expense']");
      if (!btn) return;
      const id = btn.closest("[data-id]").dataset.id;
      state.expenses = state.expenses.filter((i) => i.id !== id);
      persistAndRender();
      toast("Расход удалён");
    });

    $$(".tab").forEach((t) => {
      t.addEventListener("click", () => switchTab(t.dataset.tab));
    });

    $("#btn-open-reset").addEventListener("click", openResetModal);
    $("#btn-cancel-reset").addEventListener("click", closeResetModal);
    $("#btn-confirm-reset").addEventListener("click", confirmReset);
    elModal.addEventListener("click", (e) => {
      if (e.target === elModal) closeResetModal();
    });
  }

  fillCategories();
  bind();
  persistAndRender();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {
        /* stub — ок без HTTPS на file:// */
      });
    });
  }
})();
