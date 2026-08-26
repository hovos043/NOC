# Name.am NOC Dashboard Web Edition

Այս branch-ը պահում է web preview տարբերակը՝ առանց գործող Windows desktop app-ը փոխելու։

## Current Preview Mode

GitHub Pages preview-ը build է արվում `VITE_DEMO_MODE=true` env-ով։

Այդ ռեժիմում frontend-ը օգտագործում է demo data.

- SSH command execution իրական սերվերի վրա չի աշխատում
- WHM token-ներ չեն օգտագործվում
- secrets չեն փոխանցվում browser
- backend API-ի փոխարեն օգտագործվում է local mock adapter

Preview URL-ը կլինի.

```text
https://hovos043.github.io/NOC/
```

GitHub Actions-ից deployment-ը պետք է միացված լինի Pages-ի համար։

## Production Web Direction

Իրական web տարբերակի համար պետք է առանձին backend deployment.

```text
HTTPS reverse proxy
  -> React frontend
  -> FastAPI backend
  -> PostgreSQL կամ MariaDB
```

Production web տարբերակում պարտադիր է.

- real login/session authentication
- role-based access
- HTTPS only
- backend-side SSH/WHM execution
- encrypted secrets server-side
- audit logs
- backup/restore flow

Browser-ը երբեք չպետք է ստանա SSH password, private key կամ WHM token։
