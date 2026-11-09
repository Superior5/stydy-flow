<script setup lang="ts">
import { computed } from "vue";
import type { Topic } from "../types";
import Icon from "./Icon.vue";
const props = defineProps<{
  topic: Topic;
  busy?: boolean;
  editing?: boolean;
  compact?: boolean;
}>();
defineEmits<{ open: [topic: Topic]; toggle: [topic: Topic] }>();
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
    class="topic-card"
    :class="{
      completed: topic.status === 'completed',
      carried,
      compact,
      'editable-card': editing,
    }"
    @click="$emit('open', topic)"
  >
    <div v-if="!compact" class="topic-card-top">
      <span
        class="topic-category"
        :class="{ backend: category.includes('Backend') }"
        >{{ category }}</span
      ><button
        class="topic-menu icon-button"
        aria-label="Открыть тему"
        @click.stop="$emit('open', topic)"
      >
        <Icon :name="editing ? 'settings' : 'more'" :size="16" />
      </button>
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
        @click.stop="$emit('open', topic)"
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
