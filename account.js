'use strict';
const $=id=>document.getElementById(id);
let user,busy=false;
function message(id,text,error=false){$(id).textContent=text;$(id).classList.toggle('error',error);}
function lock(value){busy=value;for(const el of document.querySelectorAll('#accountContent input,#accountContent button,#deleteDialog input,#deleteDialog button'))el.disabled=value;}
async function mutation(form,target,work){if(busy)return;lock(true);form.setAttribute('aria-busy','true');message(target,'Zapisywanie…');try{await work();}catch(error){message(target,error.message,true);}finally{lock(false);form.setAttribute('aria-busy','false');}}
async function load(){
 if(!hasAuthToken()){$('loginRequired').hidden=false;return;}
 $('loadRetry').hidden=true;message('pageMessage','Ładowanie ustawień…');
 try{user=(await api('/account')).user;setAccountUser(user);$('displayName').value=user.display_name||'';$('accountEmail').value=user.email;$('accountContent').hidden=false;message('pageMessage','');if(['#profile','#security','#delete'].includes(location.hash))document.querySelector(location.hash).scrollIntoView({block:'start'});}
 catch(error){message('pageMessage',error.message,true);$('loadRetry').hidden=false;}
}
$('loadRetry').onclick=load;
$('profileForm').onsubmit=event=>{event.preventDefault();mutation(event.currentTarget,'profileMessage',async()=>{
 const body={display_name:$('displayName').value.trim(),email:$('accountEmail').value.trim().toLowerCase()};if(body.email!==user.email){if(!$('profilePassword').value)throw new Error('Podaj obecne hasło, aby zmienić adres e-mail.');body.current_password=$('profilePassword').value;}
 user=(await api('/account',{method:'PATCH',body:JSON.stringify(body)})).user;setAccountUser(user);$('profilePassword').value='';$('accountEmail').value=user.email;$('displayName').value=user.display_name||'';message('profileMessage','Profil zapisany.');
 });};
$('passwordForm').onsubmit=event=>{event.preventDefault();mutation(event.currentTarget,'passwordMessage',async()=>{
 const password=$('newPassword').value;if(password!==$('repeatPassword').value)throw new Error('Nowe hasła muszą być takie same.');if(password.length<10||new TextEncoder().encode(password).length>72)throw new Error('Hasło musi mieć co najmniej 10 znaków i maksymalnie 72 bajty UTF-8.');
 await api('/account/password',{method:'PUT',body:JSON.stringify({current_password:$('currentPassword').value,new_password:password})});removeAuthToken();location.assign('login.html?changed=password');
 });};
$('openDelete').onclick=()=>{$('deleteForm').reset();message('deleteMessage','');$('deleteDialog').showModal();$('deletePassword').focus();};
$('cancelDelete').onclick=()=>{$('deleteDialog').close();$('openDelete').focus();};
$('deleteDialog').addEventListener('cancel',event=>{if(busy)event.preventDefault();});
$('deleteForm').onsubmit=event=>{event.preventDefault();mutation(event.currentTarget,'deleteMessage',async()=>{
 if($('deleteConfirmation').value!=='USUŃ KONTO')throw new Error('Aby potwierdzić, wpisz dokładnie USUŃ KONTO.');
 await api('/account',{method:'DELETE',body:JSON.stringify({current_password:$('deletePassword').value,confirmation:$('deleteConfirmation').value})});removeAuthToken();location.assign('login.html?deleted=1');
 });};
load();
