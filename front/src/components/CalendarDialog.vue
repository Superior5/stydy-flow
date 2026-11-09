<script setup lang="ts">
import { ref } from "vue";
import { useDialog } from "../composables/dialog";
import { useCalendar } from "../composables/calendar";
import { useUI } from "../stores/ui";
import { api } from "../services/api";
import type { CalendarInfo } from "../types";
import Icon from "./Icon.vue";
const props = defineProps<{ kind: "create" | "plan" }>(),
  emit = defineEmits<{ close: []; created: [id: string] }>(),
  calendar = useCalendar(),
  ui = useUI(),
  panel = ref<HTMLElement>(),
  title = ref("Мой учебный план"),
  start = ref(calendar.today),
  busy = ref(false),
  error = ref("");
function close() {
  if (!busy.value) emit("close");
}
useDialog(panel, close);
async function submit() {
  busy.value = true;
  error.value = "";
  try {
    if (props.kind === "create") {
      const result = await api<CalendarInfo>("/calendars", "POST", {
        title: title.value,
      });
      await calendar.catalog();
      emit("created", result.id);
    } else {
      await api(`/calendars/${calendar.calendarId}/plan`, "POST", {
        start: start.value,
      });
      await calendar.catalog();
      calendar.start = start.value;
      await calendar.load();
      ui.notify("Четыре недели обучения добавлены в календарь");
    }
    emit("close");
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <Teleport to="body"
    ><div class="modal-backdrop" @click.self="close">
      <section
        ref="panel"
        class="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-dialog-title"
      >
        <button
          class="icon-button modal-close"
          aria-label="Закрыть"
          :disabled="busy"
          @click="close"
        >
          <Icon name="close" /></button
        ><span class="form-icon"
          ><Icon
            :name="kind === 'create' ? 'calendar' : 'graduate'"
            :size="28" /></span
        ><span class="eyebrow">ПРОСТРАНСТВО СОЗДАТЕЛЯ</span>
        <h2 id="calendar-dialog-title">
          {{ kind === "create" ? "Новый календарь" : "От основ Go до Backend" }}
        </h2>
        <p class="muted">
          {{
            kind === "create"
              ? "Вы станете создателем этого плана. По умолчанию его видите только вы."
              : "28 тем с практикой и материалами. Общий план будет доступен участникам, а прогресс у каждого останется личным."
          }}
        </p>
        <form @submit.prevent="submit">
          <label v-if="kind === 'create'"
            >Название календаря<input
              v-model="title"
              maxlength="100"
              required
              placeholder="Например, Go за четыре недели" /></label
          ><label v-else
            >Дата начала<input
              v-model="start"
              type="date"
              min="1900-01-01"
              max="2200-12-31"
              required
          /></label>
          <p v-if="error" class="form-error" role="alert">{{ error }}</p>
          <button class="button primary" :disabled="busy">
            <Icon v-if="busy" name="loader" class="spin" :size="17" />{{
              kind === "create" ? "Создать календарь" : "Добавить 28 тем"
            }}<Icon name="right" :size="17" />
          </button>
        </form>
      </section></div
  ></Teleport>
</template>
