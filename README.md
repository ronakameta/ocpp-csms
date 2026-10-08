# ocpp-csms

A charging station management system (CSMS) for EV chargers, speaking OCPP 1.6-J and, later, OCPP 2.0.1. Built module by module as a learning project: database design, API design, authentication, the OCPP message layer, smart charging, and scaling to thousands of chargers.

## Run it locally

Requires Node.js 22 and Docker.

```bash
cp .env.example .env
docker compose up -d     # Postgres and Redis
npm install
npm run dev              # http://localhost:3000/health
```

## Scripts

| Command                              | What it does                         |
| ------------------------------------ | ------------------------------------ |
| `npm run dev`                        | Start with reload on change          |
| `npm test`                           | Run the tests                        |
| `npm run lint` / `npm run typecheck` | Static checks                        |
| `npm run build` / `npm start`        | Build and run the production version |

## Progress

- [ ] Module 0: Foundations
- [ ] Module 1: Database design
- [ ] Module 2: REST API design
- [ ] Module 3: Authentication and security
- [ ] Module 4: WebSocket server and OCPP-J message layer
- [ ] Module 5: Charger simulator
- [ ] Module 6: OCPP core
- [ ] Module 7: Remote control and configuration
- [ ] Module 8: Smart charging
- [ ] Module 9: Production readiness
- [ ] Module 10: OCPP 2.0.1
- [ ] Module 11: Scaling to thousands of chargers

## What I learned

Notes added after each module.
