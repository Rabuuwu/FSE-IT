import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { validateCredentials, validateLogin, positiveId, materialInput, listInput, trustProxyHops } from '../server/validation.js';
import { transaction } from '../server/transaction.js';

const material = { type:'link',title:'Python',description:'Learn Python',url:'https://example.com',tags:['Python','python'],published:true };
test('credentials normalize email and reject bcrypt truncation and invalid types', () => {
    assert.equal(validateCredentials({email:' USER@Example.com ',password:'long-password'}).email,'user@example.com');
    for(const password of ['short',{},'ą'.repeat(37),'x'.repeat(73)]) assert.throws(()=>validateCredentials({email:'a@example.com',password}),{status:400});
    assert.throws(()=>validateCredentials({email:'bad',password:'long-password'}),{status:400});
    // Existing users may have a shorter historical password; registration policy must not lock them out.
    assert.equal(validateLogin({email:'a@example.com',password:'old'}).password,'old');
});
test('catalog validates types, publication, tags and unsafe URLs', () => {
    assert.deepEqual(materialInput(material).tags,['python']);
    for(const url of ['http://example.com','javascript:alert(1)','https://a:b@example.com']) assert.throws(()=>materialInput({...material,url}),{status:400});
    for(const change of [{type:'unknown'},{published:'true'},{tags:'python'},{tags:['']},{title:''}]) assert.throws(()=>materialInput({...material,...change}),{status:400});
    assert.throws(()=>materialInput({...material,type:'course',stages:[]}),{status:400});
    assert.equal(materialInput({...material,type:'course',stages:[{title:'First',content:'Text'}]}).stages.length,1);
});
test('identifiers and pagination reject SQL fragments, negative and oversized values',()=>{
    for(const value of ['1 OR 1=1','-1','0','1.2','2147483648',[],null]) assert.throws(()=>positiveId(value),{status:400});
    assert.equal(positiveId('12'),12);
    assert.deepEqual(listInput({}),{page:1,limit:20,q:'',tag:'',type:''});
    assert.throws(()=>listInput({limit:'101'}),{status:400});
    assert.throws(()=>listInput({type:'invalid'}),{status:400});
});
test('trusted proxy hop configuration accepts only explicit non-negative integers',()=>{
    assert.equal(trustProxyHops(undefined),undefined);
    assert.equal(trustProxyHops('0'),0);
    assert.equal(trustProxyHops('2'),2);
    for(const value of [' ', '-1', '1.5', '1e2', '01', 'true', '9007199254740992']) {
        assert.throws(()=>trustProxyHops(value),{status:400});
    }
});
test('Markdown escapes raw HTML, attributes, scripts and hostile links',()=>{
    const context=vm.createContext({URL});vm.runInContext(readFileSync(new URL('../utils.js',import.meta.url),'utf8'),context);
    for(const source of ['<img src=x onerror=alert(1)>','<script>alert(1)</script>','[click](javascript:alert(1))','```\n</code><svg onload=alert(1)>']){
        const result=vm.runInContext(`markdownToHtml(${JSON.stringify(source)})`,context);
        assert.doesNotMatch(result,/<(?:img|script|svg)|href\s*=/i);
    }
    assert.match(vm.runInContext('markdownToHtml("# Hello\\n**World**")',context),/<h1>Hello<\/h1>/);
    assert.equal(vm.runInContext('safeHttpsUrl("javascript:alert(1)")',context),null);
    assert.equal(vm.runInContext('safeHttpsUrl("https://a:b@example.com")',context),null);
});
test('transaction commits on one checked-out connection and always releases it',async()=>{
    const calls=[];const client={query:async sql=>calls.push(sql),release:()=>calls.push('release')};
    assert.equal(await transaction({connect:async()=>client},async tx=>{assert.equal(tx,client);await tx.query('write');return 42;}),42);
    assert.deepEqual(calls,['BEGIN','write','COMMIT','release']);
});
test('failure halfway through a course rolls back and releases the connection',async()=>{
    const calls=[];const client={query:async sql=>calls.push(sql),release:()=>calls.push('release')};
    await assert.rejects(transaction({connect:async()=>client},async tx=>{await tx.query('course inserted');throw new Error('stage failed');}),/stage failed/);
    assert.deepEqual(calls,['BEGIN','course inserted','ROLLBACK','release']);
});

test('production DB connections enforce verified TLS even with unsafe connection-string options', async()=>{
    const {buildPoolConfig}=await import('../server/database-config.js');
    const config=buildPoolConfig({NODE_ENV:'production',DATABASE_URL:'postgresql://user:password@example.com/db?sslmode=no-verify',PGPOOL_MAX:'3'});
    assert.equal(config.ssl.rejectUnauthorized,true);
    assert.equal(new URL(config.connectionString).searchParams.has('sslmode'),false);
    assert.equal(config.max,3);
    assert.equal(buildPoolConfig({DATABASE_URL:'postgresql://user:password@localhost/db'}).ssl,undefined);
    assert.throws(()=>buildPoolConfig({PGPOOL_MAX:'-1'}),/PGPOOL_MAX/);
});
