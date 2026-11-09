<script setup lang="ts">
import { ref } from "vue";
import { useAuth } from "../stores/auth";
import { useUI } from "../stores/ui";
import { useDialog } from "../composables/dialog";
import Icon from "../components/Icon.vue";
const auth = useAuth(),
  ui = useUI(),
  panel = ref<HTMLElement>(),
  mode = ref("login"),
  email = ref(""),
  password = ref(""),
  name = ref(""),
  busy = ref(false),
  error = ref("");
function close() {
  if (!busy.value) auth.cancelAuth();
}
useDialog(panel, close);
async function submit() {
  busy.value = true;
  error.value = "";
  try {
    await auth.authenticate(mode.value, {
      email: email.value,
      password: password.value,
      ...(mode.value === "register"
        ? {
            name: name.value,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }
        : {}),
    });
    try {
      await auth.finishAuth();
    } catch (e) {
      ui.notify((e as Error).message, true);
    }
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
        class="modal auth-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
      >
        <button
          class="icon-button modal-close"
          aria-label="Закрыть авторизацию"
          :disabled="busy"
          @click="close"
        >
          <Icon name="close" /></button
        ><span class="form-icon"><Icon name="graduate" :size="28" /></span
        ><span class="eyebrow">ВАШ ПРОГРЕСС — ТОЛЬКО ВАШ</span>
        <h2 id="auth-title">
          {{
            mode === "login" ? "Продолжим обучение?" : "Начнём с первого шага"
          }}
        </h2>
        <p class="muted">
          {{ auth.authReason }}. Просматривать календарь можно без аккаунта.
        </p>
        <form @submit.prevent="submit">
          <div class="auth-tabs">
            <button
              type="button"
              :class="{ selected: mode === 'login' }"
              @click="
                mode = 'login';
                error = '';
              "
            >
              Вход</button
            ><button
              type="button"
              :class="{ selected: mode === 'register' }"
              @click="
                mode = 'register';
                error = '';
              "
            >
              Регистрация
            </button>
          </div>
          <label v-if="mode === 'register'"
            >Имя <span class="muted">(необязательно)</span
            ><input
              v-model="name"
              autocomplete="name"
              maxlength="80"
              placeholder="Ваше имя" /></label
          ><label
            >Email<input
              v-model="email"
              type="email"
              autocomplete="email"
              required
              placeholder="you@example.com" /></label
          ><label
            >Пароль<input
              v-model="password"
              type="password"
              :autocomplete="
                mode === 'login' ? 'current-password' : 'new-password'
              "
              minlength="8"
              required
              placeholder="Не менее 8 символов"
          /></label>
          <p v-if="error" class="form-error" role="alert">{{ error }}</p>
          <button class="button primary auth-submit" :disabled="busy">
            <Icon v-if="busy" name="loader" class="spin" :size="17" />{{
              mode === "login" ? "Войти и продолжить" : "Создать аккаунт"
            }}<Icon name="right" :size="17" /></button
          ><button
            type="button"
            class="auth-skip text-button"
            :disabled="busy"
            @click="close"
          >
            Продолжить просмотр без входа
          </button>
        </form>
      </section>
    </div></Teleport
  >
</template>
