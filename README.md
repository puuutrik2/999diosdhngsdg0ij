# SteamStatusSite

Мини‑сайт на Python (FastAPI), который по Steam ссылке показывает:

- ник
- аватар
- онлайн‑статус
- во что играет (если Steam отдаёт)

Важно: сайт **не обходит приватность Steam** — показывает только то, что доступно через официальный Steam Web API.

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

