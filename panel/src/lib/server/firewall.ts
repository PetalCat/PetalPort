import Docker from 'dockerode';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

/**
 * Run a UFW command on the host via a privileged Docker container
 */
async function runUfwCommand(command: string): Promise<string> {
    console.log(`[Firewall] Running on host: ${command}`);
    const container = await docker.createContainer({
        Image: 'alpine:latest',
        // Install util-linux to get nsenter, then execute command on host (pid 1)
        // Use full path /usr/sbin/ufw just in case
        Cmd: ['sh', '-c', `apk add --no-cache util-linux >/dev/null 2>&1 && nsenter -t 1 -m -u -n -i -- sh -c "/usr/sbin/ufw ${command}"`],
        HostConfig: {
            AutoRemove: false, // Keep it briefly to read logs if needed (we read then remove)
            Privileged: true,
            PidMode: 'host'
        }
    });

    await container.start();
    const status = await container.wait();

    // Get logs
    const logs = await container.logs({ stdout: true, stderr: true });
    await container.remove();

    if (status.StatusCode !== 0) {
        console.error(`[Firewall] Command failed (exit ${status.StatusCode}): ${logs.toString()}`);
        throw new Error(`Firewall command failed: ${logs.toString()}`);
    }

    return logs.toString();
}

/**
 * Allow a TCP port through UFW
 */
export async function allowPort(port: number, comment?: string): Promise<void> {
    const commentArg = comment ? ` comment "${comment}"` : '';
    await runUfwCommand(`allow ${port}/tcp${commentArg}`);
}

/**
 * Deny/remove a TCP port from UFW
 */
export async function denyPort(port: number): Promise<void> {
    await runUfwCommand(`delete allow ${port}/tcp`);
}

/**
 * Sync firewall rules with current proxies
 */
export async function syncFirewallRules(ports: number[]): Promise<void> {
    for (const port of ports) {
        await allowPort(port, 'FRP Tunnel');
    }
}
