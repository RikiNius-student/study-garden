export const TYPES={quick:{label:'一問一答',factor:1},explain:{label:'単語説明',factor:1},topic:{label:'トピック解説',factor:2}};
export const DAY=86400000;
export function fresh(){return {ok:0,retry:0,due:0,completed:false,last:null};}
export function rate(previous,grade,type,now){
 if(!['OK','微妙','NO'].includes(grade)||!TYPES[type])throw Error('評価または形式が不正です');
 const s={...fresh(),...previous};const factor=TYPES[type].factor;
 if(grade==='OK'){s.ok++;s.retry=0;s.completed=s.ok>=3;s.due=s.completed?null:now+[7,14][s.ok-1]*DAY*factor;}
 else{s.ok=0;s.completed=false;s.retry++;s.due=now+[.25,1,3,5][Math.min(s.retry-1,3)]*DAY*factor;}
 s.last=grade;return s;
}
export function replay(input){
 const events=[...new Map(input.map(e=>[e.id,e])).values()].sort((a,b)=>a.clock-b.clock||a.id.localeCompare(b.id));
 const cards=Object.create(null),genres=Object.create(null),conflicts=[];
 for(const e of events){
  if(e.kind==='genre.put'){genres[e.entity]={...e.value,id:e.entity};continue;}
  if(e.kind==='card.put'){
   const old=cards[e.entity];
   if((old?.rev??null)!==(e.base??null)){conflicts.push(e);continue;}
   cards[e.entity]={...e.value,id:e.entity,schedule:old?.schedule??fresh(),rev:e.id,previousRating:old?.previousRating??null};
  }else if(e.kind==='card.rate'){
   const c=cards[e.entity];if(!c)continue;
   if(c.rev!==e.base){conflicts.push(e);continue;}
   c.previousRating={target:e.id,schedule:{...c.schedule}};c.schedule=rate(c.schedule,e.grade,c.type,e.at);c.rev=e.id;
  }else if(e.kind==='card.undo'){
   const c=cards[e.entity];if(c?.previousRating?.target===e.target && c.rev===e.base){c.schedule=c.previousRating.schedule;c.previousRating=null;c.rev=e.id;}else conflicts.push(e);
  }else if(e.kind==='card.restart'){
   const c=cards[e.entity];if(c?.rev===e.base){c.schedule=fresh();c.previousRating=null;c.rev=e.id;}else conflicts.push(e);
  }else if(e.kind==='conflict.dismiss'){
   const i=conflicts.findIndex(x=>x.id===e.target);if(i>=0)conflicts.splice(i,1);
  }
 }
 return {cards:Object.values(cards),genres:Object.values(genres),conflicts};
}
export function dueCards(cards,now=Date.now(),genre='',type=''){return cards.filter(c=>!c.paused&&!c.schedule.completed&&(c.schedule.due??0)<=now&&(!genre||c.genre===genre)&&(!type||c.type===type));}
export function shuffle(items,random=Math.random){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export function parseCSV(text){
 text=text.replace(/^\uFEFF/,'');const rows=[];let row=[],cell='',quote=false;
 for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quote&&text[i+1]==='"'){cell+='"';i++;}else if(quote||cell==='')quote=!quote;else throw Error('CSVの引用符が不正です');}
 else if(ch===','&&!quote){row.push(cell);cell='';}else if((ch==='\n'||ch==='\r')&&!quote){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x!==''))rows.push(row);row=[];cell='';}else cell+=ch;}
 if(quote)throw Error('CSVの引用符が閉じていません');row.push(cell);if(row.some(x=>x!==''))rows.push(row);return rows;
}
export function csvCell(v){let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export function exportCSV(cards,genres){return '\uFEFF'+[['id','形式','ジャンル','問題','解答','参照先','画像数'],...cards.map(c=>[c.id,TYPES[c.type].label,genres.find(g=>g.id===c.genre)?.name??'',c.question,c.answer,c.reference,c.images?.length??0])].map(r=>r.map(csvCell).join(',')).join('\r\n');}
export function importCSV(text){
 const rows=parseCSV(text);if(rows.length<2)throw Error('見出しと問題を1件以上入れてください');const head=rows.shift();
 const index=n=>head.indexOf(n);for(const n of ['形式','ジャンル','問題'])if(index(n)<0)throw Error(`「${n}」列が必要です`);
 return rows.map((r,i)=>{const get=n=>r[index(n)]??'';const type=Object.keys(TYPES).find(k=>TYPES[k].label===get('形式')||k===get('形式'));if(!type||!get('問題').trim())throw Error(`${i+2}行目の形式または問題を確認してください`);if(type!=='topic'&&!get('解答').trim())throw Error(`${i+2}行目に解答がありません`);return {type,genreName:get('ジャンル').trim()||'未分類',question:get('問題'),answer:get('解答'),reference:get('参照先'),images:[],paused:false};});
}
export function validateEvent(e){
 if(!e||typeof e.id!=='string'||e.id.length>100||!Number.isSafeInteger(e.clock)||e.clock<0||!Number.isFinite(e.at))throw Error('履歴の形式が不正です');
 if(!['card.put','card.rate','card.undo','card.restart','genre.put','conflict.dismiss'].includes(e.kind))throw Error('未対応の履歴です');
 if(e.kind!=='conflict.dismiss'&&(typeof e.entity!=='string'||e.entity.length>100))throw Error('IDが不正です');
 if(e.kind==='card.put'){const v=e.value;if(!v||!TYPES[v.type]||typeof v.question!=='string'||!v.question.trim()||v.question.length>20000||typeof v.genre!=='string'||typeof v.answer!=='string'||typeof v.reference!=='string'||!Array.isArray(v.images)||v.images.length>4)throw Error('問題データが不正です');for(const im of v.images)if(typeof im!=='string'||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(im)||im.length>1200000)throw Error('画像データが不正です');}
 if(e.kind==='card.rate'&&!['OK','微妙','NO'].includes(e.grade))throw Error('評価が不正です');
 if(e.kind==='genre.put'&&(!e.value||typeof e.value.name!=='string'||!e.value.name.trim()||e.value.name.length>100))throw Error('ジャンルが不正です');return e;
}
