# Публикация «Мой бюджет» в RuStore и Google Play

Пошаговая шпаргалка для публикации. Тексты описаний — в [`store-and-publish.md`](./store-and-publish.md).  
Юридический минимум — в [`legal-checklist.md`](./legal-checklist.md).  
**Цена «Убрать рекламу»: 89 ₽ навсегда** (не 149).

| Документ | URL |
|----------|-----|
| Privacy Policy | https://lueissa.github.io/moy-budget/privacy.html |
| Пользовательское соглашение | https://lueissa.github.io/moy-budget/terms.html |
| Оферта «Убрать рекламу» | https://lueissa.github.io/moy-budget/offer.html |
| Чеклист перед модерацией | [`legal-checklist.md`](./legal-checklist.md) |

App ID: `com.moybudget.app`

---

## Что уже готово (не нужно делать заново)

- PWA с freemium (баннер/rewarded-заглушка, покупка «без рекламы» 89 ₽)
- Capacitor Android-проект в папке `android/`
- `capacitor.config.json` → `webDir: www` (без копирования `node_modules`)
- Иконки PNG из `icon.svg`, тема/label в манифесте
- Страницы privacy / terms / offer на GitHub Pages
- Debug-сборка: см. `README-ANDROID.md` и папку `dist/` (если APK собран)
- Документы: этот файл + `store-and-publish.md` + `legal-checklist.md`

## Что делаете вы сами

1. Регистрация в RuStore и/или Google Play Console (паспорт / карта — только у вас)
2. Загрузка APK/AAB, скриншоты, возрастной рейтинг, Data safety
3. Создание товара IAP «Убрать рекламу» = **89 ₽**
4. Кабинет AdMob (когда подключать рекламу)
5. Самозанятость / налоги, если включите платные покупки в RuStore
6. Пароли и ключи подписи — **только у вас**, в чат не кидать
7. Заменить плейсхолдер email в legal-страницах на свой перед публикацией

---

## 1. RuStore

1. Откройте [console.rustore.ru](https://console.rustore.ru) → вход через **VK ID**.
2. Зарегистрируйтесь по форме RuStore (нужны паспортные данные по требованиям платформы).
3. **Создать приложение**
   - Название: **Мой бюджет**
   - Пакет / applicationId: `com.moybudget.app`
   - Категория: финансы / утилиты (как предложит форма)
4. **Загрузка сборки**
   - Для проверки удобен **APK** (debug или release); для продакшена предпочтителен **AAB** / signed release — см. `README-ANDROID.md`.
   - Если debug APK уже есть: `dist/moy-budget-debug.apk`.
5. **Тексты** — копипаст из `docs/store-and-publish.md`:
   - короткое описание;
   - полное описание;
   - ключевые слова/теги.
6. **Privacy Policy URL:** `https://lueissa.github.io/moy-budget/privacy.html`  
   При необходимости укажите также Terms: `https://lueissa.github.io/moy-budget/terms.html` и оферту: `https://lueissa.github.io/moy-budget/offer.html`
7. **Возрастной рейтинг** — выбрать **0+ или 6+** (максимум 12+). **Не 16+/18+**: приложение подходит для младше 14 лет (данные локально, без аккаунта). При AdMob — неперсонализированная / child-directed либо реклама 13+.
8. **Скриншоты** — 2–4 штуки с телефона (главная, операции, цели, «Ещё»), **без чужих банковских брендов**.
9. **Монетизация в карточке**
   - Указать freemium: бесплатно с рекламой + IAP «Убрать рекламу» **89 ₽**.
   - **Важно:** для приёма IAP от имени физлица RuStore обычно требует статус **самозанятого** (НПД) и привязку выплат. Без этого можно сначала выложить бесплатную версию с рекламой-заглушкой, а покупку включить после оформления самозанятости. См. [`offer.html`](https://lueissa.github.io/moy-budget/offer.html).
10. Отправить на модерацию → дождаться публикации.

---

## 2. Google Play

1. [play.google.com/console](https://play.google.com/console) — аккаунт разработчика, разовый взнос **~$25**.
2. **Оплата из РФ:** часто нужна **зарубежная карта** (или иной доступный вам способ). Пароли/CVV в чат не отправлять.
3. Создать приложение **Мой бюджет**, тип: приложение, бесплатное (с покупками внутри).
4. Загрузить **AAB** (Play требует AAB для новых приложений), не APK:
   ```bash
   cd android && ./gradlew bundleRelease
   # файл: android/app/build/outputs/bundle/release/app-release.aab
   ```
   Для подписи release нужен ваш keystore (создать один раз и хранить офлайн).
5. **Store listing** — тексты из `store-and-publish.md`, иконка 512×512 (`icon-512.png`), скриншоты.
6. **Privacy policy:** `https://lueissa.github.io/moy-budget/privacy.html`  
   Terms / оферта: см. таблицу в начале файла.
7. **Data safety**
   - Данные приложения (бюджет) — **только на устройстве**, не собираются разработчиком.
   - Пока без AdMob: обычно **Data collected? No**.
   - Если/когда подключите AdMob — отметить сбор **рекламного ID** / данные для рекламы сторонней библиотекой Google; цель — Advertising; не продаёте данные.
8. **Контентный рейтинг** (IARC) и целевая аудитория — честно including младше 14; ожидаемо низкий рейтинг, **не 16+/18+**.
9. **Цены и распространение** → In-app product «Убрать рекламу» = **89 ₽** (managed product, one-time).
10. Тестирование (internal testing) → production.

---

## 3. Монетизация — честно

| Что | Как |
|-----|-----|
| IAP «Убрать рекламу» **89 ₽** | RuStore Pay / Google Play Billing. В коде пока плейсхолдер — подключить Capacitor-плагин магазина после аккаунтов. Оферта: [`offer.html`](https://lueissa.github.io/moy-budget/offer.html) |
| RuStore + физлицо | Для реальных выплат с IAP — **самозанятый (НПД)**. Иначе модерация/выплаты могут отказать. |
| AdMob | Отдельный кабинет [admob.google.com](https://admob.google.com), привязка к Play/тому же Google-аккаунту. В веб-демо — только заглушка. |
| Налоги | Самозанятость / консультация бухгалтера — зона ответственности разработчика. |

---

## 4. Быстрый чеклист перед отправкой

- [ ] Privacy / Terms / Offer URL открываются с телефона
- [ ] Пройден [`legal-checklist.md`](./legal-checklist.md)
- [ ] В карточке везде **89 ₽**, не 149
- [ ] applicationId = `com.moybudget.app`
- [ ] Скриншоты без чужих брендов и персональных данных
- [ ] Data safety / реклама согласованы с фактическим релизом (если AdMob ещё нет — не отмечать сбор Advertising ID «уже сейчас»)
- [ ] Возрастной рейтинг 0+/6+ (не 16+/18+)
- [ ] Не писать «банк», «гарантированный доход от рекламы»
- [ ] Keystore и пароли только у вас

Подробные команды сборки APK/AAB — в корневом [`README-ANDROID.md`](../README-ANDROID.md).
