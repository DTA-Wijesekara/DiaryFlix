jest.mock('../db', () => ({
  initDB:    jest.fn(() => Promise.resolve()),
  closePool: jest.fn(() => Promise.resolve()),
  getPool:   jest.fn(),
  query:     jest.fn(),
}));

jest.mock('../email', () => ({
  send:                    jest.fn(() => Promise.resolve()),
  buildPasswordResetEmail: jest.fn(() => ({ subject: '', text: '', html: '' })),
  buildOAuthOnlyEmail:     jest.fn(() => ({ subject: '', text: '', html: '' })),
}));

const request = require('supertest');
const bcrypt  = require('bcryptjs');
const { query } = require('../db');
const app = require('../server');

beforeEach(() => jest.clearAllMocks());

describe('POST /api/auth/register', () => {
  test('1. creates a new user and returns a JWT token', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })  // no existing user with that email
      .mockResolvedValueOnce({ rows: [] }); // INSERT

    const res = await request(app).post('/api/auth/register').send({
      email: 'new@example.com',
      password: 'password123',
      displayName: 'New User',
    });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('new@example.com');
    expect(res.body.user.role).toBe('user');
  });

  test('2. rejects an invalid email format with 400', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'not-an-email',
      password: 'password123',
      displayName: 'Test',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  test('3. rejects passwords shorter than the minimum length', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'valid@example.com',
      password: 'abc',
      displayName: 'Test',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/password/i);
  });

  test('4. returns 409 when the email is already taken', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'existing_user' }] });

    const res = await request(app).post('/api/auth/register').send({
      email: 'taken@example.com',
      password: 'password123',
      displayName: 'Test',
    });
    expect(res.status).toBe(409);
  });
});

describe('POST /api/auth/login', () => {
  test('5. rejects login with an incorrect password (401)', async () => {
    const hash = await bcrypt.hash('correct_password', 4);

    query.mockResolvedValueOnce({
      rows: [{
        id: 'user_1',
        email: 'user@example.com',
        password_hash: hash,
        display_name: 'User',
        role: 'user',
        avatar: 'U',
        is_active: true,
      }],
    });

    const res = await request(app).post('/api/auth/login').send({
      email: 'user@example.com',
      password: 'wrong_password',
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });
});
