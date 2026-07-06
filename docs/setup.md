# Локальный запуск

## Требования

- Node.js ≥ 20
- pnpm ≥ 9 (`npm i -g pnpm@9`)
- Docker + Docker Compose (для Postgres)

## Первый запуск

```bash
# 1. Зависимости
pnpm install

# 2. Запустить Postgres
docker compose up postgres -d

# 3. Применить миграции
pnpm db:migrate          # или: pnpm --filter @ksc/db migrate:dev

# 4. Заполнить каталоги из YAML-файлов
pnpm db:seed             # или: pnpm --filter @ksc/db seed

# 5. Запустить API и фронтенд параллельно
pnpm dev
```

Фронтенд: http://localhost:5173  
API: http://localhost:3001/health

## .env

Скопируй `.env.example` → `.env`, проверь `DATABASE_URL`.

## Сборка для изолированной сети

```bash
# На машине с интернетом:
docker build -f infra/Dockerfile.api -t ksc-api:latest .
docker build -f infra/Dockerfile.web -t ksc-web:latest .

docker save ksc-api:latest ksc-web:latest postgres:16-alpine | gzip > ksc-images.tar.gz

# Перенести ksc-images.tar.gz на целевую машину, затем:
docker load < ksc-images.tar.gz
docker compose up -d
```

## Порядок разработки (из docs/data-model.md § 17.5)

1. ✅ Каталоги + сидер (текущая сессия)
2. Дерево групп + SettingField + редактор политики + `resolve_effective_settings`
3. Матрица сравнения + задачи
4. Автоматизации + ConditionBuilder + опросы сети
5. Change Management
6. RBAC KSC, KSN, backup, иерархия серверов
7. Плюсы/минусы и матрица атак (контент параллельно шагам 2-6)
