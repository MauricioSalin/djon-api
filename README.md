# DJ ON API

Backend NestJS do portal DJ ON Academy. A API substitui o estado mockado do frontend por dados persistidos no MongoDB e oferece autenticação JWT, autorização por perfil, documentação OpenAPI e auditoria de mutações.

## Stack

- NestJS 11 + TypeScript
- MongoDB/Mongoose
- JWT + bcrypt e RBAC (`admin`, `professor`, `student`)
- Web Push opcional
- Cloudflare R2 para fotos, capas e anexos, com metadados no MongoDB
- Jest/Supertest para testes unitários e E2E

## Funcionalidades

- login e consulta da sessão;
- usuários, perfis de alunos/professores, ativação e desativação;
- agendamentos de aulas e treinos, disponibilidade, conflitos, aprovação, rejeição, cancelamento e remarcação;
- mural de eventos com autoria e permissões;
- materiais, categorias, anexos e conteúdo HTML sanitizado;
- notificações persistidas, leitura, exclusão e inscrições Web Push;
- unidades, leads públicos, busca integrada e upload/download pelo Cloudflare R2;
- logs administrativos de auditoria para toda mutação HTTP;
- health check e Swagger.

Todas as rotas usam o prefixo `/api/v1`. A documentação interativa fica em `/docs`.

## Ambiente local

```powershell
npm install
Copy-Item .env.example .env
npm run start:dev
```

O `.env` real não entra no Git. Defina uma `JWT_SECRET` longa, ajuste `MONGODB_URI`, configure as variáveis `R2_*` e restrinja `CORS_ORIGINS` aos domínios permitidos. As chaves VAPID são opcionais; sem elas, as notificações continuam persistidas, mas não enviam push.

## Carga inicial

O snapshot de migração foi retirado do frontend e agora pertence exclusivamente ao backend. A carga também importa capas e anexos para o Cloudflare R2:

```powershell
npm run seed
```

O snapshot contém 8 usuários, 67 eventos, 74 agendamentos, 6 categorias e 8 materiais. O seed é reproduzível e recria somente as coleções da aplicação no banco indicado por `MONGODB_URI`. Todos os usuários importados recebem a senha definida em `SEED_DEFAULT_PASSWORD`.

## Validação

```powershell
npm test -- --runInBand
npm run test:e2e
npm run lint
npm run build
npm audit
```

Os E2E sobem `mongo:8.0` em um container Docker descartável, utilizam um banco exclusivo `djon_e2e_*` e removem o container ao final. Docker precisa estar em execução.

## Principais grupos de rotas

| Grupo | Base | Acesso |
|---|---|---|
| Autenticação | `/auth` | login público; sessão autenticada |
| Usuários | `/users` | perfil próprio; gestão por admin/professor conforme papel |
| Agendamentos | `/bookings` | aluno, professor e admin com escopo por papel |
| Eventos | `/events` | usuários autenticados; edição pelo autor/admin |
| Materiais | `/materials` | leitura autenticada; gestão por professor/admin |
| Notificações | `/notifications` | caixa do próprio usuário; criação por admin |
| Unidades | `/units` | leitura pública; gestão por admin |
| Leads | `/leads` | criação pública limitada; gestão por admin |
| Arquivos | `/files` | upload autenticado; leitura pública por identificador; exclusão pelo proprietário/admin |
| Busca | `/search` | autenticado |
| Auditoria | `/audit-logs` | admin |
| Saúde | `/health` | público |

Consulte o Swagger para os payloads, filtros, paginação e respostas completos.

## Publicação

O arquivo `railway.json` configura o Railpack para executar `npm run build`, iniciar a API com `npm run start:prod` e validar `/api/v1/health` antes de liberar uma implantação.

No Railway, conecte este repositório e cadastre as variáveis de `.env.example`. Use obrigatoriamente `NODE_ENV=production`, uma `JWT_SECRET` exclusiva e o domínio público do frontend em `CORS_ORIGINS`. A variável `PORT` é fornecida automaticamente pela plataforma e não precisa ser cadastrada.

Depois da primeira implantação, gere um domínio público no serviço e valide:

```text
https://<dominio-do-servico>/api/v1/health
https://<dominio-do-servico>/docs
```

O `.env` local é ignorado pelo Git e nunca deve ser copiado para o Railway como arquivo; os valores devem ser cadastrados na área de variáveis do serviço.
