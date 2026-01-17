type Controller = ReadableStreamDefaultController<string>;

// Map agentId to a Set of controllers (in case of multiple connections/tabs/processes)
const clients = new Map<string, Set<Controller>>();

export const addClient = (agentId: string, controller: Controller) => {
    if (!clients.has(agentId)) {
        clients.set(agentId, new Set());
    }
    clients.get(agentId)!.add(controller);

    // Cleanup if stream closes
    // Note: The controller doesn't emit 'close' directly here easily in standard Streams API without wrapper logic in the route.
    // Ideally we rely on the route handler to call removeClient when the stream cancels.
};

export const removeClient = (agentId: string, controller: Controller) => {
    const agentClients = clients.get(agentId);
    if (agentClients) {
        agentClients.delete(controller);
        if (agentClients.size === 0) {
            clients.delete(agentId);
        }
    }
};

export const emitToAgent = (agentId: string, event: string, data: any) => {
    const agentClients = clients.get(agentId);
    if (!agentClients) return;

    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

    for (const controller of agentClients) {
        try {
            controller.enqueue(message);
        } catch (e) {
            // Stream potentially closed
            removeClient(agentId, controller);
        }
    }
};

export const broadcast = (event: string, data: any) => {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const [agentId, controllers] of clients) {
        for (const controller of controllers) {
            try {
                controller.enqueue(message);
            } catch (e) {
                removeClient(agentId, controller);
            }
        }
    }
};
