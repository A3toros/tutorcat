'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { fetchAndCacheVideo } from '@/lib/videoCache'
import { cacheAsset } from '@/lib/assetCache'
import Button from './Button'
import VideoPlayer from './VideoPlayer'
import { CachedImage } from './CachedImage'

interface Slide {
  id: number
  type: 'image' | 'video' | 'content'
  src?: string
  title?: string
  content?: React.ReactNode
  autoPlay?: boolean
  loop?: boolean
}

interface PresentationProps {
  isOpen: boolean
  onClose: () => void
}

const slides: Slide[] = [
  {
    id: 1,
    type: 'image',
    src: '/slides/landing-page.webp',
    title: 'Project Overview',
    content: (
      <div className="text-center space-y-4">
        <h2 className="text-3xl font-bold text-slate-800">TutorCat</h2>
        <p className="text-lg text-slate-600">AI powered language learning web app</p>
      </div>
    )
  },
  {
    id: 2,
    type: 'video',
    src: '/slides/2 Book-to-dashboard-anim.mp4',
    title: 'Problem We Address',
    autoPlay: true,
    loop: false,
    content: (
      <div className="space-y-3 text-center">
        <ul className="list-none space-y-2 text-slate-700 inline-block">
          <li className="flex items-center justify-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary-500"></span>
            Low engagement in traditional ESL
          </li>
          <li className="flex items-center justify-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary-500"></span>
            Limited feedback outside class
          </li>
          <li className="flex items-center justify-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary-500"></span>
            One-size-fits-all materials
          </li>
        </ul>
      </div>
    )
  },
  {
    id: 3,
    type: 'content',
    title: 'Our Objectives',
    content: (
      <div className="space-y-4 text-center">
        <ol className="list-none space-y-3 text-slate-700 inline-block text-left">
          <li className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-full bg-gradient-to-br from-primary-500 to-secondary-500 text-white flex items-center justify-center font-bold flex-shrink-0">1</span>
            <span>Develop an interactive English language learning platform with AI-powered feedback</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-full bg-gradient-to-br from-primary-500 to-secondary-500 text-white flex items-center justify-center font-bold flex-shrink-0">2</span>
            <span>Implement gamification elements to increase student engagement</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-full bg-gradient-to-br from-primary-500 to-secondary-500 text-white flex items-center justify-center font-bold flex-shrink-0">3</span>
            <span>Create a scalable web application using modern development technologies</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-full bg-gradient-to-br from-primary-500 to-secondary-500 text-white flex items-center justify-center font-bold flex-shrink-0">4</span>
            <span>Integrate multiple external APIs for enhanced functionality</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-full bg-gradient-to-br from-primary-500 to-secondary-500 text-white flex items-center justify-center font-bold flex-shrink-0">5</span>
            <span>Implement security measures and data protection</span>
          </li>
        </ol>
      </div>
    )
  },
  {
    id: 4,
    type: 'content',
    title: 'Scope and Limitations',
    content: (
      <div className="space-y-3 text-center text-slate-700">
        <p className="max-w-2xl mx-auto">Free-tier hosting limits deployment to school level and restricts concurrent users</p>
        <p className="max-w-2xl mx-auto">Reliance on external AI APIs with no ability to train or modify models using student data</p>
        <p className="max-w-2xl mx-auto">Risk of AI hallucinations in feedback despite prompt optimization</p>
      </div>
    )
  },
  {
    id: 5,
    type: 'content',
    title: 'Target Users',
    content: (
      <div className="text-center space-y-6 max-w-4xl mx-auto">
        <div className="bg-gradient-to-br from-primary-50 to-primary-100 rounded-xl p-6 md:p-8 border-2 border-primary-200 shadow-lg hover:shadow-xl transition-all">
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-6">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center font-bold text-3xl md:text-4xl shadow-lg flex-shrink-0">🎓</div>
            <div className="text-center md:text-left flex-1">
              <h3 className="text-2xl md:text-3xl font-bold text-slate-800 mb-2 bg-gradient-to-r from-primary-600 to-primary-800 bg-clip-text text-transparent">
                Junior High & Senior High School Students
              </h3>
              <p className="text-base md:text-lg text-slate-700 leading-relaxed">
                Our primary target audience - students learning English as part of their curriculum. 
                TutorCat provides interactive, AI-powered lessons that complement classroom learning, 
                offering personalized feedback and gamified progress tracking to keep students engaged 
                and motivated throughout their English learning journey.
              </p>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-secondary-50 to-secondary-100 rounded-xl p-6 md:p-8 border-2 border-secondary-200 shadow-lg hover:shadow-xl transition-all">
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-6">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br from-secondary-500 to-secondary-700 text-white flex items-center justify-center font-bold text-3xl md:text-4xl shadow-lg flex-shrink-0">👤</div>
            <div className="text-center md:text-left flex-1">
              <h3 className="text-2xl md:text-3xl font-bold text-slate-800 mb-2 bg-gradient-to-r from-secondary-600 to-secondary-800 bg-clip-text text-transparent">
                Adult Learners & Self-Study Enthusiasts
              </h3>
              <p className="text-base md:text-lg text-slate-700 leading-relaxed">
                Perfect for self-learners and adult learners seeking to improve their English proficiency 
                at their own pace. Whether preparing for exams, advancing careers, or personal growth, 
                TutorCat offers flexible, anytime-anywhere learning with comprehensive AI feedback 
                and progress tracking tailored to individual learning goals.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 6,
    type: 'content',
    title: 'Development Process',
    content: (
      <div className="space-y-3 text-center">
        <ul className="list-none space-y-3 text-slate-700 inline-flex flex-col items-center">
          <li>
            <span className="text-lg font-semibold">Planning</span>
          </li>
          <li>
            <span className="text-lg font-semibold">Design</span>
          </li>
          <li>
            <span className="text-lg font-semibold">Development</span>
          </li>
          <li>
            <span className="text-lg font-semibold">Testing</span>
          </li>
        </ul>
      </div>
    )
  },
  {
    id: 7,
    type: 'image',
    src: '/slides/Frontend.webp',
    title: 'Frontend',
    content: (
      <div className="space-y-4 text-center text-slate-700">
        <div>
          <p className="font-semibold mb-3 text-primary-600">Tech Stack:</p>
          <ul className="list-none space-y-2 text-sm inline-block">
            <li>React - UI library</li>
            <li>TypeScript - Type safety</li>
            <li>Tailwind CSS - Styling</li>
            <li>Framer Motion - Animations</li>
            <li>Konva.js - Drag-and-drop interactions</li>
          </ul>
        </div>
        <div>
          <p className="font-semibold mt-4 mb-3 text-secondary-600">Features:</p>
          <ul className="list-none space-y-2 text-sm inline-block">
            <li>Clean, simple UI design</li>
            <li>Responsive layouts</li>
            <li>Interactive components</li>
          </ul>
        </div>
      </div>
    )
  },
  {
    id: 8,
    type: 'image',
    src: '/slides/Backend.webp',
    title: 'Backend',
    content: (
      <div className="space-y-4 text-center text-slate-700">
        <div>
          <p className="font-semibold mb-3 text-primary-600">Tech Stack:</p>
          <ul className="list-none space-y-2 text-sm inline-block">
            <li>Next.js - React framework</li>
            <li>Netlify Functions - Serverless API</li>
            <li>PostgreSQL (Neon) - Database</li>
            <li>36 API endpoints</li>
          </ul>
        </div>
        <div>
          <p className="font-semibold mt-4 mb-3 text-secondary-600">API Response Times:</p>
          <ul className="list-none space-y-2 text-sm inline-block">
            <li>Authentification: 1100ms – high latency</li>
            <li>Fetch functions: 200-400ms – low latency</li>
            <li>Write functions: 300-600ms – low latency</li>
          </ul>
        </div>
      </div>
    )
  },
  {
    id: 9,
    type: 'content',
    title: 'Security',
    content: (
      <div className="space-y-5 text-center text-slate-700">
        <div>
          <h3 className="font-semibold mb-3 text-primary-600">Tech Stack:</h3>
          <ul className="list-none space-y-2 inline-block">
            <li>JWT (jsonwebtoken) - Token-based authentication</li>
            <li>HTTP-only cookies - Enhanced security</li>
            <li>Bcrypt.js - Password hashing</li>
          </ul>
        </div>
      </div>
    )
  },
  {
    id: 10,
    type: 'content',
    title: 'Web Design',
    content: (
      <div className="space-y-4">
        <p className="text-slate-700 mb-4 text-center">Simple colors, to everyone's taste</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-semibold mb-3 text-slate-800">Primary Colors (Blue)</h3>
            <div className="space-y-2 text-xs md:text-sm">
              {[
                { name: 'Primary-50', color: '#f0f4ff' },
                { name: 'Primary-200', color: '#c7d4ff' },
                { name: 'Primary-300', color: '#a5b9ff' },
                { name: 'Primary-400', color: '#8399ff' },
                { name: 'Primary-500', color: '#6175ff' },
                { name: 'Primary-600', color: '#4a5fff' },
                { name: 'Primary-700', color: '#3d4eff' },
                { name: 'Primary-800', color: '#2f3fff' },
                { name: 'Primary-900', color: '#1a2aff' },
              ].map(({ name, color }) => (
                <div key={name} className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded border-2 border-slate-300 flex-shrink-0" style={{ backgroundColor: color }}></div>
                  <span className="text-slate-700">{name}: {color}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="font-semibold mb-3 text-slate-800">Secondary Colors (Purple)</h3>
            <div className="space-y-2 text-xs md:text-sm">
              {[
                { name: 'Secondary-50', color: '#fdf4ff' },
                { name: 'Secondary-100', color: '#fae8ff' },
                { name: 'Secondary-200', color: '#f5d0ff' },
                { name: 'Secondary-300', color: '#f0abff' },
                { name: 'Secondary-400', color: '#e879ff' },
                { name: 'Secondary-500', color: '#d946ff' },
                { name: 'Secondary-600', color: '#c026d3' },
                { name: 'Secondary-700', color: '#a21caf' },
                { name: 'Secondary-800', color: '#86198f' },
                { name: 'Secondary-900', color: '#701a75' },
              ].map(({ name, color }) => (
                <div key={name} className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded border-2 border-slate-300 flex-shrink-0" style={{ backgroundColor: color }}></div>
                  <span className="text-slate-700">{name}: {color}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 11,
    type: 'video',
    src: '/slides/Mobile-scroll.mp4',
    title: 'Lesson Structure',
    autoPlay: true,
    loop: false,
    content: (
      <div className="space-y-3 text-center text-slate-700">
        <ol className="list-none space-y-2 inline-block text-left">
          <li className="flex items-center gap-3">
            <span className="w-6 h-6 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 text-white flex items-center justify-center font-bold flex-shrink-0">1</span>
            <span>Warm up - Speaking practice</span>
          </li>
          <li className="flex items-center gap-3">
            <span className="w-6 h-6 rounded-full bg-gradient-to-br from-secondary-400 to-secondary-600 text-white flex items-center justify-center font-bold flex-shrink-0">2</span>
            <span>Vocabulary - Learn new words</span>
          </li>
          <li className="flex items-center gap-3">
            <span className="w-6 h-6 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center font-bold flex-shrink-0">3</span>
            <span>Grammar introduction - Learn rules</span>
          </li>
          <li className="flex items-center gap-3">
            <span className="w-6 h-6 rounded-full bg-gradient-to-br from-secondary-500 to-secondary-700 text-white flex items-center justify-center font-bold flex-shrink-0">4</span>
            <span>Grammar practice - Apply knowledge</span>
          </li>
          <li className="flex items-center gap-3">
            <span className="w-6 h-6 rounded-full bg-gradient-to-br from-primary-600 to-secondary-600 text-white flex items-center justify-center font-bold flex-shrink-0">5</span>
            <span>Speaking - 4-5 prompts with AI feedback</span>
          </li>
          <li className="flex items-center gap-3">
            <span className="w-6 h-6 rounded-full bg-gradient-to-br from-primary-500 to-secondary-500 text-white flex items-center justify-center font-bold flex-shrink-0">6</span>
            <span>Improved transcript by AI - Repeat practice</span>
          </li>
          <li className="flex items-center gap-3">
            <span className="w-6 h-6 rounded-full bg-gradient-to-br from-primary-700 to-secondary-700 text-white flex items-center justify-center font-bold flex-shrink-0">7</span>
            <span>Pronunciation score - Get feedback</span>
          </li>
        </ol>
      </div>
    )
  },
  {
    id: 12,
    type: 'image',
    src: '/slides/Achievements.webp',
    title: 'Gamification',
    content: (
      <div className="space-y-3 text-center text-slate-700">
        <ul className="list-none space-y-3 inline-block">
          <li className="flex items-center justify-center gap-3">
            <span className="w-2 h-2 rounded-full bg-primary-500"></span>
            <span>XP (Experience Points) - Earn points for completing activities</span>
          </li>
          <li className="flex items-center justify-center gap-3">
            <span className="w-2 h-2 rounded-full bg-secondary-500"></span>
            <span>Titles - Unlock titles from "Tiny Whisker" to "TutorCat"</span>
          </li>
          <li className="flex items-center justify-center gap-3">
            <span className="w-2 h-2 rounded-full bg-primary-500"></span>
            <span>Achievements - 100+ achievements to unlock</span>
          </li>
          <li className="flex items-center justify-center gap-3">
            <span className="w-2 h-2 rounded-full bg-secondary-500"></span>
            <span>Daily streaks - Build learning habits</span>
          </li>
          <li className="flex items-center justify-center gap-3">
            <span className="w-2 h-2 rounded-full bg-primary-500"></span>
            <span>Level progression - Advance through CEFR levels</span>
          </li>
        </ul>
      </div>
    )
  },
  {
    id: 13,
    type: 'content',
    title: 'AI Feedback',
    content: (
      <div className="space-y-4 text-center text-slate-700">
        <div className="space-y-3">
          <div>
            <p className="font-semibold text-center"><span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white text-sm font-bold mr-2">1</span> User records speech</p>
            <p className="text-sm text-slate-600 text-center">Student speaks in response to prompts</p>
          </div>
          <div>
            <p className="font-semibold text-center"><span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-secondary-500 to-secondary-700 text-white text-sm font-bold mr-2">2</span> Speech-to-text transcription</p>
            <p className="text-sm text-slate-600 text-center">AssemblyAI converts audio to text</p>
          </div>
          <div>
            <p className="font-semibold text-center"><span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-primary-600 to-secondary-600 text-white text-sm font-bold mr-2">3</span> AI analysis (GPT-4o-mini)</p>
            <p className="text-sm text-slate-600 text-center">Analyzes grammar, vocabulary, pronunciation, and topic relevance</p>
          </div>
          <div>
            <p className="font-semibold text-center"><span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-primary-500 to-secondary-500 text-white text-sm font-bold mr-2">4</span> Personalized feedback</p>
            <p className="text-sm text-slate-600 text-center">Score, corrections, improved transcript, and CEFR level assessment</p>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 14,
    type: 'content',
    title: 'Testing',
    content: (
      <div className="space-y-4 text-center text-slate-700">
        <div>
          <h3 className="font-semibold mb-2 text-primary-600">Functional Testing</h3>
          <p className="text-sm text-slate-600 max-w-2xl mx-auto">Verified all features work correctly: lesson activities, authentication flows, database operations, and achievement system</p>
        </div>
        <div>
          <h3 className="font-semibold mb-2 text-secondary-600">UI Testing</h3>
          <p className="text-sm text-slate-600 max-w-2xl mx-auto">Tested user interface components, interactions, and visual elements for consistency and usability</p>
        </div>
        <div>
          <h3 className="font-semibold mb-2 text-primary-600">API Testing</h3>
          <p className="text-sm text-slate-600 max-w-2xl mx-auto">Validated all 36 serverless function endpoints, response times, error handling, and data integrity</p>
        </div>
        <div>
          <h3 className="font-semibold mb-2 text-secondary-600">Cross Device Compatibility - Playwright</h3>
          <p className="text-sm text-slate-600 max-w-2xl mx-auto">Automated end-to-end testing across Chromium, Firefox, and Safari browsers with mobile emulation</p>
        </div>
        <div>
          <h3 className="font-semibold mb-2 text-primary-600">Mobile Optimizations</h3>
          <p className="text-sm text-slate-600 max-w-2xl mx-auto">Responsive design testing, touch interactions, mobile-specific UI adjustments, and performance optimization</p>
        </div>
      </div>
    )
  },
  {
    id: 15,
    type: 'content',
    title: 'Research',
    content: (
      <div className="space-y-4 text-center text-slate-700">
        <div>
          <h3 className="font-semibold mb-2 text-primary-600">Research Methodology</h3>
          <p className="text-sm text-slate-600 max-w-2xl mx-auto">Conducted a comprehensive study with Grade 7 students to measure the effectiveness of TutorCat</p>
        </div>
        <div className="space-y-3">
          <div>
            <p className="font-semibold text-center"><span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white text-sm font-bold mr-2">1</span> Pre-test Assessment</p>
            <p className="text-sm text-slate-600 text-center">Students took an initial English language proficiency test to establish baseline scores</p>
          </div>
          <div>
            <p className="font-semibold text-center"><span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-secondary-500 to-secondary-700 text-white text-sm font-bold mr-2">2</span> One month</p>
            <p className="text-sm text-slate-600 text-center">Students used TutorCat platform for one month, completing lessons and activities at their own pace</p>
          </div>
          <div>
            <p className="font-semibold text-center"><span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-primary-600 to-secondary-600 text-white text-sm font-bold mr-2">3</span> Post-test Assessment</p>
            <p className="text-sm text-slate-600 text-center">Students retook the same proficiency test to measure improvement after using the platform</p>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 16,
    type: 'content',
    title: 'Results of Research',
    content: (
      <div className="space-y-4">
        <div className="bg-primary-50 rounded-lg p-4 border border-primary-200 mb-4">
          <h3 className="font-semibold text-slate-800 mb-2">How This Proves Efficiency:</h3>
          <ul className="list-disc list-inside space-y-2 text-sm text-slate-700">
            <li><strong>Substantial improvement:</strong> Average score increased from 25 to 31 points</li>
            <li><strong>Consistent gains:</strong> All 22 students showed improvement (ranging from +5 to +7 points)</li>
            <li><strong>Significant progress:</strong> +6 point gain demonstrates measurable learning outcomes</li>
          </ul>
        </div>
        <div className="bg-white rounded-lg p-3 md:p-4 border border-slate-200 max-h-[40vh] overflow-y-auto">
          <p className="text-xs md:text-sm font-semibold mb-2 text-center">Pre-test and Post-test Scores of Grade 7 Students</p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-[10px] md:text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-300 px-1 md:px-2 py-1 text-left">Student ID</th>
                  <th className="border border-slate-300 px-1 md:px-2 py-1">Pre-test</th>
                  <th className="border border-slate-300 px-1 md:px-2 py-1">Post-test</th>
                  <th className="border border-slate-300 px-1 md:px-2 py-1">Improvement</th>
                </tr>
              </thead>
              <tbody>
                {[
                  [51032, 24, 30, 6], [51033, 26, 32, 6], [51034, 22, 27, 5],
                  [51035, 28, 34, 6], [51036, 25, 31, 6], [51037, 27, 33, 6],
                  [51038, 23, 29, 6], [51039, 29, 36, 7], [51040, 21, 26, 5],
                  [51041, 26, 32, 6], [51042, 24, 30, 6], [51043, 30, 37, 7],
                  [51044, 22, 28, 6], [51045, 27, 33, 6], [51046, 25, 31, 6],
                  [51047, 28, 35, 7], [51048, 23, 28, 5], [51049, 26, 32, 6],
                  [51050, 24, 30, 6], [51051, 29, 35, 6], [51052, 21, 27, 6],
                  [51053, 27, 33, 6]
                ].map(([id, pre, post, imp]) => (
                  <tr key={id} className="hover:bg-slate-50">
                    <td className="border border-slate-300 px-1 md:px-2 py-1">{id}</td>
                    <td className="border border-slate-300 px-1 md:px-2 py-1 text-center">{pre}</td>
                    <td className="border border-slate-300 px-1 md:px-2 py-1 text-center">{post}</td>
                    <td className="border border-slate-300 px-1 md:px-2 py-1 text-center text-green-600 font-semibold">+{imp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 space-y-1 text-sm text-center">
            <p><strong>Pre-test Mean:</strong> 25.0</p>
            <p><strong>Post-test Mean:</strong> 31.0</p>
            <p className="text-green-600 font-semibold text-lg"><strong>Mean Gain:</strong> +6.0 points (12% of maximum score)</p>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 17,
    type: 'content',
    title: 'Benefits',
    content: (
      <div className="space-y-4 text-center text-slate-700">
        <div>
          <p className="font-semibold"><span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white text-sm font-bold mr-2">1</span> Learn Any Time Anywhere</p>
          <p className="text-sm text-slate-600">24/7 access from any device - desktop, tablet, or mobile. No need to be in a classroom or follow a fixed schedule</p>
        </div>
        <div>
          <p className="font-semibold"><span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-secondary-500 to-secondary-700 text-white text-sm font-bold mr-2">2</span> Go at Your Own Pace</p>
          <p className="text-sm text-slate-600">Self-paced learning allows students to spend more time on difficult topics and move quickly through familiar material</p>
        </div>
        <div>
          <p className="font-semibold"><span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-primary-600 to-secondary-600 text-white text-sm font-bold mr-2">3</span> Free for Our Students</p>
          <p className="text-sm text-slate-600">No cost barriers - all students at our school have free access to comprehensive English learning resources</p>
        </div>
      </div>
    )
  },
  {
    id: 18,
    type: 'content',
    title: 'Scalability',
    content: (
      <div className="space-y-4 text-center text-slate-700">
        <div>
          <p className="font-semibold"><span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white text-sm font-bold mr-2">1</span> Paid Tiers on Hosting and Database</p>
          <p className="text-sm text-slate-600">Upgrade to premium hosting and database plans to support increased traffic and data storage needs</p>
        </div>
        <div>
          <p className="font-semibold"><span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-secondary-500 to-secondary-700 text-white text-sm font-bold mr-2">2</span> Support More Users</p>
          <p className="text-sm text-slate-600">Serverless architecture allows automatic scaling to handle thousands of concurrent users</p>
        </div>
        <div>
          <p className="font-semibold"><span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-primary-600 to-secondary-600 text-white text-sm font-bold mr-2">3</span> Paid Plans for External Users</p>
          <p className="text-sm text-slate-600">Offer subscription plans for students and learners outside our school to generate revenue</p>
        </div>
        <div>
          <p className="font-semibold"><span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-primary-500 to-secondary-500 text-white text-sm font-bold mr-2">4</span> Google Index</p>
          <p className="text-sm text-slate-600">Optimize for search engines to increase discoverability and attract traffic</p>
        </div>
        <div>
          <p className="font-semibold"><span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-primary-700 to-secondary-700 text-white text-sm font-bold mr-2">5</span> Promotion</p>
          <p className="text-sm text-slate-600">Marketing campaigns, social media presence, and partnerships to expand user base</p>
        </div>
      </div>
    )
  },
  {
    id: 19,
    type: 'image',
    src: '/slides/Admin.webp',
    title: 'Conclusion',
    content: (
      <div className="space-y-4 text-center text-slate-700">
        <div className="space-y-2">
          <p className="text-lg font-semibold text-primary-600">174 Active Students</p>
          <p className="text-sm">All students from our school are using TutorCat to enhance their English learning journey</p>
        </div>
        <div className="space-y-2">
          <p className="text-lg font-semibold text-secondary-600">Proven Results</p>
          <p className="text-sm">Research shows an average improvement of +6 points (12% of maximum score) in language proficiency after just one month</p>
        </div>
        <div className="space-y-2">
          <p className="text-lg font-semibold text-primary-600">Continuous Engagement</p>
          <p className="text-sm">Students actively complete lessons, earn achievements, and track their progress daily</p>
        </div>
        <div className="pt-4 border-t border-slate-200">
          <p className="text-base font-bold text-slate-800">TutorCat: Empowering students to learn English effectively, anytime, anywhere</p>
        </div>
      </div>
    )
  }
]

export default function Presentation({ isOpen, onClose }: PresentationProps) {
  const [currentSlide, setCurrentSlide] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isMounted, setIsMounted] = useState(false)
  const [expandedImage, setExpandedImage] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRefs = useRef<{ [key: number]: HTMLVideoElement | null }>({})

  // Ensure we're on the client before rendering
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Preload all media assets
  useEffect(() => {
    if (!isOpen) return

    const preloadAssets = async () => {
      setIsLoading(true)
      const promises: Promise<void>[] = []

      slides.forEach((slide) => {
        if (slide.type === 'video' && slide.src) {
          promises.push(
            fetchAndCacheVideo(slide.src).then(() => {}).catch(() => {
              console.warn(`Failed to preload video: ${slide.src}`)
            })
          )
        } else if (slide.type === 'image' && slide.src) {
          promises.push(
            cacheAsset(slide.src).then(() => {}).catch(() => {
              console.warn(`Failed to preload image: ${slide.src}`)
            })
          )
        }
      })

      await Promise.all(promises)
      setIsLoading(false)
    }

    preloadAssets()
  }, [isOpen])

  // Handle fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => {
        setIsFullscreen(true)
      }).catch(() => {
        console.warn('Failed to enter fullscreen')
      })
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false)
      }).catch(() => {
        console.warn('Failed to exit fullscreen')
      })
    }
  }, [])

  // Handle fullscreen change events
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const goToNext = useCallback(() => {
    setCurrentSlide((prev) => {
      if (prev < slides.length - 1) {
        return prev + 1
      }
      return prev
    })
  }, [])

  const goToPrevious = useCallback(() => {
    setCurrentSlide((prev) => {
      if (prev > 0) {
        return prev - 1
      }
      return prev
    })
  }, [])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        goToPrevious()
      } else if (e.key === 'ArrowRight') {
        goToNext()
      } else if (e.key === 'Escape') {
        if (expandedImage) {
          setExpandedImage(null)
        } else if (isFullscreen) {
          document.exitFullscreen()
        } else {
          onClose()
        }
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen()
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [isOpen, isFullscreen, onClose, toggleFullscreen, goToNext, goToPrevious, expandedImage])

  // Auto-play videos when slide changes
  useEffect(() => {
    const slide = slides[currentSlide]
    if (slide?.type === 'video' && slide.autoPlay) {
      const video = videoRefs.current[currentSlide]
      if (video) {
        video.play().catch(() => {
          console.warn('Failed to autoplay video')
        })
      }
    }

    // Pause other videos
    Object.values(videoRefs.current).forEach((video, index) => {
      if (video && index !== currentSlide) {
        video.pause()
        video.currentTime = 0
      }
    })
  }, [currentSlide])

  const goToSlide = (index: number) => {
    setCurrentSlide(index)
  }

  const handleRepeat = () => {
    setCurrentSlide(0)
  }

  const currentSlideData = slides[currentSlide]
  const isLastSlide = currentSlide === slides.length - 1

  // Lock body scroll when presentation is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  if (!isOpen || !isMounted) return null

  // Use portal for fullscreen presentation
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-secondary-50 flex flex-col"
      ref={containerRef}
    >
      {/* Header */}
      <div className="relative z-50 bg-white backdrop-blur-sm px-4 py-3 h-14 md:h-16 flex items-center justify-between border-b border-secondary-200 flex-shrink-0 shadow-sm">
          <div className="flex items-center gap-4">
            <span className="text-slate-800 text-sm font-medium">
              {currentSlide + 1} / {slides.length}
            </span>
            <span className="text-slate-600 text-sm">{currentSlideData.title}</span>
          </div>
          <button
            onClick={toggleFullscreen}
            className="text-slate-700 hover:text-primary-600 transition-colors p-2"
            aria-label="Toggle fullscreen"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isFullscreen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              )}
            </svg>
          </button>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-auto min-h-0 pt-14 md:pt-16">
          <div className="flex items-center justify-center p-4 md:p-8 pb-24 md:pb-28 min-h-full">
            {isLoading ? (
              <div className="text-center text-slate-700">
                <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                <p>Loading presentation...</p>
              </div>
            ) : (
              <div className="w-full max-w-7xl mx-auto mt-0">
              <div className="bg-white rounded-lg shadow-2xl overflow-hidden mt-2 md:mt-4">
                {/* Slide Content */}
                <div className={`relative min-h-[60vh] flex flex-col pt-4 md:pt-6 ${currentSlide === 10 ? 'bg-transparent' : 'bg-slate-100'}`}>
                  {/* Media (Image or Video) */}
                  {(currentSlideData.type === 'video' || currentSlideData.type === 'image') && currentSlideData.src && (
                    <div className="relative w-full flex items-center justify-center p-4 md:p-6 pt-2 md:pt-4 bg-transparent">
                      {currentSlideData.type === 'video' && (
                        <div className="flex items-center justify-center bg-transparent" style={currentSlide === 10 ? { maxWidth: '200px', maxHeight: '300px' } : { maxWidth: '100%', maxHeight: '60vh' }}>
                          <VideoPlayer
                            src={currentSlideData.src}
                            autoPlay={currentSlideData.autoPlay}
                            loop={currentSlideData.loop}
                            className="w-full h-full object-contain bg-transparent"
                            style={currentSlide === 10 ? { maxWidth: '200px', maxHeight: '300px', background: 'transparent' } : { maxWidth: '100%', maxHeight: '60vh', background: 'transparent' }}
                            onVideoRef={(video) => {
                              videoRefs.current[currentSlide] = video
                            }}
                          />
                        </div>
                      )}
                      {currentSlideData.type === 'image' && (
                        <div className="w-full max-w-4xl flex items-center justify-center">
                          <CachedImage
                            src={currentSlideData.src}
                            alt={currentSlideData.title || 'Slide image'}
                            className="max-w-full max-h-[45vh] object-contain cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => setExpandedImage(currentSlideData.src!)}
                          />
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Content Section - Show below media if both exist */}
                  {currentSlideData.content && (currentSlideData.type === 'video' || currentSlideData.type === 'image') && (
                    <div className="w-full p-6 md:p-8 bg-gradient-to-b from-white to-primary-50/30 border-t border-primary-200">
                      <div className="max-w-4xl mx-auto">
                        <h2 className="text-2xl md:text-3xl font-bold text-center mb-4 md:mb-6 bg-gradient-to-r from-primary-600 to-secondary-600 bg-clip-text text-transparent">
                          {currentSlideData.title}
                        </h2>
                        <div className="text-base md:text-lg lg:text-xl text-center text-slate-700">
                          {currentSlideData.content}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Content-only slides */}
                  {currentSlideData.type === 'content' && !currentSlideData.src && (
                    <div className="w-full flex-1 flex items-center justify-center p-4 md:p-8 overflow-y-auto max-h-full bg-gradient-to-br from-white via-primary-50/20 to-secondary-50/20">
                      <div className="max-w-4xl w-full">
                        <h2 className="text-2xl md:text-4xl font-bold text-center mb-6 md:mb-8 bg-gradient-to-r from-primary-600 to-secondary-600 bg-clip-text text-transparent">
                          {currentSlideData.title}
                        </h2>
                        <div className="text-sm md:text-lg text-center text-slate-700">
                          {currentSlideData.content}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            )}
          </div>
        </div>

        {/* Navigation Arrows */}
        {!isLoading && (
          <>
            {currentSlide > 0 && (
              <button
                onClick={goToPrevious}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-40 bg-white/90 hover:bg-white text-slate-800 rounded-full p-3 shadow-lg transition-all hover:scale-110"
                aria-label="Previous slide"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            {!isLastSlide && (
              <button
                onClick={goToNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-40 bg-white/90 hover:bg-white text-slate-800 rounded-full p-3 shadow-lg transition-all hover:scale-110"
                aria-label="Next slide"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </>
        )}

        {/* Footer with controls */}
        <div className="relative z-50 bg-white/90 backdrop-blur-sm px-4 py-3 border-t border-secondary-200 flex-shrink-0 shadow-sm">
          <div className="flex items-center justify-between max-w-7xl mx-auto gap-4">
            {/* Slide indicators */}
            <div className="flex gap-1 overflow-x-auto flex-1 min-w-0">
              {slides.map((_, index) => (
                <button
                  key={index}
                  onClick={() => goToSlide(index)}
                  className={`min-w-[8px] h-2 rounded-full transition-all ${
                    index === currentSlide
                      ? 'bg-primary-500 w-8'
                      : 'bg-white/30 hover:bg-white/50'
                  }`}
                  aria-label={`Go to slide ${index + 1}`}
                />
              ))}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              {isLastSlide && (
                <Button
                  onClick={handleRepeat}
                  variant="primary"
                  size="sm"
                >
                  Repeat
                </Button>
              )}
              <Button
                onClick={onClose}
                variant="secondary"
                size="sm"
              >
                Close
              </Button>
            </div>
          </div>
        </div>

        {/* Expanded Image Modal */}
        {expandedImage && (
          <div
            className="fixed inset-0 z-[10000] bg-black/90 flex items-center justify-center p-4"
            onClick={() => setExpandedImage(null)}
          >
            <div className="relative max-w-full max-h-full">
              <CachedImage
                src={expandedImage}
                alt="Expanded image"
                className="max-w-[100vw] max-h-[100vh] object-contain"
              />
              <button
                onClick={() => setExpandedImage(null)}
                className="absolute top-4 right-4 text-white hover:text-primary-400 transition-colors p-2 bg-black/50 rounded-full"
                aria-label="Close expanded image"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}
    </div>,
    document.body
  )
}
