'use strict';
const $ = id => document.getElementById(id);
let page=1;
const types = {link:'Odnośnik',pdf:'PDF',article:'Artykuł',course:'Kurs'};
function plural(count){const last=count%10,lastTwo=count%100;return count===1?'materiał':last>=2&&last<=4&&(lastTwo<12||lastTwo>14)?'materiały':'materiałów';}
function materialCard(item){
    const card=document.createElement('article');card.className='material material-clickable';
    const body=document.createElement('div');body.className='material-copy';
    const byline=document.createElement('p');byline.className='meta material-byline';const type=document.createElement('span');type.className='material-type';type.textContent=types[item.type]||'Materiał';const separator=document.createElement('span');separator.setAttribute('aria-hidden','true');separator.textContent=' · ';const author=document.createElement('span');author.className='material-author';author.textContent=item.author||'Twórca';byline.append(type,separator,author);
    const title=document.createElement('h3');const link=document.createElement('a');link.className='material-open';link.href=`material.html?id=${encodeURIComponent(item.id)}`;link.textContent=item.title;title.append(link);
    const description=document.createElement('p');description.className='material-description';description.textContent=item.description;
    const tags=document.createElement('p');tags.className='material-tags';for(const name of item.tags){const tag=document.createElement('span');tag.className='tag';tag.textContent=name;tags.append(tag);}
    body.append(byline,title,description,tags);
    card.append(body);card.addEventListener('click',event=>{if(event.target.closest('a,button'))return;location.assign(link.href);});return card;
}
async function init(){
    const params=new URLSearchParams(location.search),id=params.get('id');
    if(!id||!/^[1-9]\d*$/.test(id)||Number(id)>2147483647){$('creatorMeta').textContent='Nieprawidłowy adres profilu.';$('creatorMeta').classList.add('error');return;}
    const label=params.get('label');if(label)$('creatorTitle').textContent=`Twórca: ${label}`;
    try{
        const [account,profile]=await Promise.all([hasAuthToken()?api('/me'):Promise.resolve(null),api(`/creators/${id}?page=${page}`)]);
        setAccountUser(account?.user||null);$('creatorTitle').textContent=`Twórca: ${profile.creator.display_name||label||'Użytkownik'}`;
        const created=new Intl.DateTimeFormat('pl-PL',{dateStyle:'long'}).format(new Date(profile.creator.created_at));
        $('creatorMeta').textContent=`Konto od ${created} · ${profile.total} ${plural(profile.total)}`;
        if(!profile.items.length){$('creatorMaterials').textContent='Ten twórca nie ma jeszcze opublikowanych materiałów.';return;}
        $('creatorMaterials').replaceChildren(...profile.items.map(materialCard));let nav=document.getElementById('creatorPages');if(!nav){nav=document.createElement('nav');nav.id='creatorPages';nav.setAttribute('aria-label','Strony materiałów');$('creatorMaterials').after(nav);}nav.replaceChildren();for(const [label,delta,disabled]of [['Poprzednia',-1,page===1],['Następna',1,page*profile.limit>=profile.total]]){const b=document.createElement('button');b.textContent=label;b.disabled=disabled;b.onclick=()=>{page+=delta;init();};nav.append(b);}
    }catch(error){$('creatorMeta').textContent=error.message;$('creatorMeta').classList.add('error');}
}
init();
