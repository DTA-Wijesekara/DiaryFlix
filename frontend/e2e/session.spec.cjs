const { test, expect } = require('@playwright/test');
const user = { id: 'owner', email: 'owner@example.com', displayName: 'Owner', role: 'user', avatar:'O' };
const seed = [1,2,3].map(i=>({ id:'watch-'+i, movieId:'film', tmdbId:12, title:'Example Film', type:'movie', dateWatched:'2026-09-01', rating:8, rewatchCount:2, runtime:90, genres:[], actors:[], actresses:[] }));
async function mockAPI(page, options={}) {
  let logs=structuredClone(options.logs || seed);
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.port==='5179') return route.continue();
    if(url.port!=='5000') return route.abort();
    const path=url.pathname;
    let body;
    if(path==='/api/auth/login') body={token:'session-owner',user};
    else if(path==='/api/auth/me') { if(options.failMe) return route.abort(); body={user}; }
    else if(path==='/api/auth/register') body={verificationRequired:true,message:'Check your email to verify ownership.'};
    else if(path==='/api/logs') {
      if(route.request().method()==='POST') { const entry=route.request().postDataJSON(); body={...entry,id:'new-watch',movieId:entry.movieId||'new-film'}; logs.unshift(body); }
      else { if(options.waitLogs) await options.waitLogs; body=logs; }
    }
    else if(path.startsWith('/api/logs/titles/') && path.endsWith('/favourite')) { const id=path.split('/')[4]; const {isFavourite}=route.request().postDataJSON(); logs=logs.map(log=>log.movieId===id?{...log,isFavourite}:log); body={id,isFavourite}; }
    else if(path==='/api/wishlist') body=[{id:'wish',title:'Planned Film',type:'movie'}];
    else if(path==='/api/recommendations') body={recommendations:[],fallback:false};
    else body={};
    return route.fulfill({json:body});
  });
}
async function login(page) {
  await page.goto('/login');
  await page.locator('#login-email').fill(user.email);
  await page.locator('#login-password').fill('password123');
  await page.locator('#login-submit').click();
}
test('password login waits for data; counts and wishlist hydrate; logout clears private data',async ({page})=>{
  let release; const pending=new Promise(resolve=>{release=resolve;});
  await mockAPI(page,{waitLogs:pending});
  await login(page);
  await expect(page.locator('.dash-hello')).toHaveCount(0);
  release();
  await expect(page.locator('.dash-hello')).toBeVisible();
  const stats=await page.evaluate(async()=> (await import('/src/services/storage.js')).getStats());
  expect(stats.totalRewatches).toBe(2);
  expect(stats.avgRating).toBe('8.0');
  await page.goto('/wishlist');
  await expect(page.getByText('Planned Film',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>Object.keys(localStorage).some(k=>/^cinelog_(watch_log|wishlist)_/.test(k)))).toBe(false);
  await page.getByRole('button',{name:'Sign out',exact:true}).first().click();
  expect(await page.evaluate(()=>localStorage.getItem('cinelog_token'))).toBeNull();
  expect(await page.evaluate(async()=> (await import('/src/services/storage.js')).getAllLogs())).toEqual([]);
});
test('temporary session lookup failure preserves credentials and offers retry',async ({page})=>{
  await page.addInitScript(u=>{localStorage.setItem('cinelog_token','session-owner');localStorage.setItem('cinelog_session',JSON.stringify({userId:u.id,...u}));},user);
  await mockAPI(page,{failMe:true});
  await page.goto('/');
  await expect(page.getByRole('button',{name:'Retry connection'})).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('cinelog_token'))).toBe('session-owner');
});
test('registration displays verification and does not establish a session',async ({page})=>{
  await mockAPI(page); await page.goto('/register');
  await page.locator('#register-name').fill('New'); await page.locator('#register-email').fill('new@example.com');
  await page.locator('#register-password').fill('password123'); await page.locator('#register-confirm').fill('password123');
  await page.locator('#register-submit').click();
  await expect(page.getByText('Check your email to verify ownership.',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('cinelog_token'))).toBeNull();
});
test('manual log submission refreshes the diary',async ({page})=>{
  await mockAPI(page); await login(page); await expect(page.locator('.dash-hello')).toBeVisible();
  await page.goto('/log');
  await page.getByPlaceholder('Enter movie or TV series name').fill('New Diary Film');
  await page.locator('button[type=submit]').click();
  await expect(page).toHaveURL(/\/diary$/);
  await expect(page.getByText('New Diary Film',{exact:true})).toBeVisible();
});
test('late responses cannot populate another account cache',async ({page})=>{
  await mockAPI(page); await login(page); await expect(page.locator('.dash-hello')).toBeVisible();
  let release; const pending=new Promise(resolve=>{release=resolve;});
  await page.route('**/api/logs?*',async route=>{await pending;await route.fulfill({json:seed});});
  await page.evaluate(()=>{window.pendingFetch=import('/src/services/storage.js').then(s=>s.fetchLogsFromServer());});
  await page.evaluate(async()=>{const auth=await import('/src/services/auth.js');auth.logout();localStorage.setItem('cinelog_token','session-other');localStorage.setItem('cinelog_session',JSON.stringify({userId:'other'}));});
  release();
  await page.evaluate(()=>window.pendingFetch);
  expect(await page.evaluate(async()=> (await import('/src/services/storage.js')).getAllLogs())).toEqual([]);
});

test('rewatching retains movie identity and increments total rewatches once',async ({page})=>{
  await mockAPI(page); await login(page); await expect(page.locator('.dash-hello')).toBeVisible();
  await page.goto('/movie/watch-1');
  await page.getByRole('button',{name:'Log another watch',exact:true}).click();
  const sent=page.waitForRequest(request=>new URL(request.url()).pathname==='/api/logs' && request.method()==='POST');
  await page.locator('button[type=submit]').click();
  expect((await sent).postDataJSON().movieId).toBe('film');
  await expect(page).toHaveURL(/\/diary$/);
  expect(await page.evaluate(async()=> (await import('/src/services/storage.js')).getStats().totalRewatches)).toBe(3);
});


test('quick logging keeps optional details closed and preserves them in the saved watch', async ({page}) => {
  await mockAPI(page); await login(page); await expect(page.locator('.dash-hello')).toBeVisible();
  await page.goto('/log');
  await expect(page.getByRole('heading', {name:'Cast & Crew'})).toBeHidden();
  await page.getByLabel('Title', {exact:true}).fill('A quiet evening');
  await page.getByRole('button', {name:'8 out of 10', exact:true}).click();
  await page.getByLabel('Your note — optional').fill('A film worth revisiting.');
  await page.getByText('Add more details', {exact:false}).click();
  await page.getByLabel('Platform', {exact:true}).selectOption('Theater');
  const sent = page.waitForRequest(r => new URL(r.url()).pathname === '/api/logs' && r.method() === 'POST');
  await page.getByRole('button', {name:'Save watch', exact:true}).click();
  expect((await sent).postDataJSON()).toMatchObject({rating:8, platform:'Theater', notes:'A film worth revisiting.'});
  await expect(page).toHaveURL(/\/diary$/);
});

test('diary provides date and title views with working search', async ({page}) => {
  await mockAPI(page); await login(page); await expect(page.locator('.dash-hello')).toBeVisible();
  await page.goto('/diary');
  await page.getByRole('button', {name:'All dates', exact:true}).click();
  await page.getByLabel('Search diary').fill('Example');
  await expect(page.locator('.diary-entry')).toHaveCount(3);
  await page.getByLabel('Search diary').fill('missing title');
  await expect(page.getByRole('heading', {name:'No matching watches'})).toBeVisible();
  await page.getByRole('link', {name:'By title', exact:true}).click();
  await expect(page.locator('.movie-card')).toHaveCount(1);
  await expect(page.getByRole('link', {name:'View statistics'})).toBeVisible();
});

test('mobile logging has usable ratings, reachable save and no horizontal overflow', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await mockAPI(page); await login(page); await expect(page.locator('.dash-hello')).toBeVisible();
  await page.getByRole('navigation', {name:'Mobile navigation'}).getByRole('link', {name:'Log a watch'}).click();
  await page.getByLabel('Title', {exact:true}).fill('Mobile watch');
  await page.getByRole('button', {name:'7 out of 10', exact:true}).click();
  await expect(page.getByRole('button', {name:'7 out of 10', exact:true})).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/quick-log-mobile.png',fullPage:true});
  await page.getByRole('button', {name:'Save watch',exact:true}).click();
  await expect(page).toHaveURL(/\/diary$/);
});

test('search can fall back to manual entry when catalog is unavailable', async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('cinelog_tmdb_key','test-key'));
  await mockAPI(page); await login(page); await expect(page.locator('.dash-hello')).toBeVisible();
  await page.goto('/log');
  await page.getByRole('button', {name:'Can’t find it? Add manually'}).click();
  await expect(page.getByLabel('Title', {exact:true})).toBeVisible();
  await page.getByLabel('Title', {exact:true}).fill('Unlisted film');
  await page.getByRole('button', {name:'Save watch',exact:true}).click();
  await expect(page).toHaveURL(/\/diary$/);
});


test('watch details keep edit dialog keyboard accessible', async ({page}) => {
  await mockAPI(page); await login(page); await expect(page.locator('.dash-hello')).toBeVisible();
  await page.goto('/movie/watch-1');
  await expect(page.getByRole('button',{name:'Log another watch'})).toBeVisible();
  await page.getByRole('button',{name:'Edit this watch',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Edit this watch'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Close editor'})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Edit this watch',exact:true})).toBeFocused();
  await page.screenshot({path:'test-results/watch-detail-desktop.png',fullPage:true});
  await page.goto('/diary');
  await page.getByRole('button',{name:'All dates',exact:true}).click();
  await page.screenshot({path:'test-results/diary-desktop.png',fullPage:true});
});

test('mobile account sheet closes with Escape and restores focus', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await mockAPI(page); await login(page); await expect(page.locator('.dash-hello')).toBeVisible();
  await page.getByRole('button',{name:'Account and more'}).click();
  await expect(page.getByRole('dialog',{name:'More navigation'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Account and more'})).toBeFocused();
});


test('Google identity initializes once across remounts and uses the current receiver', async ({page}) => {
  await mockAPI(page); await page.goto('/login');
  const result = await page.evaluate(async () => {
    let initialized=0; let callback; const received=[];
    window.google={accounts:{id:{initialize(options){initialized++; callback=options.callback;}, renderButton(){}}}};
    const {renderGoogleButton}=await import('/src/services/googleIdentity.js');
    const container=document.createElement('div'); document.body.append(container);
    const first=renderGoogleButton('test-client',container,{onCredential:v=>received.push('first:'+v),onError(){}});
    first(); callback({credential:'ignored'});
    const second=renderGoogleButton('test-client',container,{onCredential:v=>received.push('second:'+v),onError(){}});
    callback({credential:'current'}); second(); container.remove();
    return {initialized,received};
  });
  expect(result).toEqual({initialized:1,received:['second:current']});
});

test('unverified login shows a persistent recovery action', async ({page}) => {
  await mockAPI(page);
  await page.route('**/api/auth/login', route => route.fulfill({status:403,json:{error:'Verify your email using Forgot password before signing in',code:'EMAIL_UNVERIFIED'}}));
  await login(page);
  await expect(page.getByRole('alert')).toContainText('Verify your email');
  await page.getByRole('link',{name:'Verify or recover your account'}).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
});


test('manual episode logging sends episode identity and retains film workflow',async({page})=>{
  await mockAPI(page); await login(page); await expect(page.locator('.dash-hello')).toBeVisible();
  await page.goto('/log');
  await page.getByPlaceholder('Enter movie or TV series name').fill('A Series');
  await page.getByRole('button',{name:'TV Series',exact:true}).click();
  await page.getByLabel('Entry type').selectOption('episode');
  await page.getByLabel('Season number').fill('2');
  await page.getByLabel('Episode number').fill('3');
  await page.getByLabel('Episode duration (minutes)').fill('45');
  const sent=page.waitForRequest(r=>new URL(r.url()).pathname==='/api/logs'&&r.method()==='POST');
  await page.getByRole('button',{name:'Save watch',exact:true}).click();
  const body=(await sent).postDataJSON();
  expect(body.type).toBe('tv_series');
  expect(body.episode).toMatchObject({seasonNumber:2,episodeNumber:3,runtime:45});
  expect(body.requestId.length).toBeGreaterThan(15);
  await expect(page).toHaveURL(/\/diary$/);
  await page.getByLabel('Content type').selectOption('movie');
  await expect(page.getByText('A Series',{exact:true})).toHaveCount(0);
});

test('watch time separates films, episodes, and series-level entries',async({page})=>{
  await mockAPI(page); await login(page); await expect(page.locator('.dash-hello')).toBeVisible();
  const stats=await page.evaluate(async()=>{
    const {dataCache}=await import('/src/services/dataCache.js');
    dataCache.setItem('cinelog_watch_log_owner',JSON.stringify([
      {id:'film',movieId:'film',type:'movie',runtime:120,watchedMinutes:120},
      {id:'ep1',movieId:'series',type:'tv_series',runtime:999,episodeId:'ep1',watchedMinutes:40},
      {id:'ep2',movieId:'series',type:'tv_series',runtime:999,episodeId:'ep2',watchedMinutes:50},
      {id:'general',movieId:'series',type:'tv_series',runtime:999,watchedMinutes:null}
    ]));
    return (await import('/src/services/storage.js')).getStats();
  });
  expect(stats.totalRewatches).toBe(0);
  expect(stats.totalEpisodes).toBe(2);
  expect(stats.totalFilms).toBe(1);
  expect(Number(stats.totalHoursWatched)).toBe(3.5);
  expect(stats.unknownDuration).toBe(1);
});


test('series detail opens next episode with correct identity and works on mobile',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await mockAPI(page);
  const series={...seed[0],id:'series-watch',movieId:'series',title:'Example Series',type:'tv_series',episodeId:'pilot',seasonNumber:1,episodeNumber:1,episodeTitle:'Pilot',watchedMinutes:40};
  await page.route('**/api/logs?*',r=>r.fulfill({json:[series]}));
  const next={id:'second',seasonNumber:1,episodeNumber:2,title:'Second Episode',runtime:45,airDate:'2020-01-02',watchCount:0,tmdbId:123};
  await page.route('**/api/series/series',r=>r.fulfill({json:{status:'watching',catalogComplete:true,seriesEnded:false,progress:{watched:1,total:2,nextEpisode:next,caughtUp:false,finished:false},episodes:[{...next,id:'pilot',episodeNumber:1,title:'Pilot',watchCount:1},next]}}));
  await login(page); await expect(page.locator('.dash-hello')).toBeVisible();
  await page.goto('/movie/series-watch');
  await expect(page.getByText('1 of 2 known released episodes watched')).toBeVisible();
  await page.screenshot({path:'test-results/series-progress-mobile.png',fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Log next episode'}).click();
  await expect(page.getByLabel('Episode number')).toHaveValue('2');
  await expect(page.getByLabel('Episode duration (minutes)')).toHaveValue('45');
  await expect(page.getByRole('checkbox',{name:'This is an intentional rewatch'})).not.toBeChecked();
  await page.screenshot({path:'test-results/episode-log-mobile.png',fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('TMDB season lookup populates episode metadata and failures preserve manual entry',async({page})=>{
  await mockAPI(page); await login(page); await expect(page.locator('.dash-hello')).toBeVisible();
  await page.evaluate(async()=>{(await import('/src/services/tmdb.js')).setTMDBKey('test-key');});
  await page.route('**/api.themoviedb.org/3/tv/12/season/1?*',r=>r.fulfill({json:{episodes:[{episode_number:4,name:'Fourth',runtime:48,air_date:'2020-01-04',id:400}]}}));
  await page.evaluate(async()=>{
    const {dataCache}=await import('/src/services/dataCache.js');
    dataCache.setItem('cinelog_watch_log_owner',JSON.stringify([{id:'tv-seed',movieId:'series',title:'Series',type:'tv_series',tmdbId:12,genres:[],actors:[],actresses:[]}]))
  });
  await page.route('**/api/series/series',r=>r.fulfill({json:{status:'watching',catalogComplete:false,progress:{watched:0,total:0},episodes:[]}}));
  // Navigate within the app so the in-memory cache is retained.
  await page.evaluate(()=>{window.history.pushState({},'', '/movie/tv-seed');window.dispatchEvent(new PopStateEvent('popstate'));});
  await page.getByRole('button',{name:'Log another watch',exact:true}).click();
  await page.getByLabel('Entry type').selectOption('episode');
  await page.getByRole('button',{name:'Find episodes in this season'}).click();
  await page.getByLabel('Choose episode').selectOption('0');
  await expect(page.getByLabel('Episode number')).toHaveValue('4');
  await expect(page.getByLabel('Episode duration (minutes)')).toHaveValue('48');
  await page.getByLabel('Season number').fill('2');
  await page.getByRole('button',{name:'Find episodes in this season'}).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('Episode number')).toBeEnabled();
});


test('admin dashboard shows three-admin limit and blocks unverified promotion',async({page})=>{
  await mockAPI(page);
  await page.route('**/api/auth/login',r=>r.fulfill({json:{token:'session-owner',user:{...user,role:'admin'}}}));
  await page.route('**/api/auth/me',r=>r.fulfill({json:{user:{...user,role:'admin'}}}));
  await page.route('**/api/admin/users',r=>r.fulfill({json:[
    ...[1,2,3].map(i=>({id:'admin'+i,email:`admin${i}@example.com`,displayName:'Admin '+i,role:'admin',isActive:i!==3,isVerified:true})),
    {id:'pending',email:'pending@example.com',displayName:'Pending Person',role:'user',isActive:true,isVerified:false}
  ]}));
  await page.route('**/api/admin/users/pending/stats',r=>r.fulfill({json:{totalWatched:2,avgRating:0}}));
  await login(page); await expect(page.locator('.dash-hello')).toBeVisible();
  await page.goto('/admin');
  await expect(page.getByText('3 / 3',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:/Pending Person/}).click();
  await expect(page.locator('.admin-role-select option[value="admin"]')).toBeDisabled();
  await expect(page.getByText('2 diary entries',{exact:true})).toBeVisible();
});


test('cinema landing has working sample filters and no mobile overflow',async({page})=>{
  await mockAPI(page);
  for(const width of [390,1365]) {
    await page.setViewportSize({width,height:900}); await page.goto('/');
    await expect(page.getByRole('heading',{name:'Loved the film. Forgotten the name?'})).toBeVisible();
    await page.getByRole('button',{name:'Watched in 2015',exact:true}).click();
    await expect(page.locator('.sample-entry')).toHaveCount(2);
    await page.getByRole('button',{name:'All memories',exact:true}).click();
    await expect(page.locator('.sample-entry')).toHaveCount(3);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.screenshot({path:`test-results/cinema-landing-${width}.png`,fullPage:true});
  }
  await page.goto('/login');
  await page.screenshot({path:'test-results/cinema-login-desktop.png',fullPage:true});
});
test('whole-year diary finds entries across months using watch year and notes',async({page})=>{
  await mockAPI(page,{logs:[
    {...seed[0],id:'jan',title:'January Memory',year:'2010',dateWatched:'2015-01-12',notes:'Rainy afternoon'},
    {...seed[0],id:'dec',title:'December Memory',dateWatched:'2015-12-20'},
    {...seed[0],id:'later',title:'Later Memory',dateWatched:'2024-01-01'}
  ]});
  await login(page); await expect(page.locator('.dash-hello')).toBeVisible();
  await page.goto('/diary?year=2015');
  await expect(page.getByLabel('Month',{exact:true})).toHaveValue('-1');
  await expect(page.locator('.diary-entry')).toHaveCount(2);
  await page.getByLabel('Search diary').fill('rainy');
  await expect(page.locator('.diary-entry')).toHaveCount(1);
  await expect(page.getByRole('heading',{name:/January Memory/})).toBeVisible();
});
test('favourite applies to a title across watches and persists after reload',async({page})=>{
  await mockAPI(page); await login(page); await expect(page.locator('.dash-hello')).toBeVisible();
  await page.goto('/movie/watch-1');
  await page.getByRole('button',{name:'Add to favourites',exact:true}).click();
  await expect(page.getByRole('button',{name:'Favourite',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.reload();
  await expect(page.getByRole('button',{name:'Favourite',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.goto('/library?favourites=true');
  await expect(page.locator('.movie-card')).toHaveCount(1);
  await page.locator('.movie-card').click();
  await page.getByRole('button',{name:'Favourite',exact:true}).click();
  await page.goto('/library?favourites=true');
  await expect(page.locator('.movie-card')).toHaveCount(0);
});
