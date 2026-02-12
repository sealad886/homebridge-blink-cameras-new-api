export default {
  extends: ['@commitlint/config-conventional'],
  ignores: [(message) => message.trim() === 'Initial plan'],
};
