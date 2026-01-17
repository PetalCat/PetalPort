import Docker from 'dockerode';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

/**
 * Run a UFW command on the host via a privileged Docker container
 */
async function runUfwCommand(command: string): Promise<string> {
    const container = await docker.createContainer({
        Image: 'alpine:latest',
        Cmd: ['sh', '-c', command],
        HostConfig: {
            AutoRemove: true,
            NetworkMode: 'host',
            Privileged: true,
            Binds: [
                '/usr/sbin/ufw:/usr/sbin/ufw:ro',
                '/etc/ufw:/etc/ufw:rw',
                '/lib:/lib:ro',
                '/usr/lib:/usr/lib:ro'
            ]
        }
    });

    await container.start();
    const result = await container.wait();

    // Get logs
    const logs = await container.logs({ stdout: true, stderr: true });
    return logs.toString();
}

/**
 * Allow a TCP port through UFW
 */
export async function allowPort(port: number, comment?: string): Promise<void> {
    try {
        const commentArg = comment ? ` comment "${comment}"` : '';
        console.log(`[Firewall] Allowing port ${port}/tcp`);
        await runUfwCommand(`ufw allow ${port}/tcp${commentArg}`);
    } catch (error) {
        console.error(`[Firewall] Failed to allow port ${port}:`, error);
        // Don't throw - firewall errors shouldn't break the app
    }
}

/**
 * Deny/remove a TCP port from UFW
 */
export async function denyPort(port: number): Promise<void> {
    try {
        console.log(`[Firewall] Removing port ${port}/tcp`);
        await runUfwCommand(`ufw delete allow ${port}/tcp`);
    } catch (error) {
        console.error(`[Firewall] Failed to remove port ${port}:`, error);
    }
}

/**
 * Sync firewall rules with current proxies
 */
export async function syncFirewallRules(ports: number[]): Promise<void> {
    for (const port of ports) {
        await allowPort(port, 'FRP Tunnel');
    }
}
