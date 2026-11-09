<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { DateTime } from "luxon";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { useDialog } from "../composables/dialog";
import { useCalendar } from "../composables/calendar";
import { useAuth } from "../stores/auth";
import { api } from "../services/api";
import type { Topic, PersonalNote } from "../types";
import Icon from "./Icon.vue";
const props = defineProps<{ topic: Topic }>(),
  emit = defineEmits<{ close: [] }>(),
  panel = ref<HTMLElement>(),
  calendar = useCalendar(),
  auth = useAuth();
const personalText = ref(""),
  savedText = ref(""),
  loadingNote = ref(false),
  savingNote = ref(false),
  noteError = ref(""),
  noteLoaded = ref(false),
  updatedAt = ref<string | null>(null),
  discardPrompt = ref(false);
const dirty = computed(() => personalText.value !== savedText.value);
let noteRequest = 0;
function requestClose() {
  if (savingNote.value) return;
  if (dirty.value) discardPrompt.value = true;
  else emit("close");
}
useDialog(panel, requestClose);
const notePath = () =>
  `/calendars/${calendar.calendarId}/topics/${props.topic.id}/personal-note`;
async function loadNote() {
  const request = ++noteRequest;
  personalText.value = savedText.value = "";
  updatedAt.value = null;
  noteError.value = "";
  noteLoaded.value = false;
  loadingNote.value = !!auth.user;
  if (!auth.user) return;
  try {
    const note = await api<PersonalNote>(notePath());
    if (request !== noteRequest) return;
    personalText.value = savedText.value = note.text;
    updatedAt.value = note.updatedAt;
    noteLoaded.value = true;
  } catch (e) {
    if (request === noteRequest) noteError.value = (e as Error).message;
  } finally {
    if (request === noteRequest) loadingNote.value = false;
  }
}
watch(() => [auth.user?.id, calendar.calendarId, props.topic.id], loadNote, {
  immediate: true,
});
async function saveNote() {
  if (savingNote.value || !noteLoaded.value || !auth.user) return;
  savingNote.value = true;
  noteError.value = "";
  const text = personalText.value,
    request = noteRequest;
  try {
    const note = await api<PersonalNote>(notePath(), "PATCH", { text });
    if (request !== noteRequest) return;
    savedText.value = note.text;
    personalText.value = note.text;
    updatedAt.value = note.updatedAt;
    discardPrompt.value = false;
  } catch (e) {
    noteError.value = (e as Error).message;
  } finally {
    savingNote.value = false;
  }
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (!dirty.value) return;
  event.preventDefault();
  event.returnValue = "";
}
onMounted(() => window.addEventListener("beforeunload", beforeUnload));
onBeforeUnmount(() => {
  ++noteRequest;
  window.removeEventListener("beforeunload", beforeUnload);
});
function loginForNotes() {
  auth.requireLogin(undefined, "Войдите, чтобы вести личные заметки к темам");
}
const current = computed(
  () =>
    calendar.week?.topics.find((t) => t.id === props.topic.id) || props.topic,
);
const rendered = computed(() =>
  DOMPurify.sanitize(
    marked.parse(current.value.notes, { async: false }) as string,
  ),
);
async function toggle() {
  if (!auth.user) emit("close");
  await calendar.toggle(current.value);
}
</script>
<template>
  <Teleport to="body"
    ><div class="modal-backdrop" @click.self="requestClose">
      <section
        ref="panel"
        class="modal topic-reader"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reader-title"
      >
        <header class="reader-header">
          <span class="eyebrow">УЧЕБНАЯ ТЕМА · ПРОСМОТР</span
          ><button
            class="icon-button"
            aria-label="Закрыть тему"
            @click="requestClose"
          >
            <Icon name="close" />
          </button>
        </header>
        <h2 id="reader-title">{{ current.title }}</h2>
        <div class="reader-meta">
          <span
            ><Icon name="calendar" :size="15" />{{
              DateTime.fromISO(current.scheduledDate)
                .setLocale("ru")
                .toFormat("d MMMM yyyy")
            }}</span
          ><span :class="{ done: current.status === 'completed' }"
            ><Icon
              :name="current.status === 'completed' ? 'check' : 'clock'"
              :size="15"
            />{{
              current.status === "completed" ? "Изучено вами" : "В вашем темпе"
            }}</span
          >
        </div>
        <div v-if="discardPrompt" class="personal-note-discard" role="alert">
          <p>В заметке есть несохранённые изменения.</p>
          <button
            class="button primary"
            :disabled="savingNote"
            @click="saveNote"
          >
            Сохранить
          </button>
          <button class="button" @click="discardPrompt = false">
            Продолжить писать
          </button>
          <button class="text-button" @click="emit('close')">
            Закрыть без сохранения
          </button>
        </div>
        <div class="reader-scroll">
          <div
            v-if="current.notes"
            class="markdown-preview reader-notes"
            v-html="rendered"
          ></div>
          <p v-else class="muted">Автор пока не добавил описание темы.</p>
          <section v-if="current.resources.length" class="reader-resources">
            <h3>Материалы для изучения</h3>
            <a
              v-for="(resource, index) in current.resources"
              :key="resource.id || index"
              :href="resource.url"
              target="_blank"
              rel="noopener noreferrer"
              ><span class="resource-number">{{
                String(index + 1).padStart(2, "0")
              }}</span
              ><span
                >{{ resource.title }}<small>{{ resource.url }}</small></span
              ><Icon name="external" :size="16"
            /></a>
          </section>
          <section
            class="personal-note-section"
            aria-labelledby="personal-note-title"
          >
            <h3 id="personal-note-title">
              <Icon name="note" :size="17" />Личная заметка
            </h3>
            <p class="muted">
              Ваши мысли, вопросы и примечания. Видны только вам, включая
              заметки к общему плану.
            </p>
            <button v-if="!auth.user" class="button" @click="loginForNotes">
              Войти и добавить заметку
            </button>
            <p v-else-if="loadingNote" class="muted" role="status">
              Загружаем заметку…
            </p>
            <template v-else>
              <textarea
                v-if="noteLoaded"
                v-model="personalText"
                aria-label="Личная заметка к теме"
                rows="6"
                maxlength="100000"
                :disabled="savingNote"
                placeholder="Что стоит запомнить? Какие вопросы остались?"
              />
              <p v-if="noteError" class="personal-note-error" role="alert">
                {{ noteError }}
              </p>
              <div class="personal-note-actions">
                <button v-if="!noteLoaded" class="button" @click="loadNote">
                  Повторить загрузку
                </button>
                <button
                  v-else
                  class="button"
                  :disabled="savingNote || !dirty"
                  @click="saveNote"
                >
                  <Icon
                    :name="savingNote ? 'loader' : 'check'"
                    :size="16"
                    :class="{ spin: savingNote }"
                  />
                  {{ savingNote ? "Сохраняем…" : "Сохранить заметку" }}
                </button>
                <span v-if="noteLoaded" class="muted" role="status">{{
                  dirty
                    ? "Есть изменения"
                    : updatedAt
                      ? "Все изменения сохранены"
                      : "Пока без заметки"
                }}</span>
              </div>
            </template>
          </section>
          <section v-if="current.history.length" class="history-section">
            <h3><Icon name="repeat" :size="16" />История планирования</h3>
            <div v-for="h in current.history" :key="h.id" class="history-event">
              <span class="history-dot"></span>
              <div>
                {{ h.fromDate }} → {{ h.toDate
                }}<small>{{
                  h.kind === "auto"
                    ? "Автоматический перенос"
                    : "Автор изменил дату"
                }}</small>
              </div>
            </div>
          </section>
        </div>
        <footer class="reader-footer">
          <span class="muted">Отметка видна только вам</span
          ><button
            class="button primary"
            :disabled="calendar.toggling.has(current.id)"
            @click="toggle"
          >
            <Icon
              :name="current.status === 'completed' ? 'repeat' : 'check'"
              :size="17"
            />{{
              current.status === "completed"
                ? "Вернуть в план"
                : "Отметить изученной"
            }}
          </button>
        </footer>
      </section>
    </div></Teleport
  >
</template>
