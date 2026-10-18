const API='https://www.googleapis.com/drive/v3/files';
const APP='study-garden-v1';
export class Drive {
 constructor(clientId){this.clientId=clientId;this.token=null;this.expires=0;this.folder=null;this.account=null;}
 async connect(){
  if(!globalThis.google?.accounts?.oauth2)throw Error('Googleの認証機能を読み込めません。通信を確認して再読み込みしてください。');
  if(!this.clientId.endsWith('.apps.googleusercontent.com'))throw Error('設定でGoogleクライアントIDを入力してください');
  const result=await new Promise((resolve,reject)=>{const client=google.accounts.oauth2.initTokenClient({client_id:this.clientId,scope:'https://www.googleapis.com/auth/drive.file',callback:r=>r.error?reject(Error(r.error)):resolve(r),error_callback:()=>reject(Error('Googleへの接続を完了できませんでした。もう一度お試しください。'))});client.requestAccessToken({prompt:'select_account'});});
  this.token=result.access_token;this.expires=Date.now()+Number(result.expires_in)*1000-60000;
  const r=await this.request('https://www.googleapis.com/drive/v3/about?fields=user(permissionId,emailAddress)');this.account=(await r.json()).user;return this.account;
 }
 get connected(){return !!this.token&&Date.now()<this.expires;}
 disconnect(){this.token=null;this.expires=0;this.folder=null;this.account=null;}
 async request(url,options={}){if(!this.connected)throw Error('Googleドライブに再接続してください。まだ保存されていない操作はこの端末に保持されています。');const r=await fetch(url,{...options,headers:{...options.headers,Authorization:`Bearer ${this.token}`}});if(r.status===401){this.disconnect();throw Error('接続期限が切れました。Googleドライブに再接続してください。');}if(!r.ok)throw Error(`Googleドライブへの保存・読み込みに失敗しました（${r.status}）。接続や空き容量を確認してください。`);return r;}
 async list(kind){const q=`trashed = false and appProperties has { key='app' and value='${APP}' } and appProperties has { key='kind' and value='${kind}' }`;let page='',out=[];do{const url=new URL(API);url.searchParams.set('q',q);url.searchParams.set('fields','nextPageToken,files(id,name,appProperties)');url.searchParams.set('pageSize','1000');if(page)url.searchParams.set('pageToken',page);const r=await (await this.request(url)).json();out.push(...r.files);page=r.nextPageToken;}while(page);return out;}
 async ensureFolder(){if(this.folder)return this.folder;const folders=await this.list('folder');if(folders.length){this.folder=folders.sort((a,b)=>a.id.localeCompare(b.id))[0].id;return this.folder;}const r=await this.request(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Study Garden — 学習データ',mimeType:'application/vnd.google-apps.folder',appProperties:{app:APP,kind:'folder'}})});this.folder=(await r.json()).id;return this.folder;}
 async readEvents(cache=new Map()){const files=await this.list('event');const unknown=files.filter(f=>!cache.has(f.id));for(let i=0;i<unknown.length;i+=5){await Promise.all(unknown.slice(i,i+5).map(async f=>{const e=await (await this.request(`${API}/${encodeURIComponent(f.id)}?alt=media`)).json();cache.set(f.id,e);}));}const present=new Set(files.map(f=>f.id));for(const id of cache.keys())if(!present.has(id))cache.delete(id);return [...cache.values()];}
 async append(event){const folder=await this.ensureFolder();const boundary='study_'+crypto.randomUUID().replaceAll('-','');const metadata={name:`${event.at}-${event.id}.json`,parents:[folder],mimeType:'application/json',appProperties:{app:APP,kind:'event',eventId:event.id}};const body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(event)}\r\n--${boundary}--`;
 const r=await this.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body});return (await r.json()).id;}
}
