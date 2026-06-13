import { FiArrowRight, FiExternalLink, FiGithub, FiLock, FiServer } from 'react-icons/fi'

import { getEnvExampleUrl, getReadmeDeployUrl, getRepositoryBrowseUrl, getVercelDeployUrl, HOME_DEPLOY_SECTION_ID } from '@/app/components/home/deploy'
import { homeUi } from '@/app/components/home/palette'
import SectionEyebrow from '@/app/components/home/SectionEyebrow'

const deployNotes = [
  {
    icon: FiServer,
    title: 'Your Vercel project',
    body: 'One-click creates a deployment under your account—not a shared MagickMonkey cloud.',
  },
  {
    icon: FiLock,
    title: 'Your credentials',
    body: 'Admin login, JWT secret, and storage tokens live in your env vars only.',
  },
  {
    icon: FiGithub,
    title: 'Your script library',
    body: 'Connect your own script storage backend. You control access, rotation, and data residency.',
  },
] as const

const requiredEnvVars = ['GIST_ID', 'GIST_TOKEN', 'ACCESS_USERNAME', 'ACCESS_PASSWORD', 'JWT_SECRET'] as const

interface HomeDeploySectionProps {
  className?: string
}

export default function HomeDeploySection(props: HomeDeploySectionProps) {
  const { className = '' } = props
  const githubUrl = getRepositoryBrowseUrl()
  const deployUrl = getVercelDeployUrl()

  return (
    <div id={HOME_DEPLOY_SECTION_ID} className={`relative scroll-mt-24 ${homeUi.sectionPanel} p-6 sm:p-8 ${className}`}>
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[#3b82f6]/35 to-transparent sm:inset-x-8" />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-xl">
          <SectionEyebrow>Self-host</SectionEyebrow>
          <h2 className={`mt-3 text-2xl sm:text-[1.75rem] ${homeUi.heading}`}>Deploy your own instance</h2>
          <p className={`mt-3 text-sm leading-7 sm:text-base ${homeUi.body}`}>
            MagickMonkey is open source—you run it. There is no central hosted service: fork or clone, configure env vars from <code className="text-[#cbd5e1]">.env.example</code>,
            and ship to your Vercel project (or any compatible host).
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-3 sm:items-end">
          <a href={deployUrl} target="_blank" rel="noopener noreferrer" className="inline-flex transition hover:brightness-110" aria-label="Deploy to Vercel">
            <img src="https://vercel.com/button" alt="Deploy with Vercel" width={102} height={32} className="h-8 w-auto" />
          </a>
          <p className={`max-w-xs text-xs leading-5 sm:text-right ${homeUi.muted}`}>Deploys into your Vercel account · not our infrastructure</p>
        </div>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        {deployNotes.map(({ icon: Icon, title, body }) => (
          <div key={title} className={`p-4 ${homeUi.cardInner}`}>
            <div className="mb-3 inline-flex rounded-lg bg-[#3b82f6]/10 p-2 text-[#60a5fa] ring-1 ring-inset ring-[#3b82f6]/20">
              <Icon className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-semibold text-[#e6eaf0]">{title}</h3>
            <p className={`mt-1.5 text-sm leading-6 ${homeUi.muted}`}>{body}</p>
          </div>
        ))}
      </div>

      <div className={`mt-6 rounded-xl border border-[#2a303a] bg-[#111318]/80 p-4 sm:p-5`}>
        <p className={`text-xs font-medium uppercase tracking-[0.12em] ${homeUi.muted}`}>Required env vars</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {requiredEnvVars.map((name) => (
            <code key={name} className="rounded-md border border-[#2a303a] bg-[#171a21] px-2 py-1 text-xs text-[#93c5fd]">
              {name}
            </code>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <a href={getEnvExampleUrl()} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1.5 ${homeUi.link}`}>
            .env.example
            <FiExternalLink className="h-3.5 w-3.5" />
          </a>
          <a href={getReadmeDeployUrl()} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1.5 ${homeUi.link}`}>
            Deploy guide
            <FiArrowRight className="h-3.5 w-3.5" />
          </a>
          <a href={githubUrl} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1.5 ${homeUi.body} transition hover:text-[#e6eaf0]`}>
            Source on GitHub
            <FiGithub className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  )
}
