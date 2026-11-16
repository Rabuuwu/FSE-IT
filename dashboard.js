'use strict';
const $=id=>document.getElementById(id);
const statuses={private:'Prywatny',pending:'Oczekuje na weryfikację',rejected:'Do poprawy',published:'Publiczny'};
function element(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
function link(text,href){const el=element('a',text);el.href=href;return el;}
function message(id,text,error=false){$(id).textContent=text;$(id).classList.toggle('error',error);}
function cards(items,target,editable=false){
 $(target).replaceChildren(...items.map(item=>{
  const row=element('article',undefined,'material'),body=element('div',undefined,'material-copy'),title=element('h3');
  title.append(link(item.title,`material.html?id=${encodeURIComponent(item.id)}`));
  if(editable)body.append(element('p',statuses[item.publication_status]||'Prywatny','meta'));
  body.append(title,element('p',item.description||''));
  if(editable&&item.review_note)body.append(element('p',`Uwagi administratora: ${item.review_note}`));
  row.append(body);if(editable)row.append(link('Edytuj',`material-editor.html?id=${encodeURIComponent(item.id)}`));return row;
 }));
}
async function summary(){
 $('summaryRetry').disabled=true;$('summaryRetry').hidden=true;message('summaryMessage','Ładowanie podsumowania…');
 try{
  const [materials,resources]=await Promise.allSettled([api('/materials/mine?limit=5'),api('/resources')]);
  if(materials.status==='fulfilled'){
   const data=materials.value,c=data.counts;
   $('countPending').textContent=c.pending;$('countRejected').textContent=c.rejected;$('countPublished').textContent=c.published;
   cards(data.items,'recentMaterials',true);message('recentMessage',data.items.length?'':'Nie masz jeszcze materiałów. Utwórz pierwszy lub zajrzyj do katalogu.');
  }else{cards([],'recentMaterials');message('recentMessage','Nie udało się pobrać Twoich materiałów.',true);for(const id of ['countPending','countRejected','countPublished'])$(id).textContent='—';}
  if(materials.status==='fulfilled'&&resources.status==='fulfilled'){
   const saved=resources.value.resources.length;
   $('countTotal').textContent=materials.value.total+saved;$('countPrivate').textContent=materials.value.counts.private+saved;
   message('summaryMessage',materials.value.counts.rejected?'Masz materiały do poprawy. Otwórz je i sprawdź uwagi administratora.':'Podsumowanie obejmuje Twoje materiały i wcześniej zapisane prywatne zasoby.');
  }else{
   $('countTotal').textContent=$('countPrivate').textContent='—';
   message('summaryMessage','Nie udało się pobrać pełnego podsumowania. Spróbuj ponownie.',true);$('summaryRetry').hidden=false;
  }
 }catch(error){message('summaryMessage',error.message,true);$('summaryRetry').hidden=false;}
 finally{$('summaryRetry').disabled=false;}
}
async function recommendations(){
 $('recommendationRetry').disabled=true;$('recommendationRetry').hidden=true;message('recommendationMessage','Ładowanie propozycji…');
 try{const data=await api('/recommendations/me');cards(data.items,'recommendations');message('recommendationMessage',!data.items.length?'Brak nowych propozycji. Więcej materiałów znajdziesz w katalogu.':data.mode==='personalized'?'Na podstawie Twoich zainteresowań i ocen.':'Materiały, których jeszcze nie znasz.');}
 catch(error){cards([],'recommendations');message('recommendationMessage',error.message,true);$('recommendationRetry').hidden=false;}
 finally{$('recommendationRetry').disabled=false;}
}
async function init(){
 if(!hasAuthToken()){message('pageMessage','Pulpit jest dostępny po zalogowaniu.');$('loginRequired').hidden=false;return;}
 try{
  const {user}=await api('/me');setAccountUser(user);$('adminLink').hidden=user.role!=='admin';$('dashboardContent').hidden=$('logout').hidden=false;message('pageMessage','');
  $('logout').onclick=()=>{removeAuthToken();location.assign('login.html');};$('summaryRetry').onclick=summary;$('recommendationRetry').onclick=recommendations;
  await Promise.all([summary(),recommendations()]);
 }catch(error){message('pageMessage',error.message,true);$('loginRequired').hidden=false;}
}
init();
