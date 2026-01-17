import Docker from 'dockerode';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

export const listContainers = async () => {
  const containers = await docker.listContainers({ all: true });
  // Filter for our services if needed, currently returning all for debug
  return containers.filter(c => c.Names.some(n => n.includes('petalport')));
};

export const getContainerStats = async (containerName: string) => {
  try {
    const container = docker.getContainer(containerName);
    const stats = await container.stats({ stream: false });
    return stats;
  } catch (e) {
    console.error(`Failed to get stats for ${containerName}`, e);
    return null;
  }
};

export const restartContainer = async (containerName: string) => {
  try {
    const container = docker.getContainer(containerName);
    await container.restart();
    return { success: true };
  } catch (e) {
    console.error(`Failed to restart ${containerName}`, e);
    return { success: false, error: e };
  }
};
