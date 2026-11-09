<script setup lang="ts">
import { useRouter } from "vue-router";
import { useAuth } from "./stores/auth";
import { useUI } from "./stores/ui";
import Icon from "./components/Icon.vue";
import AuthView from "./views/AuthView.vue";
const auth = useAuth(),
  ui = useUI(),
  router = useRouter();
function go(path: string) {
  if (
    auth.requireLogin(async () => {
      await router.push(path);
    })
  ) {
    void router.push(path);
  }
}
async function logout() {
  try {
    await auth.logout();
    await router.push("/");
  } catch (e) {
    ui.notify((e as Error).message, true);
  }
}
</script>
<template>
  <div class="workspace-shell">
    <header class="app-header">
      <RouterLink to="/" class="brand"
        ><span class="brand-icon"><Icon name="book" :size="22" /></span
        >StudyFlow<span class="brand-dot">.</span></RouterLink
      >
      <nav class="header-nav" aria-label="Навигация">
        <RouterLink to="/" class="header-link" exact-active-class="active"
          ><Icon name="calendar" :size="17" /><span>Календарь</span></RouterLink
        ><button
          class="header-link"
          :class="{ active: $route.path === '/progress' }"
          @click="go('/progress')"
        >
          <Icon name="chart" :size="17" /><span>Мой прогресс</span></button
        ><button
          class="header-link"
          :class="{ active: $route.path === '/studio' }"
          @click="go('/studio')"
        >
          <Icon name="settings" :size="17" /><span>Мастерская</span>
        </button>
      </nav>
      <div class="header-actions">
        <button
          class="icon-button theme-button"
          :title="ui.dark ? 'Светлая тема' : 'Тёмная тема'"
          aria-label="Сменить тему"
          @click="ui.toggleTheme"
        >
          <Icon :name="ui.dark ? 'sun' : 'moon'" :size="19" /></button
        ><template v-if="auth.user"
          ><button
            class="header-profile"
            title="Профиль"
            @click="go('/profile')"
          >
            <span class="avatar">{{
              auth.user.name.slice(0, 1).toUpperCase()
            }}</span
            ><span>{{ auth.user.name }}</span></button
          ><button
            class="icon-button"
            title="Выйти"
            aria-label="Выйти"
            @click="logout"
          >
            <Icon name="logout" :size="17" /></button></template
        ><button
          v-else
          class="button header-login"
          @click="auth.requireLogin()"
        >
          <Icon name="user" :size="16" />Войти
        </button>
      </div>
    </header>
    <main class="workspace-main"><RouterView /></main>
  </div>
  <AuthView v-if="auth.authOpen" /><Transition name="toast"
    ><div v-if="ui.message" class="toast" :class="ui.kind" role="status">
      <Icon :name="ui.kind === 'error' ? 'close' : 'check'" :size="18" />{{
        ui.message
      }}<button
        class="icon-button"
        aria-label="Закрыть уведомление"
        @click="ui.message = ''"
      >
        <Icon name="close" :size="16" />
      </button></div
  ></Transition>
</template>
