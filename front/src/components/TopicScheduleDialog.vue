<script setup lang="ts">
import { computed, nextTick, ref, useId } from "vue";
import { DateTime } from "luxon";
import { useCalendar } from "../composables/calendar";
import { useDialog } from "../composables/dialog";
import type { Topic } from "../types";
import Icon from "./Icon.vue";

const props = defineProps<{ request: { topic: Topic; calendarId: string } }>();
const emit = defineEmits<{ saved: [topic: Topic] }>();
const calendar = useCalendar();
const panel = ref<HTMLElement>();
const id = useId();
const topic = props.request.topic;
const selected = ref(topic.scheduledDate);
const minimum = computed(() =>
  topic.status === "completed" ? "1900-01-01" : calendar.today,
);
const initial =
  topic.scheduledDate < minimum.value ? minimum.value : topic.scheduledDate;
const month = ref(DateTime.fromISO(initial).startOf("month"));
const focusedDate = ref(initial);
const error = ref("");
const busy = computed(() => calendar.moving.has(topic.id));
function close() {
  if (!busy.value) calendar.scheduleRequest = null;
}
useDialog(panel, close);
const monthTitle = computed(() =>
  month.value.setLocale("ru").toFormat("LLLL yyyy"),
);
const canPrevious = computed(
  () => month.value.toFormat("yyyy-MM") > minimum.value.slice(0, 7),
);
const canNext = computed(() => month.value.toFormat("yyyy-MM") < "2200-12");
const days = computed(() => {
  const first = month.value.startOf("week");
  return Array.from({ length: 42 }, (_, index) => {
    const d = first.plus({ days: index });
    const date = d.toISODate()!;
    return {
      date,
      number: d.day,
      outside: d.month !== month.value.month,
      disabled: date < minimum.value || date > "2200-12-31",
    };
  });
});
function choose(date: string) {
  if (busy.value || !calendar.canSchedule(topic, date)) return;
  selected.value = focusedDate.value = date;
  error.value = "";
}
function navigate(offset: number) {
  month.value = month.value.plus({ months: offset });
  focusedDate.value =
    month.value.toISODate()! < minimum.value
      ? minimum.value
      : month.value.toISODate()!;
}
function quick(offset: number) {
  const date = DateTime.fromISO(calendar.today)
    .plus({ days: offset })
    .toISODate()!;
  choose(date);
  month.value = DateTime.fromISO(date).startOf("month");
}
async function key(event: KeyboardEvent) {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "button[data-date]",
  );
  if (!button || busy.value) return;
  const date = DateTime.fromISO(button.dataset.date!);
  let target: DateTime;
  switch (event.key) {
    case "ArrowLeft":
      target = date.minus({ days: 1 });
      break;
    case "ArrowRight":
      target = date.plus({ days: 1 });
      break;
    case "ArrowUp":
      target = date.minus({ days: 7 });
      break;
    case "ArrowDown":
      target = date.plus({ days: 7 });
      break;
    case "Home":
      target = date.startOf("week");
      break;
    case "End":
      target = date.endOf("week");
      break;
    case "PageUp":
      target = date.minus({ months: 1 });
      break;
    case "PageDown":
      target = date.plus({ months: 1 });
      break;
    default:
      return;
  }
  event.preventDefault();
  const iso = target.toISODate()!;
  focusedDate.value =
    iso < minimum.value
      ? minimum.value
      : iso > "2200-12-31"
        ? "2200-12-31"
        : iso;
  month.value = DateTime.fromISO(focusedDate.value).startOf("month");
  await nextTick();
  panel.value
    ?.querySelector<HTMLButtonElement>(`[data-date="${focusedDate.value}"]`)
    ?.focus({ preventScroll: true });
}
async function save() {
  if (busy.value || selected.value === topic.scheduledDate) return;
  error.value = "";
  try {
    const updated = await calendar.reschedule(topic, selected.value);
    if (updated) {
      emit("saved", updated);
      close();
    }
  } catch (e) {
    error.value = (e as Error).message;
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-backdrop" @click.self="close">
      <section
        ref="panel"
        class="modal schedule-dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="`${id}-title`"
        :aria-busy="busy"
      >
        <header class="schedule-header">
          <div>
            <span class="eyebrow">ЛИЧНОЕ РАСПИСАНИЕ</span>
            <h2 :id="`${id}-title`">Перенести тему</h2>
          </div>
          <button
            type="button"
            class="icon-button"
            aria-label="Закрыть выбор даты"
            :disabled="busy"
            @click="close"
          >
            <Icon name="close" />
          </button>
        </header>
        <div class="schedule-body">
          <p class="schedule-topic">{{ topic.title }}</p>
          <p class="muted schedule-explanation">
            Дата изменится только в вашем плане. Заметка и отметка выполнения
            сохранятся.
          </p>
          <div class="schedule-month">
            <button
              type="button"
              class="icon-button"
              aria-label="Предыдущий месяц"
              :disabled="busy || !canPrevious"
              @click="navigate(-1)"
            >
              <Icon name="prev" :size="18" />
            </button>
            <strong aria-live="polite">{{ monthTitle }}</strong>
            <button
              type="button"
              class="icon-button"
              aria-label="Следующий месяц"
              :disabled="busy || !canNext"
              @click="navigate(1)"
            >
              <Icon name="next" :size="18" />
            </button>
          </div>
          <div class="schedule-weekdays" aria-hidden="true">
            <span
              v-for="name in ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']"
              :key="name"
              >{{ name }}</span
            >
          </div>
          <div
            class="schedule-days"
            role="group"
            aria-label="Выберите новую дату темы"
            @keydown="key"
          >
            <button
              v-for="day in days"
              :key="day.date"
              type="button"
              :data-date="day.date"
              :disabled="busy || day.disabled"
              :tabindex="day.date === focusedDate ? 0 : -1"
              :aria-label="
                DateTime.fromISO(day.date)
                  .setLocale('ru')
                  .toFormat('d MMMM yyyy')
              "
              :aria-pressed="selected === day.date"
              :aria-current="day.date === calendar.today ? 'date' : undefined"
              :class="{
                outside: day.outside,
                today: day.date === calendar.today,
                selected: selected === day.date,
                original: day.date === topic.scheduledDate,
              }"
              @click="choose(day.date)"
            >
              {{ day.number }}
            </button>
          </div>
          <div class="schedule-quick">
            <button
              type="button"
              class="text-button"
              :disabled="busy"
              @click="quick(0)"
            >
              Сегодня</button
            ><button
              type="button"
              class="text-button"
              :disabled="busy"
              @click="quick(1)"
            >
              Завтра
            </button>
          </div>
          <p
            v-if="topic.status !== 'completed'"
            class="muted schedule-explanation"
          >
            Незавершённые темы можно планировать на сегодня и будущие даты.
            Просроченные темы автоматически переносятся на текущий день.
          </p>
          <p class="schedule-selection" aria-live="polite">
            {{
              DateTime.fromISO(topic.scheduledDate)
                .setLocale("ru")
                .toFormat("d MMMM yyyy")
            }}
            <Icon name="right" :size="15" />
            {{
              DateTime.fromISO(selected).setLocale("ru").toFormat("d MMMM yyyy")
            }}
          </p>
          <p v-if="error" class="personal-note-error" role="alert">
            {{ error }}
          </p>
        </div>
        <footer class="schedule-footer">
          <button type="button" class="button" :disabled="busy" @click="close">
            Отмена
          </button>
          <button
            type="button"
            class="button primary"
            :disabled="
              busy ||
              selected === topic.scheduledDate ||
              !calendar.canSchedule(topic, selected)
            "
            @click="save"
          >
            <Icon v-if="busy" name="loader" :size="16" class="spin" />{{
              busy ? "Переносим…" : "Перенести"
            }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
