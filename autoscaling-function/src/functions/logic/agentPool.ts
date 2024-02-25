import { ContainerRegistryManagementClient, Run } from "@azure/arm-containerregistry";


export class AgentPoolHandler {
    /**
     * Amount of jobs needed in queue to provision another agent.
     * 
     * Agent provision takes easily 5 minutes, so depends on build times.
     */
    private amountOfJobsPerAgent = 5;

    /**
     * Amount of minutes that agent is kept idling before scaling it in.
     * 
     * Note that scaling happens at pool level, so scaling in might be better to do when no jobs are running.
     */
    private coolDownMinutes = 5;

    constructor(
        protected client: ContainerRegistryManagementClient,
        protected resourceGroupName: string,
        protected acrName: string,
        protected agentPoolName: string
    ) {

    }

    public async getRuns(client: ContainerRegistryManagementClient, resourceGroupName: string, acrName: string): Promise<Run[]> {
        const runs: Run[] = [];
        for await (let page of client.runs.list(resourceGroupName, acrName).byPage()) {
            runs.push(...page.map(run => run));
        }
        return runs;
    }

    public async getNewPoolSize(): Promise<number> {
        const queue = this.client.agentPools.getQueueStatus(this.resourceGroupName, this.acrName, this.agentPoolName);
        const agents = this.client.agentPools.get(this.resourceGroupName, this.acrName, this.agentPoolName);
        const [queueResp, agentsResp] = await Promise.all([queue, agents]);
        /**
         * We scale pool out if...
         * - There are items in queue and pool is empty
         * - There are more than `amountOfJobsPerAgent`     
         */
        if (queueResp.count > 0 && agentsResp.count === 0 || queueResp.count / agentsResp.count > this.amountOfJobsPerAgent) {
            return agentsResp.count + 1;
        }

        const runs = await this.getRuns(this.client, this.resourceGroupName, this.acrName);

        const poolRuns = runs.filter(run => run.agentPoolName === this.agentPoolName);
        const runningJobs = poolRuns.filter(run => ['Running', 'Started'].includes(run.status));

        /**
         * If no jobs are running, we can in theory to scale things down. With some conditions...
         * - There's `coolDownMinutes` from previous scaling or last run end (whichever is closer)
         * - Pool is not currently scaling
         */
        if (runningJobs.length === 0 && agentsResp.provisioningState === 'Succeeded') {

            const cooldownElapsedInMs = Math.min(
                // As there's no jobs running, finishTime should be present
                new Date().getTime() - new Date(poolRuns[0].finishTime).getTime(),
                new Date().getTime() - new Date(agentsResp.systemData.lastModifiedAt).getTime()
            )
            if (this.coolDownMinutes * 60 * 1000 < cooldownElapsedInMs) {
                return agentsResp.count - 1;
            }
        }

        // We don't need to scale, so return undefined as scaling count.
        return undefined;
    }

    public async scaleAgentPool(poolSize: number) {
        console.log(`Scaling pool ${this.resourceGroupName}/${this.acrName}/${this.agentPoolName} to ${poolSize} instances`);
        this.client.agentPools.beginUpdate(
            this.resourceGroupName,
            this.acrName,
            this.agentPoolName,
            {
                count: poolSize
            }
        )
    }
}
