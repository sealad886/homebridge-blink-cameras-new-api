/* global module */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/__tests__'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  clearMocks: true,
  // Current Homebridge/HAP ship ESM; tests still exercise the plugin as CommonJS.
  transformIgnorePatterns: ['/node_modules/(?!(?:@homebridge/hap-nodejs|homebridge)/)'],
  transform: {
    '[/\\\\]node_modules[/\\\\](?:@homebridge[/\\\\]hap-nodejs|homebridge)[/\\\\].+\\.js$':
      '<rootDir>/.github/scripts/jest-esm-transform.cjs',
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        // Keep Jest on explicit CommonJS while the app build uses NodeNext.
        tsconfig: 'tsconfig.test.json',
      },
    ],
  },
};
