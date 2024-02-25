import { Construct } from "constructs";
import { App, TerraformStack, LocalBackend, TerraformVariable } from "cdktf";
import { ContainerRegistry } from "@cdktf/provider-azurerm/lib/container-registry";
import { VirtualNetwork } from "@cdktf/provider-azurerm/lib/virtual-network";
import { DataAzurermResourceGroup } from "@cdktf/provider-azurerm/lib/data-azurerm-resource-group";
import { ContainerRegistryAgentPool } from "@cdktf/provider-azurerm/lib/container-registry-agent-pool";
import { Subnet } from "@cdktf/provider-azurerm/lib/subnet";
import { AzurermProvider } from "@cdktf/provider-azurerm/lib/provider";

export class MyStack extends TerraformStack {
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
    
    const location = 'westus2';
    // const rg = new ResourceGroup(this, 'rg', {
    //   location,
    //   name: 'acr-vnet',
    // })
    // Using datasource as testing subscription offers only single resource group that can be used
    const rg = new DataAzurermResourceGroup(this, 'rg', {
      name: rgName.value
    });
    const vnet = new VirtualNetwork(this, 'vnet', {
      addressSpace: [
        '10.0.0.0/16'
      ],
      location,
      name: 'acr-vnet',
      resourceGroupName: rg.name,
    })

    const snet = new Subnet(this, 'subnet', {
      addressPrefixes: [
        '10.0.0.0/24'
      ],
      name: 'acr-subnet',
      resourceGroupName: rg.name,
      virtualNetworkName: vnet.name,
    });

    const acr = new ContainerRegistry(this, 'acr', {
      location,
      name: acrName.value,
      resourceGroupName: rg.name,
      sku: 'Premium', // Agent pools require premium SKU
    });

    new ContainerRegistryAgentPool(this, 'acrAgentPool', {
      containerRegistryName: acr.name,
      location,
      name: 'test-agent-pool',
      resourceGroupName: rg.name,
      virtualNetworkSubnetId: snet.id,      
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

app.synth();
