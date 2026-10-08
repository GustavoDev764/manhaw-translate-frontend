# Manhwa Translate — interface web

Interface da plataforma de tradução de manhwas. Com ela, as scans acompanham as séries, disparam as etapas de processamento, revisam as páginas traduzidas e administram usuários e configurações.

Ela conversa só com a API do [manhaw-translate](../manhaw-translate), onde ficam também a arquitetura e as instruções de deploy.

React 19 + TypeScript + Vite + Tailwind CSS 4, sem biblioteca de rotas nem de estado: as rotas usam o hash da URL (`#/...`).

## Rodar

A API precisa estar no ar, no outro projeto:

```bash
cd ../manhaw-translate
npm run api               # http://127.0.0.1:3000/api
```

E aqui:

```bash
npm install
npm run dev               # http://localhost:5173
```

O endereço da API e a porta da interface ficam no `.env` (copie de `.env.example`):

| Variável | Padrão | Para quê |
|---|---|---|
| `API_PROXY` | `http://127.0.0.1:3000` | Para onde o Vite encaminha `/api`: use a porta do `PORT` do backend |
| `PORT` | `5173` | Porta da interface (`dev` e `preview`) |

Só o servidor de desenvolvimento lê esses valores; eles não vão para o código do navegador. Definida no terminal, a variável vale mais que a do arquivo, por exemplo para usar a API de testes:

```bash
API_PROXY=http://127.0.0.1:3100 npm run dev
```

Entre com o admin do sistema criado pelo `npm run db:seed` (variáveis `USER_ADMIN_EMAIL` e `USER_ADMIN_PASSWORD` do `.env` do backend).

## Telas

| Rota | Tela | Quem vê |
|---|---|---|
| `#/` | **Manhwas**: biblioteca da scan, com o progresso de cada série e o botão “Nova série” | todos |
| `#/s/<série>` | **Série**: capítulos por etapa, “Importar capítulos” (vários .zip de uma vez) e o disparo dos workflows | todos |
| `#/s/<série>/<capítulo>` | **Capítulo**: páginas e o status de cada etapa | todos |
| `#/s/<série>/glossario` | **Glossário**: termos aprovados e os novos sugeridos pela tradução | todos (editar depende da permissão) |
| `#/r/<página>` | **Revisão**: comparação com o original, marcar área, corrigir com o Claude, histórico de versões, aprovar. Na aba Texto, a página limpa com as caixas: o texto muda na imagem enquanto se digita, salva sozinho, Ctrl+Z desfaz e **Aplicar alteração** publica a versão nova. Só uma pessoa edita a página por vez | todos |
| `#/workflows` | **Workflows**: fila, andamento ao vivo, erros, repetir e pular itens | todos |
| `#/settings/...` | **Configurações**: usuários, times, funcionalidades, auditoria, chave da API da scan | admins |
| `#/settings/...` | Scans, perfis, armazenamento, processamento, chaves da API, e-mail, fontes | admin do sistema |
| `#/profile` | Nome, senha e sessões abertas | todos |
| `#/legacy`, `#/series/...`, `#/queue`, `#/jobs` | Telas da versão antiga, por arquivo e sem isolamento por scan | admin do sistema |

Na importação, cada `.zip` sobe em segundo plano (2 por vez) e a fila continua mesmo saindo da tela da série. O capítulo pisca em azul enquanto o arquivo sobe e em amarelo enquanto o servidor descompacta; ao terminar, a cor some.

Os botões de uma funcionalidade desligada pelo administrador aparecem desabilitados, com o motivo. O andamento dos workflows e as notificações chegam em tempo real (SSE em `/api/events`).

## Comandos

| Comando | Para quê |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Checa os tipos e gera `dist/` |
| `npm run preview` | Serve o `dist/` localmente |
| `npm run lint` | ESLint (inclui a regra que proíbe comentários) |
| `npm run comments:strip` | Remove todos os comentários do código |

## Estrutura

```
src/
  App.tsx            rotas (hash), cabeçalho e permissões por perfil
  api.ts             cliente HTTP (/api) e as chamadas das telas antigas
  adminApi.ts        usuários, scans, times, funcionalidades, armazenamento
  workflowsApi.ts    biblioteca e workflows
  reviewApi.ts       revisão, versões, fontes, glossário
  keysApi.ts         chaves da API e e-mail
  auth/              sessão do usuário e permissões (useAuth, can)
  components/        UI base (ui.tsx), LaunchDialog, FontPicker, eventos em tempo real
  pages/library/     biblioteca, série, capítulo, glossário
  pages/settings/    Configurações
  pages/             revisão, workflows, login, perfil e telas antigas
```

## Deploy

O frontend é um projeto independente: não importa nada do backend. Tudo o que ele precisa vem pela API, como as combinações de modelos (`GET /api/models/presets`) e a regra de nome das fontes (`GET /api/fonts/rules` e `POST /api/fonts/check-names`).

O login usa cookie `SameSite=Lax` (e `Secure` em produção), então o frontend e a API precisam estar no **mesmo domínio**, em HTTPS. Por isso a imagem Docker faz as duas coisas:
- serve o `dist/` com o Caddy;
- encaminha `/api` para a API, incluindo os eventos em tempo real (`/api/events`).

### Produção no Railway (GitHub Actions)

Todo push na `main` roda `.github/workflows/production.yml`:

1. **Verificar:** `npm ci`, checagem de comentários, lint e `npm run build`.
2. **Publicar:** só se o passo 1 passar. Roda `railway up --ci` no serviço do frontend.

O Railway monta a imagem pelo `Dockerfile`: o build com Node 24 e, na imagem final, só o Caddy com o `dist/` (cerca de 95 MB). O deploy só troca a versão quando `/` responde.

**Configuração única no Railway** (no mesmo projeto da API)

1. Crie um serviço vazio para o frontend. Não conecte o repositório: quem publica é o GitHub Actions.
2. Em **Variables**, defina `API_URL` com o endereço da API na rede privada, por exemplo `http://${{manhwa-api.RAILWAY_PRIVATE_DOMAIN}}:3000`, trocando `manhwa-api` pelo nome do serviço da API. `PORT` é definida pelo Railway.
3. Em **Settings → Networking**, gere o domínio público, ou ligue o seu. Esse é o endereço que as pessoas acessam, e ele vai em `APP_URL` na API.
4. A API não precisa de domínio público: o frontend fala com ela pela rede privada.

**Configuração única no GitHub** (Settings → Environments → `production`)

- Secret `RAILWAY_TOKEN`: o token de projeto do Railway (pode ser o mesmo da API).
- Variável `RAILWAY_SERVICE`: o nome do serviço do frontend no Railway.
- Variável `PRODUCTION_URL` (opcional): o domínio público.

### Testar a imagem localmente

```bash
docker build -t manhwa-frontend .
docker run -p 8088:8080 -e API_URL=http://host.docker.internal:3000 manhwa-frontend
```

Abra `http://localhost:8088`. Para isso a API precisa ouvir em todos os endereços (`HOST=::` no `.env` do backend).
