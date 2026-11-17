/**
 * The preset Google identity.
 *
 * This is the account that the "Continue with Google" button signs you
 * in as. It is a fixed, local identity: it is defined here in the
 * browser and it never asks the server to create, read, or write a
 * user row.
 *
 * Because there is no server-side account behind it, there is no JWT
 * either. The session is the user object below, kept in local storage
 * by the app context, and it survives a reload that way.
 */
export const PRESET_GOOGLE_USER = {
  id: 'preview-google',
  name: 'Preview User',
  firstName: 'Preview',
  lastName: 'User',
  email: 'preview@project-eric.local',
  role: 'preview',
  provider: 'google',
  avatar: null,
  teamId: null,
  teamName: "Preview's Team",
  onboardingComplete: true,
  isPreview: true,
};
