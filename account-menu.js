'use strict';
(() => {
 const header=document.querySelector('.site-header');if(!header)return;
 const holder=document.createElement('div');holder.className='account-controls';
 const guest=document.createElement('a');guest.href='login.html';guest.textContent='Zaloguj się';guest.hidden=!!document.getElementById('loginLink')||hasAuthToken();
 const widget=document.createElement('div');widget.className='account-menu';widget.hidden=true;
 const toggle=document.createElement('button');toggle.type='button';toggle.id='accountToggle';toggle.className='account-toggle';toggle.setAttribute('aria-label','Menu użytkownika');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','accountDropdown');
 toggle.append(fseIcon('user'));
 const dropdown=document.createElement('div');dropdown.id='accountDropdown';dropdown.className='account-dropdown';dropdown.hidden=true;
 const label=document.createElement('p');label.className='account-label';label.id='accountLabel';
 const nav=document.createElement('nav');nav.setAttribute('aria-label','Menu konta');
 for(const [title,href] of [['Mój pulpit','dashboard.html'],['Moje materiały','my-materials.html'],['Ustawienia konta','account.html'],['Zmień hasło','account.html#security'],['Usuń konto','account.html#delete']]){const a=document.createElement('a');a.textContent=title;a.href=href;const icon=href==='dashboard.html'?'dashboard':href==='my-materials.html'?'library':href.endsWith('#security')?'key':href.endsWith('#delete')?'trash':'settings';a.prepend(fseIcon(icon));if(href.endsWith('#delete'))a.className='account-delete-link';if(location.pathname.endsWith('/'+href))a.setAttribute('aria-current','page');nav.append(a);}
 const admin=document.createElement('a');admin.textContent='Administracja';admin.href='admin.html';admin.id='accountAdminLink';admin.hidden=true;admin.prepend(fseIcon('shield'));nav.append(admin);
 const logout=document.createElement('button');logout.type='button';logout.textContent='Wyloguj';logout.className='account-logout';logout.prepend(fseIcon('logout'));logout.onclick=()=>{removeAuthToken();location.assign('login.html');};
 dropdown.append(label,nav,logout);widget.append(toggle,dropdown);holder.append(guest,widget);
 const identity=document.getElementById('identity');if(identity)identity.before(holder);else header.append(holder);
 function close(focus=false){dropdown.hidden=true;toggle.setAttribute('aria-expanded','false');if(focus)toggle.focus();}
 toggle.onclick=()=>{if(!dropdown.hidden){close();return;}dropdown.hidden=false;toggle.setAttribute('aria-expanded','true');nav.querySelector('a').focus();};
 document.addEventListener('click',event=>{if(!widget.contains(event.target))close();});
 widget.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close(true);}});
 widget.addEventListener('focusout',event=>{if(!widget.contains(event.relatedTarget))close();});
 window.setAccountUser=user=>{widget.hidden=!user;guest.hidden=!!user||!!document.getElementById('loginLink');if(identity)identity.textContent=user?.email||'';label.textContent=user?.display_name||user?.email||'';admin.hidden=user?.role!=='admin';if(!user)close();};
})();
