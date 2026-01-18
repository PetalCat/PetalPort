import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/**
 * Run a UFW command on the host directly (we are privileged + pid:host)
 */
async function runUfwCommand(command: string): Promise<string> {
    console.log(`[Firewall] Running on host: ${command}`);

    // We are privileged and share PID namespace with host.
    // We can use nsenter to jump to PID 1's namespace (host init) and run the command.
    const fullCommand = `nsenter -t 1 -m -u -n -i -- sh -c "/usr/sbin/ufw ${command}"`;

    try {
        const { stdout, stderr } = await execAsync(fullCommand);
        if (stderr) console.warn(`[Firewall] Stderr: ${stderr}`);
        return stdout;
    } catch (e: any) {
        console.error(`[Firewall] Command failed: ${fullCommand}`, e);
        throw new Error(`Firewall command failed: ${e.message}`);
    }
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
