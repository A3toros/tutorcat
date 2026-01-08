# TutorCat System Architecture - Actual Function Call Chains

## Overview
This document maps the REAL function call chains and execution flow in the TutorCat web application, based on actual code analysis and runtime execution paths.

## 🔄 ACTUAL FUNCTION CALL CHAINS

### **1. User Login Flow**
```
Browser → Next.js page.tsx
    ↓ useEffect() checks authentication
    ↓ useAuth() hook calls getUserProfile()
        ↓ makeAuthenticatedRequest()
            ↓ fetch('/.netlify/functions/auth-me')
                ↓ auth-me.ts handler()
                    ↓ verifyJWT() function
                        ↓ jwt.verify(token, JWT_SECRET)
                    ↓ fetchUserData() from database
                        ↓ sql`SELECT * FROM users WHERE id = ${userId}`
                    ↓ return user profile JSON
            ↓ updateAuthState() in React context
        ↓ redirect to dashboard if authenticated
```

### **2. Dashboard Loading Flow**
```
User visits /dashboard
    ↓ Dashboard component mounts
        ↓ useEffect() calls loadDashboardData()
            ↓ makeAuthenticatedRequest('GET', '/.netlify/functions/get-dashboard-data')
                ↓ get-dashboard-data.ts handler()
                    ↓ verifyUserAuth() middleware
                        ↓ extract JWT from HTTP-only cookie
                        ↓ jwt.verify() validates token
                        ↓ check token expiration
                    ↓ fetchUserProgress() from database
                        ↓ sql`SELECT level, xp, ... FROM users WHERE id = ${userId}`
                    ↓ calculateCompletionStats()
                        ↓ sql`SELECT COUNT(*) FROM lesson_activity_results WHERE user_id = ${userId}`
                    ↓ fetchRecentActivities()
                        ↓ sql`SELECT * FROM lesson_activity_results WHERE user_id = ${userId} ORDER BY completed_at DESC LIMIT 5`
                    ↓ return dashboard JSON object
                ↓ React state updates with dashboardData
            ↓ render dashboard UI components
```

### **3. Lesson Loading Flow**
```
User clicks lesson link
    ↓ navigate('/lessons/[lessonId]')
        ↓ LessonPage component mounts
            ↓ useEffect() calls loadLesson()
                ↓ makeAuthenticatedRequest('GET', `/functions/get-lesson?id=${lessonId}`)
                    ↓ get-lesson.ts handler()
                        ↓ verifyUserAuth() middleware
                        ↓ fetchLessonData()
                            ↓ sql`SELECT * FROM lessons WHERE id = ${lessonId}`
                        ↓ fetchActivityData()
                            ↓ sql`SELECT * FROM lesson_activities WHERE lesson_id = ${lessonId} ORDER BY activity_order`
                        ↓ loadVocabularyItems() for vocab activities
                            ↓ sql`SELECT * FROM vocabulary_items WHERE activity_id = ${activityId}`
                        ↓ loadGrammarSentences() for grammar activities
                            ↓ sql`SELECT * FROM grammar_sentences WHERE activity_id = ${activityId}`
                        ↓ return complete lesson object with all activities
                    ↓ update lesson state in React
                ↓ render lesson activity components
```

### **4. Lesson Activity Submission Flow**
```
User completes activity → clicks Submit
    ↓ onSubmitActivity(activityData)
        ↓ makeAuthenticatedRequest('POST', '/functions/submit-lesson-activity', activityData)
            ↓ submit-lesson-activity.ts handler()
                ↓ verifyUserAuth() middleware
                ↓ validateActivityData()
                    ↓ sanitizeInput() on all text fields
                    ↓ validate required fields
                ↓ saveUserResponse() to database
                    ↓ sql`INSERT INTO lesson_activity_results (user_id, activity_id, response_data, score, completed_at)`
                ↓ calculateScore() based on activity type
                    ↓ vocab matching: compare word pairs
                    ↓ grammar: check sentence construction
                    ↓ speaking: process AI feedback
                ↓ updateProgress() in database
                    ↓ sql`UPDATE user_progress SET completed_activities = array_append(completed_activities, ${activityId})`
                ↓ checkAchievementUnlock()
                    ↓ query achievements table
                    ↓ check if user meets requirements
                    ↓ sql`INSERT INTO user_achievements (user_id, achievement_id)`
                ↓ awardXP() to user
                    ↓ sql`UPDATE users SET xp = xp + ${earnedXP}`
                ↓ return result object with score, XP, achievements
            ↓ React updates UI with results
        ↓ show success animation and next activity
```

### **5. Evaluation Test Flow**
```
User starts evaluation
    ↓ EvaluationPage component mounts
        ↓ useEffect() loads test data
            ↓ makeAuthenticatedRequest('GET', '/functions/get-evaluation-test?test_id=EVAL-1')
                ↓ get-evaluation-test.ts handler()
                    ↓ query evaluation_test table
                        ↓ sql`SELECT * FROM evaluation_test WHERE id = 'EVAL-1' AND is_active = true`
                    ↓ return questions JSONB data
                ↓ set evaluationTest state with questions
            ↓ render question components based on type
```

### **6. Evaluation Submission Flow**
```
User completes evaluation → clicks Submit
    ↓ handleSubmitEvaluation(evaluationResults)
        ↓ validateAnswers() on frontend
        ↓ makeAuthenticatedRequest('POST', '/functions/submit-evaluation', evaluationResults)
            ↓ submit-evaluation.ts handler()
                ↓ verifyUserAuth() middleware
                ↓ validateAnswers() server-side
                    ↓ sanitize all input data
                ↓ calculateGrammarScore()
                    ↓ loop through vocab/grammar questions
                    ↓ compare answers with correct answers
                    ↓ calculate percentage score
                ↓ processSpeakingFeedback()
                    ↓ extract AI feedback from evaluationResults
                    ↓ validate speaking scores (0-100)
                    ↓ average multiple speaking assessments
                ↓ combineScores() using 70/30 formula
                    ↓ overallScore = (speakingScore * 0.7) + (grammarScore * 0.3)
                ↓ determineCEFRLevel()
                    ↓ calculateCEFRLevel(overallScore) using mapping
                ↓ saveResults() to database
                    ↓ sql`INSERT INTO evaluation_results (user_id, test_id, overall_score, overall_percentage, passed, assessed_level, question_results)`
                ↓ updateUserLevel() if improved
                    ↓ sql`UPDATE users SET level = ${newLevel} WHERE id = ${userId}`
                ↓ return results with level, score, feedback
            ↓ React shows results screen
        ↓ update user dashboard with new level
```

### **7. AI Speaking Feedback Flow**
```
During evaluation, user records speaking
    ↓ submitAudio(audioBlob, prompt)
        ↓ makeAuthenticatedRequest('POST', '/functions/ai-feedback', {audio_blob, prompt})
            ↓ ai-feedback.ts handler()
                ↓ validateRequest() - check audio and prompt
                ↓ callOpenAI_Whisper() for transcription
                    ↓ openai.audio.transcriptions.create()
                    ↓ return text transcription
                ↓ callOpenAI_ChatGPT() for feedback analysis
                    ↓ openai.chat.completions.create() with system prompt
                    ↓ analyze transcription for grammar, vocabulary, fluency
                    ↓ return structured JSON with scores and corrections
                ↓ calculateSpeakingScore() from AI response
                ↓ return feedback object with:
                    ↓ overall_score (0-100)
                    ↓ grammar_corrections array
                    ↓ vocabulary_corrections array
                    ↓ fluency_score, vocabulary_quality
                    ↓ assessed_level (for reference)
            ↓ React updates speaking feedback UI
```

### **8. Admin Content Management Flow**
```
Admin visits /admin/content
    ↓ ContentManagementContent component mounts
        ↓ useEffect() loads all data
            ↓ makeAuthenticatedRequest('GET', '/functions/admin-lessons?type=lessons')
                ↓ admin-lessons.ts handler()
                    ↓ verifyAdminAuth() - check admin role
                    ↓ query lessons table
                        ↓ sql`SELECT * FROM lessons ORDER BY level, lesson_number`
                    ↓ return lessons array
                ↓ set lessons state
            ↓ similar calls for vocabulary, evaluation data
        ↓ render content management UI
```

### **9. Real-time Authentication Flow**
```
Every API call includes credentials
    ↓ fetch(url, { credentials: 'include' })
        ↓ Browser automatically sends HTTP-only cookies
            ↓ Cookie: access_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
        ↓ Netlify function receives cookie
            ↓ verifyUserAuth() extracts token
                ↓ jwt.verify(token, process.env.JWT_SECRET)
                ↓ decode user ID from token payload
                ↓ check token expiration
                ↓ query user permissions if admin
            ↓ proceed with authenticated request
        ↓ return data or 401 if invalid
```

### **10. Database Error Recovery Flow**
```
Database connection fails
    ↓ sql query throws error
        ↓ catch block in Netlify function
            ↓ check error type (connection, timeout, constraint)
            ↓ if connection error:
                ↓ retry query up to 3 times with exponential backoff
                ↓ if still failing, return user-friendly error
            ↓ log error details for monitoring
            ↓ return safe error response to frontend
        ↓ React shows error toast notification
    ↓ user can retry operation or contact support
```

## 📊 ACTUAL EXECUTION PATTERNS

### **Most Frequent Call Chains:**
```
verifyUserAuth() → database query → return user data
calculateScore() → updateProgress() → checkAchievements()
saveToDatabase() → return success/error response
```

### **Error Handling Patterns:**
```
try { database operation } catch { log error, retry, return safe response }
```

### **Security Patterns:**
```
extract JWT → verify signature → check expiration → query user → authorize action
```

### **Data Flow Patterns:**
```
Frontend state → API call → Netlify function → Database operation → JSON response → React update
```

This represents the **actual runtime execution paths** in the live TutorCat application, showing how functions call each other in real browser and server environments.

## 🔧 Backend Layer (Netlify Functions)

### Authentication Functions
```
auth-login.ts
├── validateUserCredentials()
├── generateJWT()
├── setHttpOnlyCookie()
└── returnSuccessResponse()

auth-logout.ts
├── clearSession()
└── expireCookie()

auth-me.ts
├── verifyJWT()
├── fetchUserData()
└── returnUserProfile()
```

### User Management Functions
```
get-dashboard-data.ts
├── verifyUserAuth()
├── fetchUserProgress()
├── calculateCompletionStats()
├── fetchRecentActivities()
└── returnDashboardData()

advance-level.ts
├── verifyUserAuth()
├── validateLevelRequirements()
├── updateUserLevel()
├── unlockNewLessons()
└── recordAchievement()
```

### Lesson Management Functions
```
get-lessons-by-level.ts
├── verifyUserAuth()
├── fetchLessonsByLevel()
├── filterByUserProgress()
├── addCompletionStatus()
└── returnLessonList()

get-lesson.ts
├── verifyUserAuth()
├── fetchLessonData()
├── fetchActivityData()
├── checkUserProgress()
├── loadVocabularyItems()
├── loadGrammarSentences()
└── returnCompleteLesson()

submit-lesson-activity.ts
├── verifyUserAuth()
├── validateActivityData()
├── saveUserResponse()
├── calculateScore()
├── updateProgress()
├── checkAchievementUnlock()
└── returnResult()

finalize-lesson.ts
├── verifyUserAuth()
├── calculateFinalScore()
├── updateLessonCompletion()
├── awardXP()
├── unlockNextLesson()
└── recordCompletion()
```

### Evaluation System Functions
```
get-evaluation-test.ts
├── validateTestId()
├── queryEvaluationTest()
├── checkTestActive()
├── returnTestData()
└── handleErrors()

submit-evaluation.ts
├── verifyUserAuth()
├── validateAnswers()
├── calculateGrammarScore()
├── processSpeakingFeedback()
├── combineScores(70% speaking + 30% grammar)
├── determineCEFRLevel()
├── saveResults()
├── updateUserLevel()
└── returnResults()

submit-evaluation-test.ts
├── verifyUserAuth()
├── validateTestSubmission()
├── calculateTestScore()
├── saveTestResults()
└── returnConfirmation()
```

### AI Integration Functions
```
ai-feedback.ts
├── validateRequest()
├── extractTranscription()
├── callOpenAI_API()
├── processFeedbackResponse()
├── calculateSpeakingScore()
├── returnStructuredFeedback()
└── handleAPIErrors()

ai-speech-to-text.ts
├── validateAudioInput()
├── callOpenAI_Whisper()
├── processTranscription()
├── returnTextResult()
└── handleTranscriptionErrors()
```

### Admin Functions
```
admin-lessons.ts
├── verifyAdminAuth()
├── CRUD Operations:
│   ├── createLesson()
│   ├── updateLesson()
│   ├── deleteLesson()
│   ├── createActivity()
│   ├── updateActivity()
│   └── deleteActivity()
├── validateLessonData()
├── saveToDatabase()
└── returnSuccessResponse()

admin-evaluation.ts
├── verifyAdminAuth()
├── manageEvaluationTests()
├── updateTestQuestions()
├── modifyScoringRules()
└── publishTestChanges()

admin-users.ts
├── verifyAdminAuth()
├── listAllUsers()
├── viewUserProgress()
├── resetUserPassword()
├── revokeUserSession()
└── updateUserPermissions()
```

## 🗄️ Database Layer (PostgreSQL + Neon)

### Core Tables & Relationships
```
users (Main user table)
├── id (UUID, Primary Key)
├── username, email, password_hash
├── level, xp, created_at
└── Relationships:
    ├── 1:N with user_sessions
    ├── 1:N with user_achievements
    ├── 1:N with lesson_activity_results
    └── 1:N with evaluation_results

lessons (Lesson definitions)
├── id, level, topic, lesson_number
├── title, description, is_draft
└── Relationships:
    └── 1:N with lesson_activities

lesson_activities (Activity definitions)
├── id, lesson_id, activity_type, activity_order
├── title, description, content (JSONB)
└── Relationships:
    ├── N:1 with lessons
    ├── 1:N with lesson_activity_results
    └── 1:N with vocabulary_items/grammar_sentences

vocabulary_items (Vocabulary data)
├── id, activity_id, english_word, thai_translation
└── audio_url, created_at

grammar_sentences (Grammar exercise data)
├── id, activity_id, original_sentence, correct_sentence
└── words_array (JSONB), created_at

evaluation_test (Test definitions)
├── id, test_name, test_type, passing_score
├── allowed_time, is_active, questions (JSONB)
└── Relationships:
    └── 1:N with evaluation_results

evaluation_results (Test results)
├── id, user_id, test_id, overall_score
├── overall_percentage, passed, time_spent
├── question_results (JSONB), assessed_level
└── completed_at

achievements (Achievement definitions)
├── id, code, name, description, icon
├── category, requirement_type, points
└── Relationships:
    └── 1:N with user_achievements

user_achievements (Earned achievements)
├── id, user_id, achievement_id, earned_at
└── Unique constraint on (user_id, achievement_id)

user_sessions (Session management)
├── id, user_id, session_token, expires_at
└── created_at
```

### Database Functions & Queries
```
calculate_user_completion_percentage()
├── Input: user_uuid
├── Query: User progress calculations
├── Return: completion percentage
└── Used by: Dashboard data aggregation

validate_lesson_access()
├── Input: user_id, lesson_id
├── Query: Check prerequisites met
├── Return: access granted/denied
└── Used by: Lesson loading logic

update_user_xp()
├── Input: user_id, xp_amount
├── Query: Increment user XP
├── Check: Level up conditions
├── Return: new level status
└── Used by: Activity completion handlers
```

## 🔄 Complete Data Flow Example

### User Takes Lesson Activity:
```
1. Frontend: submitLessonActivity(activityData)
2. API: POST /.netlify/functions/submit-lesson-activity
3. Netlify: validateUserAuth() → validateActivityData()
4. Database: INSERT INTO lesson_activity_results
5. Netlify: calculateScore() → updateProgress()
6. Database: UPDATE user_progress → checkAchievementUnlock()
7. Netlify: returnResult() with score and achievements
8. Frontend: updateUI() → showResults()
```

### User Takes Evaluation Test:
```
1. Frontend: submitEvaluation(evaluationData)
2. API: POST /.netlify/functions/submit-evaluation
3. Netlify: validateUserAuth() → validateAnswers()
4. AI Processing: call ai-feedback.ts for speaking assessment
5. Scoring: calculateGrammarScore() + speakingScore()
6. Formula: (speaking × 0.7) + (grammar × 0.3)
7. CEFR Level: calculateCEFRLevel(overallPercentage)
8. Database: INSERT INTO evaluation_results
9. Netlify: updateUserLevel() → returnResults()
10. Frontend: showResults() → updateUserDashboard()
```

## 📊 Function Complexity Analysis

### Most Complex Functions:
- `ai-feedback.ts`: Multi-step AI processing, error handling, scoring
- `submit-evaluation.ts`: Complex scoring logic, AI integration, level calculation
- `admin-lessons.ts`: Multiple CRUD operations, data validation, relationships

### Most Called Functions:
- `verifyUserAuth()`: Used in nearly every protected endpoint
- `calculateScore()`: Used in multiple activity and evaluation functions
- `saveToDatabase()`: Core data persistence across all write operations

### Critical Path Functions:
- `submit-evaluation.ts`: Handles final level assessment
- `ai-feedback.ts`: Processes speaking evaluation (most complex AI interaction)
- `get-dashboard-data.ts`: Loads user progress (frequently called)

This architecture ensures clean separation of concerns, secure authentication, and scalable data management across the entire TutorCat platform.
