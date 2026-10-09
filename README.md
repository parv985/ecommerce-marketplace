1. Authentication
- [ ] Register with email/password
- [ ] Login/logout
- [ ] Invalid credentials handled correctly
- [ ] Google signup/login
- [ ] Existing Google account during signup → proper message
- [ ] Protected routes cannot be accessed without login
- [ ] User profile loads/updates correctly
2. Resume Management
- [ ] Upload PDF/DOCX
- [ ] Reject unsupported file types
- [ ] Reject oversized files
- [ ] Resume parsing works
- [ ] Resume data is stored correctly
- [ ] Rename / duplicate / delete resume
- [ ] Multiple resume versions work
- [ ] Resume analysis can be triggered
- [ ] Resume export to PDF/DOCX works
3. Resume Analyzer
- [ ] Resume score is generated
- [ ] ATS score
- [ ] Content quality score
- [ ] Keyword analysis
- [ ] Experience analysis
- [ ] Formatting analysis
- [ ] Suggestions/issues are displayed
- [ ] AI does not invent metrics, skills, experience, etc.    Pasted text
4. Resume Editor
- [ ] Edit resume sections
- [ ] Add/remove sections
- [ ] Reorder sections
- [ ] AI suggestions
- [ ] Accept/reject AI changes
- [ ] Before/after comparison
- [ ] Version history
- [ ] Save changes
- [ ] Export
5. Job Description Analyzer
- [ ] Paste JD
- [ ] Upload JD if supported
- [ ] Parse JD
- [ ] Extract title/company/location
- [ ] Extract required/preferred skills
- [ ] Extract responsibilities
- [ ] Extract experience/education
- [ ] Extract important keywords
6. Resume ↔ JD Matching
- [ ] Select resume + JD
- [ ] Match score generated
- [ ] Skill matching
- [ ] Experience matching
- [ ] Keyword matching
- [ ] Missing skills identified
- [ ] Score explanation shown
- [ ] Matching is reasonably consistent/deterministic where expected
7. Resume Tailoring
- [ ] Generate JD-specific suggestions
- [ ] Before/after comparison
- [ ] Accept/reject changes
- [ ] Changes remain traceable
- [ ] New resume version created
- [ ] No fabricated information
- [ ] Export tailored resume
8. Job Search
- [ ] Search jobs
- [ ] Search by skills/company
- [ ] Location filter
- [ ] Job type filter
- [ ] Experience filter
- [ ] Sorting
- [ ] Pagination
- [ ] Save job
- [ ] Job details open correctly
- [ ] Original job source is shown
9. Recommended Jobs
- [ ] Personalized recommendations
- [ ] Match percentage
- [ ] "Why recommended?" explanation
- [ ] Matching skills displayed
- [ ] Missing skills displayed
- [ ] Recommendations actually relate to user's resume/preferences
10. Application Tracker
- [ ] Save job → application
- [ ] Application creation
- [ ] Status changes:
  Saved → Applied → Assessment → Interview → Offer
- [ ] Kanban view
- [ ] List/table view
- [ ] Notes
- [ ] Application date
- [ ] Resume version association
- [ ] Interview information
- [ ] Moving between stages works correctly
11. Interview Preparation
- [ ] Select resume + job/JD
- [ ] Technical questions
- [ ] Resume-specific questions
- [ ] HR questions
- [ ] Role-specific questions
- [ ] Answer guidance
- [ ] Mock interview
- [ ] Feedback/score
- [ ] Previous interview sessions saved
12. Dashboard
- [ ] Resume health/score
- [ ] Recommended jobs
- [ ] Application pipeline
- [ ] Recent activity
- [ ] Dashboard reflects actual user data
- [ ] No fake statistics
13. Backend/API
- [ ] Authentication APIs
- [ ] Authorization
- [ ] Request validation
- [ ] Proper HTTP status codes
- [ ] Error handling
- [ ] Swagger documentation
- [ ] MongoDB CRUD operations
- [ ] Database indexes/uniqueness
- [ ] AI service communication
- [ ] Background jobs
14. Security
- [ ] Passwords hashed
- [ ] JWT works correctly
- [ ] Refresh-token flow if implemented
- [ ] Unauthorized requests rejected
- [ ] Users cannot access another user's resumes/jobs/applications
- [ ] File validation
- [ ] File size limits
- [ ] Rate limiting
- [ ] CORS
- [ ] Secrets only in environment variables
- [ ] API keys never exposed to frontend
- [ ] Errors don't expose sensitive information    Pasted text
15. Overall UX
- [ ] Desktop works
- [ ] Laptop works
- [ ] Tablet works
- [ ] Mobile works
- [ ] Loading states
- [ ] Empty states
- [ ] Error states
- [ ] Toast notifications
- [ ] No broken links/routes
- [ ] No console errors
- [ ] No unnecessary API calls
- [ ] prefers-reduced-motion works
Most important end-to-end flows
Don't only test individual buttons. Test these complete journeys:
Flow 1 — New user
Register → Login → Dashboard → Upload Resume → Analyze Resume

Flow 2 — Job matching
Upload Resume → Add JD → Analyze JD → Match Resume ↔ JD → View Missing Skills

Flow 3 — Apply
Search Job → View Job → Save → Tailor Resume → Track Application

Flow 4 — Interview
Application → Select Job + Resume → Generate Interview Prep → Mock Interview → Feedback

Flow 5 — Google
Google Signup → New Account
Google Signup → Existing Account → "Please sign in"
Google Sign-in → Existing User → Dashboard

These end-to-end flows are more important than simply checking whether every page visually renders. Your specification explicitly requires verifying functionality after each feature rather than assuming it works because the files/components exist.    Pasted text