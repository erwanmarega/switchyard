<script setup lang="ts">
import { computed, definePageMeta, navigateTo, ref, useHead, useRoute } from '#imports'
import { useAuth } from '~/composables/useAuth'
import {
  CONFIRMATION_LINK_ERROR,
  CONFIRM_EMAIL_NOTICE,
  SIGNUP_CLOSED,
  apiErrorMessage,
} from '~/utils/auth-errors'
import { postLoginTarget } from '~/utils/auth-guard'

useHead({ title: 'Connexion — Switchyard' })
definePageMeta({ middleware: 'guest' })

type Mode = 'login' | 'register'

const MIN_PASSWORD_LENGTH = 10

const route = useRoute()
const { login, register } = useAuth()

const mode = ref<Mode>('login')
const email = ref('')
const password = ref('')
const confirmation = ref('')
const error = ref(route.query.error === 'confirmation' ? CONFIRMATION_LINK_ERROR : '')
const notice = ref('')
const signupClosed = ref(false)
const loading = ref(false)

const isRegister = computed(() => mode.value === 'register')

function setMode(next: Mode) {
  mode.value = next
  error.value = ''
  notice.value = ''
  password.value = ''
  confirmation.value = ''
}

async function onSubmit() {
  if (loading.value) return
  error.value = ''
  notice.value = ''
  if (isRegister.value) {
    if (password.value.length < MIN_PASSWORD_LENGTH) {
      error.value = `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`
      return
    }
    if (password.value !== confirmation.value) {
      error.value = 'Les mots de passe ne correspondent pas.'
      return
    }
  }
  loading.value = true
  try {
    if (isRegister.value) {
      const result = await register(email.value, password.value)
      if (result.status === 'confirmation-required') {
        // Email confirmation is on: the account is not logged in until the link is followed.
        notice.value = CONFIRM_EMAIL_NOTICE
        password.value = ''
        confirmation.value = ''
        return
      }
    } else {
      await login(email.value, password.value)
    }
    await navigateTo(postLoginTarget(route.query.redirect))
  } catch (err) {
    error.value = apiErrorMessage(err)
    if ((err as { code?: string } | null)?.code === 'signup_disabled') signupClosed.value = true
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="auth">
    <img
      class="bg"
      src="/img/cta-yard.webp"
      alt=""
      aria-hidden="true"
      width="2400"
      height="1200"
      decoding="async"
    />
    <div class="shade" aria-hidden="true"></div>

    <div class="wrap">
      <NuxtLink to="/" class="brand" aria-label="Switchyard, accueil">
        <svg
          width="28"
          height="16"
          viewBox="0 0 28 16"
          aria-hidden="true"
          shape-rendering="crispEdges"
        >
          <rect x="0" y="4" width="28" height="2" fill="currentColor" />
          <rect x="0" y="10" width="28" height="2" fill="currentColor" />
          <rect x="4" y="2" width="2" height="12" fill="currentColor" />
          <rect x="12" y="2" width="2" height="12" fill="currentColor" />
          <rect x="20" y="2" width="2" height="12" fill="currentColor" />
          <rect x="22" y="5" width="6" height="6" fill="var(--signal)" />
        </svg>
        <span>Switchyard</span>
      </NuxtLink>

      <section class="card-auth" aria-labelledby="auth-title">
        <h1 id="auth-title">{{ isRegister ? 'Créer un compte' : 'Se connecter' }}</h1>

        <div class="tabs" role="group" aria-label="Mode d'accès">
          <button
            type="button"
            class="tab"
            :class="{ active: !isRegister }"
            :aria-pressed="!isRegister"
            @click="setMode('login')"
          >
            Se connecter
          </button>
          <button
            type="button"
            class="tab"
            :class="{ active: isRegister }"
            :aria-pressed="isRegister"
            @click="setMode('register')"
          >
            Créer un compte
          </button>
        </div>
        <p v-if="signupClosed" class="note">{{ SIGNUP_CLOSED }}</p>

        <form novalidate @submit.prevent="onSubmit">
          <div class="field">
            <label for="email">Adresse e-mail</label>
            <input
              id="email"
              v-model="email"
              type="email"
              name="email"
              autocomplete="email"
              required
              :disabled="loading"
            />
          </div>
          <div class="field">
            <label for="password">Mot de passe</label>
            <input
              id="password"
              v-model="password"
              type="password"
              name="password"
              :autocomplete="isRegister ? 'new-password' : 'current-password'"
              required
              :minlength="isRegister ? MIN_PASSWORD_LENGTH : undefined"
              :aria-describedby="isRegister ? 'password-hint' : undefined"
              :disabled="loading"
            />
            <p v-if="isRegister" id="password-hint" class="hint">
              {{ MIN_PASSWORD_LENGTH }} caractères minimum.
            </p>
          </div>
          <div v-if="isRegister" class="field">
            <label for="confirmation">Confirmer le mot de passe</label>
            <input
              id="confirmation"
              v-model="confirmation"
              type="password"
              name="confirmation"
              autocomplete="new-password"
              required
              :disabled="loading"
            />
          </div>

          <div class="alert-area" role="alert">
            <p v-if="error" class="error">{{ error }}</p>
            <p v-else-if="notice" class="notice">{{ notice }}</p>
          </div>

          <button class="btn btn-dark submit" type="submit" :disabled="loading">
            {{ loading ? 'Veuillez patienter…' : isRegister ? 'Créer mon compte' : 'Se connecter' }}
          </button>
        </form>
      </section>
    </div>
  </main>
</template>

<style scoped>
.auth {
  position: relative;
  display: flex;
  min-height: 100vh;
  background-color: var(--prussian);
  color: var(--paper);
  overflow: hidden;
}
.bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgba(27, 58, 140, 0.85), rgba(27, 58, 140, 0.35));
}
.wrap {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 32px;
  justify-content: center;
  width: min(100% - 40px, 440px);
  margin-inline: max(20px, calc((100% - var(--frame)) / 2 + 40px)) auto;
  padding: 32px 0;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  font-family: var(--font-pixel);
  font-size: 22px;
  color: var(--paper);
}
.card-auth {
  background: var(--paper);
  color: var(--navy-ink);
  border: 1px solid var(--line);
  border-radius: 0;
  padding: 32px;
}
h1 {
  font-size: clamp(36px, 6vw, 48px);
  margin-bottom: 20px;
}
.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}
.tab {
  font-family: var(--font-mono);
  font-weight: 500;
  font-size: 13px;
  padding: 9px 12px;
  background: transparent;
  color: var(--navy-ink);
  border: 1px solid var(--line);
  border-radius: 0;
  cursor: pointer;
}
.tab.active {
  background: var(--navy-ink);
  color: var(--paper);
  border-color: var(--navy-ink);
}
.note,
.hint {
  font-size: 13px;
  color: var(--prussian);
  opacity: 0.85;
}
.note {
  margin-bottom: 16px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}
label {
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
input {
  font-family: var(--font-sans);
  font-size: 16px;
  padding: 10px 12px;
  color: var(--navy-ink);
  background: #fff;
  border: 1px solid var(--prussian);
  border-radius: 0;
}
input:disabled {
  opacity: 0.6;
}
.alert-area {
  min-height: 24px;
  margin-bottom: 12px;
}
.error {
  font-size: 14px;
  color: #a8340f;
  font-weight: 500;
}
.notice {
  font-size: 14px;
  color: var(--prussian);
  font-weight: 500;
}
.submit {
  width: 100%;
  padding: 14px;
}
.submit:disabled {
  opacity: 0.6;
  cursor: progress;
}
@media (max-width: 820px) {
  .shade {
    background: rgba(27, 58, 140, 0.7);
  }
  .wrap {
    margin-inline: auto;
  }
  .card-auth {
    padding: 24px 20px;
  }
}
</style>
