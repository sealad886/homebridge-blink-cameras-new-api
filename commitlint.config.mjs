export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Allow sentence-case for subjects since file names like FUNDING.yml need capitals
    'subject-case': [2, 'never', ['upper-case', 'pascal-case', 'start-case']],
  },
  ignores: [(message) => message.trim() === 'Initial plan'],
};
