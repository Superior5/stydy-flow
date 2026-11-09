import { DateTime } from "luxon";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Connection } from "../db/index.js";
import { topics, resources, users } from "../db/schema.js";
import { personalCalendar } from "./calendar-access.js";
// Curated per-topic official references; the exercise is part of the saved notes.
export const curriculum: [string, string, string, string][] = [
  [
    "Go: первый запуск и go mod",
    "doc/tutorial/getting-started",
    "Создайте модуль, запустите программу и добавьте внешнюю зависимость.",
    "Основы Go",
  ],
  [
    "Переменные, константы и типы",
    "tour/basics/8",
    "Напишите конвертер температур. Попробуйте явные преобразования типов.",
    "Основы Go",
  ],
  [
    "Условия, циклы и функции",
    "tour/flowcontrol/1",
    "Реализуйте FizzBuzz и функцию проверки простого числа.",
    "Основы Go",
  ],
  [
    "Массивы, slices и maps",
    "tour/moretypes/6",
    "Подсчитайте частоту слов в тексте. Проверьте разницу len и cap.",
    "Основы Go",
  ],
  [
    "Указатели и структуры",
    "tour/moretypes/1",
    "Создайте структуру Account с методом пополнения баланса через указатель.",
    "Основы Go",
  ],
  [
    "Методы и интерфейсы",
    "tour/methods/1",
    "Определите интерфейс хранилища и две реализации: в памяти и в файле.",
    "Основы Go",
  ],
  [
    "Ошибки и defer · практика недели",
    "doc/effective_go#errors",
    "Напишите CLI для чтения файла. Оберните ошибки, закройте файл через defer; изучите panic и recover.",
    "Основы Go",
  ],
  [
    "Packages и границы проекта",
    "doc/modules/layout",
    "Разделите CLI на пакеты. Обоснуйте каждую экспортируемую функцию.",
    "Продвинутый Go",
  ],
  [
    "Тесты и benchmarks",
    "doc/tutorial/add-a-test",
    "Добавьте table-driven tests, граничные случаи и benchmark к конвертеру.",
    "Продвинутый Go",
  ],
  [
    "Generics без лишних абстракций",
    "doc/tutorial/generics",
    "Напишите типобезопасную функцию поиска по slice с ограничением comparable.",
    "Продвинутый Go",
  ],
  [
    "Context и отмена операций",
    "blog/context",
    "Отмените длительную операцию по таймауту. Всегда вызывайте cancel.",
    "Продвинутый Go",
  ],
  [
    "Goroutines и жизненный цикл",
    "tour/concurrency/1",
    "Параллельно обработайте три задачи. Дождитесь завершения всех горутин.",
    "Продвинутый Go",
  ],
  [
    "Channels, select и backpressure",
    "tour/concurrency/2",
    "Создайте producer/consumer с буферизованным каналом и отменой через context.",
    "Продвинутый Go",
  ],
  [
    "Mutex, WaitGroup и race detector",
    "doc/articles/race_detector",
    "Соберите worker pool. Запустите go test -race, исправьте гонки и утечки.",
    "Продвинутый Go",
  ],
  [
    "Первый HTTP-сервер",
    "",
    "Создайте GET /health и graceful shutdown по системному сигналу.",
    "Backend на Go",
  ],
  [
    "REST API и middleware",
    "",
    "Добавьте CRUD заметок, middleware логирования и единый JSON-ответ.",
    "Backend на Go",
  ],
  [
    "Валидация и ошибки API",
    "",
    "Проверьте обязательные поля, лимиты тела запроса и статусы 400, 404, 409.",
    "Backend на Go",
  ],
  [
    "SQL и database/sql",
    "doc/tutorial/database-access",
    "Создайте таблицу заметок, параметризованные запросы и обработку sql.ErrNoRows.",
    "Backend на Go",
  ],
  [
    "Транзакции и миграции",
    "doc/database/execute-transactions",
    "Сохраните заказ и позиции атомарно; проверьте rollback при ошибке.",
    "Backend на Go",
  ],
  [
    "Аутентификация и авторизация",
    "",
    "Добавьте сессии, безопасные cookies и проверку владельца каждой записи.",
    "Backend на Go",
  ],
  [
    "Интеграционные тесты HTTP API",
    "",
    "Протестируйте полный CRUD, чужой ID, неверный JSON и повторный запрос.",
    "Backend на Go",
  ],
  [
    "Архитектура и границы модулей",
    "doc/modules/layout",
    "Разделите HTTP, бизнес-правила и хранение. Избегайте интерфейсов без потребителя.",
    "Advanced Backend",
  ],
  [
    "Контракты и проектирование API",
    "",
    "Опишите API заметок: поля, ошибки, пагинацию, обратную совместимость.",
    "Advanced Backend",
  ],
  [
    "Идемпотентность и конкурентные записи",
    "doc/database/execute-transactions",
    "Добавьте ключ идемпотентности. Проверьте два одновременных запроса.",
    "Advanced Backend",
  ],
  [
    "Кеширование и инвалидация",
    "",
    "Реализуйте небольшой TTL-кеш, инвалидируйте запись при изменении.",
    "Advanced Backend",
  ],
  [
    "Очереди и асинхронная обработка",
    "blog/pipelines",
    "Добавьте очередь задач, повторные попытки и остановку воркеров без потери работы.",
    "Advanced Backend",
  ],
  [
    "Logging, metrics и tracing",
    "",
    "Добавьте структурированные логи, request ID, длительность запросов и счётчик ошибок.",
    "Advanced Backend",
  ],
  [
    "Profiling и production · итоговый проект",
    "blog/pprof",
    "Снимите CPU-профиль и benchmark. Соберите бинарник, настройте таймауты и graceful shutdown.",
    "Advanced Backend",
  ],
];
const special: Record<number, string> = {
  14: "https://pkg.go.dev/net/http",
  15: "https://pkg.go.dev/net/http#ServeMux",
  16: "https://pkg.go.dev/encoding/json",
  19: "https://owasp.org/API-Security/",
  20: "https://pkg.go.dev/net/http/httptest",
  22: "https://owasp.org/API-Security/",
  24: "https://pkg.go.dev/sync",
  26: "https://pkg.go.dev/log/slog",
};
export function createPlan(
  c: Connection,
  userId: string,
  start: string,
  calendarId?: string,
  allowHandled = false,
) {
  return c.sqlite.transaction(() => {
    const user = c.db.select().from(users).where(eq(users.id, userId)).get()!;
    if (user.planHandled && !allowHandled) return false;
    const now = new Date().toISOString();
    calendarId ||= personalCalendar(c, userId).id;
    curriculum.forEach(([title, path, exercise, section], i) => {
      const id = randomUUID(),
        date = DateTime.fromISO(start).plus({ days: i }).toISODate()!;
      c.db
        .insert(topics)
        .values({
          id,
          userId,
          calendarId,
          planDate: date,
          title,
          notes: `## ${section}\n\nЦель: разобраться в теме «${title}» и применить её на практике.\n\n### Практика\n${exercise}\n\n### Проверка\nОбъясните решение своими словами, добавьте тесты и запишите выводы.`,
          originalDate: date,
          scheduledDate: date,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      c.db
        .insert(resources)
        .values({
          id: randomUUID(),
          topicId: id,
          title: special[i]
            ? i === 19 || i === 22
              ? "OWASP API Security"
              : "Документация стандартной библиотеки"
            : "Go · официальное руководство",
          url: special[i] || `https://go.dev/${path}`,
        })
        .run();
    });
    c.db
      .update(users)
      .set({ planHandled: true, updatedAt: now })
      .where(eq(users.id, userId))
      .run();
    return true;
  })();
}
