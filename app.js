/**
 * Мой бюджет — персональный финансовый калькулятор
 * Данные в localStorage. Работает офлайн.
 */
(function () {
  "use strict";

  const STORAGE_KEY = "moy-budget-v2";
  const LEGACY_KEY = "liza-finance-v1";
  const ONBOARD_KEY = "moy-budget-onboarded";

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

  const monthFmt = new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
  });

  function formatRub(n, withDecimals) {
    const v = Number(n) || 0;
    return (withDecimals ? rubFmtDec : rubFmt).format(v);
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function monthKey(d) {
    const dt = d instanceof Date ? d : new Date(d);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    return y + "-" + m;
  }

  function parseMonthKey(key) {
    const [y, m] = key.split("-").map(Number);
    return new Date(y, m - 1, 1);
  }

  function shiftMonth(key, delta) {
    const d = parseMonthKey(key);
    d.setMonth(d.getMonth() + delta);
    return monthKey(d);
  }

  function defaultState() {
    return {
      incomes: [],
      expenses: [],
      goal: null,
      budgets: {},
    };
  }

  function migrateLegacy(parsed) {
    const now = monthKey(new Date());
    const incomes = (Array.isArray(parsed.incomes) ? parsed.incomes : []).map((i) => ({
      id: i.id || uid(),
      name: i.name || "Доход",
      amount: Number(i.amount) || 0,
      month: i.month || now,
      createdAt: i.createdAt || Date.now(),
    }));
    const expenses = (Array.isArray(parsed.expenses) ? parsed.expenses : []).map((e) => ({
      id: e.id || uid(),
      name: e.name || "Расход",
      amount: Number(e.amount) || 0,
      category: e.category || "other",
      month: e.month || now,
      createdAt: e.createdAt || Date.now(),
    }));
    return {
      incomes,
      expenses,
      goal: parsed.goal && typeof parsed.goal === "object" ? parsed.goal : null,
      budgets: parsed.budgets && typeof parsed.budgets === "object" ? parsed.budgets : {},
    };
  }

  function loadState() {
    try {
      let raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const legacy = localStorage.getItem(LEGACY_KEY);
        if (legacy) {
          const migrated = migrateLegacy(JSON.parse(legacy));
          localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
          return migrated;
        }
        return defaultState();
      }
      return migrateLegacy(JSON.parse(raw));
    } catch {
      return defaultState();
    }
  }

  function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  let state = loadState();
  let currentMonth = monthKey(new Date());
  let opsFilter = "all";
  let editingGoal = false;

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const elBalance = $("#balance-value");
  const elIncomeTotal = $("#income-total");
  const elExpenseTotal = $("#expense-total");
  const elMonthLabel = $("#month-label");
  const elHomeOps = $("#home-ops-list");
  const elOpsList = $("#ops-list");
  const elHomeGoal = $("#home-goal-preview");
  const elHomeBudget = $("#home-budget-preview");
  const elGoalView = $("#goal-view");
  const elGoalForm = $("#form-goal");
  const elToast = $("#toast");
  const elOnboarding = $("#onboarding");
  const categorySelect = $("#op-category");

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function toast(msg) {
    elToast.textContent = msg;
    elToast.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      elToast.hidden = true;
    }, 2200);
  }

  function categoryById(id) {
    return CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
  }

  function monthIncomes() {
    return state.incomes.filter((i) => i.month === currentMonth);
  }

  function monthExpenses() {
    return state.expenses.filter((e) => e.month === currentMonth);
  }

  function getTotals() {
    const income = monthIncomes().reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const expense = monthExpenses().reduce((s, i) => s + (Number(i.amount) || 0), 0);
    return { income, expense, balance: income - expense };
  }

  function renderMonthLabel() {
    elMonthLabel.textContent = monthFmt.format(parseMonthKey(currentMonth));
    // навигация по месяцам без ограничений — можно смотреть будущее/прошлое
  }

  function renderBalance() {
    const { income, expense, balance } = getTotals();
    elBalance.textContent = formatRub(balance);
    elBalance.classList.remove("positive", "negative", "zero");
    if (balance > 0) elBalance.classList.add("positive");
    else if (balance < 0) elBalance.classList.add("negative");
    else elBalance.classList.add("zero");
    elIncomeTotal.textContent = formatRub(income);
    elExpenseTotal.textContent = formatRub(expense);
  }

  function opRowHtml(item, type) {
    const isIncome = type === "income";
    const cat = isIncome ? null : categoryById(item.category);
    const icon = isIncome ? "💰" : cat.icon;
    const meta = isIncome ? "Доход" : cat.name;
    const amountCls = isIncome ? "income" : "expense";
    const sign = isIncome ? "+" : "−";
    const action = isIncome ? "del-income" : "del-expense";
    return `
      <div class="op-item" data-id="${item.id}" data-type="${type}">
        <div class="op-icon ${amountCls}" aria-hidden="true">${icon}</div>
        <div class="op-body">
          <div class="op-title">${escapeHtml(item.name)}</div>
          <div class="op-meta">${meta}</div>
        </div>
        <div class="op-amount ${amountCls}">${sign}${formatRub(item.amount)}</div>
        <button type="button" class="op-delete" data-action="${action}" aria-label="Удалить ${escapeHtml(item.name)}">×</button>
      </div>`;
  }

  function allMonthOps() {
    const ops = [
      ...monthIncomes().map((i) => ({ ...i, _type: "income" })),
      ...monthExpenses().map((e) => ({ ...e, _type: "expense" })),
    ];
    ops.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return ops;
  }

  function emptyOpsHtml(filter) {
    if (filter === "income") {
      return `<div class="empty-hint"><span class="empty-hint__emoji">💰</span>Пока нет доходов за этот месяц.<br>Нажмите «+ Доход» на главной.</div>`;
    }
    if (filter === "expense") {
      return `<div class="empty-hint"><span class="empty-hint__emoji">🧾</span>Расходов пока нет.<br>Добавьте покупку или платёж.</div>`;
    }
    return `<div class="empty-hint"><span class="empty-hint__emoji">✨</span>Пока тихо — операций нет.<br>Добавьте первый доход или расход.</div>`;
  }

  function renderOpsList(container, limit, filter) {
    let ops = allMonthOps();
    if (filter === "income") ops = ops.filter((o) => o._type === "income");
    if (filter === "expense") ops = ops.filter((o) => o._type === "expense");
    if (limit) ops = ops.slice(0, limit);

    if (!ops.length) {
      container.innerHTML = emptyOpsHtml(filter || "all");
      return;
    }
    container.innerHTML = ops.map((o) => opRowHtml(o, o._type)).join("");
  }

  function progressClass(pct) {
    if (pct >= 100) return "over";
    if (pct >= 80) return "warn";
    return "";
  }

  function chipClass(pct) {
    if (pct >= 100) return "over";
    if (pct >= 80) return "warn";
    return "ok";
  }

  function renderBudgets(container) {
    const spent = {};
    CATEGORIES.forEach((c) => (spent[c.id] = 0));
    monthExpenses().forEach((e) => {
      const id = spent[e.category] !== undefined ? e.category : "other";
      spent[id] += Number(e.amount) || 0;
    });

    const withLimit = CATEGORIES.filter((c) => Number(state.budgets[c.id]) > 0);
    if (!withLimit.length) {
      container.innerHTML = `<div class="empty-hint"><span class="empty-hint__emoji">📊</span>Лимиты ещё не заданы.<br>Настройте бюджет по категориям — и увидите прогресс.</div>`;
      return;
    }

    container.innerHTML = withLimit
      .map((c) => {
        const limit = Number(state.budgets[c.id]) || 0;
        const use = spent[c.id] || 0;
        const pct = limit > 0 ? Math.min(999, Math.round((use / limit) * 100)) : 0;
        const barPct = Math.min(100, pct);
        const cls = progressClass(pct);
        return `
          <div class="budget-item">
            <div class="budget-item-top">
              <div class="budget-cat">${c.icon} ${c.name}</div>
              <span class="chip ${chipClass(pct)}">${pct}%</span>
            </div>
            <div class="budget-nums" style="margin-bottom:8px">${formatRub(use)} из ${formatRub(limit)}</div>
            <div class="progress-bar" role="progressbar" aria-valuenow="${barPct}" aria-valuemin="0" aria-valuemax="100" aria-label="Лимит ${c.name}">
              <div class="progress-fill ${cls}" style="width:${barPct}%"></div>
            </div>
          </div>`;
      })
      .join("");
  }

  function goalRingSvg(pct) {
    const r = 28;
    const c = 2 * Math.PI * r;
    const offset = c - (Math.min(pct, 100) / 100) * c;
    const stroke = pct >= 100 ? "var(--income)" : "var(--accent)";
    return `
      <svg class="goal-ring" viewBox="0 0 72 72" aria-hidden="true">
        <circle class="track" cx="36" cy="36" r="${r}"></circle>
        <circle class="fill" cx="36" cy="36" r="${r}"
          stroke="${stroke}"
          stroke-dasharray="${c}"
          stroke-dashoffset="${offset}"></circle>
      </svg>`;
  }

  function renderGoalCard(compact) {
    if (!state.goal) {
      if (compact) {
        return `<div class="empty-hint"><span class="empty-hint__emoji">🎯</span>Цели пока нет.<br>Задайте, на что копите — телефон, отпуск или подушку.</div>`;
      }
      return "";
    }

    const { name, target, saved } = state.goal;
    const t = Math.max(Number(target) || 0, 0);
    const s = Math.max(Number(saved) || 0, 0);
    const pct = t > 0 ? Math.min(100, Math.round((s / t) * 1000) / 10) : 0;
    const left = Math.max(t - s, 0);
    const done = left === 0;

    const actions = compact
      ? `<div class="goal-actions">
           <button type="button" class="btn secondary" data-action="goal-add">+ Отложить</button>
           <button type="button" class="btn secondary" data-nav="goals">Открыть</button>
         </div>`
      : `<div class="goal-actions">
           <button type="button" class="btn primary" data-action="goal-add">+ Отложить</button>
           <button type="button" class="btn secondary" data-action="goal-edit">Изменить</button>
         </div>
         <button type="button" class="btn danger block" data-action="goal-clear" style="margin-top:10px">Удалить цель</button>`;

    return `
      <div class="goal-item">
        <div class="goal-item-top">
          <div>
            <div class="goal-name">${escapeHtml(name)}</div>
            <span class="goal-amounts">${
              done
                ? "Цель достигнута! 🎉"
                : `осталось ${formatRub(left)}`
            }</span>
          </div>
          <div class="goal-pct">${pct.toLocaleString("ru-RU")}%</div>
        </div>
        <div class="goal-ring-wrap">
          ${goalRingSvg(pct)}
          <div class="goal-ring-meta">
            <div style="font-weight:650;font-size:1.05rem">${formatRub(s)}</div>
            <div class="muted small">из ${formatRub(t)}</div>
            <div class="progress-bar" style="margin-top:10px" role="progressbar" aria-valuenow="${Math.min(pct, 100)}" aria-valuemin="0" aria-valuemax="100">
              <div class="progress-fill" style="width:${Math.min(pct, 100)}%"></div>
            </div>
          </div>
        </div>
        ${actions}
      </div>`;
  }

  function renderGoal() {
    elHomeGoal.innerHTML = renderGoalCard(true);

    if (!state.goal || editingGoal) {
      elGoalView.innerHTML = state.goal && editingGoal ? "" : `<div class="empty-hint" style="margin-bottom:14px"><span class="empty-hint__emoji">🎯</span>Создайте цель накоплений — и следите за прогрессом.</div>`;
      if (!state.goal || editingGoal) {
        elGoalForm.hidden = false;
        $("#goal-form-title").textContent = editingGoal ? "Изменить цель" : "Новая цель";
        $("#btn-goal-cancel").hidden = !editingGoal;
      }
    } else {
      elGoalView.innerHTML = renderGoalCard(false);
      elGoalForm.hidden = true;
      editingGoal = false;
    }
  }

  function persistAndRender() {
    saveState(state);
    renderMonthLabel();
    renderBalance();
    renderOpsList(elHomeOps, 5, "all");
    renderOpsList(elOpsList, null, opsFilter);
    renderBudgets(elHomeBudget);
    renderGoal();
  }

  /* ——— Navigation ——— */
  function switchScreen(id) {
    $$(".screen").forEach((s) => {
      const on = s.dataset.screen === id;
      s.classList.toggle("active", on);
      s.hidden = !on;
    });
    $$(".nav-item").forEach((n) => {
      const on = n.dataset.nav === id;
      n.classList.toggle("active", on);
      n.setAttribute("aria-selected", on ? "true" : "false");
    });
    if (id === "goals" && !state.goal) {
      elGoalForm.hidden = false;
    }
  }

  /* ——— Modals ——— */
  function openModal(id) {
    const m = $("#" + id);
    if (!m) return;
    m.hidden = false;
  }

  function closeModal(el) {
    const m = el && el.closest ? el.closest(".modal") : el;
    if (m) m.hidden = true;
  }

  function closeAllModals() {
    $$(".modal").forEach((m) => (m.hidden = true));
  }

  function openOpModal(type) {
    const isIncome = type === "income";
    $("#op-type").value = type;
    $("#modal-op-title").textContent = isIncome ? "Новый доход" : "Новый расход";
    $("#op-name").placeholder = isIncome ? "Зарплата, подработка…" : "Продукты, метро…";
    $("#op-category-wrap").hidden = isIncome;
    $("#form-op").reset();
    $("#op-type").value = type;
    if (!isIncome) categorySelect.value = "food";
    $("#btn-op-submit").textContent = "Добавить";
    openModal("modal-op");
    setTimeout(() => $("#op-name").focus(), 50);
  }

  function fillCategories() {
    categorySelect.innerHTML = CATEGORIES.map(
      (c) => `<option value="${c.id}">${c.icon} ${c.name}</option>`
    ).join("");
  }

  function fillBudgetFields() {
    const box = $("#budgets-fields");
    box.innerHTML = CATEGORIES.map((c) => {
      const val = state.budgets[c.id] || "";
      return `
        <div class="budget-form-row">
          <span class="cat-label">${c.icon} ${c.name}</span>
          <input class="field-input" type="number" inputmode="decimal" min="0" step="any"
            name="budget-${c.id}" data-cat="${c.id}" placeholder="нет" value="${val}" />
        </div>`;
    }).join("");
  }

  /* ——— Actions ——— */
  function addOperation(e) {
    e.preventDefault();
    const form = e.target;
    const type = form.type.value;
    const name = form.name.value.trim();
    const amount = parseFloat(String(form.amount.value).replace(",", "."));
    if (!name || !(amount > 0)) {
      toast("Укажите название и сумму больше 0");
      return;
    }
    const entry = {
      id: uid(),
      name,
      amount,
      month: currentMonth,
      createdAt: Date.now(),
    };
    if (type === "income") {
      state.incomes.unshift(entry);
      toast("Доход добавлен");
    } else {
      entry.category = form.category.value || "other";
      state.expenses.unshift(entry);
      toast("Расход добавлен");
    }
    closeModal($("#modal-op"));
    persistAndRender();
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
    form.goalSaved.value = "0";
    editingGoal = false;
    persistAndRender();
    toast("Цель сохранена");
  }

  function onGoalAddSubmit(e) {
    e.preventDefault();
    if (!state.goal) return;
    const raw = $("#goal-add-amount").value;
    const add = parseFloat(String(raw).replace(",", "."));
    if (!(add > 0)) {
      toast("Введите положительную сумму");
      return;
    }
    state.goal.saved = (Number(state.goal.saved) || 0) + add;
    closeModal($("#modal-goal-add"));
    persistAndRender();
    toast("Накопления обновлены");
  }

  function onGoalEdit() {
    if (!state.goal) return;
    editingGoal = true;
    const g = state.goal;
    $("#goal-name").value = g.name;
    $("#goal-target").value = g.target;
    $("#goal-saved").value = g.saved;
    elGoalForm.hidden = false;
    $("#goal-form-title").textContent = "Изменить цель";
    $("#btn-goal-cancel").hidden = false;
    elGoalView.innerHTML = "";
    $("#goal-name").focus();
  }

  function onGoalClear() {
    if (!state.goal) return;
    if (!confirm("Удалить цель накоплений?")) return;
    state.goal = null;
    editingGoal = false;
    elGoalForm.reset();
    $("#goal-saved").value = "0";
    persistAndRender();
    toast("Цель удалена");
  }

  function saveBudgets(e) {
    e.preventDefault();
    const next = {};
    $$("#budgets-fields [data-cat]").forEach((input) => {
      const v = parseFloat(String(input.value).replace(",", "."));
      if (v > 0) next[input.dataset.cat] = v;
    });
    state.budgets = next;
    closeModal($("#modal-budgets"));
    persistAndRender();
    toast("Лимиты сохранены");
  }

  function calcPercent(e) {
    e.preventDefault();
    const form = e.target;
    const sum = parseFloat(String(form.sum.value).replace(",", "."));
    const pct = parseFloat(String(form.pct.value).replace(",", "."));
    const out = $("#pct-result");
    if (!(sum >= 0) || !(pct >= 0) || Number.isNaN(sum) || Number.isNaN(pct)) {
      toast("Введите корректные числа");
      return;
    }
    const result = (sum * pct) / 100;
    out.hidden = false;
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
    out.hidden = false;
    if (left === 0) {
      out.innerHTML = `Цель уже достигнута!<strong>${formatRub(0)}</strong>`;
    } else {
      out.innerHTML = `Откладывайте каждый месяц (${months} мес.)<strong>${formatRub(perMonth, true)}</strong>`;
    }
  }

  function confirmReset() {
    state = defaultState();
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_KEY);
    editingGoal = false;
    elGoalForm.reset();
    $("#goal-saved").value = "0";
    persistAndRender();
    closeModal($("#reset-modal"));
    toast("Все данные сброшены");
  }

  function dismissOnboarding() {
    localStorage.setItem(ONBOARD_KEY, "1");
    elOnboarding.hidden = true;
  }

  function bind() {
    $("#form-op").addEventListener("submit", addOperation);
    $("#form-goal").addEventListener("submit", saveGoal);
    $("#form-goal-add").addEventListener("submit", onGoalAddSubmit);
    $("#form-budgets").addEventListener("submit", saveBudgets);
    $("#form-pct").addEventListener("submit", calcPercent);
    $("#form-monthly").addEventListener("submit", calcMonthly);

    $("#btn-quick-income").addEventListener("click", () => openOpModal("income"));
    $("#btn-quick-expense").addEventListener("click", () => openOpModal("expense"));
    $("#btn-edit-budgets").addEventListener("click", () => {
      fillBudgetFields();
      openModal("modal-budgets");
    });
    $("#btn-edit-budgets-more").addEventListener("click", () => {
      fillBudgetFields();
      openModal("modal-budgets");
    });

    $("#btn-month-prev").addEventListener("click", () => {
      currentMonth = shiftMonth(currentMonth, -1);
      persistAndRender();
    });
    $("#btn-month-next").addEventListener("click", () => {
      currentMonth = shiftMonth(currentMonth, 1);
      persistAndRender();
    });

    $$(".nav-item").forEach((n) => {
      n.addEventListener("click", () => switchScreen(n.dataset.nav));
    });
    $("#btn-goto-more").addEventListener("click", () => switchScreen("more"));

    $$(".filter-tabs .tab").forEach((t) => {
      t.addEventListener("click", () => {
        opsFilter = t.dataset.filter;
        $$(".filter-tabs .tab").forEach((x) => {
          const on = x === t;
          x.classList.toggle("active", on);
          x.setAttribute("aria-selected", on ? "true" : "false");
        });
        renderOpsList(elOpsList, null, opsFilter);
      });
    });

    document.addEventListener("click", (e) => {
      const navBtn = e.target.closest("[data-nav]");
      if (navBtn && !navBtn.classList.contains("nav-item")) {
        switchScreen(navBtn.dataset.nav);
        return;
      }
      const delInc = e.target.closest("[data-action='del-income']");
      const delExp = e.target.closest("[data-action='del-expense']");
      if (delInc) {
        const id = delInc.closest("[data-id]").dataset.id;
        state.incomes = state.incomes.filter((i) => i.id !== id);
        persistAndRender();
        toast("Доход удалён");
        return;
      }
      if (delExp) {
        const id = delExp.closest("[data-id]").dataset.id;
        state.expenses = state.expenses.filter((i) => i.id !== id);
        persistAndRender();
        toast("Расход удалён");
        return;
      }
      if (e.target.closest("[data-action='goal-add']")) {
        if (!state.goal) {
          switchScreen("goals");
          return;
        }
        $("#form-goal-add").reset();
        openModal("modal-goal-add");
        setTimeout(() => $("#goal-add-amount").focus(), 50);
        return;
      }
      if (e.target.closest("[data-action='goal-edit']")) {
        onGoalEdit();
        return;
      }
      if (e.target.closest("[data-action='goal-clear']")) {
        onGoalClear();
        return;
      }
      if (e.target.matches("[data-close-modal]") || e.target.closest("[data-close-modal]")) {
        closeModal(e.target);
      }
    });

    $("#btn-goal-cancel").addEventListener("click", () => {
      editingGoal = false;
      elGoalForm.reset();
      $("#goal-saved").value = "0";
      persistAndRender();
    });

    $("#btn-open-reset").addEventListener("click", () => openModal("reset-modal"));
    $("#btn-cancel-reset").addEventListener("click", () => closeModal($("#reset-modal")));
    $("#btn-confirm-reset").addEventListener("click", confirmReset);

    $("#btn-onboarding-done").addEventListener("click", dismissOnboarding);
    $("#btn-onboarding-skip").addEventListener("click", dismissOnboarding);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAllModals();
    });
  }

  /* ——— Init ——— */
  fillCategories();
  bind();
  persistAndRender();

  if (!localStorage.getItem(ONBOARD_KEY)) {
    elOnboarding.hidden = false;
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }
})();
