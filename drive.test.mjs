import test from 'node:test';import assert from 'node:assert/strict';import {Drive} from './drive.js';
test('Drive読み込みはページを最後まで取得し、既読ファイルは再取得しない',async()=>{const original=globalThis.fetch;const d=new Drive('x');d.token='test';d.expires=Date.now()+100000;const calls=[];globalThis.fetch=async url=>{const u=String(url);calls.push(u);if(u.includes('alt=media'))return Response.json({id:u.includes('/b?')?'event-b':'event-a'});return Response.json(u.includes('pageToken=next')?{files:[{id:'b'}]}:{files:[{id:'a'}],nextPageToken:'next'});};try{const cache=new Map();assert.equal((await d.readEvents(cache)).length,2);await d.readEvents(cache);assert.equal(calls.filter(u=>u.includes('alt=media')).length,2);}finally{globalThis.fetch=original;}});
test('認証切れは保存成功にしない',async()=>{const original=globalThis.fetch,d=new Drive('x');d.token='test';d.expires=Date.now()+100000;globalThis.fetch=async()=>new Response('',{status:401});try{await assert.rejects(()=>d.request('https://example.test'),/再接続/);assert.equal(d.connected,false);}finally{globalThis.fetch=original;}});

test('通常の再接続は前回のアカウントを指定し、切替時のみ選択を求める',async()=>{
 const original=globalThis.google;const requests=[];
 globalThis.google={accounts:{oauth2:{initTokenClient:config=>({requestAccessToken:options=>{requests.push(options);config.callback({access_token:'test',expires_in:3600});}})}}};
 try{const d=new Drive('test.apps.googleusercontent.com');d.request=async()=>Response.json({user:{emailAddress:'learner@example.test',permissionId:'test'}});
 await d.connect({email:'learner@example.test'});assert.deepEqual(requests[0],{prompt:'',login_hint:'learner@example.test'});
 await d.connect({email:'learner@example.test',switchAccount:true});assert.deepEqual(requests[1],{prompt:'select_account'});
 await d.connect();assert.deepEqual(requests[2],{prompt:''});
 }finally{globalThis.google=original;}
});
