# Vibe — PWA de rede social

Uma rede social móvel, inspirada nos padrões de feed, stories e perfil de apps de fotos — sem copiar marca ou identidade visual de terceiros.

## Inclui

- Feed público com posts persistidos no servidor
- Criação de posts com foto (até 3 MB), nome, @ e legenda
- Curtidas, comentários e compartilhamento
- Perfil básico do autor local
- Layout responsivo pensado para celular
- Manifesto e service worker para instalação como PWA e abertura offline da interface

## Rodar

```bash
npm start
```

Abra `http://localhost:3000`.

As publicações ficam no arquivo `data/posts.json` e as imagens em `public/uploads/`. Para produção, publique atrás de HTTPS e troque o armazenamento local por banco de dados, autenticação e moderação antes de abrir para grande volume de pessoas.

## Teste rápido

```bash
node --check server.js
node --check public/app.js
curl http://localhost:3000/api/health
```
