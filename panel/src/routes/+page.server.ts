import { listContainers } from '$lib/server/docker';

export const load = async () => {
    const containers = await listContainers();
    return {
        containers: JSON.parse(JSON.stringify(containers)) // Dockerode returns complex objects, simplify for serializable
    };
};
