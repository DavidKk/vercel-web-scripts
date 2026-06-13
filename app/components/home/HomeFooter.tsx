import { FiArrowRight, FiExternalLink, FiGithub } from 'react-icons/fi'

import { getEnvExampleUrl, getReadmeDeployUrl, getRepositoryBrowseUrl } from '@/app/components/home/deploy'
import { homeUi } from '@/app/components/home/palette'

export default function HomeFooter() {
  const githubUrl = getRepositoryBrowseUrl()

  return (
    <footer className={`border-t border-[#2a303a]/70 ${homeUi.canvas}`}>
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div>
          <p className={`text-sm font-medium ${homeUi.heading}`}>MagickMonkey</p>
          <p className={`mt-1 text-sm ${homeUi.muted}`}>Self-hosted userscript workspace · MIT License</p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <a href={githubUrl} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1.5 ${homeUi.body} transition hover:text-[#e6eaf0]`}>
            <FiGithub className="h-4 w-4" />
            GitHub
          </a>
          <a href={getReadmeDeployUrl()} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1.5 ${homeUi.link}`}>
            Deploy guide
            <FiArrowRight className="h-3.5 w-3.5" />
          </a>
          <a href={getEnvExampleUrl()} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1.5 ${homeUi.link}`}>
            .env.example
            <FiExternalLink className="h-3.5 w-3.5" />
          </a>
          <a href="/docs/scripts-ai-skill.md" className={`inline-flex items-center gap-1.5 ${homeUi.link}`}>
            AI skill doc
            <FiArrowRight className="h-3.5 w-3.5" />
          </a>
          <a href="/docs/scripts-function-tools.json" className={`inline-flex items-center gap-1.5 ${homeUi.body} transition hover:text-[#e6eaf0]`}>
            Function tools JSON
          </a>
        </nav>
      </div>
    </footer>
  )
}
