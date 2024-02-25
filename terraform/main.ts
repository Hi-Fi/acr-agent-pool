import { Construct } from "constructs";
import { App, TerraformStack, LocalBackend, TerraformVariable, TerraformLocal } from "cdktf";
import { ContainerRegistry } from "@cdktf/provider-azurerm/lib/container-registry";
import { VirtualNetwork } from "@cdktf/provider-azurerm/lib/virtual-network";
import { DataAzurermResourceGroup } from "@cdktf/provider-azurerm/lib/data-azurerm-resource-group";
import { ContainerRegistryAgentPool } from "@cdktf/provider-azurerm/lib/container-registry-agent-pool";
import { Subnet } from "@cdktf/provider-azurerm/lib/subnet";
import { AzurermProvider } from "@cdktf/provider-azurerm/lib/provider";
import { StorageAccount } from "@cdktf/provider-azurerm/lib/storage-account";
import { ServicePlan } from "@cdktf/provider-azurerm/lib/service-plan";
import { LinuxFunctionApp } from "@cdktf/provider-azurerm/lib/linux-function-app";
import { DataArchiveFile } from "@cdktf/provider-archive/lib/data-archive-file";
import { ArchiveProvider } from "@cdktf/provider-archive/lib/provider";
import { NullProvider } from "@cdktf/provider-null/lib/provider";
import { Resource } from "@cdktf/provider-null/lib/resource";
import { bundleFunction } from "./build_function";
import { LogAnalyticsWorkspace } from "@cdktf/provider-azurerm/lib/log-analytics-workspace";
import { ApplicationInsights } from "@cdktf/provider-azurerm/lib/application-insights";
import { DataAzurermSubscription } from "@cdktf/provider-azurerm/lib/data-azurerm-subscription";

const location = 'westus2';

export class MyStack extends TerraformStack {
  public readonly rg: DataAzurermResourceGroup;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const rgName = new TerraformVariable(this, 'rgName', {
      type: 'string',
      description: 'Name of the resource group resources are going to be created to',
      nullable: false
    })

    const acrName = new TerraformVariable(this, "acrName", {
      type: "string",
      description: "Name of the created ACR repo. Has to be unique and can't container anything else than alphanumeric characters",
      nullable: false
    });

    // const rg = new ResourceGroup(this, 'rg', {
    //   location,
    //   name: 'acr-vnet',
    // })
    // Using datasource as testing subscription offers only single resource group that can be used
    this.rg = new DataAzurermResourceGroup(this, 'rg', {
      name: rgName.value
    });
    const vnet = new VirtualNetwork(this, 'vnet', {
      addressSpace: [
        '10.0.0.0/16'
      ],
      location,
      name: 'acr-vnet',
      resourceGroupName: this.rg.name,
    })

    const snet = new Subnet(this, 'subnet', {
      addressPrefixes: [
        '10.0.0.0/24'
      ],
      name: 'acr-subnet',
      resourceGroupName: this.rg.name,
      virtualNetworkName: vnet.name,
    });

    const acr = new ContainerRegistry(this, 'acr', {
      location,
      name: acrName.value,
      resourceGroupName: this.rg.name,
      sku: 'Premium', // Agent pools require premium SKU
    });

    new ContainerRegistryAgentPool(this, 'acrAgentPool', {
      containerRegistryName: acr.name,
      location,
      name: 'test-agent-pool',
      resourceGroupName: this.rg.name,
      virtualNetworkSubnetId: snet.id,
    });
  }
}

export class AutoScalingStack extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const resourceGroupName = new TerraformVariable(this, 'rgName', {
      type: 'string',
      description: 'Name of the resource group resources are going to be created to',
      nullable: false
    }).value

    const acrName = new TerraformVariable(this, "acrName", {
      type: "string",
      description: "Name of the created ACR repo. Has to be unique and can't container anything else than alphanumeric characters",
      nullable: false
    }).value;

    const sub = new DataAzurermSubscription(this, 'sub');
    const storageAccount = new StorageAccount(this, 'storageAccount', {
      accountReplicationType: 'LRS',
      accountTier: 'Standard',
      location,
      name: 'autoscalefunction001',
      resourceGroupName,
      publicNetworkAccessEnabled: true,
      sharedAccessKeyEnabled: true,
    });

    const servicePlan = new ServicePlan(this, 'appServicePlan', {
      location,
      name: 'as-app-service-plan',
      resourceGroupName,
      osType: 'Linux',
      skuName: 'Y1',
    });

    const law = new LogAnalyticsWorkspace(this, 'law', {
      location,
      name: 'law-autoscaling',
      resourceGroupName,
    })

    const appInsights = new ApplicationInsights(this, 'ai', {
      applicationType: 'Node.JS',
      location,
      name: 'ai-autoscaling',
      resourceGroupName,
      workspaceId: law.id
    })

    const functionApp = new LinuxFunctionApp(this, 'functionApp', {
      location,
      name: 'autoscaling-function',
      resourceGroupName,
      servicePlanId: servicePlan.id,
      siteConfig: {
        use32BitWorker: false,
        applicationStack: {
          nodeVersion: '18',
        },
        applicationInsightsConnectionString: appInsights.connectionString,
        applicationInsightsKey: appInsights.instrumentationKey,
      },
      appSettings: {
        WEBSITE_RUN_FROM_PACKAGE: "1",
        FUNCTIONS_WORKER_RUNTIME: "node",
        AzureWebJobsDisableHomepage: "true",
        SUBSCRIPTION_ID: sub.subscriptionId,
        RESOURCE_GROUP_NAME: resourceGroupName,
        REGISTRY_NAME: acrName,
        AGENT_POOL_NAME: 'test-agent-pool'
      },
      identity: {
        type: 'SystemAssigned',
      },
      storageAccountName: storageAccount.name,
      storageAccountAccessKey: storageAccount.primaryAccessKey,
      lifecycle: {
        ignoreChanges: [
          // Deployment will update this to actual address, so it shouldn't be reset by Terraform
          'app_settings["WEBSITE_RUN_FROM_PACKAGE"]',
          'tags'
        ]
      }
    })

    // new RoleAssignment(this, 'functionStorageAccess', {
    //   principalId: userAssignedIdentity.principalId,
    //   scope: storageAccount.id,
    //   delegatedManagedIdentityResourceId: userAssignedIdentity.id,
    //   roleDefinitionName: 'Storage Blob Data Owner'
    // })

    new ArchiveProvider(this, 'archive');
    const functionBundle = new DataArchiveFile(this, 'functionBundle', {
      outputPath: 'functionApp.zip',
      type: 'zip',
      sourceDir: bundleFunction()
    })

    const deployCommand = new TerraformLocal(this, 'local', `az functionapp deployment source config-zip --resource-group ${resourceGroupName} --name ${functionApp.name} --src ${functionBundle.outputPath}`);

    new NullProvider(this, 'null');
    new Resource(this, 'deploy', {
      provisioners: [
        {
          type: 'local-exec',
          command: deployCommand.asString,
        }
      ],
      dependsOn: [
        {
          fqn: deployCommand.fqn
        }
      ],
      triggers: {
        bundleHash: functionBundle.outputSha256,
        command: deployCommand.asString
      }
    });
  }
}

const app = new App();
const stack = new MyStack(app, "acr-agent-pool");

new LocalBackend(stack, {});
new AzurermProvider(stack, 'azurerm', {
  features: {},
  skipProviderRegistration: true
})

const autoScalingStack = new AutoScalingStack(app, "acr-agent-pool-autoscaler");

new LocalBackend(autoScalingStack, {});
new AzurermProvider(autoScalingStack, 'azurerm', {
  features: {},
  skipProviderRegistration: true
})

app.synth();
