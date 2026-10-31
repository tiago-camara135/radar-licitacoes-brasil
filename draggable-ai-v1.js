(()=>{
'use strict';

const FAB_KEY='rlb-ai-fab-position-v1';
const MARGIN=10;
const DRAG_THRESHOLD=5;
let fab=null;
let assistant=null;
let win=null;
let head=null;
let closeBtn=null;
let suppressFabClick=false;
let open=false;

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
function placeWindowNearFab(){
  if(!fab||!win)return;
  const {w,h}=viewport();
  const f=fab.getBoundingClientRect();
  const ww=Math.min(w<=620?w-16:390,w-16);
  const wh=Math.min(w<=620?Math.min(h-16,620):Math.min(h-24,640),h-16);
  let x;
  if(f.left+f.width/2>w/2)x=f.left-ww-12;
  else x=f.right+12;
  x=clamp(x,8,Math.max(8,w-ww-8));
  let y=clamp(f.top,8,Math.max(8,h-wh-8));
  if(f.top>h*.65)y=Math.max(8,h-wh-8);
  win.style.setProperty('width',`${ww}px`,'important');
  win.style.setProperty('height',`${wh}px`,'important');
  win.style.setProperty('left',`${x}px`,'important');
  win.style.setProperty('top',`${y}px`,'important');
  win.style.setProperty('right','auto','important');
  win.style.setProperty('bottom','auto','important');
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
function installFabDrag(){
  if(!fab)return;
  let state=null;
  fab.addEventListener('pointerdown',e=>{
    if(e.button!==0&&e.pointerType==='mouse')return;
    const r=fab.getBoundingClientRect();
    state={id:e.pointerId,startX:e.clientX,startY:e.clientY,offsetX:e.clientX-r.left,offsetY:e.clientY-r.top,dragged:false};
    fab.setPointerCapture?.(e.pointerId);
    fab.classList.add('ai-widget-dragging');
  });
  fab.addEventListener('pointermove',e=>{
    if(!state||state.id!==e.pointerId)return;
    const dx=e.clientX-state.startX,dy=e.clientY-state.startY;
    if(!state.dragged&&Math.hypot(dx,dy)>=DRAG_THRESHOLD)state.dragged=true;
    if(!state.dragged)return;
    e.preventDefault();
    applyFabPosition({x:e.clientX-state.offsetX,y:e.clientY-state.offsetY},false);
  });
  const end=e=>{
    if(!state||state.id!==e.pointerId)return;
    const wasDragged=state.dragged;
    state=null;
    fab.classList.remove('ai-widget-dragging');
    try{fab.releasePointerCapture?.(e.pointerId)}catch{}
    if(wasDragged){
      const r=fab.getBoundingClientRect();
      applyFabPosition({x:r.left,y:r.top},true);
      suppressFabClick=true;
      setTimeout(()=>{suppressFabClick=false},120);
    }
  };
  fab.addEventListener('pointerup',end);
  fab.addEventListener('pointercancel',end);
  fab.addEventListener('click',e=>{
    e.preventDefault();
    if(suppressFabClick)return;
    openAssistant();
  });
}
function installWindowDrag(){
  if(!win||!head)return;
  let state=null;
  head.addEventListener('pointerdown',e=>{
    if(e.button!==0&&e.pointerType==='mouse')return;
    if(e.target.closest('a,button,input,textarea,select'))return;
    const r=win.getBoundingClientRect();
    state={id:e.pointerId,offsetX:e.clientX-r.left,offsetY:e.clientY-r.top};
    head.setPointerCapture?.(e.pointerId);
    win.classList.add('ai-widget-window-dragging');
    e.preventDefault();
  });
  head.addEventListener('pointermove',e=>{
    if(!state||state.id!==e.pointerId)return;
    e.preventDefault();
    const {w,h}=viewport();
    const r=win.getBoundingClientRect();
    const x=clamp(e.clientX-state.offsetX,6,Math.max(6,w-r.width-6));
    const y=clamp(e.clientY-state.offsetY,6,Math.max(6,h-r.height-6));
    win.style.setProperty('left',`${x}px`,'important');
    win.style.setProperty('top',`${y}px`,'important');
    win.style.setProperty('right','auto','important');
    win.style.setProperty('bottom','auto','important');
  });
  const end=e=>{
    if(!state||state.id!==e.pointerId)return;
    state=null;
    win.classList.remove('ai-widget-window-dragging');
    try{head.releasePointerCapture?.(e.pointerId)}catch{}
  };
  head.addEventListener('pointerup',end);
  head.addEventListener('pointercancel',end);
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
      const wr=win.getBoundingClientRect();
      const {w,h}=viewport();
      const x=clamp(wr.left,6,Math.max(6,w-wr.width-6));
      const y=clamp(wr.top,6,Math.max(6,h-wr.height-6));
      win.style.setProperty('left',`${x}px`,'important');
      win.style.setProperty('top',`${y}px`,'important');
    }
  },{passive:true});

  if(location.hash==='#ai-assistant'){
    openAssistant();
  }else{
    clearHash();
  }
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
