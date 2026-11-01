const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

const source = readFileSync('public/js/cinema.js', 'utf8') + '\n' + readFileSync('public/js/playback.js', 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));
const response = results => ({ ok: true, json: async () => ({source: 'open', results, page: 1, has_more: true}) });
const title = (id, name) => ({id, title: name, type: 'Movies', year: '2024', genre: 'Drama', genres: ['Drama'], rating: '8', image: null, description: 'A story.'});

function setup(fetch, storage = new Map(), database = {profiles:new Map(), lists:new Map(), failWrites:false}) {
    const elements = new Map();
    function element(selector) {
        if (!elements.has(selector)) elements.set(selector, {
            innerHTML: '', textContent: '', value: '', style: {}, hidden: false, listeners: {},
            content: 'test-csrf', contentWindow:{}, setAttribute() {}, querySelectorAll() { return []; }, focus() {},
            addEventListener(event, handler) { this.listeners[event] = handler; },
            showModal() { this.open = true; }, close() { this.open = false; },
        });
        return elements.get(selector);
    }
    const context = vm.createContext({
        document: {querySelector: element, querySelectorAll: () => []},
        localStorage: {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value)},
        fetch: async (url, options = {}) => {
            if (!url.startsWith('/profiles')) return fetch(url, options);
            const parts = url.split('/').map(decodeURIComponent);
            const method = options.method || 'GET';
            const body = options.body ? JSON.parse(options.body) : null;
            const result = data => ({ok:true,json:async () => data});
            if (database.failWrites && method !== 'GET') return {ok:false,status:503,json:async () => ({})};
            if (parts.length === 2) return result({profiles:[...database.profiles.values()].map(profile => ({...profile}))});
            if (parts.length === 3) {
                const profile = {id:parts[2],...body}; database.profiles.set(parts[2],profile);
                return result({profile});
            }
            if (!database.lists.has(parts[2])) database.lists.set(parts[2],new Map());
            const list = database.lists.get(parts[2]);
            if (method === 'GET') return result({titles:[...list.values()]});
            if (method === 'PUT') list.set(parts[4],{id:parts[4],...body});
            if (method === 'DELETE') list.delete(parts[4]);
            return result({saved:method === 'PUT'});
        }, AbortController, URLSearchParams, URL, window:{addEventListener() {}}, crypto: {randomUUID: () => 'new-profile'},
        setTimeout: () => 1, clearTimeout() {},
    });
    vm.runInContext(source, context);
    return {run: code => vm.runInContext(code, context), element, storage, database};
}

test('offline preview remains searchable and does not refetch on navigation', async () => {
    let calls = 0;
    const app = setup(async () => { calls++; return {ok: true, json: async () => ({source: 'demo'})}; });
    await settle();
    app.run("query = 'interstellar'; render();");
    assert.match(app.element('#catalog').innerHTML, /Interstellar/);
    assert.doesNotMatch(app.element('#catalog').innerHTML, /Oppenheimer/);
    await app.run("page = 'Movies'; loadCatalog();");
    assert.equal(calls, 1);
    assert.equal(app.element('#load-more').hidden, true);
});

test('a stale search response cannot overwrite the latest results', async () => {
    const pending = [];
    const app = setup(() => new Promise(resolve => pending.push(resolve)));
    const next = app.run("query = 'Latest'; loadCatalog();");
    pending[1](response([title('movie:2', 'Latest title')]));
    await next;
    pending[0](response([title('movie:1', 'Old result')]));
    await settle();
    assert.match(app.element('#catalog').innerHTML, /Latest title/);
    assert.doesNotMatch(app.element('#catalog').innerHTML, /Old result/);
});

test('saved live titles survive reloads and stay separate between profiles', async () => {
    const storage = new Map([['void.active', JSON.stringify('joen')], ['void.lists', JSON.stringify({joen:[1]})]]);
    const app = setup(async () => response([title('movie:42', 'Saved live title')]), storage);
    await settle();
    await app.run("toggleSave('movie:42');");
    assert.deepEqual(JSON.parse(storage.get('void.lists')).joen, ['movie:693134', 'movie:42']);
    const reloaded = setup(async () => ({ok: true, json: async () => ({source:'demo'})}), storage, app.database);
    await settle();
    reloaded.run("page = 'My list'; render();");
    assert.match(reloaded.element('#catalog').innerHTML, /Saved live title/);
    assert.match(reloaded.element('#catalog').innerHTML, /Dune: Part Two/);
    reloaded.run("activeProfile = profiles.find(profile => profile.id === 'guest'); render();");
    assert.doesNotMatch(reloaded.element('#catalog').innerHTML, /Saved live title/);
});

test('database watchlists survive clearing browser storage', async () => {
    const app = setup(async () => response([title('movie:42','A saved movie')]), new Map([['void.active',JSON.stringify('joen')]]));
    await settle();
    await app.run("toggleSave('movie:42')");
    const cleanBrowser = setup(async () => ({ok:true,json:async () => ({source:'demo'})}), new Map(), app.database);
    await settle();
    await cleanBrowser.run("selectProfile('joen')");
    cleanBrowser.run("page = 'My list'; render()");
    assert.match(cleanBrowser.element('#catalog').innerHTML, /A saved movie/);
});

test('failed saves do not change the list or claim success', async () => {
    const app = setup(async () => response([title('movie:42','A saved movie')]), new Map([['void.active',JSON.stringify('joen')]]));
    await settle();
    app.database.failWrites = true;
    await app.run("toggleSave('movie:42')");
    assert.equal(app.run("saved().includes('movie:42')"),false);
    assert.match(app.element('#toast').textContent,/Could not reach/);
});

test('legacy import runs once and does not resurrect removed titles', async () => {
    const storage = new Map([['void.active',JSON.stringify('joen')],['void.lists',JSON.stringify({joen:[1]})]]);
    const app = setup(async () => ({ok:true,json:async () => ({source:'demo'})}),storage);
    await settle();
    assert.equal(app.database.lists.get('joen').size,1);
    app.database.lists.get('joen').clear();
    const reloaded = setup(async () => ({ok:true,json:async () => ({source:'demo'})}),storage,app.database);
    await settle();
    assert.equal(reloaded.database.lists.get('joen').size,0);
    assert.equal(reloaded.run('saved().length'),0);
});

test('pagination deduplicates titles and failures preserve the current collection', async () => {
    let count = 0;
    const app = setup(async () => {
        count++;
        if (count === 3) return {ok: false};
        return {ok:true, json:async () => ({source:'open',results:count === 1 ? [title('movie:42','First')] : [title('movie:42','First'),title('movie:43','Second')],page:count,has_more:true})};
    });
    await settle();
    await app.run('loadCatalog(true)');
    assert.equal(app.run('catalog.length'), 2);
    await app.run('loadCatalog(true)');
    assert.equal(app.run('catalog.length'), 2);
    assert.equal(app.element('#catalog-retry').hidden, false);
    assert.equal(app.element('#load-more').disabled, false);
});

test('external titles are escaped and missing artwork has a placeholder', async () => {
    const app = setup(async () => response([title('movie:9', '<img src=x onerror=alert(1)>')]));
    await settle();
    const html = app.element('#catalog').innerHTML;
    assert.match(html, /&lt;img/);
    assert.doesNotMatch(html, /<img src=x/);
    assert.match(html, /No poster available/);
});

test('new catalog artwork and source credits survive a watchlist reload', async () => {
    const movie = {...title('wiki:aaaaaaaaaaaaaaaaaaaaaaaa', 'Wikipedia movie'), image:'https://upload.wikimedia.org/poster.jpg', source_url:'https://en.wikipedia.org/wiki/Example'};
    const storage = new Map([['void.active', JSON.stringify('joen')]]);
    const app = setup(async () => response([movie]), storage);
    await settle();
    await app.run("toggleSave('wiki:aaaaaaaaaaaaaaaaaaaaaaaa')");
    const reloaded = setup(async () => response([]), storage, app.database);
    await settle();
    reloaded.run("showDetails('wiki:aaaaaaaaaaaaaaaaaaaaaaaa')");
    assert.match(reloaded.element('#detail-content').innerHTML, /upload.wikimedia.org/);
    assert.match(reloaded.element('#detail-content').innerHTML, /Wikipedia · adapted synopsis/);
    assert.equal(reloaded.run("sourceCredit({source_url:'javascript:alert(1)'})"), '');
});

test('a partial catalog failure keeps available titles and offers retry', async () => {
    const app = setup(async () => ({ok:true,json:async () => ({source:'open',results:[title('wiki:aaaaaaaaaaaaaaaaaaaaaaaa','Available movie')],page:1,has_more:false,unavailable:['tvmaze']})}));
    await settle();
    assert.match(app.element('#catalog').innerHTML, /Available movie/);
    assert.match(app.element('#catalog-status').textContent, /Part of the catalog/);
    assert.equal(app.element('#catalog-retry').hidden, false);
});

test('movie player uses a fixed sandboxed origin and resumes only trusted progress for the selected profile', async () => {
    const storage = new Map([['void.active', JSON.stringify('joen')]]);
    const app = setup(async url => url.startsWith('/playback/') ? {ok:true,json:async () => ({type:'movie',id:'42',seasons:[]})} : response([title('movie:42','Watch this')]), storage);
    await settle();
    await app.run("openPlayer('movie:42')");
    const html = app.element('#player-frame').innerHTML;
    assert.match(html, /https:\/\/cinesrc.st\/embed\/movie\/42/);
    assert.match(html, /sandbox="allow-scripts allow-same-origin allow-presentation"/);
    assert.doesNotMatch(html, /allow-popups|test-csrf|joen/);
    app.run("handlePlayerMessage({origin:'https://evil.example',source:$('#cinesrc-player').contentWindow,data:{type:'cinesrc:timeupdate',currentTime:120,duration:600}})");
    assert.equal(storage.has('void.playback.v1'),false);
    app.run("handlePlayerMessage({origin:'https://cinesrc.st',source:{},data:{type:'cinesrc:timeupdate',currentTime:120,duration:600}})");
    assert.equal(storage.has('void.playback.v1'),false);
    app.run("handlePlayerMessage({origin:'https://cinesrc.st',source:$('#cinesrc-player').contentWindow,data:{type:'cinesrc:timeupdate',currentTime:120,duration:600}})");
    app.run('closePlayer()');
    await app.run("openPlayer('movie:42')");
    assert.match(app.element('#player-frame').innerHTML, /t=120/);
    app.run("closePlayer(); activeProfile = profiles.find(profile => profile.id === 'guest')");
    await app.run("openPlayer('movie:42')");
    assert.doesNotMatch(app.element('#player-frame').innerHTML, /[?&]t=120/);
});

test('closing the player cancels a late mapping response', async () => {
    let finish;
    const app = setup(async url => url.startsWith('/playback/') ? new Promise(resolve => { finish = resolve; }) : response([title('movie:42','Watch this')]), new Map([['void.active',JSON.stringify('joen')]]));
    await settle();
    const pending = app.run("openPlayer('movie:42')");
    app.run('closePlayer()');
    finish({ok:true,json:async () => ({type:'movie',id:'42',seasons:[]})});
    await pending;
    assert.equal(app.element('#player-frame').innerHTML,'');
    assert.equal(app.element('#player').open,false);
});
