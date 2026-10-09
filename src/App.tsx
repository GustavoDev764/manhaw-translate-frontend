import { ROLE_LABEL } from './adminApi'
import { AuthProvider } from './auth/AuthContext'
import { useAuth } from './auth/authCtx'
import { DownloadsDrawer } from './components/DownloadsDrawer'
import { EventsBridge } from './components/events'
import { JobsProvider } from './components/jobs'
import { UploadsProvider } from './components/uploads'
import { useJobs } from './components/jobsContext'
import { Badge, Spinner } from './components/ui'
import { cx } from './lib/cx'
import { href, useHashRoute } from './lib/hooks'
import { ChapterPagesPage } from './pages/ChapterPagesPage'
import { JobsPage } from './pages/JobsPage'
import { ChapterStagesPage } from './pages/library/ChapterStagesPage'
import { LibraryPage } from './pages/library/LibraryPage'
import { SeriesStagesPage } from './pages/library/SeriesStagesPage'
import { LoginPage } from './pages/LoginPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { ReviewPage } from './pages/ReviewPage'
import { FontsPage } from './pages/settings/FontsPage'
import { MyScanPage } from './pages/settings/MyScanPage'
import { AdminKeyFormPage } from './pages/settings/AdminKeyFormPage'
import { KeyBanner } from './components/KeyBanner'
import { AdminKeysPage } from './pages/settings/AdminKeysPage'
import { EmailPage } from './pages/settings/EmailPage'
import { ScanApiKeyPage } from './pages/settings/ScanApiKeyPage'
import { ProfilePage } from './pages/ProfilePage'
import { QueuePage } from './pages/QueuePage'
import { ReaderPage } from './pages/ReaderPage'
import { SeriesListPage } from './pages/SeriesListPage'
import { SeriesPage } from './pages/SeriesPage'
import { AuditPage } from './pages/settings/AuditPage'
import { DeletionsPage } from './pages/settings/DeletionsPage'
import { FeaturesPage } from './pages/settings/FeaturesPage'
import { ProcessingPage } from './pages/settings/ProcessingPage'
import { ProfilesPage } from './pages/settings/ProfilesPage'
import { ScansPage } from './pages/settings/ScansPage'
import { StoragePage } from './pages/settings/StoragePage'
import { TeamsPage } from './pages/settings/TeamsPage'
import { UsersPage } from './pages/settings/UsersPage'
import { WorkflowsPage } from './pages/WorkflowsPage'

function Nav({ section }: { section: string }) {
  const { jobs } = useJobs()
  const { me, logout } = useAuth()
  const running = jobs.filter((j) => j.status === 'running').length
  const admin = me?.role === 'system_admin' || me?.role === 'scan_admin'
  const link = (to: string, label: React.ReactNode, active: boolean) => (
    <a
      href={to}
      className={cx(
        'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition',
        active
          ? 'bg-brand/10 text-brand'
          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
      )}
    >
      {label}
    </a>
  )
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-2.5">
        <a href={href()} className="mr-4 flex items-center gap-2 font-semibold">
          <img src="/favicon.svg" alt="" className="size-6" />
          Manhwa Translate
        </a>
        <nav className="flex flex-wrap gap-1">
          {link(href(), 'Manhwas', section === '' || section === 's' || section === 'series')}
          {link(href('workflows'), 'Workflows', section === 'workflows')}
          {me && !me.mustChangePassword && <DownloadsDrawer />}
          {me?.role === 'system_admin' && running > 0 && link(
            href('jobs'),
            <>
              Tarefas antigas
              <span className="flex items-center gap-1 rounded-full bg-queued/15 px-1.5 text-xs text-queued">
                <Spinner className="size-3" /> {running}
              </span>
            </>,
            section === 'jobs',
          )}
          {admin && link(href('settings', 'users'), 'Configurações', section === 'settings')}
        </nav>
        {me && (
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="rounded-full border border-slate-300 px-2.5 py-0.5 text-xs dark:border-slate-700">{me.scan?.name ?? 'Todas as scans'}</span>
            <a href={href('profile')} className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
              <span className="grid size-7 place-items-center rounded-full bg-brand/15 text-xs font-bold text-brand">
                {me.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
              </span>
              <span className="hidden sm:inline">{me.name}</span>
            </a>
            <Badge tone={me.role === 'system_admin' ? 'brand' : me.role === 'scan_admin' ? 'queued' : 'neutral'}>{ROLE_LABEL[me.role]}</Badge>
            <button type="button" onClick={logout} className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Sair</button>
          </div>
        )}
      </div>
    </header>
  )
}

const SYSTEM_SETTINGS = ['scans', 'profiles', 'storage', 'processing', 'api-keys', 'email', 'fonts', 'audit', 'deletions']

const SETTINGS: Record<string, () => React.ReactNode> = {
  users: () => <UsersPage />,
  teams: () => <TeamsPage />,
  features: () => <FeaturesPage />,
  audit: () => <AuditPage />,
  scans: () => <ScansPage />,
  profiles: () => <ProfilesPage />,
  storage: () => <StoragePage />,
  processing: () => <ProcessingPage />,
  'api-key': () => <ScanApiKeyPage />,
  'api-keys': () => <AdminKeysPage />,
  email: () => <EmailPage />,
  fonts: () => <FontsPage />,
  scan: () => <MyScanPage />,
}

function Routes() {
  const { me } = useAuth()
  const route = useHashRoute()
  const [section, slug, sub, chapter, focus] = route
  const admin = me?.role === 'system_admin' || me?.role === 'scan_admin'
  let page: React.ReactNode
  if (me?.mustChangePassword || section === 'profile') page = <ProfilePage />
  else if (section === 'settings' && slug === 'api-keys' && sub && me?.role === 'system_admin') page = <AdminKeyFormPage keyId={sub} />
  else if (section === 'settings' && slug === 'deletions' && me?.role === 'system_admin') page = <DeletionsPage openId={sub ? Number(sub) : undefined} />
  else if (section === 'settings' && admin) page = ((me?.role !== 'system_admin' && SYSTEM_SETTINGS.includes(slug ?? '') ? null : SETTINGS[slug ?? '']) ?? SETTINGS.users)()
  else if (section === 'r' && slug) page = <ReviewPage key={slug} pageId={slug} />
  else if (section === 's' && slug && sub === 'glossario') page = <SeriesStagesPage key={`${slug}/g`} slug={slug} tab="glossary" />
  else if (section === 's' && slug && sub) page = <ChapterStagesPage key={sub} slug={slug} chapterId={sub} />
  else if (section === 's' && slug) page = <SeriesStagesPage key={slug} slug={slug} />
  else if (section === 'workflows') page = <WorkflowsPage openId={slug ? Number(slug) : undefined} />
  else if (['series', 'queue', 'jobs', 'legacy'].includes(section ?? '') && me?.role !== 'system_admin') page = <LibraryPage />
  else if (section === 'series' && slug && sub === 'read' && chapter) {
    page = <ReaderPage key={`${slug}/${chapter}/${focus ?? ''}`} slug={slug} chapter={chapter} focus={focus} />
  } else if (section === 'series' && slug && sub === 'chapter' && chapter) {
    page = <ChapterPagesPage key={`${slug}/${chapter}`} slug={slug} chapter={chapter} />
  } else if (section === 'series' && slug) {
    const tab = sub === 'download' || sub === 'queue' || sub === 'notes' ? sub : 'translate'
    page = <SeriesPage key={slug} slug={slug} tab={tab} />
  } else if (section === 'queue') page = <QueuePage />
  else if (section === 'jobs') page = <JobsPage />
  else if (section === 'legacy') page = <SeriesListPage />
  else page = <LibraryPage />

  return (
    <>
      <KeyBanner />
      <Nav section={section ?? ''} />
      <main className="mx-auto max-w-7xl px-4 py-6">{page}</main>
    </>
  )
}

function Gate() {
  const { me, loading } = useAuth()
  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-slate-500">
        <span className="flex items-center gap-2"><Spinner /> Carregando…</span>
      </div>
    )
  }
  if (!me && window.location.hash.startsWith('#/reset/')) return <ResetPasswordPage token={window.location.hash.slice('#/reset/'.length)} />
  if (!me) return <LoginPage />
  return (
    <JobsProvider>
      <UploadsProvider>
        <EventsBridge />
        <Routes />
      </UploadsProvider>
    </JobsProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
