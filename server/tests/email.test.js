jest.mock('../config', () => ({ smtp: { host:'smtp.example.test',port:587,secure:false,user:'test',pass:'test',from:'sender@example.test' }, appUrl:'https://app.example.test' }));
jest.mock('nodemailer', () => {
  const actual = jest.requireActual('nodemailer');
  return { ...actual, createTransport: jest.fn(() => actual.createTransport({ streamTransport:true, buffer:true })) };
});
const nodemailer=require('nodemailer');
const { send, buildPasswordResetEmail }=require('../email');
test('recovery email uses patched MIME generation without contacting SMTP',async()=>{
  const template=buildPasswordResetEmail({displayName:'Owner <script>',resetUrl:'https://app.example.test/reset-password?token=test-only',ttlMinutes:60});
  const result=await send({to:'owner@example.test',...template});
  expect(result.delivered).toBe(true);
  expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({ requireTLS:true,disableFileAccess:true,disableUrlAccess:true }));
  expect(template.html).not.toContain('<script>');
  expect(template.text).toContain('token=test-only');
});
