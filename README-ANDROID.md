# Android-сборка «Мой бюджет»

**appId:** `com.moybudget.app`  
**Название:** Мой бюджет  
**Цена IAP «Убрать рекламу»:** 89 ₽ навсегда

## Что уже есть в репозитории

| Путь | Назначение |
|------|------------|
| `android/` | Capacitor Android-проект |
| `www/` | Web-ассеты для Capacitor (`webDir`) |
| `capacitor.config.json` | appId, webDir=`www` |
| `dist/moy-budget-debug.apk` | Debug APK (если закоммичен) — для теста на телефоне / RuStore draft |
| `icon-512.png` | Иконка 512×512 для сторов |
| `privacy.html` | Политика: https://lueissa.github.io/moy-budget/privacy.html |

Debug APK подписан debug-ключом. Для Google Play нужен **release AAB** со своим keystore.

## Требования на машине с Android Studio

- Android Studio (Ladybug/Meerkat или новее) **или** JDK 17/21 + Android SDK
- Node.js ≥ 22
- `ANDROID_HOME` / `ANDROID_SDK_ROOT` указывают на SDK

## Команды (из корня репо)

```bash
npm install
npm run copy:www          # скопировать index.html, app.js, … в www/
npx cap sync android      # или: npm run cap:sync

# Debug APK
cd android
# Создайте local.properties одной строкой (путь к SDK у себя):
# sdk.dir=/Users/YOU/Library/Android/sdk
./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk

# Release AAB для Google Play (нужен keystore Лизы)
./gradlew bundleRelease
# → android/app/build/outputs/bundle/release/app-release.aab
```

Открыть в Android Studio:

```bash
npx cap open android
```

## Keystore (только у Лизы)

```bash
keytool -genkey -v -keystore moy-budget-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias moybudget
```

Пароли и `.jks` **не коммитить** и не присылать в чат. Прописать signingConfigs в `android/app/build.gradle` локально или через `keystore.properties` (в `.gitignore`).

## SDK, который использовался на CI-машине агента

- OpenJDK 21
- Android SDK cmdline-tools + platform-tools
- `platforms;android-36`, `build-tools;35.0.0` и `36.0.0`
- Capacitor 8.5.x, AGP 8.13.0

Если `./gradlew` ругается на сеть/Maven — соберите через Android Studio (File → Sync Project with Gradle Files).

## После правок HTML/JS/CSS

```bash
npm run cap:sync
cd android && ./gradlew assembleDebug
cp app/build/outputs/apk/debug/app-debug.apk ../dist/moy-budget-debug.apk
```

Шпаргалка по магазинам: [`docs/publish-stores.md`](docs/publish-stores.md).
