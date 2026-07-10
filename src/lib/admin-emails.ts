/**
 * List of email addresses that are automatically granted the 'admin' role
 * when they log in for the first time.
 */
export const DEFAULT_ADMIN_EMAILS = [
  "flexiifashion@gmail.com",
  "educationleadershipexpo@gmail.com",
  "digitaleragrowth@gmail.com",
  "studentdiwan.lms@gmail.com",
  "abishsuresh01@gmail.com",
  "huda579579@gmail.com",
  "bluewoodschool.bh@gmail.com",
  "noblelessemarketing@gmail.com",
  "ishantcont@gmail.com",
];

/**
 * Checks if an email is in the default admin list.
 */
export const isDefaultAdminEmail = (email: string | null | undefined): boolean => {
  if (!email) return false;
  return DEFAULT_ADMIN_EMAILS.includes(email.toLowerCase());
};
