import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import type { IconType } from 'react-icons'
import { FiArrowRight, FiCloud, FiCpu, FiEdit3, FiGithub, FiLayers, FiLock } from 'react-icons/fi'

import { HOME_DEPLOY_SECTION_ID } from '@/app/components/home/deploy'
import HeroBanner from '@/app/components/home/HeroBanner'
import HomeDeploySection from '@/app/components/home/HomeDeploySection'
import HomeFooter from '@/app/components/home/HomeFooter'
import { homeUi, pillarAccentStyles } from '@/app/components/home/palette'
import SectionEyebrow from '@/app/components/home/SectionEyebrow'
import { repositoryUrl } from '@/config/package'

const pillars = [
  {
    icon: FiEdit3,
    title: 'Author',
    accent: 'blue' as const,
    summary: 'Write userscripts in a full TypeScript editor with runtime typings, local drafts, and one-click publish to your private library.',
    bullets: ['Tabbed file tree & CodeMirror', 'URL rules panel', 'Optional Gemini AI rewrite', 'Editor dev mode for live preset testing'],
  },
  {
    icon: FiCloud,
    title: 'Deliver',
    accent: 'violet' as const,
    summary: 'Ship the same script library to Tampermonkey or a native Chrome extension—OTA updates, per-script toggles, and activation rules.',
    bullets: ['Auto-built launcher userscript', 'Extension: servers, scripts, rules, logs', 'Shared preset runtime APIs with full typings', 'Server & local activation rules'],
  },
  {
    icon: FiCpu,
    title: 'Automate',
    accent: 'indigo' as const,
    summary: 'Let Cursor and other agents edit script files remotely via HTTP MCP or REST—without opening the web UI.',
    bullets: ['HTTP MCP for AI clients', 'REST CRUD with OpenAPI', 'Session cookie or API key auth', 'Search, patch, and validate remotely'],
  },
] as const

const runtimeFlow = [
  { label: 'Library', detail: 'Source of truth' },
  { label: 'Editor / MCP', detail: 'Human or agent edits' },
  { label: 'Launcher / Extension', detail: 'OTA shell' },
  { label: 'Preset', detail: 'Shared runtime' },
  { label: 'Your scripts', detail: 'Run in the page' },
] as const

const quickStartSteps = [
  { title: 'Configure env', body: 'Copy `.env.example`, set admin credentials and script storage keys, then redeploy if needed.' },
  { title: 'Author', body: 'Sign in to your instance, add `.ts` / `.js` modules in the editor, and configure URL rules when needed.' },
  { title: 'Install', body: 'Install the Tampermonkey launcher or load the Chrome extension ZIP from your editor.' },
  { title: 'Integrate', body: 'Optional: connect an MCP client or read the AI integration guide for agent setup.' },
] as const

interface ContentPanelProps {
  children: ReactNode
  className?: string
}

function ContentPanel(props: ContentPanelProps) {
  const { children, className = '' } = props
  return <div className={`${homeUi.sectionPanel} ${className}`}>{children}</div>
}

interface PillarCardProps {
  icon: IconType
  title: string
  accent: keyof typeof pillarAccentStyles
  summary: string
  bullets: readonly string[]
}

function PillarCard(props: PillarCardProps) {
  const { icon: Icon, title, accent, summary, bullets } = props
  const styles = pillarAccentStyles[accent]

  return (
    <article className={`group flex flex-col p-6 transition duration-300 hover:border-[#3f4a5c] ${homeUi.sectionPanel} ${styles.hover}`}>
      <div className={`mb-5 inline-flex w-fit rounded-xl p-3 ring-1 ring-inset ${styles.icon}`}>
        <Icon className="h-5 w-5" />
      </div>
      <h3 className={`text-xl ${homeUi.heading}`}>{title}</h3>
      <p className={`mt-2.5 text-sm leading-6 ${homeUi.body}`}>{summary}</p>
      <ul className="mt-auto space-y-2.5 border-t border-[#2a303a]/80 pt-5">
        {bullets.map((item) => (
          <li key={item} className={`flex items-start gap-2.5 text-sm leading-6 text-[#cbd5e1]`}>
            <span className={`mt-2 h-1 w-1 shrink-0 rounded-full ${styles.dot}`} />
            {item}
          </li>
        ))}
      </ul>
    </article>
  )
}

export default function HomeLanding() {
  const githubUrl = repositoryUrl || 'https://github.com/DavidKk/vercel-web-scripts'

  return (
    <div className={`home-landing relative min-h-screen overflow-x-hidden font-sans ${homeUi.canvas}`}>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:linear-gradient(to_bottom,black_0%,black_72%,transparent_100%)]" />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-48 left-[15%] h-[32rem] w-[32rem] rounded-full bg-[#3b82f6]/[0.09] blur-[120px]" />
        <div className="absolute top-[20%] -right-20 h-96 w-96 rounded-full bg-[#8b5cf6]/[0.07] blur-[100px]" />
        <div className="absolute bottom-0 left-0 h-80 w-80 rounded-full bg-[#3b82f6]/[0.05] blur-[90px]" />
      </div>

      <header className={`sticky top-0 z-40 border-b backdrop-blur-xl backdrop-saturate-150 ${homeUi.header}`}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="MagickMonkey logo" width={32} height={32} className="rounded-md ring-1 ring-[#2a303a]" priority />
            <span className={`text-[15px] ${homeUi.heading}`}>MagickMonkey</span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <Link
              href={`#${HOME_DEPLOY_SECTION_ID}`}
              className={`hidden items-center gap-2 rounded-lg px-3 py-2 text-sm sm:inline-flex ${homeUi.body} transition-colors hover:bg-[#1b1f27] hover:text-[#e6eaf0]`}
            >
              Deploy
            </Link>
            <a
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${homeUi.body} transition-colors hover:bg-[#1b1f27] hover:text-[#e6eaf0]`}
            >
              <FiGithub className="h-4 w-4" />
              <span className="hidden sm:inline">GitHub</span>
            </a>
            <Link href="/login?redirectUrl=%2Feditor" className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium ${homeUi.btnPrimary}`}>
              Sign in
              <FiArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        <HeroBanner />

        <section className="relative z-20 mx-auto mt-10 max-w-7xl px-4 pb-16 sm:mt-12 sm:px-6 lg:mt-14">
          <HomeDeploySection />

          <div className="relative mt-14 sm:mt-16">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#2a303a]/80 to-transparent" />
            <div className="flex flex-col gap-4 pt-10 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-xl">
                <SectionEyebrow className="text-[#a78bfa]">What you get</SectionEyebrow>
                <h2 className={`mt-3 text-2xl sm:text-[1.75rem] ${homeUi.heading}`}>Three surfaces, one script library</h2>
              </div>
              <p className={`max-w-md text-sm leading-6 lg:text-right ${homeUi.muted}`}>
                Self-hosted open source—not a multi-tenant SaaS. MCP edits script source only; browser APIs come from the preset at runtime.
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            {pillars.map((pillar) => (
              <PillarCard key={pillar.title} {...pillar} />
            ))}
          </div>

          <ContentPanel className="mt-8 p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-2">
              <FiLayers className={`h-4 w-4 ${homeUi.muted}`} />
              <SectionEyebrow className={homeUi.muted}>Runtime pipeline</SectionEyebrow>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
              {runtimeFlow.map((step, index) => (
                <div key={step.label} className="flex flex-1 items-center gap-2 sm:min-w-0">
                  <div className={`min-w-0 flex-1 px-3.5 py-3 sm:h-full sm:px-4 ${homeUi.cardInner}`}>
                    <div className={`text-sm font-medium tracking-tight text-[#e6eaf0]`}>{step.label}</div>
                    <div className={`mt-0.5 text-xs leading-5 ${homeUi.muted}`}>{step.detail}</div>
                  </div>
                  {index < runtimeFlow.length - 1 && <FiArrowRight className="hidden h-4 w-4 shrink-0 text-[#3b82f6]/35 sm:block" />}
                </div>
              ))}
            </div>
          </ContentPanel>

          <ContentPanel className="mt-8 p-6 sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className={`text-lg ${homeUi.heading}`}>Quick start</h2>
                <p className={`mt-1 text-sm ${homeUi.muted}`}>After deploying, configure, author, install, and integrate.</p>
              </div>
              <span className={`inline-flex items-center gap-1.5 text-xs ${homeUi.muted}`}>
                <FiLock className="h-3.5 w-3.5" />
                Your deployment · your credentials · your data
              </span>
            </div>
            <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {quickStartSteps.map((step, index) => (
                <li key={step.title} className={`p-4 transition hover:border-[#3f4a5c] hover:bg-[#171a21] ${homeUi.cardInner}`}>
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#3b82f6]/10 text-xs font-semibold tabular-nums text-[#60a5fa] ring-1 ring-inset ring-[#3b82f6]/20">
                    {index + 1}
                  </span>
                  <h3 className="mt-3 text-sm font-semibold text-[#e6eaf0]">{step.title}</h3>
                  <p className={`mt-1.5 text-sm leading-6 ${homeUi.muted}`}>{step.body}</p>
                </li>
              ))}
            </ol>
          </ContentPanel>
        </section>
      </main>

      <HomeFooter />
    </div>
  )
}
