import fs from "fs"
import assert from "assert"

import * as core from "@actions/core"
import { backOff } from "exponential-backoff"

import {
  ECS,
  Task,
  TaskDefinition,
  DescribeTasksCommand,
} from "@aws-sdk/client-ecs"

import {
  CloudWatchLogsClient,
  GetLogEventsCommand,
  CreateLogStreamCommand,
} from "@aws-sdk/client-cloudwatch-logs"

interface WaiterParams {
  client: ECS
  cluster: string
  taskArns: string[]
}

async function waitUntilTasksStopped(params: WaiterParams): Promise<void> {
  const taskDescriptions = await params.client.send(
    new DescribeTasksCommand({
      tasks: params.taskArns,
      cluster: params.cluster,
    })
  )

  return new Promise((resolve, reject) => {
    const isStopped = taskDescriptions.tasks?.every(
      (task) => task.lastStatus === "STOPPED"
    )

    if (isStopped) {
      resolve()
    } else {
      reject()
    }
  })
}

interface TailLogsParams {
  cursor?: string
  streamPrefix?: string
  logStreamExists?: boolean
  groupName: string
  taskArn: string
}

async function tailTaskLogs(params: TailLogsParams): Promise<void> {
  const {
    cursor,
    streamPrefix,
    groupName,
    taskArn,
    logStreamExists = false,
  } = params

  const cloudwatch = new CloudWatchLogsClient({ region: "ap-southeast-2" })

  const taskId = taskArn.split("/").at(-1)
  const streamName = streamPrefix ? `${streamPrefix}/${taskId}` : taskId

  // eagerly create the projected log stream if necessary
  if (!logStreamExists) {
    try {
      await cloudwatch.send(
        new CreateLogStreamCommand({
          logStreamName: streamName,
          logGroupName: groupName,
        })
      )
    } catch (e) {
      // doesn't matter
    }
  }

  const logs = await cloudwatch.send(
    new GetLogEventsCommand({
      startFromHead: true,
      logStreamName: streamName,
      logGroupName: groupName,
      nextToken: cursor,
    })
  )

  if (logs.events) {
    for (const event of logs.events) {
      console.log("LOG: ", event.message)
    }
  }

  if (logs.nextForwardToken) {
    setTimeout(tailTaskLogs, 2000, {
      ...params,
      logStreamExists: true,
      cursor: logs.nextForwardToken,
    })
  }

  return Promise.resolve()
}

async function run(): Promise<void> {
  try {
    // retrieve all required inputs
    // const env = core.getInput("perx_env", { required: true })
    // const region = core.getInput("perx_region", { required: true })
    // const taskDefPath = core.getInput("definition", { required: true })
    const taskDefPath = "./task-definition.json"

    // ensure the task definition file exists on disk
    assert(
      fs.existsSync(taskDefPath),
      `Path specified in 'task-definition' input does not exist: ${taskDefPath}`
    )

    /*
    // ensure AWS_ACCESS_KEY_ID was picked up from the environment
    assert(
      process.env.AWS_ACCESS_KEY_ID,
      "`AWS_ACCESS_KEY_ID` is not set in the environment. Has a previous action setup AWS credentials?"
    )

    // ensure AWS_SECRET_ACCESS_KEY was picked up from the environment
    assert(
      process.env.AWS_SECRET_ACCESS_KEY,
      "`AWS_SECRET_ACCESS_KEY` is not set in the environment. Has a previous action setup AWS credentials?"
    )

    // ensure AWS_REGION was picked up from the environment
    assert(
      process.env.AWS_REGION,
      "`AWS_REGION` is not set in the environment. Has a previous action setup AWS credentials?"
    )
    */

    const ecs = new ECS({ region: "ap-southeast-2" })

    let taskDefinition: TaskDefinition
    let startedTasks: Task[] = []

    // read task definition from local disk and register it with aws
    await core.group("Registering task definition...", async () => {
      const source = fs.readFileSync(taskDefPath).toString()
      await ecs.registerTaskDefinition(JSON.parse(source)).then((result) => {
        if (result.taskDefinition) {
          taskDefinition = result.taskDefinition
          core.setOutput(
            "task-definition-arn",
            taskDefinition.taskDefinitionArn
          )
        } else {
          core.setFailed("Could not register task definition")
        }
      })
    })

    // start the containers
    await core.group("Starting tasks...", async () => {
      const { tasks = [], failures = [] } = await ecs.runTask({
        cluster: "dev",
        taskDefinition: taskDefinition?.taskDefinitionArn,
        networkConfiguration: {
          awsvpcConfiguration: {
            securityGroups: ["sg-027a4bdaa804a13dd"],
            subnets: [
              "subnet-06a351d84c3c1734f",
              "subnet-0ec4c58f9d0ec871e",
              "subnet-08949a30b96c117e2",
            ],
          },
        },
      })

      core.info(`${tasks.length} tasks have started`)
      core.setOutput("tasks-started-count", tasks.length)

      core.info(`${failures.length} tasks failed to start`)
      core.setOutput("tasks-started-failed-count", failures.length)

      startedTasks = tasks
    })

    // take action on tasks successfully requested
    if (startedTasks.length > 0) {
      // build a list of all the task's arns, so we can target them
      const taskArns = startedTasks.reduce<string[]>((arns, task) => {
        if (task.taskArn) arns.push(task.taskArn)
        return arns
      }, [])

      // set task arns as comma delimited string output
      core.setOutput("task-arns", taskArns.join(","))

      // wait until all tasks have completed running,
      // regardless of success or failure
      await core.group("Monitoring RUNNING tasks...", async () => {
        taskArns.map(core.info)

        core.info("========== TASK LOGS ==========")
        tailTaskLogs({
          groupName: "/ecs/dev/perx-api",
          streamPrefix: "perx-api",
          taskArn: taskArns[0],
        })

        await backOff(() =>
          waitUntilTasksStopped({ client: ecs, cluster: "dev", taskArns })
        )
      })

      // all tasks have stopped, so we need to inspect the
      // results and fail/pass the job accordingly
      await core.group("Resolving results of STOPPED tasks...", async () => {
        const taskDescriptions = await ecs.send(
          new DescribeTasksCommand({
            tasks: taskArns,
            cluster: "dev",
          })
        )

        if (!taskDescriptions.tasks) {
          throw new Error("Could not retrieve stopped tasks")
        }

        const containers = taskDescriptions.tasks.flatMap(
          (task) => task.containers || []
        )

        if (containers.every((container) => container.exitCode === 0)) {
          core.info("All tasks completed successfully!")
        } else {
          core.setFailed("Some tasks exited with a non 0 code")
        }
      })
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message)
    }
  }
}

run()
