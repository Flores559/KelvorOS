
const { app, BrowserWindow, ipcMain, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
let mainWindow;
let timeline=[];
let voiceState={
  provider:'WEB_SPEECH',
  microphonePermission:'UNKNOWN',
  recognitionSupport:'RENDERER_CHECK',
  mode:'PUSH_TO_TALK',
  listening:false,
  lastTranscript:'None',
  lastError:'None'
};

function ensureDir(d){fs.mkdirSync(d,{recursive:true});return d;}
function dataDir(){return ensureDir(path.join(app.getPath('userData'),'creator-dashboard'));}
function vaultPath(){const v=path.join(__dirname,'vault');['Dashboard','Clips','Posts','Ideas','Tasks','Logos'].forEach(f=>ensureDir(path.join(v,f)));return v;}
function fp(n){return path.join(dataDir(),n);}
function readJson(n,f){try{const p=fp(n);if(!fs.existsSync(p))return f;return JSON.parse(fs.readFileSync(p,'utf8'));}catch(_){return f;}}
function writeJson(n,d){fs.writeFileSync(fp(n),JSON.stringify(d,null,2),'utf8');return d;}
function logEvent(event,detail=''){const e={time:new Date().toISOString(),event,detail};timeline.unshift(e);timeline=timeline.slice(0,500);mainWindow?.webContents.send('kelvor-event',e);return e;}

function defaultSettings(){return{profileName:'JD',brandName:'The JD Lounge',startupGreeting:'Welcome back, JD. Creator Dashboard is online.',streamGoal:'Prepare next JD Lounge stream',contentFocus:'Kelvor + The JD Lounge growth'};}
function loadSettings(){return {...defaultSettings(),...readJson('settings.json',{})};}
function saveSettings(s){const m={...defaultSettings(),...s};writeJson('settings.json',m);logEvent('Dashboard Settings Saved','Creator profile updated.');return m;}

function tasks(){return readJson('tasks.json',[{id:'obs-check',title:'Check OBS scenes',status:'To Do',priority:'High'},{id:'discord-post',title:'Prepare Discord live announcement',status:'To Do',priority:'High'},{id:'clip-idea',title:'Create one teaser clip idea',status:'To Do',priority:'Medium'}]);}
function ideas(){return readJson('ideas.json',[{id:'teaser',title:'Kelvor teaser post',type:'Social',note:'Suspense style post for The JD Lounge.'},{id:'behind-scenes',title:'Behind the scenes laptop setup',type:'Content',note:'Show Kelvor being built.'}]);}
function posts(){return readJson('posts.json',[{id:'launch',platform:'Instagram',caption:'Something is waking up inside The JD Lounge… 👀'},{id:'discord',platform:'Discord',caption:'KelvorOS update is live — more coming soon.'}]);}
function addTask(title,priority='Medium'){const list=tasks();const t={id:Date.now().toString(),title,status:'To Do',priority};list.unshift(t);writeJson('tasks.json',list);logEvent('Task Added',title);return t;}
function completeTask(id){const list=tasks().map(t=>t.id===id?{...t,status:'Done'}:t);writeJson('tasks.json',list);logEvent('Task Completed',id);return list;}
function addIdea(title,note='',type='Content'){const list=ideas();const i={id:Date.now().toString(),title,type,note};list.unshift(i);writeJson('ideas.json',list);logEvent('Idea Saved',title);return i;}
function addPost(platform,caption){const list=posts();const p={id:Date.now().toString(),platform,caption};list.unshift(p);writeJson('posts.json',list);logEvent('Post Draft Saved',platform);return p;}

function scanVault(){const v=vaultPath();let count=0;const cats=fs.readdirSync(v,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>e.name);cats.forEach(c=>count+=fs.readdirSync(path.join(v,c),{withFileTypes:true}).filter(e=>e.isFile()).length);return{vaultPath:v,categories:cats,assetCount:count};}

function route(command=''){
 const text=command.trim(); const c=text.toLowerCase(); logEvent('Dashboard Command',text);
 let response='Creator Dashboard heard you.',action='generic';
 if(!text){response='No command received.';action='none';}
 else if(c.includes('help')){response='Commands: dashboard status, add task, add idea, post caption, launch checklist, open vault.';action='help';}
 else if(c.includes('dashboard status')||c.includes('system health')){response=`Dashboard online. ${tasks().filter(t=>t.status!=='Done').length} open tasks, ${ideas().length} ideas, ${posts().length} post drafts.`;action='status';}
 else if(c.startsWith('add task ')){const title=text.replace(/^add task\s+/i,'').trim();addTask(title);response=`Task added: ${title}`;action='add-task';}
 else if(c.startsWith('add idea ')){const title=text.replace(/^add idea\s+/i,'').trim();addIdea(title,'Saved from command.');response=`Idea saved: ${title}`;action='add-idea';}
 else if(c.startsWith('post caption ')){const cap=text.replace(/^post caption\s+/i,'').trim();addPost('Instagram',cap);response='Post caption saved for Instagram.';action='add-post';}
 else if(c.includes('launch checklist')){response='Launch checklist loaded: OBS scenes, Discord announcement, stream title, teaser post, and test recording.';action='checklist';}
 else if(c.includes('open vault')||c.includes('forge')){response='Opening Creator Vault.';action='open-vault';}
 return{response,action};
}

function missionScan(){const open=tasks().filter(t=>t.status!=='Done').length;const checks=[{label:'Creator Dashboard',ok:true,detail:'Dashboard module online.'},{label:'Task Board',ok:true,detail:`${open} open tasks.`},{label:'Idea Bank',ok:true,detail:`${ideas().length} ideas saved.`},{label:'Post Drafts',ok:true,detail:`${posts().length} post drafts ready.`},{label:'Creator Vault',ok:true,detail:`${scanVault().assetCount} assets found.`},{label:'Brand Logo',ok:true,detail:'Kelvor K logo bundled.'}];return{checks,score:100,status:'READY'};}
async function payload(){return{settings:loadSettings(),health:{score:99,label:'Creator Ready'},dashboard:{tasks:tasks(),ideas:ideas(),posts:posts()},forge:scanVault(),missionScan:missionScan(),timeline};}

ipcMain.handle('kelvor-status',async()=>payload());
ipcMain.handle('kelvor-command',async(_e,cmd)=>{const r=route(cmd);if(r.action==='open-vault')await shell.openPath(vaultPath());return r;});
ipcMain.handle('kelvor-mission-scan',async()=>{const s=missionScan();logEvent('Mission Scan Complete',`${s.score}% — ${s.status}`);return s;});
ipcMain.handle('dashboard-add-task',async(_e,t)=>addTask(t.title,t.priority));
ipcMain.handle('dashboard-complete-task',async(_e,id)=>completeTask(id));
ipcMain.handle('dashboard-add-idea',async(_e,i)=>addIdea(i.title,i.note,i.type));
ipcMain.handle('dashboard-add-post',async(_e,p)=>addPost(p.platform,p.caption));
ipcMain.handle('atlas-load-settings',async()=>loadSettings());
ipcMain.handle('atlas-save-settings',async(_e,s)=>saveSettings(s));
ipcMain.handle('forge-open-vault',async()=>{const v=vaultPath();await shell.openPath(v);logEvent('Creator Vault Opened',v);return{ok:true,vaultPath:v};});


ipcMain.handle('voice-provider-status', async () => ({...voiceState}));
ipcMain.handle('voice-provider-update', async (_e, patch={}) => {
  voiceState={...voiceState,...patch};
  logEvent('Voice Provider Update', JSON.stringify(patch));
  return {...voiceState};
});

app.whenReady().then(()=>{
session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
  const allowed = permission === 'media' || permission === 'microphone';
  if (allowed) voiceState.microphonePermission='GRANTED';
  callback(allowed);
});
vaultPath();mainWindow=new BrowserWindow({width:1600,height:1000,minWidth:1200,minHeight:760,backgroundColor:'#030303',title:'KelvorOS v2.6 Voice Provider',webPreferences:{preload:path.join(__dirname,'src/core/preload.js'),nodeIntegration:false,contextIsolation:true}});logEvent('KelvorOS Started','v2.6 Voice Provider online.');mainWindow.loadFile(path.join(__dirname,'src/ui/index.html'));});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
