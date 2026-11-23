/* Apply the saved visual preference before the interface paints. */
(function(){
 try{
  const saved=localStorage.getItem("tvc-theme-choice-v2");
  const choice=["light","dark","system"].includes(saved)?saved:"light";
  const dark=choice==="dark"||(choice==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme=dark?"dark":"light";
  document.documentElement.style.colorScheme=dark?"dark":"light";
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta)meta.setAttribute("content",dark?"#0d1727":"#f2f6fc");
 }catch(err){document.documentElement.dataset.theme="light";}
})();
