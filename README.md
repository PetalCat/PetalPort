# PetalPort

PetalPort is a self-hosted overlay network controller that provides a secure Control Plane for WireGuard VPNs and FRP Port Forwarding tunnels.

## Architecture

- **Control Plane** (TCP 8456): SvelteKit Panel. Manages Agents, Tunnels, and WireGuard peers.
- **Data Plane**:
  - **FRP Server** (TCP 7000): Accepts Agent tunnels.
  - **WireGuard** (UDP 443): Provides private VPN access.
- **Agent Plane**: Containerized agents that auto-enroll and sync configuration changes in real-time.

## 🚀 Server Deployment

Deploy PetalPort on your VPS or heavy edge node.

1. **Configure Environment**:
   Ensure your `.env` (or environment variables) are set if using Cloudflare Tunnels, though the core stack works standalone.

2. **Start the Stack**:
   ```bash
   docker-compose up -d --build
   ```

3. **Access the Panel**:
   - URL: `http://your-server-ip:8456`
   - (Optional) FRP Dashboard: `http://your-server-ip:7500` (User/Pass: `admin`/`admin`)

## 🤖 Agent Deployment

Agents run on your remote devices (e.g., Minecraft server, NAS, Raspberry Pi) to expose services.

### 1. Agent Image
You can use the automated GitHub Action to publish to GHCR, or build manually.

**Automated (Recommended)**:
1. Push this repo to GitHub.
2. The Action will build `ghcr.io/<your-user>/petalport-agent:latest`.

**Manual**:
```bash
docker login ghcr.io
docker build -t ghcr.io/<your-user>/petalport-agent:latest ./agent
docker push ghcr.io/<your-user>/petalport-agent:latest
```

### 2. Enroll an Agent
1. Go to the **Agents** tab in the Panel.
2. Click **Connect New Agent**.
3. Copy the generated command.
4. Run it on your remote machine:

```bash
docker run -d \
  --name petalport-agent \
  --restart unless-stopped \
  --network host \
  --cap-add NET_ADMIN \
  -e PANEL_URL=http://your-panel-ip:8456 \
  -e ENROLL_KEY=<your-key> \
  petalport-agent
```

The agent will connect, authenticate, and wait for tunnel assignments.

### 3. Expose a Service
1. Go to **FRP Tunnels**.
2. Create a specific tunnel (e.g., Minecraft TCP 25565).
3. Assign it to your new Agent.
4. The Agent will instantly pull the config and open the tunnel.

### 4. Use in GitHub Actions (CI/CD)

You can use PetalPort to expose services running inside your GitHub Actions pipelines (e.g., for debugging or preview environments).

```yaml
steps:
  - name: Start Service
    run: npm start &

  - name: Expose via PetalPort
    uses: ./agent # or your-username/petalport-agent@main
    with:
      panel-url: 'http://your-vps:8456'
      enroll-key: '${{ secrets.PETALPORT_KEY }}'
```
