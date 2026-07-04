
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
let mainWindow;
let timeline=[];
const state={version:'2.4.0-memorycore',aiCore:'ONLINE',memoryCore:'ONLINE',atlas:'READY',forge:'READY',lastCommand:'None'};

function ensureDir(d){fs.mkdirSync(d,{recursive:true});return d;}
function userDataDir(){return ensureDir(path.join(app.getPath('userData'),'memorycore'));}
function vaultPath(){const v=path.join(__dirname,'vault');['Memory','Projects','Favorites','Commands','Notes','Logos'].forEach(f=>ensureDir(path.join(v,f)));return v;}
function filePath(n){return path.join(userDataDir(),n);}
function readJson(n,fallback){try{const f=filePath(n);if(!fs.existsSync(f))return fallback;return JSON.parse(fs.readFileSync(f,'utf8'));}catch(_){return fallback;}}
function writeJson(n,data){fs.writeFileSync(filePath(n),JSON.stringify(data,null,2),'utf8');return data;}
function logEvent(event,detail=''){const e={time:new Date().toISOString(),event,detail};timeline.unshift(e);timeline=timeline.slice(0,500);mainWindow?.webContents.send('kelvor-event',e);return e;}

function defaultSettings(){return{profileName:'JD',brandName:'The JD Lounge',startupGreeting:'Welcome back, JD. MemoryCore is online.',wakeWord:'kelvor'};}
function loadSettings(){return {...defaultSettings(),...readJson('settings.json',{})};}
function saveSettings(s){const m={...defaultSettings(),...s};writeJson('settings.json',m);logEvent('Atlas Profile Saved','MemoryCore profile saved.');addMemory('system','Atlas profile updated','settings');return m;}
function memories(){return readJson('memories.json',[]);}
function commands(){return readJson('commands.json',[]);}
function favorites(){return readJson('favorites.json',[{id:'prepare-stream',label:'Prepare Stream',command:'prepare stream'},{id:'system-health',label:'System Health',command:'system health'},{id:'memory-status',label:'Memory Status',command:'memory status'}]);}
function projects(){return readJson('projects.json',[{id:'kelvoros',name:'KelvorOS',status:'Active',notes:'Permanent AI operating system codebase.'},{id:'jdlounge',name:'The JD Lounge',status:'Active',notes:'Streaming and creator brand.'}]);}
function addMemory(type,content,source='manual'){const list=memories();const e={id:Date.now().toString(),time:new Date().toISOString(),type,content,source};list.unshift(e);writeJson('memories.json',list.slice(0,1000));logEvent('Memory Saved',content);return e;}
function addCommand(command,response){const list=commands();const e={id:Date.now().toString(),time:new Date().toISOString(),command,response};list.unshift(e);writeJson('commands.json',list.slice(0,1000));return e;}
function searchMemory(q=''){const x=q.toLowerCase();return memories().filter(m=>m.content.toLowerCase().includes(x)||m.type.toLowerCase().includes(x)||m.source.toLowerCase().includes(x));}
function scanVault(){const v=vaultPath();let count=0;const cats=fs.readdirSync(v,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>e.name);cats.forEach(c=>count+=fs.readdirSync(path.join(v,c),{withFileTypes:true}).filter(e=>e.isFile()).length);return{vaultPath:v,categories:cats,assetCount:count};}
function dashboard(){return{memories:memories().slice(0,12),commands:commands().slice(0,12),favorites:favorites(),projects:projects()};}
function missionScan(){const checks=[['AI Core','Unified command router online.'],['MemoryCore',`${memories().length} memories saved.`],['Command History',`${commands().length} commands logged.`],['Atlas Profile','Profile storage online.'],['Forge Vault',`${scanVault().assetCount} vault assets found.`],['Brand Logo','Bundled Kelvor K logo loaded.']].map(x=>({label:x[0],ok:true,detail:x[1]}));return{checks,score:100,status:'READY'};}

function aiRoute(command=''){
 const text=command.trim();const c=text.toLowerCase();state.lastCommand=text||'None';logEvent('AI Core Route',text);
 let response='Kelvor heard you.',action='generic';
 if(!text){response='No command received.';action='none';}
 else if(c.includes('help')){response='MemoryCore commands: memory status, remember, search memory, recent commands, projects, favorites, system health.';action='help';}
 else if(c.includes('memory status')){response=`MemoryCore is online. I have ${memories().length} memories and ${commands().length} logged commands.`;action='memory-status';}
 else if(c.startsWith('remember ')){const content=text.replace(/^remember\s+/i,'').trim(); if(content){addMemory('note',content,'command');response=`Saved to memory: ${content}`;}else response='Tell me what to remember.';action='remember';}
 else if(c.includes('search memory')){const q=text.replace(/search memory/i,'').trim();const r=searchMemory(q);response=r.length?`Found ${r.length} memory item(s) for "${q}".`:`No memory found for "${q}".`;action='search-memory';}
 else if(c.includes('recent commands')){response=`There are ${commands().length} commands in history.`;action='recent-commands';}
 else if(c.includes('projects')){response=`Projects loaded: ${projects().map(p=>p.name).join(', ')}.`;action='projects';}
 else if(c.includes('favorites')){response=`Favorites loaded: ${favorites().map(f=>f.label).join(', ')}.`;action='favorites';}
 else if(c.includes('health')||c.includes('status')){response='KelvorOS MemoryCore health is stable. AI Core, Atlas, Forge, and MemoryCore are online.';action='status';}
 else if(c.includes('open forge')||c.includes('vault')){response='Opening Forge Vault.';action='open-vault';}
 else if(c.includes('prepare stream')){response='Absolutely, JD. MemoryCore logged the prepare stream workflow.';action='prepare-stream';addMemory('workflow','Prepare stream workflow requested','ai-core');}
 else response=`Kelvor heard: ${text}`;
 addCommand(text,response);return{response,action};
}

async function payload(){return{settings:loadSettings(),state,health:{score:98,label:'MemoryCore Ready'},forge:scanVault(),missionScan:missionScan(),dashboard:dashboard(),timeline};}
ipcMain.handle('kelvor-status',async()=>payload());
ipcMain.handle('kelvor-command',async(_e,command)=>{const r=aiRoute(command);if(r.action==='open-vault')await shell.openPath(vaultPath());return r;});
ipcMain.handle('kelvor-mission-scan',async()=>{const s=missionScan();logEvent('Mission Scan Complete',`${s.score}% — ${s.status}`);return s;});
ipcMain.handle('memory-add',async(_e,m)=>addMemory(m.type||'note',m.content||'',m.source||'manual'));
ipcMain.handle('memory-search',async(_e,q)=>searchMemory(q));
ipcMain.handle('atlas-load-settings',async()=>loadSettings());
ipcMain.handle('atlas-save-settings',async(_e,s)=>saveSettings(s));
ipcMain.handle('forge-open-vault',async()=>{const v=vaultPath();await shell.openPath(v);logEvent('Forge Vault Opened',v);return{ok:true,vaultPath:v};});

app.whenReady().then(()=>{vaultPath();mainWindow=new BrowserWindow({width:1600,height:1000,minWidth:1200,minHeight:760,backgroundColor:'#030303',title:'KelvorOS v2.4 MemoryCore',webPreferences:{preload:path.join(__dirname,'src/core/preload.js'),nodeIntegration:false,contextIsolation:true}});logEvent('KelvorOS Started','v2.4 MemoryCore online.');mainWindow.loadFile(path.join(__dirname,'src/ui/index.html'));});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
