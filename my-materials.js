'use strict';
const $=id=>document.getElementById(id);
const statuses={private:'Prywatny',pending:'Oczekuje na weryfikację',rejected:'Do poprawy',published:'Publiczny'};
const types={link:'Odnośnik',pdf:'PDF',article:'Artykuł',course:'Kurs'};
let page=1,requestId=0,legacy=[],legacyLoaded=false;
function notice(text,error=false){$('mineMessage').textContent=text;$('mineMessage').classList.toggle('error',error);}
function element(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
function link(text,href){const el=element('a',text);el.href=href;return el;}
function materialCard(item){
 const row=element('article',undefined,'material');row.dataset.materialId=item.id;
 const body=element('div',undefined,'material-copy');
 const title=element('h2');title.append(link(item.title,`material.html?id=${encodeURIComponent(item.id)}`));
 body.append(element('p',statuses[item.publication_status]||'Prywatny','status-note'),title,element('p',types[item.type]||'Materiał','meta'),element('p',item.description));
 const tags=element('p');for(const tag of item.tags||[])tags.append(element('span',tag,'tag'));body.append(tags);
 if(item.review_note)body.append(element('p',`Uwagi administratora: ${item.review_note}`));
 const actions=element('div',undefined,'actions');actions.append(link('Edytuj',`material-editor.html?id=${encodeURIComponent(item.id)}`));
 const withdraw=['pending','published'].includes(item.publication_status),action=element('button',withdraw?'Wycofaj do prywatnych':'Przekaż do weryfikacji','secondary');action.type='button';
 action.onclick=async()=>{action.disabled=true;try{await api(`/materials/${item.id}/${withdraw?'withdraw':'submit'}`,{method:'POST',body:JSON.stringify({revision:item.revision})});await load();}catch(error){notice(error.message,true);}finally{action.disabled=false;}};
 actions.append(action);body.append(actions);row.append(body);return row;
}
function savedCard(resource){
 const row=element('article',undefined,'material'),body=element('div',undefined,'material-copy');row.dataset.resourceId=resource.id;
 body.append(element('p','Prywatny','status-note'),element('h2',resource.data?.title||`Zapisany materiał ${resource.id}`));
 const details=element('details'),summary=element('summary','Zobacz zapisaną treść'),content=element('pre',typeof resource.data==='string'?resource.data:JSON.stringify(resource.data,null,2));
 details.append(summary,content);body.append(details);row.append(body);return row;
}
async function load(){
 const current=++requestId,status=$('mineStatus').value,requestedPage=page;
 notice('Ładowanie Twoich materiałów…');$('retry').hidden=true;$('mineItems').setAttribute('aria-busy','true');
 $('previous').disabled=$('next').disabled=true;
 try{
  const params=new URLSearchParams({page:requestedPage,limit:20});if(status)params.set('status',status);
  const results=await Promise.allSettled([api(`/materials/mine?${params}`),legacyLoaded?Promise.resolve({resources:legacy}):api('/resources')]);
  if(current!==requestId)return;
  const [materials,saved]=results;if(saved.status==='fulfilled'){legacy=saved.value.resources;legacyLoaded=true;}
  const showLegacy=requestedPage===1&&(!status||status==='private');
  const items=materials.status==='fulfilled'?materials.value.items:[];
  $('mineItems').replaceChildren(...items.map(materialCard),...(showLegacy?legacy.map(savedCard):[]));
  const failed=results.find(result=>result.status==='rejected');
  if(failed){notice(`Nie udało się wczytać wszystkich materiałów. ${failed.reason.message}`,true);$('retry').hidden=false;}
  else{const count=materials.value.total+(!status||status==='private'?legacy.length:0);notice(count?`Liczba materiałów: ${count}`:'Brak materiałów w tym widoku. Dodaj pierwszy materiał lub zmień filtr.');}
  const total=materials.status==='fulfilled'?materials.value.total:0;
  $('pageInfo').textContent=`Strona ${requestedPage} z ${Math.max(1,Math.ceil(total/20))}`;$('previous').disabled=requestedPage===1;$('next').disabled=requestedPage*20>=total;
  $('pagination').hidden=total<=20;
 }catch(error){if(current===requestId){notice(error.message,true);$('retry').hidden=false;}}
 finally{if(current===requestId)$('mineItems').setAttribute('aria-busy','false');}
}
async function init(){
 if(!hasAuthToken()){$('loginRequired').hidden=false;return;}
 try{
  const {user}=await api('/me');setAccountUser(user);$('adminLink').hidden=user.role!=='admin';$('mine').hidden=$('create').hidden=$('logout').hidden=false;
  $('logout').onclick=()=>logoutAccount();
  $('mineStatus').onchange=()=>{page=1;load();};$('previous').onclick=()=>{page--;load();};$('next').onclick=()=>{page++;load();};$('retry').onclick=load;
  const status=new URLSearchParams(location.search).get('status');if(Object.hasOwn(statuses,status))$('mineStatus').value=status;
  await load();
 }catch(error){$('pageMessage').textContent=error.message;$('loginRequired').hidden=false;}
}
init();
