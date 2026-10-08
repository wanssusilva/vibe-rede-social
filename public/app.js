const $ = selector => document.querySelector(selector);
const state = { posts: [], selectedPost: null, imageData: '' };
const escapeHtml = text => String(text || '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const currentName = () => localStorage.getItem('vibe-name') || 'vibe.user';
const initials = name => (name || 'V').trim().slice(0, 1).toUpperCase();
const savedLikes = () => JSON.parse(localStorage.getItem('vibe-liked') || '[]');
const markLiked = id => { const likes = new Set(savedLikes()); likes.add(id); localStorage.setItem('vibe-liked', JSON.stringify([...likes])); };
const unmarkLiked = id => localStorage.setItem('vibe-liked', JSON.stringify(savedLikes().filter(x => x !== id)));

function setView(name) {
  document.querySelectorAll('.view').forEach(el => el.classList.toggle('active', el.id === `${name}View`));
  document.querySelectorAll('[data-view]').forEach(el => el.classList.toggle('selected', el.dataset.view === name));
  if (name === 'profile') renderProfile();
  window.scrollTo({top:0, behavior:'smooth'});
}
function timeAgo(date) {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(date).getTime()) / 1000));
  if (seconds < 60) return 'agora'; if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h`; return `${Math.floor(seconds / 86400)} d`;
}
function captionHtml(caption) {
  return escapeHtml(caption).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
}
function makePost(post) {
  const node = $('#postTemplate').content.firstElementChild.cloneNode(true);
  const avatar = node.querySelector('.avatar'); avatar.textContent = post.avatar || initials(post.author); avatar.style.background = colorFor(post.author);
  node.querySelector('.post-author').textContent = post.author;
  node.querySelector('.post-handle').textContent = `@${post.handle || 'vibe.user'} · ${timeAgo(post.createdAt)}`;
  const image = node.querySelector('.post-image'); const fallback = node.querySelector('.no-photo');
  if (post.image) { image.src = post.image; image.alt = `Foto publicada por ${post.author}`; fallback.remove(); } else image.remove();
  node.querySelector('.post-caption').innerHTML = `<b>${escapeHtml(post.handle || post.author)}</b> ${captionHtml(post.caption)}`;
  node.querySelector('.post-time').textContent = `Publicado ${timeAgo(post.createdAt)}`;
  const liked = post.liked || savedLikes().includes(post.id); const like = node.querySelector('.like');
  like.classList.toggle('is-liked', liked); like.querySelector('b').textContent = post.likes || 0;
  node.querySelector('.comment b').textContent = (post.comments || []).length;
  like.onclick = () => toggleLike(post, like);
  node.querySelector('.comment').onclick = () => openComments(post);
  node.querySelector('.share').onclick = () => sharePost(post);
  return node;
}
function colorFor(text) { const colors=['#ff6b89','#6954e8','#fd9d53','#00a38d','#347bd6','#c056d3']; let n=0; for(const c of String(text)) n+=c.charCodeAt(0); return colors[n % colors.length]; }
function renderFeed() { const feed=$('#feed'); feed.innerHTML=''; state.posts.forEach(post => feed.appendChild(makePost(post))); if(!state.posts.length) feed.innerHTML='<div class="empty">Ainda não há posts. Seja a primeira pessoa a deixar uma vibe por aqui.</div>'; }
function renderStories() { const people=[['Você',currentName()],['Marina','M'],['Lucas','L'],['Nanda','N'],['Rafa','R'],['Duda','D']]; $('#stories').innerHTML=people.map(([name,letter],i)=>`<button class="story ${i===0?'own':''}" ${i===0?'data-view="new"':''}><span style="background:${colorFor(letter)}">${initials(letter)}</span><small>${escapeHtml(name)}</small></button>`).join(''); }
async function loadPosts() { try { const response=await fetch('/api/posts'); const data=await response.json(); if(!response.ok) throw Error(data.error); state.posts=data.posts || []; renderFeed(); renderProfile(); } catch(error) { $('#feed').innerHTML=`<div class="empty">Não foi possível carregar o feed. <button id="retry">Tentar de novo</button></div>`; $('#retry')?.addEventListener('click',loadPosts); } }
async function toggleLike(post, button) { button.disabled=true; try { const r=await fetch(`/api/posts/${encodeURIComponent(post.id)}/like`,{method:'POST'}); const d=await r.json(); if(!r.ok) throw Error(d.error); post.liked=d.liked; post.likes=d.likes; d.liked?markLiked(post.id):unmarkLiked(post.id); button.classList.toggle('is-liked',d.liked); button.querySelector('b').textContent=d.likes; } catch { alert('Não deu para curtir agora. Tente novamente.'); } finally { button.disabled=false; } }
function openComments(post) { state.selectedPost=post; $('#commentsList').innerHTML=(post.comments||[]).length ? post.comments.map(c=>`<p><b>${escapeHtml(c.author)}</b> ${escapeHtml(c.text)}</p>`).join('') : '<p class="muted">Ainda não há comentários. Puxa a conversa.</p>'; $('#commentsDialog').showModal(); $('#commentInput').focus(); }
async function sendComment(event) { event.preventDefault(); const input=$('#commentInput'); const text=input.value.trim(); if(!text || !state.selectedPost) return; const button=$('#commentForm button'); button.disabled=true; try { const r=await fetch(`/api/posts/${encodeURIComponent(state.selectedPost.id)}/comments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({author:currentName(),text})}); const d=await r.json(); if(!r.ok) throw Error(d.error); state.selectedPost.comments=[...(state.selectedPost.comments||[]),d.comment]; input.value=''; openComments(state.selectedPost); renderFeed(); } catch(error) { alert(error.message || 'Não foi possível comentar.'); } finally { button.disabled=false; } }
async function sharePost(post) { const url=`${location.origin}/#post-${post.id}`; try { if(navigator.share) await navigator.share({title:`Post de ${post.author} no Vibe`,text:post.caption,url}); else { await navigator.clipboard.writeText(url); alert('Link copiado.'); } } catch {} }
function imagePreview(event) { const file=event.target.files[0]; if(!file) return; if(file.size > 3*1024*1024){ showFormMessage('Escolha uma foto de até 3 MB.',true); event.target.value=''; return; } const reader=new FileReader(); reader.onload=()=>{state.imageData=reader.result; $('#uploadPreview').innerHTML=`<img src="${reader.result}" alt="Prévia da foto"><b class="change-photo">Trocar foto</b>`;}; reader.readAsDataURL(file); }
function showFormMessage(message,error=false){const el=$('#formMessage');el.textContent=message;el.classList.toggle('error',error);}
async function publish(event) { event.preventDefault(); const author=$('#author').value.trim(); const handle=$('#handle').value.trim(); const caption=$('#caption').value.trim(); if(!author || !caption) return showFormMessage('Preencha seu nome e a legenda.',true); const button=$('.publish'); button.disabled=true; button.innerHTML='Publicando…'; showFormMessage(''); try { const response=await fetch('/api/posts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({author,handle,caption,image:state.imageData})}); const data=await response.json(); if(!response.ok) throw Error(data.error); localStorage.setItem('vibe-name',author); localStorage.setItem('vibe-handle',handle || author.toLowerCase().replace(/\s+/g,'.')); state.posts.unshift(data.post); $('#postForm').reset(); state.imageData=''; $('#uploadPreview').innerHTML='<b>＋</b><em>Adicionar foto</em><small>JPG, PNG ou WEBP · até 3 MB</small>'; $('#captionCount').textContent='0'; renderFeed(); renderStories(); setView('feed'); } catch(error) { showFormMessage(error.message || 'Não foi possível publicar.',true); } finally { button.disabled=false; button.innerHTML='Publicar no Vibe <span>→</span>'; } }
function renderProfile() { const mine=state.posts.filter(p=>p.author.toLowerCase()===currentName().toLowerCase()); $('#profileName').textContent=currentName()==='vibe.user'?'Você no Vibe':currentName(); $('#profileHandle').textContent=`@${localStorage.getItem('vibe-handle') || 'vibe.user'}`; $('#profileAvatar').textContent=initials(currentName()); $('#profileAvatar').style.background=colorFor(currentName()); $('#postCount').textContent=mine.length; $('#profilePosts').innerHTML=mine.filter(p=>p.image).map(p=>`<img src="${p.image}" alt="Post de ${escapeHtml(p.author)}">`).join('') || '<p class="empty profile-empty">Seus posts com foto vão aparecer aqui.</p>'; }

document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view)));
$('#postForm').addEventListener('submit',publish); $('#imageInput').addEventListener('change',imagePreview); $('#caption').addEventListener('input',e=>$('#captionCount').textContent=e.target.value.length); $('#refreshFeed').addEventListener('click',loadPosts); $('#closeComments').addEventListener('click',()=>$('#commentsDialog').close()); $('#commentForm').addEventListener('submit',sendComment);
let installPrompt; window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;$('#install').hidden=false;}); $('#install').onclick=async()=>{if(!installPrompt)return;installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$('#install').hidden=true;};
if('serviceWorker' in navigator) navigator.serviceWorker.register('/service-worker.js');
renderStories(); loadPosts();
