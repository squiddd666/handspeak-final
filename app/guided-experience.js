const $=s=>document.querySelector(s);
const views={workspace:['workspace'],learn:['learn','motion-studio'],'ai-studio':['ai-studio'],history:['history'],evaluate:['evaluate'],about:['about']};
const lesson=$('#sign-examples'),lessonHome=document.createComment('Lesson position');lesson.before(lessonHome);
let current='';
function show(target,update=true){
 if(target==='#home'){target='#workspace';history.replaceState(null,'',target);}
 const requested=document.getElementById(target.replace(/^#/,''));
 if(['#ai-studio','#history'].includes(target)||(requested&&[$('#ai-studio'),$('#history')].some(section=>section.contains(requested)))){target='#workspace';history.replaceState(null,'',target);}
 const node=document.getElementById(target.replace(/^#/,''));
 let view=Object.keys(views).find(v=>views[v].some(id=>document.getElementById(id)?.contains(node)))||'workspace';
 if(target==='#sign-examples')view='learn';
 if(view!=='workspace'&&$('#cameraLesson').contains(lesson)){lessonHome.after(lesson);$('#cameraLesson').hidden=true;}
 for(const [key,ids] of Object.entries(views))for(const id of ids)document.getElementById(id).hidden=key!==view;
 document.querySelector('.application-help').hidden=view!=='about';
 for(const link of document.querySelectorAll('.site-header nav a')){const active=link.hash==='#'+view;link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}
 if(current!==view)document.dispatchEvent(new CustomEvent('handspeak:view',{detail:{view}}));
 current=view;if(update&&location.hash!==target)history.pushState(null,'',target);
}
document.addEventListener('handspeak:navigate',e=>show(e.detail.target));
document.addEventListener('click',e=>{const a=e.target.closest('a[href^="#"]');if(!a)return;const target=a.hash||'#home';if(target==='#main')return;show(target);},true);
window.addEventListener('popstate',()=>show(location.hash||'#workspace',false));
window.addEventListener('hashchange',()=>show(location.hash||'#workspace',false));
$('#startSigning').addEventListener('click',()=>show('#workspace'));
$('#startFocusedDemo')?.addEventListener('click',()=>{const mode=$('#recognitionMode');mode.value='words';mode.dispatchEvent(new Event('change'));show('#workspace');});
function dock(){show('#workspace');$('#cameraLesson').hidden=false;$('#cameraLesson').append(lesson);}
function selectLesson(id){const button=words.find(b=>b.dataset.signExample===id);if(button)button.click();}
document.addEventListener('handspeak:default-practice',e=>{selectLesson(e.detail.label.toLowerCase().replaceAll(' ','-'));dock();});
document.addEventListener('handspeak:practice',e=>{selectLesson(e.detail.id);dock();});
document.addEventListener('handspeak:enable-word-preview',e=>{if(e.detail?.id){selectLesson(e.detail.id);dock();}else show('#workspace');});
const words=[...document.querySelectorAll('[data-sign-example]')];
const initialTarget=location.hash||'#workspace';
if(!location.hash)history.replaceState(null,'','#workspace');
show(initialTarget,false);
