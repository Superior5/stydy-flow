Получается **45 учебных дней: с понедельника 9 ноября 2026 по пятницу 8 января 2027**. 9 января — суббота.

Расчёт — **около 3 часов в день, всего 135 часов**:

- 45–60 минут — материалы и небольшие эксперименты.
- 90–105 минут — задачи или проект.
- 15 минут — тесты, заметки, commit.

План включает все будни, в том числе новогодние праздники, как ты и указал. Выходные свободны. Материалы на каждый день перечислены отдельно; документацию читай по указанным темам и примерам.

По ходу будут три рубежа: **обработчик отчётов → сервис бронирования → его развитие с фоновой обработкой и диагностикой**.

---

**Неделя 1 · 9–13 ноября — особенности языка**

| День | Что изучить | Практика и результат дня | Материалы |
|---|---|---|---|
| **Пн, 09.11** | Установка Go, modules, packages, imports, экспорт. Команды `run`, `build`, `test`, `fmt`, `vet`. | Создать репозиторий и модуль. Написать программу расчёта суммы заказов, вынести расчёт в отдельный package. | [Официальные tutorials: Getting started и Create a module](https://go.dev/doc/tutorial/); [Tour: Packages, variables, functions](https://go.dev/tour/) |
| **Вт, 10.11** | Типы, zero values, преобразования, функции, несколько результатов, `defer`. Условия и циклы — обзорно. | Реализовать расчёт стоимости заказа со скидкой и валидацией. Возвращать результат и ошибку. Проверить порядок выполнения `defer`. | [A Tour of Go: Basics](https://go.dev/tour/); [Effective Go: Functions и Control structures](https://go.dev/doc/effective_go) |
| **Ср, 11.11** | Arrays, slices, `len`, `cap`, `append`, `copy`, общая память. | Удалить дубликаты с сохранением порядка. Сделать фильтрацию с новым массивом и с переиспользованием исходного. Объяснить различия. | [Tour: More types](https://go.dev/tour/); [Go Slices: usage and internals](https://go.dev/blog/slices-intro) |
| **Чт, 12.11** | Maps, строки, bytes/runes, UTF-8, `range`, `nil` map и slice. | Написать подсчёт слов и частоты символов. Сравнить длину строки в байтах и рунах. Проверить чтение и запись в `nil` map. | [Tour: More types](https://go.dev/tour/); [Effective Go: Maps и Strings](https://go.dev/doc/effective_go) |
| **Пт, 13.11** | Structs, pointers, копирование значений, методы, pointer/value receivers. | Создать тип `Order`. Реализовать изменение статуса. Экспериментально проверить передачу struct, указателя, slice и map в функцию. | [Tour: Methods and interfaces](https://go.dev/tour/); [Effective Go: Methods](https://go.dev/doc/effective_go) |

**Проверка недели:** можешь объяснить, что копируется при передаче аргументов и почему два slice могут изменять одни данные.

---

**Неделя 2 · 16–20 ноября — идиомы, ошибки и тесты**

| День | Что изучить | Практика и результат дня | Материалы |
|---|---|---|---|
| **Пн, 16.11** | Interfaces, неявная реализация, композиция, embedding, typed nil. Обзор generics. | Описать маленький интерфейс хранилища заказов и реализацию в памяти. Воспроизвести случай, когда interface с nil-указателем не равен `nil`. | [Tour: Methods, interfaces, generics](https://go.dev/tour/); [Effective Go: Interfaces и Embedding](https://go.dev/doc/effective_go) |
| **Вт, 17.11** | Ошибки, `%w`, `errors.Is`, `errors.As`, ожидаемые ошибки, `panic`. | Добавить ошибки «не найдено», «неверный статус», «невалидные данные». Обернуть их контекстом и распознать на вызывающем уровне. | [Working with Errors in Go](https://go.dev/blog/go1.13-errors); [Effective Go: Errors и Panic](https://go.dev/doc/effective_go) |
| **Ср, 18.11** | Unit tests, table-driven tests, subtests, assertions обычным Go-кодом. | Покрыть расчёт стоимости и переходы статусов. Проверить обычный сценарий, границы и ошибки. | [Документация testing: примеры и Subtests](https://pkg.go.dev/testing); [Официальные tutorials: Add a test](https://go.dev/doc/tutorial/) |
| **Чт, 19.11** | Передача зависимостей, fake/stub, `t.Cleanup`, временные файлы. Структура проекта. | Протестировать сервис заказов через хранилище в памяти. Разделить запуск, бизнес-логику и хранение по packages. | [Organizing a Go module](https://go.dev/doc/modules/layout); [testing: Cleanup и TempDir](https://pkg.go.dev/testing) |
| **Пт, 20.11** | JSON, чтение файлов, отделение I/O от вычислений. Начало проекта №1. | Прочитать файл заказов. Реализовать расчёт выручки и агрегацию по статусам. Написать тесты вычислений. | [Официальные tutorials: Working with JSON](https://go.dev/doc/tutorial/); [testing](https://pkg.go.dev/testing) |

---

**Неделя 3 · 23–27 ноября — первый проект и HTTP**

**Проект №1: обработчик отчётов по заказам.** Вход — JSON-файл; выход — выручка по дням, популярные товары и ошибки данных. Деньги хранятся целым числом минимальных единиц валюты.

| День | Что изучить | Практика и результат дня | Материалы |
|---|---|---|---|
| **Пн, 23.11** | Обработка некорректных данных, детерминированный вывод, тестирование файлов. | Завершить проект №1: добавить отчёт по дням и товарам, ошибки с номером записи, тесты пустого и повреждённого файла, README. | [Официальные tutorials: Working with JSON](https://go.dev/doc/tutorial/); [testing: TempDir и Cleanup](https://pkg.go.dev/testing) |
| **Вт, 24.11** | `http.Handler`, `HandlerFunc`, `ServeMux`, маршруты, методы и параметры. | Начать тренировочный API задач в памяти: создать задачу, получить по ID, вывести список. | [net/http: Handler, HandlerFunc, ServeMux](https://pkg.go.dev/net/http) |
| **Ср, 25.11** | JSON в HTTP, статусы, валидация, лимит тела, единый формат ошибок. | Добавить изменение статуса задачи. Обработать некорректный JSON, отсутствующую задачу и слишком большой запрос. | [net/http: MaxBytesReader и Error](https://pkg.go.dev/net/http); [Официальные tutorials: Working with JSON](https://go.dev/doc/tutorial/) |
| **Чт, 26.11** | Middleware: request ID, логи, recovery. HTTP-тесты. | Написать middleware и тесты handlers: успешный запрос, ошибка валидации, `404`, `405`. | [httptest: ResponseRecorder и NewRequest](https://pkg.go.dev/net/http/httptest); [slog: обзор и примеры](https://pkg.go.dev/log/slog) |
| **Пт, 27.11** | `context`, cancellation, deadlines, HTTP-клиент, timeout, закрытие response body. | Добавить обращение к тестовому внешнему API. Через `httptest.NewServer` проверить медленный ответ и отмену запроса. | [context: обзор и примеры](https://pkg.go.dev/context); [net/http: Client и NewRequestWithContext](https://pkg.go.dev/net/http); [httptest: NewServer](https://pkg.go.dev/net/http/httptest) |

**Проверка недели:** проект №1 завершён; HTTP-обработчики тестируются без ручного запуска сервера; внешние запросы ограничены по времени.

---

**Неделя 4 · 30 ноября — 4 декабря — PostgreSQL**

| День | Что изучить | Практика и результат дня | Материалы |
|---|---|---|---|
| **Пн, 30.11** | PostgreSQL, таблицы, ключи, ограничения, миграции. | Запустить PostgreSQL через Compose. Создать миграции таблиц задач и пользователей с ограничениями. | [PostgreSQL Tutorial](https://www.postgresql.org/docs/current/tutorial.html); [Goose: миграции](https://pressly.github.io/goose/); [Docker: руководство для Go](https://docs.docker.com/guides/golang/) |
| **Вт, 01.12** | `pgx`, параметры запросов, scanning, ошибки, `pgxpool`, контекст. | Перенести хранение задач в PostgreSQL. Обработать отсутствие записи и нарушение уникальности. | [pgx: обзор и примеры](https://pkg.go.dev/github.com/jackc/pgx/v5); [Go: Accessing relational databases — общие принципы](https://go.dev/doc/database/) |
| **Ср, 02.12** | `JOIN`, агрегации, сортировка, пагинация. | Добавить фильтры задач, список по пользователю и статистику по статусам. Проверить запросы на небольшом наборе данных. | [PostgreSQL Tutorial: Queries, Joins, Aggregate Functions](https://www.postgresql.org/docs/current/tutorial.html); [pgx](https://pkg.go.dev/github.com/jackc/pgx/v5) |
| **Чт, 03.12** | Транзакции, commit/rollback, Read Committed, конкурентные обновления. | Реализовать перевод условных баллов между счетами. Проверить rollback. Воспроизвести потерянное обновление и исправить условным `UPDATE` или блокировкой. | [PostgreSQL: Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html); [Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html); [pgx: транзакции](https://pkg.go.dev/github.com/jackc/pgx/v5) |
| **Пт, 04.12** | Индексы, `EXPLAIN ANALYZE`, интеграционные тесты. | Подготовить большой набор задач. Сравнить запрос до и после индекса. Написать тест работы с реальной БД и независимой очисткой данных. | [PostgreSQL: Using EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html); [testing: Cleanup](https://pkg.go.dev/testing) |

**Проверка недели:** миграции поднимают пустую базу; тест подтверждает rollback; можешь объяснить, почему выбранный индекс помогает запросу.

---

**Неделя 5 · 7–11 декабря — курсовой проект №2**

**Проект: сервис бронирования мест на мероприятия.**

Сущности: мероприятие, клиент, бронирование. Возможности: список мероприятий, создание и отмена брони, история клиента. Главный инвариант: количество доступных мест не становится отрицательным.

| День | Что изучить / применить | Практика и результат дня | Материалы |
|---|---|---|---|
| **Пн, 07.12** | Моделирование данных, бизнес-правила, границы packages. | Описать endpoints и ошибки. Создать схему данных и миграции. Зафиксировать правила создания и отмены брони. | [Organizing a Go module](https://go.dev/doc/modules/layout); [PostgreSQL Tutorial: создание таблиц](https://www.postgresql.org/docs/current/tutorial.html); [Goose](https://pressly.github.io/goose/) |
| **Вт, 08.12** | HTTP-слой и чтение данных. | Реализовать создание, получение и список мероприятий с фильтрацией и пагинацией. Добавить HTTP-тесты. | [net/http](https://pkg.go.dev/net/http); [httptest](https://pkg.go.dev/net/http/httptest); [pgx](https://pkg.go.dev/github.com/jackc/pgx/v5) |
| **Ср, 09.12** | Атомарное бронирование и защита остатка. | Реализовать уменьшение остатка и создание брони в одной транзакции. Написать тест ошибки в середине операции. | [pgx: транзакции](https://pkg.go.dev/github.com/jackc/pgx/v5); [PostgreSQL: Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html); [Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html) |
| **Чт, 10.12** | Отмена брони, допустимые переходы статусов, повторные операции. | Реализовать отмену и возврат мест только один раз. Добавить историю клиента и тест двойной отмены. | [PostgreSQL: Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html); [pgx](https://pkg.go.dev/github.com/jackc/pgx/v5); [testing](https://pkg.go.dev/testing) |
| **Пт, 11.12** | Приёмка проекта, воспроизводимый запуск. | Завершить README, примеры запросов и Compose. Проверить запуск с пустой БД, rollback и сохранность данных после перезапуска. Оставшееся время — исправления. | [Docker: руководство для Go](https://docs.docker.com/guides/golang/); [Goose](https://pressly.github.io/goose/); [testing](https://pkg.go.dev/testing) |

**К концу недели:** сервис работает последовательно и покрыт тестами основных бизнес-правил. Проверку массовых конкурентных запросов добавишь на следующей неделе.

---

**Неделя 6 · 14–18 декабря — конкурентность**

| День | Что изучить | Практика и результат дня | Материалы |
|---|---|---|---|
| **Пн, 14.12** | Goroutines, `WaitGroup`, `Mutex`, data races. | Написать параллельный счётчик, воспроизвести гонку, исправить. Затем отправить 100 запросов на 10 мест: получить ровно 10 успешных броней. | [Tour: Concurrency](https://go.dev/tour/); [Data Race Detector](https://go.dev/doc/articles/race_detector) |
| **Вт, 15.12** | Channels, buffering, закрытие, `select`. | Реализовать небольшую очередь обработки заданий. Проверить закрытие очереди и поведение медленного потребителя. | [Tour: Concurrency](https://go.dev/tour/); [Effective Go: Channels](https://go.dev/doc/effective_go) |
| **Ср, 16.12** | Отмена конкурентной работы, deadlines, `errgroup`. | Проверить 100 URL с максимум пятью одновременными запросами. Добавить общий deadline и отмену. | [context](https://pkg.go.dev/context); [errgroup: примеры и SetLimit](https://pkg.go.dev/golang.org/x/sync/errgroup) |
| **Чт, 17.12** | Worker pool, ограниченная очередь, backpressure. | Сделать прототип отправки уведомлений в памяти. Ограничить workers и очередь. Определить поведение при переполнении. | [Tour: Concurrency](https://go.dev/tour/); [context](https://pkg.go.dev/context); [errgroup](https://pkg.go.dev/golang.org/x/sync/errgroup) |
| **Пт, 18.12** | Остановка workers, утечки, конкурентные тесты. | Проверить отмену во время обработки, остановку пустой очереди и зависшую внешнюю операцию. Запустить `go test -race ./...`. Повторить тест двойной отмены брони параллельно. | [Data Race Detector](https://go.dev/doc/articles/race_detector); [context](https://pkg.go.dev/context); [testing](https://pkg.go.dev/testing) |

**Проверка недели:** для каждой goroutine понятно, кто её останавливает. Ты различаешь гонку в памяти Go и конфликт конкурентных транзакций в БД.

---

**Неделя 7 · 21–25 декабря — надёжность и доступ**

С этой недели начинается **курсовой проект №3 — развитие сервиса бронирования**.

| День | Что изучить | Практика и результат дня | Материалы |
|---|---|---|---|
| **Пн, 21.12** | Идемпотентность, ключ запроса, сохранение результата, конкурентные повторы. | Добавить `Idempotency-Key` к созданию брони. Сохранять ключ и результат атомарно с операцией. Проверить повтор и одновременные запросы с одним ключом. | [Stripe: Idempotent requests](https://docs.stripe.com/api/idempotent_requests); [PostgreSQL: Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html) |
| **Вт, 22.12** | Аутентификация, авторизация, проверка владения объектом. | Добавить заранее выданные API-токены с хранением хешей. Получать клиента из токена. Запретить чтение и отмену чужой брони. | [OWASP: REST Security](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html); [net/http: middleware через Handler](https://pkg.go.dev/net/http) |
| **Ср, 23.12** | Валидация, лимиты, безопасные логи, ошибки API. | Проверить ограничения тела, количества мест и параметров пагинации. Убрать токены и внутренние ошибки из ответов и логов. Проверить одинаковый ключ с разными параметрами. | [OWASP: REST Security](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html); [net/http: MaxBytesReader](https://pkg.go.dev/net/http); [slog](https://pkg.go.dev/log/slog) |
| **Чт, 24.12** | Transactional outbox: бизнес-изменение и событие в одной транзакции. | Создать таблицу исходящих уведомлений. Записывать событие вместе с бронью. Проверить: при rollback нет ни брони, ни события. | [PostgreSQL Tutorial: Transactions](https://www.postgresql.org/docs/current/tutorial.html); [pgx: транзакции](https://pkg.go.dev/github.com/jackc/pgx/v5) |
| **Пт, 25.12** | Надёжное получение задач: блокировки, `SKIP LOCKED`, временное владение задачей. | Реализовать захват задания worker: короткая транзакция, статус обработки, срок владения. Проверить два workers и возврат задания после истечения срока. | [PostgreSQL: Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html); [PostgreSQL: SELECT, включая SKIP LOCKED](https://www.postgresql.org/docs/current/sql-select.html); [pgx](https://pkg.go.dev/github.com/jackc/pgx/v5) |

**Проверка недели:** повтор API-запроса не создаёт вторую бронь; клиент не видит чужие данные; событие уведомления переживает перезапуск приложения.

---

**Неделя 8 · 28 декабря — 1 января — доставка и эксплуатация**

| День | Что изучить | Практика и результат дня | Материалы |
|---|---|---|---|
| **Пн, 28.12** | Временные и постоянные ошибки, retries, exponential backoff, jitter. | Сделать тестовый получатель уведомлений с режимами `200`, `500`, timeout. Добавить ограниченные повторы, время следующей попытки и статус исчерпания попыток. | [net/http: Client](https://pkg.go.dev/net/http); [context](https://pkg.go.dev/context); [httptest: NewServer](https://pkg.go.dev/net/http/httptest) |
| **Вт, 29.12** | Доставка как минимум один раз, дубликаты, окно между отправкой и фиксацией результата. | Добавить ID события и дедупликацию у тестового получателя. Воспроизвести: событие обработано, ответ потерялся, отправитель повторил доставку. | [Stripe: Idempotent requests — пример контракта](https://docs.stripe.com/api/idempotent_requests); [PostgreSQL: Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html); [httptest](https://pkg.go.dev/net/http/httptest) |
| **Ср, 30.12** | Graceful shutdown, сигналы, завершение активной работы. | По сигналу прекратить приём запросов и захват новых заданий. Ограничить время остановки. Проверить восстановление незавершённой задачи после запуска. | [net/http: Server.Shutdown](https://pkg.go.dev/net/http); [context](https://pkg.go.dev/context); [signal: NotifyContext](https://pkg.go.dev/os/signal) |
| **Чт, 31.12** | Структурированные логи, request ID, event ID, длительность операций. | Добавить единый формат логов API и worker. По одному ID восстановить путь запроса; по event ID — историю попыток доставки. | [slog: обзор и примеры](https://pkg.go.dev/log/slog); [net/http](https://pkg.go.dev/net/http) |
| **Пт, 01.01** | Метрики, tracing, readiness/liveness. | Добавить число запросов, ошибки, длительность, размер очереди и число повторов. Инструментировать один HTTP-маршрут. Добавить проверки состояния процесса и готовности обслуживать запросы. | [OpenTelemetry: Getting Started для Go](https://opentelemetry.io/docs/languages/go/getting-started/); [Go Diagnostics](https://go.dev/doc/diagnostics) |

**Проверка недели:** недоступность получателя не теряет уведомления; повторы не создают повторный бизнес-эффект; остановка процесса имеет ограниченный срок.

---

**Неделя 9 · 4–8 января — производительность, сборка и защита**

| День | Что изучить | Практика и результат дня | Материалы |
|---|---|---|---|
| **Пн, 04.01** | Нагрузочные сценарии, throughput, p50/p95/p99, ошибки. | Написать k6-сценарий просмотра мероприятий и бронирования. Зафиксировать параметры окружения, объём данных и базовые результаты. | [k6: Get started](https://grafana.com/docs/k6/latest/get-started/); [Go Diagnostics](https://go.dev/doc/diagnostics) |
| **Вт, 05.01** | CPU/heap/goroutine profiles, SQL-планы, ожидание соединений. | Под нагрузкой найти одно узкое место. Снять профиль или план запроса. Внести одно обоснованное изменение и повторить измерение. | [Go Diagnostics: profiling](https://go.dev/doc/diagnostics); [PostgreSQL: Using EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html); [testing: benchmarks](https://pkg.go.dev/testing) |
| **Ср, 06.01** | Docker multi-stage build, конфигурация, запуск API и worker. | Собрать образ. Настроить Compose: API, worker, PostgreSQL, тестовый получатель. Проверить запуск из чистого окружения и применение миграций. | [Docker: руководство для Go](https://docs.docker.com/guides/golang/); [Goose](https://pressly.github.io/goose/) |
| **Чт, 07.01** | CI, сборка, тесты, анализ кода, зависимости. | Настроить CI: форматирование, `go vet`, unit/integration tests, race detector и `govulncheck`. Описать команды локальной проверки. | [GitHub Actions: Building and testing Go](https://docs.github.com/en/actions/tutorials/build-and-test-code/go); [Go Security](https://go.dev/doc/security/); [Data Race Detector](https://go.dev/doc/articles/race_detector) |
| **Пт, 08.01** | Итоговая приёмка и объяснение решений. | Выполнить сценарии ниже. Исправить критичные проблемы. Завершить README, схему данных и короткий отчёт производительности. | [PostgreSQL: Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html); [Go Diagnostics](https://go.dev/doc/diagnostics); [OWASP: REST Security](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html) |

---

**Что предъявить на итоговой защите 8 января**

Твой итоговый проект — **сервис бронирования с PostgreSQL, отдельным worker и надёжной доставкой уведомлений**.

Продемонстрируй восемь сценариев:

1. **Конкурентное бронирование:** 100 запросов на 10 мест дают ровно 10 успешных броней.
2. **Повтор запроса:** одинаковый ключ возвращает прежний результат; другие параметры с тем же ключом отклоняются.
3. **Двойная отмена:** места возвращаются один раз.
4. **Контроль доступа:** клиент не читает и не отменяет чужую бронь.
5. **Падение после commit:** событие остаётся в базе и обрабатывается после запуска.
6. **Падение worker:** незавершённая задача снова становится доступной.
7. **Потеря ответа получателя:** доставка повторяется, бизнес-эффект остаётся один.
8. **Нагрузка и остановка:** есть измерения, одно подтверждённое улучшение и корректное завершение процесса.

В репозитории должны быть:

- Инструкция запуска и примеры API-запросов.
- Миграции и схема данных.
- Автоматические тесты ключевых правил и сбоев.
- CI и Docker Compose.
- Короткое описание решений: защита остатка, идемпотентность, захват задач, повторная доставка.
- Отчёт «условия → измерение → проблема → изменение → повторное измерение».

**Если начнёшь отставать**, сначала сокращай оформление первого проекта, дополнительные endpoints, сложность tracing и число метрик. Сохрани время на транзакции, конкурентные проверки, отмену операций, идемпотентность и восстановление после сбоев — они дают основную глубину этого маршрута.