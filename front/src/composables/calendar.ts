import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { DateTime } from "luxon";
import { api } from "../services/api";
import { useAuth } from "../stores/auth";
import { useUI } from "../stores/ui";
import type { Week, Topic, CalendarInfo } from "../types";
export const useCalendar = defineStore("calendar", () => {
  const auth = useAuth(),
    ui = useUI();
  const week = ref<Week | null>(null),
    calendars = ref<CalendarInfo[]>([]),
    calendarId = ref(""),
    start = ref(""),
    view = ref<"month" | "week">("month"),
    editing = ref(false),
    loading = ref(false),
    loadError = ref("");
  const now = ref(DateTime.now());
  const moving = ref(new Set<string>());
  const scheduleRequest = ref<{ topic: Topic; calendarId: string } | null>(
    null,
  );
  const dragging = ref<{ topic: Topic; calendarId: string } | null>(null);
  const dropDate = ref("");
  let sequence = 0;
  const today = computed(() =>
    now.value
      .setZone(
        auth.user?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      )
      .toISODate()!,
  );
  const canEdit = computed(
    () =>
      !!auth.user &&
      calendars.value.some(
        (c) => c.id === calendarId.value && c.ownerId === auth.user!.id,
      ),
  );
  const rangeStart = computed(() => {
    const d = DateTime.fromISO(start.value || today.value);
    return (
      view.value === "month"
        ? d.startOf("month").startOf("week")
        : d.startOf("week")
    ).toISODate()!;
  });
  const rangeEnd = computed(() => {
    const d = DateTime.fromISO(start.value || today.value);
    return (
      view.value === "month"
        ? d.endOf("month").endOf("week").plus({ days: 1 }).startOf("day")
        : d.startOf("week").plus({ days: 7 })
    ).toISODate()!;
  });
  function reset() {
    now.value = DateTime.now();
    start.value = today.value;
  }
  watch(
    () => auth.user?.id,
    () => {
      sequence++;
      week.value = null;
      calendars.value = [];
      toggling.value.clear();
      moving.value.clear();
      scheduleRequest.value = null;
      endDrag();
    },
  );
  async function catalog() {
    calendars.value = (
      await api<{ calendars: CalendarInfo[] }>("/calendars")
    ).calendars;
  }
  watch([calendarId, editing, view, start], () => {
    scheduleRequest.value = null;
    endDrag();
  });
  async function load(sync = true, keepContent = false) {
    now.value = DateTime.now();
    if (!start.value) reset();
    const request = ++sequence;
    loading.value = true;
    loadError.value = "";
    try {
      if (!calendars.value.length) await catalog();
      if (!calendarId.value && !editing.value)
        calendarId.value =
          calendars.value.find((c) => c.isDefault)?.id ||
          calendars.value[0]?.id ||
          "";
      if (!calendarId.value) {
        week.value = null;
        return;
      }
      if (sync && auth.user && !editing.value)
        await api(`/calendars/${calendarId.value}/sync`, "POST");
      const period = DateTime.fromISO(start.value);
      const periodStart = (
        view.value === "month"
          ? period.startOf("month")
          : period.startOf("week")
      ).toISODate()!;
      const periodEnd = (
        view.value === "month"
          ? period.startOf("month").plus({ months: 1 })
          : period.startOf("week").plus({ days: 7 })
      ).toISODate()!;
      const result = await api<Week>(
        `/calendars/${encodeURIComponent(calendarId.value)}/range?start=${rangeStart.value}&end=${rangeEnd.value}&mode=${editing.value ? "edit" : "read"}&periodStart=${periodStart}&periodEnd=${periodEnd}`,
      );
      if (request === sequence) week.value = result;
    } catch (e) {
      if (request === sequence) {
        if (!keepContent) week.value = null;
        loadError.value = (e as Error).message;
        ui.notify(loadError.value, true);
      }
    } finally {
      if (request === sequence) loading.value = false;
    }
  }
  async function navigate(offset: number) {
    start.value = offset
      ? DateTime.fromISO(start.value)
          .plus(view.value === "month" ? { months: offset } : { weeks: offset })
          .startOf(view.value === "month" ? "month" : "week")
          .toISODate()!
      : today.value;
    await load();
  }
  async function setView(value: "month" | "week") {
    view.value = value;
    await load();
  }
  const toggling = ref(new Set<string>());
  const isBusy = (id: string) => moving.value.has(id) || toggling.value.has(id);
  function canSchedule(t: Topic, date: string) {
    const parsed = DateTime.fromISO(date);
    return (
      parsed.isValid &&
      /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      date >= "1900-01-01" &&
      date <= "2200-12-31" &&
      (t.status === "completed" || date >= today.value)
    );
  }
  function openSchedule(t: Topic) {
    if (editing.value || isBusy(t.id)) return;
    const target = calendarId.value;
    if (
      !auth.requireLogin(async () => {
        if (target !== calendarId.value || editing.value) return;
        try {
          const fresh = await api<Topic>(`/calendars/${target}/topics/${t.id}`);
          if (target === calendarId.value && !editing.value)
            scheduleRequest.value = { topic: fresh, calendarId: target };
        } catch (e) {
          ui.notify((e as Error).message, true);
        }
      }, "Войдите, чтобы планировать личные даты обучения")
    )
      return;
    scheduleRequest.value = { topic: t, calendarId: target };
  }
  async function reschedule(
    t: Topic,
    date: string,
  ): Promise<Topic | undefined> {
    if (editing.value || isBusy(t.id)) return;
    const target = calendarId.value;
    if (
      !auth.requireLogin(async () => {
        if (target !== calendarId.value || editing.value) return;
        try {
          const fresh = await api<Topic>(`/calendars/${target}/topics/${t.id}`);
          await reschedule(fresh, date);
        } catch (e) {
          ui.notify((e as Error).message, true);
        }
      }, "Войдите, чтобы переносить темы в своём календаре")
    )
      return;
    now.value = DateTime.now();
    if (!canSchedule(t, date))
      throw new Error("Незавершённую тему нельзя перенести в прошлое");
    if (date === t.scheduledDate) return t;
    const userId = auth.user!.id;
    moving.value.add(t.id);
    try {
      const updated = await api<Topic>(
        `/calendars/${target}/topics/${t.id}/schedule`,
        "PATCH",
        { date },
      );
      if (
        userId !== auth.user?.id ||
        target !== calendarId.value ||
        editing.value
      )
        return;
      Object.assign(t, updated);
      const visible = week.value?.topics.find((topic) => topic.id === t.id);
      if (visible && visible !== t) Object.assign(visible, updated);
      await load(false, true);
      if (userId !== auth.user?.id || target !== calendarId.value) return;
      ui.notify(
        `Тема перенесена на ${DateTime.fromISO(date).setLocale("ru").toFormat("d MMMM yyyy")} — только в вашем плане`,
      );
      return updated;
    } catch (e) {
      ui.notify((e as Error).message, true);
      throw e;
    } finally {
      moving.value.delete(t.id);
    }
  }
  function beginDrag(topic: Topic) {
    if (editing.value || isBusy(topic.id)) return false;
    dragging.value = { topic, calendarId: calendarId.value };
    return true;
  }
  function endDrag() {
    dragging.value = null;
    dropDate.value = "";
  }
  function canDrop(date: string) {
    const item = dragging.value;
    return (
      !!item &&
      !editing.value &&
      item.calendarId === calendarId.value &&
      !isBusy(item.topic.id) &&
      item.topic.scheduledDate !== date &&
      canSchedule(item.topic, date)
    );
  }
  function hoverDate(date: string) {
    dropDate.value = canDrop(date) ? date : "";
  }
  async function dropTopic(date: string) {
    if (!canDrop(date)) {
      endDrag();
      return;
    }
    const topic = dragging.value!.topic;
    endDrag();
    try {
      await reschedule(topic, date);
    } catch {
      /* Error is reported by reschedule. */
    }
  }
  async function toggle(t: Topic) {
    if (editing.value) return;
    const targetCalendarId = calendarId.value;
    const desiredStatus = t.status === "completed" ? "pending" : "completed";
    if (
      !auth.requireLogin(async () => {
        const current = await api<Topic>(
          `/calendars/${targetCalendarId}/topics/${t.id}`,
        );
        if (current.status !== desiredStatus) {
          await api(
            `/calendars/${targetCalendarId}/topics/${t.id}/${desiredStatus === "completed" ? "complete" : "reopen"}`,
            "PATCH",
          );
        }
        await load();
        ui.notify(
          desiredStatus === "completed"
            ? "Тема изучена. Ваш прогресс сохранён!"
            : "Тема возвращена в ваш план",
        );
      })
    )
      return;
    if (isBusy(t.id)) return;
    toggling.value.add(t.id);
    const previous = t.status;
    t.status = previous === "completed" ? "pending" : "completed";
    try {
      await api(
        `/calendars/${calendarId.value}/topics/${t.id}/${previous === "completed" ? "reopen" : "complete"}`,
        "PATCH",
      );
      await load(false);
      ui.notify(
        previous === "completed"
          ? "Тема возвращена в ваш план"
          : "Тема изучена. Ваш прогресс сохранён!",
      );
    } catch (e) {
      t.status = previous;
      ui.notify((e as Error).message, true);
    } finally {
      toggling.value.delete(t.id);
    }
  }
  return {
    week,
    calendars,
    calendarId,
    start,
    view,
    editing,
    loading,
    loadError,
    today,
    canEdit,
    rangeStart,
    rangeEnd,
    load,
    catalog,
    navigate,
    setView,
    toggle,
    toggling,
    moving,
    isBusy,
    scheduleRequest,
    openSchedule,
    reschedule,
    canSchedule,
    dragging,
    dropDate,
    beginDrag,
    endDrag,
    canDrop,
    hoverDate,
    dropTopic,
    reset,
  };
});
