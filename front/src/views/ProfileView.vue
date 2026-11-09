<script setup lang="ts">
import { ref } from "vue";
import { useAuth } from "../stores/auth";
import { useUI } from "../stores/ui";
import Icon from "../components/Icon.vue";
import AppSelect from "../components/AppSelect.vue";
const auth = useAuth(),
  ui = useUI(),
  name = ref(auth.user?.name || ""),
  timezone = ref(auth.user?.timezone || "UTC"),
  busy = ref(false);
const zones = Intl.supportedValuesOf("timeZone");
if (!zones.includes(timezone.value)) zones.unshift(timezone.value);
async function save() {
  busy.value = true;
  try {
    await auth.update({ name: name.value, timezone: timezone.value });
    ui.notify("Настройки профиля сохранены");
  } catch (e) {
    ui.notify((e as Error).message, true);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <div class="settings-page">
    <span class="eyebrow">ВАШЕ ЛИЧНОЕ ПРОСТРАНСТВО</span>
    <h1>Настройки профиля<span class="heading-dot">.</span></h1>
    <p class="muted">Немного о вас и о том, как проходит ваш день.</p>
    <form class="profile-panel" @submit.prevent="save">
      <div class="profile-intro">
        <span class="avatar large">{{
          auth.user?.name.slice(0, 1).toUpperCase()
        }}</span>
        <div>
          <h2>{{ auth.user?.name }}</h2>
          <p class="muted">{{ auth.user?.email }}</p>
        </div>
      </div>
      <label
        >Имя<input
          v-model="name"
          maxlength="80"
          required
          autocomplete="name" /></label
      ><label
        >Email<input :value="auth.user?.email" type="email" disabled /></label
      ><label
        >Часовой пояс<AppSelect
          v-model="timezone"
          :options="zones.map((zone) => ({ value: zone, label: zone }))"
          label="Часовой пояс"
          searchable
      /></label>
      <div class="info-box">
        <Icon name="clock" :size="20" />
        <p>
          Ваш день заканчивается в полночь по выбранному часовому поясу. При его
          изменении незавершённые темы сразу синхронизируются с новой локальной
          датой.
        </p>
      </div>
      <button class="button primary" :disabled="busy">
        <Icon v-if="busy" name="loader" class="spin" :size="17" />Сохранить
        настройки
      </button>
    </form>
  </div>
</template>
