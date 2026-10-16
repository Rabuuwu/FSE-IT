import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
const files=['index.html','login.html','register.html','catalog.html','catalog.js','utils.js','config.js','dashboard.html','dashboard.js','admin.html','admin.js','article-creator.html','article-creator.js','article-viewer.html','article-viewer.js'];
await mkdir('dist',{recursive:true});
for(const file of files) await cp(file,`dist/${file}`);
await cp('css','dist/css',{recursive:true});
const configured=process.env.FRONTEND_API_URL;
if(configured){
    const url=new URL(configured);
    if(url.protocol!=='https:' && !(url.protocol==='http:' && ['localhost','127.0.0.1'].includes(url.hostname))) throw new Error('FRONTEND_API_URL must use HTTPS, except localhost');
    if(url.username||url.password||url.search||url.hash) throw new Error('Invalid public API URL');
    const source=await readFile('config.js','utf8');
    await writeFile('dist/config.js',`window.FSE_API_URL=${JSON.stringify(configured.replace(/\/$/,''))};\n${source}`);
}
console.log('Static frontend built in dist/ (no server files or secrets)');
