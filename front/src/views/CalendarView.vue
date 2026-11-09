<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { DateTime } from "luxon";
import { useCalendar } from "../composables/calendar";
import { useAuth } from "../stores/auth";
import { useUI } from "../stores/ui";
import { api } from "../services/api";
import WeeklyCalendar from "../components/WeeklyCalendar.vue";
import MonthlyCalendar from "../components/MonthlyCalendar.vue";
import TopicDrawer from "../components/TopicDrawer.vue";
import TopicReader from "../components/TopicReader.vue";
import CalendarDialog from "../components/CalendarDialog.vue";
import Icon from "../components/Icon.vue";
import AppSelect from "../components/AppSelect.vue";
import type { Topic, CalendarInfo } from "../types";
const route = useRoute(),
  router = useRouter(),
  calendar = useCalendar(),
  auth = useAuth(),
  ui = useUI();
const editing = computed(() => route.path === "/studio"),
  available = computed(() =>
    calendar.calendars.filter((c) => !editing.value || c.role === "creator"),
  );
const editorOpen = ref(false),
  readerTopic = ref<Topic | null>(null),
  selectedTopic = ref<Topic | null>(null),
  selectedDate = ref(""),
  dialog = ref<"create" | "plan" | null>(null),
  settingsOpen = ref(false),
  draftTitle = ref(""),
  draftPublic = ref(false),
  saving = ref(false);
let generation = 0,
  lastDate = "",
  timer: ReturnType<typeof setInterval>;
const range = computed(() => {
  const a = DateTime.fromISO(calendar.start).setLocale("ru");
  if (!a.isValid) return "";
  if (calendar.view === "month") return a.toFormat("LLLL yyyy");
  const b = a.startOf("week").plus({ days: 6 });
  return `${a.startOf("week").toFormat("d MMM")} – ${b.toFormat("d MMM yyyy")}`;
});
const current = computed(
  () =>
    calendar.week?.calendar ||
    calendar.calendars.find((c) => c.id === calendar.calendarId),
);
async function initialize() {
  const request = ++generation;
  calendar.week = null;
  calendar.loading = true;
  calendar.editing = editing.value;
  readerTopic.value = null;
  editorOpen.value = false;
  settingsOpen.value = false;
  try {
    await calendar.catalog();
    if (request !== generation) return;
    const requested =
      typeof route.query.calendar === "string" ? route.query.calendar : "";
    calendar.calendarId =
      requested ||
      (editing.value
        ? available.value[0]?.id
        : calendar.calendars.find((c) => c.isDefault)?.id) ||
      "";
    await calendar.load();
    lastDate = calendar.today;
  } catch (e) {
    calendar.loading = false;
    calendar.loadError = (e as Error).message;
    ui.notify(calendar.loadError, true);
  }
}
watch([() => route.fullPath, () => auth.user?.id], initialize, {
  immediate: true,
});
async function selectCalendar(value: string) {
  await router.replace({
    path: route.path,
    query: { calendar: value },
  });
}
function add(date: string) {
  if (!calendar.canEdit || !editing.value) return;
  selectedTopic.value = null;
  selectedDate.value = date;
  editorOpen.value = true;
}
async function open(topic: Topic) {
  try {
    const fresh = await api<Topic>(
      `/calendars/${calendar.calendarId}/topics/${topic.id}?mode=${editing.value ? "edit" : "read"}`,
    );
    if (editing.value && calendar.canEdit) {
      selectedTopic.value = fresh;
      selectedDate.value = fresh.scheduledDate;
      editorOpen.value = true;
    } else readerTopic.value = fresh;
  } catch (e) {
    ui.notify((e as Error).message, true);
  }
}
function create() {
  if (
    auth.requireLogin(() => {
      dialog.value = "create";
    }, "Войдите, чтобы создать свой календарь")
  )
    dialog.value = "create";
}
async function created(id: string) {
  await router.push({ path: "/studio", query: { calendar: id } });
}
function openSettings() {
  draftTitle.value = current.value?.title || "";
  draftPublic.value = current.value?.isPublic || false;
  settingsOpen.value = !settingsOpen.value;
}
async function saveSettings() {
  saving.value = true;
  try {
    const updated = await api<CalendarInfo>(
      `/calendars/${calendar.calendarId}`,
      "PATCH",
      { title: draftTitle.value, isPublic: draftPublic.value },
    );
    await calendar.catalog();
    if (calendar.week) calendar.week.calendar = updated;
    settingsOpen.value = false;
    ui.notify("Настройки календаря сохранены");
  } catch (e) {
    ui.notify((e as Error).message, true);
  } finally {
    saving.value = false;
  }
}
async function share() {
  try {
    await navigator.clipboard.writeText(
      `${location.origin}/?calendar=${calendar.calendarId}`,
    );
    ui.notify("Ссылка на календарь скопирована");
  } catch {
    ui.notify(
      "Ссылка на календарь: " +
        `${location.origin}/?calendar=${calendar.calendarId}`,
    );
  }
}
function refresh() {
  if (
    document.visibilityState === "visible" &&
    !editorOpen.value &&
    !auth.authOpen
  )
    void calendar.load();
}
onMounted(() => {
  document.addEventListener("visibilitychange", refresh);
  window.addEventListener("focus", refresh);
  lastDate = calendar.today;
  timer = setInterval(() => {
    const date = DateTime.now()
      .setZone(
        auth.user?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      )
      .toISODate()!;
    if (date !== lastDate) {
      lastDate = date;
      void calendar.load();
    }
  }, 15000);
});
onBeforeUnmount(() => {
  generation++;
  clearInterval(timer);
  document.removeEventListener("visibilitychange", refresh);
  window.removeEventListener("focus", refresh);
});
</script>
<template>
  <div class="calendar-workspace" :class="{ 'edit-workspace': editing }">
    <div class="workspace-heading">
      <div>
        <span class="eyebrow">{{
          editing
            ? "МАСТЕРСКАЯ · ПРОСТРАНСТВО СОЗДАТЕЛЯ"
            : "ПЛАН ПЕРЕД ГЛАЗАМИ. ЗНАНИЯ — В ВАШЕМ ТЕМПЕ."
        }}</span>
        <h1>
          {{ editing ? "Создавайте траекторию" : "Календарь обучения"
          }}<span class="heading-dot">.</span>
        </h1>
        <p class="muted">
          {{
            editing
              ? "Темы, материалы и расписание. Здесь вы задаёте направление."
              : "Изучайте общий план и отмечайте собственные шаги вперёд."
          }}
        </p>
      </div>
      <button class="button" @click="create">
        <Icon name="plus" :size="17" />Новый календарь
      </button>
    </div>
    <div class="calendar-context">
      <div class="calendar-select-wrap">
        <Icon name="book" :size="18" /><AppSelect
          v-if="available.length"
          :model-value="calendar.calendarId"
          :options="
            available.map((item) => ({ value: item.id, label: item.title }))
          "
          label="Выбрать календарь"
          @update:model-value="selectCalendar"
        /><span v-else class="muted">У вас пока нет своих календарей</span
        ><span v-if="current" class="access-pill" :class="{ creator: editing }"
          ><Icon :name="editing ? 'settings' : 'book'" :size="12" />{{
            editing ? "Создатель" : "Просмотр"
          }}</span
        >
      </div>
      <div v-if="current" class="context-actions">
        <span class="creator-label">Автор: {{ current.creatorName }}</span
        ><template v-if="editing && calendar.canEdit"
          ><button class="text-button" @click="openSettings">
            <Icon name="settings" :size="15" />Настройки</button
          ><RouterLink
            :to="{ path: '/', query: { calendar: calendar.calendarId } }"
            class="button"
            ><Icon name="external" :size="15" />Открыть просмотр</RouterLink
          ></template
        ><template v-else
          ><button
            v-if="current.isPublic"
            class="icon-button"
            title="Скопировать ссылку"
            aria-label="Скопировать ссылку на календарь"
            @click="share"
          >
            <Icon name="link" :size="16" /></button
          ><RouterLink
            v-if="calendar.canEdit"
            :to="{ path: '/studio', query: { calendar: calendar.calendarId } }"
            class="button"
            ><Icon name="settings" :size="15" />Редактировать план</RouterLink
          ></template
        >
      </div>
    </div>
    <form
      v-if="settingsOpen && editing && calendar.canEdit"
      class="calendar-settings"
      @submit.prevent="saveSettings"
    >
      <label
        >Название календаря<input
          v-model="draftTitle"
          maxlength="100"
          required /></label
      ><label class="publish-option"
        ><input v-model="draftPublic" type="checkbox" /><span
          >Открыть календарь для всех<small
            >Темы, описания и источники станут доступны без входа. Личный
            прогресс остаётся приватным.</small
          ></span
        ></label
      >
      <div>
        <button class="button primary" :disabled="saving">
          Сохранить настройки</button
        ><button type="button" class="button" @click="settingsOpen = false">
          Отмена
        </button>
      </div>
    </form>
    <div
      v-if="editing && !available.length && !calendar.loading"
      class="studio-empty"
    >
      <span class="form-icon"><Icon name="calendar" :size="30" /></span>
      <h2>У каждого плана есть автор.<br />Следующий — ваш.</h2>
      <p class="muted">
        Создайте календарь, добавьте темы и материалы.<br />При желании откройте
        его для других.
      </p>
      <button class="button primary" @click="create">
        <Icon name="plus" :size="17" />Создать мой календарь</button
      ><RouterLink to="/" class="text-button"
        >Вернуться к открытому плану</RouterLink
      >
    </div>
    <template v-else
      ><div v-if="editing && calendar.canEdit" class="editor-notice">
        <Icon name="settings" :size="18" />
        <p>
          Вы редактируете <strong>общий учебный план</strong>. Личные отметки
          выполнения доступны в пространстве просмотра.
        </p>
        <span>{{
          current?.isPublic ? "Открытый календарь" : "Приватный календарь"
        }}</span
        ><button
          v-if="current?.topicCount === 0"
          class="button plan-button"
          @click="dialog = 'plan'"
        >
          <Icon name="graduate" :size="16" />Добавить план Go / Backend</button
        ><button class="button primary" @click="add(calendar.today)">
          <Icon name="plus" :size="16" />Добавить тему
        </button>
      </div>
      <div v-else-if="!auth.user" class="guest-notice">
        <span class="live-dot"></span
        ><span
          >Календарь открыт для просмотра. Войдите, когда захотите отметить
          изученное.</span
        ><button class="text-button" @click="auth.requireLogin()">
          Сохранить свой прогресс<Icon name="right" :size="14" />
        </button>
      </div>
      <section
        v-if="!editing"
        class="workspace-stats"
        aria-label="Личный прогресс"
      >
        <div>
          <span>{{
            calendar.view === "month" ? "Прогресс месяца" : "Прогресс недели"
          }}</span
          ><strong
            >{{ calendar.week?.stats.percentage || 0 }}<small>%</small></strong
          >
          <div class="slim-progress">
            <i
              :style="{ width: (calendar.week?.stats.percentage || 0) + '%' }"
            ></i>
          </div>
        </div>
        <div>
          <span>Изучено за период</span
          ><strong
            >{{ calendar.week?.stats.completed || 0
            }}<small
              >/ {{ calendar.week?.stats.planned || 0 }} тем</small
            ></strong
          >
        </div>
        <div>
          <span>Ваш ритм</span
          ><strong
            >{{ calendar.week?.stats.streak || 0
            }}<small>дней подряд</small></strong
          >
        </div>
        <div class="stats-message">
          <Icon name="sparkles" :size="22" />
          <p>
            {{
              auth.user
                ? "Каждый небольшой шаг имеет значение."
                : "Знания начинаются с интереса."
            }}<small>{{
              auth.user
                ? "Ваши отметки видны только вам."
                : "Для просмотра регистрация не нужна."
            }}</small>
          </p>
        </div>
      </section>
      <div class="calendar-toolbar workspace-toolbar">
        <div class="period-title">
          <h2>{{ range }}</h2>
          <Icon v-if="calendar.loading" name="loader" class="spin" :size="16" />
        </div>
        <div class="calendar-display-controls">
          <div class="view-switch" aria-label="Формат календаря">
            <button
              :class="{ active: calendar.view === 'month' }"
              :aria-pressed="calendar.view === 'month'"
              @click="calendar.setView('month')"
            >
              Месяц</button
            ><button
              :class="{ active: calendar.view === 'week' }"
              :aria-pressed="calendar.view === 'week'"
              @click="calendar.setView('week')"
            >
              Неделя
            </button>
          </div>
          <div class="week-controls">
            <button
              class="icon-button"
              :aria-label="
                calendar.view === 'month'
                  ? 'Предыдущий месяц'
                  : 'Предыдущая неделя'
              "
              @click="calendar.navigate(-1)"
            >
              <Icon name="prev" :size="18" /></button
            ><button class="today-button" @click="calendar.navigate(0)">
              Сегодня</button
            ><button
              class="icon-button"
              :aria-label="
                calendar.view === 'month'
                  ? 'Следующий месяц'
                  : 'Следующая неделя'
              "
              @click="calendar.navigate(1)"
            >
              <Icon name="next" :size="18" />
            </button>
          </div>
        </div>
      </div>
      <template v-if="calendar.week"
        ><MonthlyCalendar
          v-if="calendar.view === 'month'"
          @open="open"
          @add="add" /><WeeklyCalendar v-else @open="open" @add="add"
      /></template>
      <div v-else class="calendar-loading">
        <Icon v-if="calendar.loading" name="loader" class="spin" /><span>{{
          calendar.loading
            ? "Открываем календарь…"
            : calendar.loadError || "Выберите календарь"
        }}</span
        ><button v-if="calendar.loadError" class="button" @click="initialize">
          Повторить
        </button>
      </div>
      <footer class="calendar-footer">
        <span
          ><Icon :name="editing ? 'settings' : 'check'" :size="14" />{{
            editing
              ? "Только создатель может менять темы, даты и материалы"
              : "Общий план. Личный прогресс. В своём ритме."
          }}</span
        ><span>{{ auth.user?.timezone || "Просмотр без авторизации" }}</span>
      </footer></template
    >
  </div>
  <TopicDrawer
    v-if="editorOpen && editing && calendar.canEdit"
    :topic="selectedTopic"
    :date="selectedDate"
    @close="editorOpen = false"
  /><TopicReader
    v-if="readerTopic"
    :topic="readerTopic"
    @close="readerTopic = null"
  /><CalendarDialog
    v-if="dialog"
    :kind="dialog"
    @close="dialog = null"
    @created="created"
  />
</template>
