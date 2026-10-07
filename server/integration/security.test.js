jest.mock('../email', () => ({ send: jest.fn(async () => ({ delivered: true })), buildPasswordResetEmail: jest.fn(() => ({})), buildOAuthOnlyEmail: jest.fn(() => ({})) }));
jest.mock('google-auth-library', () => ({ OAuth2Client: jest.fn(() => ({ verifyIdToken: async () => ({ getPayload: () => ({ email: 'owner@example.com', email_verified: true, sub: 'google-owner' }) }) })) }));
const express = require('express');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { migrate } = require('../migrate');
const { query, closePool, transaction } = require('../db');
const { errorHandler } = require('../middleware');
const app = express();
app.use(express.json());
app.use('/auth', require('../routes/auth'));
app.use('/logs', require('../routes/logs'));
app.use('/series', require('../routes/series'));
app.use('/admin', require('../routes/admin'));
app.use(errorHandler);
let token;
beforeAll(migrate);
beforeEach(async () => {
  await query('TRUNCATE users CASCADE');
  const hash = await bcrypt.hash(' password123 ', 4);
  await query("INSERT INTO users(id,email,display_name,password_hash,email_verified_at) VALUES ('owner','owner@example.com','Owner',@hash,NOW())", { hash });
  const login = await request(app).post('/auth/login').send({ email: 'owner@example.com', password: ' password123 ' });
  expect(login.status).toBe(200);
  token = login.body.token;
});
afterAll(closePool);
const auth = req => req.set('Authorization', 'Bearer ' + token);

test('whitespace password works, trimmed password does not', async () => {
  const res = await request(app).post('/auth/login').send({ email: 'owner@example.com', password: 'password123' });
  expect(res.status).toBe(401);
});
test('inactive, deleted, and version-revoked sessions are rejected', async () => {
  await query("UPDATE users SET is_active = FALSE WHERE id='owner'");
  expect((await auth(request(app).get('/logs'))).status).toBe(401);
  await query("UPDATE users SET is_active = TRUE, auth_version = 1 WHERE id='owner'");
  expect((await auth(request(app).get('/logs'))).status).toBe(401);
  await query("DELETE FROM users WHERE id='owner'");
  expect((await auth(request(app).get('/logs'))).status).toBe(401);
});
test('database role overrides stale admin claims', async () => {
  token = jwt.sign({ id: 'owner', role: 'admin', version: 0 }, process.env.JWT_SECRET);
  expect((await auth(request(app).get('/admin/users'))).status).toBe(403);
});
test('registration cannot issue a token before proving ownership', async () => {
  const res = await request(app).post('/auth/register').send({ email: 'new@example.com', password: 'password123', displayName: 'New' });
  expect(res.status).toBe(201);
  expect(res.body.token).toBeUndefined();
  expect((await query("SELECT email_verified_at FROM users WHERE email='new@example.com'")).rows[0].email_verified_at).toBeNull();
});
test('Google email collision never links implicitly', async () => {
  await query("UPDATE users SET email_verified_at = NULL WHERE id='owner'");
  const res = await request(app).post('/auth/google').send({ credential: 'test-credential' });
  expect(res.status).toBe(409);
  expect((await query("SELECT google_id FROM users WHERE id='owner'")).rows[0].google_id).toBeNull();
});
test('explicit Google linking requires matching verified ownership and password', async () => {
  expect((await auth(request(app).post('/auth/link-google')).send({ credential: 'test-credential', currentPassword: 'wrong' })).status).toBe(401);
  expect((await auth(request(app).post('/auth/link-google')).send({ credential: 'test-credential', currentPassword: ' password123 ' })).status).toBe(200);
});
test('concurrent reset consumes token once and revokes old session', async () => {
  const raw = 'a'.repeat(64), hash = crypto.createHash('sha256').update(raw).digest('hex');
  await query("INSERT INTO password_reset_tokens(token_hash,user_id,expires_at) VALUES (@hash,'owner',NOW()+INTERVAL '1 hour')", { hash });
  const results = await Promise.all([1,2].map(() => request(app).post('/auth/reset-password').send({ token: raw, newPassword: 'new-password' })));
  expect(results.map(r => r.status).sort()).toEqual([200,400]);
  expect((await auth(request(app).get('/logs'))).status).toBe(401);
});
test('failed transaction rolls back', async () => {
  await expect(transaction(async () => { await query("UPDATE users SET display_name='Changed' WHERE id='owner'"); throw new Error('failure'); })).rejects.toThrow('failure');
  expect((await query("SELECT display_name FROM users WHERE id='owner'")).rows[0].display_name).toBe('Owner');
});
test('concurrent watches share one movie, movie and TV remain separate, all responses count correctly', async () => {
  const results = await Promise.all([1,2,3].map(() => auth(request(app).post('/logs')).send({ tmdbId: 123, type: 'movie', title: 'Film' })));
  expect(results.map(r => r.status)).toEqual([201,201,201]);
  expect((await query('SELECT COUNT(*)::int AS n FROM movies')).rows[0].n).toBe(1);
  const logs = await auth(request(app).get('/logs'));
  expect(logs.body.map(l => l.rewatchCount)).toEqual([2,2,2]);
  const single = await auth(request(app).get('/logs/' + logs.body[0].id));
  expect(single.body.rewatchCount).toBe(2);
  expect((await auth(request(app).post('/logs')).send({ tmdbId:123,type:'tv_series',title:'Series' })).status).toBe(201);
  expect((await query('SELECT COUNT(*)::int AS n FROM movies')).rows[0].n).toBe(2);
});
test('foreign key enforces ownership', async () => {
  await query("INSERT INTO users(id,email,display_name) VALUES ('other','other@example.com','Other')");
  await query("INSERT INTO movies(id,user_id,title) VALUES ('film','other','Film')");
  await expect(query("INSERT INTO watchlogs(id,user_id,movie_id) VALUES ('bad','owner','film')")).rejects.toMatchObject({ code: '23503' });
});

test('last active admin is protected across concurrent demotions', async () => {
  await query("UPDATE users SET role='admin' WHERE id='owner'");
  await query("INSERT INTO users(id,email,display_name,role,email_verified_at) VALUES ('second','second@example.com','Second','admin',NOW())");
  const otherToken = jwt.sign({ id: 'second', version: 0 }, process.env.JWT_SECRET);
  const results = await Promise.all([
    auth(request(app).put('/admin/users/owner/role')).send({ role: 'user' }),
    request(app).put('/admin/users/second/role').set('Authorization','Bearer '+otherToken).send({ role:'user' })
  ]);
  expect(results.map(r=>r.status).sort()).toEqual([200,400]);
  expect((await query("SELECT COUNT(*)::int AS n FROM users WHERE role='admin' AND is_active=TRUE")).rows[0].n).toBe(1);
});
test('independent rate stores share atomic counters', async () => {
  const { PostgresRateStore } = require('../lib/postgresRateStore');
  await query('TRUNCATE rate_limit_buckets');
  const stores = [new PostgresRateStore('integration'), new PostgresRateStore('integration')];
  stores.forEach(s=>s.init({ windowMs:60000 }));
  const results=await Promise.all(Array.from({length:8},(_,i)=>stores[i%2].increment('client')));
  expect(results.map(r=>r.totalHits).sort((a,b)=>a-b)).toEqual([1,2,3,4,5,6,7,8]);
  await stores[0].resetKey('client');
  expect((await stores[1].increment('client')).totalHits).toBe(1);
});
test('graph snapshots publish and failed rebuilds preserve the last snapshot', async () => {
  const { refreshGraph } = require('../refresh-graph');
  const { loadSnapshot } = require('../lib/graphSnapshot');
  const { getGraph } = require('../lib/graphStore');
  await auth(request(app).post('/logs')).send({ tmdbId:1,type:'movie',title:'Original' });
  await refreshGraph();
  await loadSnapshot();
  expect(getGraph().nodes.has('tmdb:movie:1')).toBe(true);
  const before=(await query('SELECT data FROM graph_snapshots WHERE id=1')).rows[0].data;
  await query("INSERT INTO movies(id,user_id,title,genres) SELECT 'budget-'||n, 'owner', 'Title '||n, '[\"drama\"]' FROM generate_series(1,450) n");
  await query("INSERT INTO watchlogs(id,user_id,movie_id) SELECT 'budget-log-'||n, 'owner','budget-'||n FROM generate_series(1,450) n");
  await expect(refreshGraph()).rejects.toThrow('budget');
  expect((await query('SELECT data FROM graph_snapshots WHERE id=1')).rows[0].data).toEqual(before);
});
test('pagination returns disjoint pages without changing movie counts', async () => {
  for(let i=0;i<3;i++) await auth(request(app).post('/logs')).send({ tmdbId:12,title:'Film' });
  const first=await auth(request(app).get('/logs?limit=2&offset=0'));
  const second=await auth(request(app).get('/logs?limit=2&offset=2'));
  expect(first.body).toHaveLength(2);
  expect(second.body).toHaveLength(1);
  expect(new Set([...first.body,...second.body].map(x=>x.id)).size).toBe(3);
  expect(second.body[0].rewatchCount).toBe(2);
});

test('recovery expiry preserves the same instant across database timezones', async () => {
  const expires = new Date(Date.now()+300000);
  await transaction(async () => {
    await query("SET LOCAL TIME ZONE 'America/New_York'");
    await query("INSERT INTO password_reset_tokens(token_hash,user_id,expires_at) VALUES ('timezone-test','owner',@expires)",{expires});
    const row=(await query("SELECT expires_at FROM password_reset_tokens WHERE token_hash='timezone-test'")).rows[0];
    expect(row.expires_at.getTime()).toBe(expires.getTime());
  });
});


const tvWatch = (overrides={}) => ({title:'Example Series',type:'tv_series',dateWatched:'2026-09-01',runtime:900,
  requestId:crypto.randomUUID(),episode:{seasonNumber:1,episodeNumber:1,title:'Pilot',runtime:42,airDate:'2020-01-01'},...overrides});
test('episode retries are idempotent, rewatches explicit, and runtime snapshots immutable',async()=>{
  const input=tvWatch();
  const first=await auth(request(app).post('/logs')).send(input);
  expect(first.status).toBe(201);
  expect(first.body).toMatchObject({entryType:'episode',watchedMinutes:42,seasonNumber:1,episodeNumber:1,rewatchCount:0});
  const replay=await auth(request(app).post('/logs')).send(input);
  expect(replay.body.id).toBe(first.body.id);
  const duplicate=await auth(request(app).post('/logs')).send({...input,movieId:first.body.movieId,requestId:crypto.randomUUID()});
  expect(duplicate.status).toBe(409);
  const rewatch=await auth(request(app).post('/logs')).send({...input,movieId:first.body.movieId,requestId:crypto.randomUUID(),allowRewatch:true});
  expect(rewatch.body.rewatchCount).toBe(1);
  await auth(request(app).put(`/series/${first.body.movieId}/catalog`)).send({episodes:[{...input.episode,runtime:50}]});
  const old=await auth(request(app).get(`/logs/${first.body.id}`));
  expect(old.body.watchedMinutes).toBe(42);
  expect(old.body.episodeRuntime).toBe(50);
  const progress=await auth(request(app).get(`/series/${first.body.movieId}`));
  expect(progress.body.progress).toMatchObject({watched:1,total:1,caughtUp:false});
});
test('catalog progress excludes specials and unreleased episodes, bulk writes are atomic and skip watched entries',async()=>{
  const first=await auth(request(app).post('/logs')).send(tvWatch());
  const id=first.body.movieId;
  const episodes=[
    {seasonNumber:1,episodeNumber:1,runtime:42,airDate:'2020-01-01'},
    {seasonNumber:1,episodeNumber:2,runtime:45,airDate:'2020-01-02'},
    {seasonNumber:0,episodeNumber:1,runtime:10,airDate:'2020-01-01'},
    {seasonNumber:2,episodeNumber:1,runtime:55,airDate:'2099-01-01'}];
  expect((await auth(request(app).put(`/series/${id}/catalog`)).send({episodes,catalogComplete:true,expectedEpisodeCount:4,seriesEnded:false})).status).toBe(200);
  const initial=(await auth(request(app).get(`/series/${id}`))).body;
  expect(initial.progress).toMatchObject({watched:1,total:2,caughtUp:false});
  expect(initial.progress.nextEpisode.episodeNumber).toBe(2);
  const ids=initial.episodes.filter(ep=>ep.seasonNumber===1).map(ep=>ep.id);
  expect((await auth(request(app).post(`/series/${id}/watches`)).send({episodeIds:[ids[1]],dateWatched:'2020-01-01',requestId:crypto.randomUUID()})).status).toBe(400);
  const invalid=await auth(request(app).post(`/series/${id}/watches`)).send({episodeIds:[ids[1],'foreign'],dateWatched:'2026-09-01',requestId:crypto.randomUUID()});
  expect(invalid.status).toBe(404);
  expect((await query('SELECT COUNT(*)::int AS n FROM watchlogs')).rows[0].n).toBe(1);
  const input={episodeIds:ids,dateWatched:'2026-09-01',requestId:crypto.randomUUID()};
  expect((await auth(request(app).post(`/series/${id}/watches`)).send(input)).body).toEqual({added:1,skipped:1});
  expect((await auth(request(app).post(`/series/${id}/watches`)).send(input)).body).toEqual({added:0,skipped:2});
  const final=(await auth(request(app).get(`/series/${id}`))).body;
  expect(final.progress).toMatchObject({watched:2,total:2,caughtUp:true,finished:false});
  await auth(request(app).delete(`/logs/${first.body.id}`));
  expect((await auth(request(app).get(`/series/${id}`))).body.progress.watched).toBe(1);
});
test('film and general series entries remain distinct; cross-owner series access is rejected',async()=>{
  const film=await auth(request(app).post('/logs')).send({title:'Film',type:'movie',runtime:120});
  expect(film.body).toMatchObject({entryType:'film',watchedMinutes:120,episodeId:null});
  expect((await auth(request(app).post('/logs')).send(tvWatch({movieId:film.body.movieId}))).status).toBe(400);
  const legacy=await auth(request(app).post('/logs')).send({title:'General Series',type:'tv_series',runtime:900});
  expect(legacy.body).toMatchObject({entryType:'series',watchedMinutes:null,episodeId:null});
  expect((await auth(request(app).post('/logs')).send(tvWatch({episode:{seasonNumber:-1,episodeNumber:1}}))).status).toBe(400);
  await query("INSERT INTO users(id,email,display_name,email_verified_at) VALUES ('other','other@example.com','Other',NOW())");
  token=jwt.sign({id:'other',role:'user',version:0},process.env.JWT_SECRET);
  expect((await auth(request(app).get(`/series/${legacy.body.movieId}`))).status).toBe(404);
  expect((await auth(request(app).put(`/series/${legacy.body.movieId}/catalog`)).send({episodes:[]})).status).toBe(404);
});

test('migration preserves legacy film and series entries with honest durations',async()=>{
  await expect(transaction(async()=>{
    await query('CREATE SCHEMA tv_migration_fixture');
    await query('SET LOCAL search_path TO tv_migration_fixture');
    await query(`CREATE TABLE movies(id VARCHAR(100) PRIMARY KEY,user_id VARCHAR(100),type VARCHAR(32),runtime INTEGER,UNIQUE(id,user_id));
      CREATE TABLE watchlogs(id TEXT PRIMARY KEY,user_id VARCHAR(100),movie_id VARCHAR(100));
      INSERT INTO movies VALUES ('film','owner','movie',120),('series','owner','tv_series',900);
      INSERT INTO watchlogs VALUES ('old-film','owner','film'),('old-series','owner','series');`);
    await require('../lib/tvMigration')(query);
    expect((await query('SELECT id,episode_id,watched_minutes FROM watchlogs ORDER BY id')).rows).toEqual([
      {id:'old-film',episode_id:null,watched_minutes:120},{id:'old-series',episode_id:null,watched_minutes:null}
    ]);
    throw new Error('fixture rollback');
  })).rejects.toThrow('fixture rollback');
});


test('three-admin cap includes inactive admins and serializes competing promotions',async()=>{
  await query("UPDATE users SET role='admin' WHERE id='owner'");
  await query(`INSERT INTO users(id,email,display_name,role,is_active,email_verified_at) VALUES
    ('inactive','inactive@example.com','Inactive','admin',FALSE,NOW()),
    ('candidate1','candidate1@example.com','Candidate 1','user',TRUE,NOW()),
    ('candidate2','candidate2@example.com','Candidate 2','user',TRUE,NOW())`);
  const results=await Promise.all(['candidate1','candidate2'].map(id=>auth(request(app).put(`/admin/users/${id}/role`)).send({role:'admin'})));
  expect(results.map(r=>r.status).sort()).toEqual([200,409]);
  expect((await query("SELECT COUNT(*)::int AS n FROM users WHERE role='admin'")).rows[0].n).toBe(3);
  const winner=results.findIndex(r=>r.status===200)===0?'candidate1':'candidate2';
  const loser=winner==='candidate1'?'candidate2':'candidate1';
  expect((await auth(request(app).put(`/admin/users/${winner}/role`)).send({role:'user'})).status).toBe(200);
  expect((await auth(request(app).put(`/admin/users/${loser}/role`)).send({role:'admin'})).status).toBe(200);
});
test('unverified admins do not substitute for the last usable admin; promotions require verification',async()=>{
  await query("UPDATE users SET role='admin' WHERE id='owner'");
  await query(`INSERT INTO users(id,email,display_name,role) VALUES
    ('pending-admin','pending-admin@example.com','Pending admin','admin'),
    ('pending-user','pending-user@example.com','Pending user','user')`);
  const demotion=await auth(request(app).put('/admin/users/owner/role')).send({role:'user'});
  expect(demotion.status).toBe(400);
  expect(demotion.body.error).toMatch(/last verified active admin/i);
  const promotion=await auth(request(app).put('/admin/users/pending-user/role')).send({role:'admin'});
  expect(promotion.status).toBe(400);
  expect(promotion.body.error).toMatch(/verify/i);
});
test('admin seeding cannot bypass the three-admin cap',async()=>{
  await query("UPDATE users SET role='admin' WHERE id='owner'");
  await query(`INSERT INTO users(id,email,display_name,role) VALUES ('a2','a2@example.com','A2','admin'),('a3','a3@example.com','A3','admin')`);
  const config=require('../config'); const previous={...config.adminSeed};
  Object.assign(config.adminSeed,{enabled:true,email:'fourth@example.com',password:'unused-test-password',displayName:'Fourth'});
  try { await expect(require('../db').maybeSeedAdmin()).rejects.toThrow(/Only 3 admin/); }
  finally {Object.assign(config.adminSeed,previous);}
  expect((await query("SELECT COUNT(*)::int AS n FROM users WHERE role='admin'")).rows[0].n).toBe(3);
});


test('favourites belong to the owner and persist across rewatches and log edits',async()=>{
  const first=await auth(request(app).post('/logs')).send({title:'A Favourite',type:'movie',runtime:100});
  const movieId=first.body.movieId;
  const endpoint=`/logs/titles/${movieId}/favourite`;
  expect((await auth(request(app).patch(endpoint)).send({isFavourite:'true'})).status).toBe(400);
  expect((await auth(request(app).patch(endpoint)).send({isFavourite:true})).body.isFavourite).toBe(true);
  const repeat=await auth(request(app).post('/logs')).send({movieId,title:'A Favourite',type:'movie',runtime:100});
  expect(repeat.body.isFavourite).toBe(true);
  const edit=await auth(request(app).put(`/logs/${first.body.id}`)).send({...first.body,notes:'A lasting memory'});
  expect(edit.body.isFavourite).toBe(true);
  await query("INSERT INTO users(id,email,display_name,email_verified_at) VALUES ('outsider','outsider@example.com','Other',NOW())");
  const outsider=jwt.sign({id:'outsider',version:0},process.env.JWT_SECRET);
  expect((await request(app).patch(endpoint).set('Authorization','Bearer '+outsider).send({isFavourite:false})).status).toBe(404);
  expect((await auth(request(app).get(`/logs/${first.body.id}`))).body.isFavourite).toBe(true);
  expect((await auth(request(app).patch(endpoint)).send({isFavourite:false})).body.isFavourite).toBe(false);
});
