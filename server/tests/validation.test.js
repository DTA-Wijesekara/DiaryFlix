const { assertEmail, assertPassword, HttpError } = require('../middleware');

describe('Validation helpers', () => {
  test('20. assertEmail normalises to lowercase and rejects malformed addresses', () => {
    expect(assertEmail('User@Example.COM')).toBe('user@example.com');

    expect(() => assertEmail('not-an-email')).toThrow(HttpError);
    expect(() => assertEmail('missing@tld')).toThrow(/invalid email/i);
    expect(() => assertEmail('')).toThrow();
    expect(() => assertEmail(null)).toThrow();
  });
});
