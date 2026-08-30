# English Lexicon Trainer

Личный тренажёр английской лексики в контексте (C1/C2). См. `PLAN.md` (карта проекта)
и `DEV_PLAN.md` (пошаговый план разработки).

## Стек

- **Frontend:** Vue 3 + Vite + TypeScript → Cloudflare Pages (`web/`)
- **API:** Cloudflare Pages Functions (`functions/`)
- **БД:** Neon (serverless Postgres) через `@neondatabase/serverless` + Drizzle (`db/`)
- **Генерация упражнений:** OpenRouter (`:free`), подключается на этапе 4
- **Перевод слов:** MyMemory API (без ключа) + ручной ввод

## Структура

```
web/         Vue-приложение (Vite)
functions/   Pages Functions, роут /api/*
db/          Drizzle: schema.ts, migrations/
drizzle.config.ts
```

## Локальный запуск

```bash
npm install
cp .env.example .env          # для drizzle-kit
cp .dev.vars.example .dev.vars # для wrangler pages dev
# заполнить DATABASE_URL в обоих файлах
```

Два терминала:

```bash
npm run dev       # Vite, http://localhost:5173  (/api проксируется на :8788)
npm run build && npm run dev:api   # Pages Functions + собранный фронт, :8788
```

Проверка: открыть `http://localhost:5173` — на главной блок «Проверка бэкенда»
должен показать `API: ок` и `Neon: ок`.

## Миграции БД

```bash
npm run db:generate   # сгенерировать SQL из diff схемы
npm run db:migrate    # применить к БД из DATABASE_URL
```

## Деплой (Cloudflare Pages)

Подключить репозиторий к Pages со следующими настройками:

- **Build command:** `npm run build`
- **Build output directory:** `web/dist`
- **Root directory:** `/`

Переменные окружения проекта Pages (Production + Preview):

- runtime (Functions, Secret): `DATABASE_URL`, `SESSION_SECRET`, `TELEGRAM_BOT_TOKEN`,
  `OPENROUTER_API_KEY` (этап 4)
- build-time (Vite, plaintext): `VITE_TELEGRAM_BOT_USERNAME` (юзернейм бота без `@`),
  `VITE_MYMEMORY_EMAIL` (необяз., поднимает лимит MyMemory)

MyMemory дёргается **из браузера** (лимит по IP; из Worker общий IP Cloudflare
всегда исчерпан). Worker только кэширует результат в `translation_cache`.

Каталог `functions/` подхватывается автоматически, роуты — `/api/*`.
Список допущенных пользователей — в таблице `users` (первый вошедший = владелец), не env.
Домен виджета Telegram (`/setdomain` в BotFather) = `vocab.kunitcan.online` —
поэтому кнопка входа не работает с `*.pages.dev` и localhost, только с прод-домена.

Домен: **`vocab.kunitcan.online`** — CNAME на `<pages-проект>.pages.dev`, Proxied.
Привязывать через Pages → Custom domains (создаст запись сам). Отдельный `api.`
не нужен — API живёт на том же домене.
