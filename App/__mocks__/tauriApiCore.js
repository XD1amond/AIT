// __mocks__/tauriApiCore.js

// Export a simple Jest mock function for invoke
const invoke = jest.fn(async (command, args) => {
  // Default behavior: Log an error and reject, forcing tests to mock explicitly.
  console.error(`[Mock Invoke] Fallback: invoke mock called for unmocked command: ${command}`);
  return Promise.reject(new Error(`invoke mock was not explicitly set for command: ${command}`));
});

module.exports = {
  invoke,
};