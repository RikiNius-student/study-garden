import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('./app.js',import.meta.url),'utf8');
test('処理中は共通表示、成功・失敗後は解除、二重実行は防止',async()=>{
 const status={hidden:true,open:false,showPopover(){this.open=true;},hidePopover(){this.open=false;}};
 const attrs=new Map(),errors=[];
 const ctx=vm.createContext({$:()=>status,document:{body:{toggleAttribute:(k,v)=>v?attrs.set(k,''):attrs.delete(k),setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k)}},fail:e=>errors.push(e.message)});
 vm.runInContext('let busy=false;'+source.slice(source.indexOf('function setLoading'),source.indexOf('async function persist'))+';globalThis.run=task;',ctx);
 let release;const pending=ctx.run(()=>new Promise(r=>{release=r;}));assert.equal(status.open,true);assert.equal(status.hidden,false);assert.equal(attrs.get('aria-busy'),'true');
 let duplicate=false;await ctx.run(()=>{duplicate=true;});assert.equal(duplicate,false);
 release();await pending;assert.equal(status.hidden,true);assert.equal(status.open,false);assert.equal(attrs.has('aria-busy'),false);
 await ctx.run(()=>{throw Error('通信失敗');});assert.deepEqual(errors,['通信失敗']);assert.equal(status.hidden,true);assert.equal(status.open,false);
});
