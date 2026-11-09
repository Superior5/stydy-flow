<script setup lang="ts">
import { ref, nextTick, computed, watch } from "vue";
import { useDialog } from "../composables/dialog";
import { DateTime } from "luxon";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { api } from "../services/api";
import { useUI } from "../stores/ui";
import { useCalendar } from "../composables/calendar";
import type { Topic, Resource } from "../types";
import Icon from "./Icon.vue";
const props = defineProps<{ topic: Topic | null; date: string }>(),
  emit = defineEmits<{ close: [] }>();
const ui = useUI(),
  calendar = useCalendar();
const panel = ref<HTMLElement>(),
  title = ref(props.topic?.title || ""),
  notes = ref(props.topic?.notes || ""),
  date = ref(props.topic?.scheduledDate || props.date),
  resources = ref<Resource[]>(
    props.topic?.resources.map((r) => ({ ...r })) || [],
  ),
  busy = ref(false),
  error = ref(""),
  preview = ref(false),
  confirmDelete = ref(false);
const rendered = computed(() =>
  DOMPurify.sanitize(marked.parse(notes.value, { async: false }) as string),
);
watch(confirmDelete, async (visible) => {
  if (!visible) return;
  await nextTick();
  const confirmation =
    panel.value?.querySelector<HTMLElement>(".delete-confirm");
  confirmation?.scrollIntoView({ block: "nearest" });
  confirmation?.querySelector<HTMLButtonElement>("button")?.focus();
});
useDialog(panel, () => {
  if (busy.value) return;
  if (confirmDelete.value) confirmDelete.value = false;
  else emit("close");
});
async function save() {
  busy.value = true;
  error.value = "";
  try {
    const body = {
      title: title.value,
      notes: notes.value,
      scheduledDate: date.value,
      calendarId: calendar.calendarId,
      resources: resources.value.map(({ title, url }) => ({ title, url })),
    };
    await api(
      props.topic ? `/topics/${props.topic.id}` : "/topics",
      props.topic ? "PATCH" : "POST",
      body,
    );
    await calendar.load();
    ui.notify(
      props.topic ? "Изменения сохранены" : "Тема добавлена в ваш план",
    );
    emit("close");
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
async function remove() {
  if (!props.topic) return;
  busy.value = true;
  try {
    await api(`/topics/${props.topic.id}`, "DELETE");
    await calendar.load();
    ui.notify("Тема удалена");
    emit("close");
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
function safeUrl(url: string) {
  try {
    return ["https:", "http:"].includes(new URL(url).protocol)
      ? url
      : undefined;
  } catch {
    return undefined;
  }
}
</script>
<template>
  <Teleport to="body"
    ><div class="drawer-backdrop" @click.self="!busy && emit('close')">
      <section
        ref="panel"
        class="topic-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
      >
        <header class="drawer-header">
          <span
            ><Icon name="book" :size="17" />{{
              topic ? "ДЕТАЛИ ТЕМЫ" : "НОВАЯ ТЕМА"
            }}</span
          ><button
            class="icon-button"
            :disabled="busy"
            aria-label="Закрыть панель"
            @click="emit('close')"
          >
            <Icon name="close" />
          </button>
        </header>
        <form class="drawer-form" @submit.prevent="save">
          <div class="drawer-scroll">
            <h2 id="drawer-title">
              {{ topic ? "Всё начинается с интереса" : "Что изучим дальше?" }}
            </h2>
            <label
              >Название темы<input
                v-model="title"
                required
                maxlength="200"
                placeholder="Например, Goroutines и конкурентность"
            /></label>
            <div class="form-two">
              <label
                >Запланировано на<input
                  v-model="date"
                  type="date"
                  min="1900-01-01"
                  max="2200-12-31"
                  required
              /></label>
            </div>
            <div class="notes-label">
              <label for="notes">Описание темы</label
              ><button
                type="button"
                class="text-button"
                @click="preview = !preview"
              >
                {{ preview ? "Редактировать" : "Предпросмотр" }}
              </button>
            </div>
            <div
              v-if="preview"
              class="markdown-preview"
              v-html="rendered || '<p>Здесь появятся ваши заметки.</p>'"
            ></div>
            <textarea
              v-else
              id="notes"
              v-model="notes"
              rows="9"
              maxlength="100000"
              placeholder="Цели, практика и пояснения для участников…"
            ></textarea
            ><small class="field-help"
              >Поддерживается Markdown: **жирный**, # заголовок, списки.</small
            >
            <div class="section-heading">
              <h3><Icon name="link" :size="17" />Учебные материалы</h3>
              <span>{{ resources.length }} / 30</span>
            </div>
            <div
              v-for="(resource, index) in resources"
              :key="index"
              class="resource-editor"
            >
              <div class="resource-title-row">
                <span class="resource-number">{{
                  String(index + 1).padStart(2, "0")
                }}</span
                ><input
                  v-model="resource.title"
                  required
                  maxlength="200"
                  :aria-label="`Название источника ${index + 1}`"
                  placeholder="Название источника"
                /><a
                  v-if="safeUrl(resource.url)"
                  :href="safeUrl(resource.url)"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="icon-button"
                  title="Открыть источник"
                  ><Icon name="external" :size="16" /></a
                ><button
                  type="button"
                  class="icon-button danger-text"
                  aria-label="Удалить источник"
                  @click="resources.splice(index, 1)"
                >
                  <Icon name="trash" :size="16" />
                </button>
              </div>
              <input
                v-model="resource.url"
                type="url"
                pattern="https?://.*"
                maxlength="2048"
                required
                :aria-label="`URL источника ${index + 1}`"
                placeholder="https://"
              />
            </div>
            <button
              type="button"
              class="button resource-add"
              :disabled="resources.length >= 30"
              @click="resources.push({ title: '', url: '' })"
            >
              <Icon name="plus" :size="16" />Добавить источник
            </button>
            <section v-if="topic?.history.length" class="history-section">
              <h3><Icon name="repeat" :size="17" />История планирования</h3>
              <p class="muted">
                Впервые запланировано:
                {{
                  DateTime.fromISO(topic.originalDate).toFormat("dd.MM.yyyy")
                }}
              </p>
              <div v-for="h in topic.history" :key="h.id" class="history-event">
                <span class="history-dot"></span>
                <div>
                  {{ DateTime.fromISO(h.fromDate).toFormat("dd.MM") }} →
                  {{ DateTime.fromISO(h.toDate).toFormat("dd.MM.yyyy")
                  }}<small>{{
                    h.kind === "auto"
                      ? "Автоматический перенос"
                      : "Дата изменена вручную"
                  }}</small>
                </div>
              </div>
            </section>
            <p v-if="error" class="form-error" role="alert">{{ error }}</p>
            <div v-if="confirmDelete" class="delete-confirm" role="alert">
              <strong>Удалить тему и все её заметки?</strong>
              <p>Восстановить её не получится.</p>
              <button
                type="button"
                class="button danger"
                :disabled="busy"
                @click="remove"
              >
                Да, удалить</button
              ><button
                type="button"
                class="button"
                @click="confirmDelete = false"
              >
                Отмена
              </button>
            </div>
          </div>
          <footer class="drawer-footer">
            <button
              v-if="topic"
              type="button"
              class="icon-button danger-text"
              title="Удалить тему"
              :disabled="busy"
              @click="confirmDelete = true"
            >
              <Icon name="trash" :size="19" /></button
            ><button
              type="button"
              class="button"
              :disabled="busy"
              @click="emit('close')"
            >
              Отмена</button
            ><button class="button primary" :disabled="busy">
              <Icon v-if="busy" name="loader" class="spin" :size="17" />{{
                topic ? "Сохранить изменения" : "Добавить тему"
              }}
            </button>
          </footer>
        </form>
      </section>
    </div></Teleport
  >
</template>
