# Ojo

Invisible runtime trust layer for package management. Automatically intercepts `npm install`, `pnpm add`, and `bun add`, executes each package in an isolated Docker sandbox, analyzes behavior, and blocks malicious dependencies before they reach your machine.

```bash
npm install -g @itssergio91/ojo
ojo init
```

Now every install is verified:

```
$ npm install some-package
✗  Ojo trust report for some-package
  risk: MEDIUM (score: 30)
  triggers:
    ✗ package_metadata  (+30)
```

Requires **Node.js >= 22** and **Docker**.
