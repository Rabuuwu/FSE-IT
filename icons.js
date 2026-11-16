// Lucide icons sourced from svgicons.com; attribution and license: assets/icons/.
'use strict';
window.fseIcon=name=>{
 const names=['user','dashboard','library','settings','key','trash','shield','logout','article','course','link','pdf','left','right','down','star'];
 if(!names.includes(name))throw new Error('Unknown UI icon');
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('ui-icon');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','24');svg.setAttribute('height','24');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
 const use=document.createElementNS('http://www.w3.org/2000/svg','use');use.setAttribute('href',`assets/icons/lucide.svg#${name}`);svg.append(use);return svg;
};
for(const target of document.querySelectorAll('[data-icon]'))target.replaceChildren(fseIcon(target.dataset.icon));
