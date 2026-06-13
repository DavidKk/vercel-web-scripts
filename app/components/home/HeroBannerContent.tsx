import Link from 'next/link'
import { FiArrowRight, FiCheckCircle, FiExternalLink } from 'react-icons/fi'

import { getVercelDeployUrl, HOME_DEPLOY_SECTION_ID } from '@/app/components/home/deploy'
import { homeUi } from '@/app/components/home/palette'
import SectionEyebrow from '@/app/components/home/SectionEyebrow'

const highlights = ['Self-hosted on your infra', 'Editor, extension, and MCP in sync', 'Typed preset APIs at runtime'] as const

interface HeroBannerContentProps {
  className?: string
}

export default function HeroBannerContent(props: HeroBannerContentProps) {
  const { className = '' } = props
  const deployUrl = getVercelDeployUrl()

  return (
    <div className={`relative z-10 max-w-xl ${className}`}>
      <SectionEyebrow>Self-hosted userscript workspace</SectionEyebrow>
      <h1 className="mt-4 text-[2.85rem] font-semibold leading-[1] tracking-[-0.042em] text-[#e6eaf0] sm:text-[4rem] lg:text-[4.5rem]">
        Script once.
        <span className={`mt-1.5 block ${homeUi.titleGradient}`}>Run on yours.</span>
      </h1>
      <p className={`mt-5 max-w-[34rem] text-base leading-7 sm:text-lg sm:leading-8 ${homeUi.body}`}>
        Open-source tooling for a private script library—web editor, Chrome extension shell, Tampermonkey launcher, and AI automation. Deploy your own instance; no shared platform
        required.
      </p>

      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <a
          href={deployUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`group inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-medium ${homeUi.btnPrimary}`}
        >
          Deploy your instance
          <FiExternalLink className="h-4 w-4 transition-transform group-hover:scale-110" />
        </a>
        <Link href={`#${HOME_DEPLOY_SECTION_ID}`} className={`inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-medium ${homeUi.btnSecondary}`}>
          Setup guide
          <FiArrowRight className="h-4 w-4" />
        </Link>
        <Link
          href="/login?redirectUrl=%2Feditor"
          className={`inline-flex items-center justify-center gap-2 px-2 py-3 text-sm font-medium ${homeUi.body} transition hover:text-[#e6eaf0] sm:px-3`}
        >
          Open editor
          <FiArrowRight className={`h-4 w-4 ${homeUi.muted}`} />
        </Link>
      </div>

      <p className={`mt-2.5 text-xs ${homeUi.muted}`}>Already deployed this repo? Use Open editor to sign in to your instance.</p>

      <div className="mt-7 grid grid-cols-1 gap-3 text-sm text-[#cbd5e1] sm:grid-cols-3">
        {highlights.map((item) => (
          <div key={item} className={`flex items-start gap-2 px-3.5 py-3 ${homeUi.cardInner}`}>
            <FiCheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#60a5fa]" />
            <span className="leading-5">{item}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
