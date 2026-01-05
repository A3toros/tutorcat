# Login Enhancement: Accept Both Email and Username

## Current State
- Login currently only accepts usernames
- Username input is automatically converted to lowercase
- Backend queries users by username field only

## Goal
- Allow users to login with either their username OR email address
- Maintain backward compatibility
- Improve user experience by providing login flexibility

## Implementation Plan

### Phase 1: Frontend Changes

#### 1.1 Update Login Modal UI
- **File:** `src/components/auth/LoginModal.tsx`
- Change placeholder text from "Username" to "Username or Email"
- Update form labels and help text
- Consider adding visual indicator showing both options are valid

#### 1.2 Input Validation
- **File:** `src/components/auth/LoginModal.tsx`
- Add client-side validation to detect email format
- Show appropriate error messages
- Maintain username validation rules

#### 1.3 Login Logic Update
- **File:** `src/components/auth/LoginModal.tsx`
- Modify login function to determine input type (email vs username)
- Pass appropriate identifier to backend API

### Phase 2: Backend API Changes

#### 2.1 Authentication Function
- **File:** `functions/auth-login.ts`
- Update login logic to accept both email and username
- Add input type detection (email regex validation)
- Query database by appropriate field based on input type

#### 2.2 Database Query Logic
```sql
-- Current: SELECT * FROM users WHERE username = $1
-- New: Check if input contains '@', if yes query by email, else by username
SELECT * FROM users WHERE
  CASE
    WHEN $1 LIKE '%@%' THEN email = $1
    ELSE LOWER(username) = LOWER($1)
  END
```

#### 2.3 Error Handling
- Return appropriate error messages for invalid credentials
- Handle case sensitivity for both email and username
- Maintain security by not revealing which field was incorrect

### Phase 3: Database Considerations

#### 3.1 Email Field Validation
- Ensure email field is properly validated in user registration
- Check for email uniqueness constraints
- Consider adding email verification if not already implemented

#### 3.2 Migration Script
- **File:** `scripts/migration-add-email-login-support.sql`
- Add any necessary indexes for email lookups
- Ensure email field has proper constraints

### Phase 4: Testing Scenarios

#### 4.1 Test Cases
- Login with valid username
- Login with valid email
- Login with invalid username
- Login with invalid email
- Login with email that doesn't exist
- Login with username that doesn't exist
- Case sensitivity tests
- Special characters in usernames/emails

#### 4.2 Edge Cases
- Email with uppercase characters
- Username with uppercase characters
- Email format validation
- SQL injection prevention
- Rate limiting considerations

### Phase 5: User Experience Improvements

#### 5.1 UI Feedback
- Show login method used in success message
- Provide helpful error messages
- Add loading states during authentication

#### 5.2 Documentation Updates
- Update user registration flow documentation
- Update login help text
- Update API documentation

### Phase 6: Security Considerations

#### 6.1 Input Sanitization
- Ensure proper SQL injection prevention
- Validate email format server-side
- Rate limiting for failed login attempts

#### 6.2 Logging
- Log authentication attempts without exposing sensitive data
- Monitor for unusual login patterns

### Phase 7: Rollout Plan

#### 7.1 Gradual Rollout
- Deploy backend changes first
- Test with internal users
- Gradually enable for all users
- Monitor error rates and user feedback

#### 7.2 Rollback Plan
- Ability to disable email login if issues arise
- Clear communication with users about changes

## Technical Implementation Details

### Input Detection Logic
```javascript
function detectLoginType(input) {
  // Simple email regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(input) ? 'email' : 'username';
}
```

### Backend Query Strategy
```javascript
async function findUser(loginInput) {
  const loginType = detectLoginType(loginInput);

  if (loginType === 'email') {
    // Query by email (case sensitive)
    return await queryUserByEmail(loginInput);
  } else {
    // Query by username (convert to lowercase)
    return await queryUserByUsername(loginInput.toLowerCase());
  }
}
```

## Success Metrics

- [ ] Users can successfully login with email addresses
- [ ] Users can still login with usernames
- [ ] No increase in failed login attempts
- [ ] No security vulnerabilities introduced
- [ ] Positive user feedback on login flexibility

## Risks and Mitigations

### Risk: Email Case Sensitivity Issues
**Mitigation:** Store emails in normalized form, handle case-insensitive comparison

### Risk: Username/Email Conflicts
**Mitigation:** Ensure usernames and emails are unique across the system

### Risk: Performance Impact
**Mitigation:** Add appropriate database indexes, monitor query performance

### Risk: Security Vulnerabilities
**Mitigation:** Input validation, SQL injection prevention, rate limiting

## Timeline Estimate

- Phase 1 (Frontend): 2-3 days
- Phase 2 (Backend): 3-4 days
- Phase 3 (Database): 1-2 days
- Phase 4 (Testing): 2-3 days
- Phase 5 (UX): 1-2 days
- Phase 6 (Security): 1-2 days
- Phase 7 (Rollout): 1-2 days

**Total Estimate:** 11-18 days

## Dependencies

- Backend API access
- Database schema understanding
- Authentication system knowledge
- Testing environment setup

## Next Steps

1. Review current authentication system implementation
2. Create detailed technical specifications
3. Begin with backend changes to minimize user impact
4. Implement comprehensive testing strategy
5. Plan user communication about the new feature
