<script setup lang="ts">
import { computed, ref } from "vue";
import { DateTime } from "luxon";
import { useCalendar } from "../composables/calendar";
import { useAuth } from "../stores/auth";
import { useDialog } from "../composables/dialog";
import { formatTopicCount } from "../utils/text";
import type { Topic } from "../types";
import TopicCard from "./TopicCard.vue";
import Icon from "./Icon.vue";

const props = defineProps<{ date: string }>();
const emit = defineEmits<{
  close: [];
  open: [topic: Topic];
  add: [date: string];
}>();
const panel = ref<HTMLElement>();
const calendar = useCalendar();
const auth = useAuth();
const topics = computed(
  () =>
    calendar.week?.topics.filter(
      (topic) => topic.scheduledDate === props.date,
    ) || [],
);
const completed = computed(
  () => topics.value.filter((topic) => topic.status === "completed").length,
);
useDialog(panel, () => emit("close"));
function open(topic: Topic) {
  emit("open", topic);
}
function add() {
  emit("add", props.date);
}
async function toggle(topic: Topic) {
  // Avoid stacking focus traps when an anonymous learner needs to sign in.
  if (!auth.user) emit("close");
  await calendar.toggle(topic);
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-backdrop" @click.self="emit('close')">
      <section
        ref="panel"
        class="modal day-agenda-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="day-agenda-title"
      >
        <header class="day-agenda-header">
          <div>
            <span class="eyebrow">ВСЕ ТЕМЫ ДНЯ</span>
            <h2 id="day-agenda-title">
              {{ DateTime.fromISO(date).setLocale("ru").toFormat("d MMMM") }}
            </h2>
            <span class="muted day-agenda-weekday">{{
              DateTime.fromISO(date).setLocale("ru").toFormat("cccc, yyyy")
            }}</span>
          </div>
          <button
            class="icon-button"
            aria-label="Закрыть список тем дня"
            @click="emit('close')"
          >
            <Icon name="close" />
          </button>
        </header>
        <div class="day-agenda-summary">
          <span>{{ formatTopicCount(topics.length) }} в плане</span>
          <span v-if="!calendar.editing"
            ><Icon name="check" :size="14" />Изучено {{ completed }} из
            {{ topics.length }}</span
          >
          <span v-else class="access-pill creator">Редактирование плана</span>
        </div>
        <div class="day-agenda-list">
          <TopicCard
            v-for="topic in topics"
            :key="topic.id"
            :topic="topic"
            :editing="calendar.editing"
            :busy="calendar.toggling.has(topic.id)"
            @open="open"
            @toggle="toggle"
          />
          <p v-if="!topics.length" class="muted agenda-empty">
            На этот день пока нет тем.
          </p>
        </div>
        <footer class="day-agenda-footer">
          <span class="muted">Нажмите на тему, чтобы открыть её целиком</span>
          <button
            v-if="calendar.editing && calendar.canEdit"
            class="button primary"
            @click="add"
          >
            <Icon name="plus" :size="16" />Добавить тему
          </button>
          <button v-else class="button" @click="emit('close')">
            К календарю
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
