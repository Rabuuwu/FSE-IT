'use strict';
const $ = id => document.getElementById(id);
const types={link:'Odnośnik',pdf:'PDF',article:'Artykuł',course:'Kurs'};
let materialId,material;
function message(id,text,error=false){$(id).textContent=text;$(id).classList.toggle('error',error);}
function formatDate(value){return new Intl.DateTimeFormat('pl-PL',{dateStyle:'long'}).format(new Date(value));}
function renderStars(){
    const group=$('ratingStars');group.replaceChildren();
    for(let score=1;score<=5;score++){
        const star=document.createElement('button');star.type='button';star.className='star-button';star.append(fseIcon('star'));star.setAttribute('aria-label',`Oceń na ${score} z 5`);star.setAttribute('aria-pressed',String(material.my_rating===score));star.classList.toggle('selected',score<=(material.my_rating||0));star.addEventListener('click',()=>saveRating(score));group.append(star);
    }
    $('ratingSummary').textContent=material.rating_count?`Średnia ${Number(material.average_rating).toFixed(1)} / 5 · ${material.rating_count} ${material.rating_count===1?'ocena':material.rating_count<5?'oceny':'ocen'}`:'Brak ocen — oceń jako pierwszy.';
    $('creatorLink').textContent=material.author||'Profil twórcy';
    if(material.created_by){$('creatorLink').href=`creator.html?id=${encodeURIComponent(material.created_by)}&label=${encodeURIComponent(material.author||'Twórca')}`;$('creatorNote').textContent='Zobacz profil i opublikowane materiały twórcy.';}
    else{$('creatorLink').removeAttribute('href');$('creatorNote').textContent='Autor tego materiału nie ma przypisanego profilu.';}
}
async function saveRating(score){
    if(!hasAuthToken()){message('ratingMessage','Zaloguj się, aby ocenić materiał.');return;}
    for(const star of $('ratingStars').children)star.disabled=true;
    try{await api(`/materials/${materialId}/rating`,{method:'PUT',body:JSON.stringify({score})});material=await api(`/materials/${materialId}`);renderStars();message('ratingMessage',`Zapisano ocenę ${score}/5.`);}
    catch(error){message('ratingMessage',error.message,true);}
    finally{for(const star of $('ratingStars').children)star.disabled=false;}
}
function renderComments(items){
    const list=$('commentsList');list.replaceChildren();$('commentsCount').textContent=`${items.length}${items.length===100?' lub więcej':''} ${items.length===1?'komentarz':items.length<5?'komentarze':'komentarzy'}`;
    if(!items.length){$('commentsStatus').textContent='Nie ma jeszcze komentarzy. Rozpocznij rozmowę.';return;}
    $('commentsStatus').textContent='';
    for(const item of items){
        const article=document.createElement('article');article.className='comment';
        const header=document.createElement('div');header.className='comment-heading';const author=document.createElement('strong');author.textContent=item.author;const date=document.createElement('time');date.dateTime=item.created_at;date.textContent=formatDate(item.created_at);header.append(author,date);
        const body=document.createElement('p');body.textContent=item.body;article.append(header,body);list.append(article);
    }
}
async function loadComments(){
    message('commentsStatus','Ładowanie komentarzy…');
    try{const data=await api(`/materials/${materialId}/comments`);renderComments(data.items);}
    catch(error){message('commentsStatus',error.message,true);}
}
async function submitComment(event){
    event.preventDefault();if(!hasAuthToken()){message('commentsStatus','Zaloguj się, aby dodać komentarz.');return;}const submit=$('sendComment');submit.disabled=true;message('commentsStatus','Dodawanie komentarza…');
    try{await api(`/materials/${materialId}/comments`,{method:'POST',body:JSON.stringify({body:$('commentBody').value})});$('commentBody').value='';await loadComments();}
    catch(error){message('commentsStatus',error.message,true);}
    finally{submit.disabled=false;}
}
function renderMaterial(){
    document.title=`${material.title} — FSE-IT`;
    $('materialType').textContent=types[material.type]||'Materiał';$('materialTitle').textContent=material.title;$('materialDescription').textContent=material.description;
    const content=$('materialContent');content.replaceChildren();
    if(material.type==='article'&&material.content){const article=document.createElement('div');article.innerHTML=markdownToHtml(material.content);content.append(article);}
    if(material.type==='course')for(const [index,stage] of material.stages.entries()){const section=document.createElement('section');section.className='course-stage';const eyebrow=document.createElement('p');eyebrow.className='eyebrow';eyebrow.textContent=`ETAP ${index+1}`;const title=document.createElement('h2');title.textContent=stage.title;const text=document.createElement('div');text.innerHTML=markdownToHtml(stage.content);section.append(eyebrow,title,text);content.append(section);}
    const href=safeHttpsUrl(material.url);if(href){const link=document.createElement('a');link.className='button external-link';link.href=href;link.target='_blank';link.rel='noopener noreferrer';link.textContent=material.type==='pdf'?'Otwórz PDF':'Przejdź do materiału';link.addEventListener('click',()=>hasAuthToken()&&api(`/materials/${materialId}/views`,{method:'POST'}).catch(error=>message('pageMessage',error.message,true)));$('externalMaterial').replaceChildren(link);}
    if(material.published){$('feedback').hidden=false;renderStars();loadComments();if(hasAuthToken()&&['article','course'].includes(material.type))api(`/materials/${materialId}/views`,{method:'POST'}).catch(error=>message('pageMessage',error.message,true));}
}
async function init(){
    materialId=new URLSearchParams(location.search).get('id');
    if(!materialId||!/^[1-9]\d*$/.test(materialId)||Number(materialId)>2147483647){message('pageMessage','Nieprawidłowy adres materiału.',true);return;}
    $('commentForm').addEventListener('submit',submitComment);
    try{
        const [account,data]=await Promise.all([hasAuthToken()?api('/me'):Promise.resolve(null),api(`/materials/${materialId}`)]);setAccountUser(account?.user||null);material=data;renderMaterial();if(!account){$('commentForm').hidden=true;const login=document.createElement('a');login.href='login.html';login.textContent='Zaloguj się, aby oceniać i komentować';$('ratingMessage').append(login);}if(!material.published){const state=document.createElement('p');state.className='status-note';state.textContent=({private:'Materiał prywatny',pending:'Materiał oczekuje na weryfikację',rejected:'Materiał wymaga poprawy'})[material.publication_status]||'Materiał niepubliczny';$('materialType').after(state);if(material.review_note){const note=document.createElement('p');note.textContent=`Uwagi administratora: ${material.review_note}`;state.after(note);}}
    }catch(error){$('materialTitle').textContent='Nie udało się otworzyć materiału';message('pageMessage',error.message,true);}
}
init();
