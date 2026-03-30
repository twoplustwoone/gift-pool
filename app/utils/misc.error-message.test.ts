import { faker } from '@faker-js/faker';
import { expect, test } from 'vitest';
import { testConsole } from '#tests/setup/setup-test-env.ts';
import { getErrorMessage } from './misc.tsx';

test('Error object returns message', () => {
  const message = faker.lorem.words(2);
  expect(getErrorMessage(new Error(message))).toBe(message);
});

test('String returns itself', () => {
  const message = faker.lorem.words(2);
  expect(getErrorMessage(message)).toBe(message);
});

test('undefined falls back to Unknown', () => {
  testConsole.error.mockImplementation(() => {});
  expect(getErrorMessage(undefined)).toBe('Unknown Error');
  expect(testConsole.error).toHaveBeenCalledWith(
    'Unable to get error message for error',
    undefined,
  );
  expect(testConsole.error).toHaveBeenCalledTimes(1);
});
