// jest.config.js
const nextJest = require('next/jest')

// Providing the path to your Next.js app which will enable loading next.config.js and .env files
const createJestConfig = nextJest({ dir: './' })

// Any custom config you want to pass to Jest
/** @type {import('jest').Config} */
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'], // Run this file after the test framework is installed
  testEnvironment: 'jest-environment-jsdom', // Use jsdom to simulate a browser environment
  moduleNameMapper: {
    // Handle module aliases (if you have them in tsconfig.json)
    '^@/components/(.*)$': '<rootDir>/src/components/$1',
    '^@/lib/(.*)$': '<rootDir>/src/lib/$1',
    '^@/prompts/system-info$': '<rootDir>/src/__mocks__/system-info.ts',
    '^@/shared/(.*)$': '<rootDir>/src/shared/$1',
    '^@/utils/(.*)$': '<rootDir>/src/utils/$1',
    // Mock Tauri API modules
    '^@tauri-apps/api/core$': '<rootDir>/__mocks__/tauriApiCore.js',
    '^@tauri-apps/api/path$': '<rootDir>/__mocks__/tauriApiPath.js', // Example if needed later
    // Mock os-name module
    'os-name': '<rootDir>/__mocks__/os-name.js',
    // Add other Tauri mocks as needed
  },
  testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/', '<rootDir>/src-tauri/'], // Ignore these directories
  transform: {
    // Use babel-jest to transpile tests with the next/babel preset
    // https://jestjs.io/docs/configuration#transform-objectstring-pathtotransformer--pathtotransformer-object
    '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', { presets: ['next/babel'] }],
  },
  transformIgnorePatterns: [
    '/node_modules/',
    '^.+\\.module\\.(css|sass|scss)$',
  ],
}

// createJestConfig is exported in this way to ensure that next/jest can load the Next.js configuration, which is async
module.exports = createJestConfig(customJestConfig)