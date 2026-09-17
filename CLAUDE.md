# DMXI Project Guidelines

## Data Persistence Rule (CRITICAL)

**Any feature that stores user data MUST have a backend API and database table.**

Never implement a data feature using only React state or module-level variables (`useState`, `let list = []`, etc.). Data stored only in memory is lost on every page navigation or browser refresh.

Before building a new data feature, check:
1. Does it have a Prisma model? If not, add one and run `prisma migrate dev`.
2. Does it have a server route (`server/src/routes/*.ts`) mounted in `company-scoped.ts`?
3. Does the client fetch from the API (`useCompanyApi`) and persist changes via POST/PATCH/DELETE?

If any of these are missing, the feature is incomplete regardless of how good the UI looks.

### Pattern to follow for every new entity

```
server/prisma/schema.prisma       ← add model + relation on Company
server/src/routes/<entity>.ts     ← GET list, POST create, PATCH update, DELETE
server/src/routes/company-scoped.ts ← mount the router
client/src/pages/<Entity>Page.tsx ← useEffect fetch on mount, API calls on mutations
```

## Stack

- **Server**: Node + Express + TypeScript (tsx), Prisma ORM, PostgreSQL
- **Client**: React + TypeScript (Vite), no external state library
- **Auth**: JWT stored in localStorage, passed as Bearer token
- **API scope**: all company data routes are under `/api/companies/:companyId/`
- **PM2**: `pm2 restart all` to restart both server and client dev processes
