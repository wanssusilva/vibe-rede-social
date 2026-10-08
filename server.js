const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS = path.join(PUBLIC, 'uploads');
const POSTS_FILE = path.join(DATA_DIR, 'posts.json');
const MAX_BODY = 4_500_000;
const MAX_POSTS_PER_HOUR = 20;
const usage = new Map();

for (const dir of [DATA_DIR, UPLOADS]) fs.mkdirSync(dir, { recursive: true });

const starterPosts = [
  { id:'bem-vindo', author:'Vurb', handle:'vurb.app', avatar:'V', caption:'Bem-vindo ao **Vibe**. Uma rede feita para compartilhar o que acontece de verdade por aí. Poste a sua primeira foto. ✦', image:'https://images.unsplash.com/photo-1511988617509-a57c8a288659?auto=format&fit=crop&w=1200&q=85', createdAt:'2026-10-08T15:20:00-03:00', likes:128, liked:false, comments:[{author:'ana.lima', text:'Que ideia boa!'}] },
  { id:'cidade', author:'Marina Costa', handle:'marinacosta', avatar:'M', caption:'Fim de tarde do jeito certo. Recife sempre entrega. 🌅', image:'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=85', createdAt:'2026-10-08T14:30:00-03:00', likes:46, liked:false, comments:[] }
];

function readPosts() {
  try { const posts = JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8')); return Array.isArray(posts) ? posts : starterPosts; }
  catch { fs.writeFileSync(POSTS_FILE, JSON.stringify(starterPosts, null, 2)); return starterPosts; }
}
function savePosts(posts) { fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2)); }
function send(res, code, payload, type = 'application/json; charset=utf-8', headers = {}) {
  res.writeHead(code, { 'Content-Type':type, 'X-Content-Type-Options':'nosniff', 'Cache-Control':'no-store', ...headers });
  res.end(typeof payload === 'string' || Buffer.isBuffer(payload) ? payload : JSON.stringify(payload));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''; let size = 0;
    req.on('data', chunk => { size += chunk.length; if (size > MAX_BODY) { reject(Error('Arquivo muito grande. Escolha uma foto de até 3 MB.')); req.destroy(); return; } raw += chunk; });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { reject(Error('Dados inválidos.')); } });
    req.on('error', reject);
  });
}
function clientIp(req) { return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown'; }
function rateLimit(req) {
  const key = `${clientIp(req)}:${Math.floor(Date.now()/3600000)}`;
  const n = usage.get(key) || 0; if (n >= MAX_POSTS_PER_HOUR) return false;
  usage.set(key, n + 1); return true;
}
function clean(value, max) { return String(value || '').trim().replace(/[<>]/g, '').slice(0, max); }
function saveImage(dataUrl) {
  const match = String(dataUrl || '').match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) return '';
  const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
  const data = Buffer.from(match[2], 'base64');
  if (!data.length || data.length > 3 * 1024 * 1024) throw Error('A foto deve ter até 3 MB.');
  const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS, name), data, { flag:'wx' });
  return `/uploads/${name}`;
}
function staticFile(req, res) {
  const urlPath = req.url === '/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0]);
  const target = path.normalize(path.join(PUBLIC, urlPath));
  if (!target.startsWith(PUBLIC + path.sep) && target !== path.join(PUBLIC, 'index.html')) return send(res, 403, {error:'Acesso negado'});
  fs.readFile(target, (err, data) => {
    if (err) return send(res, 404, {error:'Não encontrado'});
    const types = {'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};
    send(res, 200, data, types[path.extname(target).toLowerCase()] || 'application/octet-stream', {'Cache-Control': urlPath.startsWith('/uploads/') ? 'public, max-age=31536000, immutable' : 'no-store'});
  });
}
async function api(req, res) {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (req.method === 'GET' && pathname === '/api/health') return send(res, 200, {ok:true, app:'Vibe', posts:readPosts().length});
  if (req.method === 'GET' && pathname === '/api/posts') return send(res, 200, {posts:readPosts().sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt))});
  if (req.method === 'POST' && pathname === '/api/posts') {
    if (!rateLimit(req)) return send(res, 429, {error:'Você atingiu o limite temporário de publicações. Tente novamente mais tarde.'});
    try {
      const body = await readBody(req); const author = clean(body.author, 32); const caption = clean(body.caption, 1200);
      if (!author || !caption) return send(res, 400, {error:'Adicione seu nome e uma legenda para publicar.'});
      const post = {id:crypto.randomUUID(), author, handle:clean(body.handle, 32).replace(/\s+/g,'').replace(/^@/,'') || author.toLowerCase().replace(/\s+/g,'.'), avatar:author[0].toUpperCase(), caption, image:saveImage(body.image), createdAt:new Date().toISOString(), likes:0, liked:false, comments:[]};
      const posts = readPosts(); posts.unshift(post); savePosts(posts); return send(res, 201, {post});
    } catch (error) { return send(res, 400, {error:error.message || 'Não foi possível publicar agora.'}); }
  }
  const likeMatch = pathname.match(/^\/api\/posts\/([^/]+)\/like$/);
  if (req.method === 'POST' && likeMatch) {
    const posts = readPosts(); const post = posts.find(p => p.id === likeMatch[1]); if (!post) return send(res,404,{error:'Post não encontrado.'});
    post.liked = !post.liked; post.likes = Math.max(0, (post.likes || 0) + (post.liked ? 1 : -1)); savePosts(posts); return send(res,200,{id:post.id,likes:post.likes,liked:post.liked});
  }
  const commentMatch = pathname.match(/^\/api\/posts\/([^/]+)\/comments$/);
  if (req.method === 'POST' && commentMatch) {
    try { const body = await readBody(req); const text = clean(body.text, 300); const author = clean(body.author, 32) || 'vibe.user'; const posts=readPosts(); const post=posts.find(p=>p.id===commentMatch[1]); if(!post) return send(res,404,{error:'Post não encontrado.'}); if(!text) return send(res,400,{error:'Escreva um comentário.'}); const comment={author,text}; post.comments=[...(post.comments||[]),comment].slice(-50); savePosts(posts); return send(res,201,{comment}); } catch(error) { return send(res,400,{error:error.message || 'Não foi possível comentar.'}); }
  }
  return send(res,404,{error:'Rota não encontrada.'});
}
const server = http.createServer((req,res) => {
  if (req.url.startsWith('/api/')) return api(req,res);
  if (req.method === 'GET') return staticFile(req,res);
  return send(res,405,{error:'Método não permitido.'});
});
if (require.main === module) server.listen(PORT, () => console.log(`Vibe pronto na porta ${PORT}`));
module.exports = {server};
