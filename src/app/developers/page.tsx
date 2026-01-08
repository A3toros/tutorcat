'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui'

interface TeamMember {
  id: string
  name: string
  roleKey: string
  descriptionKey: string
  photo: string
  isCurator?: boolean
}

export default function DevelopersPage() {
  const { t } = useTranslation()
  
  const teamMembers: TeamMember[] = [
    {
      id: 'dev1',
      name: 'Mattcha Srirojwong',
      roleKey: 'meetTeam.roles.backendDeveloper',
      descriptionKey: 'meetTeam.descriptions.mattcha',
      photo: '/developer.png',
      isCurator: false
    },
    {
      id: 'dev2',
      name: 'Jindaporn Tikpmporn',
      roleKey: 'meetTeam.roles.webDesigner',
      descriptionKey: 'meetTeam.descriptions.jindaporn',
      photo: '/developer.png',
      isCurator: false
    },
    {
      id: 'dev3',
      name: 'Nichapath Chunlawithet',
      roleKey: 'meetTeam.roles.frontendDeveloper',
      descriptionKey: 'meetTeam.descriptions.nichapath',
      photo: '/developer.png',
      isCurator: false
    },
    {
      id: 'curator',
      name: 'Aleksandr Petrov',
      roleKey: 'meetTeam.roles.teacherPlatformDeveloper',
      descriptionKey: 'meetTeam.descriptions.aleksandr',
      photo: '/teacher.webp',
      isCurator: true
    }
  ]

  const curator = teamMembers.find(m => m.isCurator)
  const developers = teamMembers.filter(m => !m.isCurator)

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 to-neutral-100 py-12">
      <div className="container mx-auto px-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl font-bold text-neutral-800 mb-4">
            {t('meetTeam.title', 'Meet the Team')}
          </h1>
          <p className="text-lg text-neutral-600 max-w-2xl mx-auto">
            {t('meetTeam.subtitle', 'The talented individuals behind TutorCat, dedicated to creating an innovative language learning experience')}
          </p>
        </motion.div>

        {/* Developers Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <h2 className="text-2xl font-semibold text-neutral-800 mb-6 text-center">
            {t('meetTeam.developmentTeam', 'Development Team')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {developers.map((developer, index) => (
              <motion.div
                key={developer.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.5 + index * 0.1 }}
              >
                <Card className="h-full hover:shadow-xl transition-shadow duration-300">
                  <Card.Body className="p-6">
                    {/* Photo */}
                    <div className="w-32 h-32 rounded-full overflow-hidden mx-auto mb-4 border-4 border-primary-200">
                      <img 
                        src={developer.photo} 
                        alt={developer.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = '/developer.png'
                        }}
                      />
                    </div>
                    
                    {/* Info */}
                    <div className="text-center">
                      <h3 className="text-xl font-bold text-neutral-800 mb-2">
                        {developer.name.split(' ').slice(0, -1).join(' ')}
                        {developer.name.split(' ').length > 1 && (
                          <>
                            <br />
                            <span className="text-lg">{developer.name.split(' ').slice(-1)[0]}</span>
                          </>
                        )}
                      </h3>
                      <p className="text-primary-600 font-semibold mb-3">
                        {t(developer.roleKey)}
                      </p>
                      <p className="text-neutral-600 text-sm leading-relaxed">
                        {t(developer.descriptionKey)}
                      </p>
                    </div>
                  </Card.Body>
                </Card>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Teacher Section - Below Developers */}
        {curator && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.9 }}
            className="mt-16"
          >
            <div className="flex justify-center">
              <Card className="max-w-2xl w-full">
                <Card.Body className="p-8">
                  <div className="flex flex-col items-center gap-6">
                    {/* Photo */}
                    <div className="flex-shrink-0">
                      <div className="w-48 h-48 rounded-full overflow-hidden border-4 border-primary-200">
                        <img 
                          src={curator.photo} 
                          alt={curator.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.src = '/teacher.webp'
                          }}
                        />
                      </div>
                    </div>
                    
                    {/* Info */}
                    <div className="flex-1 text-center">
                      <h3 className="text-2xl font-bold text-neutral-800 mb-2">
                        {curator.name.split(' ').slice(0, -1).join(' ')}
                        {curator.name.split(' ').length > 1 && (
                          <>
                            <br />
                            <span className="text-xl">{curator.name.split(' ').slice(-1)[0]}</span>
                          </>
                        )}
                      </h3>
                      <p className="text-primary-600 font-semibold mb-4">
                        {t(curator.roleKey)}
                      </p>
                      <p className="text-neutral-600 leading-relaxed">
                        {t(curator.descriptionKey)}
                      </p>
                    </div>
                  </div>
                </Card.Body>
              </Card>
            </div>
          </motion.div>
        )}

        {/* Footer Note */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.9 }}
          className="mt-12 text-center text-neutral-500 text-sm"
        >
          <p>
            {t('meetTeam.footerNote', 'TutorCat is developed by Mathayomwatsing School for educational purposes.')}
          </p>
        </motion.div>
      </div>
    </div>
  )
}

