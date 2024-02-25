# acr-agent-pool
Example how to scale Azure Container registry agent pool and save costs

## Directories

### autoscaling-function

Sample Azure function that can scale the agent pool according needs. Note that as Azure doesn't expose metrics related to pool queue status of event related to those, function has to run as scheduled and check status self.

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
