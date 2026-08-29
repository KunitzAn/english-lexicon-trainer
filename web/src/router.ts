import { createRouter, createWebHistory } from 'vue-router'
import { auth, fetchMe } from '@/auth'
import LoginView from '@/views/LoginView.vue'
import FoldersView from '@/views/FoldersView.vue'
import FolderView from '@/views/FolderView.vue'
import AllWordsView from '@/views/AllWordsView.vue'
import AddWordView from '@/views/AddWordView.vue'
import WordView from '@/views/WordView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginView },
    { path: '/', name: 'folders', component: FoldersView, meta: { requiresAuth: true } },
    { path: '/folders/:id', name: 'folder', component: FolderView, meta: { requiresAuth: true } },
    { path: '/words', name: 'words', component: AllWordsView, meta: { requiresAuth: true } },
    { path: '/words/add', name: 'word-add', component: AddWordView, meta: { requiresAuth: true } },
    { path: '/words/:id', name: 'word', component: WordView, meta: { requiresAuth: true } },
  ],
})

router.beforeEach(async (to) => {
  if (!auth.loaded) await fetchMe()
  if (to.meta.requiresAuth && !auth.user) return { name: 'login' }
  if (to.name === 'login' && auth.user) return { name: 'folders' }
  return true
})
