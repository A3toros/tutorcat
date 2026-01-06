# AI Language Learning Web App "Tutor Cat"

**Development of an Interactive English Learning Application with Gamification and AI Feedback**

**Submitted by:**
Mattcha Srirojwong
Arnon Dangmukda
Jaroenjit Anatamsombat
Nichapath Chunlawithet

**Project Adviser:**
Aleksandr Petrov
Mathayomwatsing School

**MATHAYOMWATSING SCHOOL**

**This report is part of the school computer science project, presented for English Medium Instruction Programmes Open House Academic Year 2026**

**Zone A**

**Project Website: tutorcat.online**

---

**PREFACE**

This is our project about developing TutorCat, an English language learning platform that combines artificial intelligence with gamification elements and modern web technologies. We focused on creating an engaging experience for students through personalized feedback, achievement systems, and intuitive user interfaces. Our platform addresses the challenges of traditional English instruction by providing immediate AI-powered feedback on speaking, interactive exercises, and progress tracking that encourages continued learning.

Even though we used some pretty advanced tech, we made sure it connects real teaching ideas with practical coding, making English learning way more fun and accessible for students. Building it was all about balancing what feels good to use with solid tech behind the scenes and making sure it actually helps students learn.

---

**ACKNOWLEDGEMENT**

We sincerely thank everyone who has supported us throughout the development of this computer science project. Your encouragement and contributions have been invaluable in shaping our work and helping us navigate challenges along the way.

Our deepest appreciation goes to our mentor, Aleksandr Petrov, for his guidance, patience, and expertise in both educational technology and software development. His constructive feedback and encouragement have been crucial in refining our ideas and ensuring the success of this project.

We are also grateful to the Mathayomwatsing School English Program for providing us with the necessary resources and a supportive learning environment, which made this development possible.

A special thanks goes to our school administration for approving this project and providing ongoing support throughout its development. Their confidence in our abilities gave us the foundation we needed, and we are truly grateful for the opportunity they provided us to create an innovative learning platform.

We also sincerely express our gratitude to our friends, who cheered us on and made the whole coding adventure way more fun. We're super thankful to everyone who helped make TutorCat happen - this project wouldn't have been the same without all the support and good vibes along the way.

With sincere thanks,  
The Development Team

---

**ABSTRACT**

This study presents the development and implementation of TutorCat (tutorcat.online), an AI-powered English language learning platform designed to enhance student engagement and learning outcomes through interactive exercises, gamification, and personalized feedback. Modern language learning applications often lack the combination of comprehensive feedback mechanisms and engaging user experiences that motivate sustained learning.

The platform integrates multiple technologies including React/Next.js for the frontend, PostgreSQL for data persistence, Netlify for hosting, and AI services for speech recognition and feedback generation. The core innovation lies in the combination of interactive drag-and-drop exercises using Konva.js, AI-powered speaking assessments, and a comprehensive achievement system that tracks student progress across multiple learning dimensions.

The development followed a user-centered approach, beginning with requirements gathering from students and teachers, followed by iterative prototyping and testing. Key features include vocabulary matching games, grammar exercises, speaking practice with AI feedback, and a leveling system that adapts to student performance.

Results demonstrate successful implementation of all planned features with positive user feedback during testing phases. The platform achieved sub-200ms response times for most interactions and successfully integrated multiple external APIs for enhanced functionality. Error analysis showed robust handling of edge cases with comprehensive input validation and security measures.

The study concludes that combining gamification, AI feedback, and interactive learning experiences creates an effective language learning environment. Future recommendations include expansion to additional languages, mobile application development, and integration with learning management systems.

---

**EXECUTIVE SUMMARY**

TutorCat represents a successful implementation of modern web technologies applied to educational challenges. This 2-month student-led project developed a comprehensive English language learning platform that combines artificial intelligence, gamification, and interactive learning experiences. The platform serves Mathayomwatsing School students with AI-powered speaking feedback, drag-and-drop vocabulary games, grammar exercises, and progress tracking through CEFR-aligned levels. Built using Next.js, React, TypeScript, and PostgreSQL, the platform demonstrates how student developers can create production-ready educational software that enhances learning outcomes through technology. The project successfully integrated external AI services, implemented secure authentication, and delivered a responsive, engaging user experience currently used by school students.

**LIST OF FIGURES**
- Figure 1: System Architecture Diagram
- Figure 2: User Flow Diagram
- Figure 3: Database Schema Overview
- Figure 4: Technology Stack Visualization

**LIST OF TABLES**
- Table 1: Technology Stack Comparison
- Table 2: CEFR Level Mapping
- Table 3: Lesson Activity Types
- Table 4: Achievement System Overview

**GLOSSARY**

**API (Application Programming Interface)**: A set of protocols and tools for building software applications, enabling different systems to communicate.

**Backend**: The server-side of a web application that handles data processing, business logic, and database operations.

**CDN (Content Delivery Network)**: A distributed network of servers that deliver web content faster by serving it from locations closer to users.

**CEFR (Common European Framework of Reference)**: An international standard for describing language ability, used to assess English proficiency levels from A1 (beginner) to C2 (proficient).

**Frontend**: The user-facing part of a web application that users interact with through their browsers.

**Gamification**: The application of game-design elements and principles in non-game contexts to make activities more engaging.

**IDE (Integrated Development Environment)**: Software that provides comprehensive tools for writing, testing, and debugging code.

**JWT (JSON Web Token)**: A compact, URL-safe means of representing claims to be transferred between two parties, commonly used for secure authentication.

**MVC (Model-View-Controller)**: A software design pattern that separates an application into three interconnected components.

**RESTful API**: An architectural style for designing networked applications using HTTP methods.

**SSR (Server-Side Rendering)**: A technique where web pages are generated on the server before being sent to the browser.

**UI (User Interface)**: The visual elements and controls that users interact with in an application.

**UX (User Experience)**: The overall experience a user has when interacting with a product or system.

**TABLE OF CONTENTS**

Executive Summary
List of Figures
List of Tables
Glossary
Preface
Acknowledgement
Abstract
Table of Contents

Chapter 1 Introduction
Background of the Study
Objectives
Significance of the Study
Scope and Limitation
Definition of Terms

Chapter 2 Review of Related Literature
Technology Stack Overview
Related Educational Platforms
AI in Language Learning

Chapter 3 Methodology
Development Process
Technology Selection
Project Timeline
Budget and Resources

Chapter 4 Implementation & Development
Implementation Strategy

Chapter 5 Results and Discussion
Features Implementation
Testing Methodology
User Testing and Feedback
Performance Analysis
Challenges and Solutions

Chapter 6 Conclusions and Recommendations
Summary of Achievements
Lessons Learned
Project Limitations
Future Development Plans
Future Research Directions
References
Appendix A: Screenshots
Index

---

**Chapter 1 Introduction**

**Background of the Study**

Language learning applications have evolved significantly with the integration of artificial intelligence and gamification techniques. Traditional language learning methods often rely on repetitive exercises and delayed feedback, which can be demotivating for students. TutorCat addresses these challenges by providing an interactive platform that combines immediate AI-powered feedback, engaging game-like elements, and comprehensive progress tracking.

The project was developed by high school students at Mathayomwatsing School who volunteered their time and effort to create this innovative learning platform. The development process involved understanding both technical implementation and effective teaching methods to create a platform that serves real learning needs while maintaining high technical standards.

**Objectives**

The primary objectives of this study include:

1. Developing an interactive English language learning platform with AI-powered feedback
2. Implementing gamification elements to increase student engagement and motivation
3. Creating a scalable web application using modern development technologies
4. Integrating multiple external APIs for enhanced functionality
5. Ensuring comprehensive security measures and data protection

**Significance of the Study**

This project demonstrates the practical application of computer science principles in educational technology. By combining modern web development techniques with AI integration, the platform serves as a model for future educational applications. The significance lies in:

- Providing accessible language learning tools for students
- Demonstrating the integration of multiple technologies in a cohesive application
- Contributing to the field of educational technology through practical implementation
- Serving as a learning experience for the development team

**Scope and Limitation**

This study focuses on the development of a web-based English language learning platform with core features including vocabulary exercises, grammar practice, speaking assessments, and progress tracking. The scope includes frontend development, backend API creation, database design, and integration with external AI services.

Limitations include:
- Focus on English language learning only
- Web-based implementation (no mobile applications)
- Limited to core learning activities (vocabulary, grammar, speaking)
- Testing conducted with school students only

**Definition of Terms**

**Frontend**: The user-facing part of a web application that users interact with directly in their browsers, including the user interface and user experience

**Backend**: The server-side part of a web application that handles data processing, business logic, and database operations behind the scenes

**PostgreSQL**: An advanced open-source relational database management system known for its reliability, feature robustness, and performance

**Hashing**: A security process that converts passwords into encrypted strings using algorithms like bcrypt, making them unreadable while allowing verification

**IDE (Integrated Development Environment)**: Software that provides comprehensive tools for writing, testing, and debugging code, such as syntax highlighting and error detection

**UI (User Interface)**: The visual elements and controls that users interact with in an application, including buttons, forms, and navigation menus

**SSR (Server-Side Rendering)**: A technique where web pages are generated on the server before being sent to the browser, improving performance and SEO

**API (Application Programming Interface)**: A set of rules and protocols that allows different software applications to communicate with each other

**JWT (JSON Web Token)**: A compact, URL-safe means of representing claims to be transferred between two parties, commonly used for authentication

**CDN (Content Delivery Network)**: A network of servers distributed globally to deliver web content faster by serving it from locations closer to users

---

**Chapter 2 Review of Related Literature**

**Technology Stack Overview**

Modern web development relies on a combination of frontend frameworks, backend services, and database technologies. React.js has become the standard for building interactive user interfaces, offering component-based architecture and efficient rendering. Next.js extends React with server-side rendering and static site generation capabilities.

For interactive graphics and animations, libraries like Konva.js provide powerful canvas manipulation tools. These technologies enable the creation of drag-and-drop interfaces and visual feedback systems essential for language learning applications.

**Related Educational Platforms**

Several educational platforms have influenced the development of TutorCat:

Duolingo popularized gamified language learning through bite-sized lessons and streak tracking. Babbel focused on conversation practice with native speaker audio. Rosetta Stone emphasized immersive learning through images and audio.

TutorCat differentiates itself by combining AI-powered speaking assessment with interactive grammar exercises and comprehensive progress tracking. The platform integrates multiple learning modalities in a single cohesive experience.

**AI in Language Learning**

Recent advances in artificial intelligence have transformed language education. Speech recognition technologies like AssemblyAI enable accurate pronunciation assessment. Large language models provide contextual feedback and error correction.

The integration of AI allows for personalized learning experiences that adapt to individual student needs and provide immediate, detailed feedback that would be impossible for human teachers to deliver at scale.

---

**Chapter 3 Methodology**

**Development Process**

The development followed a flexible approach with regular planning, building, and testing cycles. Initial requirements gathering involved surveys with students and teachers to understand learning needs and preferences.

We created simple sketches and working models before building the full app, to coordinate our teamwork effectively. We also developed a comprehensive system architecture diagram mapping function dependencies, API endpoints, and data flow relationships to ensure proper integration between frontend and backend components. The team divided responsibilities based on individual strengths: frontend development, backend architecture, UI/UX design, and quality assurance.

**Technology Selection**

**Project Timeline**

The TutorCat development project was completed over 8 weeks (2 months) with the following milestones:

- **Week 1-2: Planning & Design**
  - Requirements gathering and user interviews
  - Wireframing and system architecture design
  - Technology stack selection and prototyping

- **Week 3-4: Foundation Development**
  - Next.js application setup with TypeScript
  - PostgreSQL database design and Neon deployment
  - JWT authentication system implementation
  - Basic routing and component structure

- **Week 5-6: Core Feature Implementation**
  - Lesson activity system development
  - Drag-and-drop interactions with Konva.js
  - Progress tracking and localStorage integration
  - Achievement system and XP mechanics

- **Week 7: AI Integration & Polish**
  - OpenAI API integration for speaking feedback
  - UI/UX improvements with Framer Motion animations
  - Internationalization (Thai/English) setup
  - Comprehensive testing and bug fixes

- **Week 8: Deployment & Launch**
  - Netlify deployment and domain configuration
  - Final security testing and performance optimization
  - User acceptance testing with school students
  - Project documentation and presentation preparation

**Budget and Resources**

The project was developed using free and open-source resources:

- **Development Tools**: Visual Studio Code (free), Git/GitHub (free tier)
- **Cloud Services**: Netlify (free tier), Neon PostgreSQL (free tier), OpenAI API (pay-as-you-go)
- **Design Assets**: Adobe Illustrator (student license), Adobe After Effects (student license)
- **Domain**: Namecheap domain registration ($12/year)
- **Team Resources**: 4 student developers working part-time over 8 weeks

Total estimated cost: Under $50 (primarily domain registration), making this an extremely cost-effective educational technology solution.

---

**Chapter 4 Implementation & Development**

**Implementation Strategy**

Technology choices were made based on project requirements, team expertise, and careful evaluation of alternatives. Each decision involved weighing the benefits and trade-offs of different approaches.

**Frontend Framework: React with TypeScript vs. Plain React**

We evaluated both plain React and React with TypeScript for our frontend development. While plain React offers faster initial setup and more flexibility, we ultimately chose React with TypeScript for several important reasons:

- **Type Safety**: TypeScript catches errors during development rather than runtime, reducing bugs in our language learning application where accuracy is crucial
- **Better IDE Support**: Enhanced autocomplete and error detection made development faster and more reliable
- **Maintainability**: As our application grew in complexity with multiple exercise types and user states, TypeScript's type definitions made the code much easier to maintain and refactor
- **Team Learning**: The project served as an opportunity for our team to learn TypeScript, which is increasingly important in modern web development

**Build Tool: Next.js vs. Vite**

We considered both Next.js and Vite as our React build tools. Vite offers extremely fast development server startup and hot module replacement, while Next.js provides a more comprehensive framework. We chose Next.js because:

- **Server-Side Rendering (SSR)**: Essential for SEO and performance in an educational platform that needs to be discoverable by search engines
- **Built-in Routing**: Automatic file-based routing reduced configuration overhead and development time
- **API Routes**: Built-in API functionality eliminated the need for a separate backend server, simplifying our architecture
- **Production Optimizations**: Automatic code splitting, image optimization, and performance features that Vite would require manual configuration for
- **Educational Context**: Next.js's comprehensive documentation and community support were valuable for a student development team

**Complete Technology Stack**

Our final technology choices were:

- **Frontend**: React with TypeScript and Next.js for component-based development, type safety, and SSR
- **Styling**: Tailwind CSS for rapid UI development and responsive design
- **Graphics**: Konva.js for interactive drag-and-drop exercises (chosen over HTML5 Canvas for better React integration)
- **Animations**: Framer Motion for smooth page transitions and interactive elements, Lottie React for the animated mascot
- **Icons**: Lucide React for consistent, modern iconography throughout the application
- **Internationalization**: i18next for Thai and English language support and user interface localization
- **Security**: bcryptjs for secure password hashing and user authentication
- **Backend**: Netlify Functions for serverless API endpoints (simpler than managing our own servers)
- **Database**: PostgreSQL for reliable data persistence and scalability
- **AI Services**: AssemblyAI for speech recognition, OpenAI for feedback generation
- **Hosting**: Netlify for global content delivery and seamless deployment integration

**Development Tools & Applications:**
- **Code Editor**: Visual Studio Code with GitHub Copilot and Kilo Code extensions for AI-assisted coding
- **Design Tools**: Adobe Illustrator for mascot design and web graphics, Adobe After Effects for mascot animations
- **Version Control**: Git and GitHub for code collaboration and version management
- **Database Tools**: pgAdmin for database management and query testing
- **API Testing**: Postman for testing backend API endpoints
- **Browser DevTools**: Chrome Developer Tools for debugging and performance monitoring

**Implementation Strategy**

Development proceeded in systematic phases to ensure proper project management and quality:

1. **Foundation Phase**: Established the project infrastructure by setting up the Next.js application with TypeScript, configuring the PostgreSQL database with Neon, implementing JWT-based authentication with bcryptjs password hashing, and creating the basic routing structure with public and protected routes.

2. **Core Features Phase**: Developed the main learning functionality including lesson content management, multiple exercise types (vocabulary matching, grammar drag-and-drop, speaking prompts), user progress tracking with localStorage for lesson continuity, and the basic user dashboard interface.

3. **AI Integration Phase**: Integrated external AI services by connecting OpenAI Whisper for speech transcription and GPT-4 for comprehensive speaking assessment including pronunciation, grammar, vocabulary, fluency, and CEFR level evaluation, and creating the backend API endpoints in Netlify Functions to handle AI processing securely.

4. **Gamification Phase**: Built the engagement features including the XP point system, achievement badges and unlocks, CEFR level progression logic, and user statistics tracking to make learning more motivating and competitive.

5. **Polish Phase**: Focused on user experience improvements with Framer Motion animations, Tailwind CSS responsive design optimization, comprehensive error handling and security testing, performance monitoring, and final UI/UX refinements across all devices.

---

**Chapter 5 Results and Discussion**

**Features Implementation**

All planned features were successfully implemented:

- Interactive vocabulary matching using Konva.js drag-and-drop
- Grammar exercises with multiple question types
- AI-powered speaking assessments with detailed feedback
- Comprehensive achievement and leveling system
- Secure authentication with role-based access control
- Public and protected route management ensuring proper access control

**Testing Methodology**

A comprehensive testing approach was implemented to ensure platform quality:

**Unit Testing:**
- Component testing using React Testing Library
- API endpoint testing with Jest
- Database function testing with PostgreSQL queries

**Integration Testing:**
- End-to-end user flows (registration → lesson completion → progress tracking)
- API integration testing (OpenAI, database operations)
- Cross-browser compatibility testing (Chrome, Firefox, Safari)

**User Acceptance Testing:**
- Conducted with 20 Mathayomwatsing School students
- Feedback collected on usability, engagement, and learning effectiveness
- Performance testing on various devices (desktop, tablet, mobile)

**Security Testing:**
- Authentication flow testing
- Input validation and sanitization verification
- Session management and token expiration testing
- OWASP security guideline compliance checks

**Performance Testing:**
- Load time analysis (< 200ms target for most interactions)
- Memory usage monitoring
- Database query optimization
- CDN effectiveness verification

**User Testing and Feedback**

Initial testing with school students revealed positive engagement metrics. Users particularly appreciated the AI feedback for speaking exercises and the gamification elements that made learning feel rewarding. Some suggestions included additional exercise variety and mobile responsiveness improvements.

**Performance Analysis**

The application achieved excellent performance metrics:
- Sub-200ms response times for most interactions
- Successful integration with all external APIs
- Efficient localStorage management for lesson progress
- Robust error handling and security measures

**Security Measures & Injection Prevention**

TutorCat implements comprehensive security measures to protect against SQL injection, JavaScript/XSS injection, and other common web vulnerabilities:

**SQL Injection Prevention:**
- **Parameterized Queries**: All database operations use Neon's parameterized query system with `$` placeholders (e.g., `WHERE id = ${userId}`)
- **Type Casting**: Explicit data type casting (e.g., `${activityId}::uuid`) prevents type-based injection attacks
- **Environment Validation**: Database URLs and secrets are validated before use

**JavaScript/XSS Injection Prevention:**
- **Input Sanitization**: Multi-layer sanitization removes control characters, normalizes Unicode, and collapses excessive whitespace
- **HTML Escaping**: User content is HTML-escaped before rendering to prevent script injection
- **Regex Validation**: Frontend validation with strict patterns for emails, names, and usernames
- **Content Filtering**: HTML tag stripping and character allowlists prevent malicious input

**Authentication & Session Security:**
- **JWT Tokens**: Secure token-based authentication with 1-day expiration for users, 8 hours for admins
- **HTTP-Only Cookies**: Tokens stored in HTTP-only cookies, preventing JavaScript access
- **Password Hashing**: bcryptjs with salt rounds for secure credential storage
- **Session Revocation**: Admin panel allows immediate logout of compromised accounts

**Network & Infrastructure Security:**
- **CORS Configuration**: Proper cross-origin headers with credential support
- **Cloudflare WAF**: Web Application Firewall blocks malicious requests and DDoS attacks
- **CDN Protection**: Global content delivery with built-in security features

**Data Validation & Error Handling:**
- **Multi-Layer Validation**: Frontend regex patterns, backend sanitization, and database constraints
- **Secure Error Messages**: Generic error responses prevent information leakage
- **Input Length Limits**: Maximum length restrictions prevent buffer overflow attacks

**Challenges and Solutions**

Several significant technical challenges were encountered during development, each requiring innovative solutions:

**Complex Drag-and-Drop Interactions Challenge:**
The vocabulary matching games required smooth, intuitive drag-and-drop functionality where users could drag words to match with definitions. Common issues included words "sticking" during drag operations, inaccurate drop detection, and poor performance on mobile devices. We overcame this by implementing Konva.js with optimized event handlers that track touch/mouse coordinates precisely, include collision detection algorithms for accurate drop zones, and use hardware acceleration for smooth 60fps animations across all devices.

**AI API Integration Challenge:**
Integrating OpenAI's Whisper and GPT-4 APIs presented reliability and error handling challenges. Common issues included API rate limits causing user experience interruptions, inconsistent response times affecting lesson flow, and occasional API failures that could break the speaking assessment feature. We solved this with a robust error handling system including automatic retry mechanisms, fallback responses for failed requests, loading states to manage user expectations, and API response caching to reduce redundant calls and improve performance.

**Data Persistence Challenge:**
Managing user progress across lesson activities became complex when users frequently switched between devices or experienced browser crashes. The localStorage had size limitations, and data synchronization between local storage and the database was problematic. We implemented a hybrid persistence system where critical progress data is stored in localStorage for immediate access and responsiveness, with automatic background synchronization to the database. A cleanup mechanism removes completed lesson data after 30 days to prevent storage overflow, while ensuring no active progress is ever lost.

**Security Implementation Challenge:**
Implementing secure user authentication and session management required careful handling of JWT tokens, password hashing, and session expiration. Common vulnerabilities included token exposure risks, insecure password storage, and session fixation attacks. We addressed these by implementing bcryptjs for secure password hashing with salt rounds, HTTP-only cookies for JWT token storage, automatic token refresh mechanisms, and a session revocation system in the admin panel for compromised accounts. Regular security audits and OWASP guideline compliance ensured robust protection.

---

**Chapter 6 Conclusions and Recommendations**

**Summary of Achievements**

The TutorCat platform successfully demonstrates the integration of modern web technologies with effective teaching approaches. All major objectives were met, including AI-powered feedback, gamification, and comprehensive learning tracking. The platform is currently being used by students at Mathayomwatsing School, providing them with an engaging and effective way to practice English language skills. This real-world implementation validates the platform's effectiveness and serves as a foundation for broader educational impact.

**Future Development Plans**

Future enhancements could include:
- Mobile application development for iOS and Android using React Native, which would allow us to build both platforms with minimal code changes since our existing React components can be easily adapted
- Additional language support beyond English
- Integration with learning management systems
- Advanced analytics for teacher dashboards

The project serves as a foundation for continued development in educational technology, demonstrating the potential of combining AI, gamification, and interactive learning experiences.

**Lessons Learned**

Throughout the development process, our team learned valuable skills beyond just coding. We learned how to work effectively in a developer team, coordinating our actions through regular meetings and clear communication. We discovered the importance of dividing tasks based on each person's strengths and regularly checking in to ensure everyone was aligned. Version control with Git taught us how to collaborate on code without conflicts, and using project management tools helped us stay organized and meet our deadlines. This experience showed us that successful software development requires not just technical skills, but also teamwork, communication, and project management abilities.

**Project Limitations**

While TutorCat represents a successful educational technology implementation, several limitations should be acknowledged:

- **Language Scope**: Currently limited to English language instruction only
- **Platform Availability**: Web-based only, with no native mobile applications
- **Content Depth**: Limited to core language skills (vocabulary, grammar, speaking, reading)
- **AI Accuracy**: Speaking assessment accuracy depends on audio quality and clear pronunciation
- **Scalability**: Designed for school-level deployment rather than massive commercial scale
- **Offline Capability**: Requires internet connectivity for AI-powered features
- **Testing Scope**: User testing conducted only with Mathayomwatsing School students

**Future Research Directions**

Building on this foundation, future research could explore:

- **Cross-Platform Development**: Native iOS and Android applications using React Native
- **Multi-Language Support**: Expansion to other languages beyond English
- **Advanced AI Features**: Integration of additional AI capabilities for grammar correction and vocabulary suggestions
- **Learning Analytics**: More sophisticated data analysis for personalized learning paths
- **Teacher Tools**: Enhanced administrative features for classroom management
- **Offline Learning**: Development of offline-capable features for areas with limited connectivity

---

**References**

**Technology Documentation and Libraries**
1. React Documentation. (2024). *React Official Website*, https://reactjs.org/docs/
2. Next.js Documentation. (2024). *Next.js Official Website*, https://nextjs.org/docs/
3. Konva.js Documentation. (2024). *Konva.js Official Website*, https://konvajs.org/docs/
4. Tailwind CSS Documentation. (2024). *Tailwind CSS Official Website*, https://tailwindcss.com/docs/
5. Framer Motion Documentation. (2024). *Framer Motion Official Website*, https://www.framer.com/motion/
6. AssemblyAI Documentation. (2024). *AssemblyAI Developer Portal*, https://docs.assemblyai.com/
7. OpenAI API Reference. (2024). *OpenAI Platform*, https://platform.openai.com/docs/
8. Resend Documentation. (2024). *Resend Developer Documentation*, https://resend.com/docs/
9. Neon Documentation. (2024). *Neon Serverless Postgres*, https://neon.tech/docs/
10. Netlify Documentation. (2024). *Netlify Developer Documentation*, https://docs.netlify.com/

**Academic Research and Educational Technology**
11. Hamari, J., Koivisto, J., & Sarsa, H. (2014). Does gamification work? A literature review of empirical studies on gamification. *Proceedings of the 47th Hawaii International Conference on System Sciences*, 3025-3034.

12. Zichermann, G., & Cunningham, C. (2011). *Gamification by Design: Implementing Game Mechanics in Web and Mobile Apps*. O'Reilly Media.

13. Prensky, M. (2001). Digital natives, digital immigrants. *On the Horizon*, 9(5), 1-6.

14. Warschauer, M., & Healey, D. (1998). Computers and language learning: An overview. *Language Teaching*, 31(2), 57-71.

15. Liu, M., Moore, Z., Graham, L., & Lee, S. (2002). A look at the research on computer-based technology use in second language learning: A review of the literature from 1990-2000. *Journal of Research on Technology in Education*, 34(3), 250-273.

**AI and Language Learning Research**
16. Godwin-Jones, R. (2017). Smartphones and language learning. *Language Learning & Technology*, 21(2), 3-17.

17. Chapelle, C. A. (2001). *Computer Applications in Second Language Acquisition: Foundations for Teaching, Testing, and Research*. Cambridge University Press.

18. Levy, M. (1997). *Computer-Assisted Language Learning: Context and Conceptualization*. Oxford University Press.

19. Artificial Intelligence for Language Learning. (2023). *EDUCAUSE Review*, https://er.educause.edu/articles/2023/3/artificial-intelligence-for-language-learning

**Web Development and Security**
20. Richards, M. (2015). Single page applications in depth. *Smashing Magazine*, https://www.smashingmagazine.com/2015/01/single-page-apps-depth/

21. Fielding, R. T. (2000). Architectural styles and the design of network-based software architectures. Doctoral dissertation, University of California, Irvine.

22. Stuttard, D., & Pinto, M. (2011). *The Web Application Hacker's Handbook: Finding and Exploiting Security Flaws*. Wiley.

23. OWASP Foundation. (2023). *OWASP Top Ten Web Application Security Risks*, https://owasp.org/www-project-top-ten/

**Database and Backend Architecture**
24. PostgreSQL Documentation. (2024). *PostgreSQL Official Documentation*, https://www.postgresql.org/docs/

25. Richards, M. (2023). *Fundamentals of Software Architecture: An Engineering Approach*. O'Reilly Media.

26. Richardson, L., & Ruby, S. (2022). *Microservices Patterns: With examples in Java*. Manning Publications.

**Educational Psychology and Learning Theory**
27. Vygotsky, L. S. (1978). *Mind in Society: The Development of Higher Psychological Processes*. Harvard University Press.

28. Bandura, A. (1986). *Social Foundations of Thought and Action: A Social Cognitive Theory*. Prentice Hall.

29. Krashen, S. D. (1982). Principles and practice in second language acquisition. *Pergamon Press*.

**Open Source and Community Resources**
30. MDN Web Docs. (2024). *Mozilla Developer Network*, https://developer.mozilla.org/

31. Stack Overflow Community. (2024). *Stack Overflow*, https://stackoverflow.com/

32. GitHub Documentation. (2024). *GitHub Docs*, https://docs.github.com/

**Project Management and Development Methodology**
33. Beck, K., et al. (2001). *Manifesto for Agile Software Development*, https://agilemanifesto.org/

34. Schwaber, K., & Sutherland, J. (2017). *The Scrum Guide*. Scrum.org.

35. Pressman, R. S. (2014). *Software Engineering: A Practitioner's Approach*. McGraw-Hill Education.

---

**Appendix A: Screenshots**

*Note: Screenshots of the TutorCat application interface, user dashboard, lesson activities, admin panel, and evaluation tests are included in the physical project presentation binder. Digital versions are available upon request.*

---

**Index**

Achievement System, 15  
AI Feedback, 8  
Application Interface Screenshots, A-1  
AssemblyAI, 12  
Authentication, 18  
Backend Architecture, 22  
Database Design, 23  
Drag-and-Drop Exercises, 14  
Evaluation Tests Screenshots, A-3  
Frontend Development, 20  
Gamification, 16  
JWT Authentication, 19  
Konva.js, 13  
Lesson Activities Screenshots, A-2  
Lesson Progress, 17  
Leveling System, 15  
LocalStorage, 17  
Netlify Functions, 21  
PostgreSQL, 23  
React/Next.js, 20  
Security Features, 18  
Speaking Assessment, 14  
Tailwind CSS, 20  
User Dashboard Screenshots, A-1  
User Testing, 26

## Page 2: How We Started - The Brainstorming Sessions

We had brainstorming sessions dedicated to what can be useful for students of our school. We got together as a team and talked about the problems students face when learning English. Our teacher Aleksandr helped us understand what makes language learning effective - things like practice, repetition, and getting feedback right away.

We realized that most English classes are boring with just textbooks and worksheets. Students wanted something more interactive that feels like a game. That's when we came up with TutorCat - an app that gives personal AI feedback and has achievements to keep students motivated.

We decided to focus on junior high students because they're at the perfect age for language learning and they love apps with cute characters. We wanted to make learning feel fun and rewarding, not like homework.

## Page 3: Choosing Our Tech Stack

Now let's talk about the tools we used to build TutorCat. We had to pick things that were reliable, fast, and could handle lots of users. Here's what we chose and why:

### Frontend (What Users See)
- **React & Next.js** - These make building websites super smooth. React lets us create reusable components (like buttons and forms), and Next.js handles all the routing and makes the site fast
- **TypeScript** - This is like JavaScript but with extra safety. It catches mistakes before they become bugs
- **Tailwind CSS** - For making everything look pretty and responsive on phones and computers
- **Framer Motion** - Adds smooth animations so the app feels alive and fun

### Why These Libraries?

- **Konva.js** - We use this for word dragging games. When students have to match words with definitions, Konva makes it feel like a real drag-and-drop game, not just clicking buttons
- **HTML Drag for Grammar** - For simpler drag exercises (like filling in one missing word), we use basic HTML drag because it's faster and doesn't need extra libraries

### Backend (The Brain Behind It)
- **Netlify Functions** - Our server code runs here. It's great because we don't have to manage servers ourselves
- **PostgreSQL on Neon** - Our database that stores all user data, lessons, and progress
- **JWT Tokens** - For keeping users logged in safely

## Page 4: Hosting and Security Setup

### Where We Host Everything

We wanted TutorCat to be fast, secure, and able to grow. Here's our setup:

- **Netlify** - Hosts our main website and runs our API functions. It's super fast and has built-in security
- **Domain on Namecheap** - We bought tutorcat.app for $12/year. It's our custom web address
- **Cloudflare DNS** - This protects us from hackers and makes the site load faster worldwide
- **Neon Database** - PostgreSQL database that's always available and scales automatically
- **Resend** - Handles sending emails (like password resets)
- **AssemblyAI** - Transcribes student speech for AI feedback
- **OpenAI GPT-4** - Gives smart feedback on student writing and speaking

### Why This Setup?

Cloudflare is especially important because it has a Web Application Firewall (WAF) that blocks hackers trying to attack our site. We also use it to prevent DDoS attacks, which are when bad people try to overwhelm our site with fake traffic.

## Page 5: Security Features We Built

Security was super important to us since we're dealing with student data. Here are the protections we have:

### User Input Safety
- **Input Sanitization** - We clean all text that users type to prevent code injection attacks
- **XSS Headers** - Special security headers that stop malicious scripts from running
- **Password Encryption** - Student passwords are hashed so even we can't read them

### Session Management
- **JWT Tokens** - These are like special keys that prove someone is logged in
- **HTTP Cookies** - Secure cookies that expire automatically
- **Session Storage** - We keep track of active sessions in our database

### Session Lengths
- **Regular Users** - Stay logged in for 1 day (24 hours)
- **Admin Users** - Stay logged in for 8 hours (shorter for security)

### Emergency Security
If a student's account gets hacked, admins can immediately revoke their session from the admin panel. This logs them out everywhere and forces them to log back in with a new password.

## Page 6: User Cabinet Features

The heart of TutorCat is the student dashboard where they do all their learning. Here's what students can do:

### Evaluation Tests
Students take placement tests to figure out their English level. The test has:
- Vocabulary questions (multiple choice)
- Grammar exercises
- Listening comprehension
- Speaking practice with AI feedback

The system calculates their CEFR level (A1, A2, B1, B2, etc.) based on their score.

### Lessons and Activities
Each lesson has multiple activities:
- **Warm-up speaking** - Quick conversation starters
- **Vocabulary practice** - Matching words with pictures/definitions
- **Grammar exercises** - Fill in blanks and sentence building
- **Reading comprehension**
- **Writing practice** - With AI feedback

**Smart Lesson Progress Saving**
We store lesson data in the browser's localStorage so students never lose their progress. This means if they get interrupted or close the app, they can resume exactly where they left off without starting the lesson again. Once they submit their answers, we automatically delete the stored data to prevent the storage from getting full over time.

### Achievement System
We made learning feel like a game with:
- **XP Points** - Earned for completing activities
- **Stars** - Bonus points for perfect scores
- **Badges** - Unlock achievements like "First Lesson Complete" or "Grammar Master"

### Leveling Up System
Students start at whatever level the evaluation test places them. They can move up levels by:
- Completing lessons consistently
- Getting high scores on activities
- Maintaining good speaking accuracy

Our leveling system combines test performance with AI speaking evaluation using a balanced 50/50 weighting formula for fair and accurate placement.

## Page 7: How Leveling Works (The New Formula)

We redesigned our leveling system to be simpler and more transparent. Here's how our new system works:

**New Formula:**
```
Overall_Percentage = (Speaking_Score × 0.7) + (Grammar_Test_Score × 0.3)
Final_CEFR_Level = Based on percentage ranges (0-20% = Pre-A1, 21-35% = A1, etc.)
```

1. **Speaking Score (70%)** - AI evaluates pronunciation, fluency, vocabulary, and grammar in speech (0-100 points)
2. **Grammar Test Score (30%)** - Traditional multiple-choice and fill-in-the-blank questions (percentage)
3. **Combined Result** - Weighted formula prioritizes speaking ability for accurate level placement

**Example:**
- Speaking: 55/100 = 55%
- Grammar Test: 80%
- Overall: (55 × 0.7) + (80 × 0.3) = 38.5 + 24 = 62.5% → **B1 level** (51-65% range)

This ensures balanced assessment where both speaking ability and grammar knowledge contribute equally to the final level placement.

## Page 8: Meet the Team

We have an amazing team of 5 people who made TutorCat happen:

### Mattcha Srirojwong - Frontend Developer
Mattcha loves making beautiful interfaces. He built all the lesson screens, activity components, and the main dashboard. He used React, TypeScript, and Tailwind CSS to create smooth animations with Framer Motion. He also added the drag-and-drop features using Konva.js and integrated our cute Lottie animations.

### Arnon Dangmukda - Backend Developer
Arnon enjoys solving complex problems. He built our serverless API using Netlify Functions and designed our PostgreSQL database on Neon. He implemented the secure JWT authentication system and created the systems for tracking user progress and achievements.

### Jaroenjit Anatamsombat - Web Designer
Jaroenjit has an eye for design. He created the entire look and feel of TutorCat - the landing page, lesson interface, admin panel, and color schemes. He made sure everything looks great on phones, tablets, and computers using responsive design principles.

### Nichapath Chunlawithet - QA Engineer
Nichapath makes sure everything works perfectly. She tested all features including lesson activities, login systems, and database operations. She checked compatibility across different browsers and devices, and created test cases for all our exercises to ensure students have a bug-free experience.

### Aleksandr Petrov - Teacher & Platform Developer
Our teacher Aleksandr led the project and provided educational expertise. He helped design the curriculum, ensured the platform meets learning standards, and coordinated our development team. His teaching experience made sure TutorCat actually helps students learn effectively.

## Page 9: The Mascot Story

Our mascot is a cute orange cat named "TutorCat"! Here's how we created it:

### Why a Cat?
We chose a cat because:
- Cats are cute and friendly
- Junior high students love animals
- It fits our app name perfectly
- Cats are curious and playful, just like how learning should feel

### How We Made It
1. **Hand-drawn in Adobe Illustrator** - One of our team members sketched the cat character
2. **Animated in Adobe After Effects** - Added movements and expressions
3. **Exported with Bodymovin Plugin** - Converted to Lottie format for web use

The mascot appears throughout the app - waving hello, celebrating achievements, and encouraging students. We think it makes learning feel more personal and fun.

## Page 10: Admin Panel & Future Plans

### Admin Features
Teachers and admins can use a special panel to:
- **View all students** - See progress, levels, and activity
- **Revoke sessions** - Log out students if accounts are compromised
- **Add new lessons** - Create content for different levels
- **Edit existing lessons** - Update activities and content
- **Edit evaluation tests** - Change questions and scoring

### Future Growth Plans
TutorCat is built to scale! Here are our plans:

**Subscription Plans** - We might add premium features for $5/month, but keep the basic version free for our school students

**Teacher Features** - Let teachers create custom lessons for their classes and track student progress in groups

**Class Management** - Allow teachers to assign students to specific classes and create custom learning paths

**More Languages** - Start with English but expand to other languages later

### Why We're Scalable
- **Netlify** can handle millions of users
- **Neon database** grows automatically
- **Cloudflare** protects against attacks
- **Modular code** - Easy to add new features

We're really proud of what we've built. TutorCat started as a school project but has the potential to help thousands of students learn English in a fun, effective way. The best part is knowing that real students are using it and improving their language skills every day!

---

*Report written by the TutorCat development team - Mattcha, Arnon, Jaroenjit, Nichapath, and Teacher Aleksandr*
