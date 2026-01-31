'use client'

import Link from 'next/link'
import Image from 'next/image'

interface PreviewCardProps {
  href?: string
  imageSrc?: string
  alt?: string
  className?: string
}

export function PreviewCard({
  href = 'https://tutorcat.online',
  imageSrc = '/og-cover.webp',
  alt = 'TutorCat Interactive English Learning Platform',
  className = ''
}: PreviewCardProps) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`preview-card block ${className}`}
    >
      <Image
        src={imageSrc}
        alt={alt}
        width={600}
        height={315}
        className="w-full max-w-[600px] rounded-[10px] shadow-[0_8px_20px_rgba(0,0,0,0.15)] transition-transform duration-200 ease-in-out hover:scale-[1.02]"
      />
    </Link>
  )
}

export default PreviewCard
