import { ContainerRegistryManagementClient } from "@azure/arm-containerregistry";
import { AgentPoolHandler } from "../../../src/functions/logic/agentPool";

const getAgentPoolMocks = (queueCount: number, agentCount: number, agentProvisioningState = 'Succeeded', agentLastModifiedAt = new Date().toISOString()) => (
    {
        getQueueStatus: jest.fn(() => (
            Promise.resolve({
                count: queueCount
            })
        )),
        get: jest.fn(() => (
            Promise.resolve(
                {
                    count: agentCount,
                    // https://learn.microsoft.com/en-us/rest/api/containerregistry/runs/get?view=rest-containerregistry-2019-04-01&tabs=HTTP#provisioningstate
                    provisioningState: agentProvisioningState,
                    systemData: {
                        lastModifiedAt: agentLastModifiedAt
                    }
                }
            )))
    }
)

describe('getNewPoolSize', () => {
    describe('will return undefined if', () => {
        test('there are agent(s) that are executing jobs', async () => {
            const client = {
                agentPools: getAgentPoolMocks(0, 1),
            } as unknown as ContainerRegistryManagementClient;
            const agentPoolHandler = new AgentPoolHandler(client, '', '', 'testPool');
            jest.spyOn(agentPoolHandler, 'getRuns').mockResolvedValue([
                {
                    agentPoolName: 'testPool',
                    status: 'Running'
                }
            ])
            expect(await agentPoolHandler.getNewPoolSize()).toBeUndefined()
        })

        test('agent pool is not successfully provisioned', async () => {
            const client = {
                agentPools: getAgentPoolMocks(0, 1, 'Updating'),
            } as unknown as ContainerRegistryManagementClient;
            const agentPoolHandler = new AgentPoolHandler(client, '', '', 'testPool');
            const getRunsMock = jest.spyOn(agentPoolHandler, 'getRuns')
            getRunsMock.mockResolvedValue([])
            expect(await agentPoolHandler.getNewPoolSize()).toBeUndefined()
            expect(getRunsMock).not.toHaveBeenCalled();
        })

        test('cooldown period is on-going for agents', async () => {
            const client = {
                agentPools: getAgentPoolMocks(0, 1, 'Succeeded'),
            } as unknown as ContainerRegistryManagementClient;
            const agentPoolHandler = new AgentPoolHandler(client, '', '', 'testPool');
            jest.spyOn(agentPoolHandler, 'getRuns').mockResolvedValue([
                {
                    agentPoolName: 'testPool',
                    // https://learn.microsoft.com/en-us/rest/api/containerregistry/runs/get?view=rest-containerregistry-2019-04-01&tabs=HTTP#runstatus
                    status: 'Succeeded',
                    finishTime: new Date(Date.now() - 60000)
                }
            ])
            expect(await agentPoolHandler.getNewPoolSize()).toBeUndefined()
        })

        test('cooldown period is on-going for jobs', async () => {
            const client = {
                agentPools: getAgentPoolMocks(0, 1, 'Succeeded', new Date(Date.now() - 60000).toISOString()),
            } as unknown as ContainerRegistryManagementClient;
            const agentPoolHandler = new AgentPoolHandler(client, '', '', 'testPool');
            jest.spyOn(agentPoolHandler, 'getRuns').mockResolvedValue([
                {
                    agentPoolName: 'testPool',
                    // https://learn.microsoft.com/en-us/rest/api/containerregistry/runs/get?view=rest-containerregistry-2019-04-01&tabs=HTTP#runstatus
                    status: 'Succeeded',
                    finishTime: new Date()
                }
            ])
            expect(await agentPoolHandler.getNewPoolSize()).toBeUndefined()
        })
    })

    describe('will scale out if', () => {
        test('there are more items in queue that should be handled by single agent', async () => {
            const client = {
                agentPools: getAgentPoolMocks(6, 1),
            } as unknown as ContainerRegistryManagementClient;
            const agentPoolHandler = new AgentPoolHandler(client, '', '', '');
            expect(await agentPoolHandler.getNewPoolSize()).toEqual(2);
        })

        test('there are more items in queue that should be handled by multiple agents', async () => {
            const client = {
                agentPools: getAgentPoolMocks(20, 1),
            } as unknown as ContainerRegistryManagementClient;
            const agentPoolHandler = new AgentPoolHandler(client, '', '', '');
            expect(await agentPoolHandler.getNewPoolSize()).toEqual(4);
        })

        test('there are no agents and jobs waiting in queue', async () => {
            const client = {
                agentPools: getAgentPoolMocks(1, 0),
            } as unknown as ContainerRegistryManagementClient;
            const agentPoolHandler = new AgentPoolHandler(client, '', '', '');
            expect(await agentPoolHandler.getNewPoolSize()).toEqual(1);
        })
    })

    describe('will scale in if', () => {
        describe('no jobs are running, pool is not changing and', () => {
            test('cooldown period for both pool and jobs is passed', async () => {
                const client = {
                    agentPools: getAgentPoolMocks(0, 5, 'Succeeded', new Date(Date.now() - 600000).toISOString()),
                } as unknown as ContainerRegistryManagementClient;
                const agentPoolHandler = new AgentPoolHandler(client, '', '', 'testPool');
                jest.spyOn(agentPoolHandler, 'getRuns').mockResolvedValue([
                    {
                        agentPoolName: 'testPool',
                        // https://learn.microsoft.com/en-us/rest/api/containerregistry/runs/get?view=rest-containerregistry-2019-04-01&tabs=HTTP#runstatus
                        status: 'Succeeded',
                        finishTime: new Date(Date.now() - 600000)
                    }
                ])
                expect(await agentPoolHandler.getNewPoolSize()).toBe(4);
            })

            test('cooldown period for both pool is passed without any job runs', async () => {
                const client = {
                    agentPools: getAgentPoolMocks(0, 5, 'Succeeded', new Date(Date.now() - 600000).toISOString()),
                } as unknown as ContainerRegistryManagementClient;
                const agentPoolHandler = new AgentPoolHandler(client, '', '', 'testPool');
                jest.spyOn(agentPoolHandler, 'getRuns').mockResolvedValue([])
                expect(await agentPoolHandler.getNewPoolSize()).toBe(4);
            })
        })
    })
})