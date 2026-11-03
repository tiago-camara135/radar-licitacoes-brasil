(()=>{
'use strict';
if(window.__rlbMetaWhatsappClientV1)return;window.__rlbMetaWhatsappClientV1=true;
const nativeFetch=window.fetch.bind(window);let metaActive=false;
const pathOf=input=>{try{return new URL(typeof input==='string'?input:input?.url||'',location.origin).pathname}catch{return''}};
const methodOf=init=>String(init?.method||'GET').toUpperCase();
const bodyOf=init=>{try{return typeof init?.body==='string'?JSON.parse(init.body):null}catch{return null}};
window.fetch=async function rlbMetaWhatsappFetch(input,init={}){
  const path=pathOf(input),method=methodOf(init),body=bodyOf(init);
  let target=input;
  if(metaActive&&method==='POST'&&path==='/api/notifications/verify/request'&&body?.channel==='whatsapp')target='/api/notifications/meta/verify/request';
  if(metaActive&&method==='POST'&&path==='/api/notifications/test'&&body?.channel==='whatsapp')target='/api/notifications/meta/test';
  const response=await nativeFetch(target,init);
  if(method==='GET'&&path==='/api/notifications/profile'){
    try{const data=await response.clone().json();metaActive=data?.providers?.whatsapp?.provider==='meta-cloud'&&Boolean(data?.providers?.whatsapp?.verification_configured)}catch{}
  }
  return response;
};
})();
