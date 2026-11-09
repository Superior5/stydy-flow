<script setup lang="ts">
import { ref, onMounted } from "vue";
import { DateTime } from "luxon";
import { api } from "../services/api";
import { useUI } from "../stores/ui";
import type { Stats } from "../types";
import Icon from "../components/Icon.vue";
const stats = ref<Stats | null>(null),
  ui = useUI(),
  busy = ref(false);
async function load() {
  busy.value = true;
  try {
    stats.value = await api<Stats>("/stats/overview");
  } catch (e) {
    ui.notify((e as Error).message, true);
  } finally {
    busy.value = false;
  }
}
onMounted(load);
</script>
<template>
  <div class="settings-page progress-page">
    <span class="eyebrow">ЗНАНИЯ, КОТОРЫЕ ОСТАЮТСЯ С ВАМИ</span>
    <h1>Ваш прогресс<span class="heading-dot">.</span></h1>
    <p class="muted">Маленькие усилия складываются в большие перемены.</p>
    <div v-if="stats" class="progress-content">
      <div class="progress-overview">
        <div>
          <Icon name="graduate" :size="25" /><strong>{{
            stats.totalCompleted
          }}</strong
          ><span>тем изучено за всё время</span>
        </div>
        <div>
          <Icon name="flame" :size="25" /><strong>{{ stats.streak }}</strong
          ><span>дней обучения подряд</span>
        </div>
        <div>
          <Icon name="book" :size="25" /><strong>{{ stats.pending }}</strong
          ><span>тем ещё впереди</span>
        </div>
      </div>
      <section class="activity-panel">
        <div class="section-heading">
          <div>
            <h2>Каждый день имеет значение</h2>
            <p class="muted">Завершённые темы за текущую неделю</p>
          </div>
          <span class="week-badge">{{ stats.completed }} тем</span>
        </div>
        <div class="activity-chart">
          <div
            v-for="day in stats.activity"
            :key="day.date"
            class="activity-day"
          >
            <strong>{{ day.count }}</strong>
            <div class="activity-track">
              <span
                :style="{
                  height:
                    (day.count
                      ? Math.max(
                          8,
                          (day.count /
                            Math.max(
                              1,
                              ...stats.activity.map((d) => d.count),
                            )) *
                            100,
                        )
                      : 2) + '%',
                }"
              ></span>
            </div>
            <span>{{
              DateTime.fromISO(day.date).setLocale("ru").toFormat("ccc")
            }}</span
            ><small>{{ DateTime.fromISO(day.date).toFormat("dd.MM") }}</small>
          </div>
        </div>
        <div class="info-box">
          <Icon name="chart" />
          <p>
            Учитываем дату фактического завершения в вашем часовом поясе. Серия
            сохраняется, если вы занимались сегодня или вчера.
          </p>
        </div>
      </section>
      <RouterLink to="/" class="button primary"
        >Вернуться к календарю<Icon name="right" :size="17"
      /></RouterLink>
    </div>
    <div v-else class="calendar-loading">
      <Icon v-if="busy" name="loader" class="spin" /><button
        v-else
        class="button"
        @click="load"
      >
        Повторить загрузку
      </button>
    </div>
  </div>
</template>
