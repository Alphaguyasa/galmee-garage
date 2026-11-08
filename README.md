# Galmee Garage

Type a plate number and see every repair and part ever put on that car.

Part of **Galmee**, business systems for Ethiopian businesses, by Alpha. Mobile-first PWA in Amharic, Afaan Oromo and English. Live at https://galmee-garage.vercel.app.

## What it does

- Plate search: one field, the whole history of that car
- Job cards: complaint, mechanic, parts, labour, payments, status from waiting to handed over
- Parts stock: list, add, receive stock; parts used on a job leave stock
- Mechanic work list and unpaid jobs
- Unpaid balances move to the customer's credit ledger when the car is handed over
- An SMS with the amount due is queued when the car is marked ready

## Stack

Next.js (App Router), TypeScript, Tailwind, next-intl, Supabase (Postgres with row-level security per business), deployed on Vercel.

## Local setup

```sh
cp .env.example .env.local   # public Supabase URL and publishable key
npm install
npm run dev
```

## Environment variables

| Name | Where | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | app | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | app | Publishable key only; the service-role key is never used here |

SMS and Telegram credentials live only in Supabase Edge Function secrets.

## Checks

```sh
npm run lint
npm test
npm run build
npm run screenshots   # with `npx next start -p 3123` running
```

Database changes live in `supabase/migrations/`. `supabase/tests/gr_rls_test.sql` is the cross-tenant test; it rolls itself back and reports through its final message.

## Deploy

The GitHub repository is linked to Vercel: every push to `main` deploys to production.

See `ROADMAP.md` for progress.
