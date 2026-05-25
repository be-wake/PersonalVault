// jest-expo preset handles React Native test environment setup.
// Silence console.error for expected React error boundary calls in tests.
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('[ErrorBoundary]')) return;
    originalError(...args);
  };
});
afterAll(() => {
  console.error = originalError;
});
