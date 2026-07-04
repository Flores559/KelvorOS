
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow;
let timeline=[];

function log(event, detail=''){
  const entry={time:new Date().toISOString(),event,detail};
  timeline.unshift(entry);
  timeline=timeline.slice(0,200);
  mainWindow?.webContents.send('kelvor-event', entry);
}

function routeCommand(text=''){
  const cmd=text.toLowerCase().trim();
  if(!cmd) return 'No command received.';
  log('VoiceCore Route', text);

  if(cmd.includes('help')) return 'VoiceCore commands: help, voice status, system health, prepare stream.';
  if(cmd.includes('voice')) return 'VoiceCore is online. Push-to-talk and native speech provider are staged for the next build.';
  if(cmd.includes('health') || cmd.includes('status')) return 'KelvorOS VoiceCore health is stable.';
  if(cmd.includes('prepare stream')) return 'Absolutely, JD. VoiceCore routed prepare stream to the AI Core.';
  return `Kelvor heard: ${text}`;
}

ipcMain.handle('kelvor-status', async()=>({
  version:'2.3.1 VoiceCore Hotfix',
  health:96,
  label:'VoiceCore Online',
  timeline
}));

ipcMain.handle('kelvor-command', async(_e,text)=>{
  const response=routeCommand(text);
  return {response};
});

app.whenReady().then(()=>{
  mainWindow=new BrowserWindow({
    width:1400,
    height:900,
    backgroundColor:'#030303',
    title:'KelvorOS v2.3.1 VoiceCore Hotfix',
    webPreferences:{
      preload:path.join(__dirname,'src/core/preload.js'),
      nodeIntegration:false,
      contextIsolation:true
    }
  });
  log('KelvorOS Started','v2.3.1 VoiceCore Hotfix online.');
  mainWindow.loadFile(path.join(__dirname,'src/ui/index.html'));
});

app.on('window-all-closed',()=>{ if(process.platform!=='darwin') app.quit(); });
