import { readFileSync } from 'node:fs';
import { parseDocument } from 'yaml';
import { contribution } from './contribution.mjs';
const event=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8')),pr=event.pull_request;
async function api(path) {
 const response=await fetch('https://api.github.com'+path,{headers:{Authorization:`Bearer ${process.env.GH_TOKEN}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error(`GitHub API HTTP ${response.status}`);return response.json();
}
function requireThat(condition,message){if(!condition)throw new Error(message);}
requireThat(pr&&!pr.base.repo.private&&!pr.head.repo.private,'Public PR required');
const root=`/repos/${pr.base.repo.full_name}`;
const files=await api(root+`/pulls/${pr.number}/files?per_page=100`);
requireThat(files.length===1&&['added','modified'].includes(files[0].status)&&/^contributors\/[a-zA-Z0-9-]+\.yml$/.test(files[0].filename),'Only add or update your own contributors/<username>.yml file');
const blob=await api(`/repos/${pr.head.repo.full_name}/contents/${encodeURIComponent(files[0].filename)}?ref=${pr.head.sha}`);
requireThat(blob.type==='file'&&blob.size<=4096&&blob.encoding==='base64','Small regular text file required');
const marker=/<!-- sandbox:([a-f0-9-]{36}) -->/.exec(pr.body||'');
requireThat(marker&&pr.user?.login,'PR must include a session marker and author');
requireThat(files[0].filename===`contributors/${pr.user.login}.yml`,'Filename must match PR author');
if(files[0].status==='modified') {
 const base=await api(root+`/contents/${encodeURIComponent(files[0].filename)}?ref=${pr.base.sha}`);
 requireThat(base.type==='file'&&base.size<=4096&&base.encoding==='base64','Valid previous contribution required');
 const previous=parseDocument(Buffer.from(base.content,'base64').toString('utf8'),{uniqueKeys:true});
 requireThat(!previous.errors.length&&previous.get('github')===pr.user.login&&typeof previous.get('session')==='string'&&previous.get('session')!==marker[1],'Repeat must replace your previous session');
}
contribution(Buffer.from(blob.content,'base64').toString('utf8'),pr.user.login,marker[1]);
console.log('PASS: contribution YAML, author, session and allowed file verified.');
