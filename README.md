# Тир-лист «Что бы я сделал за...»

Статичный сайт без сборки и зависимостей: 100 испытаний на силу воли (год без телефона, месяц без Telegram, неделя без интернета, месяц стримов каждый день и т.д.), 8 тиров от «за бесплатно» до «ни за какие деньги». Тап-выбор или драг мышью, автосохранение в localStorage, случайное задание, поиск по банку и экспорт тир-листа в PNG.

## Локальный запуск

Открыть `index.html` двойным кликом или поднять сервер:

```powershell
cd money-tierlist
python -m http.server 8080
```

Дальше — http://localhost:8080

## Деплой на Render

### Вариант 1 — через Blueprint (быстрее)

1. Залей проект в GitHub:

   ```powershell
   cd money-tierlist
   git init
   git add .
   git commit -m "money tier list"
   gh repo create money-tierlist --public --source . --push
   ```

2. Зайди на [dashboard.render.com](https://dashboard.render.com) → **New** → **Blueprint**.
3. Подключи репозиторий `money-tierlist`. Render сам прочитает `render.yaml`.
4. Нажми **Apply**. Через минуту сайт будет на `https://money-tierlist.onrender.com`.

### Вариант 2 — вручную

1. **New** → **Static Site** → подключи репозиторий.
2. Настройки:
   - **Build Command** — оставить пустым
   - **Publish Directory** — `.`
3. **Create Static Site**.

Сборка не нужна: Render просто раздаёт статику. При пуше в `main` деплой обновится автоматически.

## Файлы

- `index.html` — разметка
- `styles.css` — оформление и адаптив
- `data.js` — тиры и 100 заданий (правь список здесь)
- `app.js` — логика: выбор, драг, сохранение, PNG
- `avatar.jpg` — аватарка из шапки
- `og.jpg` — картинка для превью в соцсетях
- `render.yaml` — конфиг Render Blueprint

## Как менять список

В `data.js` отредактируй массив `ITEMS`. Количество не ограничено, но интерфейс рассчитан примерно на 100 заданий. Названия тиров и суммы — в массиве `TIERS` и объекте `VALUES`.

Прогресс хранится в браузере под ключом `money-tierlist:v2`, поэтому после обновления списка старые сохранения могут не совпасть — сотри прогресс кнопкой «Сброс» или очисти localStorage.
