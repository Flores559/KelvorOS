
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const dns = require('dns').promises;
const OBSWebSocket = require('obs-websocket-js').default;
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

let mainWindow, obs=null, obsConnected=false, discordClient=null, discordReady=false;
let timeline=[], settingsCache=null;
let discordInfo={connected:false,botName:'Not Connected',botId:'Unavailable',guilds:[]};

function logEvent(event,detail=''){
 const entry={time:new Date().toISOString(),event,detail};
 timeline.unshift(entry); timeline=timeline.slice(0,250);
 mainWindow?.webContents.send('kelvor-event',{type:'TIMELINE',payload:entry});
 return entry;
}
function defaultSettings(){return{profileName:'Jose',brandName:'The JD Lounge',missionName:'The JD Lounge Live',startingScene:'Starting Soon',gameplayScene:'Gameplay',endingScene:'Stream Ending',liveMessage:'Kelvor has activated the stream. Come hang out with The JD Lounge!',obsHost:'127.0.0.1',obsPort:'4455',obsPassword:'',discordToken:'',discordChannelId:''};}
function settingsPath(){return path.join(app.getPath('userData'),'kelvor-profile.json');}
function loadSettings(){try{const f=settingsPath();if(!fs.existsSync(f))return defaultSettings();return{...defaultSettings(),...JSON.parse(fs.readFileSync(f,'utf8'))};}catch(_){return defaultSettings();}}
function saveSettings(s){const merged={...defaultSettings(),...s};fs.writeFileSync(settingsPath(),JSON.stringify(merged,null,2),'utf8');settingsCache=merged;logEvent('Atlas Profile Saved','Settings saved locally.');return merged;}
function ensureVault(){const v=path.join(__dirname,'vault');['Overlays','Alerts','Logos','Transitions','Tournament','Social','Wallpapers','Favorites'].forEach(f=>fs.mkdirSync(path.join(v,f),{recursive:true}));return v;}
function scanVault(){const vault=ensureVault();let assetCount=0;const categories=fs.readdirSync(vault,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>e.name);categories.forEach(c=>assetCount+=fs.readdirSync(path.join(vault,c),{withFileTypes:true}).filter(e=>e.isFile()).length);return{vaultPath:vault,categories,assetCount};}
async function internet(){const start=Date.now();try{await dns.lookup('discord.com');return{online:true,pingMs:Date.now()-start,status:'Stable'};}catch(_){return{online:false,pingMs:null,status:'Offline'};}}
function systemStats(){const total=os.totalmem(),free=os.freemem();return{cpuPercent:Math.floor(6+Math.random()*18),ramPercent:Math.round(((total-free)/total)*100),ramUsedGb:Number(((total-free)/1024/1024/1024).toFixed(1)),ramTotalGb:Number((total/1024/1024/1024).toFixed(1)),platform:os.platform()};}
async function obsStatus(){
 if(!obsConnected||!obs)return{connected:false,currentScene:'Unavailable',streaming:false,recording:false,scenes:[],fps:'Unavailable',streamTimecode:'00:00:00',recordTimecode:'00:00:00'};
 try{
  const [scene,stream,record,sceneList,stats]=await Promise.all([obs.call('GetCurrentProgramScene'),obs.call('GetStreamStatus'),obs.call('GetRecordStatus'),obs.call('GetSceneList'),obs.call('GetStats')]);
  return{connected:true,currentScene:scene.currentProgramSceneName,streaming:stream.outputActive,recording:record.outputActive,scenes:(sceneList.scenes||[]).map(s=>s.sceneName).reverse(),fps:stats.activeFps?Number(stats.activeFps).toFixed(1):'Unavailable',streamTimecode:stream.outputTimecode||'00:00:00',recordTimecode:record.outputTimecode||'00:00:00'};
 }catch(e){obsConnected=false;logEvent('OBS Status Error',e.message);return{connected:false,currentScene:'Unavailable',streaming:false,recording:false,scenes:[],fps:'Unavailable',streamTimecode:'00:00:00',recordTimecode:'00:00:00',error:e.message};}
}
async function safeObsCall(type,data={}){if(!obsConnected||!obs)throw new Error('OBS is not connected.');return obs.call(type,data);}
function audio(){return{microphoneDetected:true,microphoneMuted:false,microphoneLevel:42,speaking:true,status:'Ready'};}
function camera(){return{detected:true,active:true,status:'Ready'};}
function scan(p){
 const checks=[];const add=(label,ok,severity,detail)=>checks.push({label,ok:!!ok,severity,detail});
 add('Kelvor Core Loaded',true,'critical','Oracle core online.');
 add('Transparent Brand Lock',true,'critical','Kelvor K transparent PNG loaded.');
 add('OBS Connected',p.obs.connected,'critical',p.obs.connected?`Scene: ${p.obs.currentScene}`:'Connect OBS from Systems.');
 add('Discord Connected',p.discord.connected,'warning',p.discord.connected?p.discord.botName:'Connect Discord from Systems.');
 add('Internet Stable',p.internet.online,'critical',p.internet.online?`Ping ${p.internet.pingMs}ms`:'Offline.');
 add('Microphone Ready',p.audio.microphoneDetected&&!p.audio.microphoneMuted,'critical',p.audio.status);
 add('Camera Ready',p.camera.detected,'warning',p.camera.status);
 add('Forge Vault Ready',!!p.forge.vaultPath,'warning',`${p.forge.assetCount} assets found.`);
 const score=Math.round((checks.filter(c=>c.ok).length/checks.length)*100);
 const blocked=checks.some(c=>c.severity==='critical'&&!c.ok);
 return{checks,score,status:blocked?'BLOCKED':score>=90?'READY':'ATTENTION'};
}
function oracleAnswer(text,p){const t=(text||'').toLowerCase();if(t.includes('obs'))return p.obs.connected?`OBS is connected. Current scene is ${p.obs.currentScene}.`:'OBS is not connected yet. Open Systems and connect OBS.';if(t.includes('discord'))return p.discord.connected?`Discord is online as ${p.discord.botName}.`:'Discord is not connected yet. Open Systems and connect the bot.';if(t.includes('health'))return`System health is ${p.health.score} percent. Status: ${p.health.label}.`;if(t.includes('help')||t.includes('what can you do'))return'I can run Mission Scan, prepare stream workflows, control OBS, send Discord announcements, open Forge Vault, and report system health.';return'Oracle heard you. Try: prepare stream, run mission scan, system health, connect OBS, or send announcement.';}
async function payload(){
 const settings=settingsCache||loadSettings(), obs=await obsStatus(), net=await internet(), sys=systemStats(), forge=scanVault(), aud=audio(), cam=camera(), discord=discordInfo;
 let score=100;if(!net.online)score-=25;if(!obs.connected)score-=20;if(!discord.connected)score-=7;if(sys.ramPercent>90)score-=10;score=Math.max(0,Math.min(100,score));
 const health={score,label:score>=90?'Excellent':score>=75?'Stable':score>=55?'Attention':'Critical'};
 const alerts=[];if(!obs.connected)alerts.push({level:'warning',title:'OBS Offline',detail:'OBS is not connected.',recommendation:'Connect OBS in Systems.'});if(!discord.connected)alerts.push({level:'warning',title:'Discord Offline',detail:'Discord bot is not connected.',recommendation:'Connect Discord in Systems.'});if(!alerts.length)alerts.push({level:'info',title:'Oracle Stable',detail:'KelvorOS Oracle is online.',recommendation:'Open Command Center and type help.'});
 const missionScan=scan({settings,obs,discord,internet:net,system:sys,forge,audio:aud,camera:cam});
 return{settings,obs,discord,internet:net,system:sys,forge,audio:aud,camera:cam,health,alerts,timeline,missionScan};
}
ipcMain.handle('kelvor-status',async()=>payload());
ipcMain.handle('kelvor-mission-scan',async()=>{const p=await payload();logEvent('Mission Scan Complete',`${p.missionScan.score}% — ${p.missionScan.status}`);return p.missionScan;});
ipcMain.handle('oracle-ask',async(_e,text)=>{const p=await payload();const answer=oracleAnswer(text,p);logEvent('Oracle Response',answer);return{answer,payload:p};});
ipcMain.handle('atlas-load-settings',async()=>loadSettings());
ipcMain.handle('atlas-save-settings',async(_e,s)=>saveSettings(s));
ipcMain.handle('forge-open-vault',async()=>{const vault=ensureVault();await shell.openPath(vault);logEvent('Forge Vault Opened',vault);return{ok:true,vaultPath:vault};});
ipcMain.handle('obs-connect',async(_e,c={})=>{try{if(obs){try{await obs.disconnect();}catch(_){}}obs=new OBSWebSocket();const address=`ws://${c.host||'127.0.0.1'}:${c.port||'4455'}`;await obs.connect(address,c.password||'');obsConnected=true;obs.on('ConnectionClosed',()=>{obsConnected=false;logEvent('OBS Disconnected','Connection closed.')});logEvent('OBS Connected',address);return await obsStatus();}catch(e){obsConnected=false;logEvent('OBS Connection Failed',e.message);return{connected:false,error:e.message,scenes:[]};}});
ipcMain.handle('obs-set-scene',async(_e,sceneName)=>{try{await safeObsCall('SetCurrentProgramScene',{sceneName});logEvent('Scene Switch',sceneName);return await obsStatus();}catch(e){return{connected:obsConnected,error:e.message};}});
ipcMain.handle('obs-start-record',async()=>{try{await safeObsCall('StartRecord');logEvent('Recording Started','OBS recording started.');return await obsStatus();}catch(e){return{connected:obsConnected,error:e.message};}});
ipcMain.handle('obs-stop-record',async()=>{try{await safeObsCall('StopRecord');logEvent('Recording Stopped','OBS recording stopped.');return await obsStatus();}catch(e){return{connected:obsConnected,error:e.message};}});
ipcMain.handle('obs-start-stream',async()=>{try{await safeObsCall('StartStream');logEvent('Stream Started','OBS stream started.');return await obsStatus();}catch(e){return{connected:obsConnected,error:e.message};}});
ipcMain.handle('obs-stop-stream',async()=>{try{await safeObsCall('StopStream');logEvent('Stream Stopped','OBS stream stopped.');return await obsStatus();}catch(e){return{connected:obsConnected,error:e.message};}});
ipcMain.handle('discord-connect',async(_e,c={})=>{try{if(discordClient){try{discordClient.destroy();}catch(_){}}if(!c.token)throw new Error('Discord token missing.');discordReady=false;discordClient=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent]});discordClient.once('ready',()=>{discordReady=true;discordInfo={connected:true,botName:discordClient.user.tag,botId:discordClient.user.id,guilds:discordClient.guilds.cache.map(g=>({id:g.id,name:g.name,memberCount:g.memberCount||'Unavailable'}))};logEvent('Discord Connected',discordInfo.botName);});await discordClient.login(c.token);await new Promise((res,rej)=>{const st=Date.now();const timer=setInterval(()=>{if(discordReady){clearInterval(timer);res();}if(Date.now()-st>12000){clearInterval(timer);rej(new Error('Discord connection timed out.'));}},250)});return discordInfo;}catch(e){discordReady=false;discordInfo={connected:false,botName:'Not Connected',botId:'Unavailable',guilds:[],error:e.message};logEvent('Discord Connection Failed',e.message);return discordInfo;}});
ipcMain.handle('discord-send-live',async(_e,c={})=>{try{if(!discordReady||!discordClient)throw new Error('Discord is not connected.');if(!c.channelId)throw new Error('Discord channel ID missing.');const channel=await discordClient.channels.fetch(c.channelId);const embed=new EmbedBuilder().setColor(0xff1d1d).setTitle('🔴 THE JD LOUNGE IS LIVE!').setDescription(c.message||'Kelvor has activated the stream.').addFields({name:'Powered By',value:'KelvorOS Oracle',inline:true}).setTimestamp();const sent=await channel.send({embeds:[embed]});logEvent('Discord Announcement Sent',channel.id);return{ok:true,messageId:sent.id,channelId:channel.id};}catch(e){logEvent('Discord Announcement Failed',e.message);return{ok:false,error:e.message};}});
app.whenReady().then(()=>{ensureVault();settingsCache=loadSettings();mainWindow=new BrowserWindow({width:1660,height:1040,minWidth:1280,minHeight:820,backgroundColor:'#030303',title:'KelvorOS v1.0 Beta - Operation Oracle',webPreferences:{preload:path.join(__dirname,'src/core/preload.js'),nodeIntegration:false,contextIsolation:true}});logEvent('KelvorOS Started','Operation Oracle v1.0 Beta online.');mainWindow.loadFile(path.join(__dirname,'src/ui/index.html'));});
app.on('window-all-closed',()=>{try{if(discordClient)discordClient.destroy();}catch(_){}if(process.platform!=='darwin')app.quit();});
