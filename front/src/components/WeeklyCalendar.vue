<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { DateTime } from "luxon";
import { useCalendar } from "../composables/calendar";
import TopicCard from "./TopicCard.vue";
import Icon from "./Icon.vue";
import type { Topic } from "../types";
const calendar = useCalendar();
defineEmits<{ open: [topic: Topic]; add: [date: string] }>();
const selected = ref(calendar.today);
const days = computed(() =>
  Array.from({ length: 7 }, (_, i) => {
    const d = DateTime.fromISO(calendar.rangeStart).plus({ days: i }),
      date = d.toISODate()!,
      topics =
        calendar.week?.topics.filter((t) => t.scheduledDate === date) || [];
    return {
      date,
      number: d.day,
      name: d.setLocale("ru").toFormat("ccc"),
      topics,
      completed: topics.filter((t) => t.status === "completed").length,
      transfers:
        calendar.week?.transfers.filter((t) => t.fromDate === date) || [],
    };
  }),
);
watch(
  () => calendar.rangeStart,
  () => {
    selected.value =
      calendar.today >= calendar.rangeStart &&
      calendar.today <= days.value[6].date
        ? calendar.today
        : calendar.rangeStart;
  },
  { immediate: true },
);
</script>
<template>
  <div class="mobile-days">
    <button
      v-for="day in days"
      :key="day.date"
      :class="{
        selected: selected === day.date,
        today: day.date === calendar.week?.today,
      }"
      @click="selected = day.date"
    >
      <span>{{ day.name }}</span
      ><strong>{{ day.number }}</strong
      ><i v-if="day.topics.length"></i>
    </button>
  </div>
  <section
    class="calendar-grid"
    aria-label="Недельный календарь"
    :aria-busy="calendar.loading"
  >
    <div
      v-for="day in days"
      :key="day.date"
      class="calendar-day"
      :class="{
        today: day.date === calendar.week?.today,
        past: day.date < (calendar.week?.today || ''),
        'mobile-selected': selected === day.date,
      }"
    >
      <header class="day-header">
        <div class="day-name">
          {{ day.name
          }}<span v-if="day.date === calendar.week?.today" class="today-tag"
            >Сегодня</span
          >
        </div>
        <div class="day-number-row">
          <strong class="day-number">{{
            String(day.number).padStart(2, "0")
          }}</strong
          ><span class="day-count"
            >{{ day.completed }}<span> / {{ day.topics.length }}</span></span
          >
        </div>
        <div class="day-progress">
          <span
            :style="{
              width:
                (day.topics.length
                  ? (day.completed / day.topics.length) * 100
                  : 0) + '%',
            }"
          ></span>
        </div>
      </header>
      <div class="day-content">
        <TopicCard
          v-for="topic in day.topics"
          :key="topic.id"
          :topic="topic"
          :busy="calendar.toggling.has(topic.id)"
          :editing="calendar.editing"
          @open="$emit('open', $event)"
          @toggle="calendar.toggle"
        />
        <div
          v-for="transfer in day.transfers"
          :key="transfer.id"
          class="transfer-ghost"
        >
          <Icon name="right" :size="13" /><span
            >{{ transfer.title
            }}<small
              >Перенесено на
              {{ DateTime.fromISO(transfer.toDate).toFormat("dd.MM") }}</small
            ></span
          >
        </div>
        <div
          v-if="!day.topics.length && !day.transfers.length"
          class="empty-day"
        >
          <span class="empty-line"></span>
          <p>Место для<br />новых знаний</p>
        </div>
        <button
          v-if="calendar.editing && calendar.canEdit"
          class="add-topic"
          @click="$emit('add', day.date)"
        >
          <Icon name="plus" :size="15" />Добавить тему
        </button>
      </div>
      <div
        v-if="day.topics.length && day.completed === day.topics.length"
        class="day-finished"
      >
        <Icon name="check" :size="13" /> Отличная работа
      </div>
    </div>
  </section>
</template>
