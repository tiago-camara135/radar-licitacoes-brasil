(()=>{
'use strict';

const FAB_KEY='rlb-ai-fab-position-v1';
const WIN_KEY='rlb-ai-window-position-v2';
const MARGIN=10;
const DRAG_THRESHOLD=7;
let fab=null;
let assistant=null;
let win=null;
let head=null;
let closeBtn=null;
let open=false;
let fabDrag=null;
let winDrag=null;

const clamp=(n,min,max)=>Math.min(Math.max(n,min),max);
function readJson(key){try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}}
function saveJson(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}
function viewport(){return {w:window.innerWidth,h:window.innerHeight}}
function clearHash(){
  if(location.hash==='#ai-assistant'||location.hash==='#radar-home'){
    history.replaceState(null,'',location.pathname+location.search);
  }
}
function clampFabPosition(pos){
  if(!fab)return pos;
  const {w,h}=viewport();
  const rect=fab.getBoundingClientRect();
  return {
    x:clamp(Number(pos?.x)||MARGIN,MARGIN,Math.max(MARGIN,w-rect.width-MARGIN)),
    y:clamp(Number(pos?.y)||MARGIN,MARGIN,Math.max(MARGIN,h-rect.height-MARGIN))
  };
}
function applyFabPosition(pos,save=false){
  if(!fab)return;
  const p=clampFabPosition(pos);
  fab.style.setProperty('left',`${p.x}px`,'important');
  fab.style.setProperty('top',`${p.y}px`,'important');
  fab.style.setProperty('right','auto','important');
  fab.style.setProperty('bottom','auto','important');
  if(save)saveJson(FAB_KEY,p);
}
function defaultFabPosition(){
  if(!fab)return {x:MARGIN,y:MARGIN};
  const {w,h}=viewport();
  const r=fab.getBoundingClientRect();
  return {x:Math.max(MARGIN,w-r.width-24),y:Math.max(MARGIN,h-r.height-24)};
}
function clampWindowPosition(pos){
  if(!win)return pos;
  const {w,h}=viewport();
  const r=win.getBoundingClientRect();
  return {
    x:clamp(Number(pos?.x)||6,6,Math.max(6,w-r.width-6)),
    y:clamp(Number(pos?.y)||6,6,Math.max(6,h-r.height-6))
  };
}
function applyWindowPosition(pos,save=false){
  if(!win)return;
  const p=clampWindowPosition(pos);
  win.style.setProperty('left',`${p.x}px`,'important');
  win.style.setProperty('top',`${p.y}px`,'important');
  win.style.setProperty('right','auto','important');
  win.style.setProperty('bottom','auto','important');
  if(save)saveJson(WIN_KEY,p);
}
function sizeWindow(){
  if(!win)return;
  const {w,h}=viewport();
  let ww=348;
  let wh=560;

  if(w<=620){
    ww=Math.max(286,w-16);
    wh=Math.min(h-16,500);
  }else if(w<=1100||h<=760){
    ww=318;
    wh=Math.min(h-20,490);
  }else if(w<=1440||h<=900){
    ww=332;
    wh=Math.min(h-24,520);
  }else if(w>=1800&&h>=1000){
    ww=356;
    wh=570;
  }

  ww=Math.min(ww,w-16);
  wh=Math.min(wh,h-16);
  win.style.setProperty('width',`${ww}px`,'important');
  win.style.setProperty('height',`${wh}px`,'important');
}
function placeWindowNearFab(){
  if(!fab||!win)return;
  sizeWindow();
  const saved=readJson(WIN_KEY);
  if(saved){applyWindowPosition(saved,false);return}
  const {w,h}=viewport();
  const f=fab.getBoundingClientRect();
  const r=win.getBoundingClientRect();
  let x=f.left+f.width/2>w/2?f.left-r.width-12:f.right+12;
  let y=f.top;
  x=clamp(x,8,Math.max(8,w-r.width-8));
  y=clamp(y,8,Math.max(8,h-r.height-8));
  if(f.top>h*.65)y=Math.max(8,h-r.height-8);
  applyWindowPosition({x,y},false);
}
async function refreshAiStatus(){
  const target=document.getElementById('aiStatusText');
  if(!target)return;
  try{
    const r=await fetch('/api/ai-rlb/status',{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
    if(!r.ok)return;
    const d=await r.json().catch(()=>({}));
    if(d.provider)target.textContent=`Modo ${d.provider}${d.model?' • '+d.model:''}`;
  }catch{}
}
function openAssistant(){
  if(!assistant||!win||!fab)return;
  open=true;
  clearHash();
  assistant.classList.add('ai-widget-open');
  fab.classList.add('ai-widget-fab-hidden');
  placeWindowNearFab();
  refreshAiStatus();
  const prompt=document.getElementById('aiPrompt');
  setTimeout(()=>prompt?.focus({preventScroll:true}),80);
}
function closeAssistant(){
  if(!assistant||!fab)return;
  open=false;
  clearHash();
  assistant.classList.remove('ai-widget-open');
  fab.classList.remove('ai-widget-fab-hidden');
}
function resetBodyDragState(){
  document.documentElement.style.removeProperty('cursor');
  document.body.style.removeProperty('user-select');
  document.body.style.removeProperty('-webkit-user-select');
}
function beginFabPointer(e){
  if(!fab||open||!e.isPrimary)return;
  if(e.pointerType==='mouse'&&e.button!==0)return;
  e.preventDefault();
  fab.style.setProperty('transform','none','important');
  const r=fab.getBoundingClientRect();
  fabDrag={
    id:e.pointerId,
    startX:e.clientX,
    startY:e.clientY,
    startLeft:r.left,
    startTop:r.top,
    dragged:false
  };
}
function moveFabPointer(e){
  if(!fabDrag||fabDrag.id!==e.pointerId)return;
  const dx=e.clientX-fabDrag.startX;
  const dy=e.clientY-fabDrag.startY;
  if(!fabDrag.dragged&&Math.hypot(dx,dy)>=DRAG_THRESHOLD){
    fabDrag.dragged=true;
    fab.classList.add('ai-widget-dragging');
    document.documentElement.style.setProperty('cursor','grabbing');
    document.body.style.setProperty('user-select','none');
    document.body.style.setProperty('-webkit-user-select','none');
  }
  if(!fabDrag.dragged)return;
  e.preventDefault();
  applyFabPosition({x:fabDrag.startLeft+dx,y:fabDrag.startTop+dy},false);
}
function endFabPointer(e,cancelled=false){
  if(!fabDrag||fabDrag.id!==e.pointerId)return;
  const wasDragged=fabDrag.dragged;
  fabDrag=null;
  fab.classList.remove('ai-widget-dragging');
  fab.style.removeProperty('transform');
  resetBodyDragState();
  if(wasDragged){
    const r=fab.getBoundingClientRect();
    applyFabPosition({x:r.left,y:r.top},true);
  }else if(!cancelled){
    openAssistant();
  }
}
function installFabDrag(){
  if(!fab)return;
  fab.draggable=false;
  fab.addEventListener('dragstart',e=>e.preventDefault());
  fab.addEventListener('pointerdown',beginFabPointer,{passive:false});
  window.addEventListener('pointermove',moveFabPointer,{passive:false});
  window.addEventListener('pointerup',e=>endFabPointer(e,false));
  window.addEventListener('pointercancel',e=>endFabPointer(e,true));
  fab.addEventListener('click',e=>{
    e.preventDefault();
    if(e.detail===0&&!open)openAssistant();
  });
}
function beginWindowPointer(e){
  if(!win||!head||!open||!e.isPrimary)return;
  if(e.pointerType==='mouse'&&e.button!==0)return;
  if(e.target.closest('a,button,input,textarea,select'))return;
  e.preventDefault();
  const r=win.getBoundingClientRect();
  winDrag={id:e.pointerId,startX:e.clientX,startY:e.clientY,startLeft:r.left,startTop:r.top};
  win.classList.add('ai-widget-window-dragging');
  document.documentElement.style.setProperty('cursor','grabbing');
  document.body.style.setProperty('user-select','none');
  document.body.style.setProperty('-webkit-user-select','none');
}
function moveWindowPointer(e){
  if(!winDrag||winDrag.id!==e.pointerId)return;
  e.preventDefault();
  applyWindowPosition({x:winDrag.startLeft+(e.clientX-winDrag.startX),y:winDrag.startTop+(e.clientY-winDrag.startY)},false);
}
function endWindowPointer(e){
  if(!winDrag||winDrag.id!==e.pointerId)return;
  winDrag=null;
  win.classList.remove('ai-widget-window-dragging');
  resetBodyDragState();
  const r=win.getBoundingClientRect();
  applyWindowPosition({x:r.left,y:r.top},true);
}
function installWindowDrag(){
  if(!win||!head)return;
  head.addEventListener('pointerdown',beginWindowPointer,{passive:false});
  window.addEventListener('pointermove',moveWindowPointer,{passive:false});
  window.addEventListener('pointerup',endWindowPointer);
  window.addEventListener('pointercancel',endWindowPointer);
}
function init(){
  fab=document.querySelector('.ai-fab');
  assistant=document.getElementById('ai-assistant');
  win=assistant?.querySelector('.ai-window')||null;
  head=assistant?.querySelector('.ai-window-head')||null;
  closeBtn=assistant?.querySelector('.ai-close')||null;
  if(!fab||!assistant||!win||!head)return;

  const saved=readJson(FAB_KEY);
  requestAnimationFrame(()=>applyFabPosition(saved||defaultFabPosition(),false));
  installFabDrag();
  installWindowDrag();
  closeBtn?.addEventListener('click',e=>{e.preventDefault();closeAssistant()});
  assistant.querySelector('.ai-backdrop')?.addEventListener('click',e=>e.preventDefault());
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&open)closeAssistant()});
  addEventListener('resize',()=>{
    const r=fab.getBoundingClientRect();
    applyFabPosition({x:r.left,y:r.top},false);
    if(open){
      sizeWindow();
      const wr=win.getBoundingClientRect();
      applyWindowPosition({x:wr.left,y:wr.top},false);
    }
  },{passive:true});

  if(location.hash==='#ai-assistant')openAssistant();
  else clearHash();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
