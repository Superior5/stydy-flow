<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { DateTime } from "luxon";
import { useCalendar } from "../composables/calendar";
import TopicCard from "./TopicCard.vue";
import DayAgendaDialog from "./DayAgendaDialog.vue";
import Icon from "./Icon.vue";
import { formatTopicCount } from "../utils/text";
import type { Topic } from "../types";
const calendar = useCalendar();
defineEmits<{ open: [topic: Topic]; add: [date: string] }>();
const selected = ref(calendar.today);
const agendaDate = ref<string | null>(null);
const previewLimit = 2;
function selectDay(date: string) {
  selected.value = date;
  if (window.matchMedia("(min-width: 601px)").matches) agendaDate.value = date;
}
const days = computed(() => {
  const count = DateTime.fromISO(calendar.rangeEnd).diff(
    DateTime.fromISO(calendar.rangeStart),
    "days",
  ).days;
  return Array.from({ length: count }, (_, i) => {
    const d = DateTime.fromISO(calendar.rangeStart).plus({ days: i }),
      date = d.toISODate()!,
      topics =
        calendar.week?.topics.filter((t) => t.scheduledDate === date) || [];
    return {
      date,
      number: d.day,
      outside: d.month !== DateTime.fromISO(calendar.start).month,
      topics,
      completed: topics.filter((t) => t.status === "completed").length,
    };
  });
});
const selectedDay = computed(() =>
  days.value.find((d) => d.date === selected.value),
);
watch(
  () => calendar.start,
  () => {
    selected.value =
      calendar.today.slice(0, 7) === calendar.start.slice(0, 7)
        ? calendar.today
        : DateTime.fromISO(calendar.start).startOf("month").toISODate()!;
    agendaDate.value = null;
  },
  { immediate: true },
);
</script>
<template>
  <section
    class="month-calendar"
    aria-label="Месячный календарь"
    :aria-busy="calendar.loading"
  >
    <div class="month-weekdays">
      <span
        v-for="name in ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']"
        :key="name"
        >{{ name }}</span
      >
    </div>
    <div class="month-grid">
      <div
        v-for="day in days"
        :key="day.date"
        class="month-day"
        :class="{
          today: day.date === calendar.week?.today,
          outside: day.outside,
          selected: selected === day.date,
          'topic-drop-target': calendar.dropDate === day.date,
          'topic-drop-available': calendar.canDrop(day.date),
        }"
        :data-topic-drop-date="day.date"
      >
        <header class="month-day-header">
          <button
            class="month-date"
            :aria-label="
              DateTime.fromISO(day.date).setLocale('ru').toFormat('d MMMM yyyy')
            "
            :aria-pressed="selected === day.date"
            @click="selectDay(day.date)"
          >
            {{ day.number }}</button
          ><span v-if="day.topics.length" class="month-count">{{
            calendar.editing
              ? formatTopicCount(day.topics.length)
              : `${day.completed}/${day.topics.length}`
          }}</span
          ><button
            v-if="calendar.editing && calendar.canEdit"
            class="icon-button month-add"
            :aria-label="`Добавить тему на ${day.date}`"
            @click="$emit('add', day.date)"
          >
            <Icon name="plus" :size="14" />
          </button>
        </header>
        <div class="month-topics">
          <TopicCard
            v-for="topic in day.topics.slice(0, previewLimit)"
            :key="topic.id"
            :topic="topic"
            :editing="calendar.editing"
            :compact="true"
            :busy="calendar.isBusy(topic.id)"
            @open="$emit('open', $event)"
            @toggle="calendar.toggle"
          />
          <span v-if="!day.topics.length" class="month-empty">—</span>
        </div>
        <button
          v-if="day.topics.length > previewLimit"
          class="month-more"
          :aria-label="`Все темы на ${DateTime.fromISO(day.date).setLocale('ru').toFormat('d MMMM')}: ${day.topics.length}`"
          aria-haspopup="dialog"
          @click="agendaDate = day.date"
        >
          <span
            >Ещё {{ formatTopicCount(day.topics.length - previewLimit) }}</span
          >
          <Icon name="right" :size="13" />
        </button>
        <span v-if="day.topics.length" class="month-mobile-dots"
          ><i
            v-for="topic in day.topics.slice(0, 4)"
            :key="topic.id"
            :class="{ done: topic.status === 'completed' }"
          ></i
        ></span>
      </div>
    </div>
  </section>
  <section v-if="selectedDay" class="mobile-day-agenda">
    <header>
      <h3>
        {{
          DateTime.fromISO(selectedDay.date)
            .setLocale("ru")
            .toFormat("d MMMM, cccc")
        }}
      </h3>
      <button
        v-if="calendar.editing && calendar.canEdit"
        class="button"
        @click="$emit('add', selectedDay.date)"
      >
        <Icon name="plus" :size="16" />Тема
      </button>
    </header>
    <TopicCard
      v-for="topic in selectedDay.topics"
      :key="topic.id"
      :topic="topic"
      :editing="calendar.editing"
      :busy="calendar.isBusy(topic.id)"
      @open="$emit('open', $event)"
      @toggle="calendar.toggle"
    />
    <p v-if="!selectedDay.topics.length" class="muted agenda-empty">
      На этот день пока нет тем.
    </p>
  </section>
  <DayAgendaDialog
    v-if="agendaDate"
    :date="agendaDate"
    @close="agendaDate = null"
    @open="$emit('open', $event)"
    @add="$emit('add', $event)"
  />
</template>
