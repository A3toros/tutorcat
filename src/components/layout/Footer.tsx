import React from 'react'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'

const Footer: React.FC = () => {
  const { t } = useTranslation()
  const currentYear = new Date().getFullYear()

  const linkClass =
    'text-neutral-300 hover:text-white transition-colors text-xs sm:text-sm leading-snug'

  return (
    <footer className="bg-neutral-900 text-white py-5 sm:py-8 md:py-12 overflow-hidden">
      <div className="container mx-auto px-3 sm:px-4 max-w-full">
        <div className="flex flex-col gap-4 md:grid md:grid-cols-4 md:gap-8 md:gap-y-6">
          {/* Brand */}
          <div className="flex items-center gap-2.5 min-w-0 md:col-span-2">
            <img
              src="/logo.webp"
              alt="TutorCat Logo"
              className="h-8 w-8 sm:h-10 sm:w-10 object-contain flex-shrink-0"
            />
            <div className="min-w-0">
              <h3 className="text-base sm:text-xl font-bold leading-tight">TutorCat</h3>
              <p className="text-neutral-400 text-[11px] sm:text-sm leading-tight line-clamp-2">
                {t('footer.platformDescription', 'AI Language Learning Platform')}
              </p>
            </div>
          </div>

          {/* Links: 2 columns on mobile, grid columns on desktop */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:gap-x-6 md:col-span-2 md:grid-cols-3 md:gap-8">
            <div>
              <h4 className="text-[11px] sm:text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-1 sm:mb-2 md:text-lg md:normal-case md:text-white md:tracking-normal">
                {t('footer.developers', 'Developers')}
              </h4>
              <ul>
                <li>
                  <Link href="/developers" className={linkClass}>
                    {t('footer.meetTheTeam', 'Meet the Team')}
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-[11px] sm:text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-1 sm:mb-2 md:text-lg md:normal-case md:text-white md:tracking-normal">
                {t('footer.legal', 'Legal')}
              </h4>
              <ul className="space-y-0.5 sm:space-y-1">
                <li>
                  <Link href="/privacy-policy" className={linkClass}>
                    {t('footer.privacyPolicy', 'Privacy Policy')}
                  </Link>
                </li>
                <li>
                  <Link href="/terms-of-service" className={linkClass}>
                    {t('footer.termsOfService', 'Terms of Service')}
                  </Link>
                </li>
              </ul>
            </div>

            <div className="col-span-2 md:col-span-1">
              <h4 className="text-[11px] sm:text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-1 sm:mb-2 md:text-lg md:normal-case md:text-white md:tracking-normal">
                {t('footer.contact', 'Contact')}
              </h4>
              <ul>
                <li>
                  <Link href="/contact" className={linkClass}>
                    {t('footer.contactUs', 'Contact Us')}
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="border-t border-neutral-800 mt-4 pt-3 sm:mt-6 sm:pt-4 md:mt-8 md:pt-8">
          <p className="text-neutral-400 text-[10px] sm:text-xs md:text-sm text-center leading-snug">
            © {currentYear} {t('footer.schoolName', 'Mathayomwatsing School')}.{' '}
            {t('common.allRightsReserved', 'All rights reserved.')}
          </p>
        </div>
      </div>
    </footer>
  )
}

export default Footer
