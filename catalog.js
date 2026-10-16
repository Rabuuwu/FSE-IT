'use strict';
const $ = id => document.getElementById(id);
const types = {link:'Odnośnik',pdf:'PDF',article:'Artykuł',course:'Kurs'};
let user, editing, current, listController, page = 1, total = 0, filter = {q:'',tag:'',type:''};
const notice = (id, message, error = false) => { $(id).textContent = message; $(id).classList.toggle('error',error); };
function button(label, action, className = '') { const el=document.createElement('button'); el.type='button';el.textContent=label;el.className=className;el.addEventListener('click',()=>Promise.resolve().then(action).catch(err=>notice('message',err.message,true)));return el; }
function cards(items, target) {
    const elements = items.map(item => {
        const row=document.createElement('article'); row.className='material';
        const body=document.createElement('div');
        body.innerHTML=`<p class="meta">${escapeHtml(types[item.type])}${item.published?'':' · Szkic'}</p><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p><p>${item.tags.map(tag=>`<span class="tag">${escapeHtml(tag)}</span>`).join('')}</p><p class="meta">${escapeHtml(item.author)}${item.rating_count?` · Ocena ${escapeHtml(item.average_rating)} (${item.rating_count})`:''}</p>`;
        const actions=document.createElement('div');actions.className='actions';
        actions.append(button('Otwórz',()=>openMaterial(item.id)));
        if(user.role==='admin') {
            actions.append(button('Edytuj',()=>editMaterial(item.id),'secondary'));
            actions.append(button('Usuń',async()=>{if(!confirm(`Usunąć materiał „${item.title}”?`))return; await api(`/materials/${item.id}`,{method:'DELETE'});await refresh();},'danger'));
        }
        row.append(body,actions);return row;
    });
    $(target).replaceChildren(...elements);
}
async function loadList() {
    listController?.abort(); listController = new AbortController();const request=listController;
    notice('results','Ładowanie materiałów…');$('retry').hidden=true;
    try {
        const params=new URLSearchParams({...filter,page,limit:20});
        const data=await api(`/materials?${params}`,{signal:request.signal});
        if(request!==listController)return;
        total=data.total;cards(data.items,'materials');
        notice('results',total?`${total} materiałów`:'Brak materiałów. Zmień filtry lub wróć po publikacji nowych treści.');
        $('pageInfo').textContent=`Strona ${page} z ${Math.max(1,Math.ceil(total/20))}`;
        $('previous').disabled=page===1;$('next').disabled=page*20>=total;
        const url=new URL(location);Object.entries({...filter,page}).forEach(([key,val])=>val?url.searchParams.set(key,val):url.searchParams.delete(key));history.replaceState(null,'',url);
    } catch(err){if(err.name!=='AbortError'){notice('results',err.message,true);$('retry').hidden=false;}}
}
async function loadRecommendations() {
    try { const data=await api('/recommendations/me');cards(data.items,'recommendations');notice('recommendationMode',data.items.length?(data.mode==='personalized'?'Na podstawie Twoich zainteresowań i ocen.':'Propozycje z katalogu. Otwieraj i oceniaj materiały, aby dopasować je do siebie.'):'Brak nowych propozycji. Poznane materiały znajdziesz w katalogu.'); }
    catch(err){notice('recommendationMode',err.message,true);}
}
async function refresh(){await Promise.all([loadList(),loadRecommendations(),loadTags()]);}
async function loadTags(){try{const data=await api('/tags');const select=$('tag');select.replaceChildren(new Option('Wszystkie tagi',''),...data.tags.map(tag=>new Option(tag,tag)));if(filter.tag&&!data.tags.includes(filter.tag))select.add(new Option(filter.tag,filter.tag));select.value=filter.tag;}catch(err){notice('message',err.message,true);}}
async function openMaterial(id) {
    current=await api(`/materials/${id}`);$('viewerTitle').textContent=current.title;
    const body=$('viewerBody');body.replaceChildren();const description=document.createElement('p');description.textContent=current.description;body.append(description);
    if(current.type==='article') {const content=document.createElement('div');content.innerHTML=markdownToHtml(current.content);body.append(content);}
    if(current.type==='course') for(const stage of current.stages){const heading=document.createElement('h3');heading.textContent=stage.title;const content=document.createElement('div');content.innerHTML=markdownToHtml(stage.content);body.append(heading,content);}
    const href=safeHttpsUrl(current.url);
    if(href){const link=document.createElement('a');link.href=href;link.target='_blank';link.rel='noopener noreferrer';link.className='button';link.textContent=current.type==='pdf'?'Otwórz PDF':'Przejdź do materiału';link.addEventListener('click',()=>api(`/materials/${id}/views`,{method:'POST'}).then(loadRecommendations).catch(err=>notice('viewerMessage',err.message,true)));body.append(link);}
    $('ratingSection').hidden=!current.published;$('rating').value=current.my_rating||5;$('removeRating').hidden=!current.my_rating;notice('viewerMessage','');$('viewer').showModal();
    if(current.published&&['article','course'].includes(current.type)) try{await api(`/materials/${id}/views`,{method:'POST'});await loadRecommendations();}catch(err){notice('viewerMessage',err.message,true);}
}
function addStage(stage={title:'',content:''}) {
    const field=document.createElement('fieldset'), legend=document.createElement('legend');legend.textContent='Etap kursu';
    const titleLabel=document.createElement('label');titleLabel.textContent='Tytuł etapu';const title=document.createElement('input');title.value=stage.title;title.maxLength=200;title.required=true;title.dataset.field='title';titleLabel.append(title);
    const contentLabel=document.createElement('label');contentLabel.textContent='Treść etapu (Markdown)';const content=document.createElement('textarea');content.value=stage.content;content.maxLength=200000;content.required=true;content.rows=6;content.dataset.field='content';contentLabel.append(content);
    field.append(legend,titleLabel,contentLabel,button('Usuń etap',()=>field.remove(),'secondary'));$('stages').append(field);
}
function typeFields(){const type=$('editType').value;for(const [name,visible] of [['url',['link','pdf'].includes(type)],['content',type==='article'],['stages',type==='course']]){$(`${name}Field`).hidden=!visible;for(const el of $(`${name}Field`).querySelectorAll('input,textarea,button'))el.disabled=!visible;}$('editUrl').required=['link','pdf'].includes(type);$('editContent').required=type==='article';}
async function editMaterial(id) {
    editing=id?await api(`/materials/${id}`):null;$('editorForm').reset();$('stages').replaceChildren();
    $('editorTitle').textContent=editing?'Edytuj materiał':'Dodaj materiał';
    for(const [field,key] of [['editType','type'],['editTitle','title'],['editDescription','description'],['editAuthor','author'],['editUrl','url'],['editContent','content']]) if(editing)$(field).value=editing[key]||'';
    $('editTags').value=editing?.tags.join(', ')||'';$('editPublished').checked=editing?.published||false;
    for(const stage of editing?.stages||[])addStage(stage);typeFields();notice('editorMessage','');$('editor').showModal();
}
async function loadPrivate(){try{const data=await api('/resources');$('privateItems').replaceChildren();if(!data.resources.length){$('privateItems').textContent='Nie masz wcześniej zapisanych prywatnych zasobów.';return;}for(const resource of data.resources){const block=document.createElement('details'),summary=document.createElement('summary'),content=document.createElement('pre');summary.textContent=resource.data?.title||`Zasób ${resource.id}`;content.textContent=typeof resource.data==='string'?resource.data:JSON.stringify(resource.data,null,2);block.append(summary,content);$('privateItems').append(block);}}catch(err){$('privateItems').textContent=err.message;}}
async function loadUsers(){if(user.role!=='admin')return;try{const data=await api('/users');$('userItems').replaceChildren();for(const account of data){const row=document.createElement('div');row.className='user-row';const info=document.createElement('span');info.textContent=`${account.email} — ${account.role==='admin'?'Administrator':'Użytkownik'}`;row.append(info);if(account.id!==user.user_id)row.append(button('Usuń konto',async()=>{if(!confirm('Usunąć konto i jego prywatne dane? Opublikowane materiały pozostaną w katalogu.'))return;await api(`/users/${account.id}`,{method:'DELETE'});await loadUsers();},'danger'));$('userItems').append(row);}}catch(err){notice('message',err.message,true);}}
async function init(){
    $('logout').onclick=()=>{removeAuthToken();location.assign('login.html');};
    $('filters').onsubmit=event=>{event.preventDefault();filter={q:$('search').value.trim(),tag:$('tag').value,type:$('type').value};page=1;loadList();};
    $('retry').onclick=loadList;$('previous').onclick=()=>{page--;loadList();};$('next').onclick=()=>{page++;loadList();};
    $('closeViewer').onclick=()=>{$('viewer').close();};$('viewer').addEventListener('close',loadList);
    $('cancelEdit').onclick=()=>{if(confirm('Odrzucić zmiany w formularzu?'))$('editor').close();};
    $('editor').addEventListener('cancel',event=>{if($('saveMaterial').disabled||!confirm('Odrzucić zmiany w formularzu?'))event.preventDefault();});
    $('create').onclick=()=>editMaterial();$('addStage').onclick=()=>addStage();$('editType').onchange=typeFields;
    $('editorForm').onsubmit=async event=>{event.preventDefault();const submit=$('saveMaterial');submit.disabled=true;$('cancelEdit').disabled=true;notice('editorMessage','Zapisywanie…');try{const input={type:$('editType').value,title:$('editTitle').value,description:$('editDescription').value,author:$('editAuthor').value,url:$('editUrl').value,content:$('editContent').value,tags:$('editTags').value.split(',').map(x=>x.trim()).filter(Boolean),published:$('editPublished').checked,stages:[...$('stages').querySelectorAll('fieldset')].map(el=>({title:el.querySelector('[data-field="title"]').value,content:el.querySelector('[data-field="content"]').value})),revision:editing?.revision};await api(editing?`/materials/${editing.id}`:'/materials',{method:editing?'PUT':'POST',body:JSON.stringify(input)});$('editor').close();notice('message','Materiał zapisany.');await refresh();}catch(err){notice('editorMessage',err.message,true);}finally{submit.disabled=false;$('cancelEdit').disabled=false;}};
    $('ratingForm').onsubmit=async event=>{event.preventDefault();const submit=event.submitter;submit.disabled=true;try{await api(`/materials/${current.id}/rating`,{method:'PUT',body:JSON.stringify({score:Number($('rating').value)})});$('removeRating').hidden=false;notice('viewerMessage','Ocena zapisana.');await loadRecommendations();}catch(err){notice('viewerMessage',err.message,true);}finally{submit.disabled=false;}};
    $('removeRating').onclick=async()=>{try{await api(`/materials/${current.id}/rating`,{method:'DELETE'});$('removeRating').hidden=true;notice('viewerMessage','Ocena usunięta.');await loadRecommendations();}catch(err){notice('viewerMessage',err.message,true);}};
    if(!hasAuthToken()){location.assign('login.html');return;}
    try{user=(await api('/me')).user;$('identity').textContent=user.email;const admin=user.role==='admin';$('create').hidden=!admin;$('users').hidden=!admin;$('usersLink').hidden=!admin;
        const params=new URLSearchParams(location.search);filter={q:params.get('q')||'',tag:params.get('tag')||'',type:params.get('type')||''};page=Math.max(1,Number(params.get('page'))||1);$('search').value=filter.q;$('type').value=filter.type;
        await Promise.all([refresh(),loadPrivate(),loadUsers()]);
        if(admin&&params.get('create')==='1')await editMaterial();
    }catch(err){notice('message',err.message,true);$('retry').hidden=false;$('retry').onclick=init;}
}
init();
