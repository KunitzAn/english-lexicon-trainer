import { createRouter, createWebHistory } from 'vue-router'
import { auth, fetchMe } from '@/auth'
import LoginView from '@/views/LoginView.vue'
import ProgressView from '@/views/ProgressView.vue'
import FoldersView from '@/views/FoldersView.vue'
import FolderView from '@/views/FolderView.vue'
import AllWordsView from '@/views/AllWordsView.vue'
import AddWordView from '@/views/AddWordView.vue'
import WordView from '@/views/WordView.vue'
import TrainView from '@/views/TrainView.vue'
import SessionView from '@/views/SessionView.vue'
import SettingsView from '@/views/SettingsView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginView },
    { path: '/', name: 'progress', component: ProgressView, meta: { requiresAuth: true } },
    { path: '/folders', name: 'folders', component: FoldersView, meta: { requiresAuth: true } },
    { path: '/folders/:id', name: 'folder', component: FolderView, meta: { requiresAuth: true } },
    { path: '/words', name: 'words', component: AllWordsView, meta: { requiresAuth: true } },
    { path: '/words/add', name: 'word-add', component: AddWordView, meta: { requiresAuth: true } },
    { path: '/words/:id', name: 'word', component: WordView, meta: { requiresAuth: true } },
    { path: '/train', name: 'train', component: TrainView, meta: { requiresAuth: true } },
    { path: '/train/run', name: 'train-run', component: SessionView, meta: { requiresAuth: true } },
    { path: '/settings', name: 'settings', component: SettingsView, meta: { requiresAuth: true } },
  ],
})

router.beforeEach(async (to) => {
  if (!auth.loaded) await fetchMe()
  if (to.meta.requiresAuth && !auth.user) return { name: 'login' }
  if (to.name === 'login' && auth.user) return { name: 'progress' }
  return true
})
