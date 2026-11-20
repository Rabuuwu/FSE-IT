import test from 'node:test';
import assert from 'node:assert/strict';
import {metadataInput,quizInput,gradeQuiz} from '../server/learning-validation.js';
import {digestToken,mailConfigured,sendAccountMail} from '../server/recovery.js';
test('material metadata has bounded values and does not preserve arbitrary properties',()=>{
 assert.equal(metadataInput({level:'beginner',minutes:30,secret:'hidden'}).secret,undefined);
 for(const value of [null,[],{level:'expert'},{minutes:-1},{minutes:1.5},{language:'x'.repeat(41)}])assert.throws(()=>metadataInput(value),{status:400});
});
test('quiz validation and grading rejects invalid options and missing answers',()=>{
 const questions=quizInput({questions:[{text:'2+2?',options:['3','4'],answer:1,explanation:'Addition'}]});
 assert.deepEqual(gradeQuiz(questions,[1]),{correct:1,total:1});assert.deepEqual(gradeQuiz(questions,[0]),{correct:0,total:1});
 for(const answers of [[],[2],['1'],null])assert.throws(()=>gradeQuiz(questions,answers),{status:400});
 for(const questions of [null,[{text:'?',options:['a'],answer:0}],[{text:'?',options:['a','b'],answer:2}]])assert.throws(()=>quizInput({questions}),{status:400});
});
test('recovery hashes tokens and requires full mail configuration',()=>{
 assert.equal(digestToken('secret').length,64);assert.notEqual(digestToken('secret'),digestToken('other'));
 assert.equal(mailConfigured({}),false);assert.equal(mailConfigured({GMAIL_CLIENT_ID:'a',GMAIL_CLIENT_SECRET:'b',GMAIL_REFRESH_TOKEN:'c',MAIL_FROM:'sender@example.com',PUBLIC_APP_URL:'https://example.com'}),true);
});
test('mail uses HTTPS Gmail API and puts the action token only in URL fragment',async()=>{
 const original=global.fetch;const requests=[];global.fetch=async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>({access_token:'test-token'})};};
 try{await sendAccountMail({GMAIL_CLIENT_ID:'id',GMAIL_CLIENT_SECRET:'secret',GMAIL_REFRESH_TOKEN:'refresh',MAIL_FROM:'sender@example.com',PUBLIC_APP_URL:'https://example.com/fse/'},'recipient@example.com','reset','opaque-token');
 assert.equal(requests.length,2);assert.equal(requests[1].url,'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
 const message=Buffer.from(JSON.parse(requests[1].options.body).raw,'base64url').toString();assert.match(message,/https:\/\/example.com\/fse\/recovery.html#purpose=reset&token=opaque-token/);
 }finally{global.fetch=original;}
});

test('encrypted outbox detects tampering and cannot be decrypted with another signing secret',async()=>{
 const {encryptMessage,decryptMessage}=await import('../server/recovery.js');const env={JWT_SECRET:'independent-test-secret'};
 const ciphertext=encryptMessage(env,'one-time-token');assert.ok(!ciphertext.includes('one-time-token'));assert.equal(decryptMessage(env,ciphertext),'one-time-token');
 assert.throws(()=>decryptMessage({JWT_SECRET:'other'},ciphertext));const bytes=Buffer.from(ciphertext,'base64');bytes[30]^=1;assert.throws(()=>decryptMessage(env,bytes.toString('base64')));
});
