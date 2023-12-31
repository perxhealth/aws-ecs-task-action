import { type ECS, DescribeTasksCommand } from "@aws-sdk/client-ecs"

export interface WaiterParams {
  client: ECS
  cluster: string
  taskArns: string[]
}

export async function waitUntilTasksStopped(
  params: WaiterParams
): Promise<void> {
  const taskDescriptions = await params.client.send(
    new DescribeTasksCommand({
      tasks: params.taskArns,
      cluster: params.cluster,
    })
  )

  return new Promise((resolve, reject) => {
    const isStopped = taskDescriptions.tasks?.every((task) => {
      return task.lastStatus === "STOPPED" || task.desiredStatus === "STOPPED"
    })

    if (isStopped) {
      resolve()
    } else {
      reject()
    }
  })
}
