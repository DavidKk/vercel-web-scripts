export interface HeroBannerBackgroundProps {
  layout?: 'overlay' | 'section'
  className?: string
}

export default function HeroBannerBackground(props: HeroBannerBackgroundProps) {
  const { layout = 'overlay', className = '' } = props
  const rootClass = layout === 'section' ? `relative w-full overflow-hidden bg-[#111318] ${className}` : `pointer-events-none absolute inset-0 w-full overflow-hidden ${className}`

  return (
    <div className={rootClass} aria-hidden>
      <div className="absolute inset-0 bg-[#111318]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] opacity-40 [mask-image:radial-gradient(ellipse_70%_60%_at_68%_32%,black,transparent_78%)]" />
      <div className="absolute -top-48 left-[15%] h-[32rem] w-[32rem] rounded-full bg-[#3b82f6]/[0.09] blur-[120px]" />
      <div className="absolute top-[8%] -right-16 h-96 w-96 rounded-full bg-[#8b5cf6]/[0.07] blur-[100px]" />
      <div className="absolute bottom-[-6rem] right-[24%] h-72 w-72 rounded-full bg-[#3b82f6]/[0.035] blur-[90px]" />

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_95%_80%_at_72%_40%,transparent_0%,rgba(17,19,24,0.16)_56%,rgba(17,19,24,0.5)_100%)]" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#111318] from-0% via-[#111318]/90 via-[34%] to-transparent to-[68%]" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#111318]/25 via-transparent to-transparent" />
    </div>
  )
}
