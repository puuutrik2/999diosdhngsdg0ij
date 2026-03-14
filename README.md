# SteamStatusSite

Мини‑сайт на Python (FastAPI), который по Steam ссылке показывает:

- ник
- аватар
- онлайн‑статус
- во что играет (если Steam отдаёт)
- watchlist (список слежения)
- история событий + уведомления (когда сайт замечает изменения)

Важно: сайт **не обходит приватность Steam** — показывает только то, что доступно через официальный Steam Web API.
Вход на сайт сделан через **Steam OpenID** (без пароля на сайт).

## Запуск (Windows / PowerShell)

```powershell
cd "$HOME\\OneDrive\\Документы\\SteamStatusSite"
py -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
Copy-Item .env.example .env
notepad .env
.\.venv\Scripts\python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

Открыть: `http://localhost:8000/`

## Хостинг (Render)

- Build command: `pip install -r requirements.txt`
- Start command: `python -m uvicorn app:app --host 0.0.0.0 --port $PORT --log-level info`
- Environment Variables:
  - `STEAM_API_KEY` (обязательно)
  - `SESSION_SECRET` (желательно, любая длинная случайная строка)
