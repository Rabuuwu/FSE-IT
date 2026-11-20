'use strict';
const $ = id => document.getElementById(id);
const types = {link:'Odnośnik',pdf:'PDF',article:'Artykuł',course:'Kurs'};
let user, editing, listController, searchTimer, page = 1, total = 0, filter = {q:'',tag:'',type:'',sort:'newest'};
const notice = (id, message, error = false) => { $(id).textContent = message; $(id).classList.toggle('error',error); };
function button(label, action, className = '') { const el=document.createElement('button'); el.type='button';el.textContent=label;el.className=className;el.addEventListener('click',()=>Promise.resolve().then(action).catch(err=>notice('message',err.message,true)));return el; }
function cards(items, target) {
    const elements = items.map(item => {
        const row=document.createElement('article'); row.className=target==='recommendations'?'material recommendation-card':'material';
        if(target==='recommendations'){
            const cover=document.createElement('div');cover.className=`material-visual visual-${item.type}`;cover.setAttribute('aria-hidden','true');
            const glyph=document.createElement('span');glyph.className='visual-glyph';glyph.append(fseIcon(['article','course','link','pdf'].includes(item.type)?item.type:'article'));
            const caption=document.createElement('span');caption.className='visual-caption';caption.textContent=types[item.type]||'Materiał';cover.append(glyph,caption);row.append(cover);
        }
        const body=document.createElement('div');
        body.className='material-copy';
        const author=item.created_by?`<a class="creator-link" href="creator.html?id=${encodeURIComponent(item.created_by)}&amp;label=${encodeURIComponent(item.author||'Twórca')}">${escapeHtml(item.author||'Twórca')}</a>`:escapeHtml(item.author||'Twórca');
        body.innerHTML=`<p class="meta material-byline"><span class="material-type">${escapeHtml(types[item.type])}${item.published?'':' · Szkic'}</span><span aria-hidden="true"> · </span><span class="material-author">${author}</span></p><h3><a class="material-open" href="material.html?id=${encodeURIComponent(item.id)}">${escapeHtml(item.title)}</a></h3><p class="material-description">${escapeHtml(item.description)}</p><p class="material-tags">${item.tags.map(tag=>`<span class="tag">${escapeHtml(tag)}</span>`).join('')}</p>${item.rating_count?`<p class="material-rating">Ocena ${escapeHtml(item.average_rating)} (${item.rating_count})</p>`:''}`;
        const actions=document.createElement('div');actions.className='actions';
        if(user && (user.role==='admin'||user.user_id===item.created_by)) {
            actions.append(button('Edytuj',()=>editMaterial(item.id),'secondary'));
            if(user.role==='admin')actions.append(button('Usuń',async()=>{if(!confirm(`Usunąć materiał „${item.title}”?`))return; await api(`/materials/${item.id}`,{method:'DELETE'});await refresh();},'danger'));
        }
        row.append(body);if(actions.childElementCount)row.append(actions);
        row.classList.add('material-clickable');row.addEventListener('click',event=>{if(event.target.closest('a,button'))return;location.assign(`material.html?id=${encodeURIComponent(item.id)}`);});
        row.addEventListener('keydown',event=>{if(event.target!==row)return;if(event.key==='Enter'||event.key===' '){event.preventDefault();location.assign(`material.html?id=${encodeURIComponent(item.id)}`);}});
        return row;
    });
    $(target).replaceChildren(...elements);
    if(target==='recommendations') updateRecommendationRail();
}
function updateRecommendationRail(){
    const rail=$('recommendations'), previous=$('recommendationsPrev'), next=$('recommendationsNext');
    const overflow=rail.scrollWidth>rail.clientWidth+2;
    rail.parentElement.classList.toggle('has-overflow',overflow);
    previous.hidden=next.hidden=!overflow;
    previous.disabled=rail.scrollLeft<=2;next.disabled=rail.scrollLeft+rail.clientWidth>=rail.scrollWidth-2;
}
function materialCount(count){
    const lastTwo=count%100,last=count%10;
    const noun=count===1?'materiał':last>=2&&last<=4&&(lastTwo<12||lastTwo>14)?'materiały':'materiałów';
    return `${count} ${noun}`;
}
function changeFilters(){
    filter={q:$('search').value.trim(),tag:$('tag').value,type:$('type').value,sort:$('sort').value};page=1;updateSearchLayout();loadList();
    $('clearFilters').disabled=!filter.q&&!filter.tag&&!filter.type;
}
function updateSearchLayout(){
    const searching=Boolean(filter.q);
    const recommendations=$('recommendationSection');
    $('main').classList.toggle('search-active',searching);
    $('suggestionsTitle').textContent=searching?'Może Cię zainteresować':'Polecane dla Ciebie';
    if(searching) $('catalogSection').after(recommendations);
    else $('main').insertBefore(recommendations,$('catalogSection'));
}
async function loadList() {
    listController?.abort(); listController = new AbortController();const request=listController;
    notice('results','Ładowanie materiałów…');$('retry').hidden=true;
    try {
        const params=new URLSearchParams({...filter,page,limit:20,scope:'published'});
        const data=await api(`/materials?${params}`,{signal:request.signal});
        if(request!==listController)return;
        total=data.total;cards(data.items,'materials');
        notice('results',total?`${materialCount(total)}${filter.q?` dla „${filter.q}”`:''}`:'Brak wyników. Zmień zapytanie lub wyczyść filtry.');
        if(!total){const empty=document.createElement('div');empty.className='empty-state';const title=document.createElement('h3');title.textContent='Nie znaleźliśmy materiałów';const detail=document.createElement('p');detail.textContent='Spróbuj krótszego hasła albo usuń część filtrów.';const clear=button('Wyczyść filtry',()=>resetFilters(),'secondary');empty.append(title,detail,clear);$('materials').replaceChildren(empty);}
        $('pageInfo').textContent=`Strona ${page} z ${Math.max(1,Math.ceil(total/20))}`;
        $('previous').disabled=page===1;$('next').disabled=page*20>=total;
        const url=new URL(location);Object.entries({...filter,page}).forEach(([key,val])=>val?url.searchParams.set(key,val):url.searchParams.delete(key));history.replaceState(null,'',url);
    } catch(err){if(err.name!=='AbortError'){notice('results',err.message,true);$('retry').hidden=false;}}
}
async function loadRecommendations() {
    if(!user)return;
    try { const data=await api('/recommendations/me');cards(data.items,'recommendations');notice('recommendationMode',data.items.length?(data.mode==='personalized'?'Na podstawie Twoich zainteresowań i ocen.':''):'Brak nowych propozycji. Poznane materiały znajdziesz w katalogu.'); }
    catch(err){notice('recommendationMode',err.message,true);}
}
async function refresh(){await Promise.all([loadList(),loadRecommendations(),loadTags()]);}
async function loadTags(){try{const data=await api('/tags');const select=$('tag');select.replaceChildren(new Option('Wszystkie tagi',''),...data.tags.map(tag=>new Option(tag,tag)));if(filter.tag&&!data.tags.includes(filter.tag))select.add(new Option(filter.tag,filter.tag));select.value=filter.tag;}catch(err){notice('message',err.message,true);}}
function resetFilters(){clearTimeout(searchTimer);$('search').value='';$('tag').value='';$('type').value='';changeFilters();}
function editMaterial(id){location.assign(`material-editor.html?id=${encodeURIComponent(id)}`);}
async function init(){
    $('logout').onclick=()=>logoutAccount();
    $('sort').onchange=changeFilters;
    $('filters').onsubmit=event=>{event.preventDefault();clearTimeout(searchTimer);changeFilters();};
    $('search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(changeFilters,320);});
    $('tag').addEventListener('change',changeFilters);$('type').addEventListener('change',changeFilters);
    $('clearFilters').onclick=resetFilters;
    $('recommendationsPrev').onclick=()=>$('recommendations').scrollBy({left:-$('recommendations').clientWidth*.82,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    $('recommendationsNext').onclick=()=>$('recommendations').scrollBy({left:$('recommendations').clientWidth*.82,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    $('recommendations').addEventListener('scroll',updateRecommendationRail,{passive:true});
    if('ResizeObserver'in window)new ResizeObserver(updateRecommendationRail).observe($('recommendations'));else window.addEventListener('resize',updateRecommendationRail);
    $('retry').onclick=loadList;$('previous').onclick=()=>{page--;loadList();};$('next').onclick=()=>{page++;loadList();};
    try{
        if(hasAuthToken()){user=(await api('/me')).user;setAccountUser(user);}
        const logged=!!user;for(const id of ['create','logout','mineLink'])$(id).hidden=!logged;
        $('loginLink').hidden=$('guestCreate').hidden=logged;$('usersLink').hidden=user?.role!=='admin';
        $('recommendations').closest('section').hidden=!logged;
        const params=new URLSearchParams(location.search);filter={q:params.get('q')||'',tag:params.get('tag')||'',type:params.get('type')||'',sort:params.get('sort')||'newest'};page=Math.max(1,Number(params.get('page'))||1);$('search').value=filter.q;$('type').value=filter.type;$('sort').value=filter.sort;$('clearFilters').disabled=!filter.q&&!filter.tag&&!filter.type;updateSearchLayout();
        await refresh();
        if(logged&&params.get('create')==='1')location.assign('material-editor.html');
    }catch(err){notice('message',err.message,true);$('retry').hidden=false;$('retry').onclick=init;}
}
if(['#mine','#private'].includes(location.hash))location.replace('my-materials.html');
else init();
