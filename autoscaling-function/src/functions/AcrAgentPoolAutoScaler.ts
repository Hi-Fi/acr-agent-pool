import { ContainerRegistryManagementClient } from "@azure/arm-containerregistry";
import { InvocationContext, Timer, app } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { AgentPoolHandler } from "./logic/agentPool";


export async function AcrAgentPoolAutoScaler(_myTimer: Timer, context: InvocationContext): Promise<void> {
    const client = new ContainerRegistryManagementClient(new DefaultAzureCredential(), process.env.SUBSCRIPTION_ID);
    const resourceGroupName = process.env.RESOURCE_GROUP_NAME;
    const registryName = process.env.REGISTRY_NAME;
    const agentPoolName = process.env.AGENT_POOL_NAME;
    const agentPoolHandler = new AgentPoolHandler(
        client,
        resourceGroupName,
        registryName,
        agentPoolName
    );

    const poolSize = await agentPoolHandler.getNewPoolSize();

    if (poolSize !== undefined) {
        await agentPoolHandler.scaleAgentPool(poolSize);
    }

    context.log('Timer function processed request.');   
}

// Timer can be adjusted if e.g. at weekends there's no need to scale group. Just should note that it would be good in that case to scale pool down for that period
app.timer('AcrAgentPoolAutoScaler', {
    schedule: '0 */1 * * * *',
    handler: AcrAgentPoolAutoScaler
});
