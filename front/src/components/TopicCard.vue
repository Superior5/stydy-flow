<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { startTopicPointerDrag } from "../composables/topicPointerDrag";
import { useCalendar } from "../composables/calendar";
import type { Topic } from "../types";
import Icon from "./Icon.vue";
const props = defineProps<{
  topic: Topic;
  busy?: boolean;
  editing?: boolean;
  compact?: boolean;
}>();
const emit = defineEmits<{ open: [topic: Topic]; toggle: [topic: Topic] }>();
const calendar = useCalendar();
let ignoreClickUntil = 0;
const card = ref<HTMLElement | null>(null);
function open() {
  if (Date.now() >= ignoreClickUntil) emit("open", props.topic);
}
let cancelDrag: (() => void) | undefined;
function startDrag(event: PointerEvent) {
  if (props.editing || props.busy || !card.value) return;
  cancelDrag?.();
  cancelDrag = startTopicPointerDrag(event, card.value, {
    start: () => calendar.beginDrag(props.topic),
    hover: calendar.hoverDate,
    drop: (date) => void calendar.dropTopic(date),
    cancel: calendar.endDrag,
    finish: (moved) => {
      if (moved) ignoreClickUntil = Date.now() + 250;
      cancelDrag = undefined;
    },
  });
}
watch(
  () => calendar.dragging,
  (dragging) => {
    if (!dragging) cancelDrag?.();
  },
  { flush: "sync" },
);
onBeforeUnmount(() => cancelDrag?.());
const carried = computed(() =>
  props.topic.history.some((h) => h.kind === "auto"),
);
const category = computed(() => {
  const n = props.topic.notes;
  return n.includes("Основы Go")
    ? "Основы Go"
    : n.includes("Продвинутый Go")
      ? "Продвинутый Go"
      : n.includes("Advanced Backend")
        ? "Advanced Backend"
        : n.includes("Backend на Go")
          ? "Backend на Go"
          : "Самообучение";
});
</script>
<template>
  <article
    ref="card"
    class="topic-card"
    :class="{
      completed: topic.status === 'completed',
      carried,
      compact,
      'editable-card': editing,
      'has-drag-handle': !editing,
      'dragging-card': calendar.dragging?.topic.id === topic.id,
    }"
    :aria-busy="busy"
    @click="open"
  >
    <button
      v-if="!editing"
      type="button"
      class="topic-drag-handle"
      :disabled="busy"
      :aria-label="`Перенести тему «${topic.title}»`"
      title="Перетащите на другую дату или нажмите для выбора даты"
      @pointerdown.stop="startDrag"
      @dragstart.prevent
      @click.stop="
        Date.now() >= ignoreClickUntil && calendar.openSchedule(topic)
      "
    >
      <Icon name="grip" :size="compact ? 12 : 13" />
    </button>
    <div v-if="!compact" class="topic-card-top">
      <span
        class="topic-category"
        :class="{ backend: category.includes('Backend') }"
        >{{ category }}</span
      ><span class="topic-card-actions">
        <button
          v-if="!editing"
          type="button"
          class="topic-schedule-button icon-button"
          :aria-label="`Перенести тему «${topic.title}»`"
          title="Изменить личную дату"
          :disabled="busy"
          @click.stop="calendar.openSchedule(topic)"
        >
          <Icon name="calendar" :size="15" />
        </button>
        <button
          class="topic-menu icon-button"
          aria-label="Открыть тему"
          @click.stop="open"
        >
          <Icon :name="editing ? 'settings' : 'more'" :size="16" /></button
      ></span>
    </div>
    <div class="topic-title-row">
      <button
        v-if="!editing"
        class="checkbox"
        :class="{ checked: topic.status === 'completed' }"
        :disabled="busy"
        :aria-label="
          topic.status === 'completed'
            ? 'Вернуть в план'
            : 'Отметить выполненной'
        "
        :aria-pressed="topic.status === 'completed'"
        @click.stop="$emit('toggle', topic)"
      >
        <Icon
          v-if="topic.status === 'completed'"
          name="check"
          :size="12"
        /></button
      ><button
        class="topic-title"
        :title="compact ? topic.title : undefined"
        @click.stop="open"
      >
        {{ topic.title }}
      </button>
    </div>
    <div class="topic-meta">
      <span v-if="topic.resources.length" title="Учебные материалы"
        ><Icon name="link" :size="12" />{{ topic.resources.length }}</span
      ><span v-if="topic.notes" title="Есть заметки"
        ><Icon name="note" :size="12" /></span
      ><span v-if="carried" class="carry-label" title="Автоматически перенесено"
        ><Icon name="repeat" :size="12" />Перенесено</span
      >
    </div>
  </article>
</template>
