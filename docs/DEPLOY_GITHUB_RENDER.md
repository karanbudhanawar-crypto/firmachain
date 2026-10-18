# Publish FirmaChain to GitHub and deploy on Render

## A. Upload to GitHub
1. Sign in to https://github.com and create a new **public** repository named `firmachain` (or choose a private repo if preferred). Do not initialize it with a README because this folder already has one.
2. Extract `FirmaChain_Project_DeployReady.zip` and open the inner `FirmaChain` folder in VS Code.
3. Open Terminal in that folder and run:

```bash
git init
git add .
git commit -m "Initial FirmaChain prototype"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/firmachain.git
git push -u origin main
```

Replace `YOUR-USERNAME` with your GitHub username. If Git asks you to authenticate, complete the browser sign-in; do not put a password or access token in source code.

## B. Deploy to Render
1. Sign in to https://render.com and connect your GitHub account.
2. In Render, choose **New → Blueprint** and select the `firmachain` repository.
3. Render reads `render.yaml`, creates the Python web service and PostgreSQL database, and uses `/api/health` as the health check. Review the services and click Apply.
4. Wait for the deploy to finish. Open the public `https://firmachain.onrender.com` URL shown in the Render service dashboard. If that name is unavailable, use the exact URL Render assigns.
5. Verify `/api/health`, `/docs`, and the dashboard. Test a report with the simulator locally or use the API docs.

## Deployment notes
- Render free web services may sleep when idle, and free database availability/retention limits can change. Check the current Render dashboard and pricing before relying on persistent storage.
- Never enable firewall enforcement on Render: Render is not your local IoT gateway. Keep `GATEWAY_MODE=simulation` and `ALLOW_FIREWALL_CHANGES=false`. Real gateway isolation must run on a controlled Linux/OpenWrt gateway you administer.
- The blockchain Solidity contract and ESP32 firmware starter are included in GitHub, but are not deployed/executed by the Render web service. EVM integration and real ESP32 security configuration are separate project phases.
- For production use, add authentication/authorization, rate limiting, secrets management, trusted device identity/attestation, and review the recovery workflow.
