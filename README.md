# acr-agent-pool
Example how to scale Azure Container registry agent pool and save costs

## Directories

### Docker

Sample Dockerfile to trigger run towards agent pool. Triggering can be done with command (in `docker` directory):
```
az acr build --image sample/hello-world:v1 \
  --registry <ACR name> \
  --agent-pool test-agent-pool \
  --file Dockerfile .
```

### Terraform

CDKTF code to deploy to existing Azure resource group::
- Virtual network with subnet
- Azure container registry
  - Premium SKU as that's required for agent pools
- Container Registry Agent Pool
