# Установка на VPS: go.its-403.ru

Инструкция для Ubuntu/Debian с уже установленными PM2 и Nginx. Проект остаётся в `/root/stydy-flow`, команды на VPS выполняются от root в том же PM2, где уже работают остальные приложения. На других дистрибутивах пути конфигурации Nginx и установка Certbot могут отличаться.

Схема: **браузер → HTTPS Nginx → 127.0.0.1:3007 → Express (frontend + API) → SQLite**. Vite в production не запускается. PostgreSQL для текущего проекта не используется. Другие приложения продолжают работать на своих портах и доменах.

## 1. Проверки на сервере

```bash
node --version
npm --version
command -v node
ss -ltnp 'sport = :3007'
nginx -T 2>/dev/null | rg 'server_name.*go\.its-403\.ru'
```

Если `rg` не установлен, используйте `grep`. Порт 3007 должен быть свободен. Нужен Node.js 22.12+; подходит Node.js 24 LTS. Не меняйте глобальную версию Node для других работающих сервисов без проверки их совместимости.

Проверьте `pm2 ls`: должны быть видны уже работающие сервисы. Не устанавливайте второй PM2 и не меняйте `PM2_HOME`. Если сервисы работают под другим пользователем, его PM2 и PM2 root — разные списки процессов.

DNS-запись A `go.its-403.ru` должна указывать на публичный IPv4 VPS. Если есть AAAA, IPv6 также должен вести на этот VPS. В сетевом firewall должны быть доступны 80 и 443; порт 3007 слушает только loopback.

## 2. Скачать и собрать проект

Проект уже клонирован в `/root/stydy-flow`:

```bash
cd /root/stydy-flow
npm ci --include=dev
npm run build
mkdir -p /var/lib/studyflow
chmod 700 /var/lib/studyflow
```

При ошибках сборки better-sqlite3 могут потребоваться `python3`, `make` и `g++` (`apt install build-essential python3`).

## 3. Production-переменные

```bash
cd /root/stydy-flow
cp .env.production.example .env
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
nano .env
```

Вставьте сгенерированное значение в `SESSION_SECRET`. Содержимое `.env`:

```dotenv
NODE_ENV=production
PORT=3007
APP_ORIGIN=https://go.its-403.ru
DATABASE_PATH=/var/lib/studyflow/studyflow.sqlite
SESSION_SECRET=ВСТАВЬТЕ_СГЕНЕРИРОВАННОЕ_СЛУЧАЙНОЕ_ЗНАЧЕНИЕ
```

`APP_ORIGIN` должен совпадать с публичным HTTPS-адресом, без завершающего `/`. Он участвует в проверке запросов входа и сохранения данных. Секрет храните неизменным между обычными перезапусками, чтобы не сбрасывать сессии.

```bash
chmod 600 /root/stydy-flow/.env
```

Не добавляйте `.env` в Git.

## 4. Перенести существующие аккаунты и данные

Аккаунты, пароль автора календаря, учебные темы, личные заметки и прогресс находятся **в SQLite, а не в Git**. Для их переноса выполните на компьютере с текущей базой, в корне проекта:

```bash
npm run db:backup -- ./backups/transfer.sqlite
scp ./backups/transfer.sqlite root@<VPS_IP>:/root/studyflow-transfer.sqlite
```

Команда использует SQLite backup API и корректно работает с включённым WAL. Файл содержит персональные данные и хеши паролей. Для повторного снимка выберите другое имя: существующая копия не перезаписывается.

На VPS **до первого запуска сервиса**, если целевого файла базы ещё нет:

```bash
test ! -e /var/lib/studyflow/studyflow.sqlite && install -m 600 /root/studyflow-transfer.sqlite /var/lib/studyflow/studyflow.sqlite
```

Если база уже существует, остановитесь: сначала сделайте её резервную копию и решите, какую базу сохранять. Не заменяйте файл работающей базы и не копируйте один `.sqlite` из WAL-базы вручную.

Если переносить данные не требуется, пропустите этот шаг: сервер создаст новую базу и публичный учебный план автоматически. Созданные локально аккаунты в новой базе отсутствуют; системный автор нового плана по умолчанию не имеет доступного пароля.

## 5. Запустить через PM2

Если ранее запускали именно `studyflow.service` из предыдущей инструкции, сначала отключите только его:

```bash
systemctl disable --now studyflow.service
```

Если такого сервиса нет, этот шаг пропустите. Существующий systemd-сервис самого PM2 отключать не нужно.

Проверьте порт и текущие приложения:

```bash
ss -ltnp 'sport = :3007'
pm2 ls
```

Порт должен быть свободен перед первым запуском StudyFlow. Если процесс `studyflow` уже есть в PM2, используйте команду restart ниже вместо start.

```bash
cd /root/stydy-flow
pm2 start ecosystem.config.cjs --only studyflow
pm2 status studyflow
pm2 logs studyflow --lines 80
```

Просмотр логов завершайте Ctrl+C: приложение продолжит работать. Проверка HTTP:

```bash
curl -I http://127.0.0.1:3007/
curl http://127.0.0.1:3007/api/calendars
```

Конфигурация запускает один экземпляр backend в fork-режиме из каталога `back/`, с `NODE_ENV=production`, без слежения за файлами. Express раздаёт собранный frontend и API. Переменные читаются из корневого `.env`; после его изменения перезапускайте через ecosystem-файл:

```bash
pm2 restart ecosystem.config.cjs --only studyflow --update-env
```

Миграции базы применяются при старте. PM2 перезапускает упавшее приложение и даёт ему до 30 секунд на корректное завершение при остановке.

Когда StudyFlow работает, проверьте `pm2 ls` и сохраните список процессов:

```bash
pm2 save
```

Если автозапуск PM2 уже настроен для root, повторно настраивать его не нужно. Иначе выполните `pm2 startup` и следуйте выведенной команде. PM2 может использовать systemd для собственного автозапуска — отдельный `studyflow.service` при этом не нужен.

Управление только этим приложением:

```bash
pm2 status studyflow
pm2 logs studyflow --lines 100
pm2 stop studyflow
pm2 restart ecosystem.config.cjs --only studyflow --update-env
```

Не используйте `pm2 restart all`, `pm2 delete all` или `pm2 kill`: на сервере есть другие приложения.

## 6. Подключить Nginx

Если `server_name go.its-403.ru` уже есть в конфигурации Nginx, измените существующий блок: не создавайте второй с тем же доменом. Сохраните текущую конфигурацию HTTPS, если сертификат уже настроен, и замените `location /` на проксирование из `deploy/nginx.conf`.

Если домен ещё не настроен в Nginx:

```bash
cd /root/stydy-flow
install -m 644 deploy/nginx.conf /etc/nginx/sites-available/go.its-403.ru
ln -s /etc/nginx/sites-available/go.its-403.ru /etc/nginx/sites-enabled/go.its-403.ru
nginx -t
systemctl reload nginx
```

Выполняйте reload только после успешного `nginx -t`. Конфигурация обслуживает конкретный домен и не меняет `default_server` или конфигурации соседних сервисов. Проксируется весь сайт, включая `/api`, `/studio` и `/progress`; Express сам раздаёт frontend и обрабатывает SPA-маршруты.

## 7. Включить HTTPS

Если сертификат для этого домена ещё не установлен, используйте уже установленный на VPS Certbot. Если Certbot отсутствует, установите его и плагин Nginx способом для вашей ОС; для Ubuntu/Debian с apt:

```bash
apt update
apt install certbot python3-certbot-nginx
```

Не устанавливайте второй экземпляр Certbot через apt, если уже используется snap или другой способ. Затем:

```bash
certbot --nginx -d go.its-403.ru --redirect
nginx -t
systemctl reload nginx
certbot renew --dry-run
```

Завершите запросы Certbot по email и условиям использования. Проверьте автоматическое продление существующим механизмом Certbot (systemd timer или cron), не дублируя уже настроенный.

В production cookie сессии имеет флаг `Secure`: полноценный вход проверяйте через **https://go.its-403.ru**, а не по HTTP или IP. Заголовок `X-Forwarded-Proto` из готового конфига нужен Express для корректного определения HTTPS.

## 8. Проверить и обновлять

Откройте `https://go.its-403.ru`: должны загружаться календарь, вход, заметки и «Мастерская» автора. При перенесённой базе работают ранее созданные аккаунты и их пароли.

Проверить HTTP без браузера:

```bash
curl -I https://go.its-403.ru/
curl https://go.its-403.ru/api/calendars
```

Перед обновлением сделайте резервную копию. Команды на VPS выполняются от root:

```bash
cd /root/stydy-flow
npm run db:backup
git pull --ff-only
npm ci --include=dev
npm run build
pm2 restart ecosystem.config.cjs --only studyflow --update-env
pm2 status studyflow
pm2 save
```

Команда резервного копирования без аргументов создаёт файл с датой и временем в `backups/`. В production база находится вне репозитория, `/var/lib/studyflow/studyflow.sqlite`, и остаётся на месте при обновлении кода. Не пересоздавайте `.env` и не меняйте `SESSION_SECRET` при обычном обновлении.

Не запускайте `npm start` параллельно с PM2: оба процесса попытаются занять порт 3007.
