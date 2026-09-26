/**
 * Мой бюджет — персональный финансовый калькулятор
 * Данные в localStorage. Работает офлайн.
 *
 * Freemium: free = с рекламой-заглушкой; pro = без рекламы.
 * // AdMob Rewarded: подключить через Capacitor @capacitor-community/admob после сборки Android
 * // AdMob Banner: подключить через Capacitor @capacitor-community/admob после сборки Android
 * // In-App Purchase «Убрать рекламу»: подключить через Capacitor после публикации в RuStore/Play
 */
(function () {
  "use strict";

  const STORAGE_KEY = "moy-budget-v2";
  const LEGACY_KEY = "liza-finance-v1" /* legacy key, do not show in UI */;
  const ONBOARD_KEY = "moy-budget-onboarded";
  const STREAK_BROKEN_KEY = "moy-budget-streak-soft";

  const QUICK_CHIPS = [
    { name: "Кофе", amount: 150, category: "food", icon: "☕" },
    { name: "Транспорт", amount: 50, category: "transport", icon: "🚌" },
    { name: "Продукты", amount: 500, category: "food", icon: "🛒" },
  ];

  const GOAL_MILESTONES = [25, 50, 100];

  const FREE_DAILY_OPS_LIMIT = 15;
  const MAX_REWARDS_PER_DAY = 5;
  const FREE_MAX_GOALS = 1;
  const FREE_MAX_GOALS_UNLOCKED = 2;
  const PRO_MAX_GOALS = 10;

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

  function todayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
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

  function defaultMonetization() {
    return {
      plan: "free",
      adsEnabled: true,
      dailyRewardedCount: 0,
      lastRewardDate: null,
      unlocks: {
        extraGoals: false,
        removeDailyLimit: false,
        removeDailyLimitDate: null,
      },
    };
  }

  function normalizeGoal(g) {
    if (!g || typeof g !== "object") return null;
    const out = {
      id: g.id || uid(),
      name: g.name || "Цель",
      target: Number(g.target) || 0,
      saved: Number(g.saved) || 0,
    };
    if (g.demo) out.demo = true;
    return out;
  }

  function normalizeGoals(parsed) {
    if (Array.isArray(parsed.goals) && parsed.goals.length) {
      return parsed.goals.map(normalizeGoal).filter(Boolean);
    }
    if (parsed.goal && typeof parsed.goal === "object") {
      const g = normalizeGoal(parsed.goal);
      return g ? [g] : [];
    }
    return [];
  }

  function normalizeUnlocks(u) {
    const base = defaultMonetization().unlocks;
    if (!u || typeof u !== "object") return base;
    return {
      extraGoals: !!u.extraGoals,
      removeDailyLimit: !!u.removeDailyLimit,
      removeDailyLimitDate: u.removeDailyLimitDate || null,
    };
  }

  function defaultEngagement() {
    return {
      streak: 0,
      lastActiveDate: null,
      milestones: {},
      firstOpCelebrated: false,
      demoActive: false,
    };
  }

  function normalizeEngagement(e) {
    const base = defaultEngagement();
    if (!e || typeof e !== "object") return base;
    return {
      streak: Math.max(0, Number(e.streak) || 0),
      lastActiveDate: e.lastActiveDate || null,
      milestones: e.milestones && typeof e.milestones === "object" ? e.milestones : {},
      firstOpCelebrated: !!e.firstOpCelebrated,
      demoActive: !!e.demoActive,
    };
  }

  function defaultState() {
    return {
      incomes: [],
      expenses: [],
      goals: [],
      budgets: {},
      engagement: defaultEngagement(),
      ...defaultMonetization(),
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
      demo: !!i.demo,
    }));
    const expenses = (Array.isArray(parsed.expenses) ? parsed.expenses : []).map((e) => ({
      id: e.id || uid(),
      name: e.name || "Расход",
      amount: Number(e.amount) || 0,
      category: e.category || "other",
      month: e.month || now,
      createdAt: e.createdAt || Date.now(),
      demo: !!e.demo,
    }));

    const mon = defaultMonetization();
    const plan = parsed.plan === "pro" ? "pro" : "free";
    const unlocks = normalizeUnlocks(parsed.unlocks);

    // Мягкая миграция: существующие пользователи без plan → free с рекламой,
    // их текущая цель сохраняется в goals[]
    return {
      incomes,
      expenses,
      goals: normalizeGoals(parsed),
      budgets: parsed.budgets && typeof parsed.budgets === "object" ? parsed.budgets : {},
      engagement: normalizeEngagement(parsed.engagement),
      plan,
      adsEnabled: plan === "pro" ? false : parsed.adsEnabled !== false,
      dailyRewardedCount: Number(parsed.dailyRewardedCount) || 0,
      lastRewardDate: parsed.lastRewardDate || null,
      unlocks,
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
    // Не пишем устаревшее поле goal — только goals[]
    const toSave = { ...state };
    delete toSave.goal;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  }

  let state = loadState();
  let currentMonth = monthKey(new Date());
  let opsFilter = "all";
  let editingGoalId = null;
  let activeGoalId = null;
  let pendingReward = null;
  let adPlaying = false;

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
  const elAdBanner = $("#ad-banner");
  const elAdOverlay = $("#ad-overlay");
  const elPlanBadge = $("#plan-badge");
  const elPlanDesc = $("#plan-desc");
  const elRewardStatus = $("#reward-status");
  const elSupportActions = $("#support-actions");
  const elSpendToday = $("#spend-today");
  const elSpendTodayValue = $("#spend-today-value");
  const elInsight = $("#insight-line");
  const elStreakBadge = $("#streak-badge");
  const elStreakCount = $("#streak-count");
  const elDemoBanner = $("#demo-banner");
  const elCelebrate = $("#celebrate");
  const elConfetti = $("#confetti-canvas");

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function toast(msg, soft) {
    elToast.textContent = msg;
    elToast.classList.toggle("is-soft", !!soft);
    elToast.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      elToast.hidden = true;
      elToast.classList.remove("is-soft");
    }, soft ? 3200 : 2200);
  }

  function categoryById(id) {
    return CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
  }

  /* ——— Freemium helpers ——— */
  function isPro() {
    return state.plan === "pro";
  }

  function adsOn() {
    return !isPro() && state.adsEnabled !== false;
  }

  function maxGoalsAllowed() {
    if (isPro()) return PRO_MAX_GOALS;
    if (state.unlocks && state.unlocks.extraGoals) return FREE_MAX_GOALS_UNLOCKED;
    return FREE_MAX_GOALS;
  }

  function canAddGoal() {
    return state.goals.length < maxGoalsAllowed();
  }

  function resetDailyRewardIfNeeded() {
    const today = todayKey();
    if (state.lastRewardDate !== today) {
      state.dailyRewardedCount = 0;
      state.lastRewardDate = today;
      // дневной unlock лимита сбрасывается на новый день
      if (state.unlocks.removeDailyLimitDate && state.unlocks.removeDailyLimitDate !== today) {
        state.unlocks.removeDailyLimit = false;
        state.unlocks.removeDailyLimitDate = null;
      }
    }
  }

  function rewardsLeftToday() {
    resetDailyRewardIfNeeded();
    return Math.max(0, MAX_REWARDS_PER_DAY - (state.dailyRewardedCount || 0));
  }

  function hasDailyOpsLimit() {
    if (isPro()) return false;
    resetDailyRewardIfNeeded();
    if (state.unlocks.removeDailyLimit && state.unlocks.removeDailyLimitDate === todayKey()) {
      return false;
    }
    return true;
  }

  function todayOpsCount() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const t0 = start.getTime();
    const countIn = (arr) =>
      arr.filter((x) => (Number(x.createdAt) || 0) >= t0).length;
    return countIn(state.incomes) + countIn(state.expenses);
  }

  function canAddOperation() {
    if (!hasDailyOpsLimit()) return true;
    return todayOpsCount() < FREE_DAILY_OPS_LIMIT;
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
  }

  function daysLeftInMonth(month) {
    const d = parseMonthKey(month || currentMonth);
    const y = d.getFullYear();
    const m = d.getMonth();
    const last = new Date(y, m + 1, 0).getDate();
    const today = new Date();
    if (monthKey(today) !== (month || currentMonth)) {
      // чужой месяц: все дни
      return last;
    }
    return Math.max(1, last - today.getDate() + 1);
  }

  function yesterdayKey() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function ensureEngagement() {
    if (!state.engagement) state.engagement = defaultEngagement();
    return state.engagement;
  }

  function touchStreak(fromOpen) {
    const eng = ensureEngagement();
    const today = todayKey();
    const last = eng.lastActiveDate;
    let softBreak = false;

    if (last === today) {
      // уже отмечен сегодня
    } else if (last === yesterdayKey()) {
      eng.streak = (eng.streak || 0) + 1;
      eng.lastActiveDate = today;
    } else if (!last) {
      eng.streak = 1;
      eng.lastActiveDate = today;
    } else {
      // серия сорвалась
      if ((eng.streak || 0) > 1) softBreak = true;
      eng.streak = 1;
      eng.lastActiveDate = today;
    }

    if (softBreak && fromOpen) {
      const shown = sessionStorage.getItem(STREAK_BROKEN_KEY);
      if (!shown) {
        sessionStorage.setItem(STREAK_BROKEN_KEY, "1");
        toast("Новый старт — серия снова с 1. Без давления 💜", true);
      }
    }
  }

  function renderStreak() {
    const eng = ensureEngagement();
    const n = eng.streak || 0;
    if (!elStreakBadge) return;
    if (n >= 1 && eng.lastActiveDate === todayKey()) {
      elStreakBadge.hidden = false;
      elStreakCount.textContent = String(n);
    } else if (n >= 1) {
      elStreakBadge.hidden = false;
      elStreakCount.textContent = String(n);
    } else {
      elStreakBadge.hidden = true;
    }
  }

  function renderSpendToday() {
    if (!elSpendTodayValue) return;
    const { balance } = getTotals();
    const days = daysLeftInMonth(currentMonth);
    const isCurrent = currentMonth === monthKey(new Date());

    elSpendToday.classList.remove("is-warn", "is-over");

    if (!isCurrent) {
      elSpendTodayValue.textContent = formatRub(balance) + " · месяц";
      return;
    }

    if (balance <= 0) {
      elSpendTodayValue.textContent = "0 ₽";
      elSpendToday.classList.add("is-over");
      return;
    }

    const daily = Math.floor(balance / days);
    elSpendTodayValue.textContent = formatRub(daily);
    if (daily < 300) elSpendToday.classList.add("is-warn");
  }

  function buildInsight() {
    const { income, expense, balance } = getTotals();
    const exps = monthExpenses();
    const eng = ensureEngagement();

    if (!income && !expense && !state.goals.length) {
      return "Добавьте расход или цель — и появится инсайт дня";
    }

    // goal progress insight
    if (state.goals.length) {
      const g = state.goals[0];
      const t = Number(g.target) || 0;
      const s = Number(g.saved) || 0;
      if (t > 0) {
        const left = Math.max(t - s, 0);
        const pct = Math.round((s / t) * 100);
        if (pct >= 100) return "Цель «" + g.name + "» достигнута — красота!";
        if (pct >= 50) return "Ближе к цели «" + g.name + "» — уже " + pct + "%";
        if (s > 0) return "Ближе к цели на " + formatRub(s).replace(/\u00a0/g, " ");
        if (left > 0) return "До «" + g.name + "» осталось " + formatRub(left).replace(/\u00a0/g, " ");
      }
    }

    if (expense > 0 && exps.length) {
      const byCat = {};
      exps.forEach((e) => {
        const id = e.category || "other";
        byCat[id] = (byCat[id] || 0) + (Number(e.amount) || 0);
      });
      let topId = null;
      let topVal = 0;
      Object.keys(byCat).forEach((id) => {
        if (byCat[id] > topVal) {
          topVal = byCat[id];
          topId = id;
        }
      });
      if (topId && expense > 0) {
        const pct = Math.round((topVal / expense) * 100);
        const catAcc = {
          food: "еду",
          transport: "транспорт",
          housing: "жильё",
          comms: "связь",
          health: "здоровье",
          fun: "развлечения",
          other: "другое",
        };
        const label = catAcc[topId] || categoryById(topId).name.toLowerCase();
        if (pct >= 25) return "На " + label + " ушло " + pct + "% расходов";
      }
    }

    if (income > 0 && expense > 0) {
      const pct = Math.round((expense / income) * 100);
      if (pct <= 70) return "Потрачено " + pct + "% доходов — хороший темп";
      if (pct <= 100) return "Потрачено " + pct + "% доходов за месяц";
      return "Расходы выше доходов на " + formatRub(expense - income).replace(/\u00a0/g, " ");
    }

    if (income > 0 && expense === 0) return "Доходы есть — отметьте первый расход";
    if (eng.streak >= 3) return "Серия " + eng.streak + " дн. — вы в ритме 🔥";
    if (balance > 0) return "В плюсе на " + formatRub(balance).replace(/\u00a0/g, " ");
    return "Маленький шаг сегодня — привычка завтра";
  }

  function renderInsight() {
    if (!elInsight) return;
    elInsight.textContent = buildInsight();
  }

  function renderDemoBanner() {
    if (!elDemoBanner) return;
    const eng = ensureEngagement();
    const hasDemo =
      state.incomes.some((i) => i.demo) ||
      state.expenses.some((e) => e.demo) ||
      state.goals.some((g) => g.demo);
    if (eng.demoActive && !hasDemo) eng.demoActive = false;
    elDemoBanner.hidden = !eng.demoActive;
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
    renderSpendToday();
    renderInsight();
    renderStreak();
    renderDemoBanner();
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
      return `<div class="empty-hint"><span class="empty-hint__emoji">💰</span>Доходов ещё нет — и это нормально.<br>Нажмите «+ Доход», когда появятся.</div>`;
    }
    if (filter === "expense") {
      return `<div class="empty-hint"><span class="empty-hint__emoji">🧾</span>Расходов пока нет.<br>Тапните чип «Кофе» на главной — и список оживёт.</div>`;
    }
    return `<div class="empty-hint"><span class="empty-hint__emoji">✨</span>Здесь будет ваш день.<br>Добавьте первую операцию — займёт 5 секунд.</div>`;
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
      container.innerHTML = `<div class="empty-hint"><span class="empty-hint__emoji">📊</span>Лимиты ещё не заданы — без стресса.<br>Настройте пару категорий, когда будете готовы.</div>`;
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
    const r = 30;
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

  function renderGoalCard(goal, compact) {
    const { name, target, saved, id } = goal;
    const t = Math.max(Number(target) || 0, 0);
    const s = Math.max(Number(saved) || 0, 0);
    const pct = t > 0 ? Math.min(100, Math.round((s / t) * 1000) / 10) : 0;
    const left = Math.max(t - s, 0);
    const done = left === 0;

    const actions = compact
      ? `<div class="goal-actions">
           <button type="button" class="btn secondary" data-action="goal-add" data-goal-id="${id}">+ Отложить</button>
           <button type="button" class="btn secondary" data-nav="goals">Открыть</button>
         </div>`
      : `<div class="goal-actions">
           <button type="button" class="btn primary" data-action="goal-add" data-goal-id="${id}">+ Отложить</button>
           <button type="button" class="btn secondary" data-action="goal-edit" data-goal-id="${id}">Изменить</button>
         </div>
         <button type="button" class="btn danger block" data-action="goal-clear" data-goal-id="${id}" style="margin-top:10px">Удалить цель</button>`;

    return `
      <div class="goal-item" data-goal-id="${id}">
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
    // Главная: первая цель
    if (!state.goals.length) {
      elHomeGoal.innerHTML = `<div class="empty-hint"><span class="empty-hint__emoji">🎯</span>Цели пока нет — выберите мечту.<br>Отпуск, подушка или новый телефон.</div>`;
    } else {
      elHomeGoal.innerHTML = renderGoalCard(state.goals[0], true);
    }

    // Экран целей
    const editing = editingGoalId && state.goals.find((g) => g.id === editingGoalId);

    if (editing) {
      elGoalView.innerHTML = "";
      elGoalForm.hidden = false;
      $("#goal-form-title").textContent = "Изменить цель";
      $("#btn-goal-cancel").hidden = false;
    } else {
      let html = "";
      if (!state.goals.length) {
        html = `<div class="empty-hint" style="margin-bottom:14px"><span class="empty-hint__emoji">🎯</span>Создайте цель — кольцо прогресса появится сразу.<br>Маленькие шаги складываются в «Красота!».</div>`;
      } else {
        html = state.goals.map((g) => renderGoalCard(g, false)).join("");
      }

      if (!canAddGoal() && !isPro()) {
        html += `<div class="goal-lock-hint">
          Бесплатно — ${FREE_MAX_GOALS} цель. Хотите ещё одну?
          <button type="button" id="btn-unlock-goal-inline">Смотреть рекламу</button>
        </div>`;
      }

      elGoalView.innerHTML = html;

      const showForm = canAddGoal() && !editing;
      elGoalForm.hidden = !showForm || (state.goals.length > 0 && !canAddGoal());
      // Показать форму, если можно добавить и (нет целей или пользователь на экране целей и canAdd)
      if (canAddGoal()) {
        elGoalForm.hidden = false;
        $("#goal-form-title").textContent = state.goals.length ? "Ещё одна цель" : "Новая цель";
        $("#btn-goal-cancel").hidden = true;
        if (state.goals.length && !editing) {
          // форма доступна для добавления
        }
      } else {
        elGoalForm.hidden = true;
      }

      const inlineBtn = $("#btn-unlock-goal-inline");
      if (inlineBtn) {
        inlineBtn.addEventListener("click", () => {
          pendingReward = "extraGoals";
          startRewardedAd("extraGoals");
        });
      }
    }
  }

  function renderSupport() {
    if (!elPlanBadge) return;
    resetDailyRewardIfNeeded();

    if (isPro()) {
      elPlanBadge.textContent = "Без рекламы";
      elPlanBadge.classList.add("is-pro");
      elPlanDesc.textContent =
        "Спасибо за поддержку! Реклама отключена, лимиты сняты.";
      elSupportActions.innerHTML = `
        <button type="button" class="btn secondary block" disabled>Реклама отключена</button>
      `;
      elRewardStatus.textContent = "";
    } else {
      elPlanBadge.textContent = "Бесплатно с рекламой";
      elPlanBadge.classList.remove("is-pro");
      elPlanDesc.textContent =
        "Приложение бесплатное. Короткая реклама помогает его развивать. Не хотите рекламу — можно отключить навсегда.";
      elSupportActions.innerHTML = `
        <button type="button" class="btn secondary block" id="btn-watch-ad">Смотреть рекламу</button>
        <button type="button" class="btn primary block" id="btn-remove-ads">Убрать рекламу</button>
      `;
      const left = rewardsLeftToday();
      const opsLeft = hasDailyOpsLimit()
        ? Math.max(0, FREE_DAILY_OPS_LIMIT - todayOpsCount())
        : null;
      let status = `Наград сегодня: ${left} из ${MAX_REWARDS_PER_DAY}.`;
      if (opsLeft !== null) {
        status += ` Операций сегодня: ${todayOpsCount()} / ${FREE_DAILY_OPS_LIMIT}.`;
      } else {
        status += " Лимит операций снят на сегодня.";
      }
      if (state.unlocks.extraGoals) {
        status += " 2-я цель открыта.";
      }
      elRewardStatus.textContent = status;

      $("#btn-watch-ad").addEventListener("click", openRewardSheet);
      $("#btn-remove-ads").addEventListener("click", () => openModal("modal-remove-ads"));
    }
  }

  function renderAdBanner() {
    const show = adsOn();
    if (elAdBanner) elAdBanner.hidden = !show;
    document.body.classList.toggle("has-ad-banner", show);
  }

  /* ——— Celebrations ——— */
  function runConfetti(durationMs) {
    const canvas = elConfetti;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const colors = ["#34d399", "#2dd4bf", "#a78bfa", "#fbbf24", "#fb7185", "#60a5fa"];
    const parts = [];
    for (let i = 0; i < 64; i++) {
      parts.push({
        x: Math.random() * w,
        y: -20 - Math.random() * h * 0.3,
        r: 3 + Math.random() * 5,
        c: colors[(Math.random() * colors.length) | 0],
        vx: -2 + Math.random() * 4,
        vy: 2 + Math.random() * 4,
        rot: Math.random() * Math.PI,
        vr: -0.2 + Math.random() * 0.4,
      });
    }

    const t0 = Date.now();
    function frame() {
      const elapsed = Date.now() - t0;
      ctx.clearRect(0, 0, w, h);
      parts.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.06;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.r, -p.r * 0.4, p.r * 2, p.r * 0.8);
        ctx.restore();
      });
      if (elapsed < (durationMs || 1600)) requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, w, h);
    }
    requestAnimationFrame(frame);
  }

  function celebrate(title, text, emoji) {
    if (!elCelebrate) {
      toast(title + (text ? " — " + text : ""));
      return;
    }
    $("#celebrate-emoji").textContent = emoji || "🎉";
    $("#celebrate-title").textContent = title || "Красота!";
    $("#celebrate-text").textContent = text || "";
    elCelebrate.hidden = false;
    runConfetti(1800);
    clearTimeout(celebrate._t);
    celebrate._t = setTimeout(() => {
      elCelebrate.hidden = true;
    }, 2000);
  }

  function checkGoalMilestones(goal, prevPct) {
    if (!goal || !goal.id) return;
    const eng = ensureEngagement();
    if (!eng.milestones[goal.id]) eng.milestones[goal.id] = [];
    const hit = eng.milestones[goal.id];
    const t = Number(goal.target) || 0;
    const s = Number(goal.saved) || 0;
    const pct = t > 0 ? Math.min(100, (s / t) * 100) : 0;

    GOAL_MILESTONES.forEach((m) => {
      if (pct >= m && prevPct < m && hit.indexOf(m) === -1) {
        hit.push(m);
        const label =
          m === 100
            ? "Цель достигнута!"
            : m + "% пути к «" + goal.name + "»";
        celebrate("Красота!", label, m === 100 ? "🏆" : m >= 50 ? "✨" : "🌱");
        // pulse card on next render
        setTimeout(() => {
          const card = document.querySelector('.goal-item[data-goal-id="' + goal.id + '"]');
          if (card) {
            card.classList.add("is-milestone");
            setTimeout(() => card.classList.remove("is-milestone"), 900);
          }
        }, 50);
      }
    });
  }

  function maybeFirstOpCelebrate() {
    const eng = ensureEngagement();
    if (eng.firstOpCelebrated) return;
    const total = state.incomes.length + state.expenses.length;
    if (total >= 1) {
      eng.firstOpCelebrated = true;
      celebrate("Первый шаг!", "Операция записана — так держать", "🚀");
    }
  }

  function quickAddExpense(name, amount, category) {
    if (!canAddOperation()) {
      toast("Лимит операций на сегодня. Посмотрите рекламу или уберите рекламу");
      openRewardSheet();
      return;
    }
    const entry = {
      id: uid(),
      name: name,
      amount: Number(amount),
      category: category || "other",
      month: currentMonth,
      createdAt: Date.now(),
    };
    state.expenses.unshift(entry);
    touchStreak(false);
    maybeFirstOpCelebrate();
    persistAndRender();
    toast("− " + name + " " + formatRub(amount));
  }

  function fillDemoData() {
    const month = currentMonth;
    const eng = ensureEngagement();
    // очистить прошлый демо-слой
    state.incomes = state.incomes.filter((i) => !i.demo);
    state.expenses = state.expenses.filter((e) => !e.demo);
    state.goals = state.goals.filter((g) => !g.demo);

    const mk = (partial) => ({ id: uid(), month, createdAt: Date.now() - Math.random() * 1e7, demo: true, ...partial });

    state.incomes.unshift(
      mk({ name: "Зарплата", amount: 75000 }),
      mk({ name: "Подработка", amount: 8000 })
    );
    state.expenses.unshift(
      mk({ name: "Продукты", amount: 9200, category: "food" }),
      mk({ name: "Метро", amount: 2100, category: "transport" }),
      mk({ name: "Аренда", amount: 28000, category: "housing" }),
      mk({ name: "Связь", amount: 650, category: "comms" }),
      mk({ name: "Аптека", amount: 890, category: "health" }),
      mk({ name: "Кино", amount: 1200, category: "fun" }),
      mk({ name: "Кофе", amount: 450, category: "food" })
    );

    if (!state.goals.length) {
      state.goals.push({
        id: uid(),
        name: "Отпуск",
        target: 80000,
        saved: 18500,
        demo: true,
      });
    }

    if (!Object.keys(state.budgets).length) {
      state.budgets = { food: 15000, transport: 4000, fun: 5000 };
    }

    eng.demoActive = true;
    touchStreak(false);
    persistAndRender();
    toast("Пример заполнен — баланс живой");
  }

  function clearDemoData() {
    const eng = ensureEngagement();
    state.incomes = state.incomes.filter((i) => !i.demo);
    state.expenses = state.expenses.filter((e) => !e.demo);
    state.goals = state.goals.filter((g) => !g.demo);
    eng.demoActive = false;
    persistAndRender();
    toast("Пример убран");
  }

  function applyGoalTemplate(name, target) {
    if (!canAddGoal()) {
      toast("Лимит целей. Посмотрите рекламу, чтобы открыть 2-ю");
      openRewardSheet();
      return false;
    }
    const goal = { id: uid(), name: name, target: Number(target), saved: 0 };
    state.goals.push(goal);
    touchStreak(false);
    persistAndRender();
    toast("Цель «" + name + "» создана");
    return true;
  }

  function persistAndRender() {
    saveState(state);
    renderMonthLabel();
    renderBalance();
    renderOpsList(elHomeOps, 5, "all");
    renderOpsList(elOpsList, null, opsFilter);
    renderBudgets(elHomeBudget);
    renderGoal();
    renderSupport();
    renderAdBanner();
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
    if (id === "goals") {
      editingGoalId = null;
      renderGoal();
    }
    if (id === "more") {
      renderSupport();
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
    if (!canAddOperation()) {
      toast("Лимит операций на сегодня. Посмотрите рекламу или уберите рекламу");
      openRewardSheet();
      return;
    }
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

  /* ——— Rewarded ad mock ——— */
  // AdMob Rewarded: подключить через Capacitor @capacitor-community/admob после сборки Android
  function openRewardSheet() {
    if (isPro()) {
      toast("У вас уже версия без рекламы");
      return;
    }
    resetDailyRewardIfNeeded();
    if (rewardsLeftToday() <= 0) {
      toast("На сегодня награды закончились");
      return;
    }

    const btnGoal = $("#btn-reward-extra-goal");
    const btnOps = $("#btn-reward-ops-limit");
    if (btnGoal) {
      const already = !!state.unlocks.extraGoals;
      btnGoal.disabled = already;
      btnGoal.querySelector("strong").textContent = already
        ? "2-я цель уже открыта"
        : "Открыть 2-ю цель";
    }
    if (btnOps) {
      const today = todayKey();
      const already =
        state.unlocks.removeDailyLimit && state.unlocks.removeDailyLimitDate === today;
      btnOps.disabled = already;
      btnOps.querySelector("strong").textContent = already
        ? "Лимит уже снят на сегодня"
        : "Снять лимит операций";
    }
    openModal("modal-reward");
  }

  function startRewardedAd(rewardType) {
    // AdMob Rewarded: подключить через Capacitor @capacitor-community/admob после сборки Android
    if (adPlaying) return;
    if (isPro()) return;
    resetDailyRewardIfNeeded();
    if (rewardsLeftToday() <= 0) {
      toast("На сегодня награды закончились");
      return;
    }

    pendingReward = rewardType;
    closeAllModals();
    adPlaying = true;

    const duration = 3500 + Math.floor(Math.random() * 1500); // 3.5–5 сек
    const bar = $("#ad-overlay-bar");
    const timerEl = $("#ad-overlay-timer");
    const titleEl = $("#ad-overlay-title");
    if (titleEl) titleEl.textContent = "Реклама…";
    if (bar) bar.style.width = "0%";
    elAdOverlay.hidden = false;

    const t0 = Date.now();
    function tick() {
      const elapsed = Date.now() - t0;
      const pct = Math.min(100, (elapsed / duration) * 100);
      if (bar) bar.style.width = pct + "%";
      if (timerEl) {
        const left = Math.max(0, Math.ceil((duration - elapsed) / 1000));
        timerEl.textContent = left > 0 ? String(left) : "✓";
      }
      if (elapsed >= duration) {
        finishRewardedAd();
        return;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function finishRewardedAd() {
    adPlaying = false;
    elAdOverlay.hidden = true;
    resetDailyRewardIfNeeded();
    state.dailyRewardedCount = (state.dailyRewardedCount || 0) + 1;
    state.lastRewardDate = todayKey();

    const reward = pendingReward;
    pendingReward = null;

    if (reward === "extraGoals") {
      state.unlocks.extraGoals = true;
      persistAndRender();
      toast("Открыта 2-я цель накоплений!");
      switchScreen("goals");
      return;
    }
    if (reward === "removeDailyLimit") {
      state.unlocks.removeDailyLimit = true;
      state.unlocks.removeDailyLimitDate = todayKey();
      persistAndRender();
      toast("Лимит операций снят на сегодня");
      return;
    }
    persistAndRender();
    toast("Награда получена");
  }

  function confirmProPurchase() {
    // In-App Purchase «Убрать рекламу»: подключить через Capacitor после публикации в RuStore/Play
    state.plan = "pro";
    state.adsEnabled = false;
    state.unlocks.extraGoals = true;
    state.unlocks.removeDailyLimit = true;
    state.unlocks.removeDailyLimitDate = todayKey();
    closeModal($("#modal-remove-ads"));
    persistAndRender();
    toast("Реклама отключена. В магазине оплата подключится после публикации");
  }

  /* ——— Actions ——— */
  function addOperation(e) {
    e.preventDefault();
    if (!canAddOperation()) {
      toast("Лимит операций на сегодня. Посмотрите рекламу");
      closeModal($("#modal-op"));
      openRewardSheet();
      return;
    }
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
    touchStreak(false);
    maybeFirstOpCelebrate();
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

    if (editingGoalId) {
      const g = state.goals.find((x) => x.id === editingGoalId);
      if (g) {
        const prevT = Number(g.target) || 0;
        const prevPct = prevT > 0 ? Math.min(100, ((Number(g.saved) || 0) / prevT) * 100) : 0;
        g.name = name;
        g.target = target;
        g.saved = saved;
        checkGoalMilestones(g, prevPct);
      }
      editingGoalId = null;
      toast("Цель сохранена");
    } else {
      if (!canAddGoal()) {
        toast("Лимит целей. Посмотрите рекламу, чтобы открыть 2-ю");
        openRewardSheet();
        return;
      }
      const g = { id: uid(), name, target, saved };
      state.goals.push(g);
      checkGoalMilestones(g, 0);
      toast("Цель сохранена");
    }

    form.reset();
    form.goalSaved.value = "0";
    touchStreak(false);
    persistAndRender();
  }

  function onGoalAddSubmit(e) {
    e.preventDefault();
    const g = state.goals.find((x) => x.id === activeGoalId) || state.goals[0];
    if (!g) return;
    const raw = $("#goal-add-amount").value;
    const add = parseFloat(String(raw).replace(",", "."));
    if (!(add > 0)) {
      toast("Введите положительную сумму");
      return;
    }
    const t = Number(g.target) || 0;
    const prevPct = t > 0 ? Math.min(100, ((Number(g.saved) || 0) / t) * 100) : 0;
    g.saved = (Number(g.saved) || 0) + add;
    closeModal($("#modal-goal-add"));
    touchStreak(false);
    checkGoalMilestones(g, prevPct);
    persistAndRender();
    toast("Накопления обновлены · +" + formatRub(add));
  }

  function onGoalEdit(goalId) {
    const g = state.goals.find((x) => x.id === goalId);
    if (!g) return;
    editingGoalId = g.id;
    $("#goal-name").value = g.name;
    $("#goal-target").value = g.target;
    $("#goal-saved").value = g.saved;
    elGoalForm.hidden = false;
    $("#goal-form-title").textContent = "Изменить цель";
    $("#btn-goal-cancel").hidden = false;
    elGoalView.innerHTML = "";
    $("#goal-name").focus();
  }

  function onGoalClear(goalId) {
    const g = state.goals.find((x) => x.id === goalId);
    if (!g) return;
    if (!confirm("Удалить цель «" + g.name + "»?")) return;
    state.goals = state.goals.filter((x) => x.id !== goalId);
    if (editingGoalId === goalId) editingGoalId = null;
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
    editingGoalId = null;
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

  function showOnboardStep(n) {
    const s1 = $("#onboard-step-1");
    const s2 = $("#onboard-step-2");
    if (s1) s1.hidden = n !== 1;
    if (s2) s2.hidden = n !== 2;
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
        const btn = e.target.closest("[data-action='goal-add']");
        activeGoalId = btn.dataset.goalId || (state.goals[0] && state.goals[0].id);
        if (!activeGoalId) {
          switchScreen("goals");
          return;
        }
        $("#form-goal-add").reset();
        openModal("modal-goal-add");
        setTimeout(() => $("#goal-add-amount").focus(), 50);
        return;
      }
      if (e.target.closest("[data-action='goal-edit']")) {
        const btn = e.target.closest("[data-action='goal-edit']");
        onGoalEdit(btn.dataset.goalId);
        return;
      }
      if (e.target.closest("[data-action='goal-clear']")) {
        const btn = e.target.closest("[data-action='goal-clear']");
        onGoalClear(btn.dataset.goalId);
        return;
      }
      if (e.target.matches("[data-close-modal]") || e.target.closest("[data-close-modal]")) {
        closeModal(e.target);
      }
    });

    $("#btn-goal-cancel").addEventListener("click", () => {
      editingGoalId = null;
      elGoalForm.reset();
      $("#goal-saved").value = "0";
      persistAndRender();
    });

    $("#btn-open-reset").addEventListener("click", () => openModal("reset-modal"));
    $("#btn-cancel-reset").addEventListener("click", () => closeModal($("#reset-modal")));
    $("#btn-confirm-reset").addEventListener("click", confirmReset);

    const btnOnboardDone = $("#btn-onboarding-done");
    const btnOnboardSkip = $("#btn-onboarding-skip");
    const btnOnboardNext = $("#btn-onboard-next");
    const btnOnboardExpense = $("#btn-onboard-expense");
    const btnFillDemo = $("#btn-fill-demo");
    const btnClearDemo = $("#btn-clear-demo");

    if (btnOnboardDone) btnOnboardDone.addEventListener("click", dismissOnboarding);
    if (btnOnboardSkip) btnOnboardSkip.addEventListener("click", dismissOnboarding);
    if (btnOnboardNext) {
      btnOnboardNext.addEventListener("click", () => showOnboardStep(2));
    }
    if (btnOnboardExpense) {
      btnOnboardExpense.addEventListener("click", () => {
        dismissOnboarding();
        openOpModal("expense");
      });
    }
    if (btnFillDemo) {
      btnFillDemo.addEventListener("click", () => {
        fillDemoData();
        dismissOnboarding();
      });
    }
    if (btnClearDemo) {
      btnClearDemo.addEventListener("click", clearDemoData);
    }

    $$("[data-goal-template]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const ok = applyGoalTemplate(btn.dataset.name, btn.dataset.target);
        if (ok) {
          dismissOnboarding();
          switchScreen("goals");
          celebrate("Цель задана!", "«" + btn.dataset.name + "» — можно откладывать", "🎯");
        }
      });
    });

    $$(".chip-quick").forEach((btn) => {
      btn.addEventListener("click", () => {
        btn.classList.remove("is-pop");
        void btn.offsetWidth;
        btn.classList.add("is-pop");
        quickAddExpense(
          btn.dataset.quickName,
          btn.dataset.quickAmount,
          btn.dataset.quickCat
        );
      });
    });

    const btnConfirmPro = $("#btn-confirm-pro");
    if (btnConfirmPro) btnConfirmPro.addEventListener("click", confirmProPurchase);

    const btnRewardGoal = $("#btn-reward-extra-goal");
    const btnRewardOps = $("#btn-reward-ops-limit");
    if (btnRewardGoal) {
      btnRewardGoal.addEventListener("click", () => startRewardedAd("extraGoals"));
    }
    if (btnRewardOps) {
      btnRewardOps.addEventListener("click", () => startRewardedAd("removeDailyLimit"));
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (!elAdOverlay.hidden) return; // нельзя закрыть рекламу
        closeAllModals();
      }
    });
  }

  /* ——— Init ——— */
  resetDailyRewardIfNeeded();
  ensureEngagement();
  fillCategories();
  bind();
  touchStreak(true);
  persistAndRender();

  if (!localStorage.getItem(ONBOARD_KEY)) {
    showOnboardStep(1);
    elOnboarding.hidden = false;
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }
})();
